import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = process.argv[2] ?? fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const db = new PGlite({ extensions: { btree_gist } });
const id = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = '2026-10-01';
const stamp = t => `${day} ${t}+07`;
const rows = async (sql, args) => (await db.query(sql, args)).rows;
const value = async (sql, args) => Object.values((await rows(sql, args))[0])[0];
const clock = t => rows('update test_clock.current_time set value=$1', [stamp(t)]);
const eqTime = (a, b) => assert.equal(new Date(a).getTime(), new Date(stamp(b)).getTime());
let passed = 0;
async function ok(name, fn) { await fn(); console.log('PASS', name); passed++; }
async function as(n, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(n)}'`);
  try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
}
const fail = (fn, pattern) => assert.rejects(fn, pattern);
const begin = (n, seg, phase='checkin') => as(n, () => value('select public.begin_room_capture($1,$2,$3)', [id(seg), id(seg < 60 ? 101 : seg < 70 ? 102 : 103), phase]));
const finish = (n,ticket) => as(n,()=>value("select public.finish_room_capture($1,'')",[ticket.id]));
const photo = ticket => rows("insert into storage.objects(bucket_id,name) values('room-attendance',$1)", [ticket.path]);
async function capture(n, seg, phase='checkin') { const t=await begin(n,seg,phase); await photo(t); return finish(n,t); }
const scan = (n,seg,dev) => as(n,()=>value('select public.scan_device($1,$2)',[id(seg),id(dev)]));
const report = n => as(n,()=>value('select public.idol_operations_day($1)',[day]));
try {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create schema storage;create schema test_clock;
    create table test_clock.current_time(value timestamptz);insert into test_clock.current_time values('${stamp('08:00')}');
    create function test_clock.now() returns timestamptz language sql stable security definer as $$select value from test_clock.current_time$$;
    grant usage on schema test_clock to authenticated,anon;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create publication supabase_realtime;`);
  // Replace database clock calls ONLY inside this isolated test database. Production SQL has no test clock.
  for (const file of readdirSync(root).filter(f=>f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(root,file),'utf8').replace(/\b(?:clock_timestamp|now)\(\)/g,'test_clock.now()');
    try { await db.exec(sql); } catch(e) { throw Error(`${file}: ${e.message} ${e.where ?? ''}`); }
  }
  await ok('All 19 migrations apply with RLS enabled', async()=>assert.equal(await value("select count(*)::int from pg_class where relname in ('idol_operation_events','room_queue_skips','room_handover_holds') and relrowsecurity"),3));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test'||n||'@example.com',test_clock.now(),jsonb_build_object('full_name','Person '||n) from generate_series(1,11)n;
    update public.profiles set status='active';update public.profiles set role='admin' where id='${id(1)}';
    update public.profiles set role='operator' where id in ('${id(2)}','${id(3)}');`);
  for(const n of [4,5,6,7,8,9,10,11]) await as(1,()=>rows('select public.admin_assign_idol($1,$2)',[id(n),id(n===9?3:2)]));
  await db.exec(`insert into public.rooms(id,code,name,manager_id,qr_token) values
    ('${id(11)}','P101','Room A','${id(3)}','${id(101)}'),('${id(12)}','P102','Room B','${id(2)}','${id(102)}'),('${id(13)}','P103','Room C','${id(2)}','${id(103)}');
    insert into public.devices(id,code,assigned_room_id,manager_id,qr_token) values
    ('${id(21)}','DT01','${id(11)}','${id(3)}','${id(201)}'),('${id(22)}','DT02','${id(12)}','${id(2)}','${id(202)}'),
    ('${id(23)}','DT03',null,'${id(3)}','${id(203)}');`);
  async function plan(n,p,s,g,room,start,end){
    await db.exec(`begin;insert into public.daily_plans(id,idol_id,work_date,shift_count) values('${id(p)}','${id(n)}','${day}',1);
      insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at,status) values('${id(s)}','${id(n)}','${id(p)}','${stamp(start)}','${stamp(end)}','approved');
      insert into public.room_segments(id,session_id,room_id,starts_at,ends_at,status) values('${id(g)}','${id(s)}','${id(room)}','${stamp(start)}','${stamp(end)}','approved');
      update public.daily_plans set status='approved' where id='${id(p)}';commit;`);
  }
  await plan(4,31,41,51,11,'09:00','14:00'); await plan(5,32,42,52,11,'14:00','19:00'); await plan(6,33,43,53,11,'19:00','24:00');
  await plan(7,34,44,61,12,'09:00','14:00'); await plan(8,35,45,62,12,'14:00','19:00'); await plan(9,36,46,63,12,'19:00','24:00');
  await plan(10,37,47,71,13,'09:00','14:00'); await plan(11,38,48,72,13,'14:00','19:00');
  await ok('First turn has no grace; later turn waits for predecessor',async()=>{eqTime((await report(4))[0].entry_due_at,'09:00');assert.equal((await report(5))[0].entry_due_at,null);});
  await ok('Receiving phone before room check-in is rejected',()=>fail(()=>scan(4,51,201),/ROOM_CHECKIN_REQUIRED/));
  await clock('08:29:59'); await ok('More than 30 minutes early rejected',()=>fail(()=>begin(4,51),/CHECKIN_TOO_EARLY/));
  await clock('08:30'); await ok('Early entry can start 30 minutes before schedule',async()=>assert.ok((await begin(4,51)).id));
  await clock('09:00'); const first=await begin(4,51);
  await ok('Photo required before starting a visit',()=>fail(()=>finish(4,first),/PHOTO_REQUIRED/));
  await photo(first);await clock('09:02');let firstVisit;
  await ok('On-time QR scan retains its time while photo uploads',async()=>{firstVisit=await finish(4,first);const r=(await report(4))[0];assert.equal(r.late_seconds,0);eqTime(r.checked_in_at,'09:00');});
  await ok('Retry of completed capture is idempotent',async()=>assert.equal(await finish(4,first),firstVisit));
  await ok('Matching room phone auto-accepts even if owned by another operator',async()=>assert.equal((await scan(4,51,201)).status,'received'));
  await ok('Repeated scan returns same loan; cannot choose personal while holding phone',async()=>{const loan=await scan(4,51,201);assert.ok(loan.id);await fail(()=>as(4,()=>rows('select public.choose_personal_device($1)',[id(51)])),/DEVICE_OR_IDOL_BUSY/);});
  await clock('09:03'); await capture(7,61);let borrow;
  await ok('Nonmatching phone requires its owner even if available',async()=>{borrow=await scan(7,61,203);assert.equal(borrow.status,'waiting');});
  await ok('Idol team manager cannot approve another managers phone',()=>fail(()=>as(2,()=>rows("select public.review_device($1,1,true,'')",[borrow.id])),/FORBIDDEN/));
  await ok('Device owner approves borrowing',async()=>{await as(3,()=>rows("select public.review_device($1,1,true,'')",[borrow.id]));assert.equal((await report(7))[0].device_code,'DT03');});
  await ok('Borrowed room owner cannot read another teams attendance',async()=>{const r=await report(3);assert.ok(!r.some(x=>x.idol_id===id(4)));assert.equal(await as(3,()=>value('select count(*)::int from public.idol_operation_events where idol_id=$1',[id(4)])),0);});
  await ok('Idol cannot read another idols attendance/events',async()=>{assert.ok((await report(4)).every(x=>x.idol_id===id(4)));assert.equal(await as(4,()=>value('select count(*)::int from public.idol_operation_events where idol_id=$1',[id(7)])),0);});
  await clock('13:00'); await capture(7,61,'checkout');
  await ok('Early checkout leaves next deadline at scheduled start plus 5 minutes',async()=>eqTime((await report(8))[0].entry_due_at,'14:05'));
  await ok('Phone remains held until QR return; return immediately confirms',async()=>{assert.ok(await as(7,()=>value('select public.my_open_device()')));const a=await as(7,()=>value('select public.request_device_return($1)',[id(203)]));const b=await as(7,()=>value('select public.request_device_return($1)',[id(203)]));assert.equal(a,b);assert.equal(await as(7,()=>value('select public.my_open_device()')),null);});
  await clock('13:29:59'); await ok('Next idol still cannot check in more than 30 minutes early',()=>fail(()=>begin(8,62),/CHECKIN_TOO_EARLY/));
  await clock('13:30'); await capture(8,62);
  await ok('Next idol can check in early after predecessor returns room',async()=>{assert.equal((await report(8))[0].status,'in_room');assert.equal((await report(8))[0].late_seconds,0);});
  await ok('Personal-device choice is saved and idempotent',async()=>{await as(8,()=>rows('select public.choose_personal_device($1)',[id(62)]));await as(8,()=>rows('select public.choose_personal_device($1)',[id(62)]));const r=(await report(8))[0];assert.equal(r.device_choice,'own');assert.equal(r.events.filter(e=>e.kind==='device_declined').length,1);});
  await clock('13:59');
  await ok('Cannot skip another teams absent Idol',()=>fail(()=>as(3,()=>rows("select public.skip_room_turn($1,'Absent')",[id(71)])),/FORBIDDEN/));
  await as(2,()=>rows("select public.skip_room_turn($1,'Absent')",[id(71)]));
  await ok('Skipping an absent predecessor releases next turn without fake attendance',async()=>{eqTime((await report(11))[0].entry_due_at,'14:05');assert.equal(await value('select count(*)::int from public.room_visits where segment_id=$1',[id(71)]),0);});
  await clock('14:05');const oldTicket=await begin(11,72);await photo(oldTicket);
  await clock('14:05:02');await as(2,()=>rows("select public.set_room_handover($1,false,'Cleaning')",[id(72)]));
  await clock('14:05:04');await as(2,()=>rows("select public.set_room_handover($1,true,'')",[id(72)]));
  await ok('Handover change during photo upload requires a fresh QR scan',()=>fail(()=>finish(11,oldTicket),/CAPTURE_ROOM_CHANGED/));
  await clock('14:05:05');const expired=await begin(11,72);await photo(expired);await clock('14:10:06');
  await ok('Expired camera ticket cannot backdate a later check-in',()=>fail(()=>finish(11,expired),/CAPTURE_EXPIRED/));
  await clock('14:10'); await ok('Overrunning predecessor keeps next turn waiting, not late',async()=>{assert.equal((await report(5))[0].entry_due_at,null);await fail(()=>begin(5,52),/ROOM_QUEUE_WAIT/);});
  const importantBefore=await value("select count(*)::int from public.notifications where priority='important'");
  await clock('14:18');const out=await begin(4,51,'checkout');await photo(out);await clock('14:20');await finish(4,out);
  await ok('Overtime checkout needs no reason and raises no late violation',async()=>assert.equal(await value("select count(*)::int from public.notifications where priority='important'"),importantBefore));
  await ok('Handover clock starts after photo confirmation, preserves actual QR time',async()=>{const r=(await report(4))[0];eqTime(r.checked_out_at,'14:18');eqTime(r.checkout_confirmed_at,'14:20');eqTime((await report(5))[0].entry_due_at,'14:25');});
  await clock('14:25');let exact=await begin(5,52);
  await ok('Exactly 5 minutes grace is still on time',async()=>eqTime(exact.scanned_at,'14:25'));
  await clock('14:25:01');await capture(5,52);
  await ok('First second after grace counts as 1 late minute',async()=>{const r=(await report(5))[0];assert.equal(r.late_seconds,1);assert.equal(r.events.filter(e=>e.important).length,1);});
  await ok('Late alert reaches exactly Idol, current team operator and admin',async()=>{const recipients=await rows("select recipient_id from public.notifications where subject_idol_id=$1 and priority='important'",[id(5)]);assert.deepEqual(recipients.map(r=>r.recipient_id).sort(),[id(1),id(2),id(5)].sort());});
  await ok('Important alert retains work date for history links',async()=>assert.equal(String(await value("select work_date::text from public.notifications where subject_idol_id=$1 and priority='important' limit 1",[id(5)])),day));
  await ok('Later idol cannot take a phone still held by earlier idol',()=>fail(()=>scan(5,52,201),/DEVICE_OR_IDOL_BUSY/));
  await as(4,()=>rows('select public.request_device_return($1)',[id(201)]));await scan(5,52,201);
  await ok('Direct client writes cannot forge timestamps/events/priority',async()=>{await fail(()=>as(5,()=>rows('update public.room_visits set checked_in_at=$1 where idol_id=$2',[stamp('09:00'),id(5)])),/permission denied/);await fail(()=>as(5,()=>rows("insert into public.idol_operation_events(idol_id,work_date,kind,message) values($1,$2,'room_checkin','fake')",[id(5),day])),/permission denied/);});
  await clock('18:30');await capture(8,62,'checkout');
  await as(2,()=>rows("select public.set_room_handover($1,false,'Cleaning')",[id(62)]));
  await ok('Room on hold blocks next Idol across teams',async()=>{assert.equal((await report(9))[0].entry_due_at,null);await fail(()=>begin(9,63),/ROOM_QUEUE_WAIT/);});
  await clock('19:10');await as(2,()=>rows("select public.set_room_handover($1,true,'')",[id(62)]));
  await ok('After release hold next turn gets 5 minutes',async()=>eqTime((await report(9))[0].entry_due_at,'19:15'));
  await clock('19:15');await capture(9,63);
  await ok('Exactly the five-minute deadline produces no violation',async()=>assert.equal((await report(9))[0].late_seconds,0));
  await clock('19:20');let pending=await scan(9,63,203);assert.equal(pending.status,'waiting');await capture(9,63,'checkout');
  await ok('Checkout cancels pending phone request; late approval impossible',async()=>{assert.equal(await value('select status from public.requests where id=$1',[pending.id]),'cancelled');await fail(()=>as(3,()=>rows("select public.review_device($1,1,true,'')",[pending.id])),/REQUEST_NOT_PENDING/);});
  await ok('Operator can skip absent own Idol with a recorded reason',async()=>{await as(2,()=>rows("select public.skip_room_turn($1,'Absent')",[id(53)]));assert.equal((await report(6))[0].status,'skipped');await fail(()=>begin(6,53),/SEGMENT_UNAVAILABLE/);});
  await ok('Cannot erase audited schedule or skip started turn',async()=>{await fail(()=>value('select private.schedule_mutable($1)',[id(33)]),/ATTENDANCE_EXISTS/);await fail(()=>as(2,()=>rows("select public.skip_room_turn($1,'erase')",[id(52)])),/TURN_ALREADY_STARTED/);});
  await rows('update test_clock.current_time set value=$1',['2026-10-02 00:10+07']);
  await ok('Open room remains in next-day report and checkout works after midnight',async()=>{const r=await as(5,()=>value("select public.idol_operations_day('2026-10-02')"));assert.equal(r[0].status,'in_room');await capture(5,52,'checkout');await as(5,()=>rows('select public.request_device_return($1)',[id(201)]));});
  await ok('Historical turns cannot put room on hold',()=>fail(()=>as(2,()=>rows("select public.set_room_handover($1,false,'old turn')",[id(51)])),/SEGMENT_UNAVAILABLE/));
  await ok('Anonymous cannot use report or operational commands',async()=>{await db.exec('set role anon');try{await fail(()=>rows('select public.idol_operations_day($1)',[day]),/permission denied/);}finally{await db.exec('reset role');}});
  await ok('Suspending a profile revokes operations access',async()=>{await rows("update public.profiles set status='suspended' where id=$1",[id(5)]);await fail(()=>report(5),/ACTIVE_REQUIRED/);});
  console.log(`\n${passed} attendance SQL checks passed.`);
} catch(e) { console.error('FAILED',e.message,e.detail??'',e.where??'');process.exitCode=1; }
finally { await db.close(); }
