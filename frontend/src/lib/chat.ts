import { supabase } from "./supabase";
import type { InternalProfile } from "./authProfile";

export type ConversationType = "dm" | "group";

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function getActiveTeammates() {
  const { data, error } = await supabase
    .from("internal_profiles")
    .select("id,email,display_name,role,is_active,created_at,updated_at")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InternalProfile[];
}

export async function getGroupConversationsForUser(userId: string) {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation:conversations!inner(id,type,title,created_by,created_at,updated_at)")
    .eq("user_id", userId)
    .eq("conversation.type", "group")
    .order("updated_at", { ascending: false, foreignTable: "conversation" });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => row.conversation as ConversationSummary | null)
    .filter((conversation): conversation is ConversationSummary => Boolean(conversation));
}

export async function getOrCreateDmConversation(targetUserId: string) {
  const { data, error } = await supabase.rpc("get_or_create_dm", {
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Unable to open DM.");
  }

  return data as string;
}

export async function createGroupConversation(
  currentUserId: string,
  title: string,
  memberIds: string[]
) {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({
      type: "group",
      title: title.trim(),
      created_by: currentUserId,
    })
    .select("id")
    .single();

  if (conversationError || !conversation?.id) {
    throw new Error(conversationError?.message ?? "Unable to create group.");
  }

  const uniqueMembers = Array.from(new Set([currentUserId, ...memberIds]));
  const rows = uniqueMembers.map((userId) => ({
    conversation_id: conversation.id,
    user_id: userId,
  }));

  const { error: membersError } = await supabase.from("conversation_members").insert(rows);
  if (membersError) {
    throw new Error(membersError.message);
  }

  return conversation.id;
}

export async function getConversationById(conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,type,title,created_by,created_at,updated_at")
    .eq("id", conversationId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ConversationSummary;
}

export async function getConversationMembers(conversationId: string) {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("conversation_id,user_id,joined_at")
    .eq("conversation_id", conversationId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ConversationMember[];
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatMessage[];
}

export async function sendMessage(conversationId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty");
  }

  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userResult.user.id,
      body: trimmed,
    })
    .select("id,conversation_id,sender_id,body,created_at")
    .single();

  if (error) {
    console.error("[sendMessage insert failed]", error);
    throw error;
  }

  console.log("[sendMessage success]", data);
  return data as ChatMessage;
}

