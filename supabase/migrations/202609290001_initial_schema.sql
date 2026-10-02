-- Run once on a NEW Supabase project. This is a foundation, not the complete workflow.
begin;
create extension if not exists btree_gist;

create type public.app_role as enum ('admin', 'operator', 'idol');
create type public.account_status as enum ('pending', 'active', 'suspended');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text not null default '',
  role public.app_role not null default 'idol',
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now()
);
create table public.idol_assignments (
  id uuid primary key default gen_random_uuid(),
  idol_id uuid not null references public.profiles(id),
  operator_id uuid not null references public.profiles(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  check (idol_id <> operator_id),
  check (ends_at is null or ends_at > starts_at),
  exclude using gist (idol_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  manager_id uuid not null references public.profiles(id),
  status text not null default 'available' check (status in ('available', 'maintenance', 'inactive'))
);
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  assigned_room_id uuid not null references public.rooms(id),
  manager_id uuid not null references public.profiles(id),
  status text not null default 'available' check (status in ('available', 'maintenance', 'inactive'))
);
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  idol_id uuid not null references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled', 'completed', 'absent')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (idol_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'approved')
);
create table public.room_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id),
  room_id uuid not null references public.rooms(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled', 'completed')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  check (ends_at > starts_at),
  exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'approved')
);
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('account_approval', 'schedule', 'room_borrow', 'device_borrow', 'device_return', 'checkout_correction', 'incident')),
  submitted_by uuid not null references public.profiles(id),
  assigned_reviewer_id uuid references public.profiles(id),
  session_id uuid references public.live_sessions(id),
  room_segment_id uuid references public.room_segments(id),
  device_id uuid references public.devices(id),
  status public.request_status not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_reason text,
  check (status not in ('approved','rejected') or (decided_by is not null and decided_at is not null))
);
create table public.device_loans (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id),
  idol_id uuid not null references public.profiles(id),
  session_id uuid not null references public.live_sessions(id),
  authorization_request_id uuid references public.requests(id),
  checked_out_at timestamptz not null default now(),
  return_requested_at timestamptz,
  returned_at timestamptz,
  return_confirmed_by uuid references public.profiles(id),
  check (return_requested_at is null or return_requested_at >= checked_out_at),
  check (returned_at is null or (return_requested_at is not null and returned_at >= return_requested_at and return_confirmed_by is not null))
);
-- A pending return still occupies the device.
create unique index one_open_loan_per_device on public.device_loans(device_id) where returned_at is null;
create table public.room_visits (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null unique references public.room_segments(id),
  idol_id uuid not null references public.profiles(id),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  before_photo_path text not null,
  after_photo_path text,
  check (checked_out_at is null or (checked_out_at >= checked_in_at and after_photo_path is not null))
);
create table public.checkout_corrections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests(id),
  room_visit_id uuid references public.room_visits(id),
  device_loan_id uuid references public.device_loans(id),
  proposed_time timestamptz not null,
  reason text not null,
  check (num_nonnulls(room_visit_id, device_loan_id) = 1)
);
create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  idol_id uuid not null references public.profiles(id),
  platform text not null,
  external_id text not null,
  unique (platform, external_id)
);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  data_date date not null,
  file_path text not null,
  file_hash text not null,
  uploaded_by uuid not null references public.profiles(id),
  status text not null default 'staged' check (status in ('staged', 'published', 'failed', 'reverted')),
  created_at timestamptz not null default now()
);
create table public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null references public.platform_accounts(id),
  metric_date date not null,
  live_seconds integer not null default 0 check (live_seconds >= 0),
  metrics jsonb not null default '{}'::jsonb,
  import_batch_id uuid not null references public.import_batches(id),
  unique (platform_account_id, metric_date)
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index requests_queue on public.requests(status, assigned_reviewer_id, created_at);
create index sessions_by_idol_date on public.live_sessions(idol_id, starts_at);
create index assignments_operator on public.idol_assignments(operator_id);

-- Public signup NEVER accepts role/status supplied in user metadata.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Fail closed. Only own profile reads are enabled at this foundation stage.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','idol_assignments','rooms','devices','live_sessions','room_segments','requests','device_loans','room_visits','checkout_corrections','platform_accounts','import_batches','daily_metrics','audit_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;
grant select on public.profiles to authenticated;
create policy own_profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));

-- Private files: add scoped storage policies with the upload workflow later.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('room-photos','room-photos',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('excel-imports','excel-imports',false,20971520,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']);
commit;
