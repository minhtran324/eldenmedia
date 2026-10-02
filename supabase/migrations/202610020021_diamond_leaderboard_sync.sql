begin;

-- ==============================================================================
-- Migration: 202610020021_diamond_leaderboard_sync.sql
-- Goal: Ensure Diamond Ranking Poster (/reports) synchronizes with company ranking
-- and automatically falls back to the latest published date when no date is passed
-- or when the current date has no published data.
-- ==============================================================================

-- 1. Helper function: Get the latest date that has a published diamond import
create or replace function public.latest_published_diamond_date()
returns date
language sql stable security definer set search_path='' as $$
  select max(data_date) from public.import_batches where status = 'published';
$$;

-- 2. Updated diamond_monthly_report:
-- - Automatically detects latest published batch date if report_date is null
-- - Company ranking poster view: accessible to all active authenticated users
-- - Aggregates month cumulative diamonds and exact target day diamonds
create or replace function public.diamond_monthly_report(report_date date default null)
returns table(
  platform_account_id uuid,
  idol_id uuid,
  display_name text,
  username text,
  day_diamonds text,
  month_diamonds text,
  data_through date,
  recorded_days bigint
)
language plpgsql stable security definer set search_path='' as $$
declare
  viewer public.app_role := private.current_role();
  target_date date := report_date;
  latest_date date;
  first_day date;
begin
  if viewer is null then raise exception 'Active account required' using errcode='42501'; end if;

  -- Detect the latest published batch date
  select max(b.data_date) into latest_date
  from public.import_batches b
  where b.status = 'published';

  -- If target_date is not provided, use the latest published date (or today if none)
  if target_date is null then
    target_date := coalesce(latest_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  end if;

  first_day := date_trunc('month', target_date::timestamp)::date;

  return query
  select
    a.id as platform_account_id,
    a.idol_id,
    coalesce(nullif(p.full_name, ''), nullif(a.username, ''), 'Idol') as display_name,
    a.username,
    (sum(m.diamonds) filter(where m.metric_date = target_date))::text as day_diamonds,
    sum(m.diamonds)::text as month_diamonds,
    max(m.metric_date) as data_through,
    count(distinct m.metric_date)::bigint as recorded_days
  from public.daily_metrics m
  join public.import_batches b on b.id = m.import_batch_id and b.status = 'published' and b.data_date = m.metric_date
  join public.platform_accounts a on a.id = m.platform_account_id
  join public.profiles p on p.id = a.idol_id and p.status = 'active' and p.role = 'idol'
  where m.metric_date between first_day and target_date
    and m.diamonds is not null
  group by a.id, a.idol_id, p.full_name, a.username
  order by sum(m.diamonds) desc, p.full_name, a.id;
end; $$;

revoke all on function public.latest_published_diamond_date() from public, anon;
grant execute on function public.latest_published_diamond_date() to authenticated;

revoke all on function public.diamond_monthly_report(date) from public, anon;
grant execute on function public.diamond_monthly_report(date) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('application','elden-media','schema_version','202610020021')
$$;

insert into private.app_schema_migrations(version) values('202610020021')
on conflict (version) do nothing;

commit;
