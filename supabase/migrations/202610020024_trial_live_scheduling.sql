begin;

-- Trial participants are not Auth users and never enter payroll, attendance or
-- the five-hour daily-plan rules for contracted Idols.
create table public.trial_live_idols (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check(length(btrim(display_name)) between 2 and 100),
  name_key text generated always as (lower(regexp_replace(btrim(display_name),'\s+',' ','g'))) stored,
  operator_id uuid not null references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(operator_id,name_key)
);
create table public.trial_live_bookings (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.trial_live_idols(id),
  work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room_id uuid not null references public.rooms(id),
  status text not null check(status in ('pending','approved','rejected','cancelled')),
  revision integer not null default 1,
  approval_request_id uuid unique references public.requests(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  check(ends_at-starts_at=interval '2 hours'),
  check((starts_at at time zone 'Asia/Ho_Chi_Minh')::date=work_date),
  check(date_trunc('hour',starts_at)=starts_at)
);
create unique index trial_one_day on public.trial_live_bookings(trial_id,work_date) where status in ('pending','approved');
alter table public.trial_live_bookings add constraint trial_room_no_overlap exclude using gist
  (room_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(status='approved');
create index trial_days on public.trial_live_bookings(work_date,room_id);
alter table public.trial_live_idols enable row level security;
alter table public.trial_live_bookings enable row level security;
revoke all on public.trial_live_idols,public.trial_live_bookings from anon,authenticated;
grant select on public.trial_live_idols,public.trial_live_bookings to authenticated;
create policy trial_idols_read on public.trial_live_idols for select to authenticated using
  (private.current_role()='admin' or(private.current_role()='operator' and operator_id=auth.uid()));
create policy trial_bookings_read on public.trial_live_bookings for select to authenticated using
  (private.current_role()='admin' or(private.current_role()='operator' and exists
    (select 1 from public.trial_live_idols t where t.id=trial_id and t.operator_id=auth.uid())));
create trigger audit_mutation after insert or update or delete on public.trial_live_idols for each row execute function private.audit_change();
create trigger audit_mutation after insert or update or delete on public.trial_live_bookings for each row execute function private.audit_change();

-- Both kinds of reservations share the existing scheduling transaction lock.
-- These triggers protect final approval in both directions, including races.
create function private.guard_trial_booking() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.company_settings; room public.rooms; owner_id uuid; day_start timestamptz;
begin
  perform pg_advisory_xact_lock(20260929,6);
  if new.status not in ('pending','approved') then return new; end if;
  select * into strict cfg from public.company_settings where id;
  select * into room from public.rooms where id=new.room_id for update;
  select operator_id into owner_id from public.trial_live_idols where id=new.trial_id for update;
  if room.id is null or room.status<>'available' then raise exception 'ROOM_UNAVAILABLE'; end if;
  if not exists(select 1 from public.profiles where id=owner_id and role='operator' and status='active')
    or not exists(select 1 from public.profiles where id=room.manager_id and role='operator' and status='active') then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
  day_start:=new.work_date::timestamp at time zone 'Asia/Ho_Chi_Minh';
  if new.starts_at<day_start+make_interval(hours=>cfg.opening_hour) or new.ends_at>day_start+make_interval(hours=>cfg.closing_hour)
    or new.starts_at<=now() then raise exception 'INVALID_TRIAL_TIME'; end if;
  if (select count(*) from public.trial_live_bookings where trial_id=new.trial_id and id<>new.id and status in ('pending','approved'))>=5 then raise exception 'TRIAL_FIVE_DAYS_LIMIT'; end if;
  if exists(select 1 from public.room_segments g where g.room_id=new.room_id and g.status in ('approved','completed') and g.starts_at<new.ends_at and g.ends_at>new.starts_at)
    or exists(select 1 from public.trial_live_bookings b where b.id<>new.id and b.room_id=new.room_id and b.status='approved' and b.starts_at<new.ends_at and b.ends_at>new.starts_at)
    or exists(select 1 from public.room_visits v where v.room_id=new.room_id and v.checked_out_at is null and (v.scheduled_start_snapshot at time zone 'Asia/Ho_Chi_Minh')::date=new.work_date)
  then raise exception 'ROOM_CONFLICT'; end if;
  return new;
end; $$;
create trigger trial_booking_guard before insert or update on public.trial_live_bookings for each row execute function private.guard_trial_booking();
create function private.guard_regular_trial_conflict() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20260929,6);
  if new.status in ('approved','completed') and exists(select 1 from public.trial_live_bookings b where b.room_id=new.room_id and b.status='approved' and b.starts_at<new.ends_at and b.ends_at>new.starts_at) then raise exception 'ROOM_CONFLICT'; end if;
  return new;
end; $$;
create trigger regular_trial_conflict before insert or update of room_id,starts_at,ends_at,status on public.room_segments for each row execute function private.guard_regular_trial_conflict();
create function private.guard_trial_room_resource() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(20260929,6);
  if (new.manager_id is distinct from old.manager_id or new.status is distinct from old.status)
    and exists(select 1 from public.trial_live_bookings b where b.room_id=old.id and b.status in ('pending','approved') and b.ends_at>now()) then raise exception 'ROOM_IN_USE'; end if;
  return new;
end; $$;
create trigger trial_room_resource before update on public.rooms for each row execute function private.guard_trial_room_resource();

create function private.trial_notify(booking uuid,message text) returns void language sql security definer set search_path='' as $$
  insert into public.notifications(recipient_id,request_id,event_type,title,body,work_date)
  select p.id,b.approval_request_id,'schedule','Lịch test live',t.display_name||' · '||b.work_date||': '||message,b.work_date
  from public.trial_live_bookings b join public.trial_live_idols t on t.id=b.trial_id cross join public.profiles p
  where b.id=booking and p.status='active' and (p.role='admin' or p.id=t.operator_id)
$$;

create function public.register_trial_live(trainee_name text,days jsonb,trainee_id uuid default null,target_operator uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; op uuid; name text; t public.trial_live_idols; day_row jsonb; d date; h integer;
  room public.rooms; booking uuid; req uuid; seen date[]:='{}'; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; cfg public.company_settings;
begin
  actor:=private.schedule_actor();
  if actor.role not in ('admin','operator') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  op:=case when actor.role='operator' then actor.id else target_operator end;
  if actor.role='operator' and target_operator is not null and target_operator<>actor.id then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.profiles where id=op and role='operator' and status='active') then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
  if jsonb_typeof(days) is distinct from 'array' then raise exception 'INVALID_TRIAL_DAYS'; end if;
  if jsonb_array_length(days) not between 1 and 5 then raise exception 'INVALID_TRIAL_DAYS'; end if;
  name:=regexp_replace(btrim(coalesce(trainee_name,'')),'\s+',' ','g');
  if trainee_id is not null then
    select * into t from public.trial_live_idols where id=trainee_id and operator_id=op for update;
    if t.id is null then raise exception 'FORBIDDEN'; end if;
  else
    if length(name) not between 2 and 100 then raise exception 'TRIAL_NAME_REQUIRED'; end if;
    insert into public.trial_live_idols(display_name,operator_id,created_by) values(name,op,actor.id)
      on conflict(operator_id,name_key) do nothing;
    select * into strict t from public.trial_live_idols where operator_id=op and name_key=lower(name) for update;
  end if;
  if (select count(*) from public.trial_live_bookings where trial_id=t.id and status in ('pending','approved'))+jsonb_array_length(days)>5 then raise exception 'TRIAL_FIVE_DAYS_LIMIT'; end if;
  select * into strict cfg from public.company_settings where id;
  for day_row in select value from jsonb_array_elements(days) loop
    if coalesce(day_row->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(day_row->>'start_hour','') !~ '^\d{1,2}$' then raise exception 'INVALID_TRIAL_DAYS'; end if;
    d:=(day_row->>'date')::date; h:=(day_row->>'start_hour')::integer;
    if d<today or d>today+90 or d=any(seen) or h<cfg.opening_hour or h+2>cfg.closing_hour then raise exception 'INVALID_TRIAL_DAYS'; end if;
    seen:=array_append(seen,d);
    if exists(select 1 from public.trial_live_bookings where trial_id=t.id and work_date=d and status in ('pending','approved')) then raise exception 'TRIAL_DUPLICATE_DAY'; end if;
    select * into room from public.rooms where id=(day_row->>'room_id')::uuid;
    if room.id is null or room.status<>'available' then raise exception 'ROOM_UNAVAILABLE'; end if;
    booking:=gen_random_uuid(); req:=null;
    if room.manager_id<>op and actor.role<>'admin' then
      insert into public.requests(kind,submitted_by,assigned_reviewer_id,details)
      values('room_borrow',actor.id,room.manager_id,jsonb_build_object('trial_booking_id',booking,'trial_name',t.display_name,'room_id',room.id,'work_date',d,'hours',jsonb_build_array(h,h+1))) returning id into req;
    end if;
    insert into public.trial_live_bookings(id,trial_id,work_date,starts_at,ends_at,room_id,status,approval_request_id,created_by)
    values(booking,t.id,d,(d+make_interval(hours=>h)) at time zone 'Asia/Ho_Chi_Minh',(d+make_interval(hours=>h+2)) at time zone 'Asia/Ho_Chi_Minh',room.id,case when req is null then 'approved' else 'pending' end,req,actor.id);
    if req is not null then
      insert into public.notifications(recipient_id,request_id,event_type,title,body,work_date)
      values(room.manager_id,req,'room_borrow','Mượn phòng test live',t.display_name||' · '||d||' · '||h||':00–'||(h+2)||':00 · '||room.code,d);
    end if;
    perform private.trial_notify(booking,case when req is null then 'Đã xếp phòng '||room.code||' ('||h||':00–'||(h+2)||':00).' else 'Chờ chủ phòng '||room.code||' duyệt; chưa giữ chỗ.' end);
  end loop;
  return t.id;
end; $$;

create function private.review_trial_borrow(request_id uuid,expected_revision integer,approve boolean,reason text) returns text
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; b public.trial_live_bookings; owner_id uuid;
begin
  actor:=private.schedule_actor();
  select * into r from public.requests where id=request_id for update;
  select * into b from public.trial_live_bookings where approval_request_id=r.id for update;
  if b.id is null or b.status<>'pending' or r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
  select manager_id into owner_id from public.rooms where id=b.room_id;
  if not (actor.role='admin' or(actor.role='operator' and actor.id=owner_id and actor.id=r.assigned_reviewer_id)) then raise exception 'FORBIDDEN'; end if;
  if approve is null or length(coalesce(reason,''))>500 then raise exception 'INVALID_INPUT'; end if;
  if not approve and length(btrim(coalesce(reason,'')))=0 then raise exception 'REASON_REQUIRED'; end if;
  update public.trial_live_bookings set status=case when approve then 'approved' else 'rejected' end,revision=revision+1 where id=b.id;
  update public.requests set status=case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
    revision=revision+1,decided_by=actor.id,decided_at=now(),decision_reason=btrim(coalesce(reason,'')) where id=r.id;
  perform private.trial_notify(b.id,case when approve then 'Chủ phòng đã duyệt lịch test.' else 'Chủ phòng từ chối: '||reason end);
  return case when approve then 'approved' else 'rejected' end;
end; $$;

create function public.cancel_trial_live(booking_id uuid,expected_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; b public.trial_live_bookings; owner_id uuid;
begin
  actor:=private.schedule_actor();
  select * into b from public.trial_live_bookings where id=booking_id for update;
  select operator_id into owner_id from public.trial_live_idols where id=b.trial_id;
  if b.id is null or not (actor.role='admin' or(actor.role='operator' and actor.id=owner_id)) then raise exception 'FORBIDDEN'; end if;
  if b.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
  if b.status not in ('pending','approved') then raise exception 'REQUEST_NOT_PENDING'; end if;
  if b.status='approved' and b.starts_at<=now() then raise exception 'TRIAL_ALREADY_STARTED'; end if;
  update public.trial_live_bookings set status='cancelled',revision=revision+1,cancelled_by=actor.id,cancelled_at=now() where id=b.id;
  update public.requests set status='cancelled',revision=revision+1,decided_by=actor.id,decided_at=now() where id=b.approval_request_id;
  perform private.trial_notify(b.id,'Đã hủy lịch test, phòng được giải phóng.');
end; $$;

create function public.trial_live_roster() returns table(id uuid,display_name text,operator_id uuid,used_days bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_role() is null or private.current_role() not in ('admin','operator') then raise exception 'FORBIDDEN'; end if;
  return query select t.id,t.display_name,t.operator_id,count(b.id) from public.trial_live_idols t
    left join public.trial_live_bookings b on b.trial_id=t.id and b.status in ('pending','approved')
    where private.current_role()='admin' or t.operator_id=auth.uid()
    group by t.id order by t.created_at desc;
end; $$;
create function public.trial_live_calendar(first_day date,last_day date)
returns table(id uuid,trial_id uuid,display_name text,operator_id uuid,work_date date,start_hour integer,end_hour integer,room_id uuid,room_code text,status text,revision integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if private.current_role() is null or private.current_role() not in ('admin','operator') then raise exception 'FORBIDDEN'; end if;
  if first_day is null or last_day is null or last_day<first_day or last_day-first_day>366 then raise exception 'INVALID_INPUT'; end if;
  return query select b.id,b.trial_id,t.display_name,t.operator_id,b.work_date,
    extract(hour from b.starts_at at time zone 'Asia/Ho_Chi_Minh')::integer,
    extract(hour from b.starts_at at time zone 'Asia/Ho_Chi_Minh')::integer+2,
    b.room_id,r.code,b.status,b.revision
    from public.trial_live_bookings b join public.trial_live_idols t on t.id=b.trial_id join public.rooms r on r.id=b.room_id
    where b.work_date between first_day and last_day and (private.current_role()='admin' or t.operator_id=auth.uid() or r.manager_id=auth.uid())
    order by b.work_date,b.starts_at,t.display_name;
end; $$;

revoke all on function private.guard_trial_booking(),private.guard_regular_trial_conflict(),private.guard_trial_room_resource(),private.trial_notify(uuid,text),private.review_trial_borrow(uuid,integer,boolean,text) from public,anon,authenticated;
revoke all on function public.register_trial_live(text,jsonb,uuid,uuid),public.cancel_trial_live(uuid,integer),public.trial_live_roster(),public.trial_live_calendar(date,date) from public,anon,authenticated;
grant execute on function public.register_trial_live(text,jsonb,uuid,uuid),public.cancel_trial_live(uuid,integer),public.trial_live_roster(),public.trial_live_calendar(date,date) to authenticated;

create or replace function public.review_schedule(request_id uuid, expected_revision integer, approve boolean, reason text default '') returns text
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; parent public.requests; owner uuid;
begin
 actor:=private.schedule_actor();
 select * into r from public.requests where id=request_id for update;
 if exists(select 1 from public.trial_live_bookings where approval_request_id=r.id) then
   return private.review_trial_borrow(request_id,expected_revision,approve,reason);
 end if;
 if r.id is null or r.status<>'pending' or r.kind not in ('schedule','schedule_change','schedule_cancel','room_borrow') then raise exception 'REQUEST_NOT_PENDING'; end if;
 if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
 if approve is null or length(coalesce(reason,''))>500 then raise exception 'INVALID_INPUT'; end if;
 if r.kind='room_borrow' then
   select manager_id into owner from public.rooms where id=(r.details->>'room_id')::uuid;
   if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=owner and actor.id=r.assigned_reviewer_id),false) then raise exception 'FORBIDDEN'; end if;
   select * into parent from public.requests where id=r.parent_request_id for update;
   if parent.status is distinct from 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 else
   if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=private.schedule_operator(r.subject_idol_id)),false) then raise exception 'FORBIDDEN'; end if;
   if approve then raise exception 'PREPARE_ROOMS_FIRST'; end if;
 end if;
 if not approve and length(btrim(coalesce(reason,'')))=0 then raise exception 'REASON_REQUIRED'; end if;
 update public.requests set status=case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,decided_by=actor.id,decided_at=now(),decision_reason=btrim(coalesce(reason,'')),revision=revision+1 where id=r.id;
 if not approve then
   if parent.id is not null then
     update public.requests set status='rejected',decided_by=actor.id,decided_at=now(),decision_reason=reason,revision=revision+1 where id=parent.id;
   end if;
   update public.requests set status='cancelled',revision=revision+1 where parent_request_id=coalesce(parent.id,r.id) and status='pending';
   perform private.schedule_notify(r.subject_idol_id,coalesce(parent.id,r.id),'Yêu cầu lịch live bị từ chối: '||reason);
   return 'rejected';
 end if;
 if not exists(select 1 from public.requests where parent_request_id=parent.id and kind='room_borrow' and status='pending') then
   perform private.apply_schedule(parent.id); return 'approved';
 end if;
 return 'waiting';
end; $$;

create or replace function public.room_borrow_inbox() returns table(id uuid,revision integer,room_code text,work_date text,hours jsonb,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.revision,rm.code||case when r.details ? 'trial_booking_id' then ' · Test: '||(r.details->>'trial_name') else '' end,r.details->>'work_date',r.details->'hours',r.created_at
 from public.requests r join public.rooms rm on rm.id=(r.details->>'room_id')::uuid
 where r.kind='room_borrow' and (r.parent_request_id is not null or exists(select 1 from public.trial_live_bookings b where b.approval_request_id=r.id and b.status='pending')) and r.status='pending'
 and (private.current_role()='admin' or(private.current_role()='operator' and rm.manager_id=auth.uid() and r.assigned_reviewer_id=auth.uid()))
 order by r.created_at
$$;

create or replace function public.room_availability(day date, exclude_plan uuid default null)
returns table(room_id uuid, slot_hour integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role() is null or private.current_role() not in ('admin','operator') then raise exception 'FORBIDDEN'; end if;
 if day is null or day<(now() at time zone 'Asia/Ho_Chi_Minh')::date or day>(now() at time zone 'Asia/Ho_Chi_Minh')::date+90 then raise exception 'INVALID_SCHEDULE'; end if;
 if exclude_plan is not null and not exists(select 1 from public.daily_plans p where p.id=exclude_plan and (private.current_role()='admin' or private.schedule_operator(p.idol_id)=auth.uid())) then raise exception 'FORBIDDEN'; end if;
 return query
 select rm.id,h
 from public.rooms rm
 cross join public.company_settings cfg
 cross join lateral generate_series(cfg.opening_hour,cfg.closing_hour-1) h
 where rm.status='available'
   and not exists(
     select 1 from public.room_visits v
     where v.room_id=rm.id and v.checked_out_at is null
       and (v.scheduled_start_snapshot at time zone 'Asia/Ho_Chi_Minh')::date=day
   )
   and not exists(select 1 from public.trial_live_bookings b where b.room_id=rm.id and b.status='approved'
     and b.starts_at<((day+make_interval(hours=>h+1)) at time zone 'Asia/Ho_Chi_Minh')
     and b.ends_at>((day+make_interval(hours=>h)) at time zone 'Asia/Ho_Chi_Minh'))
   and not exists(
     select 1 from public.room_segments g
     join public.live_sessions s on s.id=g.session_id
     where g.room_id=rm.id and g.status in ('approved','completed') and s.daily_plan_id is distinct from exclude_plan
       and g.starts_at<((day+make_interval(hours=>h+1)) at time zone 'Asia/Ho_Chi_Minh')
       and g.ends_at>((day+make_interval(hours=>h)) at time zone 'Asia/Ho_Chi_Minh')
   );
end; $$;

-- A regular Idol must not enter early while a scheduled test still owns the
-- room. Trial Idols themselves still have no account or attendance workflow.
create function private.trial_room_blocked(room uuid,planned_start timestamptz,arrival timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trial_live_bookings b where b.room_id=room and b.status='approved'
    and b.starts_at<planned_start and b.ends_at>arrival
    and b.work_date=(planned_start at time zone 'Asia/Ho_Chi_Minh')::date)
$$;
revoke all on function private.trial_room_blocked(uuid,timestamptz,timestamptz) from public,anon,authenticated;
create or replace function private.check_room_entry(segment uuid,idol uuid,scan_time timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare g public.room_segments;
begin
  g:=private.idol_segment(segment,idol);
  if not exists(select 1 from public.rooms where id=g.room_id and status='available') then raise exception 'ROOM_UNAVAILABLE'; end if;
  if scan_time<g.starts_at-interval '30 minutes' then raise exception 'CHECKIN_TOO_EARLY'; end if;
  if private.trial_room_blocked(g.room_id,g.starts_at,scan_time) then raise exception 'ROOM_QUEUE_WAIT'; end if;
  if exists(select 1 from public.room_visits where segment_id=g.id) then raise exception 'ALREADY_CHECKED_IN'; end if;
  if exists(select 1 from public.room_visits where idol_id=idol and checked_out_at is null) then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
  if exists(select 1 from public.room_segments prev where prev.session_id=g.session_id and prev.starts_at<g.starts_at
    and prev.status not in ('completed','cancelled') and not exists(select 1 from public.room_queue_skips k where k.segment_id=prev.id))
  then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
  if private.room_entry_deadline(g.id) is null then raise exception 'ROOM_QUEUE_WAIT'; end if;
  if exists(select 1 from public.room_visits where room_id=g.room_id and coalesce(checkout_confirmed_at,checked_out_at)>scan_time) then raise exception 'ROOM_QUEUE_WAIT'; end if;
end; $$;

insert into private.app_schema_migrations(version) values('202610020024');
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202610020024')$$;
commit;
