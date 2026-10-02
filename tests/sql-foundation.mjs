import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const migrations = process.argv[2] ?? fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const additions = process.argv[3] ?? migrations;
const db = new PGlite({ extensions: { btree_gist } });
let passed = 0;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function ok(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function fails(sql, pattern) {
  try { await db.exec(sql); } catch (error) {
    await db.exec('ROLLBACK');
    assert.match(error.message, pattern); return;
  }
  throw new Error(`Expected rejection: ${sql}`);
}
async function as(user, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`);
  try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
}
async function count(table) { return Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n); }

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
`);
await ok('All three migrations execute', async()=>{
  for(const [dir,file] of [[migrations,'202609290001_initial_schema.sql'],[additions,'202609290002_business_foundation.sql'],[additions,'202609290003_access_and_onboarding.sql']]) {
    await db.exec(readFileSync(resolve(dir,file),'utf8'));
  }
});
await db.exec(`insert into auth.users(id,raw_user_meta_data) values
('${id(1)}','{"role":"admin","full_name":"Owner"}'),('${id(2)}','{}'),('${id(3)}','{}'),('${id(4)}','{}'),('${id(5)}','{}');`);
await ok('Signup metadata cannot elevate role',async()=>{
  const {rows}=await db.query(`select role,status from public.profiles where id='${id(1)}'`);
  assert.deepEqual(rows[0],{role:'idol',status:'pending'});
});
await db.exec(`update public.profiles set role='admin',status='active' where id='${id(1)}'`);
await as(id(1),async()=>{
  await db.exec(`select public.admin_activate_operator('${id(2)}')`);
  await db.exec(`select public.admin_activate_operator('${id(3)}')`);
  await db.exec(`select public.admin_assign_idol('${id(4)}','${id(2)}')`);
});
await ok('Pending account sees no directory',()=>as(id(5),async()=>assert.equal(await count('floors'),0)));
await ok('Operator cannot promote a pending user',()=>as(id(2),()=>fails(`select public.admin_activate_operator('${id(5)}')`,/Admin required/)));
await ok('Idol cannot update own role',()=>as(id(4),()=>fails(`update public.profiles set role='admin' where id='${id(4)}'`,/permission denied/)));
await ok('Current operator sees assigned idol',()=>as(id(2),async()=>{
  const {rows}=await db.query(`select id from public.profiles where id='${id(4)}'`); assert.equal(rows.length,1);
}));
await as(id(1),()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(3)}')`));
await ok('Previous operator loses profile, assignment history and subject notifications',()=>as(id(2),async()=>{
  const {rows}=await db.query(`select id from public.profiles where id='${id(4)}'`); assert.equal(rows.length,0);
  assert.equal(await count('idol_assignments'),0); assert.equal(await count('notifications'),0);
}));
await ok('New operator sees full assignment history',()=>as(id(3),async()=>assert.equal(await count('idol_assignments'),2)));
await db.exec(`insert into public.rooms(id,code,name,manager_id) values
('${id(10)}','P01','Phòng 1','${id(2)}'),('${id(11)}','P02','Phòng 2','${id(3)}');
insert into public.devices(id,code,assigned_room_id,manager_id) values
('${id(20)}','DT01','${id(10)}','${id(2)}'),('${id(21)}','DT02','${id(11)}','${id(3)}');`);
await ok('One assigned phone per room',()=>fails(`insert into public.devices(code,assigned_room_id,manager_id) values('DT03','${id(10)}','${id(2)}')`,/one_assigned_device_per_room/));
await db.exec(`insert into public.daily_plans(id,idol_id,work_date,shift_count) values('${id(30)}','${id(4)}','2026-10-05',2);
insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at) values
('${id(40)}','${id(4)}','${id(30)}','2026-10-05 09:00+07','2026-10-05 11:00+07'),
('${id(41)}','${id(4)}','${id(30)}','2026-10-05 12:00+07','2026-10-05 15:00+07');`);
await ok('Two shifts totaling 5 hours can submit',()=>db.exec(`update public.daily_plans set status='submitted' where id='${id(30)}'`));
await ok('Submitted day cannot drop below 5 hours',()=>fails(`begin;update public.live_sessions set ends_at='2026-10-05 14:00+07' where id='${id(41)}';commit;`,/exactly 5 hours/));
await ok('Submitted day cannot exceed 5 hours',()=>fails(`begin;update public.live_sessions set ends_at='2026-10-05 16:00+07' where id='${id(41)}';commit;`,/exactly 5 hours/));
await ok('Chosen shift count is enforced',()=>fails(`begin;update public.daily_plans set shift_count=1 where id='${id(30)}';commit;`,/exactly 5 hours/));
await ok('Whole hours required',()=>fails(`update public.live_sessions set starts_at='2026-10-05 09:30+07' where id='${id(40)}'`,/whole hours/));
await ok('Opening hours enforced',()=>fails(`update public.live_sessions set starts_at='2026-10-05 08:00+07' where id='${id(40)}'`,/whole hours/));
await ok('Overlapping shifts rejected',()=>fails(`begin;update public.live_sessions set starts_at='2026-10-05 10:00+07',ends_at='2026-10-05 13:00+07' where id='${id(41)}';commit;`,/non_overlapping_day_shifts/));
await ok('Single 5-hour shift can end at 24:00',()=>db.exec(`begin;
insert into public.daily_plans(id,idol_id,work_date,shift_count) values('${id(31)}','${id(4)}','2026-10-06',1);
insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at) values('${id(42)}','${id(4)}','${id(31)}','2026-10-06 19:00+07','2026-10-07 00:00+07');
update public.daily_plans set status='submitted' where id='${id(31)}';commit;`));
await ok('Shift cannot extend beyond working-day midnight',()=>fails(`update public.live_sessions set starts_at='2026-10-06 20:00+07',ends_at='2026-10-07 01:00+07' where id='${id(42)}'`,/whole hours/));
await ok('Plan date cannot silently invalidate its sessions',()=>fails(`update public.daily_plans set work_date='2026-10-07' where id='${id(31)}'`,/Create a new plan/));
await ok('Cancelling one shift cannot silently reduce submitted day',()=>fails(`begin;update public.live_sessions set status='cancelled' where id='${id(40)}';commit;`,/exactly 5 hours/));
await ok('Approved session requires room coverage',()=>fails(`begin;update public.live_sessions set status='approved' where id='${id(40)}';commit;`,/complete approved room coverage/));
await db.exec(`insert into public.room_segments(id,session_id,room_id,starts_at,ends_at,status,approved_by,approved_at) values
('${id(50)}','${id(40)}','${id(10)}','2026-10-05 09:00+07','2026-10-05 10:00+07','approved','${id(2)}',now()),
('${id(51)}','${id(40)}','${id(11)}','2026-10-05 10:00+07','2026-10-05 11:00+07','approved','${id(3)}',now());`);
await ok('Two room segments can cover one session',()=>db.exec(`update public.live_sessions set status='approved' where id='${id(40)}'`));
await ok('A room cannot be confirmed for overlapping sessions',()=>fails(`begin;
insert into public.daily_plans(id,idol_id,work_date,shift_count) values('${id(32)}','${id(5)}','2026-10-05',1);
insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at) values('${id(43)}','${id(5)}','${id(32)}','2026-10-05 09:00+07','2026-10-05 14:00+07');
insert into public.room_segments(session_id,room_id,starts_at,ends_at,status) values('${id(43)}','${id(10)}','2026-10-05 09:00+07','2026-10-05 10:00+07','approved');
commit;`,/confirmed_room_no_overlap/));
await ok('Room segment cannot escape session',()=>fails(`begin;update public.room_segments set ends_at='2026-10-05 12:00+07' where id='${id(51)}';commit;`,/outside its live session/));
await db.exec(`insert into public.device_loans(id,device_id,idol_id,session_id) values('${id(60)}','${id(20)}','${id(4)}','${id(40)}');`);
await ok('Idol cannot hold two phones',()=>fails(`insert into public.device_loans(device_id,idol_id,session_id) values('${id(21)}','${id(4)}','${id(40)}')`,/one_open_loan_per_idol/));
await db.exec(`update public.device_loans set return_requested_at=clock_timestamp() where id='${id(60)}'`);
await ok('Return request does not release phone',()=>fails(`insert into public.device_loans(device_id,idol_id,session_id) values('${id(21)}','${id(4)}','${id(40)}')`,/one_open_loan_per_idol/));
await db.exec(`update public.device_loans set returned_at=clock_timestamp(),return_confirmed_by='${id(3)}' where id='${id(60)}'`);
await ok('Confirmed return permits next phone',()=>db.exec(`insert into public.device_loans(device_id,idol_id,session_id) values('${id(21)}','${id(4)}','${id(40)}')`));
await db.exec(`insert into public.room_visits(id,segment_id,idol_id,checked_in_at,before_photo_path) values
('${id(70)}','${id(50)}','${id(4)}','2026-10-05 09:01+07','example/before.jpg')`);
await ok('Lateness saved against snapshot',async()=>{
  assert.equal((await db.query(`select late_seconds from public.room_visits where id='${id(70)}'`)).rows[0].late_seconds,60);
});
await ok('Checkout requires photo',()=>fails(`update public.room_visits set checked_out_at='2026-10-05 09:50+07',checkout_reason='Sớm' where id='${id(70)}'`,/photo required/));
await ok('Early checkout requires reason',()=>fails(`update public.room_visits set checked_out_at='2026-10-05 09:50+07',after_photo_path='example/after.jpg' where id='${id(70)}'`,/requires a reason/));
await ok('Early checkout with reason accepted',()=>db.exec(`update public.room_visits set checked_out_at='2026-10-05 09:50+07',after_photo_path='example/after.jpg',checkout_reason='Kết thúc sớm' where id='${id(70)}'`));
await ok('Checkout cannot be backfilled',()=>fails(`update public.room_visits set checked_out_at='2026-10-05 09:55+07' where id='${id(70)}'`,/cannot be rewritten/));
await ok('Checkout correction requests rejected',()=>fails(`insert into public.requests(kind,submitted_by) values('checkout_correction','${id(4)}')`,/no longer supported/));
await db.exec(`insert into public.platform_accounts(id,idol_id,platform,external_id) values('${id(80)}','${id(4)}','TikTok','old-id');
update public.platform_accounts set external_id='new-id' where id='${id(80)}';`);
await ok('TikTok identity changes preserve history',async()=>assert.equal(await count('tiktok_identity_history'),1));
await ok('TikTok cannot transfer to another idol',()=>fails(`update public.platform_accounts set idol_id='${id(5)}' where id='${id(80)}'`,/cannot transfer/));
await ok('Audit records created',async()=>assert.ok(await count('audit_logs')>0));
await ok('Operator cannot read global audit',()=>as(id(3),async()=>assert.equal(await count('audit_logs'),0)));
await ok('Anonymous has no data access',async()=>{
  await db.exec('set role anon');
  try { await fails('select * from public.profiles',/permission denied/); } finally { await db.exec('reset role'); }
});
console.log(`\n${passed} tests passed. Auth/Storage are local test stubs; no remote Supabase was touched.`);
await db.close();
