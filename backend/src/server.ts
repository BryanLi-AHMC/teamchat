import cors from "cors";
import express from "express";
import { createServer } from "http";

import { env, isAllowedOrigin } from "./config/env";
import { authRouter } from "./routes/auth";
import { groupsRouter } from "./routes/groups";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { progressRouter } from "./routes/progress";
import { attachSocketServer } from "./socket";

const app = express();
const PORT = env.port;

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("text/plain").send("TEAMCHAT BACKEND OK");
});

app.get("/health", (_req, res) => {
  res.json({
    service: "teamchat-backend",
    status: "ok",
    port: process.env.PORT,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/progress", progressRouter);

const httpServer = createServer(app);
attachSocketServer(httpServer, isAllowedOrigin);

httpServer.listen(PORT, () => {
  console.log("=== TEAMCHAT BACKEND STARTED ===");
  console.log("Port:", PORT);
  console.log("Environment:", process.env.NODE_ENV || "development");
  console.log("[cors] allowed frontend origins:", env.frontendOrigins);
});
