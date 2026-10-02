-- Homepage for ACTIVE authenticated members. Apply after 001, 002, 003.
begin;
create table if not exists private.app_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
revoke all on private.app_schema_migrations from public,anon,authenticated;

alter table public.company_settings
  add column ranking_period text not null default 'month' check (ranking_period in ('day','week','month')),
  add column birthday_reminder_scope text not null default 'company' check (birthday_reminder_scope in ('team','company'));
alter table public.profiles add column birthday_visible boolean not null default true;
-- NULL means no verified diamond figure; don't assume missing Excel data is zero.
alter table public.daily_metrics add column diamonds bigint check (diamonds>=0);
create index published_metrics_date on public.daily_metrics(metric_date);
alter table public.notifications add column dedupe_key text;
create unique index notifications_deduplicated on public.notifications(recipient_id,dedupe_key) where dedupe_key is not null;

create table public.homepage_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('poster','announcement','event')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '',
  image_path text,
  link_url text check (link_url is null or link_url ~ '^https://'),
  audience public.app_role[] not null default array['admin','operator','idol']::public.app_role[]
    check (cardinality(audience)>0 and array_position(audience,null) is null),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  publish_from timestamptz not null default now(),
  publish_until timestamptz,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  location text,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (publish_until is null or publish_until>publish_from),
  check (event_ends_at is null or (event_starts_at is not null and event_ends_at>=event_starts_at)),
  check (status<>'published' or kind<>'poster' or nullif(btrim(image_path),'') is not null),
  check (kind<>'event' or event_starts_at is not null)
);
create index homepage_publication on public.homepage_posts(status,publish_from,sort_order);
alter table public.homepage_posts enable row level security;
revoke all on public.homepage_posts from anon,authenticated;
grant select,insert,update,delete on public.homepage_posts to authenticated;
create policy homepage_read on public.homepage_posts for select to authenticated using(
  private.current_role()='admin' or
  (private.current_role()=any(audience) and status='published' and publish_from<=now()
   and (publish_until is null or publish_until>now()))
);
create policy homepage_admin_insert on public.homepage_posts for insert to authenticated with check(private.current_role()='admin');
create policy homepage_admin_update on public.homepage_posts for update to authenticated
using(private.current_role()='admin') with check(private.current_role()='admin');
create policy homepage_admin_delete on public.homepage_posts for delete to authenticated using(private.current_role()='admin');
create function private.stamp_homepage_post() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=clock_timestamp();
  else new.created_by:=old.created_by; new.created_at:=old.created_at; end if;
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
  return new;
end; $$;
create trigger stamp_homepage_post before insert or update on public.homepage_posts
for each row execute function private.stamp_homepage_post();
create trigger audit_mutation after insert or update or delete on public.homepage_posts
for each row execute function private.audit_change();

