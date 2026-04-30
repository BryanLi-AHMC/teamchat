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
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
  if (apiBase.endsWith("/api")) {
    return apiBase.slice(0, -"/api".length);
  }
  return "http://localhost:3003";
}

/** GET `VITE_API_BASE_URL/health` — fast check that the HTTP API is up (Socket.IO shares the same host/port). */
export async function probeTeamchatApiHealth(): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";
  if (!base) {
    return {
      ok: false,
      message:
        "VITE_API_BASE_URL was not set when this bundle was built. In Cloudflare Pages: Settings → Environment variables → add VITE_API_BASE_URL (and other VITE_* from frontend/.env.example) for Production, then redeploy. Vite bakes these in at build time, not runtime.",
    };
  }
  try {
    const res = await fetch(`${base}/health`, { method: "GET" });
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
        reason: `no connect or connect_error within ${timeoutMs}ms (API not on this host/port, or handshake stuck — confirm backend started and VITE_API_BASE_URL / VITE_SOCKET_URL match it)`,
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
