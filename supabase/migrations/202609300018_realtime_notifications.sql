begin;

-- Deliver notification inserts to the recipient's browser without opening any
-- additional read or write path. RLS on public.notifications still applies to
-- Realtime payload delivery.
do $$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'NOTIFICATIONS_TABLE_MISSING: apply SQL 011 first';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;

-- Include old/new row values so a recipient-specific filter can be evaluated
-- reliably by Realtime when a notification is inserted.
alter table public.notifications replica identity full;

create or replace function public.app_connection_status() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('application', 'elden-media', 'schema_version', '202609300018')
$$;

insert into private.app_schema_migrations(version) values ('202609300018');
commit;
