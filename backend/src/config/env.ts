import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  port: toNumber(process.env.PORT, 3003),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  frontendOrigins: (
    process.env.FRONTEND_ORIGINS ??
    process.env.FRONTEND_ORIGIN ??
    [
      "http://localhost:5173",
      "http://localhost:5177",
      "https://teamchat-cr5.pages.dev",
      "https://teamchat.pages.dev",
      "https://teamchat.wanpanel.ai",
    ].join(",")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  const allowed = env.frontendOrigins.includes(origin);
  const isTeamChatPagesDev =
    /^https:\/\/teamchat-[a-z0-9-]+\.pages\.dev$/.test(origin) ||
    origin === "https://teamchat.pages.dev";

  return allowed || isTeamChatPagesDev;
};
