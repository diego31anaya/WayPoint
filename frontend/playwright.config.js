import process from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:5173', headless: true },
  webServer: [
    { command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000', cwd: '../backend', url: 'http://127.0.0.1:8000/api/health', reuseExistingServer: !process.env.CI, env: { DATA_MODE: 'mock', AI_ENABLED: 'false', SNOWFLAKE_AGENT_SETUP_VERIFIED: 'false', SNOWFLAKE_ACCOUNT: '', SNOWFLAKE_PAT: '', SNOWFLAKE_AGENT_TOKEN: '' } },
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  ],
})
