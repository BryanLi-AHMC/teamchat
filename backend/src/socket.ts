import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import {
  assertConversationMembership,
  insertMessage,
  toConversationRoom,
  validateMessageInput,
} from "./lib/messages";
import { resolveCurrentProfile } from "./lib/currentProfile";
import { setSocketServer } from "./lib/realtime";
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

type SocketCurrentProfile = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

export function attachSocketServer(
  httpServer: HttpServer,
  isAllowedOrigin: (origin: string | undefined) => boolean
) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket CORS blocked origin: ${origin}`));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      if (!supabaseAdmin) {
        throw new Error("Supabase admin is not configured.");
      }

      const token = (socket.handshake.auth as SocketAuth)?.token;
      console.log("[socket] auth token received", {
        hasToken: Boolean(token),
        tokenPrefix: token ? token.slice(0, 12) : null,
      });

      if (!token) {
        throw new Error("Missing auth token");
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        console.error("[socket] invalid auth token", {
          error: error?.message,
          tokenPresent: Boolean(token),
          tokenPrefix: token ? token.slice(0, 12) : null,
        });
        throw new Error("Invalid auth token");
      }

      const currentProfile = await resolveCurrentProfile(supabaseAdmin, {
        email: data.user.email,
      });
      if (!currentProfile || !currentProfile.is_active) {
        throw new Error("Your account is not authorized for this portal.");
      }

      socket.data.currentProfile = currentProfile;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("conversation:join", async (payload: { conversationId?: string }) => {
      try {
        const currentProfile = socket.data.currentProfile as SocketCurrentProfile | undefined;
        const conversationId = payload?.conversationId;
        if (!currentProfile?.id || !conversationId) {
          throw new Error("conversationId is required.");
        }

        await assertConversationMembership(supabaseAdmin!, currentProfile.id, conversationId);
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
        const currentProfile = socket.data.currentProfile as SocketCurrentProfile | undefined;
        const conversationId = payload?.conversationId;
        if (!currentProfile?.id || !conversationId) {
          throw new Error("conversationId is required.");
        }

        await assertConversationMembership(supabaseAdmin!, currentProfile.id, conversationId);
        const parsed = validateMessageInput(payload);
        const stored = await insertMessage(supabaseAdmin!, {
          conversationId,
          senderId: currentProfile.id,
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

  setSocketServer(io);
  return io;
}
