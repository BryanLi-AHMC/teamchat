import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import {
  assertConversationMembership,
  insertMessage,
  toConversationRoom,
  validateMessageInput,
} from "./lib/messages";
import { supabaseAdmin } from "./lib/supabase";

type SocketAuth = {
  token?: string;
};

type SendPayload = {
  conversationId?: string;
  body?: string;
  messageType?: "text" | "image" | "file";
  attachment?: {
    path: string;
    name: string;
    mimeType: string;
    size: number;
  };
};

export function attachSocketServer(httpServer: HttpServer, frontendOrigin: string) {
  const io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      if (!supabaseAdmin) {
        throw new Error("Supabase admin is not configured.");
      }

      const auth = socket.handshake.auth as SocketAuth;
      const token = auth?.token;
      if (!token) {
        throw new Error("Missing auth token.");
      }

      const {
        data: { user },
        error,
      } = await supabaseAdmin.auth.getUser(token);
      if (error || !user?.id) {
        throw new Error("Invalid auth token.");
      }

      socket.data.userId = user.id;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("conversation:join", async (payload: { conversationId?: string }) => {
      try {
        const userId = socket.data.userId as string | undefined;
        const conversationId = payload?.conversationId;
        if (!userId || !conversationId) {
          throw new Error("conversationId is required.");
        }

        await assertConversationMembership(supabaseAdmin!, userId, conversationId);
        await socket.join(toConversationRoom(conversationId));
      } catch (error) {
        socket.emit("message:error", {
          message: error instanceof Error ? error.message : "Unable to join conversation.",
        });
      }
    });

    socket.on("conversation:leave", (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) {
        return;
      }
      void socket.leave(toConversationRoom(conversationId));
    });

    socket.on("message:send", async (payload: SendPayload) => {
      try {
        const userId = socket.data.userId as string | undefined;
        const conversationId = payload?.conversationId;
        if (!userId || !conversationId) {
          throw new Error("conversationId is required.");
        }

        await assertConversationMembership(supabaseAdmin!, userId, conversationId);
        const parsed = validateMessageInput(payload);
        const stored = await insertMessage(supabaseAdmin!, {
          conversationId,
          senderId: userId,
          body: parsed.body,
          messageType: parsed.messageType,
          attachment: parsed.attachment,
        });

        io.to(toConversationRoom(conversationId)).emit("message:new", {
          id: stored.id,
          conversationId: stored.conversation_id,
          senderId: stored.sender_id,
          body: stored.body,
          messageType: stored.message_type,
          attachment: stored.attachment_path
            ? {
                path: stored.attachment_path,
                name: stored.attachment_name,
                mimeType: stored.attachment_mime_type,
                size: stored.attachment_size,
              }
            : null,
          createdAt: stored.created_at,
        });
      } catch (error) {
        socket.emit("message:error", {
          message: error instanceof Error ? error.message : "Unable to send message.",
        });
      }
    });
  });

  return io;
}
