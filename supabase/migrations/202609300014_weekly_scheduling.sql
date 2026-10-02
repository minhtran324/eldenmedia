begin;
create table public.weekly_registrations (
 id uuid primary key default gen_random_uuid(), idol_id uuid not null references public.profiles(id),
 week_start date not null check(extract(isodow from week_start)=1),
 days jsonb not null check(jsonb_typeof(days)='array' and jsonb_array_length(days)=7),
 status text not null check(status in ('submitting','submitted')),submitted_at timestamptz not null default now(),
 unique(idol_id,week_start)
);
create table public.late_schedule_permissions (
 id uuid primary key default gen_random_uuid(),idol_id uuid not null references public.profiles(id),
 week_start date not null check(extract(isodow from week_start)=1),reason text not null check(length(btrim(reason)) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 revision integer not null default 1,created_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),decided_at timestamptz,decision_reason text,used_at timestamptz,
 unique(idol_id,week_start)
);
alter table public.weekly_registrations enable row level security;
alter table public.late_schedule_permissions enable row level security;
revoke all on public.weekly_registrations,public.late_schedule_permissions from anon,authenticated;
grant select on public.weekly_registrations,public.late_schedule_permissions to authenticated;
create policy weekly_read on public.weekly_registrations for select to authenticated using(private.can_read_idol(idol_id));
create policy late_read on public.late_schedule_permissions for select to authenticated using(private.can_read_idol(idol_id));
create trigger audit_mutation after insert or update or delete on public.weekly_registrations for each row execute function private.audit_change();
create trigger audit_mutation after insert or update or delete on public.late_schedule_permissions for each row execute function private.audit_change();

create function private.valid_late_schedule_permission(idol uuid,week date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.late_schedule_permissions l join public.profiles p on p.id=l.decided_by
 where l.idol_id=idol and l.week_start=week and l.status='approved' and l.used_at is null
 and p.status='active' and (p.role='admin' or (p.role='operator' and p.id=private.schedule_operator(idol))))
$$;
create function public.request_late_schedule(week date,reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; r public.late_schedule_permissions;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' or private.schedule_operator(actor.id) is null then raise exception 'FORBIDDEN'; end if;
 if week is null or week<>date_trunc('week',today::timestamp)::date then raise exception 'LATE_CURRENT_WEEK_ONLY'; end if;
 if coalesce(length(btrim(reason)),0) not between 1 and 500 then raise exception 'REASON_REQUIRED'; end if;
 if exists(select 1 from public.weekly_registrations where idol_id=actor.id and week_start=week) then raise exception 'WEEK_ALREADY_SUBMITTED'; end if;
 select * into r from public.late_schedule_permissions where idol_id=actor.id and week_start=week for update;
 if r.status='pending' or private.valid_late_schedule_permission(actor.id,week) then return r.id; end if;
 insert into public.late_schedule_permissions(idol_id,week_start,reason) values(actor.id,week,btrim(reason))
 on conflict(idol_id,week_start) do update set reason=excluded.reason,status='pending',revision=public.late_schedule_permissions.revision+1,created_at=now(),decided_by=null,decided_at=null,decision_reason=null,used_at=null
 returning * into r;
 perform private.schedule_notify(actor.id,null,'Xin đăng ký lịch trễ cho tuần '||week::text||': '||btrim(reason));
 return r.id;
end; $$;
create function public.review_late_schedule(permission_id uuid,expected_revision integer,approve boolean,reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;r public.late_schedule_permissions;today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 actor:=private.schedule_actor();select * into r from public.late_schedule_permissions where id=permission_id for update;
 if not found or r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
 if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=private.schedule_operator(r.idol_id)),false) then raise exception 'FORBIDDEN'; end if;
 if r.week_start+6<today then raise exception 'LATE_PERMISSION_EXPIRED'; end if;
 if approve is null or length(coalesce(reason,''))>500 or (not approve and length(btrim(coalesce(reason,'')))=0) then raise exception 'REASON_REQUIRED'; end if;
 update public.late_schedule_permissions set status=case when approve then 'approved' else 'rejected' end,revision=revision+1,decided_by=actor.id,decided_at=now(),decision_reason=btrim(coalesce(review_late_schedule.reason,'')) where id=r.id;
 perform private.schedule_notify(r.idol_id,null,case when approve then 'Đã cho phép đăng ký trễ. Mở Đăng ký tuần và gửi đủ các ngày trong tuần ' else 'Yêu cầu đăng ký trễ bị từ chối: ' end||case when approve then r.week_start::text else coalesce(reason,'') end);
