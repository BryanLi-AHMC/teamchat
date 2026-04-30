import cors from "cors";
import express from "express";
import { createServer } from "http";

import { env, isAllowedOrigin } from "./config/env";
import { supabaseAdmin } from "./lib/supabase";
import { authRouter } from "./routes/auth";
import { groupsRouter } from "./routes/groups";
import { healthRouter } from "./routes/health";
import { messagesRouter } from "./routes/messages";
import { profileStatsRouter } from "./routes/profileStats";
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
app.use("/api/profile-stats", profileStatsRouter);
app.use("/api/progress", progressRouter);

const httpServer = createServer(app);
attachSocketServer(httpServer, isAllowedOrigin);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n[FATAL] Port ${PORT} is already in use — this API did not start. Chat (Socket.IO) will time out in the browser until this is fixed.\n` +
        `  • Stop the other process using ${PORT} (often another TeamChat backend terminal), or\n` +
        `  • Windows: Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`
    );
    process.exit(1);
    return;
  }
  console.error("[httpServer] error:", err);
});

const runSupabaseStartupSanityCheck = async (): Promise<void> => {
  console.log("[startup:supabase] process.cwd():", process.cwd());
  console.log("[startup:supabase] SUPABASE_URL:", process.env.SUPABASE_URL);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  console.log(
    "[startup:supabase] SUPABASE_SERVICE_ROLE_KEY exists:",
    Boolean(serviceRoleKey)
  );
  console.log(
    "[startup:supabase] SUPABASE_SERVICE_ROLE_KEY prefix:",
    serviceRoleKey ? serviceRoleKey.slice(0, 18) : "(missing)"
  );

  if (!supabaseAdmin) {
    console.error(
      "[startup:supabase] supabaseAdmin is not initialized (missing config)."
    );
    return;
  }

  const internalProfilesCountResult = await supabaseAdmin
    .from("internal_profiles")
    .select("id", { count: "exact", head: true });

  console.log(
    "[startup:supabase] internal_profiles count:",
    internalProfilesCountResult.count ?? null
  );
  console.log(
    "[startup:supabase] internal_profiles count error:",
    internalProfilesCountResult.error ?? null
  );

  const ariResult = await supabaseAdmin
    .from("internal_profiles")
    .select("id,email,display_name,role,is_active")
    .eq("email", "ariwang@portal.local");

  console.log("[startup:supabase] Ari eq query data:", ariResult.data ?? null);
  console.log("[startup:supabase] Ari eq query error:", ariResult.error ?? null);

  const ariLikeResult = await supabaseAdmin
    .from("internal_profiles")
    .select("id,email,display_name,role,is_active")
    .ilike("email", "%ari%");

  console.log(
    "[startup:supabase] Ari ilike query data:",
    ariLikeResult.data ?? null
  );
  console.log(
    "[startup:supabase] Ari ilike query error:",
    ariLikeResult.error ?? null
  );
};

httpServer.listen(PORT, () => {
  console.log("=== TEAMCHAT BACKEND STARTED ===");
  console.log("Port:", PORT);
  console.log("Environment:", process.env.NODE_ENV || "development");
  console.log("[cors] allowed frontend origins:", env.frontendOrigins);
  console.log("[socket] Socket.IO attached on the same HTTP port as the API.");
  void runSupabaseStartupSanityCheck().catch((error) => {
    console.error("[startup:supabase] unexpected sanity check failure:", error);
  });
});
