-- Phase W1-A: WhatsApp Embedded Signup -- each clinic connects its OWN WhatsApp number/WABA/token.
--
-- Design notes:
-- * The access token (and the two-step PIN) live ONLY in Supabase Vault. The connections table
--   stores just the Vault secret ids. Only the service role can read a token, through
--   get_clinic_whatsapp_token().
-- * Only the service role writes this table (edge functions). `authenticated` gets no INSERT/
--   UPDATE/DELETE privilege at all and only a column-level SELECT that leaves out the secret ids.
-- * A phone number / WABA can belong to only ONE clinic. The unique indexes are partial
--   (status <> 'disconnected') so a clinic that disconnects releases the number for re-use.

-- ---------------------------------------------------------------------------------------------
-- 1. clinics: an owner must NOT be able to point their clinic at someone else's number.
--    The webhook finds the clinic by clinics.waba_phone_number_id (.maybeSingle()), so a duplicate
--    would silently break message/status delivery for BOTH clinics. Before this migration the
--    owner UPDATE policy + column grants let an owner write these two columns directly.
-- ---------------------------------------------------------------------------------------------
create unique index clinics_waba_phone_number_id_key
  on public.clinics (waba_phone_number_id)
  where waba_phone_number_id is not null and waba_phone_number_id <> '';

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

  -- whatsapp_enabled is deliberately NOT here: an owner switches their own automatic sending on/off
  -- (WhatsAppTab). The two ids below are written only by connect-whatsapp / disconnect-whatsapp
  -- (service role, auth.uid() is null) or a platform administrator.
  if new.waba_phone_number_id is distinct from old.waba_phone_number_id
  or new.waba_business_id     is distinct from old.waba_business_id
  then
    raise exception 'WhatsApp number can only be changed through Connect WhatsApp';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. clinic_whatsapp_connections
-- ---------------------------------------------------------------------------------------------
create table public.clinic_whatsapp_connections (
  clinic_id         uuid primary key references public.clinics(id) on delete cascade,
  waba_id           text not null,
  phone_number_id   text not null,
  business_id       text,
  status            text not null,
  -- true when the clinic keeps using the WhatsApp Business app on the same number (coexistence).
  coexistence       boolean not null default false,
  token_secret_id   uuid,
  token_expires_at  timestamptz,
  pin_secret_id     uuid,
  connected_at      timestamptz,
  last_checked_at   timestamptz,
  last_error        text,
  -- when the 24-hour contacts/history sync request was sent (coexistence only).
  sync_requested_at timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint clinic_whatsapp_connections_status_check
    check (status in ('connected', 'needs_reconnect', 'disconnected', 'error')),
  constraint clinic_whatsapp_connections_ids_nonempty
    check (length(btrim(waba_id)) > 0 and length(btrim(phone_number_id)) > 0)
);

create unique index clinic_whatsapp_connections_phone_number_id_key
  on public.clinic_whatsapp_connections (phone_number_id)
  where status <> 'disconnected';

create unique index clinic_whatsapp_connections_waba_id_key
  on public.clinic_whatsapp_connections (waba_id)
  where status <> 'disconnected';

create trigger set_updated_at
  before update on public.clinic_whatsapp_connections
  for each row execute function public.set_updated_at();

alter table public.clinic_whatsapp_connections enable row level security;

-- One per-command SELECT policy. No INSERT/UPDATE/DELETE policy exists for any client role, so
-- those commands are denied (0 rows) even if a privilege were granted by mistake.
create policy clinic_whatsapp_connections_select
  on public.clinic_whatsapp_connections
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (clinic_id = public.current_clinic_id() and public.current_user_role() = 'owner')
  );

-- Default privileges would otherwise hand anon/authenticated full table access.
revoke all on public.clinic_whatsapp_connections from public, anon, authenticated;
-- Column-level SELECT: token_secret_id, pin_secret_id, created_by, sync/created/updated are not readable.
grant select (clinic_id, waba_id, phone_number_id, business_id, status, coexistence,
              token_expires_at, connected_at, last_checked_at, last_error)
  on public.clinic_whatsapp_connections to authenticated;
grant all on public.clinic_whatsapp_connections to service_role;

-- Frontend-safe view. security_invoker so the caller's own RLS + column grants apply.
-- payment_status is always 'unknown': the Graph API has no documented field that says whether the
-- clinic's own payment method is attached, so the UI shows "check in WhatsApp Manager".
create view public.clinic_whatsapp_status
  with (security_invoker = true) as
select
  clinic_id,
  status,
  phone_number_id,
  waba_id,
  token_expires_at,
  connected_at,
  last_checked_at,
  last_error,
  coexistence,
  'unknown'::text as payment_status
from public.clinic_whatsapp_connections;

