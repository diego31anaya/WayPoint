import process from 'node:process'
import { defineConfig } from '@playwright/test'

const apiPort = process.env.BLOCKBOOST_TEST_API_PORT ?? '8000'
const uiPort = process.env.BLOCKBOOST_TEST_UI_PORT ?? '5173'
const apiURL = `http://127.0.0.1:${apiPort}`
const uiURL = `http://127.0.0.1:${uiPort}`

export default defineConfig({
  testDir: './tests',
  use: { baseURL: uiURL, headless: true },
  webServer: [
    { command: `python -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`, cwd: '../backend', url: `${apiURL}/api/health`, reuseExistingServer: !process.env.CI, env: { DATA_MODE: 'mock', AI_ENABLED: 'false', SNOWFLAKE_AGENT_SETUP_VERIFIED: 'false', SNOWFLAKE_ACCOUNT: '', SNOWFLAKE_PAT: '', SNOWFLAKE_AGENT_TOKEN: '' } },
    { command: `npm run dev -- --host 127.0.0.1 --port ${uiPort}`, url: uiURL, env: { VITE_API_URL: apiURL }, reuseExistingServer: !process.env.CI },
  ],
})
