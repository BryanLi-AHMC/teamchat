import { API_BASE } from "./api";
import { supabase } from "./supabase";

export type UserStats = {
  userId: string;
  xp: number;
  points: number;
  level: number;
  streak: number;
};

export async function awardMyUpdateXp(): Promise<UserStats> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE}/api/profile-stats/me/award-update-xp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    credentials: "include",
  });
  const payload = (await response.json()) as { data?: UserStats; error?: string };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "Unable to update XP.");
  }
  return payload.data;
}
