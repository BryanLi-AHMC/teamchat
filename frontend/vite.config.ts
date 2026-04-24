import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react(), logActualPortPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
})
