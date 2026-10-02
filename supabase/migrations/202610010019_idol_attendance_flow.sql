-- Apply after 018. All operational writes remain behind authenticated RPCs.
begin;

alter table public.room_visits
  add column entry_due_at timestamptz,
  add column checkout_confirmed_at timestamptz,
  add column device_choice text not null default 'pending' check(device_choice in ('pending','company','own')),
  add column entry_late_seconds integer generated always as
    (greatest(0,ceil(extract(epoch from (checked_in_at-coalesce(entry_due_at,scheduled_start_snapshot))))::integer)) stored;
update public.room_visits set checkout_confirmed_at=checked_out_at where checked_out_at is not null;
alter table public.room_capture_tickets add column entry_due_at timestamptz;
alter table public.device_loans add column room_visit_id uuid references public.room_visits(id);
alter table public.notifications add column priority text not null default 'normal' check(priority in ('normal','important'));
alter table public.notifications add column work_date date;

create table public.room_queue_skips (
  segment_id uuid primary key references public.room_segments(id),
  idol_id uuid not null references public.profiles(id),
  skipped_at timestamptz not null default clock_timestamp(),
  skipped_by uuid not null references public.profiles(id), reason text not null
);
create table public.room_handover_holds (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id),
  segment_id uuid not null references public.room_segments(id), idol_id uuid not null references public.profiles(id),
  held_at timestamptz not null default clock_timestamp(), held_by uuid not null references public.profiles(id),
  released_at timestamptz, released_by uuid references public.profiles(id), reason text not null
);
create unique index one_room_hold on public.room_handover_holds(room_id) where released_at is null;
create table public.idol_operation_events (
  id uuid primary key default gen_random_uuid(), idol_id uuid not null references public.profiles(id),
  work_date date not null, segment_id uuid references public.room_segments(id),
  visit_id uuid references public.room_visits(id), loan_id uuid references public.device_loans(id),
  kind text not null, room_code text, device_code text, happened_at timestamptz not null default clock_timestamp(),
  late_seconds integer not null default 0, important boolean not null default false,
  message text not null, actor_id uuid references public.profiles(id)
);
create index idol_events_by_day on public.idol_operation_events(idol_id,work_date,happened_at);
create index important_notification_inbox on public.notifications(recipient_id,created_at desc) where priority='important' and read_at is null;
create index room_queue_order on public.room_segments(room_id,starts_at,id) where status in ('approved','completed');
create index visit_loans on public.device_loans(room_visit_id,checked_out_at);
alter table public.room_queue_skips enable row level security;
alter table public.room_handover_holds enable row level security;
alter table public.idol_operation_events enable row level security;
revoke all on public.room_queue_skips,public.room_handover_holds,public.idol_operation_events from anon,authenticated;
grant select on public.room_queue_skips,public.room_handover_holds,public.idol_operation_events to authenticated;
create policy skips_team_read on public.room_queue_skips for select to authenticated using(private.can_read_idol(idol_id));
create policy holds_team_read on public.room_handover_holds for select to authenticated using(private.can_read_idol(idol_id));
create policy events_team_read on public.idol_operation_events for select to authenticated using(private.can_read_idol(idol_id));

create function private.record_idol_operation(seg uuid, visit uuid, loan uuid, event_kind text, message text, late integer default 0, device_label text default null)
returns void language plpgsql security definer set search_path='' as $$
declare who uuid; day date; room_label text; event_id uuid; urgent boolean:=event_kind='late_checkin';
begin
  select s.idol_id,p.work_date,r.code into strict who,day,room_label
  from public.room_segments g join public.live_sessions s on s.id=g.session_id
  join public.daily_plans p on p.id=s.daily_plan_id join public.rooms r on r.id=g.room_id where g.id=seg;
  insert into public.idol_operation_events(idol_id,work_date,segment_id,visit_id,loan_id,kind,room_code,device_code,late_seconds,important,message,actor_id)
  values(who,day,seg,visit,loan,event_kind,room_label,device_label,greatest(0,late),urgent,message,auth.uid()) returning id into event_id;
  insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body,priority,dedupe_key,work_date)
  select p.id,who,case when event_kind like 'device_%' then 'device' else 'attendance' end,
    case when urgent then 'Quan trọng: trễ nhận phòng' else 'Cập nhật ca của Idol' end,
    coalesce((select coalesce(nullif(nickname,''),full_name) from public.profiles where id=who),'Idol')||' · '||room_label||': '||message,
    case when urgent then 'important' else 'normal' end,'operation:'||event_id::text,day
  from public.profiles p where p.status='active' and (p.id=who or p.id=private.schedule_operator(who) or p.role='admin');
