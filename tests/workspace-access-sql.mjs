import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2] ?? 'supabase/migrations');
const bundledUpdate=process.argv[3];
const db=new PGlite({extensions:{btree_gist}});
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows=async(sql,args)=>(await db.query(sql,args)).rows;
let passed=0;
async function test(name,fn){await fn();console.log('PASS',name);passed++;}
async function as(n,fn){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(n)}'`);try{return await fn();}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
const report=(date='2020-01-02')=>rows('select * from public.diamond_report_rows($1)',[date]);
const rank=()=>rows("select * from public.homepage_diamond_ranking('month','2020-01-01')");
const person=(list,n)=>list.find(r=>r.idol_id===id(n));
try {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
    create publication supabase_realtime;`);
  const files=readdirSync(root).filter(f=>f.endsWith('.sql')).sort();
  for(const file of files.filter(f=>f<(bundledUpdate?'202610020022':'202610020023'))) await db.exec(readFileSync(resolve(root,file),'utf8'));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'person'||n||'@example.com',now(),jsonb_build_object('full_name','Person '||n) from generate_series(1,10)n;
    update public.profiles set status='active',phone='0901234567',birth_date='2000-01-01';
    update public.profiles set role='admin' where id='${id(1)}';
    update public.profiles set role='operator' where id in ('${id(2)}','${id(3)}','${id(10)}');
    update public.profiles set status='pending' where id='${id(7)}';
    update public.profiles set phone=null where id='${id(8)}';
    update public.profiles set status='suspended' where id='${id(9)}';`);
  for(const n of [4,5,6]) {await as(1,()=>rows('select public.admin_assign_idol($1,$2)',[id(n),id(n===4?2:3)]));await as(n,()=>rows('select public.update_my_profile_with_tiktok($1,$2,$3,$4)',[`Person ${n}`,`idol${n}`,'0901234567','2000-01-01']));}
  await as(1,async()=>{
    for(const [date,entries,hash] of [['2020-01-01',[[4,100],[5,200],[6,0]],'a'],['2020-01-02',[[4,150],[5,50]],'b'],['2019-12-31',[[4,999]],'c']]) {
      const batch=(await rows('select public.stage_diamond_import($1,$2,$3,$4::jsonb) id',[date,'daily.xlsx',hash.repeat(64),JSON.stringify(entries.map(([n,diamonds],i)=>({username:`idol${n}`,diamonds,row_number:i+2}))) ]))[0].id;
      await rows('select public.publish_diamond_import($1,null,false)',[batch]);
    }
  });
  await test('Migration update applies without deleting data',async()=>{
    await db.exec(readFileSync(bundledUpdate ?? resolve(root,files.find(f=>f.startsWith('202610020023'))),'utf8'));
    assert.equal((await rows('select * from public.daily_metrics')).length,6);
  });
  await as(1,()=>rows('select public.admin_set_diamond_visibility(false,false)'));
  await test('Idol own amounts visible; other amounts NULL with company ranks',()=>as(4,async()=>{const r=await report();assert.equal(r.length,3);assert.equal(person(r,4).month_diamonds,'250');assert.equal(person(r,5).month_diamonds,null);assert.equal(person(r,5).day_diamonds,null);assert.equal(person(r,4).month_rank,person(r,5).month_rank);assert.ok(r.every(x=>x.operator_id===null));}));
  await test('Legacy monthly RPC cannot bypass visibility',()=>as(4,async()=>{const r=await rows("select * from public.diamond_monthly_report('2020-01-02')");assert.equal(person(r,5).month_diamonds,null);assert.equal(person(r,4).month_diamonds,'250');}));
  await test('Homepage uses identical own/team rules',()=>as(4,async()=>{const r=await rank();assert.equal(person(r,4).diamonds_total,'250');assert.equal(person(r,5).diamonds_total,null);assert.ok(r.every(x=>x.company_diamonds_total===null));}));
  await test('Operator sees own team amount while other teams are masked',()=>as(2,async()=>{const r=await report();assert.equal(person(r,4).month_diamonds,'250');assert.equal(person(r,5).month_diamonds,null);assert.equal(person(r,4).is_my_team,true);assert.equal(person(r,5).is_my_team,false);}));
  await test('Admin sees all amounts and team totals including empty team',()=>as(1,async()=>{const r=await rows("select * from public.diamond_team_totals('2020-01-02')");assert.equal(r.find(x=>x.operator_id===id(2)).month_diamonds,'250');assert.equal(r.find(x=>x.operator_id===id(3)).month_diamonds,'250');assert.equal(Number(r.find(x=>x.operator_id===id(3)).idol_count),2);assert.equal(r.find(x=>x.operator_id===id(10)).month_diamonds,null);assert.equal((await rank())[0].company_diamonds_total,'500');}));
  await test('Operator cannot query team totals or change permissions',()=>as(2,async()=>{await assert.rejects(()=>rows('select * from public.diamond_team_totals(null)'),/Admin required|ADMIN_REQUIRED/);await assert.rejects(()=>rows('select public.admin_set_diamond_visibility(true,true)'),/Admin required|ADMIN_REQUIRED/);}));
  await test('Idol cannot change permissions',()=>as(4,()=>assert.rejects(()=>rows('select public.admin_set_diamond_visibility(true,true)'),/Admin required|ADMIN_REQUIRED/)));
  await as(1,()=>rows('select public.admin_set_diamond_visibility(true,true)'));
  await test('Role toggles grant other Idol amounts on report and homepage',()=>as(4,async()=>{assert.equal(person(await report(),5).month_diamonds,'250');assert.equal(person(await rank(),5).diamonds_total,'250');assert.ok((await rank()).every(r=>r.company_diamonds_total===null));}));
  await test('Numeric access never grants other personal profiles or raw daily metrics',()=>as(4,async()=>{assert.equal((await rows('select * from public.profiles')).length,1);assert.equal((await rows('select distinct platform_account_id from public.daily_metrics')).length,1);}));
  await test('Operator role toggle grants outside-team amounts',()=>as(2,async()=>assert.equal(person(await report(),5).month_diamonds,'250')));
  await as(1,()=>rows('select public.admin_set_diamond_visibility(false,false)'));
  await test('Revocation takes effect on next RPC without new login',()=>as(4,async()=>assert.equal(person(await report(),5).month_diamonds,null)));
  await test('Explicit selected date never substitutes another month',()=>as(1,async()=>{assert.equal((await report('2020-02-03')).length,0);assert.equal(person(await report('2020-01-01'),4).month_diamonds,'100');}));
  await test('Zero is distinct from missing daily import and unranked day',()=>as(1,async()=>{const r=person(await report(),6);assert.equal(r.month_diamonds,'0');assert.equal(r.day_diamonds,null);assert.equal(r.day_rank,null);assert.equal(person(await report('2020-01-01'),6).day_diamonds,'0');}));
  for(const n of [7,8,9]) await test(`Pending/incomplete/suspended ${n} cannot call report`,()=>as(n,()=>assert.rejects(()=>report(),/required/)));
  await test('Incomplete active member can read own profile but no business tables',()=>as(8,async()=>{assert.equal((await rows('select * from public.profiles')).length,1);assert.equal((await rows('select * from public.rooms')).length,0);assert.equal((await rows('select private.current_role() role'))[0].role,null);}));
  await test('Incomplete account cannot submit partial required profile',()=>as(8,()=>assert.rejects(()=>rows("select public.update_my_profile_with_tiktok('New Member','newmember','','2000-01-01')"),/PROFILE_REQUIRED/)));
  await test('Incomplete account cannot bypass screen using scheduling RPC',()=>as(8,()=>assert.rejects(()=>rows('select public.submit_schedule($1,current_date,$2::jsonb,false,$3)',[id(8),'[]','']),/PROFILE_REQUIRED/)));
  await test('Completion unlocks access immediately',()=>as(8,async()=>{await rows("select public.update_my_profile_with_tiktok('New Member','newmember','0901234567','2000-01-01')");assert.equal((await rows('select private.current_role() role'))[0].role,'idol');assert.equal((await report()).length,3);}));
  await test('Legacy update cannot clear required fields',()=>as(8,()=>assert.rejects(()=>rows("select public.update_my_profile('New Member','newmember','',null)"),/PROFILE_REQUIRED/)));
  await test('Future birthday rejected',()=>as(8,()=>assert.rejects(()=>rows("select public.update_my_profile_with_tiktok('New Member','newmember','0901234567','2200-01-01')"),/INVALID_INPUT/)));
  await test('Duplicate TikTok username rolls back profile changes',()=>as(8,async()=>{await assert.rejects(()=>rows("select public.update_my_profile_with_tiktok('Changed','idol4','0901234567','2000-01-01')"));assert.equal((await rows('select full_name from public.profiles where id=auth.uid()'))[0].full_name,'New Member');}));
  await test('Suspended account cannot complete profile',()=>as(9,()=>assert.rejects(()=>rows("select public.update_my_profile_with_tiktok('Blocked','blocked','0901234567','2000-01-01')"),/ACCOUNT_UNAVAILABLE/)));
  await test('Admin bootstrap works without personal fields',async()=>{await rows('update public.profiles set phone=null,birth_date=null where id=$1',[id(1)]);await as(1,async()=>assert.equal((await report()).length,3));});
  console.log(`${passed} workspace/access SQL checks passed.`);
} finally {await db.close();}
