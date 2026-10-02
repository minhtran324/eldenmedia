import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error('FAILED',e.message,e.detail??'',e.where??'');process.exit(1);});
const sqlRoot=process.argv[2]??fileURLToPath(new URL('../supabase/',import.meta.url));
const migration=process.argv[3]??resolve(sqlRoot,'migrations/202609290005_phase1_accounts.sql');
const db=new PGlite({extensions:{btree_gist}});
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
async function ok(name,fn){await fn();console.log('PASS',name);passed++;}
async function rows(sql){return(await db.query(sql)).rows;}
async function as(n,fn){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}';`);try{return await fn();}finally{await db.exec('reset role;reset request.jwt.claim.sub;');}}
async function fails(sql,pattern){try{await db.exec(sql);}catch(e){await db.exec('rollback');assert.match(e.message,pattern);return;}throw Error('Expected failure');}
await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
insert into auth.users(id,email,email_confirmed_at) values('${id(90)}','legacy@gmail.com',now());`);
for(const f of ['202609290001_initial_schema.sql','202609290002_business_foundation.sql','202609290003_access_and_onboarding.sql','202609290004_homepage.sql'])await db.exec(readFileSync(resolve(sqlRoot,'migrations',f),'utf8'));
await ok('Migration 005 upgrades 004',()=>db.exec(readFileSync(migration,'utf8')));
await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('${id(1)}','admin@gmail.com',now(),'{"full_name":"Admin"}'),
('${id(2)}','operator@gmail.com',null,'{}'),
('${id(4)}','idol@gmail.com',now(),'{"full_name":"Idol A","role":"admin"}'),
('${id(5)}','other@gmail.com',now(),'{"full_name":"Idol B"}'),
('${id(6)}','operator2@gmail.com',now(),'{"full_name":"Operator 2"}');
update public.profiles set role='admin',status='active' where id='${id(1)}';`);
await ok('Legacy verified Auth user gets pending profile safely',()=>as(90,async()=>{
 await db.exec('select public.complete_my_onboarding()');
 assert.equal((await rows(`select status from public.profiles where id='${id(90)}'`))[0].status,'pending');
}));
await ok('First verified signup stays pending despite metadata role',()=>as(4,async()=>{
 await db.exec('select public.complete_my_onboarding()');
 assert.deepEqual((await rows(`select role,status from public.profiles where id='${id(4)}'`))[0],{role:'idol',status:'pending'});
}));
await ok('Admin reserves operator email without creating password or sending email',()=>as(1,async()=>{
 assert.equal((await rows("select public.admin_create_operator_access('OPERATOR@gmail.com','Operator A') as result"))[0].result,'reserved');
}));
await ok('Unverified email cannot claim reserved role',()=>as(2,()=>fails('select public.complete_my_onboarding()',/VERIFIED_EMAIL_REQUIRED/)));
await ok('Wrong email cannot claim another operators reservation',()=>as(5,async()=>{
 await db.exec('select public.complete_my_onboarding()');assert.equal((await rows(`select role from public.profiles where id='${id(5)}'`))[0].role,'idol');
}));
await db.exec(`update auth.users set email_confirmed_at=now() where id='${id(2)}'`);
await ok('Verified invited operator activates on first login',()=>as(2,async()=>{
 await db.exec('select public.complete_my_onboarding()');assert.deepEqual((await rows(`select role,status from public.profiles where id='${id(2)}'`))[0],{role:'operator',status:'active'});
}));
await ok('Returning operator does not return to pending',()=>as(2,async()=>{
 await db.exec('select public.complete_my_onboarding()');assert.equal((await rows(`select status from public.profiles where id='${id(2)}'`))[0].status,'active');
}));
await ok('Non-admin cannot issue operator access',()=>as(4,()=>fails("select public.admin_create_operator_access('attacker@gmail.com','Attack')",/ADMIN_REQUIRED/)));
await ok('Old unverified activation RPC is not callable',()=>as(1,()=>fails(`select public.admin_activate_operator('${id(5)}')`,/permission denied/)));
await ok('Admin can activate a verified pending operator immediately',()=>as(1,async()=>assert.equal((await rows("select public.admin_create_operator_access('operator2@gmail.com','Operator B') as result"))[0].result,'activated')));
await ok('Pending idol can edit only personal fields through RPC',()=>as(4,async()=>{
 await db.exec("select public.update_my_profile('Idol A','Nick','0901234567','2000-01-01')");
 await fails(`update public.profiles set role='admin' where id='${id(4)}'`,/permission denied/);
}));
await ok('Invalid future birthday rejected',()=>as(4,()=>fails("select public.update_my_profile('Idol A','','','2999-01-01')",/INVALID_INPUT/)));
await ok('Admin approves idol and assigns current team',()=>as(1,()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(2)}')`)));
await ok('Returning approved idol does not need reapproval',()=>as(4,async()=>{
 await db.exec('select public.complete_my_onboarding()');assert.equal((await rows(`select status from public.profiles where id='${id(4)}'`))[0].status,'active');
}));
await ok('Idol sees manager name via a narrow RPC',()=>as(4,async()=>assert.equal((await rows('select * from public.my_operator_summary()'))[0].full_name,'Operator A')));
await ok('Existing active idol cannot become operator by email invitation',()=>as(1,()=>fails("select public.admin_create_operator_access('idol@gmail.com','Wrong role')",/ACCOUNT_ALREADY_IN_USE/)));
await ok('Admin list can search by verified email',()=>as(1,async()=>{
 const list=await rows("select * from public.admin_members('idol@gmail.com',1,20)");assert.equal(list.length,1);assert.equal(list[0].id,id(4));
}));
await ok('Operator cannot enumerate employee emails',()=>as(2,()=>fails("select * from public.admin_members('',1,20)",/ADMIN_REQUIRED/)));
await ok('Admin transfer removes previous operators access',async()=>{
 await as(1,()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(6)}')`));
 await as(2,async()=>assert.equal((await rows(`select * from public.profiles where id='${id(4)}'`)).length,0));
 await as(6,async()=>assert.equal((await rows(`select * from public.profiles where id='${id(4)}'`)).length,1));
});
await ok('Account suspension blocks access using existing identity',async()=>{
 await as(1,()=>db.exec(`select public.admin_set_member_status('${id(4)}','suspended','Tạm dừng')`));
 await as(4,()=>fails('select * from public.homepage_ranking()',/Active account/));
});
await ok('Login cannot unsuspend an account',()=>as(4,async()=>{
 await db.exec('select public.complete_my_onboarding()');assert.equal((await rows(`select status from public.profiles where id='${id(4)}'`))[0].status,'suspended');
}));
await ok('Suspended account cannot edit its profile',()=>as(4,()=>fails("select public.update_my_profile('Idol A','','',null)",/ACCOUNT_UNAVAILABLE/)));
await ok('Admin can reopen previously approved account',()=>as(1,()=>db.exec(`select public.admin_set_member_status('${id(4)}','active','Mở lại')`)));
await ok('Cannot unlock pending idol to bypass approval',()=>as(1,()=>fails(`select public.admin_set_member_status('${id(5)}','active','Bypass')`,/APPROVAL_REQUIRED/)));
await ok('Admin account cannot be suspended through member API',()=>as(1,()=>fails(`select public.admin_set_member_status('${id(1)}','suspended','Self')`,/ADMIN_ACCOUNT_PROTECTED/)));
await ok('Reserved access can be revoked before verification',async()=>{
 await as(1,()=>db.exec("select public.admin_create_operator_access('revoked@gmail.com','Revoked Operator')"));
 const invitation=(await rows("select id from public.operator_access_invites where email='revoked@gmail.com'"))[0].id;
 await as(1,()=>db.exec(`select public.admin_revoke_operator_access('${invitation}')`));
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${id(7)}','revoked@gmail.com',now())`);
 await as(7,async()=>{await db.exec('select public.complete_my_onboarding()');assert.equal((await rows(`select role from public.profiles where id='${id(7)}'`))[0].role,'idol');});
});
await ok('Repeated onboarding does not duplicate approval requests',async()=>{
 await as(5,()=>db.exec('select public.complete_my_onboarding();select public.complete_my_onboarding();'));
 assert.equal((await rows(`select count(*)::int n from public.requests where subject_idol_id='${id(5)}' and kind='account_approval' and status='pending'`))[0].n,1);
});
await ok('Anonymous cannot invoke onboarding or admin functions',async()=>{
 await db.exec('set role anon');try{await fails('select public.complete_my_onboarding()',/permission denied/);}finally{await db.exec('reset role');}
});
await ok('Migration 006 upgrades 005',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609290006_resources.sql'),'utf8')));
const save=(kind,payload)=>`select public.admin_save_resource('${kind}','${JSON.stringify(payload).replaceAll("'","''")}'::jsonb) as id`;
let floor,room,device,qr;
await ok('Admin creates floor',()=>as(1,async()=>{floor=(await rows(save('floor',{code:'F4',name:'Tầng 4',sort_order:4})))[0].id;}));
const roomInput=()=>({code:'P401',name:'Phòng 401',floor_id:floor,room_type:'studio',manager_id:id(2),status:'available'});
await ok('Operator cannot create resources',()=>as(2,()=>fails(save('room',roomInput()),/ADMIN_REQUIRED/)));
await ok('Idol cannot create resources',()=>as(4,()=>fails(save('room',roomInput()),/ADMIN_REQUIRED/)));
await ok('Direct table writes remain forbidden',()=>as(1,()=>fails("insert into public.floors(code,name) values('EVIL','Bypass')",/permission denied|row-level security/)));
await ok('Null kind rejected',()=>as(1,()=>fails("select public.admin_save_resource(null,'{}')",/INVALID_INPUT/)));
await ok('Invalid code rejected',()=>as(1,()=>fails(save('room',{...roomInput(),code:'bad code'}),/INVALID_CODE/)));
await ok('Non-operator manager rejected',()=>as(1,()=>fails(save('room',{...roomInput(),manager_id:id(4)}),/ACTIVE_OPERATOR_REQUIRED/)));
await ok('Room needs existing floor',()=>as(1,()=>fails(save('room',{...roomInput(),floor_id:id(99)}),/FLOOR_REQUIRED/)));
await ok('Admin creates room with persistent QR',()=>as(1,async()=>{room=(await rows(save('room',roomInput())))[0].id;assert.ok((await rows(`select qr_token from public.rooms where id='${room}'`))[0].qr_token);}));
const deviceInput=()=>({code:'DT001',assigned_room_id:room,manager_id:id(2),status:'available'});
await ok('Admin creates assigned device',()=>as(1,async()=>{device=(await rows(save('device',deviceInput())))[0].id;qr=(await rows(`select qr_token from public.devices where id='${device}'`))[0].qr_token;}));
await ok('Room cannot have two assigned phones',()=>as(1,()=>fails(save('device',{...deviceInput(),code:'DT002'}),/unique constraint/)));
await ok('Duplicate code normalized before insert',()=>as(1,()=>fails(save('device',{...deviceInput(),code:' dt001 ',assigned_room_id:null}),/unique constraint/)));
await ok('Unassign keeps QR and increments version',()=>as(1,async()=>{
 await db.exec(save('device',{...deviceInput(),id:device,version:1,assigned_room_id:null}));
 const row=(await rows(`select * from public.devices where id='${device}'`))[0];assert.equal(row.qr_token,qr);assert.equal(row.version,2);assert.equal(row.assigned_room_id,null);
}));
await ok('Stale edit cannot overwrite newer update',()=>as(1,()=>fails(save('device',{...deviceInput(),id:device,version:1}),/STALE_RESOURCE/)));
await ok('Device owner can change after return',()=>as(1,async()=>{
 await db.exec(save('device',{...deviceInput(),id:device,version:2,manager_id:id(6)}));
 assert.equal((await rows(`select qr_token from public.devices where id='${device}'`))[0].qr_token,qr);
}));
await ok('Active operator can read catalogue',()=>as(2,async()=>assert.equal((await rows(`select code from public.rooms where id='${room}'`)).length,1)));
await ok('Pending account cannot read catalogue',()=>as(5,async()=>assert.equal((await rows('select * from public.rooms')).length,0)));
await ok('Floor mutation is audited',async()=>assert.equal((await rows(`select count(*)::int n from public.audit_logs where entity_type='floors' and entity_id='${floor}'`))[0].n,1));
await ok('Suspended admin cannot change catalogue',async()=>{
 await db.exec(`update public.profiles set status='suspended' where id='${id(1)}'`);
 await as(1,()=>fails(save('floor',{code:'F5',name:'Tầng 5',sort_order:5}),/ADMIN_REQUIRED/));
 await db.exec(`update public.profiles set status='active' where id='${id(1)}'`);
});
await db.exec(`insert into public.daily_plans(id,idol_id,work_date,shift_count) values('${id(30)}','${id(4)}','2099-10-05',1);
 insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at) values('${id(40)}','${id(4)}','${id(30)}','2099-10-05 09:00+07','2099-10-05 14:00+07');
 insert into public.room_segments(id,session_id,room_id,starts_at,ends_at,status) values('${id(50)}','${id(40)}','${room}','2099-10-05 09:00+07','2099-10-05 14:00+07','approved');`);
await ok('Future approved booking prevents room changes',()=>as(1,()=>fails(save('room',{...roomInput(),id:room,version:1,status:'maintenance'}),/ROOM_IN_USE/)));
await db.exec(`insert into public.device_loans(id,device_id,idol_id,session_id) values('${id(60)}','${device}','${id(4)}','${id(40)}');`);
await ok('Open loan prevents device reassignment',()=>as(1,()=>fails(save('device',{...deviceInput(),id:device,version:3,assigned_room_id:null}),/DEVICE_IN_USE/)));
await db.exec(`update public.device_loans set return_requested_at=clock_timestamp() where id='${id(60)}'`);
await ok('Pending return still blocks device changes',()=>as(1,()=>fails(save('device',{...deviceInput(),id:device,version:3,status:'inactive'}),/DEVICE_IN_USE/)));
await db.exec(`update public.device_loans set returned_at=clock_timestamp(),return_confirmed_by='${id(6)}' where id='${id(60)}'`);
await ok('Confirmed return releases device for editing',()=>as(1,()=>db.exec(save('device',{...deviceInput(),id:device,version:3,status:'maintenance'}))));
await ok('Anonymous cannot call resource RPC',async()=>{
 await db.exec('set role anon');try{await fails(save('floor',{code:'F5',name:'Tầng 5',sort_order:5}),/permission denied/);}finally{await db.exec('reset role');}
});
await ok('Migration 007 upgrades 006',()=>db.exec(readFileSync(process.argv[4]??resolve(sqlRoot,'migrations/202609290007_scheduling.sql'),'utf8')));
const day=(await rows("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+3)::text as work_day"))[0].work_day;
const shifts=[{start_hour:9,end_hour:14}];
const submit=(idol=id(4),when=day,ss=shifts,cancel=false)=>`select public.submit_schedule('${idol}','${when}','${JSON.stringify(ss)}',${cancel},'Kiểm thử') id`;
const slots=rm=>Array.from({length:5},(_,i)=>({hour:9+i,room_id:rm}));
const prepare=(req,rm,revision=1)=>`select public.prepare_schedule('${req}',${revision},'${JSON.stringify(Array.isArray(rm)?rm:slots(rm))}') result`;
const review=(req,approve=true,revision=1)=>`select public.review_schedule('${req}',${revision},${approve},'Đã kiểm tra') result`;
let ownRoom,req,plan,child;
await as(1,async()=>{ownRoom=(await rows(save('room',{...roomInput(),code:'P402',manager_id:id(6)})))[0].id;});
await ok('Other operator cannot submit for idol',()=>as(2,()=>fails(submit(),/FORBIDDEN/)));
await ok('Invalid daily total rejected',()=>as(6,()=>fails(submit(id(4),day,[{start_hour:9,end_hour:13}]),/FIVE_HOURS_REQUIRED/)));
await ok('Overlapping two shifts rejected',()=>as(6,()=>fails(submit(id(4),day,[{start_hour:9,end_hour:12},{start_hour:11,end_hour:13}]),/OVERLAPPING_SHIFTS/)));
await ok('Operator creates pending proposal without occupying rooms',()=>as(6,async()=>{req=(await rows(submit()))[0].id;assert.equal((await rows(`select * from public.daily_plans where idol_id='${id(4)}' and work_date='${day}'`)).length,0);}));
await ok('Duplicate pending proposal rejected',()=>as(6,()=>fails(submit(),/one_pending_schedule_day/)));
await ok('Idol cannot prepare rooms',()=>as(4,()=>fails(prepare(req,ownRoom),/FORBIDDEN/)));
await ok('Missing room hours rejected',()=>as(6,()=>fails(prepare(req,slots(ownRoom).slice(1)),/ROOM_COVERAGE_REQUIRED/)));
await ok('Own rooms approve and merge consecutive hours',()=>as(6,async()=>{
 assert.equal((await rows(prepare(req,ownRoom)))[0].result,'approved');
 plan=(await rows(`select id from public.daily_plans where idol_id='${id(4)}' and work_date='${day}'`))[0].id;
 assert.equal((await rows(`select count(*)::int n from public.room_segments where session_id in(select id from public.live_sessions where daily_plan_id='${plan}') and status='approved'`))[0].n,1);
}));
await ok('Approved request cannot execute again',()=>as(6,()=>fails(prepare(req,ownRoom),/REQUEST_NOT_PENDING/)));
await ok('Change keeps previous approved sessions until final consent',()=>as(6,async()=>{
 req=(await rows(submit()))[0].id;
 assert.equal((await rows(prepare(req,room)))[0].result,'waiting');
 assert.equal((await rows(`select count(*)::int n from public.room_segments where room_id='${ownRoom}' and status='approved'`))[0].n,1);
}));
child=(await rows(`select id from public.requests where parent_request_id='${req}' and status='pending'`))[0].id;
await ok('Borrow owner sees narrow request without other team profiles',()=>as(2,async()=>{
 const inbox=await rows('select * from public.room_borrow_inbox()');assert.equal(inbox[0].id,child);assert.equal('subject_idol_id' in inbox[0],false);
 assert.equal((await rows(`select * from public.profiles where id='${id(4)}'`)).length,0);
}));
await ok('Wrong operator cannot consent to borrowed room',()=>as(6,()=>fails(review(child),/FORBIDDEN/)));
await ok('Owner consent atomically replaces old allocation',()=>as(2,async()=>{
 assert.equal((await rows(review(child)))[0].result,'approved');
}));
await ok('History retained as cancelled after change',async()=>{
 assert.equal((await rows(`select count(*)::int n from public.room_segments where room_id='${ownRoom}' and status='cancelled'`))[0].n,1);
});
await ok('Idol can request future approved-day cancellation',()=>as(4,async()=>{req=(await rows(submit(id(4),day,[],true)))[0].id;}));
await ok('Cancellation keeps booking until reviewer approves',async()=>assert.equal((await rows(`select status from public.daily_plans where id='${plan}'`))[0].status,'approved'));
await ok('Operator approves full-day cancellation',()=>as(6,async()=>{await rows(prepare(req,[]));assert.equal((await rows(`select status from public.daily_plans where id='${plan}'`))[0].status,'cancelled');}));
await ok('Idol has no access to cross-team availability RPC',()=>as(4,()=>fails(`select * from public.room_availability('${day}')`,/FORBIDDEN/)));
await ok('Operator availability omits no-longer-booked hours',()=>as(6,async()=>assert.ok((await rows(`select * from public.room_availability('${day}') where room_id='${room}' and slot_hour=9`)).length)));
await ok('Notifications created on decisions',async()=>assert.ok((await rows("select count(*)::int n from public.notifications where event_type='schedule'"))[0].n>0));
await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${id(8)}','collision@gmail.com',now(),'{"full_name":"Collision Idol"}')`);
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(8)}','${id(2)}')`));
await as(6,async()=>{req=(await rows(submit()))[0].id;await rows(prepare(req,room));});
child=(await rows(`select id from public.requests where parent_request_id='${req}' and status='pending'`))[0].id;
await ok('Pending borrow does not hold room against another booking',()=>as(2,async()=>{
 const competing=(await rows(submit(id(8))))[0].id;assert.equal((await rows(prepare(competing,room)))[0].result,'approved');
}));
await ok('Final borrowed-room approval rechecks occupancy',()=>as(2,()=>fails(review(child),/ROOM_CONFLICT/)));
await ok('Failed approval rolls back child decision and keeps old plan',async()=>{
 assert.equal((await rows(`select status from public.requests where id='${child}'`))[0].status,'pending');
 assert.equal((await rows(`select status from public.daily_plans where id='${plan}'`))[0].status,'cancelled');
});
await ok('Version prevents stale room preparation',()=>as(6,()=>fails(prepare(req,ownRoom,1),/STALE_REQUEST/)));
await ok('Current reviewer can reject and cancel pending child approvals',()=>as(6,async()=>{
 await rows(review(req,false,2));assert.equal((await rows(`select status from public.requests where id='${child}'`))[0].status,'cancelled');
}));
const split=[{start_hour:9,end_hour:11},{start_hour:15,end_hour:18}];
await ok('Two separated shifts still total five and receive own room segments',()=>as(6,async()=>{
 req=(await rows(submit(id(4),day,split)))[0].id;
 await rows(prepare(req,[9,10,15,16,17].map(hour=>({hour,room_id:ownRoom}))));
 assert.equal((await rows(`select count(*)::int n from public.live_sessions where daily_plan_id='${plan}' and status='approved'`))[0].n,2);
}));
await as(6,async()=>{req=(await rows(submit()))[0].id;await rows(prepare(req,room));});
child=(await rows(`select id from public.requests where parent_request_id='${req}' and status='pending'`))[0].id;
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(2)}')`));
await ok('Old team cannot reject after transfer',()=>as(6,()=>fails(review(req,false,2),/FORBIDDEN/)));
await ok('Borrow consent cannot apply proposal prepared by old team',()=>as(2,()=>fails(review(child),/STALE_TEAM/)));
await as(2,()=>rows(review(req,false,2)));
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(6)}')`));
await as(6,async()=>{req=(await rows(submit()))[0].id;});
await db.exec(`update public.profiles set status='suspended' where id='${id(6)}'`);
await ok('Unrelated operator cannot exploit missing active reviewer',()=>as(2,()=>fails(review(req,false),/FORBIDDEN/)));
await db.exec(`update public.profiles set status='active' where id='${id(6)}'`);
await as(6,()=>rows(review(req,false)));
const weekday=(await rows("select extract(isodow from now() at time zone 'Asia/Ho_Chi_Minh')::int as n"))[0].n;
const tomorrow=(await rows("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)::text as value"))[0].value;
if(weekday!==7) await ok('Idol cannot register new day outside Sunday window',()=>as(4,()=>fails(submit(id(4),tomorrow),/SUNDAY_NEXT_WEEK_ONLY/)));
else await ok('Idol can register next Monday on Sunday',()=>as(4,()=>rows(submit(id(4),tomorrow))));
await ok('Authenticated client cannot call private apply helper',()=>as(6,()=>fails(`select private.apply_schedule('${req}')`,/permission denied/)));
const activeSegment=(await rows(`select g.id from public.room_segments g join public.live_sessions s on s.id=g.session_id where s.daily_plan_id='${plan}' and g.status='approved' order by g.starts_at limit 1`))[0].id;
await db.exec(`insert into public.room_visits(segment_id,idol_id,checked_in_at,before_photo_path) values('${activeSegment}','${id(4)}','${day} 09:00+07','test/before.jpg')`);
await ok('Attendance freezes past schedule evidence',()=>as(6,()=>fails(submit(),/ATTENDANCE_EXISTS/)));
const clock=(await rows("select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as today,extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int as local_hour"))[0];
if(clock.local_hour>=8){
 await db.exec(`begin;insert into public.daily_plans(id,idol_id,work_date,shift_count,status) values('${id(100)}','${id(4)}','${clock.today}',1,'approved');
 insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at,status) values('${id(101)}','${id(4)}','${id(100)}','${clock.today} 09:00+07','${clock.today} 14:00+07','approved');
 insert into public.room_segments(session_id,room_id,starts_at,ends_at,status) values('${id(101)}','${room}','${clock.today} 09:00+07','${clock.today} 14:00+07','approved');commit;`);
 await ok('Idol cancellation enforces one-hour notice',()=>as(4,()=>fails(submit(id(4),clock.today,[],true),/ONE_HOUR_NOTICE/)));
}
await ok('Anonymous cannot invoke scheduling',async()=>{await db.exec('set role anon');try{await fails(submit(),/permission denied/);}finally{await db.exec('reset role');}});
await db.exec('create role service_role nologin bypassrls');
await ok('Migration 008 upgrades 007',()=>db.exec(readFileSync(process.argv[5]??resolve(sqlRoot,'migrations/202609300008_live_operations.sql'),'utf8')));
await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${id(9)}','live@gmail.com',now(),'{"full_name":"Live Idol"}'),('${id(10)}','otherlive@gmail.com',now(),'{"full_name":"Other Live"}')`);
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(9)}','${id(6)}');select public.admin_assign_idol('${id(10)}','${id(2)}')`));
let liveA,liveB,phoneA,phoneB;
await as(1,async()=>{
 liveA=(await rows(save('room',{...roomInput(),code:'LIVE-A',manager_id:id(6)})))[0].id;
 liveB=(await rows(save('room',{...roomInput(),code:'LIVE-B',manager_id:id(2)})))[0].id;
 phoneA=(await rows(save('device',{...deviceInput(),code:'LIVE-PHONE-A',assigned_room_id:liveA,manager_id:id(6)})))[0].id;
 phoneB=(await rows(save('device',{...deviceInput(),code:'LIVE-PHONE-B',assigned_room_id:liveB,manager_id:id(2)})))[0].id;
});
const token=async(table,target)=>(await rows(`select qr_token from public.${table} where id='${target}'`))[0].qr_token;
const aQR=await token('rooms',liveA),bQR=await token('rooms',liveB),paQR=await token('devices',phoneA),pbQR=await token('devices',phoneB);
await db.exec(`begin;
 insert into public.daily_plans(id,idol_id,work_date,shift_count,status) values('${id(200)}','${id(9)}','${clock.today}',1,'approved');
 insert into public.live_sessions(id,idol_id,daily_plan_id,starts_at,ends_at,status) values('${id(201)}','${id(9)}','${id(200)}','${clock.today} 09:00+07','${clock.today} 14:00+07','approved');
 insert into public.room_segments(id,session_id,room_id,starts_at,ends_at,status) values
 ('${id(202)}','${id(201)}','${liveA}','${clock.today} 09:00+07','${clock.today} 11:00+07','approved'),
 ('${id(203)}','${id(201)}','${liveB}','${clock.today} 11:00+07','${clock.today} 14:00+07','approved');commit;`);
