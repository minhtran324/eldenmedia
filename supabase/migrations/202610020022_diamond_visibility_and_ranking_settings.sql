begin;

-- ==============================================================================
-- Migration: 202610020022_diamond_visibility_and_ranking_settings.sql
-- Goal: 
-- 1. Add operator_can_view_diamonds and idol_can_view_diamonds to company_settings
-- 2. Add admin_set_diamond_visibility function for Admin to toggle permissions
-- 3. Update homepage_diamond_ranking to strictly respect visibility settings
--    and ensure company_diamonds_total is only accessible by Admin
-- ==============================================================================

-- 1. Add visibility configuration columns to company_settings
alter table public.company_settings
  add column if not exists operator_can_view_diamonds boolean not null default true,
  add column if not exists idol_can_view_diamonds boolean not null default false;

-- 2. Function for Admin to toggle visibility settings
create or replace function public.admin_set_diamond_visibility(
  operator_view boolean,
  idol_view boolean
) returns void
language plpgsql security definer set search_path='' as $$
begin
  if private.current_role() is distinct from 'admin'::public.app_role then
    raise exception 'Admin required' using errcode='42501';
  end if;
  update public.company_settings
  set operator_can_view_diamonds = operator_view,
      idol_can_view_diamonds = idol_view,
      updated_at = clock_timestamp()
  where id;
end; $$;

-- 3. Update homepage_diamond_ranking to respect visibility flags
-- - company_diamonds_total is ONLY returned for viewer = 'admin'
-- - diamonds_total is returned for:
--     * admin (always)
--     * operator (if operator_can_view_diamonds = true)
--     * idol (if idol_can_view_diamonds = true)
create or replace function public.homepage_diamond_ranking(period_kind text default null, period_date date default null)
returns table(
  rank_position bigint, idol_id uuid, display_name text, username text, avatar_path text,
  period_start date, period_end date, data_through date,
  diamonds_total text, company_diamonds_total text
)
language plpgsql stable security definer set search_path='' as $$
declare
  viewer public.app_role := private.current_role();
  k text;
  d date := coalesce(period_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  first_day date;
  last_day date;
  op_can_view boolean;
  idol_can_view boolean;
  can_view boolean := false;
begin
  if viewer is null then raise exception 'Active account required' using errcode='42501'; end if;

  select coalesce(period_kind, s.ranking_period),
         s.operator_can_view_diamonds,
         s.idol_can_view_diamonds
  into k, op_can_view, idol_can_view
  from public.company_settings s
  where s.id;

  if viewer = 'admin' then
    can_view := true;
  elsif viewer = 'operator' and coalesce(op_can_view, true) then
    can_view := true;
  elsif viewer = 'idol' and coalesce(idol_can_view, false) then
    can_view := true;
  end if;

  case k
    when 'day' then first_day := d; last_day := d;
    when 'week' then first_day := date_trunc('week', d::timestamp)::date; last_day := first_day + 6;
    when 'month' then first_day := date_trunc('month', d::timestamp)::date; last_day := (first_day + interval '1 month - 1 day')::date;
    else raise exception 'Ranking period must be day, week or month';
  end case;

  return query with totals as (
    select a.idol_id, sum(m.diamonds) as amount
    from public.daily_metrics m
    join public.import_batches b on b.id = m.import_batch_id and b.status = 'published' and b.data_date = m.metric_date
    join public.platform_accounts a on a.id = m.platform_account_id
    join public.profiles p on p.id = a.idol_id and p.status = 'active' and p.role = 'idol'
    where m.metric_date between first_day and last_day and m.diamonds is not null
    group by a.idol_id
  ), freshness as (
    select max(b.data_date) as through_date from public.import_batches b
    where b.status = 'published' and b.data_date between first_day and last_day
  )
  select dense_rank() over(order by t.amount desc), p.id,
    coalesce(nullif(a.username, ''), nullif(p.full_name, ''), 'Idol'), a.username, p.avatar_path,
    first_day, last_day, f.through_date,
    case when can_view then t.amount::text else null::text end,
    case when viewer = 'admin' then (sum(t.amount) over())::text else null::text end
  from totals t join public.profiles p on p.id = t.idol_id
  join public.platform_accounts a on a.idol_id = p.id cross join freshness f
  order by 1, 3, p.id;
end; $$;

revoke all on function public.admin_set_diamond_visibility(boolean, boolean) from public, anon;
grant execute on function public.admin_set_diamond_visibility(boolean, boolean) to authenticated;

revoke all on function public.homepage_diamond_ranking(text, date) from public, anon;
grant execute on function public.homepage_diamond_ranking(text, date) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('application','elden-media','schema_version','202610020022')
$$;

insert into private.app_schema_migrations(version) values('202610020022')
on conflict (version) do nothing;

commit;