revoke all on public.clinic_whatsapp_status from public, anon, authenticated;
grant select on public.clinic_whatsapp_status to authenticated;
grant all on public.clinic_whatsapp_status to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Audit: log_activity() now also covers this table.
--    * This table's primary key is clinic_id (no `id` column) -> own branch.
--    * The Vault secret ids are stripped from the logged snapshots.
--    * Restores the "clinic already gone" handling from 20260826070900 (the live function had
--      lost it when patients/appointments were added) and applies it to the new table too.
-- ---------------------------------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_user_id uuid := auth.uid();
begin
  if TG_TABLE_NAME = 'visits' then
    v_entity_type := 'visit';
  elsif TG_TABLE_NAME = 'patient_payments' then
    v_entity_type := 'payment';
  elsif TG_TABLE_NAME = 'prescriptions' then
    v_entity_type := 'prescription';
  elsif TG_TABLE_NAME = 'medicines' then
    v_entity_type := 'medicine';
  elsif TG_TABLE_NAME = 'clinics' then
    v_entity_type := 'clinic';
  elsif TG_TABLE_NAME = 'patients' then
    v_entity_type := 'patient';
  elsif TG_TABLE_NAME = 'appointments' then
    v_entity_type := 'appointment';
  elsif TG_TABLE_NAME = 'clinic_whatsapp_connections' then
    v_entity_type := 'whatsapp_connection';
  else
    raise exception 'log_activity() attached to unexpected table %', TG_TABLE_NAME;
  end if;

  if TG_TABLE_NAME = 'clinics' then
    v_clinic_id := case when TG_OP = 'DELETE' then null else coalesce(new.id, old.id) end;
    v_entity_id := coalesce(new.id, old.id);
  elsif TG_TABLE_NAME = 'clinic_whatsapp_connections' then
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
    v_entity_id := v_clinic_id;
    if TG_OP = 'DELETE' and v_clinic_id is not null
       and not exists (select 1 from public.clinics c where c.id = v_clinic_id)
    then
      v_clinic_id := null;
    end if;
  else
    v_clinic_id := coalesce(new.clinic_id, old.clinic_id);
    v_entity_id := coalesce(new.id, old.id);

    if TG_OP = 'DELETE' and v_clinic_id is not null
       and not exists (select 1 from public.clinics c where c.id = v_clinic_id)
    then
      v_clinic_id := null;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action := v_entity_type || '_created';
    v_old := null;
    v_new := to_jsonb(new) - 'updated_at';
  elsif TG_OP = 'UPDATE' then
    v_action := v_entity_type || '_updated';
    v_old := to_jsonb(old) - 'updated_at';
    v_new := to_jsonb(new) - 'updated_at';
  else
    v_action := v_entity_type || '_deleted';
    v_old := to_jsonb(old) - 'updated_at';
    v_new := null;
  end if;

  if TG_TABLE_NAME = 'clinic_whatsapp_connections' then
    v_old := v_old - 'token_secret_id' - 'pin_secret_id';
    v_new := v_new - 'token_secret_id' - 'pin_secret_id';
  end if;

  insert into public.activity_log (clinic_id, user_id, action, entity_type, entity_id, meta)
  values (
    v_clinic_id,
    v_user_id,
    v_action,
    v_entity_type,
    v_entity_id,
    jsonb_build_object(
      'actor_type', case when v_user_id is null then 'system' else 'user' end,
      'old', v_old,
      'new', v_new
    )
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.log_activity() from public;

create trigger log_activity_insert_delete
  after insert or delete on public.clinic_whatsapp_connections
  for each row execute function public.log_activity();

-- The daily refresh job touches last_checked_at on every connection; that alone is not worth an
-- audit row per clinic per day.
create trigger log_activity_update
  after update on public.clinic_whatsapp_connections
  for each row
  when ((to_jsonb(old) - 'last_checked_at' - 'updated_at') is distinct from (to_jsonb(new) - 'last_checked_at' - 'updated_at'))
  execute function public.log_activity();

-- ---------------------------------------------------------------------------------------------
-- 4. Vault helpers -- service role only. vault.* is not exposed through PostgREST, so edge
--    functions reach it through these wrappers.
-- ---------------------------------------------------------------------------------------------
create function public.get_clinic_whatsapp_token(p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from public.clinic_whatsapp_connections c
  join vault.decrypted_secrets ds on ds.id = c.token_secret_id
  where c.clinic_id = p_clinic_id;
$$;

revoke execute on function public.get_clinic_whatsapp_token(uuid) from public, anon, authenticated;
grant execute on function public.get_clinic_whatsapp_token(uuid) to service_role;

create function public.store_clinic_whatsapp_secret(p_clinic_id uuid, p_kind text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
begin
  if p_kind not in ('token', 'pin') then
    raise exception 'invalid secret kind';
  end if;
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'empty secret';
  end if;

  v_name := 'wa_' || p_kind || '_' || p_clinic_id::text;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    v_id := vault.create_secret(p_secret, v_name, 'WhatsApp ' || p_kind || ' for clinic ' || p_clinic_id::text);
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.store_clinic_whatsapp_secret(uuid, text, text) from public, anon, authenticated;
grant execute on function public.store_clinic_whatsapp_secret(uuid, text, text) to service_role;

create function public.delete_clinic_whatsapp_secrets(p_clinic_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets
  where name in ('wa_token_' || p_clinic_id::text, 'wa_pin_' || p_clinic_id::text);
$$;

revoke execute on function public.delete_clinic_whatsapp_secrets(uuid) from public, anon, authenticated;
grant execute on function public.delete_clinic_whatsapp_secrets(uuid) to service_role;

-- Deleting a clinic cascades to its connection row; this removes the Vault secrets with it so no
-- orphaned token is left behind.
create function public.cleanup_whatsapp_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id in (old.token_secret_id, old.pin_secret_id);
  return old;
end;
$$;

revoke execute on function public.cleanup_whatsapp_secrets() from public, anon, authenticated;

create trigger cleanup_whatsapp_secrets
  before delete on public.clinic_whatsapp_connections
  for each row execute function public.cleanup_whatsapp_secrets();

-- ---------------------------------------------------------------------------------------------
-- 5. Daily token check/refresh job. The URL is read from Vault at run time (same pattern as
--    send-recall-messages). One-time setup per environment, NOT in this file:
--      select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/refresh-whatsapp-tokens', 'refresh_whatsapp_tokens_url');
--    'cron_secret' already exists. 02:30 UTC = 08:00 IST.
-- ---------------------------------------------------------------------------------------------
select cron.schedule(
  'refresh-whatsapp-tokens-daily',
  '30 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_whatsapp_tokens_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
