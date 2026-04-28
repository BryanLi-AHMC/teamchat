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

export function getSocketClient(accessToken: string) {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3002", {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  socket.auth = { token: accessToken };
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocketClient() {
  if (socket) {
    socket.disconnect();
  }
}