end; $$;
alter function public.submit_schedule(uuid,date,jsonb,boolean,text) set schema private;
alter function private.submit_schedule(uuid,date,jsonb,boolean,text) rename to submit_schedule_day;

create or replace function private.submit_schedule_day(target_idol uuid, day date, shifts jsonb, cancel_day boolean default false, reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; p public.daily_plans; op uuid; today date; first_start timestamptz; existing_start timestamptz; req uuid; request_kind text;
begin
 actor:=private.schedule_actor();
 perform 1 from public.profiles where id=target_idol for share;
 op:=private.schedule_operator(target_idol);
 if op is null or not exists(select 1 from public.profiles where id=target_idol and role='idol' and status='active') then raise exception 'ASSIGNMENT_REQUIRED'; end if;
 if not coalesce(actor.role='admin' or (actor.role='operator' and actor.id=op) or (actor.role='idol' and actor.id=target_idol),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 today:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 if day is null or day<today or day>today+90 or cancel_day is null or length(coalesce(reason,''))>500 then raise exception 'INVALID_SCHEDULE'; end if;
 select * into p from public.daily_plans where idol_id=target_idol and work_date=day for update;
 if p.id is not null then perform private.schedule_mutable(p.id); end if;
 if cancel_day then
   if p.id is null or p.status in ('cancelled','completed') or length(btrim(coalesce(reason,'')))=0 then raise exception 'INVALID_CANCELLATION'; end if;
 else
   perform private.schedule_validate(day,shifts);
   select min((day+make_interval(hours=>(s->>'start_hour')::integer)) at time zone 'Asia/Ho_Chi_Minh') into first_start from jsonb_array_elements(shifts) s;
   if first_start<=now() then raise exception 'PAST_SCHEDULE'; end if;
 end if;
 select min(starts_at) into existing_start from public.live_sessions where daily_plan_id=p.id and status<>'cancelled';
 if actor.role='idol' then
   if p.id is null or p.status='cancelled' then
     if not exists(select 1 from public.weekly_registrations where idol_id=target_idol and week_start=date_trunc('week',day::timestamp)::date and status in ('submitting','submitted')) then raise exception 'WEEK_REGISTRATION_REQUIRED'; end if;
     if exists(select 1 from public.weekly_registrations where idol_id=target_idol and week_start=date_trunc('week',day::timestamp)::date and status='submitted') and first_start<now()+interval '1 hour' then raise exception 'ONE_HOUR_NOTICE'; end if;
   else
     if least(first_start,existing_start)<now()+interval '1 hour' then raise exception 'ONE_HOUR_NOTICE'; end if;
   end if;
 end if;
 request_kind:=case when cancel_day then 'schedule_cancel' when p.id is not null and p.status<>'cancelled' then 'schedule_change' else 'schedule' end;
 insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,daily_plan_id,details)
 values(request_kind,actor.id,op,target_idol,p.id,jsonb_build_object('work_date',day,'shifts',case when cancel_day then '[]'::jsonb else shifts end,'plan_version',coalesce(p.version,0),'reason',btrim(coalesce(reason,'')))) returning id into req;
 if not exists(select 1 from public.weekly_registrations where idol_id=target_idol and status='submitting') then perform private.schedule_notify(target_idol,req,'Có yêu cầu lịch live mới cần xem xét.'); end if;
 return req;
end; $$;


create function public.submit_schedule(target_idol uuid,day date,shifts jsonb,cancel_day boolean default false,reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if private.current_role()='idol' and not exists(select 1 from public.weekly_registrations where idol_id=auth.uid() and week_start=date_trunc('week',day::timestamp)::date and status='submitted')
 and not exists(select 1 from public.daily_plans where idol_id=auth.uid() and work_date=day and status='approved') then raise exception 'WEEK_REGISTRATION_REQUIRED'; end if;
 return private.submit_schedule_day(target_idol,day,shifts,cancel_day,reason);
end; $$;

create function public.submit_weekly_schedule(week date,days jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles;today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;regular boolean;entry jsonb;d date;mode text;seen date[]:='{}';result uuid;has_existing boolean;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' or private.schedule_operator(actor.id) is null then raise exception 'FORBIDDEN'; end if;
 if week is null or extract(isodow from week)<>1 then raise exception 'INVALID_WEEK'; end if;
 regular:=extract(isodow from today)=7 and week=today+1;
 if exists(select 1 from public.weekly_registrations where idol_id=actor.id and week_start=week) then raise exception 'WEEK_ALREADY_SUBMITTED'; end if;
 if not regular and (week<>date_trunc('week',today::timestamp)::date or not private.valid_late_schedule_permission(actor.id,week)) then raise exception 'LATE_PERMISSION_REQUIRED'; end if;
 if jsonb_typeof(days) is distinct from 'array' or jsonb_array_length(days)<>7 then raise exception 'COMPLETE_WEEK_REQUIRED'; end if;
 -- Validate all seven explicit days before creating any request.
 for entry in select * from jsonb_array_elements(days) loop
  d:=(entry->>'date')::date;mode:=entry->>'mode';
  if d is null or d<week or d>week+6 or d=any(seen) or mode is null or mode not in ('work','off','existing','past') then raise exception 'COMPLETE_WEEK_REQUIRED'; end if;
  seen:=array_append(seen,d);
  has_existing:=exists(select 1 from public.daily_plans where idol_id=actor.id and work_date=d and status not in ('cancelled','draft')) or
   exists(select 1 from public.requests where subject_idol_id=actor.id and status='pending' and kind in ('schedule','schedule_change','schedule_cancel') and details->>'work_date'=d::text);
  if has_existing and mode<>'existing' then raise exception 'EXISTING_DAY_REQUIRED'; end if;
  if mode='existing' and not has_existing then raise exception 'STALE_SCHEDULE'; end if;
  if mode='past' and d>=today then raise exception 'COMPLETE_WEEK_REQUIRED'; end if;
  if mode='work' then
   if d<today then raise exception 'PAST_SCHEDULE'; end if;
   perform private.schedule_validate(d,entry->'shifts');
  elsif jsonb_typeof(entry->'shifts') is distinct from 'array' or jsonb_array_length(entry->'shifts')<>0 then raise exception 'INVALID_SCHEDULE'; end if;
 end loop;
 insert into public.weekly_registrations(idol_id,week_start,days,status) values(actor.id,week,days,'submitting') returning id into result;
 for entry in select * from jsonb_array_elements(days) loop
  if entry->>'mode'='work' then perform private.submit_schedule_day(actor.id,(entry->>'date')::date,entry->'shifts',false,'Đăng ký tuần '||week::text); end if;
 end loop;
 update public.weekly_registrations set status='submitted' where id=result;
 if not regular then update public.late_schedule_permissions set used_at=clock_timestamp() where idol_id=actor.id and week_start=week; end if;
 perform private.schedule_notify(actor.id,null,'Đã gửi đầy đủ đăng ký tuần '||week::text||'. Vận hành xem lịch tuần để phân phòng và duyệt các ngày làm.');
 return result;
end; $$;

-- Aggregate the existing permission-checked availability RPC to avoid PostgREST's row cap.
create function public.weekly_registration_access(week date) returns boolean
language sql stable security definer set search_path='' as $$
 select private.current_role()='idol' and (
  (extract(isodow from (now() at time zone 'Asia/Ho_Chi_Minh')::date)=7 and week=(now() at time zone 'Asia/Ho_Chi_Minh')::date+1)
  or (week=date_trunc('week',now() at time zone 'Asia/Ho_Chi_Minh')::date and private.valid_late_schedule_permission(auth.uid(),week))
 )
$$;
revoke all on function public.weekly_registration_access(date) from public,anon;
grant execute on function public.weekly_registration_access(date) to authenticated;
create function public.room_availability_grid(day date,exclude_plan uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('room_id',r.room_id,'slot_hour',r.slot_hour)),'[]'::jsonb) from public.room_availability(day,exclude_plan) r
$$;
revoke all on function private.submit_schedule_day(uuid,date,jsonb,boolean,text),private.valid_late_schedule_permission(uuid,date) from public,anon,authenticated;
revoke all on function public.submit_weekly_schedule(date,jsonb),public.request_late_schedule(date,text),public.review_late_schedule(uuid,integer,boolean,text),public.room_availability_grid(date,uuid),public.submit_schedule(uuid,date,jsonb,boolean,text) from public,anon;
grant execute on function public.submit_weekly_schedule(date,jsonb),public.request_late_schedule(date,text),public.review_late_schedule(uuid,integer,boolean,text),public.room_availability_grid(date,uuid),public.submit_schedule(uuid,date,jsonb,boolean,text) to authenticated;
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609300014')$$;
insert into private.app_schema_migrations(version) values('202609300014');
commit;
