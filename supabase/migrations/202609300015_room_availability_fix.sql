begin;

-- A check-in from another date must not make every future date look occupied.
-- Today's open visit remains a lock; future dates are available to schedule.
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
   and not exists(
     select 1 from public.room_segments g
     join public.live_sessions s on s.id=g.session_id
     where g.room_id=rm.id and g.status in ('approved','completed') and s.daily_plan_id is distinct from exclude_plan
       and g.starts_at<((day+make_interval(hours=>h+1)) at time zone 'Asia/Ho_Chi_Minh')
       and g.ends_at>((day+make_interval(hours=>h)) at time zone 'Asia/Ho_Chi_Minh')
   );
end; $$;

-- Keep final approval consistent with the grid. A visit on another date is not
-- a conflict for this date; the range/segment check remains authoritative.
create or replace function private.apply_schedule(req_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.requests; p public.daily_plans; d date; op uuid; preparer public.profiles; s jsonb; slot jsonb;
  start_time timestamptz; end_time timestamptz; session uuid; room public.rooms; child public.requests;
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
       or exists(select 1 from public.room_visits v where v.room_id=room.id and v.checked_out_at is null and (v.scheduled_start_snapshot at time zone 'Asia/Ho_Chi_Minh')::date=d)
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
     for slot in with slots as(select (v->>'hour')::integer slot_hour,(v->>'room_id')::uuid room_id from jsonb_array_elements(r.details->'rooms') v where (v->>'hour')::integer>=(s->>'start_hour')::integer and (v->>'hour')::integer<(s->>'end_hour')::integer), groups as(select *,slot_hour-row_number() over(partition by room_id order by slot_hour) grp from slots) select jsonb_build_object('room_id',room_id,'start',min(slot_hour),'end',max(slot_hour)+1) from groups group by room_id,grp order by min(slot_hour)
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

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609300015')$$;
insert into private.app_schema_migrations(version) values('202609300015');
commit;
