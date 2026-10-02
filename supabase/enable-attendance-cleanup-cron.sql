-- OPTIONAL, after deploying the Next.js app to a public HTTPS URL.
-- Enable pg_cron and pg_net in Supabase Extensions first.
-- Vault secrets required: elden_app_url (no trailing slash), elden_attendance_cleanup_secret.
-- The latter MUST equal ATTENDANCE_CLEANUP_SECRET on the web server.
-- Server also needs SUPABASE_SERVICE_ROLE_KEY. Do not store it in client code.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron')
 or not exists(select 1 from pg_extension where extname='pg_net') then
   raise exception 'Enable pg_cron and pg_net first';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='elden_app_url' and decrypted_secret like 'https://%')
 or not exists(select 1 from vault.decrypted_secrets where name='elden_attendance_cleanup_secret' and length(decrypted_secret)>=32) then
   raise exception 'Configure Vault URL and cleanup secret first';
 end if;
end; $$;
-- Re-running updates the named job, rather than adding duplicate jobs.
select cron.schedule('elden-attendance-photos-cleanup','15 * * * *', $job$
 select net.http_post(
   url:=(select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='elden_app_url')||'/api/internal/attendance-cleanup',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='elden_attendance_cleanup_secret')),
   body:='{}'::jsonb,
   timeout_milliseconds:=60000
 );
$job$);
