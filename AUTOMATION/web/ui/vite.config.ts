import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* Build output lands in `ui/dist` and is served by FastAPI (api/main.py).
   It is git-ignored: a bundle in the tree would be a second copy of the source,
   and the toolchain rebuilds it in seconds.

   The dev server proxies every backend surface to the real studio on 8189, so
   `toolchain.py dev` gives HMR against live data instead of a mock. The origin
   guard (api/security.py) accepts it: it only asks that the Origin hostname be
   local, and `localhost:5173` is. */
const BACKEND = 'http://127.0.0.1:8189'
const proxied = ['/api', '/img', '/static', '/legacy', '/docs', '/openapi.json']

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((path) => [path, { target: BACKEND, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
})
