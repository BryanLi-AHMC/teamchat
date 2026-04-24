import cors from "cors";
import express from "express";

import { env } from "./config/env";
import { groupsRouter } from "./routes/groups";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { progressRouter } from "./routes/progress";

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
