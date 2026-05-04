import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

import {
  assertConversationMembership,
  insertMessage,
  storedMessageToNewPayload,
  toConversationRoom,
  updateMemberLastRead,
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

type ReadPayload = {
  conversationId?: string;
  lastReadMessageId?: string;
};

type SocketCurrentProfile = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

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

      const { data, error } = await withTimeout(
        supabaseAdmin.auth.getUser(token),
        10_000,
        "Supabase auth.getUser"
      );
      if (error || !data.user) {
        console.error("[socket] invalid auth token", {
          error: error?.message,
          tokenPresent: Boolean(token),
          tokenPrefix: token ? token.slice(0, 12) : null,
        });
        throw new Error("Invalid auth token");
      }

      const currentProfile = await withTimeout(
        resolveCurrentProfile(supabaseAdmin, {
          email: data.user.email,
        }),
        10_000,
        "resolveCurrentProfile"
      );
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

    socket.on("message:send", async (payload: SendPayload, ack?: (result: unknown) => void) => {
      const reply = (result: { ok: true; message: ReturnType<typeof storedMessageToNewPayload> } | { ok: false; error: string }) => {
        if (typeof ack === "function") {
          ack(result);
        }
      };

      try {
        const currentProfile = socket.data.currentProfile as SocketCurrentProfile | undefined;
        const conversationId = payload?.conversationId;
        if (!currentProfile?.id || !conversationId) {
          throw new Error("conversationId is required.");
        }

        await assertConversationMembership(supabaseAdmin!, currentProfile.id, conversationId);
        const room = toConversationRoom(conversationId);
        // Ensure this socket is in the room before broadcast. Otherwise a fast
        // message:send can beat conversation:join and the sender never receives message:new.
        await socket.join(room);

        const parsed = validateMessageInput(payload);
        const stored = await insertMessage(supabaseAdmin!, {
          conversationId,
          senderId: currentProfile.id,
          body: parsed.body,
          messageType: parsed.messageType,
          attachment: parsed.attachment,
        });

        const newPayload = storedMessageToNewPayload(stored);
        io.to(room).emit("message:new", newPayload);
        reply({ ok: true, message: newPayload });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send message.";
        socket.emit("message:error", { message });
        reply({ ok: false, error: message });
      }
    });

    socket.on("message:read", async (payload: ReadPayload) => {
      try {
        const currentProfile = socket.data.currentProfile as SocketCurrentProfile | undefined;
        const conversationId = payload?.conversationId;
        const lastReadMessageId = payload?.lastReadMessageId;
        if (!currentProfile?.id || !conversationId || !lastReadMessageId) {
          throw new Error("conversationId and lastReadMessageId are required.");
        }

        await assertConversationMembership(supabaseAdmin!, currentProfile.id, conversationId);
        await updateMemberLastRead(supabaseAdmin!, currentProfile.id, conversationId, lastReadMessageId);

        const room = toConversationRoom(conversationId);
        await socket.join(room);
        io.to(room).emit("message:read", {
          conversationId,
          userId: currentProfile.id,
          lastReadMessageId,
        });
      } catch (error) {
        socket.emit("message:error", {
          message: error instanceof Error ? error.message : "Unable to update read receipt.",
        });
      }
    });
  });

  setSocketServer(io);
  return io;
}
