// Tugas Saya (kelompok due) + Jelajah → List + filter (telat, assignee, status) + toggle selesai.
import { test, expect, masuk, foto, AKUN, rpcSebagai, siapkanPapan, buatTugas, bersihkanTugas, tanggalWib } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

test('Tugas Saya menampilkan kelompok sama dengan web_tugas_saya', async ({ page }) => {
  const api = await rpcSebagai(AKUN.citra.email, 'web_tugas_saya');
  await masuk(page, AKUN.citra.email);
  for (const g of ['telat', 'hari_ini', 'tiga_hk', 'nanti', 'tanpa_due']) {
    const grup = page.locator(`details[data-grup=${g}]`);
    if (!api[g].length) { await expect(grup).toHaveCount(0); continue; }
    await expect(grup.locator('summary .jumlah')).toHaveText(String(api[g].length));
    if (g === 'tanpa_due') await grup.locator('summary').click();      // grup ini tertutup bawaan
    for (const t of api[g]) await expect(grup.locator(`li[data-id="${t.id}"] .nama`)).toHaveText(t.name);
  }
  // kartu telat menampilkan jumlah hari telat (kalender)
  if (api.telat.length) {
    const t = api.telat[0];
    await expect(page.locator(`li[data-id="${t.id}"] .chip.telat`)).toContainText(`telat ${t.lewat_hari} hr`);
  }
  await foto(page, '02-tugas-saya');
});

test('Jelajah → buka list → filter telat', async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.locator('#nav-bawah [data-nav=jelajah]').click();
  await expect(page).toHaveURL(/\/jelajah$/);
  await page.locator('a[data-list="1100340000900101"]').click();
  await expect(page).toHaveURL(/\/l\/1100340000900101$/);
  await expect(page.locator('#judul')).toHaveText('Fase Uji 1');

  const d = await rpcSebagai(AKUN.owner.email, 'web_daftar', { p_list: '1100340000900101', p_include_closed: false });
  const hariIni = (await rpcSebagai(AKUN.owner.email, 'web_saya')).hari_ini;
  const telat = d.tasks.filter((t) => t.due_wib && t.due_wib < hariIni).map((t) => t.id).sort();
  await expect(page.locator('.isi-list li.baris-tugas')).toHaveCount(d.tasks.length);

  await page.locator('.chip-pilih[data-due=telat]').click();
  await expect(page).toHaveURL(/d=telat/);
  await expect(page.locator('.isi-list li.baris-tugas')).toHaveCount(telat.length);
  const tampak = (await page.locator('.isi-list li.baris-tugas').evaluateAll((els) => els.map((e) => e.dataset.id))).sort();
  expect(tampak).toEqual(telat);
  for (const id of telat) await expect(page.locator(`li[data-id="${id}"] .chip.telat`)).toBeVisible();
  await foto(page, '03-list-filter-telat');

  // filter tersimpan di URL: muat ulang tetap terfilter; pindah ke Board membawa filter
  await page.reload();
  await expect(page.locator('.chip-pilih[data-due=telat]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.isi-list li.baris-tugas')).toHaveCount(telat.length);
  await page.locator('[data-uji=tab-board]').click();
  await expect(page).toHaveURL(/v=board/);
  await expect(page).toHaveURL(/d=telat/);
  await expect(page.locator('.kartu-papan')).toHaveCount(telat.length);
  await page.locator('[data-uji=tab-daftar]').click();
  await expect(page).not.toHaveURL(/v=board/);

  // filter assignee + status
  await page.locator('.chip-pilih[data-due=semua]').click();
  await page.selectOption('select[name=assignee]', String(AKUN.dodi.id));
  const milikDodi = d.tasks.filter((t) => t.assignees.some((a) => a.id === AKUN.dodi.id));
  await expect(page.locator('.isi-list li.baris-tugas')).toHaveCount(milikDodi.length);
  await page.selectOption('select[name=status]', 'in progress');
  await expect(page.locator('.isi-list li.baris-tugas')).toHaveCount(milikDodi.filter((t) => t.status === 'in progress').length);
});

test('toggle selesai di daftar (tugas app) + kartu ClickUp tidak bisa di-toggle saat cermin', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'toggle selesai', due: tanggalWib(1), assignees: [AKUN.citra.id] });
  await masuk(page, AKUN.citra.email, undefined, `/l/${listId}`);
  const baris = page.locator(`li[data-id="${t.id}"]`);
  await expect(baris).toBeVisible();
  await baris.locator('.toggle-selesai').click();
  await expect(page.locator('.toast')).toContainText('ditandai selesai');
  await expect(baris).toHaveCount(0);                                  // selesai disembunyikan
  const d = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id });
  expect(d.task.selesai).toBe(true);
  expect(d.task.status).toBe('complete');

  await page.locator('input[name=selesai]').check();
  await expect(page).toHaveURL(/selesai=1/);
  await expect(baris).toHaveClass(/selesai/);
  await baris.locator('.toggle-selesai').click();
  await expect(page.locator('.toast').last()).toContainText('dibuka lagi');
  await expect.poll(async () => (await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: t.id })).task.status).toBe('to do');

  await page.goto('/l/1100340000900101');
  await expect(page.locator('li.baris-tugas.terkunci .toggle-selesai').first()).toBeDisabled();
});

test('buka kartu dari list lalu kembali: posisi gulir dipulihkan, halaman baru mulai dari atas', async ({ page }) => {
  await masuk(page, AKUN.owner.email, undefined, '/l/1100340000900101');
  await expect(page.locator('.isi-list li.baris-tugas').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 500));
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(300);
  const tautan = page.locator('.isi-list li.baris-tugas a.tautan-tugas').last();
  await tautan.scrollIntoViewIfNeeded();
  const yKlik = await page.evaluate(() => window.scrollY);
  await tautan.evaluate((el) => el.click());                            // klik tanpa auto-scroll Playwright
  await expect(page).toHaveURL(/\/t\//);
  await expect(page.locator('[data-uji=judul-tugas]')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.locator('#tombol-kembali').click();
  await expect(page).toHaveURL(/\/l\/1100340000900101$/);
  await expect(page.locator('.isi-list li.baris-tugas').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(yKlik);
});
