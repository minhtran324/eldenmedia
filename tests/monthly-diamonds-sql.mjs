import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = process.argv[2] ?? fileURLToPath(new URL('../supabase/', import.meta.url));
const update = process.argv[3] ?? resolve(root, 'migrations/202609300017_monthly_diamonds.sql');
const db = new PGlite({ extensions: { btree_gist } });
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let passed = 0, digest = 0;
const rows = async (sql, args) => (await db.query(sql, args)).rows;
async function ok(name, fn) { await fn(); passed++; console.log('PASS', name); }
async function as(n, fn) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id(n)}'`);
  try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
}
const rejected = (fn, pattern) => assert.rejects(fn, pattern);
const entry = (username, diamonds, i = 2) => ({ username, diamonds, row_number: i });
async function stage(day, entries, hash) {
  return (await rows('select public.stage_diamond_import($1,$2,$3,$4::jsonb) id',
    [day, 'daily.xlsx', hash ?? String(++digest).padStart(64, '0'), JSON.stringify(entries)]))[0].id;
}
const publish = (batch, current = null, confirm = false) => rows('select public.publish_diamond_import($1,$2,$3)', [batch, current, confirm]);
const rank = (month = '2020-01-01') => rows("select * from public.homepage_diamond_ranking('month',$1)", [month]);
const report = (day = '2020-01-03') => rows('select * from public.diamond_monthly_report($1)', [day]);
const preview = batch => rows('select * from public.diamond_import_month_preview($1)', [batch]);
const person = (list, n) => list.find(row => row.idol_id === id(n));
const dateString = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;

