import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Fails the production build early if Pages/CI forgot to inject Vite env (common deploy mistake). */
const requireProductionTeamchatEnv = () => ({
  name: "require-production-teamchat-env",
  configResolved(config: { command: string; mode: string; root: string }) {
    if (config.command !== "build" || config.mode !== "production") {
      return;
    }
    // loadEnv reads .env* files; Cloudflare Pages / CI inject vars into process.env — merge both.
    const fileEnv = loadEnv(config.mode, config.root, "VITE_");
    const fromEnv = (key: string) => (fileEnv[key] ?? process.env[key])?.trim() ?? "";
    const hasApiBase = Boolean(fromEnv("VITE_API_BASE_URL") || fromEnv("VITE_API_URL"));
    const missing: string[] = [];
    if (!hasApiBase) {
      missing.push("VITE_API_BASE_URL or VITE_API_URL");
    }
    for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const) {
      if (!fromEnv(key)) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `[vite] Production build is missing: ${missing.join(", ")}. ` +
          "Cloudflare Pages: use VITE_API_URL or VITE_API_BASE_URL (same value, e.g. https://api.example.com/api). Add vars under Settings → Environment variables, then redeploy. See frontend/.env.example."
      );
    }
  },
});

const logActualPortPlugin = () => ({
  name: 'log-actual-port',
  configureServer(server: { httpServer?: { once: (event: string, callback: () => void) => void; address: () => string | { port: number } | null } }) {
    server.httpServer?.once('listening', () => {
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address !== null ? address.port : null

      if (port !== null) {
        console.log(`\n[Vite] Dev server running on port ${port}\n`)
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), requireProductionTeamchatEnv(), logActualPortPlugin()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Socket.IO in dev: browser uses same origin as Vite; proxy upgrades to the API on 3003.
      "/socket.io": {
        target: "http://localhost:3003",
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
