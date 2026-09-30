// Playwright untuk web Next.js: HP (390×844, sentuh) + desktop (1280×800), zona WIB, Bahasa Indonesia.
//   npm run uji:e2e                      (server dev di 127.0.0.1:3000 dipakai ulang bila sudah jalan)
//   E2E_BASE_URL=http://127.0.0.1:3100 npm run uji:e2e   (mis. terhadap `next start` hasil build)
// Prasyarat: stack Supabase lokal + seed sintetis (supabase start / db reset). DB dipakai bersama → 1 worker.
import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "./hasil/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "./hasil/laporan", open: "never" }]],
  use: {
    baseURL: BASE,
    // kait tes = atribut data-uji (sama dengan web lama)
    testIdAttribute: "data-uji",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "hp",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${BASE}/masuk`, reuseExistingServer: true, timeout: 180_000, cwd: "../.." },
});
