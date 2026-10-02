-- Read access and narrowly scoped Admin RPCs. Operational writes remain closed.
begin;
create function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=auth.uid() and status='active'
$$;
create function private.can_read_idol(target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role()='admin' or
    (private.current_role() is not null and target_id=auth.uid()) or
    (private.current_role()='operator' and exists(
      select 1 from public.idol_assignments where idol_id=target_id and operator_id=auth.uid()
        and starts_at<=now() and (ends_at is null or ends_at>now())
    )),false)
$$;
grant usage on schema private to authenticated;
revoke all on function private.current_role() from public,anon,authenticated;
revoke all on function private.can_read_idol(uuid) from public,anon,authenticated;
grant execute on function private.current_role(),private.can_read_idol(uuid) to authenticated;

create policy profiles_team_read on public.profiles for select to authenticated using(private.can_read_idol(id));
grant select on public.idol_assignments, public.daily_plans, public.live_sessions, public.room_segments,
  public.device_loans, public.room_visits, public.platform_accounts, public.daily_metrics,
  public.requests, public.notifications, public.room_visit_photos, public.tiktok_identity_history,
  public.rooms, public.devices, public.floors, public.company_settings, public.import_batches, public.audit_logs
to authenticated;

create policy assignments_read on public.idol_assignments for select to authenticated using(private.can_read_idol(idol_id));
create policy plans_read on public.daily_plans for select to authenticated using(private.can_read_idol(idol_id));
create policy sessions_read on public.live_sessions for select to authenticated using(private.can_read_idol(idol_id));
create policy segments_read on public.room_segments for select to authenticated using(
  exists(select 1 from public.live_sessions s where s.id=session_id and private.can_read_idol(s.idol_id)));
create policy loans_read on public.device_loans for select to authenticated using(private.can_read_idol(idol_id));
create policy visits_read on public.room_visits for select to authenticated using(private.can_read_idol(idol_id));
create policy accounts_read on public.platform_accounts for select to authenticated using(private.can_read_idol(idol_id));
create policy metrics_read on public.daily_metrics for select to authenticated using(
  exists(select 1 from public.platform_accounts a where a.id=platform_account_id and private.can_read_idol(a.idol_id)));
create policy photos_read on public.room_visit_photos for select to authenticated using(
  exists(select 1 from public.room_visits v where v.id=visit_id and private.can_read_idol(v.idol_id)));
create policy tiktok_history_read on public.tiktok_identity_history for select to authenticated using(
  exists(select 1 from public.platform_accounts a where a.id=account_id and private.can_read_idol(a.idol_id)));
-- Cross-team resource requests will use a minimal summary RPC; don't expose raw payloads here.
create policy requests_read on public.requests for select to authenticated using(
  private.current_role()='admin' or (subject_idol_id is not null and private.can_read_idol(subject_idol_id)));
create policy notifications_read on public.notifications for select to authenticated using(
  private.current_role()='admin' or
  (recipient_id=auth.uid() and private.current_role() is not null
    and (subject_idol_id is null or private.can_read_idol(subject_idol_id))));
create policy rooms_directory on public.rooms for select to authenticated using(private.current_role() is not null);
create policy devices_directory on public.devices for select to authenticated using(private.current_role() is not null);
create policy floors_directory on public.floors for select to authenticated using(private.current_role() is not null);
create policy settings_read on public.company_settings for select to authenticated using(private.current_role() is not null);
create policy imports_admin on public.import_batches for select to authenticated using(private.current_role()='admin');
create policy audit_admin on public.audit_logs for select to authenticated using(private.current_role()='admin');

create function public.admin_assign_idol(target_idol uuid, target_operator uuid) returns void
language plpgsql security definer set search_path='' as $$
declare idol public.profiles; op public.profiles; current_assignment public.idol_assignments; changed_at timestamptz:=clock_timestamp();
begin
  if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
  -- Deterministic row locks serialize approval/transfers and prevent assignment races.
  perform 1 from public.profiles where id in (target_idol,target_operator) order by id for update;
  select * into strict idol from public.profiles where id=target_idol;
  select * into strict op from public.profiles where id=target_operator;
  if idol.role<>'idol' or idol.status='suspended' then raise exception 'Target must be a pending or active idol'; end if;
  if op.role<>'operator' or op.status<>'active' then raise exception 'Target operator must be active'; end if;
  if exists(select 1 from public.idol_assignments where idol_id=target_idol and starts_at>changed_at)
    then raise exception 'Future assignment exists; resolve it before an immediate transfer'; end if;
  select * into current_assignment from public.idol_assignments where idol_id=target_idol
    and starts_at<=changed_at and (ends_at is null or ends_at>changed_at) for update;
  if current_assignment.operator_id is distinct from target_operator then
    if current_assignment.id is not null then
      update public.idol_assignments set ends_at=changed_at where id=current_assignment.id;
    end if;
    insert into public.idol_assignments(idol_id,operator_id,starts_at) values(target_idol,target_operator,changed_at);
  end if;
  update public.profiles set status='active' where id=target_idol;
  update public.requests set status='approved',decided_by=auth.uid(),decided_at=changed_at
    where kind='account_approval' and subject_idol_id=target_idol and status='pending';
  insert into public.notifications(recipient_id,subject_idol_id,event_type,title,body)
  values(target_idol,target_idol,'assignment','Cập nhật người phụ trách','Admin đã duyệt tài khoản hoặc cập nhật vận hành phụ trách.'),
        (target_operator,target_idol,'assignment','Idol được phân công','Bạn có thể xem toàn bộ lịch sử của idol được phân công.');
end; $$;

-- Auth user creation must happen on trusted server via Supabase Admin API, not this SQL function.
create function public.admin_activate_operator(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
  select * into strict p from public.profiles where id=target_user for update;
  if p.status<>'pending' or p.role<>'idol' or exists(select 1 from public.idol_assignments where idol_id=target_user)
  then raise exception 'Only a new pending unassigned profile can become an operator'; end if;
  update public.profiles set role='operator',status='active' where id=target_user;
  update public.requests set status='approved',decided_by=auth.uid(),decided_at=clock_timestamp()
    where kind='account_approval' and subject_idol_id=target_user and status='pending';
end; $$;
revoke all on function public.admin_assign_idol(uuid,uuid),public.admin_activate_operator(uuid) from public,anon,authenticated;
grant execute on function public.admin_assign_idol(uuid,uuid),public.admin_activate_operator(uuid) to authenticated;

-- Metadata is used only for a display name; NEVER for role/status or operator assignment.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),200));
  insert into public.requests(kind,submitted_by,subject_idol_id)
    values('account_approval',new.id,new.id);
  return new;
end; $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
commit;
