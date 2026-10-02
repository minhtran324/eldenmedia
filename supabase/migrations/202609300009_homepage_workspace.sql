-- Apply after 008. Homepage mutations use revision-checked RPCs.
begin;
alter table public.homepage_posts add column revision integer not null default 1;
revoke insert,update,delete on public.homepage_posts from authenticated;

create function public.admin_save_homepage_post(post_id uuid, expected_revision integer, payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.homepage_posts; result uuid;
begin
 if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
 -- Lock the actor so concurrent suspension cannot authorize a later write.
 perform 1 from public.profiles where id=auth.uid() for update;
 if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
 if post_id is not null then
  select * into p from public.homepage_posts where id=post_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if expected_revision is distinct from p.revision then raise exception 'STALE_POST'; end if;
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or
    coalesce(length(btrim(payload->>'title')),0) not between 1 and 200 or
    length(coalesce(payload->>'body',''))>10000 or length(coalesce(payload->>'location',''))>300 or
    length(coalesce(payload->>'link_url',''))>2000 then raise exception 'INVALID_POST'; end if;
 if nullif(payload->>'image_path','') is not null and not exists(
  select 1 from storage.objects where bucket_id='homepage-media' and name=payload->>'image_path'
 ) then raise exception 'IMAGE_NOT_FOUND'; end if;
 if post_id is null then
  insert into public.homepage_posts(kind,title,body,image_path,link_url,audience,status,publish_from,publish_until,event_starts_at,event_ends_at,location,pinned)
  values(payload->>'kind',btrim(payload->>'title'),coalesce(payload->>'body',''),nullif(payload->>'image_path',''),nullif(payload->>'link_url',''),
   array(select jsonb_array_elements_text(payload->'audience'))::public.app_role[],payload->>'status',
   coalesce(nullif(payload->>'publish_from','')::timestamptz,now()),nullif(payload->>'publish_until','')::timestamptz,
   nullif(payload->>'event_starts_at','')::timestamptz,nullif(payload->>'event_ends_at','')::timestamptz,nullif(payload->>'location',''),coalesce((payload->>'pinned')::boolean,false)) returning id into result;
 else
  update public.homepage_posts set kind=payload->>'kind',title=btrim(payload->>'title'),body=coalesce(payload->>'body',''),
   image_path=nullif(payload->>'image_path',''),link_url=nullif(payload->>'link_url',''),
   audience=array(select jsonb_array_elements_text(payload->'audience'))::public.app_role[],status=payload->>'status',
   publish_from=coalesce(nullif(payload->>'publish_from','')::timestamptz,now()),publish_until=nullif(payload->>'publish_until','')::timestamptz,
   event_starts_at=nullif(payload->>'event_starts_at','')::timestamptz,event_ends_at=nullif(payload->>'event_ends_at','')::timestamptz,
   location=nullif(payload->>'location',''),pinned=coalesce((payload->>'pinned')::boolean,false),revision=revision+1
  where id=post_id returning id into result;
 end if;
 return result;
end; $$;
revoke all on function public.admin_save_homepage_post(uuid,integer,jsonb) from public,anon;
grant execute on function public.admin_save_homepage_post(uuid,integer,jsonb) to authenticated;
-- The agreed birthday audience is every operator in the company.
update public.company_settings set birthday_reminder_scope='company' where id;
create or replace function public.admin_set_homepage_options(ranking text, reminders text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 if private.current_role() is distinct from 'admin'::public.app_role then raise exception 'Admin required' using errcode='42501'; end if;
 if reminders is distinct from 'company' then raise exception 'COMPANY_REMINDERS_REQUIRED'; end if;
 update public.company_settings set ranking_period=ranking,birthday_reminder_scope='company',updated_at=clock_timestamp() where id;
end; $$;
create or replace function public.app_connection_status() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('application','elden-media','schema_version','202609300009')
$$;
insert into private.app_schema_migrations(version) values('202609300009');
commit;