end; $$;

-- Returns NULL while an earlier turn is unresolved or the room is occupied/held.
-- No identity or private information about the preceding Idol is exposed.
create function private.room_entry_deadline(segment uuid) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare g public.room_segments; day date; previous uuid; ready timestamptz; last_release timestamptz; hold_release timestamptz;
begin
  select * into g from public.room_segments where id=segment;
  select p.work_date into day from public.live_sessions s join public.daily_plans p on p.id=s.daily_plan_id where s.id=g.session_id;
  if g.id is null then return null; end if;
  if exists(select 1 from public.room_visits where room_id=g.room_id and segment_id<>g.id and checked_out_at is null)
    or exists(select 1 from public.room_handover_holds where room_id=g.room_id and released_at is null) then return null; end if;
  if exists(select 1 from public.room_segments prev join public.live_sessions s on s.id=prev.session_id
    join public.daily_plans p on p.id=s.daily_plan_id
    where prev.room_id=g.room_id and p.work_date=day and prev.starts_at<g.starts_at and prev.status in ('approved','completed')
      and not exists(select 1 from public.room_visits v where v.segment_id=prev.id and v.checked_out_at is not null)
      and not exists(select 1 from public.room_queue_skips k where k.segment_id=prev.id)) then return null; end if;
  select prev.id,coalesce(v.checkout_confirmed_at,v.checked_out_at,k.skipped_at) into previous,ready
  from public.room_segments prev join public.live_sessions s on s.id=prev.session_id join public.daily_plans p on p.id=s.daily_plan_id
  left join public.room_visits v on v.segment_id=prev.id left join public.room_queue_skips k on k.segment_id=prev.id
  where prev.room_id=g.room_id and p.work_date=day and prev.starts_at<g.starts_at and prev.status in ('approved','completed')
  order by prev.starts_at desc,prev.id desc limit 1;
  select max(coalesce(checkout_confirmed_at,checked_out_at)) into last_release from public.room_visits where room_id=g.room_id and segment_id<>g.id;
  select max(released_at) into hold_release from public.room_handover_holds where room_id=g.room_id;
  return greatest(g.starts_at,ready,last_release,hold_release)
    + case when previous is not null or last_release>g.starts_at or hold_release>g.starts_at then interval '5 minutes' else interval '0' end;
end; $$;

create or replace function private.idol_segment(target uuid, idol uuid) returns public.room_segments
language plpgsql security definer set search_path='' as $$
declare g public.room_segments; s public.live_sessions; day date; today date:=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into g from public.room_segments where id=target;
  select * into s from public.live_sessions where id=g.session_id;
  select work_date into day from public.daily_plans where id=s.daily_plan_id;
  if g.id is null or s.idol_id<>idol or s.status<>'approved' or g.status<>'approved'
    or day not between today-1 and today or exists(select 1 from public.room_queue_skips where segment_id=g.id)
  then raise exception 'SEGMENT_UNAVAILABLE'; end if;
  return g;
end; $$;

