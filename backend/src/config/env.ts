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
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
};
