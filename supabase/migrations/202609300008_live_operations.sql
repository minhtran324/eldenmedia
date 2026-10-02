begin;
create function private.operation_notify(idol uuid, req uuid, message text) returns void
language sql security definer set search_path='' as $$
 insert into public.notifications(recipient_id,subject_idol_id,request_id,event_type,title,body)
 select p.id,idol,req,'live_operations','Ca live & thiết bị',coalesce((select full_name from public.profiles where id=idol),'Idol')||': '||message from public.profiles p
 where p.status='active' and (p.id=idol or p.id=private.schedule_operator(idol) or p.role='admin')
$$;
create function private.idol_segment(target uuid, idol uuid) returns public.room_segments
language plpgsql security definer set search_path='' as $$
declare g public.room_segments; s public.live_sessions;
begin
 select * into g from public.room_segments where id=target;
 select * into s from public.live_sessions where id=g.session_id;
 if g.id is null or s.idol_id<>idol or s.status<>'approved' or g.status<>'approved'
 or (s.starts_at at time zone 'Asia/Ho_Chi_Minh')::date<>(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
 then raise exception 'SEGMENT_UNAVAILABLE'; end if;
 return g;
end; $$;

create unique index one_pending_device_borrow on public.requests(subject_idol_id,device_id)
 where status='pending' and kind='device_borrow';
create unique index one_pending_device_return on public.requests(device_loan_id)
 where status='pending' and kind='device_return';

create function public.scan_device(segment uuid, qr uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; d public.devices; loan uuid; req uuid;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
 g:=private.idol_segment(segment,actor.id);
 select * into d from public.devices where qr_token=qr for update;
 if d.id is null or d.status<>'available' then raise exception 'DEVICE_UNAVAILABLE'; end if;
 if not exists(select 1 from public.profiles where id=d.manager_id and status='active' and role='operator') then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
 if exists(select 1 from public.device_loans where returned_at is null and (device_id=d.id or idol_id=actor.id)) then raise exception 'DEVICE_OR_IDOL_BUSY'; end if;
 if d.assigned_room_id=g.room_id then
   insert into public.device_loans(device_id,idol_id,session_id) values(d.id,actor.id,g.session_id) returning id into loan;
   -- Outstanding alternative requests must not later allocate a second device.
   update public.requests set status='cancelled',revision=revision+1 where kind='device_borrow' and subject_idol_id=actor.id and status='pending';
   perform private.operation_notify(actor.id,null,'Đã nhận máy '||d.code||'. Trả máy cần vận hành xác nhận.');
   return jsonb_build_object('status','received','id',loan);
 end if;
 update public.requests set status='cancelled',revision=revision+1
 where kind='device_borrow' and subject_idol_id=actor.id and device_id=d.id and status='pending' and room_segment_id is distinct from g.id;
 select id into req from public.requests where kind='device_borrow' and subject_idol_id=actor.id and device_id=d.id and status='pending';
 if req is null then
   insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,session_id,room_segment_id,device_id,details)
   values('device_borrow',actor.id,d.manager_id,actor.id,g.session_id,g.id,d.id,jsonb_build_object('room_id',g.room_id)) returning id into req;
   insert into public.notifications(recipient_id,request_id,event_type,title,body)
   values(d.manager_id,req,'device_borrow','Yêu cầu mượn máy','Có yêu cầu mượn máy '||d.code||'. Mở Ca live & thiết bị để duyệt.');
 end if;
 return jsonb_build_object('status','waiting','id',req);
end; $$;

create function public.request_device_return(qr uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; loan public.device_loans; req uuid; reviewer uuid;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
 select l.* into loan from public.device_loans l join public.devices d on d.id=l.device_id
 where d.qr_token=qr and l.idol_id=actor.id and l.returned_at is null for update of l;
 if loan.id is null then raise exception 'LOAN_NOT_FOUND'; end if;
 select id into req from public.requests where kind='device_return' and device_loan_id=loan.id and status='pending';
 if req is not null then return req; end if;
 reviewer:=private.schedule_operator(actor.id);
 update public.device_loans set return_requested_at=clock_timestamp() where id=loan.id;
 insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,session_id,device_id,device_loan_id)
 values('device_return',actor.id,reviewer,actor.id,loan.session_id,loan.device_id,loan.id) returning id into req;
 perform private.operation_notify(actor.id,req,'Idol đã quét trả máy tại bàn chung. Vận hành cần kiểm tra và xác nhận.');
 return req;
end; $$;

create function public.review_device(request_id uuid, expected_revision integer, approve boolean, reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; d public.devices; g public.room_segments; loan public.device_loans; owner uuid; granted uuid;
begin
 actor:=private.schedule_actor();
 select * into r from public.requests where id=request_id for update;
 if r.id is null or r.kind not in ('device_borrow','device_return') or r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
 if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
 if approve is null or length(coalesce(reason,''))>500 or (not approve and length(btrim(coalesce(reason,'')))=0) then raise exception 'REASON_REQUIRED'; end if;
 perform 1 from public.profiles where id=r.subject_idol_id for share;
 select * into d from public.devices where id=r.device_id for update;
 owner:=case when r.kind='device_borrow' then d.manager_id else private.schedule_operator(r.subject_idol_id) end;
 if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=owner),false) then raise exception 'FORBIDDEN'; end if;
 if approve and r.kind='device_borrow' then
   if not exists(select 1 from public.profiles where id=r.subject_idol_id and role='idol' and status='active') then raise exception 'ACTIVE_REQUIRED'; end if;
   g:=private.idol_segment(r.room_segment_id,r.subject_idol_id);
   if d.status<>'available' then raise exception 'DEVICE_UNAVAILABLE'; end if;
   if exists(select 1 from public.device_loans where returned_at is null and (device_id=d.id or idol_id=r.subject_idol_id)) then raise exception 'DEVICE_OR_IDOL_BUSY'; end if;
   insert into public.device_loans(device_id,idol_id,session_id,authorization_request_id)
   values(d.id,r.subject_idol_id,g.session_id,r.id) returning id into granted;
   update public.requests set device_loan_id=granted where id=r.id;
   update public.requests set status='cancelled',revision=revision+1 where subject_idol_id=r.subject_idol_id and kind='device_borrow' and status='pending' and id<>r.id;
 elsif r.kind='device_return' then
   select * into loan from public.device_loans where id=r.device_loan_id for update;
   if loan.id is null or loan.returned_at is not null then raise exception 'LOAN_NOT_FOUND'; end if;
   if approve then
     update public.device_loans set returned_at=clock_timestamp(),return_confirmed_by=actor.id where id=loan.id;
   else
     update public.device_loans set return_requested_at=null where id=loan.id;
   end if;
 end if;
 update public.requests set status=case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
 decided_by=actor.id,decided_at=clock_timestamp(),decision_reason=btrim(coalesce(reason,'')),revision=revision+1 where id=r.id;
 perform private.operation_notify(r.subject_idol_id,r.id,case when approve then 'Đã duyệt: ' else 'Từ chối: ' end||case when r.kind='device_borrow' then 'mượn máy ' else 'trả máy ' end||d.code||case when not approve then '. '||reason else '.' end);
