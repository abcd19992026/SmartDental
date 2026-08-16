-- pg_cron fires send-recall-messages hourly; pg_net makes the HTTP call from inside Postgres.
-- Combined with the per-clinic send_time hour check inside the function itself, this is what
-- lets every clinic have its own send time without one scheduled job per clinic.
create extension if not exists pg_cron;
create extension if not exists pg_net;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- The function URL and the cron secret are read from Supabase Vault at run time, never hardcoded
-- here -- this migration file is committed to git, and CRON_SECRET must not be. Before this job
-- can fire successfully, run once per environment (see supabase/README.md "Phase 5A" section):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-recall-messages', 'send_recall_messages_url');
--   select vault.create_secret('<same value as the CRON_SECRET Edge Function secret>', 'cron_secret');
-- Scheduling the job now, before those secrets exist, is safe: cron.schedule only registers the
-- job definition -- the vault lookups happen fresh on every hourly run, not at schedule time.
select cron.schedule(
  'send-recall-messages-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_recall_messages_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
