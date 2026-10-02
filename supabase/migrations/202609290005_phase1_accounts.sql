-- Phase 1: verified onboarding, Admin-issued operator access, profile management.
begin;
create table public.operator_access_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  full_name text not null check(length(btrim(full_name)) between 2 and 150),
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  created_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check(status<>'accepted' or (accepted_by is not null and accepted_at is not null))
);
create unique index pending_operator_email on public.operator_access_invites(email) where status='pending';
alter table public.operator_access_invites enable row level security;
revoke all on public.operator_access_invites from public,anon,authenticated;
grant select on public.operator_access_invites to authenticated;
create policy operator_invites_admin_read on public.operator_access_invites for select to authenticated using(private.current_role()='admin');
create trigger audit_mutation after insert or update or delete on public.operator_access_invites
for each row execute function private.audit_change();

-- Serializes Admin authority checks against concurrent account changes.
create function private.require_admin() returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p public.profiles;
begin
  select * into p from public.profiles where id=actor for update;
  if p.id is null or p.role<>'admin' or p.status<>'active' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return actor;
end; $$;
revoke all on function private.require_admin() from public,anon,authenticated;

create function public.complete_my_onboarding() returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); verified_email text; display_name text; p public.profiles; invitation public.operator_access_invites;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(btrim(email)),left(coalesce(raw_user_meta_data->>'full_name',''),150)
    into verified_email,display_name from auth.users where id=actor and email_confirmed_at is not null;
  if verified_email is null then raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode='42501'; end if;
  -- Lock by verified email before rows so invite/create and claim cannot cross each other.
  perform pg_advisory_xact_lock(hashtextextended('operator-email:'||verified_email,0));
  insert into public.profiles(id,full_name) values(actor,display_name) on conflict(id) do nothing;
  select * into strict p from public.profiles where id=actor for update;
  if p.status='suspended' then return; end if;
  select * into invitation from public.operator_access_invites where email=verified_email and status='pending' for update;
  if invitation.id is not null and p.status='pending' and p.role='idol'
    and not exists(select 1 from public.idol_assignments where idol_id=actor) then
    update public.profiles set role='operator',status='active',full_name=invitation.full_name,
      joined_on=coalesce(joined_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date) where id=actor;
    update public.operator_access_invites set status='accepted',accepted_by=actor,accepted_at=clock_timestamp() where id=invitation.id;
    update public.requests set status='approved',decided_by=invitation.created_by,decided_at=clock_timestamp(),
      decision_reason='Quyền vận hành được Admin cấp trước cho email đã xác thực'
      where kind='account_approval' and subject_idol_id=actor and status='pending';
  elsif p.status='pending' and not exists(select 1 from public.requests where kind='account_approval' and subject_idol_id=actor and status='pending') then
    insert into public.requests(kind,submitted_by,subject_idol_id) values('account_approval',actor,actor);
  end if;
end; $$;

create function public.admin_create_operator_access(operator_email text, operator_name text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid; normalized text:=lower(btrim(operator_email)); target_id uuid; confirmed_at timestamptz; p public.profiles; invitation_id uuid;
begin
  actor:=private.require_admin();
  if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or operator_name is null or length(btrim(operator_name)) not between 2 and 150 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operator-email:'||normalized,0));
  select id,email_confirmed_at into target_id,confirmed_at from auth.users where lower(email)=normalized;
  if target_id is not null then
    select * into p from public.profiles where id=target_id for update;
    if p.status='active' and p.role='operator' then return 'already_active'; end if;
    if p.id is not null and (p.status<>'pending' or p.role<>'idol' or exists(select 1 from public.idol_assignments where idol_id=target_id))
      then raise exception 'ACCOUNT_ALREADY_IN_USE'; end if;
  end if;
  insert into public.operator_access_invites(email,full_name,created_by) values(normalized,btrim(operator_name),actor)
    on conflict(email) where status='pending' do update set full_name=excluded.full_name,created_by=excluded.created_by
    returning id into invitation_id;
  if target_id is not null and confirmed_at is not null then
    insert into public.profiles(id,full_name) values(target_id,btrim(operator_name)) on conflict(id) do nothing;
    update public.profiles set role='operator',status='active',full_name=btrim(operator_name),
      joined_on=coalesce(joined_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date) where id=target_id;
    update public.operator_access_invites set status='accepted',accepted_by=target_id,accepted_at=clock_timestamp() where id=invitation_id;
    update public.requests set status='approved',decided_by=actor,decided_at=clock_timestamp()
      where kind='account_approval' and subject_idol_id=target_id and status='pending';
    return 'activated';
  end if;
  return 'reserved';
end; $$;

create function public.admin_revoke_operator_access(invite_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text;
begin
  perform private.require_admin();
  select email into normalized from public.operator_access_invites where id=invite_id;
  if normalized is null then raise exception 'INVITE_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operator-email:'||normalized,0));
  update public.operator_access_invites set status='revoked' where id=invite_id and status='pending';
  if not found then raise exception 'INVITE_NOT_PENDING'; end if;
