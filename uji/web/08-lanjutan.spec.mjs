// Alur lanjutan: tekan-tahan (sentuh) di board, polling lonceng 60 dtk, edit/hapus komentar + lampiran komentar,
// sub-tugas, pindah list & arsip, konflik versi di detail, Tugas Saya anggota lain, mode gelap.
import { test, expect, masuk, foto, AKUN, rpcSebagai, siapkanPapan, buatTugas, catatTugas, bersihkanTugas, tanggalWib, sabtuBerikut } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.describe('HP (layar sentuh)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('board: geser cepat tidak memindah kartu; tekan-tahan lalu geser memindah kartu', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'sentuh papan', due: tanggalWib(2), assignees: [AKUN.dodi.id] });
    await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
    const kartu = page.locator(`.kartu-papan[data-id="${t.id}"]`);
    await expect(kartu).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const sentuh = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const tujuan = await page.locator('.kolom-isi[data-status="in progress"]').boundingBox();
    const tx = Math.min(tujuan.x + 25, 380);

    // 1) geser cepat tanpa menahan → tidak ada perubahan status
    let a = await kartu.boundingBox();
    await sentuh('touchStart', a.x + 40, a.y + 15);
    for (let i = 1; i <= 8; i++) await sentuh('touchMove', a.x + 40 + ((tx - a.x - 40) * i) / 8, a.y + 15 + i * 2);
    await sentuh('touchEnd');
    await page.waitForTimeout(600);
    expect((await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id })).task.status).toBe('to do');

    // 2) tekan-tahan 450 ms lalu geser → status berubah
    await page.evaluate(() => { document.querySelector('.papan').scrollLeft = 0; window.scrollTo(0, 0); });
    a = await kartu.boundingBox();
    await sentuh('touchStart', a.x + 40, a.y + 15);
    await page.waitForTimeout(450);
    for (let i = 1; i <= 12; i++) await sentuh('touchMove', a.x + 40 + ((tx - a.x - 40) * i) / 12, a.y + 15 + i * 2);
    await page.waitForTimeout(100);
    await sentuh('touchEnd');
    await expect(page.locator('.toast').last()).toContainText('Status: in progress');
    expect((await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id })).task.status).toBe('in progress');
  });
});

test('lonceng di-poll tiap 60 detik', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'polling lonceng' });
  const awal = (await rpcSebagai(AKUN.eka.email, 'web_notif', { p_limit: 1 })).belum;
  await page.clock.install();
  await masuk(page, AKUN.eka.email);
  const angka = page.locator('#lonceng-angka');
  if (awal) await expect(angka).toHaveText(String(awal)); else await expect(angka).toBeHidden();
  await rpcSebagai(AKUN.citra.email, 'web_komentar', { p_task: t.id, p_teks: '@eka wulandari tolong cek (uji polling)', p_parent: null, p_mentions: null });
  await page.clock.fastForward('00:30');
  if (awal) await expect(angka).toHaveText(String(awal)); else await expect(angka).toBeHidden();   // belum 60 dtk
  await page.clock.fastForward('00:31');
  await expect(angka).toHaveText(String(awal + 1));
});

test('komentar: lampiran di komentar, edit (penulis), hapus', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'komentar lanjutan', assignees: [AKUN.citra.id] });
  await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
  const baru = page.locator('form.penyusun[data-penyusun=baru]');
  await baru.locator('textarea').fill('Bukti terlampir.');
  await baru.locator('input[type=file]').setInputFiles({ name: 'bukti-komentar.png', mimeType: 'image/png', buffer: PNG });
  await expect(baru).toContainText('bukti-komentar.png');
  await baru.getByRole('button', { name: 'Kirim' }).click();
  const k = page.locator('[data-uji=daftar-komentar] > li.komentar').last();
  await expect(k.locator('li.lampiran')).toContainText('bukti-komentar.png');
  await expect(k.locator('[data-uji=unduh-lampiran]')).toHaveAttribute('href', /object\/sign\/lampiran/);

  await k.locator(':scope > .komentar-badan > .komentar-aksi').getByRole('button', { name: 'Ubah', exact: true }).click();
  const ed = page.locator('form.penyusun[data-penyusun^=edit-]');
  await ed.locator('textarea').fill('Bukti terlampir (revisi).');
  await ed.getByRole('button', { name: 'Simpan' }).click();
  await expect(k.locator('.komentar-teks')).toHaveText('Bukti terlampir (revisi).');
  await expect(k).toContainText('(diubah)');

  await k.locator(':scope > .komentar-badan > .komentar-aksi').getByRole('button', { name: 'Hapus', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
  await expect(page.locator('.toast').last()).toContainText('Komentar dihapus');
  await page.locator('[data-uji=tab-riwayat]').click();
  for (const j of ['komentar', 'komentar_edit', 'komentar_hapus', 'lampiran_tambah']) {
    await expect(page.locator(`[data-uji=daftar-riwayat] li[data-jenis=${j}]`).first()).toBeVisible();
  }
});

