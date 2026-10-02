begin;
-- Split new operational messages at the producer, before adding the idol name.
create or replace function private.operation_notify(idol uuid, req uuid, message text) returns void
language sql security definer set search_path='' as $$
 insert into public.notifications(recipient_id,subject_idol_id,request_id,event_type,title,body)
 select p.id,idol,req,
  case when message like 'Check-in muộn %' or message like 'Đã checkout phòng,%' then 'attendance' else 'device' end,
  case when message like 'Check-in muộn %' or message like 'Đã checkout phòng,%' then 'Check-in / out' else 'Điện thoại' end,
  coalesce((select full_name from public.profiles where id=idol),'Idol')||': '||message
 from public.profiles p where p.status='active' and (p.id=idol or p.id=private.schedule_operator(idol) or p.role='admin')
$$;
-- Preserve existing notification ids, read state and birthday dedupe keys.
update public.notifications set event_type=case
 when body ~ ': (Check-in muộn |Đã checkout phòng,)' then 'attendance' else 'device' end
where event_type='live_operations';
alter table public.notifications add column category text generated always as (
 case when event_type='schedule' then 'schedule'
 when event_type='room_borrow' then 'rooms'
 when event_type in ('device','device_borrow','device_return') then 'devices'
 when event_type='attendance' then 'attendance'
 when event_type='birthday_reminder' then 'birthdays'
 else 'system' end
) stored;
create index notifications_inbox_page on public.notifications(recipient_id,category,created_at desc,id);
create index notifications_inbox_unread on public.notifications(recipient_id,category) where read_at is null;
-- Invoker intentionally preserves the existing visibility rules after team changes.
create function public.my_notification_counts()
returns table(category text,unread_count bigint) language sql stable security invoker set search_path='' as $$
 select n.category,count(*) from public.notifications n
 where n.recipient_id=auth.uid() and n.read_at is null group by n.category
$$;
revoke all on function public.my_notification_counts() from public,anon;
grant execute on function public.my_notification_counts() to authenticated;
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('application','elden-media','schema_version','202609300011')
$$;
insert into private.app_schema_migrations(version) values('202609300011');
commit;
