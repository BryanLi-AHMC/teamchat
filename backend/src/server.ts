import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { groupsRouter } from "./routes/groups.js";
import { healthRouter } from "./routes/health.js";
import { messagesRouter } from "./routes/messages.js";
import { progressRouter } from "./routes/progress.js";

const app = express();

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/progress", progressRouter);

app.listen(env.port, () => {
  console.log(`teamchat-backend listening on http://localhost:${env.port}`);
});
