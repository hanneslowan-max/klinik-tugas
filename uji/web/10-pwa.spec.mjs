// PWA & header: manifest, service worker hanya menyimpan aset same-origin (bukan data Supabase), header keamanan.
import { test, expect, masuk, AKUN } from './bantu.mjs';

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('terdaftar & cache hanya berisi aset aplikasi (tanpa data)', async ({ page }) => {
    await page.goto('/masuk');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await masuk(page, AKUN.citra.email, undefined, '/t/rtujib0001');
    await expect(page.locator('[data-uji=judul-tugas]')).toBeVisible();
    await page.reload();                                                  // permintaan kedua lewat SW
    await expect(page.locator('[data-uji=judul-tugas]')).toBeVisible();
    const kunci = await page.evaluate(async () => {
      const hasil = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) hasil.push(r.url);
      return hasil;
    });
    expect(kunci.length).toBeGreaterThan(5);
    const asal = new URL(page.url()).origin;
    for (const u of kunci) {
      expect(u.startsWith(asal), u).toBe(true);
      expect(u).not.toMatch(/\/rest\/v1|\/auth\/v1|\/storage\/v1/);
    }
  });
});

test('header keamanan, manifest, robots, rute SPA & 404 aset', async ({ request }) => {
  const r = await request.get('/t/z8r3uj0001');
  expect(r.status()).toBe(200);
  const hd = r.headers();
  expect(hd['content-security-policy']).toContain("script-src 'self'");
  expect(hd['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(hd['x-robots-tag']).toContain('noindex');
  expect(hd['referrer-policy']).toBe('no-referrer');
  expect(await r.text()).toContain('<script type="module" src="/js/app.js">');
  expect((await request.get('/js/tidak-ada.js')).status()).toBe(404);
  expect((await request.get('/.htaccess')).status()).toBe(403);
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.lang).toBe('id');
  expect(m.start_url).toBe('/saya');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  const v = await request.get('/vendor/muat.js');
  expect(v.headers()['cache-control']).toBe('no-cache');
});

test('config.js belum diisi → pesan jelas, bukan layar kosong', async ({ page }) => {
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: "window.RHJ_CONFIG = Object.freeze({ SUPABASE_URL: 'https://GANTI_REF.supabase.co', SUPABASE_ANON_KEY: 'GANTI_DENGAN_PUBLISHABLE_KEY' });" }));
  await page.goto('/saya');
  await expect(page.locator('[data-uji=konfig-kosong]')).toContainText('Konfigurasi aplikasi belum diisi');
});
