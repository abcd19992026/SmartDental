-- Phase 10A Step 1: letterhead branding data for the printed prescription header/footer. The
-- layout itself is fixed and owned by us; clinics only ever supply data here, never markup --
-- a per-clinic template editor would let a clinic break its own letterhead and then call support.
--
-- Nullable, defaults to '{}'::jsonb: a clinic that has never touched this must still work, and
-- the print page (10B) must not break on an absent or empty object.
--
-- Shape (every field optional):
-- {
--   "regd_no": "4760/A",
--   "tagline": "Quality and Affordable Dentistry.",
--   "doctors": [
--     {"name": "Dr. Priyanka", "qualification": "BDS (PAT)"},
--     {"name": "Dr. Siddharth", "qualification": null},
--     {"name": "Dr. Vishal", "qualification": "BDS (PAT)"}
--   ],
--   "timings": "10:00 AM to 2:00 PM & 4:00 PM to 9:00 PM",
--   "sunday_timings": "10:00 AM to 3:00 PM",
--   "footer_note": "Not For Medico-Legal Purpose",
--   "logo_both_sides": false
-- }
--
-- doctors[].qualification is optional per doctor -- on the real printed slip two dentists carry
-- "BDS (PAT)" and the third shows a graphic instead. 10B must not render a dangling separator
-- when it's absent.
--
-- logo_both_sides is a display flag only, default false. It mirrors the SAME clinic logo
-- (clinics.logo_url, already uploaded through the existing clinic-logos flow) on both sides of
-- the clinic name -- not a second logo field, not a second upload path, no watermark.
--
-- CHECK is deliberately loose: object-or-null, and doctors-is-array-if-present. Nothing
-- stricter -- every field is optional and varies by clinic, which is the entire reason this is
-- jsonb rather than columns.
alter table public.clinics
  add column letterhead jsonb default '{}'::jsonb,
  add constraint clinics_letterhead_is_object check (
    letterhead is null or jsonb_typeof(letterhead) = 'object'
  ),
  add constraint clinics_letterhead_doctors_is_array check (
    letterhead is null
    or not (letterhead ? 'doctors')
    or jsonb_typeof(letterhead -> 'doctors') = 'array'
  );
