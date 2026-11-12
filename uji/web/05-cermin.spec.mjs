// Mode cermin (app_settings.mode='cermin'): kartu sumber ClickUp hanya-baca di UI. Tes TIDAK mengubah mode
// (DB dipakai bersama); cukup memastikan mode sekarang cermin.
import { test, expect, masuk, foto, AKUN, rpcSebagai } from './bantu.mjs';

test.beforeAll(async () => {
  const s = await rpcSebagai(AKUN.citra.email, 'web_saya');
  test.skip(s.mode !== 'cermin', `mode sekarang ${s.mode}, bukan cermin`);
});

test('kartu ClickUp terkunci: lencana, spanduk, tanpa kontrol ubah & tanpa kolom komentar', async ({ page }) => {
  await masuk(page, AKUN.citra.email, undefined, '/t/z8r3uj0001');
  await expect(page.locator('#lencana-mode')).toBeVisible();
  await expect(page.locator('[data-uji=spanduk-cermin]')).toContainText('hanya-baca');
  await expect(page.locator('[data-uji=pilih-status]')).toHaveCount(0);        // status = teks, bukan select
  await expect(page.locator('[data-uji=ubah-assignee]')).toHaveCount(0);
  await expect(page.locator('[data-uji=input-due]')).toHaveCount(0);
  await expect(page.locator('[data-uji=desk-edit]')).toHaveCount(0);
  await expect(page.locator('[data-uji=tambah-lampiran]')).toHaveCount(0);
  await expect(page.locator('form.penyusun')).toHaveCount(0);
  await expect(page.locator('[data-uji=komentar-terkunci]')).toBeVisible();
  await expect(page.locator('[data-uji=balas]')).toHaveCount(0);
  await expect(page.locator('button.detail-judul-tombol')).toHaveCount(0);   // judul tidak bisa diketuk-ubah
  // menu aksi tanpa pindah/arsip/hapus
  await page.locator('[data-uji=menu-tugas]').click();
  await expect(page.locator('[data-uji=aksi-pindah]')).toHaveCount(0);
  await expect(page.locator('[data-uji=aksi-arsip]')).toHaveCount(0);
  await expect(page.locator('[data-uji=aksi-hapus]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('dinonaktifkan selama mode cermin');
  await foto(page, '14-cermin-menu');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await foto(page, '15-cermin-detail');

  // lencana → penjelasan
  await page.locator('#lencana-mode').click();
  await expect(page.getByRole('dialog', { name: 'Mode cermin' })).toContainText('hanya-baca');
});

test('kartu app tetap bisa diubah saat cermin; list ClickUp tanpa tombol buat tugas', async ({ page }) => {
  await masuk(page, AKUN.eka.email, undefined, '/t/rtujib0001');
  await expect(page.locator('[data-uji=spanduk-cermin]')).toHaveCount(0);
  await expect(page.locator('[data-uji=pilih-status]')).toBeEnabled();
  await expect(page.locator('form.penyusun[data-penyusun=baru]')).toBeVisible();

  await page.goto('/l/1100340000900102');
  await expect(page.locator('[data-uji=list-cermin]')).toBeVisible();
  await expect(page.locator('[data-uji=buat-tugas]')).toHaveCount(0);
  await page.goto('/l/rlujib0001');
  await expect(page.locator('[data-uji=buat-tugas]')).toBeVisible();
});
