// Detail tugas: field, deskripsi markdown (edit/pratinjau, aman), komentar + balasan + @mention autocomplete,
// notifikasi mention di lonceng, tab Riwayat, lampiran (unggah → Storage → unduh signed URL), peringatan B5/akhir pekan.
import { test, expect, masuk, keluar, foto, AKUN, rpcSebagai, siapkanPapan, buatTugas, bersihkanTugas, tanggalWib, hariKerjaKe, sabtuBerikut, pasangEdgeTiruan } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

// PNG 1×1 transparan
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('komentar + @mention autocomplete + balasan + riwayat + lonceng penerima', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'detail komentar', due: tanggalWib(2), assignees: [AKUN.citra.id], markdown: 'Isi awal.' });
  const notifAwal = (await rpcSebagai(AKUN.owner.email, 'web_notif', { p_limit: 1 })).belum;

  await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
  await expect(page.locator('[data-uji=judul-tugas]')).toHaveText(t.name);
  await expect(page.locator('[data-uji=spanduk-cermin]')).toHaveCount(0);

  // ketik @bud → saran muncul → pilih
  const ta = page.locator('form.penyusun[data-penyusun=baru] textarea');
  await ta.click();
  await ta.pressSequentially('Mohon cek @bud');
  const saran = page.locator('form.penyusun[data-penyusun=baru] .saran-mention');
  await expect(saran).toBeVisible();
  await expect(saran.locator('li[data-username="budi santoso"]')).toBeVisible();
  await foto(page, '07-mention-autocomplete');
  await saran.locator('li[data-username="budi santoso"]').click();
  await expect(ta).toHaveValue('Mohon cek @budi santoso ');
  await ta.pressSequentially('hasil uji di https://contoh.test/hasil');
  await page.locator('form.penyusun[data-penyusun=baru]').getByRole('button', { name: 'Kirim' }).click();
  await expect(page.locator('.toast').last()).toContainText('Komentar terkirim');

  const komentar = page.locator('[data-uji=daftar-komentar] > li.komentar').last();
  await expect(komentar.locator('.mention')).toHaveText('@budi santoso');
  await expect(komentar.locator('.komentar-teks a[href="https://contoh.test/hasil"]')).toHaveAttribute('rel', 'noopener noreferrer');

  // balasan
  await komentar.locator('[data-uji=balas]').click();
  const penyusunBalas = page.locator('form.penyusun[data-penyusun^=balas-]');
  await penyusunBalas.locator('textarea').fill('Balasan uji: sudah saya lengkapi.');
  await penyusunBalas.getByRole('button', { name: 'Balas' }).click();
  await expect(page.locator('.toast').last()).toContainText('Balasan terkirim');
  await expect(page.locator('.balasan-wadah li.komentar .komentar-teks').last()).toHaveText('Balasan uji: sudah saya lengkapi.');

  // riwayat: dibuat, komentar (2)
  await page.locator('[data-uji=tab-riwayat]').click();
  const riwayat = page.locator('[data-uji=daftar-riwayat]');
  await expect(riwayat.locator('li[data-jenis=dibuat]')).toHaveCount(1);
  await expect(riwayat.locator('li[data-jenis=komentar]')).toHaveCount(2);
  await expect(riwayat.locator('li[data-jenis=komentar]').first()).toContainText('citra lestari');
  await riwayat.scrollIntoViewIfNeeded();
  await foto(page, '08-riwayat');
  await keluar(page);

  // Budi (owner, disebut) → lonceng bertambah, notifikasi mention ada
  await masuk(page, AKUN.owner.email);
  await expect(page.locator('#lonceng-angka')).toBeVisible();
  const angka = Number((await page.locator('#lonceng-angka').textContent()).replace('+', ''));
  expect(angka).toBeGreaterThan(notifAwal);
  await page.locator('#lonceng').click();
  await expect(page).toHaveURL(/\/notif$/);
  const n = page.locator(`[data-uji=daftar-notif] li[data-jenis=mention]`).filter({ hasText: t.name }).first();
  await expect(n).toContainText('citra lestari menyebut Anda');
  await foto(page, '09-notifikasi');
  await n.locator('a').click();
  await expect(page).toHaveURL(new RegExp(`/t/${t.id}#c-`));
  await expect(page.locator('li.komentar.sorot')).toBeVisible();
});

