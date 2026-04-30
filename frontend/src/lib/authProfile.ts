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
  xp_total?: number;
  points?: number;
  level?: number;
  streak?: number;
};

const unauthorizedMessage = "Your account is not authorized for this portal.";
let hasLoggedProfileApiUrl = false;
const isDev = import.meta.env.DEV;

export async function getCurrentInternalProfile(accessToken?: string): Promise<InternalProfile | null> {
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

  const authorizationToken = accessToken ?? session.access_token;
  if (!authorizationToken) {
    throw new Error("Your session is missing or expired. Please sign in again.");
  }

  const response = await fetch(profileUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authorizationToken}`,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | {
        reason?: string;
        error?: string;
        authEmail?: string | null;
      }
      | null;

    const reason = errorPayload?.reason ?? "unknown";
    if (response.status === 403 && isDev) {
      console.warn("[auth/profile] 403 forbidden", {
        reason,
        authEmail: errorPayload?.authEmail ?? null,
      });
    }

    if (response.status === 403) {
      if (reason === "profile_not_found") {
        throw new Error(
          "Your account is signed in but no internal profile exists yet. Contact an admin if this persists."
        );
      }
      if (reason === "profile_inactive") {
        throw new Error("Your internal profile is inactive. Contact an admin for access.");
      }
      if (reason === "missing_session" || reason === "invalid_token") {
        throw new Error("Your session is missing or expired. Please sign in again.");
      }
    }

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

export async function requireActiveInternalProfileWithToken(
  accessToken: string
): Promise<InternalProfile> {
  const profile = await getCurrentInternalProfile(accessToken);

  if (!profile || !profile.is_active) {
    throw new Error(unauthorizedMessage);
  }

  return profile;
}
