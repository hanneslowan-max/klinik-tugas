// Cari (kode, ID lama, tempel URL ClickUp) + notifikasi tandai dibaca.
import { test, expect, masuk, foto, AKUN, rpcSebagai, siapkanPapan, buatTugas, bersihkanTugas } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

test('cari kode & nama, tempel URL ClickUp langsung membuka kartu', async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.locator('#nav-bawah [data-nav=cari]').click();
  await page.fill('input[name=q]', 'Y7');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/cari\?q=Y7/);
  await expect(page.locator('li.baris-tugas[data-id=z8r3uj0001]')).toBeVisible();
  await foto(page, '21-cari');

  await page.fill('input[name=q]', 'https://app.clickup.com/t/z8r3uj0005');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();
  await expect(page).toHaveURL(/\/t\/z8r3uj0005$/);
  await expect(page.locator('[data-uji=judul-tugas]')).toContainText('D2 · Uji rekap data mingguan');

  await page.goto('/cari?q=z8r3uj0012');
  await expect(page).toHaveURL(/\/t\/z8r3uj0012$/);
  await page.goto('/cari?q=kata-yang-tidak-ada-xyz');
  await expect(page.locator('.kosong')).toHaveText('Tidak ada yang cocok.');
});

test('notifikasi assign: lonceng → daftar → buka kartu menandai dibaca (hanya notifikasi itu)', async ({ page }) => {
  // hanya menyentuh notifikasi yang dibuat tes ini (notifikasi seed tidak ditandai dibaca)
  const { listId } = await siapkanPapan();
  const sebelum = (await rpcSebagai(AKUN.eka.email, 'web_notif', { p_limit: 1 })).belum;
  const t = await buatTugas(listId, { name: 'notif assign', assignees: [AKUN.eka.id] });
  await masuk(page, AKUN.eka.email);
  await expect(page.locator('#lonceng-angka')).toHaveText(String(sebelum + 1));
  await page.locator('#lonceng').click();
  await expect(page).toHaveURL(/\/notif$/);
  const n = page.locator('[data-uji=daftar-notif] li[data-jenis=assign]').filter({ hasText: t.name });
  await expect(n).toContainText('budi santoso menugaskan Anda');
  await expect(n.locator('.chip.info')).toHaveText('baru');
  await n.locator('a').click();
  await expect(page).toHaveURL(new RegExp(`/t/${t.id}$`));
  await expect.poll(async () => (await rpcSebagai(AKUN.eka.email, 'web_notif', { p_limit: 1 })).belum).toBe(sebelum);
});
