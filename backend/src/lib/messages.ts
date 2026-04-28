import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageType = "text" | "image" | "file";

export type IncomingAttachment = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type StoredMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: MessageType;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  created_at: string;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_MIME_PREFIXES = ["image/", "application/pdf", "text/plain"];
const ALLOWED_FILE_MIME_EXACT = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function toConversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

export async function assertConversationMembership(
  supabaseAdmin: SupabaseClient,
  userId: string,
  conversationId: string
) {
  const { data, error } = await supabaseAdmin
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("You are not a member of this conversation.");
  }
}

export function validateMessageInput(payload: {
  body?: unknown;
  messageType?: unknown;
  attachment?: unknown;
}) {
  const nextMessageType = payload.messageType;
  if (nextMessageType !== "text" && nextMessageType !== "image" && nextMessageType !== "file") {
    throw new Error("Invalid message type.");
  }
  const messageType: MessageType = nextMessageType;

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const attachment = payload.attachment as IncomingAttachment | undefined;

  if (messageType === "text" && !body) {
    throw new Error("Message cannot be empty.");
  }

  if (messageType !== "text") {
    if (!attachment) {
      throw new Error("Attachment metadata is required.");
    }
    if (
      typeof attachment.path !== "string" ||
      typeof attachment.name !== "string" ||
      typeof attachment.mimeType !== "string" ||
      typeof attachment.size !== "number"
    ) {
      throw new Error("Attachment metadata is invalid.");
    }
    if (!attachment.path.trim() || !attachment.name.trim()) {
      throw new Error("Attachment path and name are required.");
    }
    if (attachment.size <= 0) {
      throw new Error("Attachment size is invalid.");
    }
    if (messageType === "image") {
      if (!attachment.mimeType.startsWith("image/")) {
        throw new Error("Image attachments must be an image MIME type.");
      }
      if (attachment.size > MAX_IMAGE_BYTES) {
        throw new Error("Image exceeds 10MB max size.");
      }
    } else {
      const mimeAllowed =
        ALLOWED_FILE_MIME_PREFIXES.some((prefix) => attachment.mimeType.startsWith(prefix)) ||
        ALLOWED_FILE_MIME_EXACT.has(attachment.mimeType);
      if (!mimeAllowed) {
        throw new Error("File type is not allowed.");
      }
      if (attachment.size > MAX_FILE_BYTES) {
        throw new Error("File exceeds 20MB max size.");
      }
    }
  }

  return { body, messageType, attachment };
}

export async function insertMessage(
  supabaseAdmin: SupabaseClient,
  payload: {
    conversationId: string;
    senderId: string;
    body: string;
    messageType: MessageType;
    attachment?: IncomingAttachment;
  }
) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: payload.conversationId,
      sender_id: payload.senderId,
      body: payload.body,
      message_type: payload.messageType,
      attachment_path: payload.attachment?.path ?? null,
      attachment_name: payload.attachment?.name ?? null,
      attachment_mime_type: payload.attachment?.mimeType ?? null,
      attachment_size: payload.attachment?.size ?? null,
    })
    .select(
      "id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size,created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to persist message.");
  }

  return data as StoredMessage;
}
