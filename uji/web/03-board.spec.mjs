// Board kanban: seret kartu antar kolom → status berubah (web_ubah_tugas + versi); konflik versi → muat ulang.
import { test, expect, masuk, foto, AKUN, rpcSebagai, siapkanPapan, buatTugas, bersihkanTugas, tanggalWib } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

// Seret dengan mouse (SortableJS forceFallback). Kolom tujuan = kolom ke-2 yang terlihat sebagian di 390px.
async function seret(page, kartu, kolomTujuan) {
  await kartu.scrollIntoViewIfNeeded();
  const a = await kartu.boundingBox();
  const b = await kolomTujuan.boundingBox();
  const lebar = page.viewportSize().width;
  const tx = Math.min(b.x + 30, lebar - 10);
  const ty = Math.max(b.y + 30, a.y);
  await page.mouse.move(a.x + a.width / 2, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + 20, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 15 });
  await page.mouse.move(tx + 1, ty + 2, { steps: 2 });
  await page.mouse.up();
}

test('seret kartu ke kolom lain mengubah status', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'kartu papan', due: tanggalWib(2), assignees: [AKUN.dodi.id] });
  await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
  const kartu = page.locator(`.kartu-papan[data-id="${t.id}"]`);
  await expect(page.locator('.kolom-isi[data-status="to do"]').locator(`[data-id="${t.id}"]`)).toBeVisible();
  await foto(page, '04-board-sebelum');

  await seret(page, kartu, page.locator('.kolom-isi[data-status="in progress"]'));
  await expect(page.locator('.toast').last()).toContainText('Status: in progress');
  await expect(page.locator('.kolom-isi[data-status="in progress"]').locator(`[data-id="${t.id}"]`)).toBeVisible();
  const d = await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id });
  expect(d.task.status).toBe('in progress');
  expect(d.activity.some((x) => x.jenis === 'status' && x.ke.status === 'in progress' && x.sumber === 'ui')).toBe(true);
  await foto(page, '05-board-sesudah');
});

test('konflik versi saat seret → pesan + board dimuat ulang', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'kartu konflik', due: tanggalWib(3), assignees: [AKUN.dodi.id] });
  await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
  await expect(page.locator(`.kartu-papan[data-id="${t.id}"]`)).toBeVisible();

  // orang lain mengubah kartu (versi naik) sementara board terbuka
  await rpcSebagai(AKUN.owner.email, 'web_ubah_tugas', { p_task: t.id, p_body: { name: `${t.name} (diubah owner)` }, p_versi: t.versi });

  await seret(page, page.locator(`.kartu-papan[data-id="${t.id}"]`), page.locator('.kolom-isi[data-status="in progress"]'));
  await expect(page.locator('.toast.galat').last()).toContainText('sudah diubah orang lain');
  // dimuat ulang: kartu kembali ke kolom asal dengan nama baru, status tidak berubah
  const diKolom = page.locator('.kolom-isi[data-status="to do"]').locator(`[data-id="${t.id}"]`);
  await expect(diKolom).toBeVisible();
  await expect(diKolom).toContainText('(diubah owner)');
  const d = await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id });
  expect(d.task.status).toBe('to do');
  await foto(page, '06-board-konflik');
});

test('urutkan ulang kartu dalam satu kolom → urutan tersimpan (orderindex)', async ({ page }) => {
  const { listId2 } = await siapkanPapan();
  const a = await buatTugas(listId2, { name: 'urut A' });
  const b = await buatTugas(listId2, { name: 'urut B' });
  const c = await buatTugas(listId2, { name: 'urut C' });
  await masuk(page, AKUN.owner.email, undefined, `/l/${listId2}?v=board`);
  const kolom = page.locator('.kolom-isi[data-status="to do"]');
  const urutan = () => kolom.locator('.kartu-papan').evaluateAll((els) => els.map((e) => e.dataset.id));
  const awal = (await urutan()).filter((id) => [a.id, b.id, c.id].includes(id));
  expect(awal).toHaveLength(3);
  // seret kartu terakhir ke paling atas kolom
  const akhir = kolom.locator(`[data-id="${awal[2]}"]`);
  const pertama = kolom.locator(`[data-id="${awal[0]}"]`);
  await akhir.scrollIntoViewIfNeeded();
  const kb = await akhir.boundingBox();
  const pb = await pertama.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + 12);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + 2, { steps: 4 });
  await page.mouse.move(pb.x + pb.width / 2, pb.y + 4, { steps: 15 });
  await page.mouse.move(pb.x + pb.width / 2, pb.y + 2, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('.toast').last()).toContainText('Urutan disimpan');
  const harap = [awal[2], awal[0], awal[1]];
  await expect.poll(async () => (await urutan()).filter((id) => harap.includes(id))).toEqual(harap);
  await page.reload();
  await expect.poll(async () => (await urutan()).filter((id) => harap.includes(id))).toEqual(harap);
});

test('kartu ClickUp terkunci di board saat mode cermin', async ({ page }) => {
  await masuk(page, AKUN.citra.email, undefined, '/l/1100340000900101?v=board');
  await expect(page.locator('[data-uji=list-cermin]')).toBeVisible();
  const kartu = page.locator('.kartu-papan[data-id="z8r3uj0003"]');
  await expect(kartu).toHaveClass(/terkunci/);
  await seret(page, kartu, page.locator('.kolom-isi[data-status="in progress"]'));
  await expect(page.locator('.kolom-isi[data-status="to do"]').locator('[data-id="z8r3uj0003"]')).toBeVisible();
  const d = await rpcSebagai(AKUN.citra.email, 'web_detail', { p_task: 'z8r3uj0003' });
  expect(d.task.status).toBe('to do');
});
