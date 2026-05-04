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
  /** Latest message this user has read (inclusive); drives read receipts. */
  last_read_message_id: string | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: "text" | "image" | "file";
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  created_at: string;
};

export type OutgoingAttachment = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

const INTERNAL_PROFILE_SAFE_FIELDS = "id,email,display_name,role,xp_total,level";
const isDev = import.meta.env.DEV;

export async function getActiveTeammates() {
  const { data, error } = await supabase
    .from("internal_profiles")
    .select(INTERNAL_PROFILE_SAFE_FIELDS)
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const teammates = ((data ?? []) as InternalProfile[]).map((profile) => {
    const hasNullXp = profile.xp_total == null;
    const hasNullLevel = profile.level == null;

    if (isDev) {
      console.debug("[chat/getActiveTeammates] selected profile fields", {
        id: profile.id,
        fields: Object.keys(profile),
      });

      if (hasNullXp || hasNullLevel) {
        console.warn("[chat/getActiveTeammates] missing/null profile values", {
          id: profile.id,
          xp_total: profile.xp_total,
          level: profile.level,
        });
      }
    }

    return {
      ...profile,
      xp_total: hasNullXp ? 0 : profile.xp_total,
      level: hasNullLevel ? 1 : profile.level,
    };
  });

  return teammates;
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

export async function getDmConversationMapForUser(userId: string) {
  const { data: memberRows, error: memberError } = await supabase
    .from("conversation_members")
    .select("conversation_id,conversation:conversations!inner(id,type)")
    .eq("user_id", userId)
    .eq("conversation.type", "dm");

  if (memberError) {
    throw new Error(memberError.message);
  }

  const dmConversationIds = (memberRows ?? []).map((row) => row.conversation_id);
  if (dmConversationIds.length === 0) {
    return {} as Record<string, string>;
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("conversation_members")
    .select("conversation_id,user_id")
    .in("conversation_id", dmConversationIds)
    .neq("user_id", userId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  const partnerToConversation: Record<string, string> = {};
  for (const row of participantRows ?? []) {
    partnerToConversation[row.user_id] = row.conversation_id;
  }

  return partnerToConversation;
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
  const extended = await supabase
    .from("conversation_members")
    .select("conversation_id,user_id,joined_at,last_read_message_id")
    .eq("conversation_id", conversationId);

  if (extended.error) {
    const em = extended.error.message ?? "";
    if (em.includes("last_read_message_id")) {
      const { data, error } = await supabase
        .from("conversation_members")
        .select("conversation_id,user_id,joined_at")
        .eq("conversation_id", conversationId);
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []).map((row) => ({
        conversation_id: row.conversation_id,
        user_id: row.user_id,
        joined_at: row.joined_at,
        last_read_message_id: null as string | null,
      })) as ConversationMember[];
    }
    throw new Error(extended.error.message);
  }

  return (extended.data ?? []).map((row) => ({
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    joined_at: row.joined_at,
    last_read_message_id: row.last_read_message_id ?? null,
  })) as ConversationMember[];
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size,created_at"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatMessage[];
}

export async function getLatestMessagesByConversationId(conversationIds: string[]) {
  if (conversationIds.length === 0) {
    return {} as Record<string, ChatMessage>;
  }

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size,created_at"
    )
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(conversationIds.length * 20, 1000));

  if (error) {
    throw new Error(error.message);
  }

  const latestByConversationId: Record<string, ChatMessage> = {};
  for (const message of (data ?? []) as ChatMessage[]) {
    if (!latestByConversationId[message.conversation_id]) {
      latestByConversationId[message.conversation_id] = message;
    }
  }

  return latestByConversationId;
}

export async function addGroupMembers(conversationId: string, userIds: string[]) {
  if (userIds.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("add_group_members", {
    target_conversation_id: conversationId,
    target_user_ids: userIds,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeGroupMember(conversationId: string, targetUserId: string) {
  const { error } = await supabase.rpc("remove_group_member", {
    target_conversation_id: conversationId,
    target_user_id: targetUserId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function dissolveGroup(conversationId: string) {
  const { error } = await supabase.rpc("dissolve_group", {
    target_conversation_id: conversationId,
  });

  if (error) {
    throw new Error(error.message);
  }
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
      message_type: "text",
    })
    .select(
      "id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size,created_at"
    )
    .single();

  if (error) {
    console.error("[sendMessage insert failed]", error);
    throw error;
  }

  console.log("[sendMessage success]", data);
  return data as ChatMessage;
}

export function toChatMessageFromSocket(payload: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  messageType: "text" | "image" | "file";
  attachment?: {
    path: string;
    name: string;
    mimeType: string;
    size: number;
  } | null;
  createdAt: string;
}): ChatMessage {
  return {
    id: payload.id,
    conversation_id: payload.conversationId,
    sender_id: payload.senderId,
    body: payload.body,
    message_type: payload.messageType,
    attachment_path: payload.attachment?.path ?? null,
    attachment_name: payload.attachment?.name ?? null,
    attachment_mime_type: payload.attachment?.mimeType ?? null,
    attachment_size: payload.attachment?.size ?? null,
    created_at: payload.createdAt,
  };
}

/** Total order for messages in a conversation (time, then id). */
export function compareMessagesForOrdering(a: ChatMessage, b: ChatMessage): number {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) {
    return ta - tb;
  }
  return a.id.localeCompare(b.id);
}

/** True if the member's read cursor is at or past `target` (they have read `target`). */
export function memberReadCursorIncludesMessage(
  cursorMessageId: string | null | undefined,
  target: ChatMessage,
  messagesById: Map<string, ChatMessage>
): boolean {
  if (!cursorMessageId) {
    return false;
  }
  const cursor = messagesById.get(cursorMessageId);
  if (!cursor) {
    return false;
  }
  return compareMessagesForOrdering(cursor, target) >= 0;
}

