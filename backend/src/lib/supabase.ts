import { createClient } from "@supabase/supabase-js";

import { env } from "../config/env";

const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

export const supabaseAdmin = hasSupabaseConfig
  ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey)
  : null;
