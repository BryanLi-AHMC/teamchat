import { supabase } from "./supabase";

export type UserUpdate = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export async function fetchUpdatesForUser(userId: string) {
  const { data, error } = await supabase
    .from("user_updates")
    .select("id,user_id,body,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserUpdate[];
}

export async function createMyUpdate(body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Update cannot be empty.");
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
    .insert({
      user_id: user.id,
      body: trimmed,
    })
    .select("id,user_id,body,created_at,updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to post update.");
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