try {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const file of readdirSync(resolve(root, 'migrations')).filter(f => f.endsWith('.sql') && f < '202609300017').sort()) {
    await db.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'));
  }
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'test'||n||'@example.com',now(),jsonb_build_object('full_name','Test '||n) from generate_series(1,8) n;
    update public.profiles set status='active';
    update public.profiles set role='admin' where id='${id(1)}';
    update public.profiles set role='operator' where id in ('${id(2)}','${id(3)}');
    update public.profiles set status='pending' where id='${id(7)}';
    update public.profiles set status='suspended' where id='${id(8)}';`);
  await as(1, () => db.exec(`select public.admin_assign_idol('${id(4)}','${id(2)}'); select public.admin_assign_idol('${id(5)}','${id(3)}')`));
  await as(4, () => rows("select public.update_my_profile_with_tiktok('Alice','alice','','2000-01-01')"));
  await as(5, () => rows("select public.update_my_profile_with_tiktok('Bob','bob','','2000-01-01')"));

  let day1, day2, day3, correction;
  await as(1, async () => {
    const old = await stage('2019-12-31', [entry('alice', 999)]); await publish(old);
    day1 = await stage('2020-01-01', [entry('alice', 100), entry('bob', 200, 3)]); await publish(day1);
    day2 = await stage('2020-01-02', [entry('alice', 150), entry('bob', 50, 3)]); await publish(day2);
  });
  await ok('Migration upgrades existing daily data without deleting it', async () => {
    await db.exec(readFileSync(update, 'utf8'));
    assert.equal((await rows('select * from public.daily_metrics')).length, 5);
    assert.equal((await rows('select ranking_period from public.company_settings'))[0].ranking_period, 'month');
  });
  await ok('Admin sees monthly sum and tied company ranks', () => as(1, async () => {
    const data = await rank(); assert.equal(data.length, 2);
    assert.ok(data.every(r => r.diamonds_total === '250' && r.company_diamonds_total === '500' && Number(r.rank_position) === 1));
    assert.equal(dateString(data[0].data_through), '2020-01-02');
  }));
  await ok('Operator sees company ranking amounts but raw metrics remain team-scoped', () => as(2, async () => {
    assert.equal((await rank()).length, 2);
    assert.equal(person(await rank(), 5).diamonds_total, '250');
    const raw = await rows('select distinct platform_account_id from public.daily_metrics');
    assert.equal(raw.length, 1);
  }));
  await ok('Idol receives no personal or company totals in ranking payload', () => as(4, async () => {
    const data = await rank(); assert.equal(data.length, 2);
    assert.ok(data.every(r => r.diamonds_total === null && r.company_diamonds_total === null));
  }));
  await ok('Another Idol sees equal ranks with all amounts redacted', () => as(6, async () => {
    assert.deepEqual((await rank()).map(r => [Number(r.rank_position), r.diamonds_total, r.company_diamonds_total]), [[1, null, null], [1, null, null]]);
  }));
  await ok('Legacy ranking remains compatible and cannot leak totals', () => as(4, async () => {
    const data = await rows("select * from public.homepage_ranking('month','2020-01-01')");
    assert.equal(data.length, 2); assert.ok(!('diamonds_total' in data[0]));
  }));
  await ok('Personal report preserves own daily and cumulative amounts only', () => as(4, async () => {
    const data = await report('2020-01-02'); assert.equal(data.length, 1);
    assert.equal(data[0].day_diamonds, '150'); assert.equal(data[0].month_diamonds, '250');
  }));
  await ok('Operator report excludes other teams', () => as(2, async () => {
    const data = await report(); assert.equal(data.length, 1); assert.equal(data[0].idol_id, id(4));
  }));
  await ok('Missing day keeps earlier monthly amount and returns null instead of zero', () => as(1, async () => {
    const data = await report(); assert.ok(data.every(r => r.day_diamonds === null && r.month_diamonds === '250'));
  }));
  await ok('Report includes data only through selected day', () => as(4, async () => {
    assert.equal((await report('2020-01-01'))[0].month_diamonds, '100');
  }));
  await ok('Draft import changes neither report nor rank', () => as(1, async () => {
    day3 = await stage('2020-01-03', [entry('alice', 40), entry('bob', 15, 3)]);
    assert.equal((await rank())[0].company_diamonds_total, '500');
    assert.equal((await report())[0].month_diamonds, '250');
  }));
  await ok('Preview adds new day to existing month', () => as(1, async () => {
    const data = await preview(day3);
    assert.deepEqual(data.map(r => [r.month_before, r.month_after]), [['250', '290'], ['250', '265']]);
  }));
  await ok('Idol and Operator cannot call import preview', async () => {
    for (const actor of [2, 4]) await as(actor, () => rejected(() => preview(day3), /Admin required/));
  });
  await ok('New published day accumulates and keeps previous daily rows', () => as(1, async () => {
    await publish(day3); const data = await rank();
    assert.equal(person(data, 4).diamonds_total, '290'); assert.equal(person(data, 5).diamonds_total, '265');
    assert.equal(data[0].company_diamonds_total, '555');
    assert.equal((await rows("select * from public.daily_metrics where metric_date='2020-01-01'")).length, 2);
  }));
  await ok('Retry upload and publication cannot add the same day twice', () => as(1, async () => {
    const batch = await rows('select file_hash from public.import_batches where id=$1', [day3]);
    assert.equal(await stage('2020-01-03', [entry('alice', 40), entry('bob', 15, 3)], batch[0].file_hash), day3);
    await publish(day3); assert.equal((await rank())[0].company_diamonds_total, '555');
  }));
  await ok('Same-day replacement preview subtracts old day before adding new amount', () => as(1, async () => {
    correction = await stage('2020-01-02', [entry('alice', 300)]);
    assert.deepEqual((await preview(correction)).map(r => [r.month_before, r.month_after]), [['290', '440']]);
  }));
  await ok('Replacement confirmation and stale-day checks protect the totals', () => as(1, async () => {
    await rejected(() => publish(correction, day2), /REPLACE_CONFIRMATION_REQUIRED/);
    await rejected(() => publish(correction, day1, true), /STALE_DAY/);
    assert.equal((await rank())[0].company_diamonds_total, '555');
  }));
  await ok('Replacing a day updates month once and retains omitted Idols other days', () => as(1, async () => {
    await publish(correction, day2, true); const data = await rank();
    assert.equal(person(data, 4).diamonds_total, '440'); assert.equal(person(data, 5).diamonds_total, '215');
    assert.equal(data[0].company_diamonds_total, '655');
    assert.equal((await rows('select count(*)::int n from public.diamond_import_rows where batch_id=$1', [day2]))[0].n, 2);
  }));
  await ok('Revert subtracts exactly that day and updates ranking', () => as(1, async () => {
    await rows('select public.revert_diamond_import($1)', [day3]);
    assert.equal((await rank())[0].company_diamonds_total, '600');
  }));
  await ok('Republishing a snapshot restores the correct month total', () => as(1, async () => {
    await publish(day3); assert.equal((await rank())[0].company_diamonds_total, '655');
  }));
  await ok('Username change keeps historical amounts on the same Idol', async () => {
    await as(4, () => rows("select public.update_my_profile_with_tiktok('Alice','alice_new','','2000-01-01')"));
    await as(1, async () => {
      const next = await stage('2020-01-04', [entry('alice_new', 10)]); await publish(next);
      const alice = person(await rank(), 4); assert.equal(alice.username, 'alice_new'); assert.equal(alice.diamonds_total, '450');
    });
  });
  await ok('Unknown username preview is empty and publishing is blocked', () => as(1, async () => {
    const unknown = await stage('2020-01-05', [entry('not_linked', 1000)]);
    assert.equal((await preview(unknown))[0].month_after, null);
    await rejected(() => publish(unknown), /UNMATCHED_ROWS/);
    assert.equal((await rank())[0].company_diamonds_total, '665');
  }));
  await ok('New month starts fresh and previous month stays queryable', () => as(1, async () => {
    const feb = await stage('2020-02-01', [entry('alice_new', 12), entry('bob', 0, 3)]); await publish(feb);
    const data = await rank('2020-02-01'); assert.equal(data[0].company_diamonds_total, '12');
    assert.equal(person(data, 5).diamonds_total, '0'); assert.equal(Number(person(data, 5).rank_position), 2);
    assert.equal((await rank())[0].company_diamonds_total, '665');
    assert.equal((await rank('2019-12-01'))[0].diamonds_total, '999');
  }));
  await ok('Zero day is distinguishable from missing day', () => as(5, async () => {
    assert.equal((await report('2020-02-01'))[0].day_diamonds, '0');
    assert.equal((await report('2020-02-02'))[0].day_diamonds, null);
    assert.deepEqual(await report('2020-03-01'), []);
  }));
  await ok('Monthly and company sums preserve integers beyond JS safe range', () => as(1, async () => {
    for (const day of ['2020-04-01', '2020-04-02']) {
      const large = await stage(day, [entry('alice_new', Number.MAX_SAFE_INTEGER)]); await publish(large);
    }
    assert.equal((await rank('2020-04-01'))[0].diamonds_total, '18014398509481982');
    assert.equal((await report('2020-04-02'))[0].month_diamonds, '18014398509481982');
  }));
  await ok('Default period is current Vietnam month', () => as(1, async () => {
    const today = dateString((await rows("select (now() at time zone 'Asia/Ho_Chi_Minh')::date d"))[0].d);
    const live = await stage(today, [entry('alice_new', 7)]); await publish(live);
    const data = await rows('select * from public.homepage_diamond_ranking()');
    assert.equal(data[0].diamonds_total, '7'); assert.equal(dateString(data[0].period_start), `${today.slice(0, 7)}-01`);
  }));
  await ok('Pending and suspended users cannot read new RPCs', async () => {
    for (const actor of [7, 8]) await as(actor, async () => {
      await rejected(() => rank(), /Active account required/);
      await rejected(() => report(), /Active account required/);
    });
  });
  await ok('Anonymous cannot execute new RPCs', async () => {
    await db.exec('set role anon');
    try { for (const sql of ['select public.homepage_diamond_ranking()', 'select public.diamond_monthly_report()', `select public.diamond_import_month_preview('${day1}')`]) await rejected(() => rows(sql), /permission denied/); }
    finally { await db.exec('reset role'); }
  });
  await ok('Role demotion immediately redacts ranking amounts', async () => {
    await db.exec(`update public.profiles set role='idol' where id='${id(3)}'`);
    await as(3, async () => assert.ok((await rank()).every(r => r.diamonds_total === null && r.company_diamonds_total === null)));
  });
  await ok('Team transfer moves report access without changing company ranking', async () => {
    await as(1, () => db.exec(`select public.admin_assign_idol('${id(5)}','${id(2)}')`));
    await as(2, async () => { assert.equal((await report()).length, 2); assert.equal((await rank())[0].company_diamonds_total, '665'); });
  });
  await ok('Suspending an Idol removes them from active leaderboard without deleting history', async () => {
    await db.exec(`update public.profiles set status='suspended' where id='${id(5)}'`);
    await as(1, async () => { assert.equal((await rank()).length, 1); assert.equal((await rank())[0].company_diamonds_total, '450'); assert.equal((await report()).length, 2); });
  });
  await ok('Database aggregation includes more than 1000 daily rows in a month', async () => {
    await db.exec(`insert into auth.users(id,email,email_confirmed_at) select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'bulk'||n||'@example.com',now() from generate_series(100,139) n;
      update public.profiles set status='active' where id>='${id(100)}';
      insert into public.platform_accounts(idol_id,platform,external_id,username) select id,'TikTok','local:'||id,'bulk_'||right(id::text,3) from public.profiles where id>='${id(100)}';
      insert into public.import_batches(data_date,file_path,file_hash,uploaded_by,status) select d::date,'bulk.xlsx',md5(d::text),'${id(1)}','published' from generate_series('2021-01-01'::date,'2021-01-31'::date,'1 day') d;
      insert into public.daily_metrics(platform_account_id,metric_date,import_batch_id,diamonds) select a.id,b.data_date,b.id,1 from public.platform_accounts a cross join public.import_batches b where a.idol_id>='${id(100)}' and b.data_date between '2021-01-01' and '2021-01-31';`);
    await as(1, async () => {
      const data = await rank('2021-01-01'); assert.equal(data.length, 40);
      assert.ok(data.every(r => r.diamonds_total === '31' && r.company_diamonds_total === '1240'));
    });
  });
  console.log(`${passed} monthly diamond SQL checks passed`);
} catch (error) {
  console.error('FAILED', error.message, error.detail ?? '', error.where ?? ''); process.exitCode = 1;
} finally { await db.close(); }
