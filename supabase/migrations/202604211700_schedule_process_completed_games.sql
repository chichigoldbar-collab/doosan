create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname = 'doosan-process-completed-games';

select cron.schedule(
  'doosan-process-completed-games',
  '*/30 10-16 * * Tue,Wed,Thu,Fri,Sat,Sun',
  $$
  select
    net.http_post(
      url := 'https://qjoqrawfofhqipghmuem.supabase.co/functions/v1/process-completed-games',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
