-- Phase 11A: AI Dictation backend -- clinics flag/cap, ai_usage_log (billing/pricing analytics,
-- never clinical content), and log_ai_dictation_interest() (demand signal for the locked mic
-- button). No clinical write path is touched here -- the Edge Function (transcribe-consultation)
-- reads medicines and writes only to ai_usage_log; it never writes prescriptions/visits.

-- ---------------------------------------------------------------------------
-- 1. clinics: paid-feature flag + monthly quota, both super_admin-only via
--    protect_clinic_billing_fields (owners must never self-enable a paid feature, same as
--    plan_name/monthly_message_quota/daily_message_cap above).
-- ---------------------------------------------------------------------------
alter table public.clinics
  add column ai_dictation_enabled boolean not null default false,
  add column ai_dictation_monthly_cap_seconds integer not null default 18000; -- 5 hours

-- Re-declaration of protect_clinic_billing_fields with the two new columns added to the guarded
-- list -- every other line is byte-identical to the version in 20260813032157_protect_sensitive_
-- fields.sql (re-read before editing, per the phase spec). The trigger itself
-- (trg_protect_clinic_billing) already exists and re-points at this new function body
-- automatically; no need to touch the trigger.
create or replace function public.protect_clinic_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.plan_name             is distinct from old.plan_name
  or new.plan_started_on       is distinct from old.plan_started_on
  or new.plan_expires_on       is distinct from old.plan_expires_on
  or new.is_active              is distinct from old.is_active
  or new.suspension_reason     is distinct from old.suspension_reason
  or new.monthly_message_quota is distinct from old.monthly_message_quota
  or new.daily_message_cap     is distinct from old.daily_message_cap
  or new.onboarding_completed  is distinct from old.onboarding_completed
  or new.ai_dictation_enabled            is distinct from old.ai_dictation_enabled
  or new.ai_dictation_monthly_cap_seconds is distinct from old.ai_dictation_monthly_cap_seconds
  then
    raise exception 'Only a platform administrator can change subscription fields';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. ai_usage_log: billing/pricing analytics for the platform operator only. Counts, not
--    content -- no transcript column, no patient_id, no audio reference, ever. The clinic owner
--    must never see this table (SELECT is super_admin-only, no carve-out -- same shape as
--    `payments`). No INSERT/UPDATE/DELETE policy at all: only the Edge Function's service-role
--    client writes here, and service role bypasses RLS entirely, so a policy for those commands
--    would only ever apply to a client session that has no business writing usage rows.
--    log_activity() is deliberately not attached -- this table is itself a log.
-- ---------------------------------------------------------------------------
create table public.ai_usage_log (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  branch_id      uuid references public.branches(id) on delete set null,
  user_id        uuid references public.profiles(id) on delete set null,
  audio_seconds  integer not null check (audio_seconds >= 0),
  status         text not null check (status in ('success', 'failed')),
  fail_reason    text,
  model          text,
  created_at     timestamptz not null default now()
);
create index idx_ai_usage_log_clinic_created on public.ai_usage_log (clinic_id, created_at);

alter table public.ai_usage_log enable row level security;

create policy ai_usage_log_select on public.ai_usage_log
  for select using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. log_ai_dictation_interest(): demand signal recorded when a clinic without the feature taps
--    "Mujhe chahiye" on the locked mic button. No parameters -- clinic and actor are derived
--    server-side from current_clinic_id()/auth.uid(), exactly like every other SECURITY DEFINER
--    helper in this project, so a caller can never attribute the signal to a clinic that isn't
--    their own. Duplicates are fine (each tap is itself a useful signal), so this has no
--    idempotency guard, unlike the client_request_id pattern used for billable writes.
-- ---------------------------------------------------------------------------
create or replace function public.log_ai_dictation_interest()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (clinic_id, user_id, action, meta)
  values (
    public.current_clinic_id(),
    auth.uid(),
    'ai_dictation_interest',
    jsonb_build_object('at', now())
  );
end;
$$;

-- Mandatory, no exceptions (see 20260824070300_revoke_seed_default_medicines_public.sql and
-- 20260825060000_default_privileges_revoke_execute_public.sql for why this project no longer
-- trusts Postgres's own default grant, or ALTER DEFAULT PRIVILEGES, without an explicit re-check
-- of pg_proc after every new function): even though the default-privileges migration should
-- already keep PUBLIC off a brand-new function, this REVOKE is explicit and unconditional, and
-- the ACL is verified live afterwards, not assumed.
revoke execute on function public.log_ai_dictation_interest() from public;
grant execute on function public.log_ai_dictation_interest() to authenticated;