test('ubah field + deskripsi markdown (pratinjau aman) + riwayat perubahan', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'detail field', assignees: [AKUN.dodi.id] });
  await masuk(page, AKUN.dodi.email, undefined, `/t/${t.id}`);

  await page.locator('[data-uji=pilih-status]').selectOption('in progress');
  await expect(page.locator('.toast').last()).toContainText('Status: in progress');
  const due = hariKerjaKe(5);
  await page.locator('[data-uji=input-due]').fill(due);
  await page.locator('[data-uji=input-due]').dispatchEvent('change');
  await expect(page.locator('.toast').last()).toContainText('Due disimpan');
  await page.locator('select[aria-label=Prioritas]').selectOption('1');
  await expect(page.locator('.toast').last()).toContainText('Prioritas disimpan');

  // deskripsi: edit → pratinjau (HTML mentah tidak dirender) → simpan
  await page.locator('[data-uji=desk-edit]').click();
  await page.locator('[data-uji=desk-teks]').fill('**Tebal** dan _miring_\n\n- satu\n- dua\n\n<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>\n\n[tautan](javascript:alert(1))');
  await page.locator('[data-uji=desk-pratinjau]').click();
  const pr = page.locator('[data-uji=desk-pratinjau]');
  await expect(pr.locator('strong')).toHaveText('Tebal');
  await expect(pr.locator('li')).toHaveCount(2);
  await expect(pr.locator('img, script')).toHaveCount(0);
  await expect(pr.locator('a[href^="javascript"]')).toHaveCount(0);
  await page.locator('[data-uji=desk-simpan]').click();
  await expect(page.locator('.toast').last()).toContainText('Deskripsi disimpan');
  await expect(page.locator('[data-uji=desk-render] strong')).toHaveText('Tebal');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  const d = await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id });
  expect(d.task.status).toBe('in progress');
  expect(d.task.due_wib).toBe(due);
  expect(d.task.priority).toBe(1);
  expect(d.task.markdown).toContain('**Tebal**');

  await page.locator('[data-uji=tab-riwayat]').click();
  for (const j of ['status', 'due', 'prioritas', 'deskripsi']) {
    await expect(page.locator(`[data-uji=daftar-riwayat] li[data-jenis=${j}]`)).toHaveCount(1);
  }
  await foto(page, '10-detail-field');
});

test('lampiran: unggah PNG → tercatat → tautan unduh signed URL; SVG ditolak', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'detail lampiran', assignees: [AKUN.eka.id] });
  await masuk(page, AKUN.eka.email, undefined, `/t/${t.id}`);
  await page.locator('[data-uji=input-lampiran]').setInputFiles({ name: 'bukti uji.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.toast.sukses').last()).toContainText('1 lampiran terunggah');
  const l = page.locator('li.lampiran').filter({ hasText: 'bukti uji.png' });
  await expect(l).toBeVisible();
  await expect(l.locator('[data-uji=unduh-lampiran]')).toHaveAttribute('href', /\/storage\/v1\/object\/sign\/lampiran\/t\//);
  const href = await l.locator('[data-uji=unduh-lampiran]').getAttribute('href');
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect((await res.body()).length).toBe(PNG.length);
  await expect(l.locator('.jenis img')).toBeVisible();                 // pratinjau gambar via signed URL

  await page.locator('[data-uji=input-lampiran]').setInputFiles({ name: 'jahat.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.locator('.toast.galat').last()).toContainText('Tipe berkas tidak diizinkan');
  await foto(page, '11-lampiran');

  const d = await rpcSebagai(AKUN.eka.email, 'web_detail', { p_task: t.id });
  expect(d.lampiran.map((a) => a.title)).toEqual(['bukti uji.png']);
  expect(d.activity.some((a) => a.jenis === 'lampiran_tambah')).toBe(true);
});

test('peringatan B5 (>7 due/hari) dan due akhir pekan', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const tgl = hariKerjaKe(45);
  const ids = [];
  for (let i = 1; i <= 8; i++) ids.push((await buatTugas(listId, { name: `beban ${i}`, due: tgl, assignees: [AKUN.eka.id] })).id);
  const sabtu = await buatTugas(listId, { name: 'due sabtu', due: sabtuBerikut(), assignees: [AKUN.eka.id] });

  await masuk(page, AKUN.owner.email, undefined, `/t/${ids[0]}`);
  const p = page.locator('[data-uji=peringatan]');
  await expect(p).toContainText('B5');
  await expect(p).toContainText('eka wulandari');
  await expect(page.locator('.assignee-chip.lebih')).toContainText('8 due');
  await foto(page, '12-peringatan-b5');

  await page.goto(`/t/${sabtu.id}`);
  await expect(page.locator('[data-uji=peringatan]')).toContainText('akhir pekan');
});

test('owner: hapus ke Sampah → pulihkan → hapus permanen', async ({ page }) => {
  await pasangEdgeTiruan(page);                         // hapus permanen lewat Edge /x/admin/purge
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'untuk sampah' });
  await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
  await page.locator('[data-uji=menu-tugas]').click();
  await page.locator('[data-uji=aksi-hapus]').click();
  await page.getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(page.locator('[data-uji=spanduk-sampah]')).toBeVisible();

  await page.goto('/sampah');
  const baris = page.locator(`[data-uji=daftar-sampah] li[data-id="${t.id}"]`);
  await expect(baris).toBeVisible();
  await foto(page, '13-sampah');
  await baris.getByRole('button', { name: 'Pulihkan' }).click();
  await expect(baris).toHaveCount(0);
  expect((await rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: t.id })).task.deleted_at).toBeNull();

  await rpcSebagai(AKUN.owner.email, 'web_hapus', { p_task: t.id });
  await page.reload();
  await baris.getByRole('button', { name: 'Hapus permanen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click();
  await expect(baris).toHaveCount(0);
  await expect(page.locator('.toast.sukses').last()).toContainText('Dihapus permanen (1 tugas)');
  await expect(rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: t.id })).rejects.toThrow(/tidak ditemukan/i);
});
