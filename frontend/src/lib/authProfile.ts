import { supabase } from "./supabase";
import { API_BASE } from "./api";

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
let hasLoggedProfileApiUrl = false;

export async function getCurrentInternalProfile(): Promise<InternalProfile | null> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.user) {
    return null;
  }

  console.log("[auth/profile] session", {
    authUserId: session.user.id,
    email: session.user.email ?? null,
  });

  const profileUrl = `${API_BASE}/api/auth/profile`;
  if (!hasLoggedProfileApiUrl) {
    console.log("[auth/profile] api_url", profileUrl);
    hasLoggedProfileApiUrl = true;
  }

  const response = await fetch(profileUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve active profile (${response.status}).`);
  }

  const payload = (await response.json()) as { data?: InternalProfile };
  const profile = payload.data ?? null;
  console.log("[auth/profile] resolved", {
    resolvedInternalProfileId: profile?.id ?? null,
    email: profile?.email ?? null,
  });
  return profile;
}

export async function requireActiveInternalProfile(): Promise<InternalProfile> {
  const profile = await getCurrentInternalProfile();

  if (!profile || !profile.is_active) {
    throw new Error(unauthorizedMessage);
  }

  return profile;
}
