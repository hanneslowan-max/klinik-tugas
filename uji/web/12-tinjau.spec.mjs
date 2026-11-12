// Regresi temuan review web (Fase 1):
//  R1/R4 hapus permanen lewat Edge /x/admin/purge → objek Storage ikut terhapus; Edge belum terpasang → konfirmasi
//        eksplisit + peringatan berkas tertinggal.
//  R2    board di HP 360×740: seret kartu ke kolom yang belum terlihat (auto-scroll horizontal) + tinggi kolom.
//  R3    assignee nonaktif (eks-anggota) bisa dilepas dari web; menambah assignee lain tidak gagal karenanya.
//  R5    input tanggal/select di detail: ketikan keyboard tidak menyimpan nilai setengah jadi, fokus tidak hilang.
import {
  test, expect, masuk, foto, AKUN, AWALAN, RUN, rpcSebagai, klienSebagai, layanan, siapkanPapan, buatTugas, bersihkanTugas,
  pasangEdgeTiruan, objekLampiran, hariKerjaKe,
} from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function unggahViaUi(page, nama) {
  await page.locator('[data-uji=input-lampiran]').setInputFiles({ name: nama, mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.toast.sukses').last()).toContainText('1 lampiran terunggah');
}

// ------------------------------------------------------------------ R1/R4 purge
test('Sampah → hapus permanen lewat Edge: berkas lampiran ikut terhapus dari Storage', async ({ page }) => {
  await pasangEdgeTiruan(page);                                   // RHJ_EDGE_ASLI=1 → Edge sungguhan
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'purge berkas', assignees: [AKUN.owner.id] });
  await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
  await unggahViaUi(page, 'purge-satu.png');
  await page.locator('form.penyusun[data-penyusun=baru] textarea').fill('lampiran di komentar');
  await page.locator('form.penyusun[data-penyusun=baru] input[type=file]').setInputFiles({ name: 'purge-dua.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('form.penyusun[data-penyusun=baru]').getByRole('button', { name: 'Kirim' }).click();
  await expect(page.locator('[data-uji=daftar-komentar] li.lampiran')).toContainText('purge-dua.png');
  expect(objekLampiran(t.id)).toHaveLength(2);

  await rpcSebagai(AKUN.owner.email, 'web_hapus', { p_task: t.id });
  await page.goto('/sampah');
  const baris = page.locator(`[data-uji=daftar-sampah] li[data-id="${t.id}"]`);
  await baris.getByRole('button', { name: 'Hapus permanen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click();
  await expect(page.locator('.toast.sukses').last()).toContainText('Dihapus permanen (1 tugas, 2 berkas)');
  await expect(baris).toHaveCount(0);
  await expect(page.locator('.toast')).not.toContainText(['masih di Storage']);
  expect(objekLampiran(t.id)).toEqual([]);
  await expect(rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: t.id })).rejects.toThrow(/tidak ditemukan/i);
  // member tidak lagi bisa me-list berkas tugas yang sudah dipurge
  const { data } = await (await klienSebagai(AKUN.dodi.email)).storage.from('lampiran').list(`t/${t.id}`);
  expect(data || []).toEqual([]);
});

test('detail → hapus permanen saat Edge belum terpasang: konfirmasi kedua, batal aman, lanjut → peringatan berkas tertinggal', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'purge tanpa edge', assignees: [AKUN.owner.id] });
  await page.route('**/functions/v1/api/x/admin/purge', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
  await unggahViaUi(page, 'tertinggal.png');
  await rpcSebagai(AKUN.owner.email, 'web_hapus', { p_task: t.id });
  await page.reload();
  const spanduk = page.locator('[data-uji=spanduk-sampah]');
  await expect(spanduk).toBeVisible();

  // batal di konfirmasi kedua → tugas tetap di Sampah, berkas tetap ada
  await spanduk.getByRole('button', { name: 'Hapus permanen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click();
  const d2 = page.getByRole('dialog', { name: 'Layanan Edge belum terpasang' });
  await expect(d2).toContainText('tertinggal di Storage');
  await d2.getByRole('button', { name: 'Batal' }).click();
  expect((await rpcSebagai(AKUN.owner.email, 'web_detail', { p_task: t.id })).task.deleted_at).not.toBeNull();

  // lanjut → web_purge langsung + peringatan jelas
  await spanduk.getByRole('button', { name: 'Hapus permanen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus permanen' }).click();
  await page.getByRole('dialog', { name: 'Layanan Edge belum terpasang' }).getByRole('button', { name: 'Tetap hapus' }).click();
  await expect(page).toHaveURL(/\/sampah$/);
  await expect(page.locator('.toast').filter({ hasText: 'tertinggal di Storage' })).toBeVisible();
  const sisa = objekLampiran(t.id);
  expect(sisa).toHaveLength(1);
  await layanan('/storage/v1/object/lampiran', { method: 'DELETE', body: { prefixes: sisa } });
  expect(objekLampiran(t.id)).toEqual([]);
});

// ------------------------------------------------------------------ R2 board HP
test.describe('board HP 360×740', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('kolom muat di atas nav bawah dan menampilkan beberapa kartu', async ({ page }) => {
    const { listId } = await siapkanPapan();
    for (let i = 1; i <= 5; i++) await buatTugas(listId, { name: `tinggi kolom ${i}` });
    await masuk(page, AKUN.owner.email, undefined, `/l/${listId}?v=board`);
    await expect(page.locator('.kolom-isi[data-status="to do"] .kartu-papan').first()).toBeVisible();
    const u = await page.evaluate(() => {
      const papan = document.querySelector('.papan').getBoundingClientRect();
      const kolom = document.querySelector('.kolom').getBoundingClientRect();
      const nav = document.querySelector('#nav-bawah').getBoundingClientRect();
      const isi = document.querySelector('.kolom-isi[data-status="to do"]');
      return { papanAtas: papan.top, kolomBawah: kolom.bottom, navAtas: nav.top, tinggiIsi: isi.clientHeight };
    });
    expect(u.papanAtas).toBeLessThan(300);                 // filter dilipat di mode board
    expect(u.kolomBawah).toBeLessThanOrEqual(u.navAtas);   // kolom tidak tertutup nav bawah
    expect(u.tinggiIsi).toBeGreaterThan(330);              // ≥3 kartu terlihat (dulu ±1,5)
    await foto(page, '24-board-hp-360');
    // filter tetap bisa dibuka; papan menyesuaikan tinggi (halaman bergulir, kolom tetap ≥320 px)
    await page.locator('details.filter-lipat > summary').click();
    await expect(page.locator('.chip-pilih[data-due=telat]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector('.papan').getBoundingClientRect().height)).toBeGreaterThanOrEqual(320);
  });

  test('tekan-tahan lalu seret ke tepi kanan → papan bergulir, kartu jatuh di kolom yang tadinya tak terlihat', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'seret jauh', assignees: [AKUN.dodi.id] });
    await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
    const kartu = page.locator(`.kartu-papan[data-id="${t.id}"]`);
    await expect(kartu).toBeVisible();
    const kolomSelesai = page.locator('.kolom-isi[data-status="complete"]');
    expect((await kolomSelesai.boundingBox()).x).toBeGreaterThan(360);   // awalnya di luar layar
    const cdp = await page.context().newCDPSession(page);
    const sentuh = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await kartu.scrollIntoViewIfNeeded();                              // kolom bisa berisi kartu tes lain
    const a = await kartu.boundingBox();
    const x0 = a.x + 40;
    const y0 = a.y + 15;
    await sentuh('touchStart', x0, y0);
    await page.waitForTimeout(450);
    for (let i = 1; i <= 10; i++) await sentuh('touchMove', x0 + ((352 - x0) * i) / 10, y0 + i);
    // tahan di tepi kanan sampai papan bergulir ke ujung
    let gulir = 0;
    for (let i = 0; i < 40 && gulir < 500; i++) {
      await page.waitForTimeout(100);
      await sentuh('touchMove', 352, y0 + 10 + (i % 2));
      gulir = await page.evaluate(() => document.querySelector('.papan').scrollLeft);
    }
    expect(gulir).toBeGreaterThan(500);
    const b = await kolomSelesai.boundingBox();
    expect(b.x + b.width / 2).toBeLessThan(360);                       // sekarang terlihat
    for (let i = 1; i <= 4; i++) await sentuh('touchMove', 352 - ((352 - (b.x + b.width / 2)) * i) / 4, b.y + 60);
    await page.waitForTimeout(150);
    await sentuh('touchEnd');
    await expect(page.locator('.toast').last()).toContainText('Status: complete');
    expect((await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id })).task.status).toBe('complete');
    // snap dipulihkan sesudah seret; posisi gulir papan dipertahankan setelah muat ulang
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.papan')).scrollSnapType)).toContain('mandatory');
    await expect.poll(() => page.evaluate(() => document.querySelector('.papan').scrollLeft)).toBeGreaterThan(300);
  });
});

