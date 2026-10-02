begin;

-- Completion is checked in the database as well as the application. Admin is
-- exempt so the bootstrap account can continue approving new team members.
create or replace function private.profile_ready(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select p.role='admin' or (
    length(btrim(p.full_name)) between 2 and 150
    and coalesce(p.phone ~ '^\+?[0-9 ()-]{8,20}$', false)
    and p.birth_date between date '1900-01-01' and (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and (p.role <> 'idol' or coalesce(p.nickname ~ '^[a-z0-9._]{1,100}$',false))
  ) from public.profiles p where p.id=target),false)
$$;
revoke all on function private.profile_ready(uuid) from public,anon,authenticated;

create or replace function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
  select p.role from public.profiles p where p.id=auth.uid()
    and p.status='active' and private.profile_ready(p.id)
$$;

-- Operational write RPCs share this actor guard. Checking only the account
-- status here would let a direct RPC bypass the completion screen.
create or replace function private.schedule_actor() returns public.profiles
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null or p.status<>'active' then raise exception 'ACTIVE_REQUIRED' using errcode='42501'; end if;
  if not private.profile_ready(p.id) then raise exception 'PROFILE_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20260929,6);
  return p;
end; $$;

-- Optional fields may be saved while approval is pending. Once approved, the
-- entire required profile must be saved together; it cannot be cleared later.
create or replace function public.update_my_profile_with_tiktok(
  display_name text, idol_username text, phone_number text, date_of_birth date
) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; a public.platform_accounts; normalized_username text;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null or p.status='suspended' then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  normalized_username:=nullif(lower(btrim(regexp_replace(coalesce(idol_username,''),'^@+',''))),'');
  if display_name is null or length(btrim(display_name)) not between 2 and 150
    or (normalized_username is not null and normalized_username !~ '^[a-z0-9._]{1,100}$')
    or (nullif(btrim(phone_number),'') is not null and btrim(phone_number) !~ '^\+?[0-9 ()-]{8,20}$')
    or (date_of_birth is not null and (date_of_birth<'1900-01-01' or date_of_birth>(now() at time zone 'Asia/Ho_Chi_Minh')::date))
  then raise exception 'INVALID_INPUT'; end if;
  if p.status='active' and p.role<>'admin' and (
    nullif(btrim(phone_number),'') is null or date_of_birth is null
    or (p.role='idol' and normalized_username is null)
  ) then raise exception 'PROFILE_REQUIRED'; end if;
  if p.role<>'idol' and normalized_username is not null then raise exception 'ROLE_NOT_ALLOWED' using errcode='42501'; end if;
  update public.profiles set full_name=btrim(display_name),
    nickname=case when p.role='idol' then normalized_username else null end,
    phone=nullif(btrim(phone_number),''),birth_date=date_of_birth where id=p.id;
  if p.role='idol' then
    select * into a from public.platform_accounts where idol_id=p.id for update;
    if a.id is null and normalized_username is not null then
      insert into public.platform_accounts(idol_id,platform,external_id,username)
      values(p.id,'TikTok','local:'||p.id::text,normalized_username);
    elsif a.id is not null then
      update public.platform_accounts set username=normalized_username where id=a.id;
    end if;
  end if;
end; $$;

-- Close the legacy profile update path, which previously bypassed TikTok sync.
create or replace function public.update_my_profile(display_name text, idol_nickname text, phone_number text, date_of_birth date)
returns void language sql security definer set search_path='' as $$
  select public.update_my_profile_with_tiktok(display_name,idol_nickname,phone_number,date_of_birth)
$$;

-- Flags control visibility OUTSIDE the normal scope. Self/team access stays.
create or replace function private.can_view_diamonds(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.can_read_idol(target) or exists(
    select 1 from public.company_settings s where s.id and (
      (private.current_role()='operator' and s.operator_can_view_diamonds)
      or (private.current_role()='idol' and s.idol_can_view_diamonds)
    )
  ),false)
