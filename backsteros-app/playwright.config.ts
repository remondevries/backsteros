import { defineConfig, devices } from "@playwright/test";

const dummyClerkKey = "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // output: "standalone" — next start is unsupported; match Dockerfile CMD.
    command: "pnpm build && pnpm start:standalone",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: "3100",
      E2E_BYPASS_AUTH: "1",
      NEXT_PUBLIC_E2E_BYPASS_AUTH: "1",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:8787",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: dummyClerkKey,
      CLERK_SECRET_KEY: "sk_test_browser-tests-only",
    },
  },
});