// ------------------------------------------------------------------ R3 assignee nonaktif
test('assignee nonaktif tampil di dialog dan bisa dilepas; menambah assignee lain tidak gagal', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const eks = await rpcSebagai(AKUN.owner.email, 'web_admin_anggota_simpan', { p: { username: `${AWALAN} eks ${RUN}`, role: 'member', aktif: true } });
  const t = await buatTugas(listId, { name: 'assignee nonaktif', assignees: [AKUN.citra.id, eks.id] });
  await rpcSebagai(AKUN.owner.email, 'web_admin_anggota_simpan', { p: { id: eks.id, aktif: false } });
  const ids = async () => (await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id })).assignees.map((a) => a.id).sort();

  await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
  await expect(page.locator('.assignee-chip').filter({ hasText: '(nonaktif)' })).toBeVisible();

  // 1) tambah dodi, eks-anggota tetap terpasang → tidak lagi "Assignee tidak dikenal"
  await page.locator('[data-uji=ubah-assignee]').click();
  let dlg = page.getByRole('dialog', { name: 'Pilih assignee' });
  const cekEks = dlg.locator(`input[value="${eks.id}"]`);
  await expect(cekEks).toBeChecked();
  await expect(dlg.locator('label', { has: page.locator(`input[value="${eks.id}"]`) })).toContainText('nonaktif');
  await dlg.locator(`input[value="${AKUN.dodi.id}"]`).check();
  await foto(page, '25-assignee-nonaktif-dialog');
  await dlg.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.locator('.toast').last()).toContainText('Assignee disimpan');
  await expect.poll(ids).toEqual([AKUN.citra.id, AKUN.dodi.id, eks.id].sort((x, y) => x - y));

  // 2) lepas eks-anggota
  await page.locator('[data-uji=ubah-assignee]').click();
  dlg = page.getByRole('dialog', { name: 'Pilih assignee' });
  await dlg.locator(`input[value="${eks.id}"]`).uncheck();
  await dlg.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.locator('.assignee-chip').filter({ hasText: '(nonaktif)' })).toHaveCount(0);
  await expect.poll(ids).toEqual([AKUN.citra.id, AKUN.dodi.id].sort((x, y) => x - y));

  // 3) eks-anggota tidak bisa ditambahkan lagi (tidak ada di dialog)
  await page.locator('[data-uji=ubah-assignee]').click();
  dlg = page.getByRole('dialog', { name: 'Pilih assignee' });
  await expect(dlg.locator(`input[value="${eks.id}"]`)).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Batal' }).click();
});