$$;
revoke all on function private.can_view_diamonds(uuid) from public,anon,authenticated;

create or replace function public.admin_set_diamond_visibility(operator_view boolean,idol_view boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  if operator_view is null or idol_view is null then raise exception 'INVALID_INPUT'; end if;
  update public.company_settings set operator_can_view_diamonds=operator_view,
    idol_can_view_diamonds=idol_view,updated_at=clock_timestamp() where id;
  if not found then raise exception 'SETTINGS_UNAVAILABLE'; end if;
end; $$;

create or replace function public.latest_published_diamond_date() returns date
language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_role() is null then raise exception 'Active completed account required' using errcode='42501'; end if;
  return (select max(data_date) from public.import_batches where status='published');
end; $$;

-- Rank on full data BEFORE masking amounts. Search/team filtering in the UI
-- must retain these company ranks, including ties and missing daily data.
create function public.diamond_report_rows(report_date date default null)
returns table(platform_account_id uuid,idol_id uuid,display_name text,username text,
  day_diamonds text,month_diamonds text,data_through date,recorded_days bigint,
  month_rank bigint,day_rank bigint,operator_id uuid,operator_name text,is_my_team boolean)
language plpgsql stable security definer set search_path='' as $$
declare d date:=coalesce(report_date,public.latest_published_diamond_date(),(now() at time zone 'Asia/Ho_Chi_Minh')::date);
begin
  if private.current_role() is null then raise exception 'Active completed account required' using errcode='42501'; end if;
  return query with totals as (
    select a.id as account_id,a.idol_id as person_id,
      sum(m.diamonds) filter(where m.metric_date=d) as day_amount,
      sum(m.diamonds) as month_amount,max(m.metric_date) as through_date,
      count(distinct m.metric_date) as days
    from public.daily_metrics m
    join public.import_batches b on b.id=m.import_batch_id and b.status='published' and b.data_date=m.metric_date
    join public.platform_accounts a on a.id=m.platform_account_id
    join public.profiles p on p.id=a.idol_id and p.status='active' and p.role='idol'
    where m.metric_date between date_trunc('month',d::timestamp)::date and d and m.diamonds is not null
    group by a.id,a.idol_id
  ), ranked as (
    select t.*,dense_rank() over(order by t.month_amount desc) as mr,
      case when t.day_amount is not null then dense_rank() over(order by t.day_amount desc nulls last) end as dr
    from totals t
  )
  select t.account_id,p.id,coalesce(nullif(p.full_name,''),a.username,'Idol'),a.username,
    case when private.can_view_diamonds(p.id) then t.day_amount::text end,
    case when private.can_view_diamonds(p.id) then t.month_amount::text end,
    t.through_date,t.days,t.mr,t.dr,
    case when private.current_role() in ('admin','operator') then team.operator_id end,
    case when private.current_role() in ('admin','operator') then op.full_name end,
    coalesce(private.current_role()='operator' and team.operator_id=auth.uid(),false)
  from ranked t join public.profiles p on p.id=t.person_id
  join public.platform_accounts a on a.id=t.account_id
  left join lateral (
    select x.operator_id from public.idol_assignments x where x.idol_id=p.id
      and x.starts_at<=now() and (x.ends_at is null or x.ends_at>now())
    order by x.starts_at desc limit 1
  ) team on true
  left join public.profiles op on op.id=team.operator_id
  order by t.mr,a.username,p.id;
end; $$;

-- Existing RPC remains compatible, but no longer leaks all numeric amounts.
create or replace function public.diamond_monthly_report(report_date date default null)
returns table(platform_account_id uuid,idol_id uuid,display_name text,username text,
  day_diamonds text,month_diamonds text,data_through date,recorded_days bigint)
language sql stable security definer set search_path='' as $$
  select r.platform_account_id,r.idol_id,r.display_name,r.username,r.day_diamonds,
    r.month_diamonds,r.data_through,r.recorded_days from public.diamond_report_rows(report_date) r
$$;

create function public.diamond_team_totals(report_date date default null)
returns table(operator_id uuid,operator_name text,idol_count bigint,reported_idols bigint,day_diamonds text,month_diamonds text)
language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
  return query with report as (select * from public.diamond_report_rows(report_date)),
  roster as (
    select p.id,team.operator_id from public.profiles p
    left join lateral (select x.operator_id from public.idol_assignments x where x.idol_id=p.id
      and x.starts_at<=now() and (x.ends_at is null or x.ends_at>now()) order by x.starts_at desc limit 1) team on true
    where p.role='idol' and p.status='active'
  ), teams as (
    select p.id,p.full_name from public.profiles p where p.role='operator' and (p.status='active' or exists(select 1 from roster r where r.operator_id=p.id))
    union all select null::uuid,'Chưa phân công'::text
  )
  select t.id,t.full_name,count(r.id),count(d.idol_id),sum(d.day_diamonds::numeric)::text,
    sum(d.month_diamonds::numeric)::text
  from teams t left join roster r on r.operator_id is not distinct from t.id
  left join report d on d.idol_id=r.id
  group by t.id,t.full_name order by sum(d.month_diamonds::numeric) desc nulls last,t.full_name;
end; $$;

create or replace function public.homepage_diamond_ranking(period_kind text default null,period_date date default null)
returns table(rank_position bigint,idol_id uuid,display_name text,username text,avatar_path text,
  period_start date,period_end date,data_through date,diamonds_total text,company_diamonds_total text)
language plpgsql stable security definer set search_path='' as $$
declare viewer public.app_role:=private.current_role(); k text;
  d date:=coalesce(period_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date); first_day date; last_day date;
begin
  if viewer is null then raise exception 'Active completed account required' using errcode='42501'; end if;
  select coalesce(period_kind,s.ranking_period) into k from public.company_settings s where s.id;
  case k when 'day' then first_day:=d;last_day:=d;
    when 'week' then first_day:=date_trunc('week',d::timestamp)::date;last_day:=first_day+6;
    when 'month' then first_day:=date_trunc('month',d::timestamp)::date;last_day:=(first_day+interval '1 month - 1 day')::date;
    else raise exception 'Invalid ranking period'; end case;
  return query with totals as (
    select a.idol_id,sum(m.diamonds) amount from public.daily_metrics m
    join public.import_batches b on b.id=m.import_batch_id and b.status='published' and b.data_date=m.metric_date
    join public.platform_accounts a on a.id=m.platform_account_id
    join public.profiles p on p.id=a.idol_id and p.status='active' and p.role='idol'
    where m.metric_date between first_day and last_day and m.diamonds is not null group by a.idol_id
  ), freshness as (select max(b.data_date) through_date from public.import_batches b
    where b.status='published' and b.data_date between first_day and last_day)
  select dense_rank() over(order by t.amount desc),p.id,coalesce(nullif(a.username,''),p.full_name,'Idol'),a.username,p.avatar_path,
    first_day,last_day,f.through_date,case when private.can_view_diamonds(p.id) then t.amount::text end,
    case when viewer='admin' then (sum(t.amount) over())::text end
  from totals t join public.profiles p on p.id=t.idol_id join public.platform_accounts a on a.idol_id=p.id cross join freshness f
  order by 1,3,p.id;
end; $$;

-- Raw daily metrics retain the narrower own/team RLS. Expanding numeric report
-- access never expands access to personal profiles, phone numbers or schedules.
revoke all on function public.diamond_report_rows(date),public.diamond_team_totals(date) from public,anon;
grant execute on function public.diamond_report_rows(date),public.diamond_team_totals(date) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('application','elden-media','schema_version','202610020023')
$$;
insert into private.app_schema_migrations(version) values('202610020023') on conflict(version) do nothing;
commit;
