// Admin lanjutan (owner, data milik tes web saja): status list, struktur (tidak ditagih), hari libur.
import { test, expect, masuk, foto, AKUN, rpcSebagai, siapkanPapan } from './bantu.mjs';

test('status list: tambah status baru lalu buang lagi', async ({ page }) => {
  const { listId } = await siapkanPapan();
  await masuk(page, AKUN.owner.email, undefined, '/admin?tab=status');
  await page.selectOption('[data-uji=status-pilih-list]', listId);
  await page.getByRole('button', { name: 'Tambah status' }).click();
  const baris = page.locator('.status-edit').last();
  await baris.locator('input[aria-label="Nama status"]').fill('review uji');
  await baris.locator('select[aria-label="Tipe status"]').selectOption('custom');
  await page.getByRole('button', { name: 'Simpan status' }).click();
  await expect(page.locator('.toast').last()).toContainText('Status disimpan');
  let s = await rpcSebagai(AKUN.owner.email, 'web_daftar', { p_list: listId });
  expect(s.list.statuses.map((x) => x.status)).toContain('review uji');
  await foto(page, '23-admin-status');

  await page.selectOption('[data-uji=status-pilih-list]', listId);
  const target = page.locator('.status-edit').filter({ has: page.locator('input[aria-label="Nama status"]') }).nth(3);
  await expect(target.locator('input[aria-label="Nama status"]')).toHaveValue('review uji');
  await target.getByRole('button', { name: 'Buang status' }).click();
  await page.getByRole('button', { name: 'Simpan status' }).click();
  await expect(page.locator('.toast').last()).toContainText('Status disimpan');
  s = await rpcSebagai(AKUN.owner.email, 'web_daftar', { p_list: listId });
  expect(s.list.statuses.map((x) => x.status)).toEqual(['to do', 'in progress', 'complete']);
});

test('struktur: tandai list tidak ditagih lalu kembalikan', async ({ page }) => {
  const { listId2 } = await siapkanPapan();
  await masuk(page, AKUN.owner.email, undefined, '/admin?tab=struktur');
  const item = page.locator(`[data-struktur="${listId2}"]`);
  await item.getByRole('button', { name: 'Ubah' }).click();
  const d = page.getByRole('dialog', { name: 'Ubah list' });
  await d.getByLabel(/Tidak ditagih/).check();
  await d.getByRole('button', { name: 'Simpan' }).click();
  await expect(item).toContainText('tidak ditagih');
  await item.getByRole('button', { name: 'Ubah' }).click();
  await page.getByRole('dialog', { name: 'Ubah list' }).getByLabel(/Tidak ditagih/).uncheck();
  await page.getByRole('dialog', { name: 'Ubah list' }).getByRole('button', { name: 'Simpan' }).click();
  await expect(item).not.toContainText('tidak ditagih');
});

test('hari libur: tambah lalu hapus (tanggal jauh supaya tidak memengaruhi hitungan lain)', async ({ page }) => {
  const tgl = '2031-12-31';
  await masuk(page, AKUN.owner.email, undefined, '/admin?tab=libur');
  await page.fill('input[name=tanggal]', tgl);
  await page.fill('input[name=nama-libur]', 'uji-b3 libur');
  await page.getByRole('button', { name: 'Tambah hari libur' }).click();
  await expect(page.locator('.item-admin').filter({ hasText: 'uji-b3 libur' })).toContainText('Rabu');
  await page.locator('.item-admin').filter({ hasText: 'uji-b3 libur' }).getByRole('button', { name: 'Hapus' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
  await expect(page.locator('.item-admin').filter({ hasText: 'uji-b3 libur' })).toHaveCount(0);
});