end; $$;

create function public.device_request_inbox() returns table(id uuid,revision integer,kind text,device_code text,idol_name text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.revision,r.kind,d.code,p.full_name,r.created_at from public.requests r
 join public.devices d on d.id=r.device_id join public.profiles p on p.id=r.subject_idol_id
 where r.kind in ('device_borrow','device_return') and r.status='pending' and
 (private.current_role()='admin' or(private.current_role()='operator' and auth.uid()=case when r.kind='device_borrow' then d.manager_id else private.schedule_operator(r.subject_idol_id) end))
 order by r.created_at,r.id
$$;
create function public.operational_loans() returns table(id uuid,device_code text,idol_name text,checked_out_at timestamptz,return_requested_at timestamptz)
language sql stable security definer set search_path='' as $$
 select l.id,d.code,p.full_name,l.checked_out_at,l.return_requested_at from public.device_loans l
 join public.devices d on d.id=l.device_id join public.profiles p on p.id=l.idol_id
 where l.returned_at is null and (private.current_role()='admin' or(private.current_role()='operator' and (d.manager_id=auth.uid() or private.schedule_operator(l.idol_id)=auth.uid())) or(private.current_role()='idol' and l.idol_id=auth.uid()))
 order by l.checked_out_at,l.id
$$;

create table public.room_capture_tickets (
 id uuid primary key default gen_random_uuid(), idol_id uuid not null references public.profiles(id),
 segment_id uuid not null references public.room_segments(id), phase text not null check(phase in ('checkin','checkout')),
 scanned_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default(clock_timestamp()+interval '5 minutes'),
 photo_path text not null unique, used_at timestamptz, visit_id uuid references public.room_visits(id)
);
alter table public.room_capture_tickets enable row level security;
revoke all on public.room_capture_tickets from anon,authenticated;
grant select on public.room_capture_tickets to authenticated;
grant select,delete on public.room_capture_tickets to service_role;
grant select,update on public.room_visit_photos to service_role;
create policy capture_ticket_read on public.room_capture_tickets for select to authenticated
using(idol_id=auth.uid() and private.current_role()='idol');
create index unused_capture_tickets on public.room_capture_tickets(expires_at) where used_at is null;

create function private.check_room_entry(segment uuid, idol uuid, scan_time timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare g public.room_segments;
begin
 g:=private.idol_segment(segment,idol);
 if not exists(select 1 from public.rooms where id=g.room_id and status='available') then raise exception 'ROOM_UNAVAILABLE'; end if;
 if exists(select 1 from public.room_visits where segment_id=g.id) then raise exception 'ALREADY_CHECKED_IN'; end if;
 if exists(select 1 from public.room_visits where idol_id=idol and checked_out_at is null) then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
 if exists(select 1 from public.room_segments where session_id=g.session_id and starts_at<g.starts_at and status<>'completed') then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
 if exists(select 1 from public.room_visits where room_id=g.room_id and (checked_out_at is null or checked_out_at>scan_time)) then raise exception 'ROOM_CONFLICT'; end if;
 if exists(select 1 from public.room_segments where room_id=g.room_id and id<>g.id and status in ('approved','completed')
   and starts_at<greatest(g.ends_at,clock_timestamp()) and ends_at>scan_time) then raise exception 'ROOM_CONFLICT'; end if;
end; $$;

create function public.begin_room_capture(segment uuid, qr uuid, phase text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; v public.room_visits; ticket uuid:=gen_random_uuid(); scanned timestamptz:=clock_timestamp(); path text;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
 if phase is null or phase not in ('checkin','checkout') then raise exception 'INVALID_INPUT'; end if;
 select * into g from public.room_segments where id=segment;
 if g.id is null or not exists(select 1 from public.rooms where id=g.room_id and qr_token=qr) then raise exception 'WRONG_ROOM_QR'; end if;
 if phase='checkin' then perform private.check_room_entry(segment,actor.id,scanned);
 else
   select * into v from public.room_visits where segment_id=segment and idol_id=actor.id and checked_out_at is null;
   if v.id is null then raise exception 'VISIT_NOT_FOUND'; end if;
 end if;
 path:=actor.id::text||'/'||ticket::text||'.jpg';
 insert into public.room_capture_tickets(id,idol_id,segment_id,phase,scanned_at,photo_path,visit_id)
 values(ticket,actor.id,segment,phase,scanned,path,v.id);
 return jsonb_build_object('id',ticket,'path',path,'scanned_at',scanned);
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('room-attendance','room-attendance',false,4194304,array['image/jpeg']);
create policy attendance_photo_insert on storage.objects for insert to authenticated with check(
 bucket_id='room-attendance' and private.current_role()='idol' and exists(select 1 from public.room_capture_tickets t
 where t.idol_id=auth.uid() and t.photo_path=name and t.used_at is null and t.expires_at>clock_timestamp())
);
create policy attendance_photo_read on storage.objects for select to authenticated using(
 bucket_id='room-attendance' and exists(select 1 from public.room_visit_photos p join public.room_visits v on v.id=p.visit_id
 where p.storage_path=name and p.deleted_at is null and p.expires_at>now() and private.can_read_idol(v.idol_id))
);
-- No client UPDATE/DELETE: a photo used as evidence cannot be replaced or removed.

create function public.finish_room_capture(ticket_id uuid, note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; t public.room_capture_tickets; g public.room_segments; v public.room_visits; session public.live_sessions; visit uuid;
begin
 actor:=private.schedule_actor();
 if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
 select * into t from public.room_capture_tickets where id=ticket_id and idol_id=actor.id for update;
 if t.id is null then raise exception 'CAPTURE_NOT_FOUND'; end if;
 if t.used_at is not null then return t.visit_id; end if;
 if t.expires_at<=clock_timestamp() then raise exception 'CAPTURE_EXPIRED'; end if;
 if length(coalesce(note,''))>500 then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from storage.objects where bucket_id='room-attendance' and name=t.photo_path) then raise exception 'PHOTO_REQUIRED'; end if;
 select * into g from public.room_segments where id=t.segment_id;
 select * into session from public.live_sessions where id=g.session_id;
 if t.phase='checkin' then
   perform private.check_room_entry(g.id,actor.id,t.scanned_at);
   insert into public.room_visits(segment_id,idol_id,checked_in_at,before_photo_path,checkin_note)
   values(g.id,actor.id,t.scanned_at,t.photo_path,btrim(coalesce(note,''))) returning id into visit;
   if t.scanned_at>g.starts_at then
     perform private.operation_notify(actor.id,null,'Check-in muộn '||ceil(extract(epoch from(t.scanned_at-g.starts_at))/60)::integer||' phút. '||coalesce(note,''));
   end if;
 else
   select * into v from public.room_visits where id=t.visit_id and idol_id=actor.id and checked_out_at is null for update;
   if v.id is null then raise exception 'VISIT_NOT_FOUND'; end if;
   if t.scanned_at<>v.scheduled_end_snapshot and length(btrim(coalesce(note,'')))=0 then raise exception 'CHECKOUT_REASON_REQUIRED'; end if;
   visit:=v.id;
   update public.room_visits set checked_out_at=t.scanned_at,after_photo_path=t.photo_path,checkout_reason=btrim(coalesce(note,'')) where id=visit;
   update public.room_segments set status='completed' where id=g.id;
   if not exists(select 1 from public.room_segments where session_id=g.session_id and status not in ('completed','cancelled')) then
     update public.live_sessions set status='completed' where id=g.session_id;
     if not exists(select 1 from public.live_sessions where daily_plan_id=session.daily_plan_id and status not in ('completed','cancelled')) then
       update public.daily_plans set status='completed',version=version+1 where id=session.daily_plan_id;
     end if;
   end if;
   perform private.operation_notify(actor.id,null,'Đã checkout phòng, '||case when t.scanned_at<v.scheduled_end_snapshot then 'sớm ' else 'trễ ' end||ceil(abs(extract(epoch from(t.scanned_at-v.scheduled_end_snapshot)))/60)::integer||' phút. '||coalesce(note,''));
 end if;
 insert into public.room_visit_photos(visit_id,phase,storage_path,captured_at,expires_at)
 values(visit,t.phase,t.photo_path,clock_timestamp(),clock_timestamp()+interval '30 days');
 update public.room_capture_tickets set used_at=clock_timestamp(),visit_id=visit where id=t.id;
 return visit;
end; $$;

revoke all on function private.operation_notify(uuid,uuid,text),private.idol_segment(uuid,uuid),private.check_room_entry(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.scan_device(uuid,uuid),public.request_device_return(uuid),public.review_device(uuid,integer,boolean,text),public.device_request_inbox(),public.operational_loans(),public.begin_room_capture(uuid,uuid,text),public.finish_room_capture(uuid,text) from public,anon,authenticated;
grant execute on function public.scan_device(uuid,uuid),public.request_device_return(uuid),public.review_device(uuid,integer,boolean,text),public.device_request_inbox(),public.operational_loans(),public.begin_room_capture(uuid,uuid,text),public.finish_room_capture(uuid,text) to authenticated;
insert into private.app_schema_migrations(version) values('202609300008');
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609300008')$$;
commit;
