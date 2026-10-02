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
console.log(`\n${passed} accounts + resources SQL tests passed. Real OAuth and concurrent connections are not covered.`);await db.close();
