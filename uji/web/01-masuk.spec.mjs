// Masuk / keluar / penjaga sesi.
import { test, expect, masuk, keluar, foto, AKUN } from './bantu.mjs';

test('tanpa sesi diarahkan ke Masuk, lalu kembali ke tautan tugas', async ({ page }) => {
  await page.goto('/t/rtujib0001');
  await expect(page).toHaveURL(/\/masuk\?lanjut=%2Ft%2Frtujib0001/);
  await expect(page.getByRole('heading', { name: 'Tugas RHJ' })).toBeVisible();
  await expect(page.locator('#nav-bawah')).toBeHidden();
  await foto(page, '01-masuk');

  await page.locator('input[name=email]').fill(AKUN.owner.email);
  await page.locator('input[name=password]').fill('password-salah');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email atau password salah.');

  await page.locator('input[name=password]').fill('rahasia-dev-123');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).toHaveURL(/\/t\/rtujib0001$/);
  await expect(page.locator('[data-uji=judul-tugas]')).toContainText('L1 · Latihan tugas baru');
});

test('login owner → Tugas Saya, lalu keluar', async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await expect(page).toHaveURL(/\/saya$/);
  await expect(page.locator('#judul')).toHaveText('Tugas Saya');
  await expect(page.locator('#nav-bawah')).toBeVisible();
  await keluar(page);
  await page.goto('/saya');
  await expect(page).toHaveURL(/\/masuk\?lanjut=%2Fsaya/);
});

test('login member (seed) → Tugas Saya', async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await expect(page.locator('#judul')).toHaveText('Tugas Saya');
  await expect(page.locator('select[aria-label="Tugas milik"]')).toContainText('Saya (citra lestari)');
  await keluar(page);
});

test('parameter lanjut hanya menerima path internal', async ({ page }) => {
  for (const jahat of ['//contoh.test/curi', 'https://contoh.test/curi', '/\\contoh.test']) {
    await page.goto(`/masuk?lanjut=${encodeURIComponent(jahat)}`);
    await page.locator('input[name=email]').fill(AKUN.citra.email);
    await page.locator('input[name=password]').fill('rahasia-dev-123');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/saya$/);
    await keluar(page);
  }
});
