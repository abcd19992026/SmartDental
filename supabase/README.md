# SmartDentist — Supabase setup

## 1. Create the project

Create a new project in the [Supabase dashboard](https://supabase.com/dashboard). Note the project ref, project URL, and anon (public) key — you'll need them for `.env.local` (see the repo root `.env.example`).

## 2. Push the migrations

```
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

If `db push` isn't available in your setup, paste each file in `supabase/migrations/` into the Dashboard's SQL Editor and run them **in filename order** (they're numbered by timestamp, so sorted order is correct order).

## 3. Generate TypeScript types

```
npm run types
```

Do this immediately after the migrations succeed, before writing any frontend code that imports `src/types/database.types.ts` — the app won't compile without it. Re-run this any time you add a new migration.

## 4. Bootstrap the first super_admin

There is no public signup. The very first user must be created manually:

1. Dashboard → Authentication → Users → **Add user** (email + password).
2. Copy the generated user's UUID (shown on their detail page, or via SQL: `select id, email from auth.users;`).
3. In the SQL Editor:
   ```sql
   insert into public.profiles (id, clinic_id, branch_id, role, full_name, is_active)
   values ('<auth-user-uuid>', null, null, 'super_admin', 'Super Admin', true);
   ```

This is deliberately a manual, repeatable procedure rather than a seed migration — it's environment-specific data (a real login for a real operator), not schema, and shouldn't run automatically in every environment.

## 5. Secrets boundary — read this before adding any WhatsApp or admin code

- The **anon key** (`VITE_SUPABASE_ANON_KEY`) is safe in the frontend bundle — it's public by design, and RLS is what actually protects data.
- The **service role key** must **never** be a `VITE_*` env var. Anything prefixed `VITE_` gets inlined into the public client bundle by Vite. The service role key belongs only to:
  - Supabase Edge Functions, which receive it automatically at runtime via the `SUPABASE_SERVICE_ROLE_KEY` environment variable — never hardcode it there either.
  - One-off local/CI admin scripts, run outside the browser, never committed to the repo.
- The **WhatsApp Cloud API access token** follows the same rule: it lives only in Edge Function secrets (`META_ACCESS_TOKEN`, see the Phase 5A section below) or Supabase Vault, never in a `VITE_*` variable.

## 6. Local dev fixtures (optional, for verification only)

For manual Phase 1 verification, create a test clinic and owner/receptionist profiles directly in the SQL Editor. Example — an already-expired clinic, to test the blocking access gate:

```sql
insert into public.clinics (id, name, is_active, plan_expires_on)
values ('11111111-1111-1111-1111-111111111111', 'Test Dental Clinic', true, current_date - interval '1 day');

insert into public.branches (id, clinic_id, name)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Main Branch');
```

Then create an auth user for the owner via the dashboard and insert their `profiles` row with `role = 'owner'` and the clinic's id. See the Phase 1 plan document for the full verification checklist (billing-tamper check, deactivation check, cross-tenant RLS check, branch-scoping check).

## Note for Phase 2

The onboarding wizard's "create owner account" step needs `supabase.auth.admin.createUser()`, which requires the service role key — that can't run in the browser. Phase 2 needs a dedicated Edge Function (e.g. `create-clinic`) that verifies the caller is a `super_admin` via their JWT and creates the clinic, branches, owner auth user, profile, and seeded treatment types in one transaction.

## 7. Phase 5A — WhatsApp sending secrets

Set these as Edge Function secrets (`supabase secrets set NAME=value`), never as `VITE_*` variables:

- `META_ACCESS_TOKEN` — permanent System User token for the Meta Business Portfolio. One token covers every clinic's WABA; the per-send phone number always comes from that clinic's `clinics.waba_phone_number_id` row, never hardcoded.
- `META_APP_SECRET` — used to verify `X-Hub-Signature-256` on every inbound webhook POST. Without this check, anyone who finds the webhook URL could inject fake delivery statuses or fake patient replies.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — checked against `hub.verify_token` during Meta's GET verification handshake, before `hub.challenge` is ever echoed back.
- `CRON_SECRET` — checked against the `X-Cron-Secret` header on every call to `send-recall-messages`. This is the only thing standing between the function and anyone who discovers its URL draining a clinic's paid message quota.

Both `send-recall-messages` and `whatsapp-webhook` run with `verify_jwt = false` in `config.toml` (see the comment there) — neither pg_cron nor Meta ever presents a Supabase user JWT, so each function authenticates the caller itself instead (cron secret / HMAC signature).

### Cron wiring

`supabase/migrations/..._schedule_send_recall_messages.sql` schedules `send-recall-messages` hourly via `pg_cron` + `pg_net`. It reads the function URL and `CRON_SECRET` from Supabase Vault at run time rather than hardcoding them in a migration file that's committed to git. After deploying, run once per environment in the SQL Editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-recall-messages', 'send_recall_messages_url');
select vault.create_secret('<same value as the CRON_SECRET Edge Function secret>', 'cron_secret');
```

The job is scheduled the moment the migration runs, even before these exist — the failure mode until then is just "the hourly job 401s and logs it," not a broken deploy.

### Demo path (Meta test number)

Until a clinic has a real WABA phone number, point a throwaway demo clinic row's `waba_phone_number_id` at Meta's test number to exercise the whole pipeline end to end — the code never special-cases which phone number ID it's given. Two limits of the test number to design demos around:

- It can only send to a small set of pre-verified recipient numbers (add these in Meta's dashboard before testing).
- A template must be `approved` before it can be sent. Meta's pre-approved `hello_world` template (no variables) proves the pipeline works before a real recall template clears approval — seed a `whatsapp_templates` row with `meta_template_name = 'hello_world'`, `is_default = true`, `approval_status = 'approved'`, and a null/empty `variable_mapping`.

**`hello_world` is a demo-only stand-in, not production configuration** — swap in the clinic's real approved recall template (with its `variable_mapping`) before go-live.
