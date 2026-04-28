import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentProfile = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

type ResolveParams = {
  authUserId?: string | null;
  email?: string | null;
};

export async function resolveCurrentProfile(
  supabaseAdmin: SupabaseClient,
  params: ResolveParams
): Promise<CurrentProfile | null> {
  const normalizedEmail = params.email?.trim().toLowerCase() ?? "";

  console.log("[auth] session", {
    authUserId: params.authUserId ?? null,
    email: normalizedEmail || null,
  });

  if (params.authUserId) {
    const { data, error } = await supabaseAdmin
      .from("internal_profiles")
      .select("id,email,display_name,role,is_active")
      .eq("id", params.authUserId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      console.log("[auth] resolved profile", {
        resolvedInternalProfileId: data.id,
        strategy: "auth_user_id",
      });
      return data as CurrentProfile;
    }
  }

  if (!normalizedEmail) {
    console.log("[auth] resolved profile", {
      resolvedInternalProfileId: null,
      strategy: "none",
    });
    return null;
  }

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
