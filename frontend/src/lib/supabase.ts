import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseAnonKey = "missing-supabase-anon-key";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error("Missing Supabase env variables");
  console.warn(
    "Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable auth."
  );
}

export const supabase = createClient(
  supabaseUrl ?? fallbackSupabaseUrl,
  supabaseAnonKey ?? fallbackSupabaseAnonKey
);
