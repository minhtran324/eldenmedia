-- Apply after 001. Preserves existing rows. Conflicting legacy data aborts the transaction.
begin;
create schema if not exists private;
revoke all on schema private from public;

alter table public.profiles
  add column nickname text,
  add column phone text,
  add column birth_date date,
  add column joined_on date,
  add column avatar_path text,
  add column left_on date,
  add constraint employment_dates_valid check (left_on is null or joined_on is null or left_on >= joined_on);

create table public.company_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'Asia/Ho_Chi_Minh' check (timezone = 'Asia/Ho_Chi_Minh'),
  opening_hour smallint not null default 9 check (opening_hour between 0 and 23),
  closing_hour smallint not null default 24 check (closing_hour between 1 and 24),
  photo_retention_days integer not null default 30 check (photo_retention_days = 30),
  updated_at timestamptz not null default now(),
  check (closing_hour > opening_hour)
);
insert into public.company_settings(id) values (true);
create table public.floors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 0
);
insert into public.floors(code,name,sort_order) values ('F1','Tầng 1',1),('F2','Tầng 2',2),('F3','Tầng 3',3);
alter table public.rooms
  add column floor_id uuid references public.floors(id),
  add column room_type text not null default 'regular' check (room_type in ('regular','studio')),
  add column qr_token uuid not null default gen_random_uuid() unique;
-- Existing rooms are deliberately NOT guessed into a floor. Populate floor_id before use.
alter table public.devices alter column assigned_room_id drop not null;
create unique index one_assigned_device_per_room on public.devices(assigned_room_id) where assigned_room_id is not null;
create unique index one_open_loan_per_idol on public.device_loans(idol_id) where returned_at is null;

alter table public.platform_accounts
  add column username text,
  add column nickname text,
  add column identity_valid_from timestamptz not null default now(),
  add constraint tiktok_only check (platform = 'TikTok'),
  add constraint one_tiktok_account_per_idol unique (idol_id);
create table public.tiktok_identity_history (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.platform_accounts(id),
  external_id text not null,
  username text,
  nickname text,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  changed_by uuid references public.profiles(id)
);
create function private.track_tiktok_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.idol_id <> old.idol_id then raise exception 'TikTok accounts cannot transfer between idols'; end if;
  if row(new.external_id,new.username,new.nickname) is distinct from row(old.external_id,old.username,old.nickname) then
    insert into public.tiktok_identity_history(account_id,external_id,username,nickname,valid_from,valid_until,changed_by)
    values(old.id,old.external_id,old.username,old.nickname,old.identity_valid_from,clock_timestamp(),auth.uid());
    new.identity_valid_from := clock_timestamp();
  else new.identity_valid_from := old.identity_valid_from;
  end if;
  return new;
end; $$;
create trigger preserve_tiktok_identity before update on public.platform_accounts
for each row execute function private.track_tiktok_identity();

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  idol_id uuid not null references public.profiles(id),
  work_date date not null,
  shift_count smallint not null check (shift_count in (1,2)),
  status text not null default 'draft' check (status in ('draft','submitted','approved','cancelled','completed')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idol_id,work_date),
  unique (id,idol_id)
);
alter table public.live_sessions add column daily_plan_id uuid,
  add constraint session_plan_idol_match foreign key(daily_plan_id,idol_id) references public.daily_plans(id,idol_id);
-- Legacy sessions can stay unlinked for review; all new writes must link a plan.
create function private.lock_and_check_session() returns trigger
language plpgsql set search_path = '' as $$
declare p public.daily_plans; s public.company_settings; local_start timestamp; local_end timestamp;
begin
  -- Serialize changes within a day. Lock old and new plans in deterministic order.
  if tg_op = 'DELETE' then
    perform 1 from public.daily_plans where id = old.daily_plan_id for update;
    return old;
  end if;
  if new.daily_plan_id is null then raise exception 'A daily plan is required'; end if;
  if tg_op = 'UPDATE' then
    perform 1 from public.daily_plans where id in (old.daily_plan_id,new.daily_plan_id) order by id for update;
  else perform 1 from public.daily_plans where id = new.daily_plan_id for update;
  end if;
  select * into strict p from public.daily_plans where id = new.daily_plan_id;
  select * into strict s from public.company_settings where id;
  local_start := new.starts_at at time zone s.timezone;
  local_end := new.ends_at at time zone s.timezone;
  if local_start <> date_trunc('hour',local_start) or local_end <> date_trunc('hour',local_end)
    or new.ends_at-new.starts_at < interval '1 hour' or new.ends_at-new.starts_at > interval '5 hours'
    or local_start < p.work_date + make_interval(hours => s.opening_hour)
    or local_end > p.work_date + make_interval(hours => s.closing_hour)
  then raise exception 'Session must use whole hours, last 1-5 hours and fit the working day'; end if;
  return new;
