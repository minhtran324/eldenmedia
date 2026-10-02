-- Apply after 011. Existing hourly Cron job keeps calling the same function.
begin;
create or replace function private.send_birthday_reminders(
 reference_date date default (now() at time zone 'Asia/Ho_Chi_Minh')::date
) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if reference_date is null then raise exception 'Date required'; end if;
 with upcoming as (
  select p.id,coalesce(nullif(p.nickname,''),nullif(p.full_name,''),'Thành viên') as display_name,
   reference_date+days.offset_days as birthday_date,days.offset_days
  from public.profiles p cross join generate_series(0,3) as days(offset_days)
  where p.status='active' and p.role in ('idol','operator') and p.birthday_visible
   and to_char(p.birth_date,'MM-DD')=to_char(reference_date+days.offset_days,'MM-DD')
 ), recipients as (
  select u.*,r.id as recipient_id from upcoming u cross join public.profiles r
  where r.status='active' and r.role in ('admin','operator','idol')
 )
 insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body,dedupe_key)
 select recipient_id,id,'birthday_reminder',
  case offset_days when 0 then 'Sinh nhật hôm nay' when 1 then 'Sinh nhật ngày mai'
   else 'Sinh nhật sau '||offset_days::text||' ngày' end,
  display_name||' có sinh nhật ngày '||to_char(birthday_date,'DD/MM')||'.',
  -- Preserve the original key so reminders sent before this migration stay deduplicated.
  'birthday:'||id::text||':'||birthday_date::text
 from recipients
 on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
 get diagnostics n = row_count;
 return n;
end; $$;
revoke all on function private.send_birthday_reminders(date) from public,anon,authenticated;
drop policy notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(
 private.current_role()='admin' or (recipient_id=auth.uid() and private.current_role() is not null and (
  subject_idol_id is null or private.can_read_idol(subject_idol_id) or
  (event_type='birthday_reminder' and private.current_role() in ('operator','idol') and exists(
   select 1 from public.company_settings where id and birthday_reminder_scope='company'))
 ))
);
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('application','elden-media','schema_version','202609300012')
$$;
insert into private.app_schema_migrations(version) values('202609300012');
commit;
