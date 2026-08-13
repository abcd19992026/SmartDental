// The generated database.types.ts (from `npm run types`) types check-constraint columns like
// profiles.role as plain `string`, not a literal union -- Supabase's type generator doesn't
// read CHECK constraints. This is the app-level source of truth for that union instead.
export type UserRole = "super_admin" | "owner" | "receptionist";