test('sub-tugas, pindah list, arsip', async ({ page }) => {
  const { listId, listId2 } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'induk', assignees: [AKUN.owner.id] });
  await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
  await page.getByRole('button', { name: 'Sub-tugas' }).click();
  const d = page.getByRole('dialog', { name: 'Sub-tugas baru' });
  await d.locator('input[name=nama]').fill(`uji-b3 sub dari ${t.id}`);
  await d.getByRole('button', { name: 'Buat tugas' }).click();
  await expect(page.locator('section[aria-label=Sub-tugas] li.baris-tugas')).toHaveCount(1);
  const sub = (await rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: t.id })).subtasks[0];
  catatTugas(sub.id);

  // pindah ke list 2 (sub-tugas ikut)
  await page.locator('[data-uji=menu-tugas]').click();
  await page.locator('[data-uji=aksi-pindah]').click();
  await page.getByRole('dialog', { name: 'Pindah ke list' }).getByRole('button', { name: /uji-b3 Papan 2/ }).click();
  await page.getByRole('dialog', { name: 'Konfirmasi' }).getByRole('button', { name: 'Pindahkan' }).click();
  await expect(page.locator('.remah a')).toHaveText('uji-b3 Papan 2');
  expect((await rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: sub.id })).task.list.id).toBe(listId2);

  // arsip → keluar dari daftar list; keluarkan lagi
  await page.locator('[data-uji=menu-tugas]').click();
  await page.locator('[data-uji=aksi-arsip]').click();
  await expect(page.locator('.kotak-info').first()).toContainText('diarsipkan');
  await page.goto(`/l/${listId2}`);
  await expect(page.locator(`li[data-id="${t.id}"]`)).toHaveCount(0);
  await page.goto(`/t/${t.id}`);
  await page.locator('[data-uji=menu-tugas]').click();
  await page.locator('[data-uji=aksi-arsip]').click();
  await expect(page.locator('.toast').last()).toContainText('Dikeluarkan dari arsip');
  await page.locator('[data-uji=tab-riwayat]').click();
  for (const j of ['pindah_list', 'arsip', 'pulih_arsip']) await expect(page.locator(`[data-uji=daftar-riwayat] li[data-jenis=${j}]`)).toHaveCount(1);
});

test('buat tugas lewat tombol + di list (peringatan akhir pekan, assignee, prioritas)', async ({ page }) => {
  const { listId } = await siapkanPapan();
  await masuk(page, AKUN.citra.email, undefined, `/l/${listId}`);
  await page.locator('[data-uji=buat-tugas]').click();
  const d = page.getByRole('dialog', { name: /Tugas baru/ });
  const nama = `uji-b3 dibuat dari UI ${Date.now().toString(36)}`;
  await d.locator('input[name=nama]').fill(nama);
  await d.locator('textarea[name=deskripsi]').fill('Selesai kalau: ada **bukti**.');
  await d.locator('input[name=due]').fill(sabtuBerikut());
  await d.locator('input[name=due]').dispatchEvent('change');
  await expect(d.locator('.kotak-peringatan')).toContainText('akhir pekan');
  await d.locator('select[name=prioritas]').selectOption('2');
  await d.getByRole('button', { name: 'Buat tugas' }).click();
  await expect(page).toHaveURL(/\/t\/rt[0-9a-z]{8}$/);
  const id = page.url().split('/t/')[1];
  catatTugas(id);
  await expect(page.locator('[data-uji=judul-tugas]')).toHaveText(nama);
  await expect(page.locator('[data-uji=desk-render] strong')).toHaveText('bukti');
  await expect(page.locator('[data-uji=peringatan]')).toContainText('akhir pekan');
  const det = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: id });
  expect(det.task.priority).toBe(2);
  expect(det.assignees.map((a) => a.id)).toEqual([AKUN.citra.id]);           // bawaan: pembuat
  expect(det.task.creator.id).toBe(AKUN.citra.id);
});

test('konflik versi di detail → pesan + data dimuat ulang', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'konflik detail', assignees: [AKUN.dodi.id] });
  await masuk(page, AKUN.dodi.email, undefined, `/t/${t.id}`);
  await expect(page.locator('[data-uji=pilih-status]')).toHaveValue('to do');
  await rpcSebagai(AKUN.owner.email, 'web_ubah_tugas', { p_task: t.id, p_body: { priority: 2 }, p_versi: t.versi });
  await page.locator('[data-uji=pilih-status]').selectOption('in progress');
  await expect(page.locator('.toast.galat').last()).toContainText('sudah diubah orang lain');
  await expect(page.locator('select[aria-label=Prioritas]')).toHaveValue('2');   // data terbaru termuat
  await expect(page.locator('[data-uji=pilih-status]')).toHaveValue('to do');
});

test('owner melihat Tugas Saya anggota lain', async ({ page }) => {
  const api = await rpcSebagai(AKUN.owner.email, 'web_tugas_saya', { p_member: AKUN.dodi.id });
  await masuk(page, AKUN.owner.email);
  await page.selectOption('select[aria-label="Tugas milik"]', String(AKUN.dodi.id));
  await expect(page).toHaveURL(new RegExp(`/saya\\?m=${AKUN.dodi.id}`));
  await expect(page.locator('#judul')).toHaveText('Tugas dodi pratama');
  const total = ['telat', 'hari_ini', 'tiga_hk', 'nanti', 'tanpa_due'].reduce((n, g) => n + api[g].length, 0);
  await expect(page.locator('.layar')).toContainText(`${total} kartu terbuka`);
});

test('mode gelap (prefers-color-scheme)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await masuk(page, AKUN.citra.email, undefined, '/t/z8r3uj0001');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(20, 22, 26)');
  await foto(page, '22-mode-gelap');
});
