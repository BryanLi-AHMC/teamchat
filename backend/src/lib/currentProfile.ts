import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentProfile = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  xp_total?: number;
  points?: number;
  level?: number;
  streak?: number;
};

type ResolveParams = {
  email?: string | null;
};

export async function resolveCurrentProfile(
  supabaseAdmin: SupabaseClient,
  params: ResolveParams
): Promise<CurrentProfile | null> {
  const normalizedEmail = params.email?.trim().toLowerCase() ?? "";

  console.log("[auth] session", {
    email: normalizedEmail || null,
  });

  if (!normalizedEmail) {
    console.log("[auth] resolved profile", {
      resolvedInternalProfileId: null,
      strategy: "none",
    });
    return null;
  }

  // Only base columns — safe when `add_internal_profile_stats.sql` is not applied yet.
  // Socket auth used to select xp_total/points/…; that caused connect_error on older DBs.
  // Deploy this backend revision to production so Socket.IO stops requesting missing columns.
  const { data, error } = await supabaseAdmin
    .from("internal_profiles")
    .select("id,email,display_name,role,is_active")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  console.log("[auth] resolved profile", {
    resolvedInternalProfileId: data?.id ?? null,
    strategy: "email",
  });

  return (data as CurrentProfile | null) ?? null;
}