end; $$;

create function public.update_my_profile(display_name text, idol_nickname text, phone_number text, date_of_birth date)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null or p.status='suspended' then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  if display_name is null or length(btrim(display_name)) not between 2 and 150
    or length(coalesce(idol_nickname,''))>100
    or (nullif(btrim(phone_number),'') is not null and btrim(phone_number) !~ '^\+?[0-9 ()-]{8,20}$')
    or (date_of_birth is not null and (date_of_birth<'1900-01-01' or date_of_birth>(now() at time zone 'Asia/Ho_Chi_Minh')::date))
  then raise exception 'INVALID_INPUT'; end if;
  update public.profiles set full_name=btrim(display_name),nickname=nullif(btrim(idol_nickname),''),
    phone=nullif(btrim(phone_number),''),birth_date=date_of_birth where id=p.id;
end; $$;

create function public.admin_set_member_status(member_id uuid,new_status public.account_status,reason text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; actor uuid;
begin
  actor:=private.require_admin();
  select * into strict p from public.profiles where id=member_id for update;
  if p.role='admin' or member_id=actor then raise exception 'ADMIN_ACCOUNT_PROTECTED'; end if;
  if new_status is null or new_status not in ('active','suspended') or nullif(btrim(reason),'') is null or length(reason)>500 then raise exception 'INVALID_INPUT'; end if;
  if p.status='pending' and new_status='active' then raise exception 'APPROVAL_REQUIRED'; end if;
  if new_status='active' and p.role='idol' and not exists(select 1 from public.idol_assignments
    where idol_id=member_id and starts_at<=now() and (ends_at is null or ends_at>now())) then raise exception 'ASSIGNMENT_REQUIRED'; end if;
  update public.profiles set status=new_status where id=member_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(actor,'SET_ACCOUNT_STATUS','profiles',member_id,jsonb_build_object('status',new_status,'reason',btrim(reason)));
end; $$;

create function public.admin_members(search_text text default '',page_number integer default 1,page_size integer default 20)
returns table(id uuid,full_name text,nickname text,email text,role public.app_role,status public.account_status,
 phone text,birth_date date,joined_on date,operator_id uuid,operator_name text,total_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  if page_number is null or page_number<1 or page_number>10000 or page_size is null or page_size not between 1 and 50
    or length(coalesce(search_text,''))>100 then raise exception 'INVALID_INPUT'; end if;
  return query select p.id,p.full_name,p.nickname,u.email::text,p.role,p.status,p.phone,p.birth_date,p.joined_on,a.operator_id,o.full_name,count(*) over()
  from public.profiles p join auth.users u on u.id=p.id
  left join public.idol_assignments a on a.idol_id=p.id and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
  left join public.profiles o on o.id=a.operator_id
  where coalesce(search_text,'')='' or strpos(lower(p.full_name||' '||coalesce(p.nickname,'')||' '||coalesce(u.email,'')),lower(search_text))>0
  order by (p.status='pending') desc,p.created_at desc,p.id
  limit page_size offset (page_number-1)*page_size;
end; $$;

create function public.my_operator_summary() returns table(operator_id uuid,full_name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name from public.idol_assignments a join public.profiles p on p.id=a.operator_id
 where private.current_role()='idol' and a.idol_id=auth.uid() and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
$$;

-- Wrap existing approval RPC with an authority lock and require a minimally identified profile.
alter function public.admin_assign_idol(uuid,uuid) rename to admin_assign_idol_legacy_internal;
revoke all on function public.admin_assign_idol_legacy_internal(uuid,uuid) from public,anon,authenticated;
create function public.admin_assign_idol(target_idol uuid,target_operator uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  if not exists(select 1 from public.profiles where id=target_idol and length(btrim(full_name))>=2) then raise exception 'PROFILE_NAME_REQUIRED'; end if;
  perform public.admin_assign_idol_legacy_internal(target_idol,target_operator);
  update public.profiles set joined_on=coalesce(joined_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date) where id=target_idol;
end; $$;
-- Old activation RPC is no longer exposed: Admin issues access using verified email instead.
revoke all on function public.admin_activate_operator(uuid) from public,anon,authenticated;

revoke all on function public.complete_my_onboarding(),public.admin_create_operator_access(text,text),
 public.admin_revoke_operator_access(uuid),public.update_my_profile(text,text,text,date),
 public.admin_set_member_status(uuid,public.account_status,text),public.admin_members(text,integer,integer),
 public.my_operator_summary(),public.admin_assign_idol(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_my_onboarding(),public.admin_create_operator_access(text,text),
 public.admin_revoke_operator_access(uuid),public.update_my_profile(text,text,text,date),
 public.admin_set_member_status(uuid,public.account_status,text),public.admin_members(text,integer,integer),
 public.my_operator_summary(),public.admin_assign_idol(uuid,uuid) to authenticated;

insert into private.app_schema_migrations(version) values('202609290005');
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('application','elden-media','schema_version','202609290005')
$$;
commit;
