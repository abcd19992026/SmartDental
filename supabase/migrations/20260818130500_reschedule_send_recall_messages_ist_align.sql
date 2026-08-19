-- Realigns the hourly cron to actually sample each IST hour at its start, not 30 minutes in.
--
-- IST = UTC + 5:30. The job previously fired at minute 0 of every UTC hour (e.g. UTC 05:00),
-- which lands at IST (UTC hour + 5):30 -- e.g. UTC 05:00 -> IST 10:30. send-recall-messages reads
-- getIstNow().hour at the instant it runs, so a clinic configured for send_time '10:00' (matched
-- on hour = 10) was only ever sampled 30 minutes into that hour, never at its start -- explaining
-- the observed ~10:30+ delivery instead of 10:00.
--
-- Moving the job to minute 30 of every UTC hour (e.g. UTC 04:30) lands at IST (UTC hour + 6):00
-- exactly -- 30 (minute) + 30 (IST offset minutes) carries an hour, landing on :00 -- e.g. UTC
-- 04:30 -> IST 10:00:00. A clinic configured for hour 10 is now sampled right at the top of the
-- 10 AM IST hour instead of half past it. send-recall-messages itself needs no change: its hour
-- math (getIstNow().hour === sendHour) was always correct -- the bug was purely in when pg_cron
-- chose to invoke it. Same reasoning holds at the send-window edges: hour 9 (earliest) is now
-- sampled at UTC 03:30 -> IST 09:00:00 exactly, and hour 19 (latest, since the window excludes
-- hour >= 20) at UTC 13:30 -> IST 19:00:00 exactly -- both still inside the 9 AM-8 PM guard.
--
-- Same job name as before, so this UPDATES the existing 'send-recall-messages-hourly' job in
-- place (pg_cron's cron.schedule() behavior) rather than creating a duplicate -- confirmed there
-- is exactly one row in cron.job for this name both before and after.
select cron.schedule(
  'send-recall-messages-hourly',
  '30 * * * *',
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
