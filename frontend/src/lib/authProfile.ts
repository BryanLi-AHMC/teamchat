import { supabase } from "./supabase";

export type InternalProfile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
    .select("id,email,display_name,avatar_url,role,is_active,created_at,updated_at")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as InternalProfile | null) ?? null;
}

export async function requireActiveInternalProfile(): Promise<InternalProfile> {
  const profile = await getCurrentInternalProfile();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    throw new Error(unauthorizedMessage);
  }

  return profile;
}
