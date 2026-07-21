import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const isolatedDatabase = process.env.ONMI_E2E_DB_PATH
  || path.join(os.tmpdir(), 'onmi-chatbox-e2e', `database-${process.pid}.json`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: path.join(os.tmpdir(), 'onmi-chatbox-playwright'),
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Local runs use the installed Chrome channel and should not require
    // Playwright's optional FFmpeg bundle. CI installs Playwright Chromium and
    // can retain failure video alongside traces and screenshots.
    video: process.env.CI ? 'retain-on-failure' : 'off',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:e2e',
    // Waiting through Vite's proxy proves both the browser app and API are up.
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      GEMINI_VIDEO_WEBUI_DB_PATH: isolatedDatabase,
      PORT: '3001',
      HOST: '127.0.0.1',
      CORS_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
      OPENAI_API_KEY: '',
      CLAUDE_API_KEY: '',
      GEMINI_API_KEY: '',
      XAI_API_KEY: '',
      OLLAMA_BASE_URL: '',
    },
  },
});
