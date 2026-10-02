begin;
create unique index tiktok_username_unique on public.platform_accounts(lower(btrim(username))) where nullif(btrim(username),'') is not null;
create unique index import_file_per_day on public.import_batches(data_date,file_hash);
create unique index one_published_import_per_day on public.import_batches(data_date) where status='published';
alter table public.import_batches add column published_at timestamptz, add column published_by uuid references public.profiles(id);
create table public.diamond_import_rows (
 id uuid not null default gen_random_uuid() unique,
 batch_id uuid not null references public.import_batches(id),
 row_number integer not null check(row_number between 2 and 10001),
 username text not null check(username ~ '^[a-z0-9._]{1,100}$'),
 diamonds bigint not null check(diamonds between 0 and 9007199254740991),
 account_id uuid references public.platform_accounts(id),
 primary key(batch_id,row_number),unique(batch_id,username),unique(batch_id,account_id)
);
alter table public.diamond_import_rows enable row level security;
revoke all on public.diamond_import_rows from anon,authenticated;
grant select on public.diamond_import_rows to authenticated;
create policy diamond_rows_admin on public.diamond_import_rows for select to authenticated using(private.current_role()='admin');
create function private.import_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(20260930,13);
end; $$;

create function public.stage_diamond_import(day date, filename text, digest text, entries jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; name text;
begin
 perform private.import_admin();
 if day is null or day>(now() at time zone 'Asia/Ho_Chi_Minh')::date or day<'2000-01-01'::date then raise exception 'INVALID_DATE'; end if;
 if digest is null or digest !~ '^[a-f0-9]{64}$' or coalesce(length(filename),0) not between 1 and 255 or jsonb_typeof(entries) is distinct from 'array' then raise exception 'INVALID_IMPORT'; end if;
 if jsonb_array_length(entries) not between 1 and 1000 then raise exception 'INVALID_IMPORT'; end if;
 select id into result from public.import_batches where data_date=day and file_hash=digest;
 if found then return result; end if;
 insert into public.import_batches(data_date,file_path,file_hash,uploaded_by) values(day,filename,digest,auth.uid()) returning id into result;
 for item in select * from jsonb_array_elements(entries) loop
  name:=item->>'username';
  if item->>'diamonds' is null or (item->>'diamonds') !~ '^[0-9]+$' or item->>'row_number' is null or (item->>'row_number') !~ '^[0-9]+$' then raise exception 'INVALID_ROW'; end if;
  insert into public.diamond_import_rows(batch_id,row_number,username,diamonds,account_id)
  select result,(item->>'row_number')::integer,name,(item->>'diamonds')::bigint,
   (select a.id from public.platform_accounts a join public.profiles p on p.id=a.idol_id where lower(btrim(a.username))=name and p.role='idol' and p.status='active');
 end loop;
 return result;
end; $$;

create function public.map_diamond_username(batch uuid, source_row integer, idol uuid, expected_username text, allow_rename boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare b public.import_batches; r public.diamond_import_rows; a public.platform_accounts;
begin
 perform private.import_admin();
 select * into b from public.import_batches where id=batch for update;
 if not found or b.status<>'staged' then raise exception 'BATCH_NOT_STAGED'; end if;
 select * into r from public.diamond_import_rows where batch_id=batch and row_number=source_row;
 if not found then raise exception 'ROW_NOT_FOUND'; end if;
 if not exists(select 1 from public.profiles where id=idol and role='idol' and status='active') then raise exception 'ACTIVE_IDOL_REQUIRED'; end if;
 select * into a from public.platform_accounts where idol_id=idol for update;
 if a.username is distinct from expected_username then raise exception 'STALE_USERNAME'; end if;
 if a.id is null then
  insert into public.platform_accounts(idol_id,platform,external_id,username) values(idol,'TikTok','local:'||idol::text,r.username) returning * into a;
 elsif lower(btrim(a.username)) is distinct from r.username then
  if nullif(btrim(a.username),'') is not null and not allow_rename then raise exception 'RENAME_CONFIRMATION_REQUIRED'; end if;
  update public.platform_accounts set username=r.username where id=a.id;
 end if;
 -- Never transfer a TikTok account between idols. Existing identity history is retained.
 update public.diamond_import_rows set account_id=a.id where batch_id=batch and row_number=source_row;
end; $$;

create function public.publish_diamond_import(batch uuid, expected_current uuid, confirm_replace boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare b public.import_batches; current_id uuid;
begin
 perform private.import_admin();
 select * into b from public.import_batches where id=batch for update;
 if not found then raise exception 'BATCH_NOT_FOUND'; end if;
 if b.status='published' then return; end if;
 if b.status not in ('staged','reverted') then raise exception 'INVALID_STATUS'; end if;
 select id into current_id from public.import_batches where data_date=b.data_date and status='published';
 if current_id is distinct from expected_current then raise exception 'STALE_DAY'; end if;
 if current_id is not null and not confirm_replace then raise exception 'REPLACE_CONFIRMATION_REQUIRED'; end if;
 if not exists(select 1 from public.diamond_import_rows where batch_id=batch) then raise exception 'EMPTY_IMPORT'; end if;
 if exists(select 1 from public.diamond_import_rows r left join public.platform_accounts a on a.id=r.account_id left join public.profiles p on p.id=a.idol_id
  where r.batch_id=batch and (a.id is null or p.status<>'active' or p.role<>'idol' or lower(btrim(a.username)) is distinct from r.username)) then raise exception 'UNMATCHED_ROWS'; end if;
 -- Replace the whole day's published snapshot atomically. Prior rows remain in import history.
 update public.import_batches set status='reverted' where id=current_id;
 delete from public.daily_metrics where metric_date=b.data_date;
 insert into public.daily_metrics(platform_account_id,metric_date,import_batch_id,diamonds)
 select account_id,b.data_date,batch,diamonds from public.diamond_import_rows where batch_id=batch;
 update public.import_batches set status='published',published_at=clock_timestamp(),published_by=auth.uid() where id=batch;
end; $$;

create function public.revert_diamond_import(batch uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.import_admin();
 if not exists(select 1 from public.import_batches where id=batch and status='published') then raise exception 'BATCH_NOT_PUBLISHED'; end if;
 delete from public.daily_metrics where import_batch_id=batch;
 update public.import_batches set status='reverted' where id=batch;
end; $$;
create trigger audit_mutation after insert or update or delete on public.import_batches for each row execute function private.audit_change();
create trigger audit_mutation after insert or update or delete on public.diamond_import_rows for each row execute function private.audit_change();
revoke all on function private.import_admin() from public,anon,authenticated;
revoke all on function public.stage_diamond_import(date,text,text,jsonb),public.map_diamond_username(uuid,integer,uuid,text,boolean),public.publish_diamond_import(uuid,uuid,boolean),public.revert_diamond_import(uuid) from public,anon;
grant execute on function public.stage_diamond_import(date,text,text,jsonb),public.map_diamond_username(uuid,integer,uuid,text,boolean),public.publish_diamond_import(uuid,uuid,boolean),public.revert_diamond_import(uuid) to authenticated;
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609300013')$$;
insert into private.app_schema_migrations(version) values('202609300013');
commit;