end; $$;
create trigger validate_session before insert or update or delete on public.live_sessions
for each row execute function private.lock_and_check_session();
alter table public.live_sessions add constraint non_overlapping_day_shifts
exclude using gist (daily_plan_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
where (status <> 'cancelled') deferrable initially deferred;

create function private.validate_daily_plan(plan_id uuid) returns void
language plpgsql set search_path = '' as $$
declare p public.daily_plans; n integer; total interval;
begin
  select * into p from public.daily_plans where id=plan_id;
  if not found or p.status='draft' then return; end if;
  select count(*),coalesce(sum(ends_at-starts_at),interval '0') into n,total
  from public.live_sessions where daily_plan_id=plan_id and status <> 'cancelled';
  if p.status='cancelled' then
    if n<>0 then raise exception 'Cancel all sessions when cancelling a day'; end if;
    return;
  end if;
  if n<>p.shift_count or total<>interval '5 hours' then
    raise exception 'A submitted working day requires the selected 1 or 2 shifts totaling exactly 5 hours';
  end if;
end; $$;
create function private.validate_day_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name='daily_plans' then
    if tg_op<>'DELETE' then perform private.validate_daily_plan(new.id); end if;
  else
    if tg_op<>'INSERT' then perform private.validate_daily_plan(old.daily_plan_id); end if;
    if tg_op<>'DELETE' then perform private.validate_daily_plan(new.daily_plan_id); end if;
  end if;
  return null;
end; $$;
create constraint trigger day_total_from_plan after insert or update on public.daily_plans
deferrable initially deferred for each row execute function private.validate_day_trigger();
create constraint trigger day_total_from_session after insert or update or delete on public.live_sessions
deferrable initially deferred for each row execute function private.validate_day_trigger();
create function private.protect_plan_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if row(new.idol_id,new.work_date) is distinct from row(old.idol_id,old.work_date)
    and exists(select 1 from public.live_sessions where daily_plan_id=old.id)
  then raise exception 'Create a new plan to change its idol or date'; end if;
  return new;
end; $$;
create trigger protect_plan_identity before update on public.daily_plans for each row execute function private.protect_plan_identity();

alter table public.room_segments add constraint non_overlapping_segments_per_session
exclude using gist(session_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
where(status<>'cancelled') deferrable initially deferred;
create function private.validate_session_rooms(target_id uuid) returns void language plpgsql set search_path='' as $$
declare s public.live_sessions; coverage interval;
begin
  select * into s from public.live_sessions where id=target_id;
  if not found then return; end if;
  if exists(select 1 from public.room_segments where session_id=s.id and status<>'cancelled'
    and (starts_at<s.starts_at or ends_at>s.ends_at)) then raise exception 'Room segment is outside its live session'; end if;
  if s.status in ('approved','completed') then
    select coalesce(sum(ends_at-starts_at),interval '0') into coverage from public.room_segments
    where session_id=s.id and status in ('approved','completed');
    if coverage<>s.ends_at-s.starts_at then raise exception 'Confirmed session must have complete approved room coverage'; end if;
  end if;
end; $$;
create function private.validate_rooms_trigger() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='live_sessions' then
    if tg_op<>'DELETE' then perform private.validate_session_rooms(new.id); end if;
  else
    if tg_op<>'INSERT' then perform private.validate_session_rooms(old.session_id); end if;
    if tg_op<>'DELETE' then perform private.validate_session_rooms(new.session_id); end if;
  end if;
  return null;
end; $$;
create constraint trigger room_coverage_from_session after insert or update on public.live_sessions
deferrable initially deferred for each row execute function private.validate_rooms_trigger();
create constraint trigger room_coverage_from_segment after insert or update or delete on public.room_segments
deferrable initially deferred for each row execute function private.validate_rooms_trigger();
-- Completed history must continue occupying its original scheduled interval.
do $$ declare c record; begin
  for c in select conname,conrelid::regclass as tbl from pg_constraint
    where contype='x' and conrelid in ('public.live_sessions'::regclass,'public.room_segments'::regclass)
    and conname not in ('non_overlapping_day_shifts','non_overlapping_segments_per_session')
  loop execute format('alter table %s drop constraint %I',c.tbl,c.conname); end loop;
end; $$;
alter table public.live_sessions add constraint confirmed_idol_no_overlap
exclude using gist(idol_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
where(status in ('approved','completed','absent')) deferrable initially deferred;
alter table public.room_segments add constraint confirmed_room_no_overlap
exclude using gist(room_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
where(status in ('approved','completed')) deferrable initially deferred;

alter table public.requests add column subject_idol_id uuid references public.profiles(id),
  add column daily_plan_id uuid references public.daily_plans(id),
  add column valid_from timestamptz, add column valid_until timestamptz,
  add constraint request_window_valid check (valid_until is null or (valid_from is not null and valid_until>valid_from));
alter table public.requests drop constraint requests_kind_check;
alter table public.requests add constraint requests_kind_check check(kind in
 ('account_approval','schedule','schedule_change','schedule_cancel','room_borrow','device_borrow','device_return','incident','checkout_correction'));
create function private.reject_checkout_correction() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='checkout_corrections' then raise exception 'Checkout corrections are no longer supported'; end if;
  if new.kind='checkout_correction' then raise exception 'Checkout corrections are no longer supported'; end if;
  return new;
end; $$;
create trigger no_new_checkout_correction before insert or update on public.checkout_corrections
for each row execute function private.reject_checkout_correction();
create trigger no_correction_request before insert or update on public.requests
for each row execute function private.reject_checkout_correction();
alter table public.requests add column device_loan_id uuid references public.device_loans(id);

alter table public.room_visits
  add column room_id uuid references public.rooms(id),
  add column scheduled_start_snapshot timestamptz,
  add column scheduled_end_snapshot timestamptz,
  add column checkin_confirmed_at timestamptz,
  add column checkout_reason text,
  add column checkin_note text,
  add column photos_deleted_at timestamptz;
update public.room_visits v set room_id=s.room_id,scheduled_start_snapshot=s.starts_at,scheduled_end_snapshot=s.ends_at,
  checkin_confirmed_at=v.checked_in_at from public.room_segments s where s.id=v.segment_id;
alter table public.room_visits alter column room_id set not null,
  alter column scheduled_start_snapshot set not null, alter column scheduled_end_snapshot set not null,
  add column late_seconds integer generated always as
    (greatest(0,ceil(extract(epoch from (checked_in_at-scheduled_start_snapshot)))::integer)) stored;
create unique index one_open_room_visit on public.room_visits(room_id) where checked_out_at is null;
create unique index one_open_visit_per_idol on public.room_visits(idol_id) where checked_out_at is null;
create function private.guard_room_visit() returns trigger language plpgsql set search_path='' as $$
declare segment public.room_segments; owner_id uuid;
begin
  if tg_op='INSERT' then
    select * into strict segment from public.room_segments where id=new.segment_id;
    select idol_id into owner_id from public.live_sessions where id=segment.session_id;
    if new.idol_id<>owner_id or segment.status<>'approved' then raise exception 'Visit must match idol and approved room segment'; end if;
    new.room_id:=segment.room_id;
    new.scheduled_start_snapshot:=segment.starts_at;
    new.scheduled_end_snapshot:=segment.ends_at;
    new.checkin_confirmed_at:=clock_timestamp();
  else
    if row(new.segment_id,new.idol_id,new.room_id,new.checked_in_at,new.scheduled_start_snapshot,new.scheduled_end_snapshot,new.checkin_confirmed_at)
      is distinct from row(old.segment_id,old.idol_id,old.room_id,old.checked_in_at,old.scheduled_start_snapshot,old.scheduled_end_snapshot,old.checkin_confirmed_at)
    then raise exception 'Attendance timestamps and schedule snapshots cannot be rewritten'; end if;
    if old.checked_out_at is not null and new.checked_out_at is distinct from old.checked_out_at
    then raise exception 'Completed checkout cannot be rewritten'; end if;
  end if;
  if btrim(new.before_photo_path)='' then raise exception 'Check-in photo required'; end if;
  if new.checked_out_at is not null then
    if new.after_photo_path is null or btrim(new.after_photo_path)='' then raise exception 'Checkout photo required'; end if;
    if new.checked_out_at<>new.scheduled_end_snapshot and nullif(btrim(new.checkout_reason),'') is null
    then raise exception 'Early or late checkout requires a reason'; end if;
  end if;
  return new;
end; $$;
create trigger guard_room_visit before insert or update on public.room_visits for each row execute function private.guard_room_visit();
create table public.room_visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.room_visits(id),
  phase text not null check (phase in ('checkin','checkout')),
  storage_path text not null unique,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  deleted_at timestamptz
);
create index photos_pending_cleanup on public.room_visit_photos(expires_at) where deleted_at is null;
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  subject_idol_id uuid references public.profiles(id),
  request_id uuid references public.requests(id),
  event_type text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_inbox on public.notifications(recipient_id,created_at desc);

-- Audit captures changes, including old room/device mappings and schedule edits.
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; entity uuid;
begin
  if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
  if tg_table_name<>'company_settings' then entity:=(coalesce(after_row,before_row)->>'id')::uuid; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),tg_op,tg_table_name,entity,jsonb_build_object('before',before_row,'after',after_row));
  return null;
end; $$;
do $$ declare t text; begin
  foreach t in array array['profiles','idol_assignments','rooms','devices','live_sessions','room_segments','requests','device_loans','room_visits','platform_accounts','daily_plans','company_settings'] loop
    execute format('create trigger audit_mutation after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  end loop;
  foreach t in array array['company_settings','floors','tiktok_identity_history','daily_plans','room_visit_photos','notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
end; $$;
revoke all on all functions in schema private from public,anon,authenticated;
commit;
