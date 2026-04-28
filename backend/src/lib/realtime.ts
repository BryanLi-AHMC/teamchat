import type { Server as SocketIoServer } from "socket.io";

let socketServer: SocketIoServer | null = null;

export type UserStatsPayload = {
  userId: string;
  xp: number;
  points: number;
  level: number;
  streak: number;
};

export function setSocketServer(io: SocketIoServer) {
  socketServer = io;
}

export function emitUserStatsUpdated(payload: UserStatsPayload) {
  if (!socketServer) {
    return;
  }
  socketServer.emit("user:stats_updated", payload);
}
