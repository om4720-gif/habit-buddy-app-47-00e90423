-- Phone notifications while Ritual is closed: run this ONCE in the Supabase SQL editor.
-- Replace <CRON_SECRET> with the exact value of your CRON_SECRET secret. Do NOT commit the filled-in version.
--
--  * Grades: checks your connected grade link every 30 minutes and pushes new grades.
--  * Deadlines: every hour, pushes quizzes due within 2 days and assignments due within 1 day.
--
-- Safe to run again: it replaces the jobs if they already exist.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job
where jobname in ('ritual-grade-feed-sync', 'ritual-deadline-reminders');

select cron.schedule(
  'ritual-grade-feed-sync',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://habit-buddy-app-47.lovable.app/api/public/grade-feed-sync',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'ritual-deadline-reminders',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://habit-buddy-app-47.lovable.app/api/public/jobs/send-deadline-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it worked (after an hour): status should be 200.
-- select status_code, content, created from net._http_response order by created desc limit 10;
