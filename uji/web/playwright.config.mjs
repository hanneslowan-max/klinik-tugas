// Playwright untuk web-lama/ (ARSITEKTUR §12): chromium lokal /opt/pw-browsers, viewport 390×844, zona WIB.
//   npx playwright test -c uji/web/playwright.config.mjs
// Prasyarat: stack Supabase lokal jalan (supabase start) + seed. Tes TIDAK me-reset DB; data uji berawalan "uji-b3".
import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_UJI_WEB || 4173);

function cariChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const akar = '/opt/pw-browsers';
  if (!existsSync(akar)) return undefined;
  const kandidat = readdirSync(akar).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of kandidat) {
    const p = join(akar, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export default defineConfig({
  testDir: DIR,
  testMatch: /.*\.spec\.mjs$/,
  outputDir: join(DIR, 'hasil', 'test-results'),
  fullyParallel: false,
  workers: 1,                       // DB bersama: jalankan berurutan
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: join(DIR, 'hasil', 'laporan'), open: 'never' }]],
  // sebelum & sesudah: buang sisa data uji "uji-b3" (DB lokal dipakai bersama agen lain)
  globalSetup: join(DIR, 'bersih-global.mjs'),
  globalTeardown: join(DIR, 'bersih-global.mjs'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: false,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: cariChromium() },
  },
  webServer: {
    command: `node ${join(DIR, 'server.mjs')}`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/masuk`,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
