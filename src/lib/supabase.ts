import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
  );
}

// Safe to expose in the client bundle -- RLS is what actually protects data. The service role
// key and the WhatsApp access token must never appear here or in any VITE_* variable; see
// supabase/README.md.
export const supabase = createClient<Database>(url, anonKey);
