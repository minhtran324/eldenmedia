import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
process.on('uncaughtException',error=>{console.error('SQL TEST FAILED:',error.message, error.detail??'', error.where??'');process.exit(1);});

const sqlRoot=process.argv[2]??fileURLToPath(new URL('../supabase/',import.meta.url));
const homepageMigration=process.argv[3]??resolve(sqlRoot,'migrations/202609290004_homepage.sql');
const bootstrap=process.argv[4]??resolve(sqlRoot,'elden-bootstrap.sql');
const stub=`create role anon nologin;create role authenticated nologin;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;`;
const db=new PGlite({extensions:{btree_gist}});
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
async function ok(name,fn){await fn();passed++;console.log('PASS',name);}
async function fail(sql,pattern){try{await db.exec(sql);}catch(e){await db.exec('rollback');assert.match(e.message,pattern);return;}throw Error('Expected failure');}
async function as(id,fn){await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid(id)}';`);try{return await fn();}finally{await db.exec('reset role;reset request.jwt.claim.sub;');}}
async function rows(sql){return (await db.query(sql)).rows;}
await db.exec(stub);
await ok('One bootstrap executes as a single transaction',()=>db.exec(readFileSync(bootstrap,'utf8')));
await ok('Schema ledger records all four versions',async()=>assert.equal((await rows('select * from private.app_schema_migrations')).length,4));
await ok('Rerunning bootstrap fails safely on existing project',()=>fail(readFileSync(bootstrap,'utf8'),/Existing Elden schema detected/));
await db.exec(`insert into auth.users(id) values ${[1,2,3,4,5,6,7,8,9].map(n=>`('${uid(n)}')`).join(',')};
update public.profiles set full_name='Person',status='active';
update public.profiles set role='admin' where id='${uid(1)}';
update public.profiles set role='operator' where id in ('${uid(2)}','${uid(3)}');
update public.profiles set status='pending' where id='${uid(6)}';
update public.profiles set status='suspended' where id='${uid(7)}';
update public.profiles set nickname='A' where id='${uid(4)}';
update public.profiles set nickname='B' where id='${uid(5)}';
insert into public.idol_assignments(idol_id,operator_id) values('${uid(4)}','${uid(2)}'),('${uid(5)}','${uid(3)}');
insert into public.platform_accounts(id,idol_id,platform,external_id) values
('${uid(14)}','${uid(4)}','TikTok','A'),('${uid(15)}','${uid(5)}','TikTok','B'),('${uid(18)}','${uid(8)}','TikTok','C'),('${uid(19)}','${uid(9)}','TikTok','D');
insert into public.import_batches(id,data_date,file_path,file_hash,uploaded_by,status) values
('${uid(30)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'file.xlsx','hash-a','${uid(1)}','published'),
('${uid(31)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'file2.xlsx','hash-b','${uid(1)}','staged');
insert into public.daily_metrics(platform_account_id,metric_date,import_batch_id,diamonds) values
('${uid(14)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'${uid(30)}',100),
('${uid(15)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'${uid(30)}',100),
('${uid(18)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'${uid(31)}',50),
('${uid(19)}',(now() at time zone 'Asia/Ho_Chi_Minh')::date,'${uid(30)}',null);`);
await ok('Ranking allows active idol but only published verified data',()=>as(4,async()=>assert.equal((await rows('select * from public.homepage_ranking()')).length,2)));
await ok('Ranking API never returns diamond totals',()=>as(4,async()=>{
 const r=(await rows('select * from public.homepage_ranking()'))[0];
 assert.deepEqual(Object.keys(r).sort(),['rank_position','idol_id','display_name','avatar_path','period_start','period_end','data_through'].sort());
}));
await ok('Ties share the same rank',()=>as(2,async()=>assert.deepEqual((await rows('select rank_position::int from public.homepage_ranking()')).map(r=>r.rank_position),[1,1])));
await db.exec(`update public.import_batches set status='published' where id='${uid(31)}'`);
await ok('Ranking changes automatically when imported batch is published',()=>as(3,async()=>assert.deepEqual((await rows('select rank_position::int from public.homepage_ranking()')).map(r=>r.rank_position),[1,1,2])));
await ok('Historical period with no imports returns no invented ranking',()=>as(4,async()=>assert.equal((await rows("select * from public.homepage_ranking('month','1900-01-01')")).length,0)));
await ok('Operator cannot read another teams raw diamond data',()=>as(2,async()=>assert.equal((await rows('select * from public.daily_metrics')).length,1)));
await ok('Pending accounts cannot use homepage RPCs',()=>as(6,()=>fail('select * from public.homepage_ranking()',/Active account/)));
await ok('Suspended accounts cannot use homepage RPCs',()=>as(7,()=>fail('select * from public.homepage_birthdays_today()',/Active account/)));
await ok('Anonymous probe exposes only application/schema version',async()=>{
 await db.exec('set role anon');try{const r=await rows('select public.app_connection_status() as status');assert.equal(r[0].status.schema_version,'202609290004');await fail('select * from public.homepage_ranking()',/permission denied/);}finally{await db.exec('reset role');}
});
await as(1,()=>db.exec(`insert into public.homepage_posts(id,kind,title,status) values
('${uid(40)}','announcement','Published','published'),('${uid(41)}','announcement','Draft','draft');
insert into public.homepage_posts(id,kind,title,status,publish_from) values('${uid(42)}','announcement','Future','published',now()+interval '1 day');
insert into public.homepage_posts(id,kind,title,status,audience) values('${uid(43)}','announcement','Operators only','published',array['operator']::public.app_role[]);`));
await ok('Idol sees only active published content for their audience',()=>as(4,async()=>assert.equal((await rows('select * from public.homepage_posts')).length,1)));
await ok('Operator sees content targeted to operators',()=>as(2,async()=>assert.equal((await rows('select * from public.homepage_posts')).length,2)));
await ok('Admin sees drafts and scheduled content',()=>as(1,async()=>assert.equal((await rows('select * from public.homepage_posts')).length,4)));
await ok('Idol cannot publish content',()=>as(4,()=>fail("insert into public.homepage_posts(kind,title) values('announcement','Spoof')",/row-level security/)));
await ok('Published poster requires an image',()=>as(1,()=>fail("insert into public.homepage_posts(kind,title,status) values('poster','Missing image','published')",/check constraint/)));
await as(1,()=>db.exec(`insert into public.homepage_posts(id,kind,title,status,image_path) values('${uid(44)}','poster','Poster','published','visible.jpg');
insert into storage.objects(bucket_id,name) values('homepage-media','visible.jpg'),('homepage-media','unpublished.jpg');`));
await ok('Media policy hides unattached draft files',()=>as(4,async()=>assert.equal((await rows("select * from storage.objects where bucket_id='homepage-media'")).length,1)));
await ok('Idol cannot upload homepage media',()=>as(4,()=>fail("insert into storage.objects(bucket_id,name) values('homepage-media','fake.jpg')",/row-level security/)));
await db.exec(`update public.profiles set birth_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '20 years' where id='${uid(4)}';
update public.profiles set birth_date=((now() at time zone 'Asia/Ho_Chi_Minh')::date + 3) - interval '20 years' where id in ('${uid(2)}','${uid(5)}');`);
await ok('Birthday feed includes today only, never full birth date/year',()=>as(3,async()=>{
 const r=await rows('select * from public.homepage_birthdays_today()');assert.equal(r.length,1);assert.deepEqual(Object.keys(r[0]).sort(),['person_id','display_name','role','avatar_path'].sort());
}));
await ok('Birthday reminders reach all operators and Admin three days early',async()=>{
 const r=await rows('select private.send_birthday_reminders() as n');assert.equal(r[0].n,6);
});
await ok('Birthday reminders do not duplicate when hourly job reruns',async()=>assert.equal((await rows('select private.send_birthday_reminders() as n'))[0].n,0));
await ok('All operators can read cross-team birthday reminder summaries',()=>as(2,async()=>assert.equal((await rows("select * from public.notifications where event_type='birthday_reminder'")).length,2)));
await ok('Normal users cannot invoke the scheduler function',()=>as(4,()=>fail('select private.send_birthday_reminders()',/permission denied/)));
await ok('Birthday opt-out is respected',async()=>{
 await db.exec(`update public.profiles set birthday_visible=false where id='${uid(4)}'`);
 await as(2,async()=>assert.equal((await rows('select * from public.homepage_birthdays_today()')).length,0));
});
await ok('Year-boundary reminders match January birthdays',async()=>{
 await db.exec(`update public.profiles set birth_date='2000-01-02' where id='${uid(9)}'`);
 assert.equal((await rows("select private.send_birthday_reminders('2026-12-30') as n"))[0].n,3);
});
await ok('Homepage options editable only by Admin',async()=>{
 await as(2,()=>fail("select public.admin_set_homepage_options('week','company')",/Admin required/));
 await as(1,()=>db.exec("select public.admin_set_homepage_options('week','company')"));
 assert.equal((await rows('select ranking_period from public.company_settings'))[0].ranking_period,'week');
});
// Compare bootstrap vs the upgrade route on another isolated database.
const upgrade=new PGlite({extensions:{btree_gist}});
await ok('Sequential upgrades and bootstrap produce matching public table columns',async()=>{
 await upgrade.exec(stub);
 for(const file of ['202609290001_initial_schema.sql','202609290002_business_foundation.sql','202609290003_access_and_onboarding.sql']) await upgrade.exec(readFileSync(resolve(sqlRoot,'migrations',file),'utf8'));
 await upgrade.exec(readFileSync(homepageMigration,'utf8'));
 const fingerprint="select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position";
 assert.deepEqual((await db.query(fingerprint)).rows,(await upgrade.query(fingerprint)).rows);
});
await upgrade.close();await db.close();console.log(`\n${passed} homepage/bootstrap tests passed. Cron engine and real Supabase services not tested.`);
