
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  -- Unschedule existing job if already present to guarantee idempotency
  if exists (select 1 from cron.job where jobname = 'open-assistant-reminders') then
    perform cron.unschedule('open-assistant-reminders');
  end if;

  perform cron.schedule(
    'open-assistant-reminders',
    '* * * * *',
    $cron_body$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_WORKER_SECRET'
      ),
      body := '{}'::jsonb
    ) as request_id;
    $cron_body$
  );
end $$;
