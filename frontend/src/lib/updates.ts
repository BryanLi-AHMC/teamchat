import { supabase } from "./supabase";

export type UserUpdate = {
  id: string;
  user_id: string;
  body: string;
  /** When the update appears on the week calendar (editable). */
  display_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** ISO timestamp for calendar / sorting (back-compat if `display_at` missing). */
export function userUpdateDisplayAtIso(u: UserUpdate): string {
  return u.display_at ?? u.created_at;
}

export async function fetchUpdatesForUser(userId: string) {
  const primary = await supabase
    .from("user_updates")
    .select("id,user_id,body,display_at,created_at,updated_at")
    .eq("user_id", userId)
    .order("display_at", { ascending: false });

  if (!primary.error) {
    return (primary.data ?? []) as UserUpdate[];
  }

  const em = primary.error.message ?? "";
  if (em.includes("display_at")) {
    const fallback = await supabase
      .from("user_updates")
      .select("id,user_id,body,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return (fallback.data ?? []).map((row) => ({ ...row, display_at: null })) as UserUpdate[];
  }

  throw new Error(primary.error.message);
}

export async function createMyUpdate(body: string, displayAtIso?: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Update cannot be empty.");
  }

  const at = displayAtIso ? new Date(displayAtIso) : new Date();
  if (Number.isNaN(at.getTime())) {
    throw new Error("Invalid date or time.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  let { data, error } = await supabase
    .from("user_updates")
    .insert({
      user_id: user.id,
      body: trimmed,
      display_at: at.toISOString(),
    })
    .select("id,user_id,body,display_at,created_at,updated_at")
    .single();

  if (error && error.message.includes("display_at")) {
    const retry = await supabase
      .from("user_updates")
      .insert({ user_id: user.id, body: trimmed })
      .select("id,user_id,body,created_at,updated_at")
      .single();
    data = retry.data;
    error = retry.error;
    if (data && !("display_at" in data)) {
      (data as UserUpdate).display_at = null;
    }
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to post update.");
  }

  return data as UserUpdate;
}

export async function updateMyUpdate(updateId: string, params: { body: string; display_at: string }) {
  const trimmed = params.body.trim();
  if (!trimmed) {
    throw new Error("Update cannot be empty.");
  }
  const at = new Date(params.display_at);
  if (Number.isNaN(at.getTime())) {
    throw new Error("Invalid date or time.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  let { data, error } = await supabase
    .from("user_updates")
    .update({ body: trimmed, display_at: at.toISOString() })
    .eq("id", updateId.trim())
    .eq("user_id", user.id)
    .select("id,user_id,body,display_at,created_at,updated_at")
    .single();

  if (error && error.message.includes("display_at")) {
    const retry = await supabase
      .from("user_updates")
      .update({ body: trimmed })
      .eq("id", updateId.trim())
      .eq("user_id", user.id)
      .select("id,user_id,body,created_at,updated_at")
      .single();
    data = retry.data;
    error = retry.error;
    if (data && !(data as UserUpdate).display_at) {
      (data as UserUpdate).display_at = null;
    }
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save update.");
  }

  return data as UserUpdate;
}

export async function deleteMyUpdate(updateId: string) {
  const trimmedUpdateId = updateId.trim();
  if (!trimmedUpdateId) {
    throw new Error("Update id is required.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("user_updates")
    .delete()
    .eq("id", trimmedUpdateId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to delete update. It may no longer exist or you may not have permission.");
  }
}
