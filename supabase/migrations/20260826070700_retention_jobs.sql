-- Phase S1 Step 4: retention. Two monthly pg_cron jobs. Both are naturally idempotent (a
-- time-cutoff DELETE run twice just deletes zero additional rows the second time -- there's no
-- state to double-apply), and both log what they deleted via an activity_log row so a silent
-- pruning job doesn't become its own kind of silent bug. clinic_id is null on that summary row
-- (this is a cross-clinic system action, not scoped to one tenant) -- visible only to
-- super_admin afterward, same reasoning as the clinics-delete case in the audit trigger.
create or replace function public.prune_message_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test_deleted integer;
  v_real_deleted integer;
begin
  delete from public.message_log
  where coalesce(is_test, false) = true
    and created_at < now() - interval '30 days';
  get diagnostics v_test_deleted = row_count;

  delete from public.message_log
  where coalesce(is_test, false) = false
    and created_at < now() - interval '24 months';
  get diagnostics v_real_deleted = row_count;

  insert into public.activity_log (clinic_id, user_id, action, entity_type, entity_id, meta)
  values (
    null, null, 'retention_message_log_pruned', 'message_log', null,
    jsonb_build_object(
      'actor_type', 'system',
      'test_rows_deleted', v_test_deleted,
      'real_rows_deleted', v_real_deleted,
      'test_cutoff_days', 30,
      'real_cutoff_months', 24
    )
  );
end;
$$;

revoke execute on function public.prune_message_log() from public;

create or replace function public.prune_activity_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.activity_log
  where created_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;

  insert into public.activity_log (clinic_id, user_id, action, entity_type, entity_id, meta)
  values (
    null, null, 'retention_activity_log_pruned', 'activity_log', null,
    jsonb_build_object('actor_type', 'system', 'rows_deleted', v_deleted, 'cutoff_months', 24)
  );
end;
$$;

revoke execute on function public.prune_activity_log() from public;

select cron.schedule('prune-message-log-monthly', '0 3 1 * *', 'select public.prune_message_log();');
select cron.schedule('prune-activity-log-monthly', '10 3 1 * *', 'select public.prune_activity_log();');
