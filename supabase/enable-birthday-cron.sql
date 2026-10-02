-- After bootstrap: Dashboard > Integrations > Cron > enable pg_cron.
-- This job checks hourly; each recipient receives at most one notification per birthday/year.
-- Dates are computed in Asia/Ho_Chi_Minh, including at year boundaries.
do $$ begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'Enable pg_cron in Supabase Dashboard > Integrations > Cron first';
  end if;
end; $$;
select cron.schedule('elden-birthday-reminders','0 * * * *','select private.send_birthday_reminders();');
select private.send_birthday_reminders();
select jobname,schedule,active from cron.job where jobname='elden-birthday-reminders';
