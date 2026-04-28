import { io, type Socket } from "socket.io-client";

type ServerToClientEvents = {
  "message:new": (payload: {
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
  }) => void;
  "message:error": (payload: { message: string }) => void;
};

type ClientToServerEvents = {
  "conversation:join": (payload: { conversationId: string }) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;
  "message:send": (payload: {
    conversationId: string;
    body: string;
    messageType: "text" | "image" | "file";
    attachment?: {
      path: string;
      name: string;
      mimeType: string;
      size: number;
    };
  }) => void;
};

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let socketToken: string | null = null;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3003";

export function getSocketClient(accessToken: string) {
  if (!accessToken) {
    console.warn("[socket] no access token; not connecting");
    return null;
  }

  if (socket && socketToken !== accessToken) {
    console.log("[socket] token changed; reconnecting socket");
    socket.disconnect();
    socket = null;
    socketToken = null;
  }

  if (!socket) {
    socketToken = accessToken;
    socket = io(SOCKET_URL, {
      auth: {
        token: accessToken,
      },
      withCredentials: true,
    });
    // TODO: Remove after deployment validation confirms transport upgrades are stable.
    socket.io.engine.on("upgrade", (transport) => {
      console.log("[socket] upgraded transport", transport.name);
    });
    socket.on("connect", () => {
      console.log("[socket] connected", socket?.id, SOCKET_URL);
    });
    socket.on("connect_error", (error) => {
      console.error("[socket] connect_error", error.message, SOCKET_URL);
    });
    socket.on("disconnect", (reason) => {
      console.warn("[socket] disconnected", reason);
    });
  }

  return socket;
}

export function disconnectSocketClient() {
  if (socket) {
    socket.disconnect();
  }
  socket = null;
  socketToken = null;
}
