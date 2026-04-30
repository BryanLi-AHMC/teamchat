import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const defaultFrontendOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5177",
  "https://teamchat-cr5.pages.dev",
  "https://teamchat.pages.dev",
  "https://teamchat.wanpanel.ai",
].join(",");

const rawFrontendOrigins =
  process.env.FRONTEND_ORIGINS?.trim() ||
  process.env.FRONTEND_ORIGIN?.trim() ||
  defaultFrontendOrigins;

export const env = {
  port: toNumber(process.env.PORT, 3003),
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  frontendOrigins: rawFrontendOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

/** Any Vite port when developing against this API (avoids CORS whack-a-mole). */
const isNonProdLocalhostOrigin = (origin: string): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
};

export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  if (isNonProdLocalhostOrigin(origin)) {
    return true;
  }

  const allowed = env.frontendOrigins.includes(origin);
  // Legacy Pages URL shape: https://teamchat-<id>.pages.dev
  const isTeamChatPagesDev =
    /^https:\/\/teamchat-[a-z0-9-]+\.pages\.dev$/i.test(origin) ||
    origin === "https://teamchat.pages.dev";
  // Cloudflare Pages preview deploys: https://<hash>.teamchat-cr5.pages.dev
  const isTeamChatCr5PagesPreview =
    /^https:\/\/[a-z0-9-]+\.teamchat-cr5\.pages\.dev$/i.test(origin);

  return allowed || isTeamChatPagesDev || isTeamChatCr5PagesPreview;
};
