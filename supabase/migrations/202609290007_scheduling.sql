begin;
-- Deferred triggers run after a SECURITY DEFINER RPC returns, under the caller's
-- role. Keep their private validation privileges without exposing helper RPCs.
alter function private.validate_day_trigger() security definer;
alter function private.validate_rooms_trigger() security definer;
alter table public.daily_plans add column version integer not null default 1;
alter table public.requests add column parent_request_id uuid references public.requests(id), add column revision integer not null default 1;
create unique index one_pending_schedule_day on public.requests(subject_idol_id,(details->>'work_date'))
 where status='pending' and kind in ('schedule','schedule_change','schedule_cancel');
create index request_children on public.requests(parent_request_id);

create function private.schedule_actor() returns public.profiles language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=auth.uid() for update;
 if p.id is null or p.status<>'active' then raise exception 'ACTIVE_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(20260929,6);
 return p;
end; $$;
create function private.schedule_operator(idol uuid) returns uuid language sql stable security definer set search_path='' as $$
 select a.operator_id from public.idol_assignments a join public.profiles p on p.id=a.operator_id and p.status='active'
 where a.idol_id=idol and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) limit 1
$$;
create function private.schedule_notify(target uuid, req uuid, message text) returns void language sql security definer set search_path='' as $$
 insert into public.notifications(recipient_id,subject_idol_id,request_id,event_type,title,body)
 select p.id,target,req,'schedule','Lịch live',message from public.profiles p
 where p.status='active' and (p.id=target or p.id=private.schedule_operator(target) or p.role='admin')
$$;
create function private.schedule_validate(day date, shifts jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s jsonb; a integer; b integer; total integer:=0; seen integer[]:='{}'; h integer; cfg public.company_settings;
begin
 if day is null or jsonb_typeof(shifts) is distinct from 'array' then raise exception 'INVALID_SCHEDULE'; end if;
 if jsonb_array_length(shifts) not between 1 and 2 then raise exception 'FIVE_HOURS_REQUIRED'; end if;
 select * into strict cfg from public.company_settings where id;
 for s in select value from jsonb_array_elements(shifts) loop
   if coalesce(s->>'start_hour','') !~ '^\d{1,2}$' or coalesce(s->>'end_hour','') !~ '^\d{1,2}$' then raise exception 'INVALID_SCHEDULE'; end if;
   a:=(s->>'start_hour')::integer; b:=(s->>'end_hour')::integer;
   if a<cfg.opening_hour or b>cfg.closing_hour or b-a not between 1 and 5 then raise exception 'INVALID_SCHEDULE'; end if;
   for h in a..b-1 loop
     if h=any(seen) then raise exception 'OVERLAPPING_SHIFTS'; end if;
     seen:=array_append(seen,h);
   end loop;
   total:=total+b-a;
 end loop;
 if total<>5 then raise exception 'FIVE_HOURS_REQUIRED'; end if;
end; $$;
create function private.schedule_mutable(plan uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.live_sessions s where s.daily_plan_id=plan and
   (exists(select 1 from public.room_segments g join public.room_visits v on v.segment_id=g.id where g.session_id=s.id)
    or exists(select 1 from public.device_loans l where l.session_id=s.id)))
 then raise exception 'ATTENDANCE_EXISTS'; end if;
end; $$;

create function public.submit_schedule(target_idol uuid, day date, shifts jsonb, cancel_day boolean default false, reason text default '') returns uuid
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
     if extract(isodow from today)<>7 or day<today+1 or day>today+7 then raise exception 'SUNDAY_NEXT_WEEK_ONLY'; end if;
   else
     if least(first_start,existing_start)<now()+interval '1 hour' then raise exception 'ONE_HOUR_NOTICE'; end if;
   end if;
 end if;
 request_kind:=case when cancel_day then 'schedule_cancel' when p.id is not null and p.status<>'cancelled' then 'schedule_change' else 'schedule' end;
 insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,daily_plan_id,details)
 values(request_kind,actor.id,op,target_idol,p.id,jsonb_build_object('work_date',day,'shifts',case when cancel_day then '[]'::jsonb else shifts end,'plan_version',coalesce(p.version,0),'reason',btrim(coalesce(reason,'')))) returning id into req;
 perform private.schedule_notify(target_idol,req,'Có yêu cầu lịch live mới cần xem xét.');
 return req;
