begin;

-- Username TikTok is the canonical identity used by the Excel importer. The
-- legacy profiles.nickname column is kept for compatibility and mirrors it.
create or replace function private.sync_profile_tiktok_username() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.profiles set nickname=nullif(btrim(new.username),'') where id=new.idol_id;
  return new;
end; $$;
drop trigger if exists sync_profile_tiktok_username on public.platform_accounts;
create trigger sync_profile_tiktok_username after insert or update of username on public.platform_accounts
for each row execute function private.sync_profile_tiktok_username();

-- Backfill the legacy profile mirror for accounts imported before this migration.
update public.profiles p
set nickname = nullif(btrim(a.username),'')
from public.platform_accounts a
where a.idol_id=p.id and a.platform='TikTok';

create function public.update_my_profile_with_tiktok(
  display_name text,
  idol_username text,
  phone_number text,
  date_of_birth date
) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles; a public.platform_accounts; normalized_username text;
begin
  select * into p from public.profiles where id=auth.uid() for update;
  if p.id is null or p.status='suspended' then raise exception 'ACCOUNT_UNAVAILABLE' using errcode='42501'; end if;
  normalized_username:=nullif(lower(btrim(regexp_replace(coalesce(idol_username,''),'^@+',''))),'');
  if display_name is null or length(btrim(display_name)) not between 2 and 150
    or (normalized_username is not null and normalized_username !~ '^[a-z0-9._]{1,100}$')
    or (nullif(btrim(phone_number),'') is not null and btrim(phone_number) !~ '^\+?[0-9 ()-]{8,20}$')
    or (date_of_birth is not null and (date_of_birth<'1900-01-01' or date_of_birth>(now() at time zone 'Asia/Ho_Chi_Minh')::date))
  then raise exception 'INVALID_INPUT'; end if;

  if p.role <> 'idol' and normalized_username is not null then
    raise exception 'ROLE_NOT_ALLOWED' using errcode='42501';
  end if;

  update public.profiles set full_name=btrim(display_name),nickname=case when p.role='idol' then normalized_username else null end,
    phone=nullif(btrim(phone_number),''),birth_date=date_of_birth where id=p.id;

  if p.role='idol' then
    select * into a from public.platform_accounts where idol_id=p.id for update;
    if a.id is null and normalized_username is not null then
      insert into public.platform_accounts(idol_id,platform,external_id,username)
      values(p.id,'TikTok','local:'||p.id::text,normalized_username);
    elsif a.id is not null then
      update public.platform_accounts set username=normalized_username where id=a.id;
    end if;
  end if;
end; $$;
revoke all on function public.update_my_profile_with_tiktok(text,text,text,date) from public,anon;
grant execute on function public.update_my_profile_with_tiktok(text,text,text,date) to authenticated;

create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('application','elden-media','schema_version','202609300016')$$;
insert into private.app_schema_migrations(version) values('202609300016');
commit;