-- POSTER storage is private. Read only assets attached to a post this user may read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('homepage-media','homepage-media',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy homepage_media_read on storage.objects for select to authenticated using(
  bucket_id='homepage-media' and (private.current_role()='admin' or exists(
    select 1 from public.homepage_posts p where p.image_path=name and p.status='published'
      and p.publish_from<=now() and (p.publish_until is null or p.publish_until>now())
      and private.current_role()=any(p.audience)))
);
create policy homepage_media_insert on storage.objects for insert to authenticated
with check(bucket_id='homepage-media' and private.current_role()='admin');
create policy homepage_media_update on storage.objects for update to authenticated
using(bucket_id='homepage-media' and private.current_role()='admin')
with check(bucket_id='homepage-media' and private.current_role()='admin');
create policy homepage_media_delete on storage.objects for delete to authenticated
using(bucket_id='homepage-media' and private.current_role()='admin');

-- A minimal, intentionally public connection probe. No user data, keys or DB metadata.
create function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('application','elden-media','schema_version','202609290004')
$$;
revoke all on function public.app_connection_status() from public;
grant execute on function public.app_connection_status() to anon,authenticated;

create function public.homepage_ranking(period_kind text default null, period_date date default null)
returns table(rank_position bigint,idol_id uuid,display_name text,avatar_path text,period_start date,period_end date,data_through date)
language plpgsql stable security definer set search_path='' as $$
declare k text; d date:=coalesce(period_date,(now() at time zone 'Asia/Ho_Chi_Minh')::date); first_day date; last_day date;
begin
  if private.current_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
  select coalesce(period_kind,ranking_period) into k from public.company_settings where id;
  case k
    when 'day' then first_day:=d; last_day:=d;
    when 'week' then first_day:=date_trunc('week',d::timestamp)::date; last_day:=first_day+6;
    when 'month' then first_day:=date_trunc('month',d::timestamp)::date; last_day:=(first_day+interval '1 month - 1 day')::date;
    else raise exception 'Ranking period must be day, week or month';
  end case;
  -- SECURITY DEFINER is intentional: expose only rank/name/avatar, never totals or birth dates.
  return query with totals as (
    select a.idol_id,sum(m.diamonds) as diamond_total
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
  select dense_rank() over(order by t.diamond_total desc),p.id,
    coalesce(nullif(p.nickname,''),nullif(p.full_name,''),'Idol'),p.avatar_path,first_day,last_day,f.through_date
  from totals t join public.profiles p on p.id=t.idol_id cross join freshness f
  order by 1,3,p.id;
end; $$;

create function public.homepage_birthdays_today()
returns table(person_id uuid,display_name text,role public.app_role,avatar_path text)
language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
  return query select p.id,coalesce(nullif(p.nickname,''),nullif(p.full_name,''),'Thành viên'),p.role,p.avatar_path
  from public.profiles p where p.status='active' and p.role in ('idol','operator') and p.birthday_visible
    and to_char(p.birth_date,'MM-DD')=to_char(now() at time zone 'Asia/Ho_Chi_Minh','MM-DD')
  order by 2,p.id;
end; $$;

create function public.admin_set_homepage_options(ranking text, reminders text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
  update public.company_settings set ranking_period=ranking,birthday_reminder_scope=reminders,updated_at=clock_timestamp() where id;
end; $$;

-- Scheduler-only function. reference_date is provided for deterministic testing; cron uses default.
create function private.send_birthday_reminders(reference_date date default (now() at time zone 'Asia/Ho_Chi_Minh')::date)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if reference_date is null then raise exception 'Date required'; end if;
  with upcoming as (
    select p.id,p.role,coalesce(nullif(p.nickname,''),nullif(p.full_name,''),'Thành viên') as display_name
    from public.profiles p where p.status='active' and p.role in ('idol','operator') and p.birthday_visible
    and to_char(p.birth_date,'MM-DD')=to_char(reference_date+3,'MM-DD')
  ), recipients as (
    select distinct u.id as subject_id,u.display_name,r.id as recipient_id
    from upcoming u cross join public.profiles r cross join public.company_settings s
    where r.status='active' and (r.role='admin' or (r.role='operator' and (
      s.birthday_reminder_scope='company' or
      (u.role='idol' and exists(select 1 from public.idol_assignments a where a.idol_id=u.id and a.operator_id=r.id
        and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())))
    )))
  )
  insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body,dedupe_key)
  select recipient_id,subject_id,'birthday_reminder','Sinh nhật sau 3 ngày',
    display_name||' có sinh nhật ngày '||to_char(reference_date+3,'DD/MM')||'.',
    'birthday:'||subject_id::text||':'||(reference_date+3)::text
  from recipients
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end; $$;

-- Birthday messages are safe summaries; company scope explicitly allows them across teams.
drop policy notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(
  private.current_role()='admin' or (recipient_id=auth.uid() and private.current_role() is not null and (
    subject_idol_id is null or private.can_read_idol(subject_idol_id) or
    (event_type='birthday_reminder' and private.current_role()='operator' and exists(
      select 1 from public.company_settings where id and birthday_reminder_scope='company'))
  ))
);
create function public.mark_notification_read(notification_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if private.current_role() is null then raise exception 'Active account required' using errcode='42501'; end if;
  update public.notifications set read_at=coalesce(read_at,clock_timestamp()) where id=notification_id and recipient_id=auth.uid();
end; $$;
revoke all on function public.homepage_ranking(text,date),public.homepage_birthdays_today(),
 public.admin_set_homepage_options(text,text),public.mark_notification_read(uuid) from public,anon,authenticated;
grant execute on function public.homepage_ranking(text,date),public.homepage_birthdays_today(),
 public.admin_set_homepage_options(text,text),public.mark_notification_read(uuid) to authenticated;
revoke all on function private.send_birthday_reminders(date),private.stamp_homepage_post() from public,anon,authenticated;

-- Cron is enabled separately in Dashboard. If already enabled, install the named job now.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $job$select cron.schedule('elden-birthday-reminders','0 * * * *','select private.send_birthday_reminders();')$job$;
  else
    raise notice 'Enable pg_cron in Integrations, then run supabase/enable-birthday-cron.sql to activate reminders.';
  end if;
end; $$;
insert into private.app_schema_migrations(version) values
 ('202609290001'),('202609290002'),('202609290003'),('202609290004') on conflict do nothing;
commit;
