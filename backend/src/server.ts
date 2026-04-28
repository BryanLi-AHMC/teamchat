import cors from "cors";
import express from "express";

import { env } from "./config/env";
import { groupsRouter } from "./routes/groups";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { progressRouter } from "./routes/progress";

const app = express();
const PORT = process.env.PORT || 3003;

app.use(
  cors({
    origin: env.frontendOrigin,
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
app.use("/api/messages", messagesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/progress", progressRouter);

app.listen(PORT, () => {
  console.log("=== TEAMCHAT BACKEND STARTED ===");
  console.log("Port:", PORT);
  console.log("Environment:", process.env.NODE_ENV || "development");
});
