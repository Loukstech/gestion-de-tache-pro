import { defineConfig, loadEnv } from 'vite'
import { geminiMiddleware } from './server/gemini.js'
import react from '@vitejs/plugin-react'

// The app is served through the Arena live-preview proxy, so we must:
//  - bind on 0.0.0.0
//  - accept any Host header (allowedHosts: true)
//  - let the HMR websocket go through the proxy origin
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const keyList = process.env.GEMINI_API_KEYS || env.GEMINI_API_KEYS
  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY
  const middleware = geminiMiddleware({ apiKey, apiKeys: keyList, model: process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-flash-lite-latest' })
  return {
  plugins: [react(), { name: 'taskvox-gemini', configureServer(server) { server.middlewares.use(middleware) }, configurePreviewServer(server) { server.middlewares.use(middleware) } }],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  }
})
