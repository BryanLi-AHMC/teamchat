import { io, type Socket } from "socket.io-client";

import { API_BASE } from "./api";

type ServerToClientEvents = {
  "message:read": (payload: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string;
  }) => void;
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
  "user:stats_updated": (payload: {
    userId: string;
    xp: number;
    points: number;
    level: number;
    streak: number;
  }) => void;
};

type ClientToServerEvents = {
  "conversation:join": (payload: { conversationId: string }) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;
  "message:read": (payload: { conversationId: string; lastReadMessageId: string }) => void;
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

/** Engine.IO connection timeout (see ManagerOptions.timeout). */
export const SOCKET_IO_HANDSHAKE_TIMEOUT_MS = 12_000;

/**
 * Must be greater than {@link SOCKET_IO_HANDSHAKE_TIMEOUT_MS} so `connect_error` (e.g. timeout) is observed
 * before our own wait ceiling.
 */
export const SOCKET_READY_WAIT_MS = 22_000;

/**
 * Dev: `VITE_SOCKET_URL` if set, else Vite origin (proxy). Production: `VITE_SOCKET_URL`, else same host as
 * `VITE_API_BASE_URL` with `/api` stripped (so one env is enough for Pages deploys).
 */
export function getResolvedSocketUrl(): string {
  const socketEnv = import.meta.env.VITE_SOCKET_URL?.trim() ?? "";
  if (import.meta.env.DEV) {
    if (socketEnv) {
      return socketEnv;
    }
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    return socketEnv || "http://localhost:3003";
  }
  if (socketEnv) {
    return socketEnv;
  }
  // Same host as REST (api.ts): VITE_API_URL or VITE_API_BASE_URL → API_BASE (no /api suffix).
  if (API_BASE) {
    return API_BASE;
  }
  return "http://localhost:3003";
}

/** GET `/api/health` on the API host (see `API_BASE` in api.ts — supports VITE_API_URL or VITE_API_BASE_URL). */
export async function probeTeamchatApiHealth(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!API_BASE) {
    return {
      ok: false,
      message:
        "No API host at build time: set VITE_API_URL or VITE_API_BASE_URL in Cloudflare Pages → Environment variables (Production / Preview), then redeploy. Vite bakes these in at build time.",
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!res.ok) {
      return { ok: false, message: `${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

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

  // After connect_error the Manager can be inactive (active=false); a new wait would
  // never see connect/connect_error on this instance — discard and rebuild.
  if (socket && socketToken === accessToken && !socket.connected && !socket.active) {
    console.log("[socket] replacing inactive socket after failed handshake");
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = accessToken;
    const url = getResolvedSocketUrl();
    socket = io(url, {
      auth: {
        token: accessToken,
      },
      withCredentials: true,
      timeout: SOCKET_IO_HANDSHAKE_TIMEOUT_MS,
      transports: ["polling", "websocket"],
    });
    // TODO: Remove after deployment validation confirms transport upgrades are stable.
    socket.io.engine.on("upgrade", (transport) => {
      console.log("[socket] upgraded transport", transport.name);
    });
    socket.on("connect", () => {
      console.log("[socket] connected", socket?.id, url);
    });
    socket.on("connect_error", (error) => {
      console.error("[socket] connect_error", error.message, url);
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

/**
 * If the Engine.IO client is stuck in "opening" or inactive after an error, waiting for `connect`
 * never fires. Disconnect + connect starts a fresh handshake on the same Socket instance.
 */
export function nudgeSocketReconnect(sock: Socket): void {
  if (sock.connected) {
    return;
  }
  sock.disconnect();
  sock.connect();
}

export type WaitForSocketResult = { ok: true } | { ok: false; reason: string };

/**
 * Resolves when the socket connects, or with a failure reason on connect_error / timeout.
 * Handshake failures (e.g. auth) emit connect_error, not connect — without this, waits always time out.
 */
export function waitForSocketConnection(sock: Socket, timeoutMs: number): Promise<WaitForSocketResult> {
  if (sock.connected) {
    return Promise.resolve({ ok: true });
  }
  return new Promise((resolve) => {
    if (sock.connected) {
      resolve({ ok: true });
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      sock.off("connect", onConnect);
      sock.off("connect_error", onConnectError);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve({
        ok: false,
        reason: `no connect or connect_error within ${timeoutMs}ms — confirm the API host allows Socket.IO (same origin as REST unless VITE_SOCKET_URL is set), use https:// when the app is served over HTTPS (mixed content blocks ws), and that CORS allows this Pages origin`,
      });
    }, timeoutMs);
    const onConnect = () => {
      cleanup();
      resolve({ ok: true });
    };
    const onConnectError = (err: Error) => {
      cleanup();
      resolve({
        ok: false,
        reason: err?.message || "connect_error",
      });
    };
    sock.once("connect", onConnect);
    sock.once("connect_error", onConnectError);
  });
}
