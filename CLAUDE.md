# SmartDentist — standing rules

## Baat karne ka tareeka (HAMESHA)
- Owner (coder nahi hain) se hamesha simple Hinglish (Roman script) me baat karo.
- Chhote vaakya. Kam jargon.
- Technical shabd aaye to saath me ek line me matlab bata do.
- Code, SQL, file names aur commands English me hi rahenge.

## Database / security rules
- RLS per-command policies. `ALL` policy kabhi nahi.
- Har naye non-trigger function ke baad `REVOKE EXECUTE ... FROM PUBLIC` (aur zarurat ho to anon/authenticated) aur `pg_proc` ACL paste karo.
- Arity badle to purane signature DROP karo.
- RLS block hone par rows = 0 dikhte hain, error nahi. Isliye row counts assert karo.
- "Build passed" verification nahi hai. Asli output dikhao.
- Service role key kabhi user se mat maango.
- Test data throwaway rakho aur cleanup statements do.
- `APP_ORIGIN` mat badlo.
- Sirf SmartDentist me kaam karo. Dentivo ko haath mat lagao.