create or replace function private.check_room_entry(segment uuid, idol uuid, scan_time timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare g public.room_segments;
begin
  g:=private.idol_segment(segment,idol);
  if not exists(select 1 from public.rooms where id=g.room_id and status='available') then raise exception 'ROOM_UNAVAILABLE'; end if;
  if scan_time<g.starts_at-interval '30 minutes' then raise exception 'CHECKIN_TOO_EARLY'; end if;
  if exists(select 1 from public.room_visits where segment_id=g.id) then raise exception 'ALREADY_CHECKED_IN'; end if;
  if exists(select 1 from public.room_visits where idol_id=idol and checked_out_at is null) then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
  if exists(select 1 from public.room_segments prev where prev.session_id=g.session_id and prev.starts_at<g.starts_at
    and prev.status not in ('completed','cancelled') and not exists(select 1 from public.room_queue_skips k where k.segment_id=prev.id))
  then raise exception 'CHECKOUT_PREVIOUS_ROOM'; end if;
  if private.room_entry_deadline(g.id) is null then raise exception 'ROOM_QUEUE_WAIT'; end if;
  if exists(select 1 from public.room_visits where room_id=g.room_id and coalesce(checkout_confirmed_at,checked_out_at)>scan_time)
  then raise exception 'ROOM_QUEUE_WAIT'; end if;
end; $$;

create or replace function private.guard_room_visit() returns trigger language plpgsql set search_path='' as $$
declare segment public.room_segments; owner_id uuid;
begin
  if tg_op='INSERT' then
    select * into strict segment from public.room_segments where id=new.segment_id;
    select idol_id into owner_id from public.live_sessions where id=segment.session_id;
    if new.idol_id<>owner_id or segment.status<>'approved' then raise exception 'Visit must match idol and approved room segment'; end if;
    new.room_id:=segment.room_id; new.scheduled_start_snapshot:=segment.starts_at; new.scheduled_end_snapshot:=segment.ends_at;
    new.checkin_confirmed_at:=clock_timestamp();
    new.entry_due_at:=coalesce(new.entry_due_at,segment.starts_at);
  else
    if row(new.segment_id,new.idol_id,new.room_id,new.checked_in_at,new.scheduled_start_snapshot,new.scheduled_end_snapshot,new.checkin_confirmed_at,new.entry_due_at)
      is distinct from row(old.segment_id,old.idol_id,old.room_id,old.checked_in_at,old.scheduled_start_snapshot,old.scheduled_end_snapshot,old.checkin_confirmed_at,old.entry_due_at)
    then raise exception 'Attendance timestamps and schedule snapshots cannot be rewritten'; end if;
    if old.checked_out_at is not null and row(new.checked_out_at,new.checkout_confirmed_at) is distinct from row(old.checked_out_at,old.checkout_confirmed_at)
    then raise exception 'Completed checkout cannot be rewritten'; end if;
  end if;
  if btrim(new.before_photo_path)='' then raise exception 'Check-in photo required'; end if;
  if new.checked_out_at is not null and (new.after_photo_path is null or btrim(new.after_photo_path)='') then raise exception 'Checkout photo required'; end if;
  return new;
end; $$;

create function private.close_finished_session(session_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare plan uuid;
begin
  if not exists(select 1 from public.room_segments g where g.session_id=close_finished_session.session_id and g.status not in ('completed','cancelled')
    and not exists(select 1 from public.room_queue_skips k where k.segment_id=g.id)) then
    update public.live_sessions set status='completed' where id=session_id returning daily_plan_id into plan;
    if not exists(select 1 from public.live_sessions where daily_plan_id=plan and status not in ('completed','cancelled')) then
      update public.daily_plans set status='completed',version=version+1 where id=plan;
    end if;
  end if;
end; $$;

create or replace function public.begin_room_capture(segment uuid, qr uuid, phase text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; v public.room_visits; ticket uuid:=gen_random_uuid(); scanned timestamptz; path text; due timestamptz;
begin
  actor:=private.schedule_actor(); scanned:=clock_timestamp();
  if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
  if phase is null or phase not in ('checkin','checkout') then raise exception 'INVALID_INPUT'; end if;
  select * into g from public.room_segments where id=segment;
  if g.id is null or not exists(select 1 from public.rooms where id=g.room_id and qr_token=qr) then raise exception 'WRONG_ROOM_QR'; end if;
  if phase='checkin' then
    perform private.check_room_entry(segment,actor.id,scanned); due:=private.room_entry_deadline(segment);
  else
    select * into v from public.room_visits where segment_id=segment and idol_id=actor.id and checked_out_at is null;
    if v.id is null then raise exception 'VISIT_NOT_FOUND'; end if;
  end if;
  path:=actor.id::text||'/'||ticket::text||'.jpg';
  insert into public.room_capture_tickets(id,idol_id,segment_id,phase,scanned_at,photo_path,visit_id,entry_due_at)
  values(ticket,actor.id,segment,phase,scanned,path,v.id,due);
  return jsonb_build_object('id',ticket,'path',path,'scanned_at',scanned);
end; $$;

create or replace function public.finish_room_capture(ticket_id uuid, note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; t public.room_capture_tickets; g public.room_segments; v public.room_visits; visit uuid; late integer; next_segment uuid;
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
  if t.phase='checkin' then
    perform private.check_room_entry(g.id,actor.id,t.scanned_at);
    if t.entry_due_at is distinct from private.room_entry_deadline(g.id) then raise exception 'CAPTURE_ROOM_CHANGED'; end if;
    insert into public.room_visits(segment_id,idol_id,checked_in_at,before_photo_path,checkin_note,entry_due_at)
    values(g.id,actor.id,t.scanned_at,t.photo_path,btrim(coalesce(note,'')),coalesce(t.entry_due_at,private.room_entry_deadline(g.id)))
    returning id,entry_late_seconds into visit,late;
    perform private.record_idol_operation(g.id,visit,null,case when late>0 then 'late_checkin' else 'room_checkin' end,
      case when late>0 then 'Check-in trễ '||ceil(late/60.0)::integer||' phút so với hạn nhận phòng.' else 'Đã check-in phòng đúng hạn.' end,late);
  else
    select * into v from public.room_visits where id=t.visit_id and idol_id=actor.id and checked_out_at is null for update;
    if v.id is null then raise exception 'VISIT_NOT_FOUND'; end if;
    visit:=v.id;
    update public.room_visits set checked_out_at=t.scanned_at,checkout_confirmed_at=clock_timestamp(),after_photo_path=t.photo_path,checkout_reason=nullif(btrim(coalesce(note,'')),'') where id=visit;
    update public.room_segments set status='completed' where id=g.id;
    update public.requests set status='cancelled',revision=revision+1 where kind='device_borrow' and room_segment_id=g.id and subject_idol_id=actor.id and status='pending';
    perform private.close_finished_session(g.session_id);
    perform private.record_idol_operation(g.id,visit,null,'room_checkout','Đã checkout và bàn giao phòng. '||coalesce(note,''));
    select n.id into next_segment from public.room_segments n join public.live_sessions ns on ns.id=n.session_id
      join public.daily_plans np on np.id=ns.daily_plan_id
      where n.room_id=g.room_id and n.starts_at>g.starts_at and n.status='approved'
        and np.work_date between (g.starts_at at time zone 'Asia/Ho_Chi_Minh')::date and (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
        and not exists(select 1 from public.room_queue_skips k where k.segment_id=n.id)
      order by n.starts_at,n.id limit 1;
    if next_segment is not null then perform private.record_idol_operation(next_segment,null,null,'room_ready','Phòng đã được trả. Mở ca để xem hạn check-in của bạn.'); end if;
  end if;
  insert into public.room_visit_photos(visit_id,phase,storage_path,captured_at,expires_at)
  values(visit,t.phase,t.photo_path,clock_timestamp(),clock_timestamp()+interval '30 days');
  update public.room_capture_tickets set used_at=clock_timestamp(),visit_id=visit where id=t.id;
  return visit;
end; $$;

create or replace function public.scan_device(segment uuid, qr uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; d public.devices; v public.room_visits; held public.device_loans; loan uuid; req uuid;
begin
  actor:=private.schedule_actor(); if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
  g:=private.idol_segment(segment,actor.id);
  select * into v from public.room_visits where segment_id=g.id and idol_id=actor.id and checked_out_at is null;
  if v.id is null then raise exception 'ROOM_CHECKIN_REQUIRED'; end if;
  select * into d from public.devices where qr_token=qr for update;
  if d.id is null or d.status<>'available' then raise exception 'DEVICE_UNAVAILABLE'; end if;
  select * into held from public.device_loans where idol_id=actor.id and returned_at is null;
  if held.id is not null and held.device_id=d.id and held.room_visit_id=v.id then return jsonb_build_object('status','received','id',held.id); end if;
  if held.id is not null or exists(select 1 from public.device_loans where device_id=d.id and returned_at is null) then raise exception 'DEVICE_OR_IDOL_BUSY'; end if;
  if d.assigned_room_id=g.room_id then
    insert into public.device_loans(device_id,idol_id,session_id,room_visit_id) values(d.id,actor.id,g.session_id,v.id) returning id into loan;
    update public.room_visits set device_choice='company' where id=v.id;
    update public.requests set status='cancelled',revision=revision+1 where kind='device_borrow' and subject_idol_id=actor.id and status='pending';
    perform private.record_idol_operation(g.id,v.id,loan,'device_received','Đã nhận máy '||d.code||' đúng phòng, tự xác nhận.',0,d.code);
    return jsonb_build_object('status','received','id',loan);
  end if;
  if not exists(select 1 from public.profiles where id=d.manager_id and status='active' and role='operator') then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;
  -- Keep one current request for this visit; changing the scanned machine supersedes the old choice.
  update public.requests set status='cancelled',revision=revision+1 where kind='device_borrow' and subject_idol_id=actor.id and status='pending'
    and (device_id<>d.id or room_segment_id is distinct from g.id);
  select id into req from public.requests where kind='device_borrow' and subject_idol_id=actor.id and device_id=d.id and room_segment_id=g.id and status='pending';
  if req is null then
    insert into public.requests(kind,submitted_by,assigned_reviewer_id,subject_idol_id,session_id,room_segment_id,device_id,details)
    values('device_borrow',actor.id,d.manager_id,actor.id,g.session_id,g.id,d.id,jsonb_build_object('room_id',g.room_id,'visit_id',v.id)) returning id into req;
    insert into public.notifications(recipient_id,request_id,event_type,title,body)
    values(d.manager_id,req,'device_borrow','Cần duyệt máy không đúng phòng','Có yêu cầu mượn máy '||d.code||'. Mở Ca live & Thiết bị để duyệt.');
    perform private.record_idol_operation(g.id,v.id,null,'device_requested','Đang chờ chủ máy duyệt '||d.code||' vì máy không gắn với phòng này.',0,d.code);
  end if;
  return jsonb_build_object('status','waiting','id',req);
end; $$;

create or replace function public.request_device_return(qr uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; loan public.device_loans; d public.devices; seg uuid; finished timestamptz;
begin
  actor:=private.schedule_actor(); if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
  select * into d from public.devices where qr_token=qr for update;
  select * into loan from public.device_loans where device_id=d.id and idol_id=actor.id order by checked_out_at desc,id desc limit 1 for update;
  if loan.id is null then raise exception 'LOAN_NOT_FOUND'; end if;
  if loan.returned_at is not null then return loan.id; end if;
  finished:=clock_timestamp();
  update public.device_loans set return_requested_at=finished,returned_at=finished,return_confirmed_by=actor.id where id=loan.id;
  update public.requests set status='approved',decided_by=actor.id,decided_at=finished,decision_reason='Idol tự quét trả máy theo quy tắc mới',revision=revision+1
    where kind='device_return' and device_loan_id=loan.id and status='pending';
  select segment_id into seg from public.room_visits where id=loan.room_visit_id;
  if seg is null then select id into seg from public.room_segments where session_id=loan.session_id order by starts_at,id limit 1; end if;
  if seg is not null then perform private.record_idol_operation(seg,loan.room_visit_id,loan.id,'device_returned','Đã quét trả máy '||d.code||', tự xác nhận.',0,d.code); end if;
  return loan.id;
end; $$;

create or replace function public.review_device(request_id uuid, expected_revision integer, approve boolean, reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.requests; d public.devices; g public.room_segments; v public.room_visits; loan uuid;
begin
  actor:=private.schedule_actor();
  select * into r from public.requests where id=request_id for update;
  if r.id is null or r.kind<>'device_borrow' or r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if r.revision is distinct from expected_revision then raise exception 'STALE_REQUEST'; end if;
  if approve is null or length(coalesce(reason,''))>500 or (not approve and length(btrim(coalesce(reason,'')))=0) then raise exception 'REASON_REQUIRED'; end if;
  select * into d from public.devices where id=r.device_id for update;
  if not coalesce(actor.role='admin' or(actor.role='operator' and actor.id=d.manager_id),false) then raise exception 'FORBIDDEN'; end if;
  if approve then
    if not exists(select 1 from public.profiles where id=r.subject_idol_id and role='idol' and status='active') then raise exception 'ACTIVE_REQUIRED'; end if;
    g:=private.idol_segment(r.room_segment_id,r.subject_idol_id);
    select * into v from public.room_visits where segment_id=g.id and idol_id=r.subject_idol_id and checked_out_at is null;
    if v.id is null then raise exception 'ROOM_CHECKIN_REQUIRED'; end if;
    if d.status<>'available' then raise exception 'DEVICE_UNAVAILABLE'; end if;
    if exists(select 1 from public.device_loans where returned_at is null and (device_id=d.id or idol_id=r.subject_idol_id)) then raise exception 'DEVICE_OR_IDOL_BUSY'; end if;
    insert into public.device_loans(device_id,idol_id,session_id,authorization_request_id,room_visit_id)
    values(d.id,r.subject_idol_id,g.session_id,r.id,v.id) returning id into loan;
    update public.room_visits set device_choice='company' where id=v.id;
    update public.requests set device_loan_id=loan where id=r.id;
    update public.requests set status='cancelled',revision=revision+1 where subject_idol_id=r.subject_idol_id and kind='device_borrow' and id<>r.id and status='pending';
  end if;
  update public.requests set status=case when approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
    decided_by=actor.id,decided_at=clock_timestamp(),decision_reason=btrim(coalesce(reason,'')),revision=revision+1 where id=r.id;
  perform private.record_idol_operation(r.room_segment_id,v.id,loan,case when approve then 'device_received' else 'device_rejected' end,
    case when approve then 'Chủ máy đã duyệt nhận ' else 'Chủ máy từ chối: '||coalesce(reason,'')||'. Máy ' end||d.code,0,d.code);
end; $$;

create or replace function public.device_request_inbox() returns table(id uuid,revision integer,kind text,device_code text,idol_name text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.id,r.revision,r.kind,d.code,coalesce(nullif(p.nickname,''),p.full_name),r.created_at from public.requests r
  join public.devices d on d.id=r.device_id join public.profiles p on p.id=r.subject_idol_id
  where r.status='pending' and r.kind='device_borrow' and (private.current_role()='admin' or(private.current_role()='operator' and d.manager_id=auth.uid()))
  order by r.created_at,r.id
$$;

create function public.choose_personal_device(segment uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor public.profiles; v public.room_visits;
begin
  actor:=private.schedule_actor(); if actor.role<>'idol' then raise exception 'IDOL_REQUIRED'; end if;
  select * into v from public.room_visits where segment_id=segment and idol_id=actor.id and checked_out_at is null;
  if v.id is null then raise exception 'ROOM_CHECKIN_REQUIRED'; end if;
  if exists(select 1 from public.device_loans where idol_id=actor.id and returned_at is null) then raise exception 'DEVICE_OR_IDOL_BUSY'; end if;
  if v.device_choice='own' then return; end if;
  update public.room_visits set device_choice='own' where id=v.id;
  update public.requests set status='cancelled',revision=revision+1 where kind='device_borrow' and subject_idol_id=actor.id and status='pending';
  perform private.record_idol_operation(segment,v.id,null,'device_declined','Không dùng máy công ty cho lượt vào phòng này.');
end; $$;

create function public.skip_room_turn(segment uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; who uuid;
begin
  actor:=private.schedule_actor(); select * into g from public.room_segments where id=segment;
  select idol_id into who from public.live_sessions where id=g.session_id;
  if actor.role not in ('admin','operator') or not private.can_read_idol(who) then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(reason,''))) not between 1 and 500 then raise exception 'REASON_REQUIRED'; end if;
  if g.status<>'approved' or exists(select 1 from public.room_visits where segment_id=g.id) then raise exception 'TURN_ALREADY_STARTED'; end if;
  if exists(select 1 from public.room_queue_skips where segment_id=g.id) then return; end if;
  insert into public.room_queue_skips(segment_id,idol_id,skipped_by,reason) values(g.id,who,actor.id,btrim(reason));
  update public.requests set status='cancelled',revision=revision+1 where room_segment_id=g.id and kind='device_borrow' and status='pending';
  perform private.close_finished_session(g.session_id);
  perform private.record_idol_operation(g.id,null,null,'turn_skipped','Vận hành bỏ qua lượt: '||btrim(reason));
end; $$;

create function public.set_room_handover(segment uuid, ready boolean, reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare actor public.profiles; g public.room_segments; who uuid; hold uuid; day date;
begin
  actor:=private.schedule_actor(); select * into g from public.room_segments where id=segment;
  select idol_id into who from public.live_sessions where id=g.session_id;
  if actor.role not in ('admin','operator') or not private.can_read_idol(who) then raise exception 'FORBIDDEN'; end if;
  if ready is null then raise exception 'INVALID_INPUT'; end if;
  select p.work_date into day from public.live_sessions s join public.daily_plans p on p.id=s.daily_plan_id where s.id=g.session_id;
  if g.id is null or g.status not in ('approved','completed') or
    (day<>(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date and
     not exists(select 1 from public.room_visits where segment_id=g.id and checked_out_at is null) and
     not exists(select 1 from public.room_handover_holds where segment_id=g.id and released_at is null))
  then raise exception 'SEGMENT_UNAVAILABLE'; end if;
  if ready then
    update public.room_handover_holds set released_at=clock_timestamp(),released_by=actor.id where room_id=g.room_id and released_at is null returning id into hold;
    if hold is not null then perform private.record_idol_operation(g.id,null,null,'room_ready','Phòng đã sẵn sàng bàn giao.'); end if;
  else
    if length(btrim(coalesce(reason,''))) not between 1 and 500 then raise exception 'REASON_REQUIRED'; end if;
    if exists(select 1 from public.room_visits where room_id=g.room_id and segment_id<>g.id and checked_out_at is null) then raise exception 'ROOM_CONFLICT'; end if;
    if exists(select 1 from public.room_visits v join public.room_segments later on later.id=v.segment_id where v.room_id=g.room_id and later.starts_at>g.starts_at) then raise exception 'TURN_ALREADY_STARTED'; end if;
    insert into public.room_handover_holds(room_id,segment_id,idol_id,held_by,reason) values(g.room_id,g.id,who,actor.id,btrim(reason)) on conflict(room_id) where released_at is null do nothing returning id into hold;
    if hold is not null then perform private.record_idol_operation(g.id,null,null,'room_hold','Phòng chưa sẵn sàng bàn giao: '||btrim(reason)); end if;
  end if;
end; $$;

-- A scoped day report: the governing identity is always the Idol, never the room owner.
create function public.idol_operations_day(day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if private.current_role() is null then raise exception 'ACTIVE_REQUIRED' using errcode='42501'; end if;
  if day is null then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(to_jsonb(report) order by report.work_date,report.username,report.scheduled_start,report.segment_id),'[]'::jsonb) into result from (
    select g.id segment_id,s.idol_id,pr.full_name idol_name,coalesce(a.username,pr.nickname,pr.full_name) username,p.work_date,
      r.id room_id,r.code room_code,g.starts_at scheduled_start,g.ends_at scheduled_end,
      v.id visit_id,v.checked_in_at,v.checked_out_at,v.checkout_confirmed_at,
      coalesce(v.entry_due_at,case when v.id is null then private.room_entry_deadline(g.id) else v.scheduled_start_snapshot end) entry_due_at,
      coalesce(v.entry_late_seconds,0) late_seconds,coalesce(v.device_choice,'pending') device_choice,
      case when k.segment_id is not null then 'skipped' when v.checked_out_at is not null then 'completed'
        when v.id is not null then 'in_room' when g.status='approved' then 'waiting' else g.status end status,
      k.reason skip_reason,exists(select 1 from public.room_handover_holds h where h.room_id=g.room_id and h.released_at is null) room_on_hold,
      l.id loan_id,d.code device_code,l.checked_out_at device_received_at,l.returned_at device_returned_at,
      req.id pending_device_request,req.details->>'device_code' requested_device_code,
      coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'phase',f.phase)) from public.room_visit_photos f where f.visit_id=v.id and f.deleted_at is null and f.expires_at>now()),'[]'::jsonb) photos,
      coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'message',e.message,'happened_at',e.happened_at,'important',e.important,'late_seconds',e.late_seconds) order by e.happened_at,e.id)
        from public.idol_operation_events e where e.segment_id=g.id),'[]'::jsonb) events
    from public.room_segments g join public.live_sessions s on s.id=g.session_id join public.daily_plans p on p.id=s.daily_plan_id
    join public.profiles pr on pr.id=s.idol_id join public.rooms r on r.id=g.room_id left join public.platform_accounts a on a.idol_id=s.idol_id
    left join public.room_visits v on v.segment_id=g.id left join public.room_queue_skips k on k.segment_id=g.id
    left join lateral (select * from public.device_loans dl where dl.room_visit_id=v.id order by dl.checked_out_at desc,dl.id desc limit 1) l on true
    left join public.devices d on d.id=l.device_id
    left join lateral (select rq.id,rq.details||jsonb_build_object('device_code',dv.code) as details from public.requests rq join public.devices dv on dv.id=rq.device_id
      where rq.room_segment_id=g.id and rq.subject_idol_id=s.idol_id and rq.kind='device_borrow' and rq.status='pending' order by rq.created_at desc limit 1) req on true
    where private.can_read_idol(s.idol_id) and g.status in ('approved','completed')
      and (p.work_date=day or (v.id is not null and v.checked_out_at is null)
        or exists(select 1 from public.room_handover_holds h where h.segment_id=g.id and h.released_at is null))
  ) report;
  return result;
end; $$;

create function public.my_open_device() returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(q) from (select l.id,l.room_visit_id,d.code device_code,l.checked_out_at from public.device_loans l join public.devices d on d.id=l.device_id
    where l.idol_id=auth.uid() and private.current_role()='idol' and l.returned_at is null) q
$$;

-- Prevent later schedule edits from erasing a skipped/held turn's audit history.
create or replace function private.schedule_mutable(plan uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.live_sessions s where s.daily_plan_id=plan and (
    exists(select 1 from public.room_segments g where g.session_id=s.id and (
      exists(select 1 from public.room_visits v where v.segment_id=g.id) or exists(select 1 from public.room_queue_skips k where k.segment_id=g.id)
      or exists(select 1 from public.room_handover_holds h where h.segment_id=g.id)))
    or exists(select 1 from public.device_loans l where l.session_id=s.id))) then raise exception 'ATTENDANCE_EXISTS'; end if;
end; $$;

revoke all on function private.record_idol_operation(uuid,uuid,uuid,text,text,integer,text),private.room_entry_deadline(uuid),private.close_finished_session(uuid) from public,anon,authenticated;
revoke all on function public.choose_personal_device(uuid),public.skip_room_turn(uuid,text),public.set_room_handover(uuid,boolean,text),public.idol_operations_day(date),public.my_open_device() from public,anon;
grant execute on function public.choose_personal_device(uuid),public.skip_room_turn(uuid,text),public.set_room_handover(uuid,boolean,text),public.idol_operations_day(date),public.my_open_device() to authenticated;
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202610010019')$$;
insert into private.app_schema_migrations(version) values('202610010019');
commit;
