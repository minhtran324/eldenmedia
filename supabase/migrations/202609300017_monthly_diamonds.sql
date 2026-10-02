begin;

-- Daily published snapshots remain the source of truth. Do not keep a mutable
-- running balance: replacement/revert of a day must also correct monthly totals.
update public.company_settings set ranking_period='month',updated_at=clock_timestamp() where id;

create function public.homepage_diamond_ranking(period_kind text default null, period_date date default null)
returns table(
  rank_position bigint, idol_id uuid, display_name text, username text, avatar_path text,
  period_start date, period_end date, data_through date,
  diamonds_total text, company_diamonds_total text
)
language plpgsql stable security definer set search_path='' as $$
declare
  viewer public.app_role:=private.current_role();
  k text;
  d date:=coalesce(period_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
  first_day date;
  last_day date;
begin
  if viewer is null then raise exception 'Active account required' using errcode='42501'; end if;
  select coalesce(period_kind,s.ranking_period) into k from public.company_settings s where s.id;
  case k
    when 'day' then first_day:=d; last_day:=d;
    when 'week' then first_day:=date_trunc('week',d::timestamp)::date; last_day:=first_day+6;
    when 'month' then first_day:=date_trunc('month',d::timestamp)::date; last_day:=(first_day+interval '1 month - 1 day')::date;
    else raise exception 'Ranking period must be day, week or month';
  end case;

  -- All roles receive the same company ranking. Amounts leave the database only
  -- for active managers; there is no caller-controlled role/visibility parameter.
  -- Text preserves exact SUM(bigint) values through JSON and JavaScript.
  return query with totals as (
    select a.idol_id,sum(m.diamonds) as amount
    from public.daily_metrics m
    join public.import_batches b on b.id=m.import_batch_id and b.status='published' and b.data_date=m.metric_date
    join public.platform_accounts a on a.id=m.platform_account_id
    join public.profiles p on p.id=a.idol_id and p.status='active' and p.role='idol'
    where m.metric_date between first_day and last_day and m.diamonds is not null
    group by a.idol_id
  ), freshness as (
    select max(b.data_date) as through_date from public.import_batches b
    where b.status='published' and b.data_date between first_day and last_day
  )
  select dense_rank() over(order by t.amount desc),p.id,
    coalesce(nullif(a.username,''),nullif(p.full_name,''),'Idol'),a.username,p.avatar_path,
    first_day,last_day,f.through_date,
    case when viewer in ('admin','operator') then t.amount::text else null::text end,
    case when viewer in ('admin','operator') then (sum(t.amount) over())::text else null::text end
  from totals t join public.profiles p on p.id=t.idol_id
  join public.platform_accounts a on a.idol_id=p.id cross join freshness f
  order by 1,3,p.id;
end; $$;

-- Personal/team report: cumulative month through the selected reporting day.
-- Keep the existing right to see one's own metrics; this is separate from the
-- company leaderboard, where an Idol receives ranks only.
create function public.diamond_monthly_report(report_date date default null)
returns table(
  platform_account_id uuid,idol_id uuid,display_name text,username text,
  day_diamonds text,month_diamonds text,data_through date,recorded_days bigint
)
language plpgsql stable security definer set search_path='' as $$
declare d date:=coalesce(report_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date);
begin
  if private.current_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
  return query
  select a.id,a.idol_id,p.full_name,a.username,
    (sum(m.diamonds) filter(where m.metric_date=d))::text,
    sum(m.diamonds)::text,max(m.metric_date),count(*)
  from public.daily_metrics m
  join public.import_batches b on b.id=m.import_batch_id and b.status='published' and b.data_date=m.metric_date
  join public.platform_accounts a on a.id=m.platform_account_id
  join public.profiles p on p.id=a.idol_id
  where m.metric_date between date_trunc('month',d::timestamp)::date and d
    and m.diamonds is not null and private.can_read_idol(a.idol_id)
  group by a.id,a.idol_id,p.full_name,a.username
  order by sum(m.diamonds) desc,p.full_name,a.id;
end; $$;

-- Preview each matched Idol's month total after replacing the selected day.
-- Never adds both the previous and replacement snapshots for that same day.
create function public.diamond_import_month_preview(batch uuid)
returns table(row_number integer,month_before text,month_after text)
language plpgsql stable security definer set search_path='' as $$
declare b public.import_batches;
begin
  if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
  select * into b from public.import_batches where id=batch;
  if b.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  return query with totals as (
    select m.platform_account_id,sum(m.diamonds) as total,
      coalesce(sum(m.diamonds) filter(where m.metric_date<>b.data_date),0) as other_days
    from public.daily_metrics m
    join public.import_batches published on published.id=m.import_batch_id and published.status='published' and published.data_date=m.metric_date
    where m.metric_date between date_trunc('month',b.data_date::timestamp)::date
      and (date_trunc('month',b.data_date::timestamp)+interval '1 month - 1 day')::date
      and m.diamonds is not null
    group by m.platform_account_id
  )
  select r.row_number,
    case when a.id is not null and p.id is not null then coalesce(t.total,0)::text else null::text end,
    case when a.id is not null and p.id is not null then (coalesce(t.other_days,0)+r.diamonds)::text else null::text end
  from public.diamond_import_rows r
  left join public.platform_accounts a on a.id=r.account_id and lower(btrim(a.username))=r.username
  left join public.profiles p on p.id=a.idol_id and p.role='idol' and p.status='active'
  left join totals t on t.platform_account_id=a.id
  where r.batch_id=batch order by r.row_number;
end; $$;

revoke all on function public.homepage_diamond_ranking(text,date),public.diamond_monthly_report(date),public.diamond_import_month_preview(uuid) from public,anon;
grant execute on function public.homepage_diamond_ranking(text,date),public.diamond_monthly_report(date),public.diamond_import_month_preview(uuid) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('application','elden-media','schema_version','202609300017')
$$;
insert into private.app_schema_migrations(version) values('202609300017');
commit;
