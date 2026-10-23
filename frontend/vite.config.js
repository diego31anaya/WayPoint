import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The FastAPI backend (backend/) serves /api; see the root README.
  server: { proxy: { '/api': process.env.VITE_API_URL ?? 'http://127.0.0.1:8000' } },
})
