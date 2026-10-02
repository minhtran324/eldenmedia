-- Apply once after 005. Resource catalogue; attendance/booking RPCs follow later.
begin;
alter table public.floors add column version integer not null default 1;
alter table public.rooms add column version integer not null default 1;
alter table public.devices add column version integer not null default 1;
-- Stop on conflicting legacy codes; do not silently rename printed labels.
create unique index floors_normalized_code on public.floors(upper(btrim(code)));
create unique index rooms_normalized_code on public.rooms(upper(btrim(code)));
create unique index devices_normalized_code on public.devices(upper(btrim(code)));
create trigger audit_mutation after insert or update on public.floors
for each row execute function private.audit_change();

create function public.admin_save_resource(resource_kind text, payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  target uuid; owner_id uuid; parent_id uuid; label text; resource_code text;
  resource_status text; resource_type text; expected integer; ordering integer;
  old_floor public.floors; old_room public.rooms; old_device public.devices;
begin
  perform private.require_admin();
  -- Shared serialization point for resource changes. Future booking/loan RPCs must
  -- acquire this lock before validating resource availability or ownership.
  perform pg_advisory_xact_lock(20260929,6);
  if resource_kind is null or resource_kind not in ('floor','room','device') or jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'INVALID_INPUT';
  end if;
  target:=nullif(payload->>'id','')::uuid;
  expected:=nullif(payload->>'version','')::integer;
  resource_code:=upper(btrim(payload->>'code'));
  label:=btrim(payload->>'name');
  if resource_code is null or resource_code !~ '^[A-Z0-9][A-Z0-9_-]{0,29}$' then raise exception 'INVALID_CODE'; end if;
  if resource_kind in ('floor','room') and (label is null or length(label) not between 1 and 100) then raise exception 'INVALID_INPUT'; end if;

  if resource_kind='floor' then
    ordering:=(payload->>'sort_order')::integer;
    if ordering is null or ordering not between -1000 and 1000 then raise exception 'INVALID_INPUT'; end if;
    if target is null then
      insert into public.floors(code,name,sort_order) values(resource_code,label,ordering) returning id into target;
    else
      select * into old_floor from public.floors where id=target for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if expected is distinct from old_floor.version then raise exception 'STALE_RESOURCE'; end if;
      update public.floors set code=resource_code,name=label,sort_order=ordering,version=version+1 where id=target;
    end if;
    return target;
  end if;

  owner_id:=nullif(payload->>'manager_id','')::uuid;
  resource_status:=payload->>'status';
  if resource_status is null or resource_status not in ('available','maintenance','inactive') then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.profiles where id=owner_id and role='operator' and status='active' for share;
  if not found then raise exception 'ACTIVE_OPERATOR_REQUIRED'; end if;

  if resource_kind='room' then
    parent_id:=nullif(payload->>'floor_id','')::uuid;
    resource_type:=payload->>'room_type';
    if resource_type is null or resource_type not in ('regular','studio') then raise exception 'INVALID_INPUT'; end if;
    perform 1 from public.floors where id=parent_id for share;
    if not found then raise exception 'FLOOR_REQUIRED'; end if;
    if target is null then
      insert into public.rooms(code,name,floor_id,room_type,manager_id,status)
      values(resource_code,label,parent_id,resource_type,owner_id,resource_status) returning id into target;
    else
      select * into old_room from public.rooms where id=target for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if expected is distinct from old_room.version then raise exception 'STALE_RESOURCE'; end if;
      if exists(select 1 from public.room_segments s where s.room_id=target and
        ((s.status='approved' and s.ends_at>now()) or exists(select 1 from public.room_visits v where v.segment_id=s.id and v.checked_out_at is null)))
        then raise exception 'ROOM_IN_USE'; end if;
      update public.rooms set code=resource_code,name=label,floor_id=parent_id,room_type=resource_type,
        manager_id=owner_id,status=resource_status,version=version+1 where id=target;
    end if;
  else
    parent_id:=nullif(payload->>'assigned_room_id','')::uuid;
    if parent_id is not null then
      perform 1 from public.rooms where id=parent_id and status='available' for share;
      if not found then raise exception 'ROOM_UNAVAILABLE'; end if;
    end if;
    if target is null then
      insert into public.devices(code,assigned_room_id,manager_id,status)
      values(resource_code,parent_id,owner_id,resource_status) returning id into target;
    else
      select * into old_device from public.devices where id=target for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if expected is distinct from old_device.version then raise exception 'STALE_RESOURCE'; end if;
      if exists(select 1 from public.device_loans where device_id=target and returned_at is null)
        then raise exception 'DEVICE_IN_USE'; end if;
      update public.devices set code=resource_code,assigned_room_id=parent_id,manager_id=owner_id,
        status=resource_status,version=version+1 where id=target;
    end if;
  end if;
  return target;
end; $$;
revoke all on function public.admin_save_resource(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_resource(text,jsonb) to authenticated;

insert into private.app_schema_migrations(version) values('202609290006');
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('application','elden-media','schema_version','202609290006')
$$;
commit;
