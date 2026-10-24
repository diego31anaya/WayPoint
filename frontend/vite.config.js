import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    // The FastAPI backend (backend/) serves /api; see the root README.
    server: { proxy: { '/api': { target: env.VITE_API_URL || env.VITE_API_BASE_URL || 'http://127.0.0.1:8000', changeOrigin: true } } },
  }
})