end; $$;

-- Called only after all room owners consent. All validations and changes are atomic.
create function private.apply_schedule(req_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.requests; p public.daily_plans; d date; op uuid; preparer public.profiles; s jsonb; slot jsonb;
  start_time timestamptz; end_time timestamptz; session uuid; h integer; room public.rooms; child public.requests;
begin
 select * into strict r from public.requests where id=req_id for update;
 if r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 perform 1 from public.profiles where id=r.subject_idol_id for share;
 op:=private.schedule_operator(r.subject_idol_id);
 select * into preparer from public.profiles where id=(r.details->>'prepared_by')::uuid for share;
 if op is null or preparer.status is distinct from 'active' or not (preparer.role='admin' or preparer.id=op)
 or not exists(select 1 from public.profiles where id=r.subject_idol_id and status='active') then raise exception 'STALE_TEAM'; end if;
 d:=(r.details->>'work_date')::date;
 select * into p from public.daily_plans where idol_id=r.subject_idol_id and work_date=d for update;
 if coalesce(p.version,0)<>(r.details->>'plan_version')::integer then raise exception 'STALE_SCHEDULE'; end if;
 if p.id is not null then perform private.schedule_mutable(p.id); end if;
 if r.kind<>'schedule_cancel' then
   perform private.schedule_validate(d,r.details->'shifts');
   for slot in select value from jsonb_array_elements(r.details->'rooms') loop
     select * into room from public.rooms where id=(slot->>'room_id')::uuid for update;
     if room.id is null or room.status<>'available' then raise exception 'ROOM_UNAVAILABLE'; end if;
     perform 1 from public.profiles where id=room.manager_id and status='active' and role='operator' for share;
     if not found then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
     if room.manager_id<>op and preparer.role<>'admin' then
       select * into child from public.requests where parent_request_id=r.id and kind='room_borrow' and details->>'room_id'=room.id::text and status='approved';
       if child.id is null or child.assigned_reviewer_id<>room.manager_id then raise exception 'ROOM_APPROVAL_REQUIRED'; end if;
     end if;
     start_time:=(d+make_interval(hours=>(slot->>'hour')::integer)) at time zone 'Asia/Ho_Chi_Minh'; end_time:=start_time+interval '1 hour';
     if start_time<=now() then raise exception 'PAST_SCHEDULE'; end if;
     if exists(select 1 from public.room_segments g join public.live_sessions l on l.id=g.session_id where g.room_id=room.id and g.status in ('approved','completed') and l.daily_plan_id is distinct from p.id and g.starts_at<end_time and g.ends_at>start_time)
       or exists(select 1 from public.room_visits v where v.room_id=room.id and v.checked_out_at is null)
       then raise exception 'ROOM_CONFLICT'; end if;
   end loop;
 end if;
 if p.id is null then
   insert into public.daily_plans(idol_id,work_date,shift_count,status) values(r.subject_idol_id,d,jsonb_array_length(r.details->'shifts'),'draft') returning * into p;
 else
   update public.daily_plans set status='draft' where id=p.id;
   update public.room_segments set status='cancelled' where session_id in(select id from public.live_sessions where daily_plan_id=p.id) and status<>'cancelled';
   update public.live_sessions set status='cancelled' where daily_plan_id=p.id and status<>'cancelled';
 end if;
 if r.kind='schedule_cancel' then
   update public.daily_plans set status='cancelled',version=version+1 where id=p.id;
 else
   for s in select value from jsonb_array_elements(r.details->'shifts') loop
     start_time:=(d+make_interval(hours=>(s->>'start_hour')::integer)) at time zone 'Asia/Ho_Chi_Minh';
     end_time:=(d+make_interval(hours=>(s->>'end_hour')::integer)) at time zone 'Asia/Ho_Chi_Minh';
     insert into public.live_sessions(idol_id,daily_plan_id,starts_at,ends_at,status) values(r.subject_idol_id,p.id,start_time,end_time,'approved') returning id into session;
     -- Merge consecutive hourly slots in the same room into one segment.
     for slot in
       with slots as(select (v->>'hour')::integer slot_hour,(v->>'room_id')::uuid room_id from jsonb_array_elements(r.details->'rooms') v where (v->>'hour')::integer>=(s->>'start_hour')::integer and (v->>'hour')::integer<(s->>'end_hour')::integer),
       groups as(select *,slot_hour-row_number() over(partition by room_id order by slot_hour) grp from slots)
       select jsonb_build_object('room_id',room_id,'start',min(slot_hour),'end',max(slot_hour)+1) from groups group by room_id,grp order by min(slot_hour)
     loop
       insert into public.room_segments(session_id,room_id,starts_at,ends_at,status,approved_by,approved_at)
       values(session,(slot->>'room_id')::uuid,(d+make_interval(hours=>(slot->>'start')::integer)) at time zone 'Asia/Ho_Chi_Minh',(d+make_interval(hours=>(slot->>'end')::integer)) at time zone 'Asia/Ho_Chi_Minh','approved',auth.uid(),now());
     end loop;
   end loop;
   update public.daily_plans set shift_count=jsonb_array_length(r.details->'shifts'),status='approved',submitted_at=coalesce(submitted_at,r.created_at),version=version+1 where id=p.id;
 end if;
 update public.requests set status='approved',decided_by=auth.uid(),decided_at=now(),daily_plan_id=p.id,revision=revision+1 where id=r.id;
 perform private.schedule_notify(r.subject_idol_id,r.id,'Lịch live đã được cập nhật. Mở lịch để xem phòng và giờ mới.');
end; $$;

create function public.prepare_schedule(request_id uuid, expected_revision integer, room_slots jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; op uuid; slot jsonb; s jsonb; room public.rooms; hours integer[]:='{}'; h integer; waiting boolean:=false; owner uuid; room_key uuid; borrow_request uuid;
begin
 actor:=private.schedule_actor();
 select * into r from public.requests where id=request_id for update;
 if r.id is null or r.kind not in ('schedule','schedule_change','schedule_cancel') or r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 perform 1 from public.profiles where id=r.subject_idol_id for share;
 op:=private.schedule_operator(r.subject_idol_id);
 if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=op),false) then raise exception 'FORBIDDEN'; end if;
 if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
 if r.kind<>'schedule_cancel' then
   if jsonb_typeof(room_slots) is distinct from 'array' or jsonb_array_length(room_slots)<>5 then raise exception 'ROOM_COVERAGE_REQUIRED'; end if;
   for slot in select value from jsonb_array_elements(room_slots) loop
     if coalesce(slot->>'hour','') !~ '^\d{1,2}$' then raise exception 'INVALID_SCHEDULE'; end if;
     h:=(slot->>'hour')::integer;
     if h=any(hours) or not exists(select 1 from jsonb_array_elements(r.details->'shifts') v where h>=(v->>'start_hour')::integer and h<(v->>'end_hour')::integer) then raise exception 'ROOM_COVERAGE_REQUIRED'; end if;
     hours:=array_append(hours,h);
     select * into room from public.rooms where id=(slot->>'room_id')::uuid;
     if room.id is null or room.status<>'available' then raise exception 'ROOM_UNAVAILABLE'; end if;
   end loop;
 end if;
 update public.requests set status='cancelled',revision=revision+1 where parent_request_id=r.id and status in ('pending','approved');
 update public.requests set details=details||jsonb_build_object('rooms',coalesce(room_slots,'[]'::jsonb),'prepared_by',actor.id),revision=revision+1 where id=r.id;
 if r.kind<>'schedule_cancel' and actor.role<>'admin' then
   for room_key,owner in select distinct rm.id,rm.manager_id from jsonb_array_elements(room_slots) v join public.rooms rm on rm.id=(v->>'room_id')::uuid where rm.manager_id<>op loop
     if not exists(select 1 from public.profiles where id=owner and status='active' and role='operator') then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
     insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,parent_request_id,details)
     values('room_borrow',actor.id,owner,r.subject_idol_id,r.id,jsonb_build_object('room_id',room_key,'work_date',r.details->'work_date','hours',(select jsonb_agg((v->>'hour')::integer order by (v->>'hour')::integer) from jsonb_array_elements(room_slots) v where (v->>'room_id')::uuid=room_key))) returning id into borrow_request;
     insert into public.notifications(recipient_id,request_id,event_type,title,body)
     values(owner,borrow_request,'room_borrow','Yêu cầu mượn phòng','Có yêu cầu mượn phòng ngày '||(r.details->>'work_date')||'. Mở Lịch live để duyệt.');
     waiting:=true;
   end loop;
 end if;
 if waiting then return 'waiting'; end if;
 perform private.apply_schedule(r.id); return 'approved';
