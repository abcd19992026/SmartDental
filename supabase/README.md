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
- The **WhatsApp Cloud API access token** (Phase 5) follows the same rule: it will live in Edge Function secrets (`supabase secrets set WHATSAPP_ACCESS_TOKEN=...`) or Supabase Vault, never in a `VITE_*` variable.

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