// ------------------------------------------------------------------ R5 input tanggal & select di desktop
test.describe('detail desktop 1280×800 (keyboard)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ketik tanggal due: digit pertama tidak menyimpan, fokus tetap; Enter menyimpan tanggal lengkap sekali', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const awal = hariKerjaKe(10);
    const t = await buatTugas(listId, { name: 'ketik due', due: awal, assignees: [AKUN.citra.id] });
    await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
    const due = page.locator('[data-uji=input-due]');
    await expect(due).toHaveValue(awal);
    const kotak = await due.boundingBox();
    await page.mouse.click(kotak.x + 14, kotak.y + kotak.height / 2);   // segmen pertama
    await page.keyboard.type('1');
    await page.waitForTimeout(700);
    expect(await due.evaluate((el) => el === document.activeElement)).toBe(true);
    expect((await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id })).task.due_wib).toBe(awal);
    await expect(page.locator('[data-uji=due-belum-simpan]')).toBeVisible();

    // lengkapi lewat panah (tetap tanggal valid) lalu Enter
    await page.keyboard.press('ArrowUp');
    const nilai = await due.inputValue();
    expect(nilai).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect(nilai).not.toBe(awal);
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast').last()).toContainText('Due disimpan');
    const d = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id });
    expect(d.task.due_wib).toBe(nilai);
    expect(d.activity.filter((a) => a.jenis === 'due')).toHaveLength(1);
    await expect(page.locator('[data-uji=input-due]')).toBeFocused();   // fokus kembali ke input setelah render ulang
  });

  test('ketik tanggal tidak lengkap lalu keluar → tidak disimpan, nilai dikembalikan', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const awal = hariKerjaKe(12);
    const t = await buatTugas(listId, { name: 'due tak lengkap', due: awal, assignees: [AKUN.citra.id] });
    await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
    const due = page.locator('[data-uji=input-due]');
    const kotak = await due.boundingBox();
    await page.mouse.click(kotak.x + 14, kotak.y + kotak.height / 2);
    await page.keyboard.press('Backspace');                             // satu segmen kosong → nilai tidak lengkap
    await page.locator('[data-uji=judul-tugas]').focus();
    await expect(page.locator('.toast').last()).toContainText('belum lengkap');
    await expect(due).toHaveValue(awal);
    const d = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id });
    expect(d.task.due_wib).toBe(awal);
    expect(d.activity.filter((a) => a.jenis === 'due')).toHaveLength(0);
  });

  test('select Prioritas/Status: panah keyboard tidak langsung menyimpan; Tab menyimpan dan fokus tidak hilang; Esc membatalkan', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'ketik prioritas', assignees: [AKUN.citra.id] });
    await masuk(page, AKUN.citra.email, undefined, `/t/${t.id}`);
    const prio = page.locator('select[aria-label=Prioritas]');
    await prio.focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    await expect(prio).toBeFocused();
    expect((await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id })).task.priority).toBeNull();
    await page.keyboard.press('ArrowDown');
    const pilihan = await prio.inputValue();
    await page.keyboard.press('Tab');
    await expect(page.locator('.toast').last()).toContainText('Prioritas disimpan');
    expect((await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id })).task.priority).toBe(Number(pilihan));
    expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toBe('BODY');

    // status: ArrowDown lalu Esc → kembali, tidak tersimpan (kartu tidak tertutup tak sengaja)
    const status = page.locator('[data-uji=pilih-status]');
    await status.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(status).toHaveValue('to do');
    await page.locator('[data-uji=judul-tugas]').focus();
    await page.waitForTimeout(500);
    const d = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id });
    expect(d.task.status).toBe('to do');
    expect(d.activity.filter((a) => a.jenis === 'status')).toHaveLength(0);
  });
});

