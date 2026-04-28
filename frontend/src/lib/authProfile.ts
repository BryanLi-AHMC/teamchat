import { supabase } from "./supabase";

export type InternalProfile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  /** When present from API, use as team pet. TODO: add column + select once persisted. */
  pet_id?: string | null;
  role: string;
  is_active: boolean;
};

const unauthorizedMessage = "Your account is not authorized for this portal.";

export async function getCurrentInternalProfile(): Promise<InternalProfile | null> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("internal_profiles")
    .select("id,email,display_name,role,is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("[profile fetch failed]", error);
    throw new Error(error.message);
  }

  return (data as InternalProfile | null) ?? null;
}

export async function requireActiveInternalProfile(): Promise<InternalProfile> {
  const profile = await getCurrentInternalProfile();

  if (!profile || !profile.is_active) {
    throw new Error(unauthorizedMessage);
  }

  return profile;
}
