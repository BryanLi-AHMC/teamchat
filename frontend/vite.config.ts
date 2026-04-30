import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss(), logActualPortPlugin()],
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