const scan=q=>`select public.scan_device('${id(202)}','${q}') result`;
const deviceReview=(request,approve=true)=>`select public.review_device('${request}',1,${approve},'Đã kiểm tra')`;
let borrow,returnReq;
await ok('Another idol cannot take phone against this segment',()=>as(10,()=>fails(scan(paQR),/SEGMENT_UNAVAILABLE/)));
await ok('Foreign-room device creates approval request',()=>as(9,async()=>{const result=(await rows(scan(pbQR)))[0].result;assert.equal(result.status,'waiting');borrow=result.id;}));
await ok('Idol manager cannot approve somebody elses phone',()=>as(6,()=>fails(deviceReview(borrow),/FORBIDDEN/)));
await ok('Device owner sees narrow borrow inbox',()=>as(2,async()=>assert.ok((await rows('select * from public.device_request_inbox()')).some(r=>r.id===borrow))));
await ok('Device owner approves foreign-room loan',()=>as(2,()=>db.exec(deviceReview(borrow))));
await ok('One held device prevents another acquisition',()=>as(9,()=>fails(scan(paQR),/DEVICE_OR_IDOL_BUSY/)));
await ok('Return scan is idempotent while awaiting approval',()=>as(9,async()=>{
 returnReq=(await rows(`select public.request_device_return('${pbQR}') id`))[0].id;
 assert.equal((await rows(`select public.request_device_return('${pbQR}') id`))[0].id,returnReq);
}));
await ok('Phone owner alone cannot approve return',()=>as(2,()=>fails(deviceReview(returnReq),/FORBIDDEN/)));
await ok('Pending return still holds device',()=>as(9,()=>fails(scan(paQR),/DEVICE_OR_IDOL_BUSY/)));
await ok('Current idol operator can confirm return',()=>as(6,()=>db.exec(deviceReview(returnReq))));
await ok('Same-room QR grants available phone immediately',()=>as(9,async()=>assert.equal((await rows(scan(paQR)))[0].result.status,'received')));
const beginCapture=(segment,qr,phase='checkin')=>`select public.begin_room_capture('${segment}','${qr}','${phase}') result`;
const finish=(ticket,note='')=>`select public.finish_room_capture('${ticket}','${note}') id`;
const upload=t=>`insert into storage.objects(bucket_id,name) values('room-attendance','${t.path}')`;
let capture,visit,checkout;
await ok('Wrong room QR rejected',()=>as(9,()=>fails(beginCapture(id(202),bQR),/WRONG_ROOM_QR/)));
await ok('Cannot enter second segment before first checkout',()=>as(9,()=>fails(beginCapture(id(203),bQR),/CHECKOUT_PREVIOUS_ROOM/)));
await ok('Room QR starts a photo ticket, not an attendance record',()=>as(9,async()=>{capture=(await rows(beginCapture(id(202),aQR)))[0].result;assert.equal((await rows(`select * from public.room_visits where segment_id='${id(202)}'`)).length,0);}));
const abandoned=await as(9,async()=>(await rows(beginCapture(id(202),aQR)))[0].result);
await db.exec(`update public.room_capture_tickets set expires_at=now()-interval '1 second' where id='${abandoned.id}'`);
await ok('Expired capture cannot accept a later upload',()=>as(9,()=>fails(upload(abandoned),/row-level security/)));
await ok('Expired capture cannot backfill check-in',()=>as(9,()=>fails(finish(abandoned.id),/CAPTURE_EXPIRED/)));
await ok('Missing uploaded photo blocks check-in',()=>as(9,()=>fails(finish(capture.id),/PHOTO_REQUIRED/)));
await ok('Another idol cannot upload into capture ticket',()=>as(10,()=>fails(upload(capture),/row-level security/)));
await ok('Captured photo permits check-in with original QR timestamp',()=>as(9,async()=>{
 await db.exec(upload(capture));visit=(await rows(finish(capture.id)))[0].id;
 const row=(await rows(`select checked_in_at from public.room_visits where id='${visit}'`))[0];assert.equal(new Date(row.checked_in_at).getTime(),new Date(capture.scanned_at).getTime());
}));
await ok('Retrying finalized ticket does not duplicate attendance',()=>as(9,async()=>assert.equal((await rows(finish(capture.id)))[0].id,visit)));
await ok('Another idol cannot consume a used ticket',()=>as(10,()=>fails(finish(capture.id),/CAPTURE_NOT_FOUND/)));
await ok('Photo readable by current team but not room owner of another team',async()=>{
 await as(6,async()=>assert.equal((await rows(`select * from storage.objects where name='${capture.path}'`)).length,1));
 await as(2,async()=>assert.equal((await rows(`select * from storage.objects where name='${capture.path}'`)).length,0));
});
await ok('Photo cannot be overwritten by owner',()=>as(9,async()=>{const result=await db.query(`update storage.objects set name='changed' where name='${capture.path}' returning id`);assert.equal(result.rows.length,0);}));
await ok('Checkout without open visit rejected',()=>as(10,()=>fails(beginCapture(id(202),aQR,'checkout'),/VISIT_NOT_FOUND/)));
await as(9,async()=>{checkout=(await rows(beginCapture(id(202),aQR,'checkout')))[0].result;await db.exec(upload(checkout));});
await ok('Early or late checkout needs reason',()=>as(9,()=>fails(finish(checkout.id),/CHECKOUT_REASON_REQUIRED/)));
await ok('Checkout completes only first room segment',()=>as(9,async()=>{await rows(finish(checkout.id,'Đổi phòng'));assert.equal((await rows(`select status from public.live_sessions where id='${id(201)}'`))[0].status,'approved');}));
await ok('Next-room checkin permitted after checkout',()=>as(9,async()=>{capture=(await rows(beginCapture(id(203),bQR)))[0].result;await db.exec(upload(capture));await rows(finish(capture.id));}));
await ok('Final checkout completes session and day without returning phone',()=>as(9,async()=>{
 checkout=(await rows(beginCapture(id(203),bQR,'checkout')))[0].result;await db.exec(upload(checkout));await rows(finish(checkout.id,'Hoàn tất sớm'));
 assert.equal((await rows(`select status from public.daily_plans where id='${id(200)}'`))[0].status,'completed');
 assert.equal((await rows('select * from public.operational_loans()')).length,1);
}));
await ok('Photos become unreadable at retention deadline',async()=>{
 await db.exec(`update public.room_visit_photos set expires_at=now()-interval '1 second' where storage_path='${capture.path}'`);
 await as(9,async()=>assert.equal((await rows(`select * from storage.objects where name='${capture.path}'`)).length,0));
});
await as(9,async()=>{returnReq=(await rows(`select public.request_device_return('${paQR}') id`))[0].id;});
await ok('Rejected return keeps device occupied',()=>as(6,async()=>{await db.exec(deviceReview(returnReq,false));assert.ok((await rows(`select * from public.device_loans where device_id='${phoneA}' and returned_at is null`)).length);}));
await as(9,async()=>{returnReq=(await rows(`select public.request_device_return('${paQR}') id`))[0].id;});
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(9)}','${id(2)}')`));
await ok('Previous idol manager loses return approval after transfer',()=>as(6,()=>fails(deviceReview(returnReq),/FORBIDDEN/)));
await ok('New idol manager confirms return even for another owners phone',()=>as(2,()=>db.exec(deviceReview(returnReq))));
await ok('Operators cannot manufacture idol attendance',()=>as(2,()=>fails(beginCapture(id(202),aQR),/IDOL_REQUIRED/)));
await ok('Anonymous cannot scan device',async()=>{await db.exec('set role anon');try{await fails(scan(paQR),/permission denied/);}finally{await db.exec('reset role');}});
await ok('Migration 009 upgrades live operations',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609300009_homepage_workspace.sql'),'utf8')));
const postPayload={kind:'announcement',title:'Company news',body:'Hello',audience:['admin','operator','idol'],status:'draft'};
const savePost=(post=null,revision=null,patch={})=>`select public.admin_save_homepage_post(${post?`'${post}'`:'null'},${revision??'null'},'${JSON.stringify({...postPayload,...patch}).replaceAll("'","''")}'::jsonb) id`;
let contentId;
await ok('Admin creates draft via RPC',()=>as(1,async()=>{contentId=(await rows(savePost()))[0].id;}));
await ok('Idol cannot read draft',()=>as(9,async()=>assert.equal((await rows(`select * from public.homepage_posts where id='${contentId}'`)).length,0)));
await ok('Operator cannot write homepage',()=>as(2,()=>fails(savePost(),/Admin required/)));
await ok('Direct writes cannot bypass revision guard',()=>as(1,()=>fails("insert into public.homepage_posts(kind,title) values('announcement','Bypass')",/permission denied/)));
await ok('Published poster requires existing Storage object',()=>as(1,()=>fails(savePost(null,null,{kind:'poster',status:'published',image_path:'missing.jpg'}),/IMAGE_NOT_FOUND/)));
await ok('Empty audience cannot publish',()=>as(1,()=>fails(savePost(null,null,{audience:[]}),/check constraint/)));
await ok('Admin publishes existing draft',()=>as(1,()=>db.exec(savePost(contentId,1,{status:'published'}))));
await ok('Old editor cannot overwrite new version',()=>as(1,()=>fails(savePost(contentId,1),/STALE_POST/)));
await ok('Idol reads current published version',()=>as(9,async()=>assert.equal((await rows(`select revision from public.homepage_posts where id='${contentId}'`))[0].revision,2)));
await as(1,()=>db.exec("insert into storage.objects(bucket_id,name) values('homepage-media','poster-test.jpg')"));
await as(1,()=>db.exec(savePost(contentId,2,{kind:'poster',status:'published',image_path:'poster-test.jpg',audience:['operator']})));
await ok('Audience blocks idol post and media',()=>as(9,async()=>{
 assert.equal((await rows(`select * from public.homepage_posts where id='${contentId}'`)).length,0);
 assert.equal((await rows("select * from storage.objects where name='poster-test.jpg'")).length,0);
}));
await ok('Target operator can read poster bytes metadata',()=>as(2,async()=>assert.equal((await rows("select * from storage.objects where name='poster-test.jpg'")).length,1)));
await as(1,()=>db.exec(savePost(contentId,3,{kind:'poster',status:'archived',image_path:'poster-test.jpg'})));
await ok('Archiving revokes media access',()=>as(2,async()=>assert.equal((await rows("select * from storage.objects where name='poster-test.jpg'")).length,0)));
await ok('Published future post stays hidden',()=>as(1,()=>db.exec(savePost(contentId,4,{status:'published',publish_from:'2099-01-01T00:00:00Z'}))));
await as(9,async()=>assert.equal((await rows(`select * from public.homepage_posts where id='${contentId}'`)).length,0));
await ok('Expired publication stays hidden',async()=>{
 await as(1,()=>db.exec(savePost(contentId,5,{status:'published',publish_from:'2020-01-01T00:00:00Z',publish_until:'2020-01-02T00:00:00Z'})));
 await as(9,async()=>assert.equal((await rows(`select * from public.homepage_posts where id='${contentId}'`)).length,0));
});
await ok('Event requires start time',()=>as(1,()=>fails(savePost(null,null,{kind:'event'}),/check constraint/)));
await ok('Reminder scope remains company-wide',()=>as(1,()=>fails("select public.admin_set_homepage_options('month','team')",/COMPANY_REMINDERS_REQUIRED/)));
await ok('Anonymous cannot mutate homepage',async()=>{await db.exec('set role anon');try{await fails(savePost(),/permission denied/);}finally{await db.exec('reset role');}});

await ok('Migration 010 upgrades homepage',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609300010_birthday_catchup.sql'),'utf8')));
// Isolate birthday fixtures from the earlier account/operations scenarios.
await db.exec(`update public.profiles set birth_date=null;
 delete from public.notifications where event_type='birthday_reminder';
 update public.profiles set role='operator',status='active' where id in ('${id(2)}','${id(6)}');
 update public.profiles set role='idol',status='active',birthday_visible=true where id in ('${id(4)}','${id(5)}','${id(9)}','${id(90)}');
 update public.profiles set birth_date='2000-10-01' where id='${id(4)}';
 update public.profiles set birth_date='2000-10-02' where id='${id(5)}';
 update public.profiles set birth_date='2000-10-03' where id='${id(9)}';
 update public.profiles set birth_date='2000-10-04' where id='${id(90)}';`);
const remind=async day=>(await rows(`select private.send_birthday_reminders('${day}') n`))[0].n;
await ok('First run catches today, tomorrow, two and three days for all managers',async()=>assert.equal(await remind('2030-10-01'),12));
await ok('Reminder titles match actual days remaining',async()=>{
 const titles=await rows(`select title,count(*)::int n from public.notifications where event_type='birthday_reminder' group by title order by title`);
 assert.equal(titles.length,4);assert.ok(titles.every(x=>x.n===3));
 assert.ok(titles.some(x=>x.title==='Sinh nhật hôm nay'));assert.ok(titles.some(x=>x.title==='Sinh nhật ngày mai'));
});
await ok('Hourly rerun does not duplicate',async()=>assert.equal(await remind('2030-10-01'),0));
await ok('Following days through birthday do not resend',async()=>{for(const d of ['2030-10-02','2030-10-03','2030-10-04'])assert.equal(await remind(d),0);});
await ok('Next year receives fresh reminders',async()=>assert.equal(await remind('2031-10-01'),12));
await ok('Outside three-day window produces none',async()=>assert.equal(await remind('2032-09-27'),0));
await ok('Previous legacy reminder key suppresses resend after migration',async()=>{
 await db.exec(`insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body,dedupe_key) values('${id(1)}','${id(4)}','birthday_reminder','Sinh nhật sau 3 ngày','Legacy','birthday:${id(4)}:2032-10-01')`);
 assert.equal(await remind('2032-09-30'),8);
});
await ok('Newly entered birthday tomorrow is caught after earlier run',async()=>{
 await db.exec(`update public.profiles set birth_date=null where id='${id(5)}'`);
 await remind('2033-09-30');
 await db.exec(`update public.profiles set birth_date='2000-10-02' where id='${id(5)}'`);
 assert.equal(await remind('2033-10-01'),6); // newly entered tomorrow + Oct 4 entering the window
});
await ok('Opt-out and suspended birthday subjects are excluded',async()=>{
 await db.exec(`update public.profiles set birthday_visible=false where id='${id(4)}'; update public.profiles set status='suspended' where id='${id(5)}'`);
 assert.equal(await remind('2034-09-29'),0);
});
await ok('Suspended recipients are excluded',async()=>{
 await db.exec(`update public.profiles set status='suspended' where id='${id(6)}'`);
 assert.equal(await remind('2034-10-01'),4);
});
await ok('Year boundary uses occurrence year for deduplication',async()=>{
 await db.exec(`update public.profiles set birth_date='2000-01-01' where id='${id(9)}'`);
 assert.equal(await remind('2035-12-30'),2);assert.equal(await remind('2036-01-01'),0);
});
await ok('Leap-day birthdays match Feb 29 only',async()=>{
 await db.exec(`update public.profiles set birth_date='2000-02-29' where id='${id(9)}'`);
 assert.equal(await remind('2036-02-28'),2);assert.equal(await remind('2036-02-29'),0);assert.equal(await remind('2037-02-28'),0);
});
await ok('Null reference date rejected',()=>fails('select private.send_birthday_reminders(null)',/Date required/));
await ok('Signed-in users cannot invoke scheduler directly',()=>as(1,()=>fails('select private.send_birthday_reminders()',/permission denied/)));
await db.exec(`insert into public.notifications(recipient_id,event_type,title,body,read_at) values
 ('${id(1)}','live_operations','Old','Idol: Check-in muộn 5 phút.',now()),
 ('${id(1)}','live_operations','Old','Idol: Đã checkout phòng, trễ 5 phút.',null),
 ('${id(1)}','live_operations','Old','Idol: Đã nhận máy A.',null)`);
await ok('Migration 011 upgrades birthday catch-up',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609300011_notification_inbox.sql'),'utf8')));
await ok('Legacy attendance and devices split without resetting read state',async()=>{
 const legacy=await rows("select category,read_at from public.notifications where title='Old' order by body");
 assert.equal(legacy.filter(x=>x.category==='attendance').length,2);
 assert.equal(legacy.filter(x=>x.category==='devices').length,1);assert.equal(legacy.filter(x=>x.read_at).length,1);
});
await db.exec(`delete from public.notifications;
 update public.profiles set status='active' where id in ('${id(2)}','${id(6)}','${id(9)}');
 insert into public.notifications(id,recipient_id,event_type,title,body) values
 ('${id(901)}','${id(2)}','schedule','Schedule','A'),
 ('${id(902)}','${id(2)}','room_borrow','Room','B'),
 ('${id(903)}','${id(2)}','device_borrow','Phone','C'),
 ('${id(904)}','${id(2)}','attendance','Attendance','D'),
 ('${id(905)}','${id(2)}','birthday_reminder','Birthday','E'),
 ('${id(906)}','${id(2)}','new_future_event','System','F'),
 ('${id(907)}','${id(1)}','schedule','Admin only','G');`);
await ok('Six categories return independent unread counts',()=>as(2,async()=>{
 const c=await rows('select * from public.my_notification_counts()');assert.equal(c.length,6);assert.ok(c.every(x=>Number(x.unread_count)===1));
}));
await ok('Admin bell counts own inbox, not company inbox',()=>as(1,async()=>assert.equal(Number((await rows('select * from public.my_notification_counts()'))[0].unread_count),1)));
await ok('Read action changes only its recipient row',()=>as(2,async()=>{
 await db.exec(`select public.mark_notification_read('${id(901)}');select public.mark_notification_read('${id(907)}')`);
 assert.equal((await rows("select * from public.my_notification_counts() where category='schedule'")).length,0);
}));
await ok('Other recipient notification remains unread',async()=>assert.equal((await rows(`select read_at from public.notifications where id='${id(907)}'`))[0].read_at,null));
await ok('Repeat mark read preserves original timestamp',()=>as(2,async()=>{
 const before=(await rows(`select read_at from public.notifications where id='${id(901)}'`))[0].read_at;
 await db.exec(`select public.mark_notification_read('${id(901)}')`);
 assert.deepEqual((await rows(`select read_at from public.notifications where id='${id(901)}'`))[0].read_at,before);
}));
await db.exec(`insert into public.notifications(recipient_id,event_type,title,body) select '${id(2)}','schedule','Many','Test' from generate_series(1,1005)`);
await ok('Unread counts are not limited to first 1000 messages',()=>as(2,async()=>assert.equal(Number((await rows("select * from public.my_notification_counts() where category='schedule'"))[0].unread_count),1005)));
await db.exec(`insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body) values('${id(6)}','${id(9)}','schedule','Old team','Hidden')`);
await ok('Counts respect team visibility as well as recipient',()=>as(6,async()=>assert.equal((await rows('select * from public.my_notification_counts()')).length,0)));
await db.exec(`update public.profiles set status='suspended' where id='${id(2)}'`);
await ok('Suspension hides unread counts',()=>as(2,async()=>assert.equal((await rows('select * from public.my_notification_counts()')).length,0)));
await ok('Anonymous cannot query inbox counts',async()=>{await db.exec('set role anon');try{await fails('select * from public.my_notification_counts()',/permission denied/);}finally{await db.exec('reset role');}});
await ok('New operational notifications are classified at creation',async()=>{
 await db.exec(`select private.operation_notify('${id(9)}',null,'Check-in muộn 8 phút.');select private.operation_notify('${id(9)}',null,'Đã nhận máy X.');`);
 assert.ok((await rows("select * from public.notifications where category='attendance' and body like '%8 phút.%'")).length);
 assert.ok((await rows("select * from public.notifications where category='devices' and body like '%máy X.%'")).length);
});

await ok('Migration 012 enables idol birthday inbox',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609300012_idol_birthday_notifications.sql'),'utf8')));
await db.exec(`delete from public.notifications;update public.profiles set birth_date=null;update public.profiles set status='active',birthday_visible=true where id in ('${id(9)}','${id(4)}');update public.profiles set birth_date='2000-10-02' where id='${id(4)}'`);
await rows("select private.send_birthday_reminders('2040-10-01')");
await ok('Idol reads cross-team birthday reminder and count',()=>as(9,async()=>{
 assert.equal((await rows("select * from public.notifications where event_type='birthday_reminder'")).length,1);
 assert.equal(Number((await rows("select * from public.my_notification_counts() where category='birthdays'"))[0].unread_count),1);
 assert.equal((await rows(`select * from public.profiles where id='${id(4)}'`)).length,0);
}));
await ok('Idol marks own birthday notification read',()=>as(9,async()=>{
 const n=(await rows("select id from public.notifications where event_type='birthday_reminder'"))[0].id;
 await db.exec(`select public.mark_notification_read('${n}')`);
 assert.equal((await rows("select * from public.my_notification_counts() where category='birthdays'")).length,0);
}));
await ok('New recipient scope still deduplicates hourly reminders',async()=>assert.equal((await rows("select private.send_birthday_reminders('2040-10-01') n"))[0].n,0));
await db.exec(`update public.profiles set status='suspended' where id='${id(9)}'`);
await ok('Suspended idol cannot read received birthday reminders',()=>as(9,async()=>assert.equal((await rows("select * from public.notifications")).length,0)));
{
await ok('Migration 013 adds diamond import workflow',()=>db.exec(readFileSync(resolve(sqlRoot,'migrations/202609300013_diamond_imports.sql'),'utf8')));
await db.exec(`update public.profiles set status='active' where id in ('${id(2)}','${id(6)}','${id(4)}','${id(5)}','${id(9)}')`);
await as(1,()=>db.exec(`select public.admin_assign_idol('${id(4)}','${id(2)}');select public.admin_assign_idol('${id(5)}','${id(6)}')`));
const day='2020-09-29';
const stage=(hash,entries,date=day)=>`select public.stage_diamond_import('${date}','TikTok.xlsx','${hash.repeat(64)}','${JSON.stringify(entries)}'::jsonb) id`;
const entry=(row_number,username,diamonds)=>({row_number,username,diamonds});
const publish=(b,current=null,confirm=false)=>`select public.publish_diamond_import('${b}',${current?`'${current}'`:'null'},${confirm})`;
const map=(b,row,idol,previous=null,rename=false)=>`select public.map_diamond_username('${b}',${row},'${id(idol)}',${previous?`'${previous}'`:'null'},${rename})`;
let importA,importB,importC,importD;
await ok('Only Admin may stage data',()=>as(2,()=>fails(stage('a',[entry(2,'sample_a',100)]),/Admin required/)));
await ok('Admin stages only two selected business fields',()=>as(1,async()=>{importA=(await rows(stage('a',[entry(2,'sample_a',100),entry(3,'sample_b',200)])))[0].id;}));
await ok('Staging does not publish metrics',async()=>assert.equal((await rows(`select * from public.daily_metrics where metric_date='${day}'`)).length,0));
await ok('Unknown usernames block publishing',()=>as(1,()=>fails(publish(importA),/UNMATCHED_ROWS/)));
await ok('Mapping creates a stable account without reading external TikTok ID',()=>as(1,()=>db.exec(map(importA,2,4)+';'+map(importA,3,5))));
await ok('Mapping cannot transfer a username to another idol',()=>as(1,()=>fails(map(importA,2,9),/unique constraint/)));
await ok('Operator cannot view raw staged rows or batches',()=>as(2,async()=>{assert.equal((await rows('select * from public.diamond_import_rows')).length,0);assert.equal((await rows('select * from public.import_batches')).length,0);}));
await ok('Direct imports writes remain denied',()=>as(1,()=>fails(`update public.diamond_import_rows set diamonds=999`,/permission denied/)));
await ok('Publishing atomically exposes correct daily totals',()=>as(1,async()=>{await db.exec(publish(importA));assert.equal(Number((await rows(`select sum(diamonds) n from public.daily_metrics where metric_date='${day}'`))[0].n),300);}));
await ok('Own idol reads only own diamond total',()=>as(4,async()=>{const data=await rows(`select diamonds from public.daily_metrics where metric_date='${day}'`);assert.equal(data.length,1);assert.equal(Number(data[0].diamonds),100);}));
await ok('Operator sees only assigned team metrics',()=>as(2,async()=>assert.equal((await rows(`select * from public.daily_metrics where metric_date='${day}'`)).length,1)));
await ok('Ranking includes published diamond metrics but exposes no total',()=>as(9,async()=>{const data=await rows(`select * from public.homepage_ranking('day','${day}')`);assert.equal(data.length,2);assert.equal(data[0].idol_id,id(5));assert.ok(!('diamonds' in data[0]));}));
await ok('Same file and day returns existing batch',()=>as(1,async()=>assert.equal((await rows(stage('a',[entry(2,'sample_a',100)])))[0].id,importA)));
await ok('Repeated publication does not double totals',()=>as(1,async()=>{await db.exec(publish(importA));assert.equal(Number((await rows(`select sum(diamonds) n from public.daily_metrics where metric_date='${day}'`))[0].n),300);}));
await as(1,async()=>{importB=(await rows(stage('b',[entry(2,'sample_a',500)])))[0].id;importC=(await rows(stage('c',[entry(2,'sample_a',700)])))[0].id;});
await ok('Replacing published day requires explicit confirmation',()=>as(1,()=>fails(publish(importB,importA),/REPLACE_CONFIRMATION_REQUIRED/)));
await ok('Replacement removes omitted idol and retains old snapshot',()=>as(1,async()=>{
 await db.exec(publish(importB,importA,true));assert.equal((await rows(`select * from public.daily_metrics where metric_date='${day}'`)).length,1);
 assert.equal(Number((await rows(`select sum(diamonds) n from public.daily_metrics where metric_date='${day}'`))[0].n),500);
 assert.equal((await rows(`select * from public.diamond_import_rows where batch_id='${importA}'`)).length,2);
 assert.equal((await rows(`select status from public.import_batches where id='${importA}'`))[0].status,'reverted');
}));
await ok('Stale publication cannot replace another admin update',()=>as(1,()=>fails(publish(importC,importA,true),/STALE_DAY/)));
await ok('Revert removes metrics and ranking without restoring old batch',()=>as(1,async()=>{
 await db.exec(`select public.revert_diamond_import('${importB}')`);assert.equal((await rows(`select * from public.homepage_ranking('day','${day}')`)).length,0);
}));
await ok('Admin can explicitly republish a retained snapshot',()=>as(1,()=>db.exec(publish(importA))));
await ok('Duplicate username rows reject entire batch',()=>as(1,()=>fails(stage('d',[entry(2,'dup',1),entry(3,'dup',2)]),/unique constraint/)));
await ok('Negative diamonds rejected at SQL boundary',()=>as(1,()=>fails(stage('d',[entry(2,'sample_a',-1)]),/INVALID_ROW/)));
await ok('Future day rejected',()=>as(1,()=>fails(stage('d',[entry(2,'sample_a',1)],'2999-01-01'),/INVALID_DATE/)));
await as(1,async()=>{importD=(await rows(stage('d',[entry(2,'renamed_a',5)],'2020-09-30')))[0].id;});
await ok('Changing existing idol username requires confirmation',()=>as(1,()=>fails(map(importD,2,4,'sample_a'),/RENAME_CONFIRMATION_REQUIRED/)));
await ok('Confirmed rename keeps account and history',()=>as(1,async()=>{
 const account=(await rows(`select id from public.platform_accounts where idol_id='${id(4)}'`))[0].id;
 await db.exec(map(importD,2,4,'sample_a',true));
 assert.equal((await rows(`select id from public.platform_accounts where idol_id='${id(4)}'`))[0].id,account);
 assert.ok((await rows(`select * from public.tiktok_identity_history where account_id='${account}' and username='sample_a'`)).length);
}));
await ok('Stale username edit rejected',()=>as(1,()=>fails(map(importD,2,4,'sample_a',true),/STALE_USERNAME/)));
await ok('Idol cannot publish or revert',()=>as(4,()=>fails(publish(importD),/Admin required/)));
console.log(`${passed} SQL tests passed including diamond imports`);await db.close();

}
