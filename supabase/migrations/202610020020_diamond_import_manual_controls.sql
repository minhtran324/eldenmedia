begin;

-- ============================================================================
-- Migration: 202610020020_diamond_import_manual_controls.sql
-- Description:
--   1. delete_staged_import_batch: Allow deleting/canceling an unconfirmed or reverted batch
--   2. change_import_batch_date: Allow changing report date if entered wrongly
--   3. update_diamond_row_amount: Allow manually editing diamonds for a row
--   4. set_idol_batch_diamonds: Allow manually setting/adding diamonds for an idol
--   5. publish_diamond_import: Automatically purge non-idol rows so they never block publishing
-- ============================================================================

-- 1. Function to delete/cancel a staged or reverted batch
create or replace function public.delete_staged_import_batch(batch uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.import_batches;
begin
  perform private.import_admin();
  select * into b from public.import_batches where id=batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.status = 'published' then raise exception 'CANNOT_DELETE_PUBLISHED_BATCH'; end if;
  
  delete from public.diamond_import_rows where batch_id=batch;
  delete from public.import_batches where id=batch;
end; $$;

-- 2. Function to change the date of a staged batch (if uploaded with wrong date)
create or replace function public.change_import_batch_date(batch uuid, new_day date) returns void
language plpgsql security definer set search_path='' as $$
declare b public.import_batches;
begin
  perform private.import_admin();
  if new_day is null or new_day > (now() at time zone 'Asia/Ho_Chi_Minh')::date or new_day < '2000-01-01'::date then
    raise exception 'INVALID_DATE';
  end if;
  select * into b from public.import_batches where id=batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.status <> 'staged' then raise exception 'BATCH_NOT_STAGED'; end if;
  
  -- Check if another batch with this file_hash already exists for new_day
  if exists(select 1 from public.import_batches where data_date=new_day and file_hash=b.file_hash and id <> batch) then
    raise exception 'BATCH_ALREADY_EXISTS_FOR_DATE';
  end if;

  update public.import_batches set data_date=new_day where id=batch;
end; $$;

-- 3. Function to manually update diamond count for a row
create or replace function public.update_diamond_row_amount(batch uuid, source_row integer, new_diamonds bigint) returns void
language plpgsql security definer set search_path='' as $$
declare b public.import_batches;
begin
  perform private.import_admin();
  if new_diamonds is null or new_diamonds < 0 or new_diamonds > 9007199254740991 then
    raise exception 'INVALID_DIAMONDS';
  end if;
  select * into b from public.import_batches where id=batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.status <> 'staged' then raise exception 'BATCH_NOT_STAGED'; end if;

  update public.diamond_import_rows set diamonds=new_diamonds where batch_id=batch and row_number=source_row;
end; $$;

-- 4. Function to manually add/set diamonds for an idol in a staged batch (for missing idols)
create or replace function public.set_idol_batch_diamonds(batch uuid, idol uuid, new_diamonds bigint) returns void
language plpgsql security definer set search_path='' as $$
declare
  b public.import_batches;
  a public.platform_accounts;
  next_row integer;
begin
  perform private.import_admin();
  if new_diamonds is null or new_diamonds < 0 or new_diamonds > 9007199254740991 then
    raise exception 'INVALID_DIAMONDS';
  end if;
  select * into b from public.import_batches where id=batch for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.status <> 'staged' then raise exception 'BATCH_NOT_STAGED'; end if;

  if not exists(select 1 from public.profiles where id=idol and role='idol' and status='active') then
    raise exception 'ACTIVE_IDOL_REQUIRED';
  end if;

  select * into a from public.platform_accounts where idol_id=idol;
  if a.id is null then
    insert into public.platform_accounts(idol_id, platform, external_id, username)
    values (idol, 'TikTok', 'manual:'||idol::text, 'idol_'||substr(idol::text, 1, 8))
    returning * into a;
  end if;

  -- Check if already has a row in this batch
  if exists(select 1 from public.diamond_import_rows where batch_id=batch and account_id=a.id) then
    update public.diamond_import_rows set diamonds=new_diamonds where batch_id=batch and account_id=a.id;
  else
    select coalesce(max(row_number), 1) + 1 into next_row from public.diamond_import_rows where batch_id=batch;
    insert into public.diamond_import_rows(batch_id, row_number, username, diamonds, account_id)
    values (batch, next_row, lower(btrim(a.username)), new_diamonds, a.id);
  end if;
end; $$;

-- 5. Updated publish_diamond_import: Automatically purge non-idol rows so they never block publishing
create or replace function public.publish_diamond_import(batch uuid, expected_current uuid, confirm_replace boolean default false) returns void
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
  
  -- Automatically purge any rows that were not linked to an idol (i.e. random creators from TikTok file)
  delete from public.diamond_import_rows where batch_id=batch and account_id is null;

  if not exists(select 1 from public.diamond_import_rows where batch_id=batch) then
    raise exception 'EMPTY_IMPORT';
  end if;

  -- Ensure all remaining rows belong to active idols
  if exists(select 1 from public.diamond_import_rows r left join public.platform_accounts a on a.id=r.account_id left join public.profiles p on p.id=a.idol_id
   where r.batch_id=batch and (a.id is null or p.status<>'active' or p.role<>'idol')) then
    raise exception 'UNMATCHED_ROWS';
  end if;

  -- Replace the whole day's published snapshot atomically
  update public.import_batches set status='reverted' where id=current_id;
  delete from public.daily_metrics where metric_date=b.data_date;
  insert into public.daily_metrics(platform_account_id,metric_date,import_batch_id,diamonds)
  select account_id,b.data_date,batch,diamonds from public.diamond_import_rows where batch_id=batch and account_id is not null;
  update public.import_batches set status='published',published_at=clock_timestamp(),published_by=auth.uid() where id=batch;
end; $$;

revoke all on function public.delete_staged_import_batch(uuid) from public,anon;
revoke all on function public.change_import_batch_date(uuid, date) from public,anon;
revoke all on function public.update_diamond_row_amount(uuid, integer, bigint) from public,anon;
revoke all on function public.set_idol_batch_diamonds(uuid, uuid, bigint) from public,anon;
revoke all on function public.publish_diamond_import(uuid, uuid, boolean) from public,anon;

grant execute on function public.delete_staged_import_batch(uuid) to authenticated;
grant execute on function public.change_import_batch_date(uuid, date) to authenticated;
grant execute on function public.update_diamond_row_amount(uuid, integer, bigint) to authenticated;
grant execute on function public.set_idol_batch_diamonds(uuid, uuid, bigint) to authenticated;
grant execute on function public.publish_diamond_import(uuid, uuid, boolean) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202610020020')$$;
insert into private.app_schema_migrations(version) values('202610020020') on conflict (version) do nothing;
commit;
