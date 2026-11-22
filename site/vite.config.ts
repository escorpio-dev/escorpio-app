import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Static site plus a few Cloudflare Pages Functions (functions/api, not part of this build). In `npm run dev` there is
// no /api, so the browser falls back to reading the Morpho API directly; `npm run preview:pages` serves both.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