end; $$;

create function public.review_schedule(request_id uuid, expected_revision integer, approve boolean, reason text default '') returns text
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; parent public.requests; owner uuid;
begin
 actor:=private.schedule_actor();
 select * into r from public.requests where id=request_id for update;
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

-- Narrow cross-team summaries: only room/time/request decision fields, never profiles or raw parent payloads.
create function public.room_borrow_inbox() returns table(id uuid,revision integer,room_code text,work_date text,hours jsonb,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.revision,rm.code,r.details->>'work_date',r.details->'hours',r.created_at
 from public.requests r join public.rooms rm on rm.id=(r.details->>'room_id')::uuid
 where r.kind='room_borrow' and r.parent_request_id is not null and r.status='pending'
 and (private.current_role()='admin' or(private.current_role()='operator' and rm.manager_id=auth.uid() and r.assigned_reviewer_id=auth.uid()))
 order by r.created_at
$$;
create function public.room_availability(day date, exclude_plan uuid default null) returns table(room_id uuid,slot_hour integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role() is null or private.current_role() not in ('admin','operator') then raise exception 'FORBIDDEN'; end if;
 if day is null or day<(now() at time zone 'Asia/Ho_Chi_Minh')::date or day>(now() at time zone 'Asia/Ho_Chi_Minh')::date+90 then raise exception 'INVALID_SCHEDULE'; end if;
 if exclude_plan is not null and not exists(select 1 from public.daily_plans p where p.id=exclude_plan and (private.current_role()='admin' or private.schedule_operator(p.idol_id)=auth.uid())) then raise exception 'FORBIDDEN'; end if;
 return query select rm.id,h from public.rooms rm cross join public.company_settings cfg cross join lateral generate_series(cfg.opening_hour,cfg.closing_hour-1) h
 where rm.status='available' and not exists(select 1 from public.room_visits v where v.room_id=rm.id and v.checked_out_at is null)
 and not exists(select 1 from public.room_segments g join public.live_sessions s on s.id=g.session_id where g.room_id=rm.id and g.status in ('approved','completed') and s.daily_plan_id is distinct from exclude_plan
 and g.starts_at<((day+make_interval(hours=>h+1)) at time zone 'Asia/Ho_Chi_Minh') and g.ends_at>((day+make_interval(hours=>h)) at time zone 'Asia/Ho_Chi_Minh'));
end; $$;

revoke all on function private.schedule_actor(),private.schedule_operator(uuid),private.schedule_notify(uuid,uuid,text),private.schedule_validate(date,jsonb),private.schedule_mutable(uuid),private.apply_schedule(uuid) from public,anon,authenticated;
revoke all on function public.submit_schedule(uuid,date,jsonb,boolean,text),public.prepare_schedule(uuid,integer,jsonb),public.review_schedule(uuid,integer,boolean,text),public.room_borrow_inbox(),public.room_availability(date,uuid) from public,anon,authenticated;
grant execute on function public.submit_schedule(uuid,date,jsonb,boolean,text),public.prepare_schedule(uuid,integer,jsonb),public.review_schedule(uuid,integer,boolean,text),public.room_borrow_inbox(),public.room_availability(date,uuid) to authenticated;
insert into private.app_schema_migrations(version) values('202609290007');
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609290007')$$;
commit;
