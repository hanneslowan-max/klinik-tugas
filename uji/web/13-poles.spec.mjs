// Regresi putaran poles web (review UI Fase 1), di HP 390×844 (sentuh) dan desktop 1280×800:
//  1. semua input/select/textarea ≥ 16px (iOS Safari tidak zoom saat fokus)
//  2. tanpa sisa bahasa Inggris (prioritas Mendesak/Tinggi/Normal/Rendah, "Papan (Board)", istilah admin, tooltip
//     tanggal berbahasa Indonesia WIB, bukan ISO)
//  3. lonceng: angka belum-dibaca turun begitu notifikasi dibuka / "Tandai semua dibaca" (tanpa menunggu polling 60 dtk)
//  4. Admin › Sinkron: hitungan sebagai tabel berbahasa Indonesia (bukan [object Object] / kunci mentah)
//  5. dialog "Tugas baru": kaki lembar (tombol aksi) selalu terlihat, juga saat keyboard virtual terbuka
//  6. target sentuh ≥ 44px (remah list induk, tautan Induk, summary Rincian, tombol dialog)
//  7. Board desktop memakai lebar layar; HP tetap geser horizontal + auto-scroll saat seret
//  8. perubahan DB terbaru: tag/checklist kartu impor = chip hanya-baca; kartu di list diarsip tidak di Tugas Saya;
//     Cari: tempel tautan list → buka list (web_cari.rujukan); CSV dari Excel Windows bisa dilampirkan (allowlist P3)
// Screenshot: uji/web/hasil/poles-*.png
import {
  test, expect, masuk, foto, AKUN, AWALAN, RUN, rpcSebagai, siapkanPapan, buatTugas, catatTugas, bersihkanTugas, tanggalWib,
  hariKerjaKe, sqlLokal, sqlUbahLokal, objekLampiran,
} from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

const HP = { nama: 'hp390', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESKTOP = { nama: 'desktop1280', viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false };

// ------------------------------------------------------------------ pembantu pemeriksaan
/** Kontrol teks yang terlihat dengan font < 16px. */
async function fontKecil(page) {
  return page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((e) => !e.matches('[type=checkbox], [type=radio], [type=file], [type=color], [type=range], [type=hidden], [type=button], [type=submit]'))
    .filter((e) => e.getClientRects().length && !e.closest('[hidden], dialog:not([open])'))
    .map((e) => ({ n: `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') || e.name || e.type}]`, px: parseFloat(getComputedStyle(e).fontSize) }))
    .filter((x) => !(x.px >= 16))
    .map((x) => `${x.n} ${x.px}px`));
}

/** Kontrol interaktif terlihat < 44×44 px. Dikecualikan: tautan di tengah kalimat (komentar, markdown). */
async function sentuhKecil(page) {
  return page.evaluate(() => {
    const hasil = [];
    const buka = document.querySelector('dialog[open]');
    for (const el of document.querySelectorAll('button, a[href], select, input, textarea, summary, [role=tab]')) {
      if (el.closest('.komentar-teks, .md, .sr, .lompat, dialog:not([open])')) continue;
      if (buka && !buka.contains(el)) continue;                                   // di balik dialog modal
      if (el.matches('input[type=checkbox], input[type=file], input[type=radio]')) {
        const lab = el.closest('label');
        if (lab && lab.getBoundingClientRect().height >= 44) continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) continue;
      if (Math.round(r.height) < 44 || Math.round(r.width) < 44) {
        hasil.push(`${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return hasil;
  });
}

// kata Inggris yang dulu tampil di UI + kunci mentah hitungan sinkron
const INGGRIS = String.raw`\b(Urgent|High|Low|Board|Edit|Edited|Reset|Scope|Delete|Save|Cancel|Loading|Search|Settings|Upload|Download|member|open|closed|custom|inserted|updated|unchanged|tautan_saja|sudah_ada|sync_raw|list_statuses|space_anggota|tunggu_ms|durasi_detik|anggota_nonaktif)\b|\[object Object\]`;

/** Teks UI (teks terlihat + placeholder/aria-label/title) yang masih berbahasa Inggris, dan tooltip bertanggal ISO. */
async function sisaInggris(page) {
  return page.evaluate((pola) => {
    const re = new RegExp(pola);
    const iso = /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|\dZ\b/;
    const out = new Set();
    // data pengguna/ClickUp (nama tugas, status, isi komentar, nama anggota) bukan teks UI
    const bukanUi = '[hidden], script, style, dialog:not([open]), .md, .komentar-teks, .nama, .detail-judul, .detail-judul-tombol, '
      + 'code, pre, .kartu-papan a, .status-pil, .kolom-kepala, [data-uji=pilih-status], select[aria-label="Filter status"], '
      + '.item-admin .info > strong, .mention, .lampiran .judul, .tautan-list .nama-list, .pohon-space > h3, .pohon-folder > summary, '
      + '[data-uji=status-pilih-list], .status-edit input, .teks-log';
    // padanan istilah ClickUp dalam kurung sengaja dipertahankan: "Papan (Board)", "Awal (open)", "Ditutup (closed)"
    const bersih = (t) => t.replace(/\((Board|open|custom|done|closed)\)/g, '');
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest(bukanUi)) continue;
      if (!el.getClientRects().length && el.tagName !== 'OPTION') continue;
      const t = bersih(n.textContent).trim();
      if (t && re.test(t)) out.add(`teks: ${t.slice(0, 80)}`);
    }
    for (const el of document.querySelectorAll('[placeholder], [aria-label], [title]')) {
      if (el.closest('[hidden], dialog:not([open])') || el.matches('.kartu-papan, .baris-tugas *, .toggle-selesai, .avatar')) continue;
      for (const a of ['placeholder', 'aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (!v) continue;
        if (re.test(bersih(v))) out.add(`@${a}: ${v.slice(0, 80)}`);
        if (a === 'title' && iso.test(v)) out.add(`@title ISO: ${v}`);
      }
    }
    return [...out];
  }, INGGRIS);
}

/** List app milik tes di space uji (dibuat sekali, tidak diarsip saat dipakai). */
async function listUji(nama, spaceId) {
  const s = await rpcSebagai(AKUN.owner.email, 'web_struktur');
  const sp = s.spaces.find((x) => x.id === spaceId);
  let l = sp && (sp.lists || []).find((x) => x.name === nama);
  if (!l) l = await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'list', name: nama, space_id: spaceId } });
  if (l.archived) await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'list', id: l.id, archived: false } });
  return l.id;
}

/**
 * Emulasi keyboard virtual iOS Safari / Chrome Android (resizes-visual): layout viewport TETAP, viewport visual
 * mengecil. window.visualViewport diganti objek palsu; window.__keyboard(tinggi|null) membuka/menutup "keyboard".
 */
async function pasangKeyboardPalsu(page) {
  await page.addInitScript(() => {
    const asli = window.visualViewport;
    const palsu = new EventTarget();
    let tinggi = null;
    for (const [k, f] of Object.entries({
      height: () => tinggi ?? asli.height, width: () => asli.width, offsetTop: () => 0, offsetLeft: () => 0,
      pageTop: () => window.scrollY, pageLeft: () => window.scrollX, scale: () => 1,
    })) Object.defineProperty(palsu, k, { get: f });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => palsu });
    window.__keyboard = (t) => { tinggi = t; palsu.dispatchEvent(new Event('resize')); };
  });
}

// Seret dengan mouse (SortableJS forceFallback), seperti 03-board.
async function seretMouse(page, kartu, kolomTujuan) {
  await kartu.scrollIntoViewIfNeeded();                     // kolom bisa berisi banyak kartu tes lain
  const a = await kartu.boundingBox();
  const b = await kolomTujuan.boundingBox();
  const tx = b.x + b.width / 2;
  const ty = b.y + 40;
  await page.mouse.move(a.x + a.width / 2, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + 20, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 15 });
  await page.mouse.move(tx + 1, ty + 2, { steps: 2 });
  await page.mouse.up();
}

// Data sinkron sintetis dengan bentuk counts/diffs/errors persis impor/sinkron.mjs (runSelesai) + bentuk lama (seed).
const SINKRON_SINTETIS = {
  mode: 'cermin',
  runs: [
    { id: 9901, mode: 'penuh', started_at: '2026-09-29T05:45:03Z', finished_at: '2026-09-29T05:45:09Z',
      counts: {
        list: 9, muat: 'sinkron', only: null, tugas: 143, komentar: 46, anggota: 6, anggota_nonaktif: 1, durasi_detik: 5,
        tulis: {
          tasks: { gagal: 0, updated: 12, inserted: 2, unchanged: 131 }, lists: { gagal: 0, updated: 1, inserted: 0, unchanged: 8 },
          comments: { gagal: 1, updated: 2, inserted: 3, unchanged: 44 }, sync_raw: { gagal: 0, updated: 20, inserted: 0, unchanged: 277 },
          list_statuses: { gagal: 0, dihapus: 1, updated: 0, inserted: 0, unchanged: 36 },
          space_anggota: { gagal: 0, dibuang: 1, updated: 0, ditambah: 2, inserted: 0, unchanged: 0 },
        },
        hilang: { tasks: { ids: ['86b2a0016'], ditandai: 1 }, comments: { ids: [], ditandai: 0 } },
        lampiran: { ok: 3, gagal: 1, dilewati: 0, sudah_ada: 5, tautan_saja: 1 },
        clickup: { rpm: 6000, r429: 2, ulang: 2, unduh: 3, tunggu_ms: 2897, permintaan: 344 },
        space_privat: [{ ok: true, list: 1, anggota: 4, space_id: '901822000002' }],
      },
      census: { lists: [] }, diffs: { rinci: [], selisih: [{ list_id: '901822000101', kunci: 'closed', clickup: 2, db: 3 }] },
      errors: [{ id: 'b2f00201.pdf', err: 'lampiran → HTTP 404: unduh lampiran gagal', status: 404, task_id: '86b2f0002' }] },
    { id: 9900, mode: 'uji', started_at: '2026-09-28T05:45:03Z', finished_at: '2026-09-28T05:45:07Z',
      counts: { tasks: { inserted: 20, updated: 0, unchanged: 0 }, hilang: 'dilewati mode uji' }, census: { lists: 5 }, diffs: [], errors: [] },
  ],
};

// ================================================================== per viewport
for (const vp of [HP, DESKTOP]) {
  test.describe(`poles ${vp.nama}`, () => {
    test.use({ viewport: vp.viewport, hasTouch: vp.hasTouch, isMobile: vp.isMobile });

    // ---------------------------------------------------------------- 1
    test('1. semua input/select/textarea ≥ 16px di semua layar & dialog', async ({ page }) => {
      const { listId } = await siapkanPapan();
      const t = await buatTugas(listId, { name: 'font 16', due: tanggalWib(2), assignees: [AKUN.owner.id], markdown: 'Isi.' });
      const temuan = {};
      const cek = async (nama) => { const k = await fontKecil(page); if (k.length) temuan[nama] = k; };
      await page.goto('/masuk');
      await cek('/masuk');
      await masuk(page, AKUN.owner.email);
      for (const p of ['/saya', `/l/${listId}`, `/l/${listId}?v=board`, `/t/${t.id}`, '/cari', '/admin?tab=token', '/admin?tab=libur', '/ganti-password']) {
        await page.goto(p);
        await page.waitForLoadState('networkidle');
        if (p.endsWith('v=board')) await page.locator('details.filter-lipat > summary').click();
        await cek(p);
      }
      // editor deskripsi + penyusun balasan di detail
      await page.goto(`/t/${t.id}`);
      await page.locator('[data-uji=desk-edit]').click();
      await expect(page.locator('[data-uji=desk-teks]')).toBeVisible();
      await cek('detail: editor deskripsi');
      // editor status (Admin)
      await page.goto('/admin?tab=status');
      await page.locator('[data-uji=status-pilih-list]').selectOption(listId);
      await expect(page.locator('.status-edit').first()).toBeVisible();
      await cek('admin: editor status');
      // dialog: tambah anggota, tugas baru, pindah list
      await page.goto('/admin?tab=anggota');
      await page.locator('[data-uji=tambah-anggota]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await cek('dialog tambah anggota');
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
      await page.goto(`/l/${listId}`);
      await page.locator('[data-uji=buat-tugas]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await cek('dialog tugas baru');
      await foto(page, `poles-1-dialog-font-${vp.nama}`);
      expect(temuan).toEqual({});
    });

    // ---------------------------------------------------------------- 2
    test('2. tanpa sisa bahasa Inggris: prioritas, tab Papan, istilah admin, tooltip tanggal WIB', async ({ page }) => {
      const { listId } = await siapkanPapan();
      const prio = [];
      for (const p of [1, 2, 3, 4]) prio.push(await buatTugas(listId, { name: `prioritas ${p}`, priority: p, due: tanggalWib(p), assignees: [AKUN.owner.id] }));
      const ubahPrio = await buatTugas(listId, { name: 'prioritas diubah', priority: 1, assignees: [AKUN.owner.id] });
      await rpcSebagai(AKUN.owner.email, 'web_ubah_tugas', { p_task: ubahPrio.id, p_body: { priority: 2 }, p_versi: ubahPrio.versi });
      const k = await rpcSebagai(AKUN.owner.email, 'web_komentar', { p_task: ubahPrio.id, p_teks: 'komentar awal', p_parent: null, p_mentions: null });
      await rpcSebagai(AKUN.owner.email, 'web_komentar_edit', { p_comment: k.id, p_teks: 'komentar diubah' });
      await masuk(page, AKUN.owner.email, undefined, `/l/${listId}`);

      // label prioritas di daftar
      const LABEL = ['Mendesak', 'Tinggi', 'Normal', 'Rendah'];
      for (let i = 0; i < 4; i++) {
        const chip = page.locator(`.baris-tugas[data-id="${prio[i].id}"] .prioritas`);
        await expect(chip).toHaveText(LABEL[i]);
        await expect(chip).toHaveAttribute('title', `Prioritas ${LABEL[i]}`);
      }
      await expect(page.locator('[data-uji=tab-board]')).toHaveText('Papan (Board)');
      // tooltip due: tanggal Indonesia (bukan 2026-09-30)
      const judulDue = await page.locator(`.baris-tugas[data-id="${prio[3].id}"] .chip[title^="Due"]`).getAttribute('title');
      expect(judulDue).toMatch(/^Due (Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu), \d{1,2} (Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) 20\d\d \(WIB\)$/);

      // detail: opsi prioritas, tombol Ubah, (diubah), riwayat prioritas & tooltip waktu
      await page.goto(`/t/${ubahPrio.id}`);
      await expect(page.locator('select[aria-label=Prioritas] option')).toHaveText(['— tanpa —', 'Mendesak', 'Tinggi', 'Normal', 'Rendah']);
      await expect(page.locator('[data-uji=desk-edit]')).toHaveText('Ubah');
      await expect(page.locator(`#c-${k.id}`)).toContainText('(diubah)');
      await expect(page.locator(`#c-${k.id} .komentar-aksi`).getByRole('button', { name: 'Ubah', exact: true })).toBeVisible();
      const temuan = {};
      const cek = async (nama) => { const x = await sisaInggris(page); if (x.length) temuan[nama] = x; };
      await cek('detail komentar');
      await page.locator('[data-uji=tab-riwayat]').click();
      await expect(page.locator('[data-uji=daftar-riwayat] li[data-jenis=prioritas]')).toContainText('mengubah prioritas: Mendesak → Tinggi');
      const judulWaktu = await page.locator('[data-uji=daftar-riwayat] .waktu span[title]').first().getAttribute('title');
      expect(judulWaktu).toMatch(/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu), \d{1,2} \w+ 20\d\d pukul \d\d\.\d\d\.\d\d WIB$/);
      await cek('detail riwayat');
      await foto(page, `poles-2-riwayat-${vp.nama}`);

      for (const p of ['/saya', '/jelajah', `/l/${listId}`, `/l/${listId}?v=board`, '/cari?q=uji', '/notif', '/sampah',
        '/admin?tab=anggota', '/admin?tab=struktur', '/admin?tab=libur', '/admin?tab=token', '/admin?tab=mode', '/admin?tab=sinkron']) {
        await page.goto(p);
        await page.waitForLoadState('networkidle');
        await cek(p);
      }
      // istilah admin: tipe status & peran
      await page.goto('/admin?tab=status');
      await page.locator('[data-uji=status-pilih-list]').selectOption(listId);
      await expect(page.locator('select[aria-label="Tipe status"]').first().locator('option')).toHaveText(['Awal (open)', 'Proses (custom)', 'Selesai (done)', 'Ditutup (closed)']);
      await cek('/admin?tab=status (editor)');
      await page.goto('/admin?tab=anggota');
      await expect(page.locator('[data-anggota="citra lestari"] .chip').first()).toHaveText('anggota');
      await page.locator('[data-uji=tambah-anggota]').click();
      await expect(page.getByRole('dialog').locator('select[name=role] option')).toHaveText(['anggota', 'owner (admin penuh)', 'bot (token agent)']);
      await cek('dialog anggota');
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
      await page.locator('#tombol-menu').click();
      await cek('menu');
      expect(temuan).toEqual({});
    });

    // ---------------------------------------------------------------- 4
    test('4. Admin › Sinkron: ringkasan hitungan = tabel berbahasa Indonesia', async ({ page }) => {
      await page.route('**/rest/v1/rpc/web_admin_sinkron', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SINKRON_SINTETIS) }));
      await masuk(page, AKUN.owner.email, undefined, '/admin?tab=sinkron');
      const run = page.locator('[data-run="9901"]');
      await expect(run.locator('details.run-sinkron')).toHaveAttribute('open', '');
      const ringkas = run.locator('[data-uji=sinkron-ringkasan]');
      await expect(ringkas.locator('tbody tr')).toHaveText([/Jenis muat\s*sinkron \(perbarui data\)/, /Cakupan\s*semua list/, /List\s*9/, /Tugas\s*143/,
        /Komentar\s*46/, /Anggota\s*6/, /Anggota nonaktif\s*1/, /Durasi\s*5 detik/]);
      const tulis = run.locator('[data-uji=sinkron-tulis]');
      await expect(tulis.locator('thead th')).toHaveText(['Data', 'Baru', 'Diubah', 'Tetap', 'Gagal', 'Lainnya']);
      await expect(tulis.locator('tbody tr').filter({ hasText: 'Tugas' })).toHaveText(/Tugas\s*2\s*12\s*131\s*0\s*—/);
      await expect(tulis.locator('tbody tr').filter({ hasText: 'Arsip data mentah' })).toHaveText(/20\s*277/);
      await expect(tulis.locator('tbody tr').filter({ hasText: 'Status list' })).toContainText('Dihapus 1');
      await expect(tulis.locator('tbody tr').filter({ hasText: 'Anggota space privat' })).toContainText('Ditambah 2 · Dibuang 1');
      await expect(tulis.locator('tbody tr').filter({ hasText: 'Komentar' }).locator('td.buruk')).toHaveText('1');
      await expect(run.locator('[data-uji=sinkron-lampiran] tbody tr')).toHaveText([/Tersalin\s*3/, /Gagal\s*1/, /Dilewati\s*0/, /Sudah ada\s*5/, /Hanya tautan\s*1/]);
      await expect(run.locator('[data-uji=sinkron-hilang] tbody tr')).toHaveText([/Tugas\s*1/, /Komentar\s*0/]);
      await expect(run.locator('[data-uji=sinkron-clickup]')).toContainText('Kena batas (HTTP 429)');
      await expect(run.locator('[data-uji=sinkron-clickup]')).toContainText('2,9 detik');
      await expect(run.locator('[data-uji=sinkron-space] tbody tr')).toHaveText(/901822000002\s*1\s*4\s*ok/);
      await expect(run.locator('[data-uji=sinkron-galat]')).toContainText('tugas 86b2f0002 · HTTP 404: lampiran');
      await expect(run.locator('[data-uji=sinkron-selisih] tbody tr')).toHaveText(/901822000101\s*Tugas selesai\s*2\s*3/);
      await expect(run.locator('summary .chip').filter({ hasText: 'selisih' })).toHaveText('1 selisih');
      // teks terlihat: tanpa [object Object] / kunci mentah
      const teks = await run.evaluate((el) => el.innerText);
      expect(teks).not.toMatch(/\[object Object\]|inserted|unchanged|tautan_saja|sudah_ada|sync_raw|list_statuses|space_anggota|tunggu_ms|r429\b|durasi_detik/);
      await foto(page, `poles-4-sinkron-${vp.nama}`);

      // run lama bentuk seed: terlipat; dibuka → tabel entitas dari kunci level atas + teks "dilewati mode uji"
      const lama = page.locator('[data-run="9900"]');
      await expect(lama.locator('[data-uji=sinkron-tulis]')).toBeHidden();
      const ringkasLama = lama.locator('details.run-sinkron > summary');
      expect((await ringkasLama.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await ringkasLama.click();
      await expect(lama.locator('[data-uji=sinkron-tulis] tbody tr')).toHaveText(/Tugas\s*20\s*0\s*0/);
      await expect(lama).toContainText('dilewati mode uji');
      expect(await lama.evaluate((el) => el.innerText)).not.toMatch(/\[object Object\]|inserted|unchanged/);
      // rincian teknis JSON tetap tersedia (summary ≥ 44px)
      const rincian = run.locator('details.lipat-sentuh > summary');
      await expect(rincian).toHaveText('Rincian teknis (JSON)');
      expect((await rincian.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await rincian.click();
      await expect(run.locator('pre.json')).toContainText('"tautan_saja": 1');
    });

    test('4b. Admin › Sinkron dengan data DB lokal: tanpa [object Object]', async ({ page }) => {
      await masuk(page, AKUN.owner.email, undefined, '/admin?tab=sinkron');
      const daftar = page.locator('[data-uji=daftar-sinkron]');
      await expect(daftar).toBeVisible();
      await expect(daftar.locator('details.run-sinkron[open] table').first()).toBeVisible();
      expect(await daftar.evaluate((el) => el.innerText)).not.toMatch(/\[object Object\]|inserted|unchanged|tautan_saja/);
    });

    // ---------------------------------------------------------------- 5
    test('5. dialog Tugas baru: tombol aksi selalu terlihat (juga saat keyboard virtual terbuka)', async ({ page }) => {
      await pasangKeyboardPalsu(page);
      const { listId } = await siapkanPapan();
      await masuk(page, AKUN.owner.email, undefined, `/l/${listId}`);
      await page.locator('[data-uji=buat-tugas]').click();
      const dlg = page.getByRole('dialog', { name: /Tugas baru/ });
      const tombol = dlg.getByRole('button', { name: 'Buat tugas' });
      const tinggi = vp.viewport.height;
      const dalamLayar = async (loc, bawah = tinggi) => {
        const b = await loc.boundingBox();
        return b && b.y >= 0 && b.y + b.height <= bawah + 0.5;
      };
      await expect(tombol).toBeVisible();
      expect(await dalamLayar(tombol)).toBe(true);
      // isi dialog lebih panjang dari layar HP → yang bergulir hanya isinya, kaki tetap
      const isi = dlg.locator('.lembar-isi');
      if (vp.isMobile) expect(await isi.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await isi.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      expect(await dalamLayar(tombol)).toBe(true);
      await isi.evaluate((el) => { el.scrollTop = 0; });

      // keyboard virtual terbuka (viewport visual 480 px): lembar naik, kaki & input fokus tetap di atas keyboard
      const nama = dlg.locator('input[name=nama]');
      await nama.focus();
      await page.evaluate(() => window.__keyboard(480));
      await expect.poll(() => dalamLayar(tombol, 480)).toBe(true);
      expect(await dalamLayar(nama, 480)).toBe(true);
      expect(await dlg.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      await foto(page, `poles-5-dialog-keyboard-${vp.nama}`);
      // fokus pindah ke field bawah (Due) saat keyboard masih terbuka → tetap terlihat
      const due = dlg.locator('input[name=due]');
      await due.focus();
      await page.evaluate(() => window.__keyboard(470));
      await expect.poll(() => dalamLayar(due, 470)).toBe(true);
      expect(await dalamLayar(tombol, 470)).toBe(true);
      // keyboard tertutup → kembali normal
      await page.evaluate(() => window.__keyboard(null));
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('papan-ketik'))).toBe(false);
      expect(await dalamLayar(tombol)).toBe(true);

      // Chrome Android "resizes-content": layout viewport ikut mengecil
      await page.setViewportSize({ width: vp.viewport.width, height: 420 });
      await expect.poll(() => dalamLayar(tombol, 420)).toBe(true);
      await page.setViewportSize(vp.viewport);

      // tombol berfungsi
      await nama.fill(`${AWALAN} ${RUN} dialog kaki ${vp.nama}`);
      await tombol.click();
      await expect(page).toHaveURL(/\/t\/[A-Za-z0-9_-]+$/);
      catatTugas(page.url().split('/t/')[1]);
    });

    // ---------------------------------------------------------------- 6
    test('6. target sentuh ≥ 44px: remah list induk, tautan Induk, summary, dialog', async ({ page }) => {
      const { listId } = await siapkanPapan();
      const induk = await buatTugas(listId, { name: 'induk sentuh', assignees: [AKUN.owner.id] });
      const anak = await buatTugas(listId, { name: 'anak sentuh', parent_id: induk.id, assignees: [AKUN.owner.id] });
      await masuk(page, AKUN.owner.email, undefined, `/t/${anak.id}`);
      const temuan = {};
      const cek = async (nama) => { const k = await sentuhKecil(page); if (k.length) temuan[nama] = k; };
      // remah list induk & tautan Induk
      const remah = page.locator('.remah a');
      await expect(remah).toHaveText(`${AWALAN} Papan`);
      expect((await remah.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const tautanInduk = page.locator('.field a.tautan-sentuh').filter({ hasText: 'induk sentuh' });
      expect((await tautanInduk.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await cek(`/t/${anak.id}`);
      // ikon kecil: tombol × pada berkas yang akan dilampirkan ke komentar
      await page.locator('form.penyusun[data-penyusun=baru] input[type=file]').setInputFiles({ name: 'kecil.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
      const buang = page.getByRole('button', { name: 'Buang kecil.png' });
      await expect(buang).toBeVisible();
      await cek(`/t/${anak.id} + berkas komentar`);
      for (const p of [`/l/${listId}`, `/l/${listId}?v=board`, `/t/${induk.id}`, '/saya', '/jelajah', '/cari?q=uji', '/notif',
        '/admin?tab=anggota', '/admin?tab=status', '/admin?tab=struktur', '/admin?tab=libur', '/admin?tab=token', '/admin?tab=mode', '/sampah']) {
        await page.goto(p);
        await page.waitForLoadState('networkidle');
        await cek(p);
      }
      // Sinkron: summary run & "Rincian teknis (JSON)" (dulu 19 px)
      await page.route('**/rest/v1/rpc/web_admin_sinkron', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SINKRON_SINTETIS) }));
      await page.goto('/admin?tab=sinkron');
      await expect(page.locator('[data-run="9901"]')).toBeVisible();
      await cek('/admin?tab=sinkron');
      // dialog: tugas baru, menu
      await page.goto(`/l/${listId}`);
      await page.locator('[data-uji=buat-tugas]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await cek('dialog tugas baru');
      await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
      await page.locator('#tombol-menu').click();
      await cek('menu');
      await foto(page, `poles-6-menu-${vp.nama}`);
      expect(temuan).toEqual({});
    });

    // ---------------------------------------------------------------- 3
    test('3. lonceng: buka notifikasi → angka langsung turun; Tandai semua dibaca → 0', async ({ page }) => {
      const { listId } = await siapkanPapan();
      // notifikasi seed/milik tes lain yang belum dibaca dipulihkan di akhir (DB lokal dipakai bersama)
      const belumAwal = sqlLokal(`select coalesce(string_agg(id::text, ','), '') from public.notifications where member_id = ${AKUN.dodi.id} and read_at is null`);
      try {
        const t1 = await buatTugas(listId, { name: `lonceng satu ${vp.nama}`, assignees: [AKUN.dodi.id] });
        await buatTugas(listId, { name: `lonceng dua ${vp.nama}`, assignees: [AKUN.dodi.id] });
        const belum = (await rpcSebagai(AKUN.dodi.email, 'web_notif', { p_limit: 1 })).belum;
        expect(belum).toBeGreaterThanOrEqual(2);
        const dbBelum = () => Number(sqlLokal(`select count(*) from public.notifications where member_id = ${AKUN.dodi.id} and read_at is null`));
        await masuk(page, AKUN.dodi.email);
        const angka = page.locator('#lonceng-angka');
        await expect(angka).toHaveText(String(belum));
        await page.locator('#lonceng').click();
        await expect(page).toHaveURL(/\/notif$/);
        const n = page.locator('[data-uji=daftar-notif] li.belum[data-jenis=assign]').filter({ hasText: t1.name });
        await n.locator('a').click();
        await expect(page).toHaveURL(new RegExp(`/t/${t1.id}$`));
        // tanpa menunggu polling 60 dtk
        await expect(angka).toHaveText(String(belum - 1), { timeout: 3000 });
        await expect(page.locator('#lonceng')).toHaveAttribute('aria-label', `Notifikasi, ${belum - 1} belum dibaca`);
        await expect.poll(dbBelum).toBe(belum - 1);
        await page.waitForTimeout(600);                                    // sesudah disamakan dengan server: tetap
        await expect(angka).toHaveText(String(belum - 1));
        await foto(page, `poles-3-lonceng-buka-${vp.nama}`);

        await page.locator('#lonceng').click();
        await expect(page.locator('[data-uji=daftar-notif] li.belum').filter({ hasText: t1.name })).toHaveCount(0);
        await page.getByRole('button', { name: 'Tandai semua dibaca' }).click();
        await expect(angka).toBeHidden({ timeout: 3000 });
        await expect(page.locator('#lonceng')).toHaveAttribute('aria-label', 'Notifikasi');
        await expect.poll(dbBelum).toBe(0);
        await page.locator('a[data-nav=jelajah]').click();                // pindah layar: tetap 0
        await expect(page).toHaveURL(/\/jelajah$/);
        await expect(angka).toBeHidden();
      } finally {
        if (belumAwal) sqlUbahLokal(`update public.notifications set read_at = null where id in (${belumAwal})`);
      }
    });

    // ---------------------------------------------------------------- 8a
    test('8a. tag & checklist kartu impor: chip hanya-baca di detail; kartu tanpa tag tidak menampilkannya', async ({ page }) => {
      const { listId } = await siapkanPapan();
      const t = await buatTugas(listId, { name: 'tag checklist', assignees: [AKUN.owner.id] });
      const polos = await buatTugas(listId, { name: 'tanpa tag', assignees: [AKUN.owner.id] });
      // bentuk ClickUp persis (disimpan importer verbatim di tasks.extra, perbaikan P1)
      const extra = {
        tags: [{ name: 'prioritas', tag_bg: '#e50000', tag_fg: '#ffffff', creator: 88200001 }, { name: 'iklan', tag_bg: '#1b5e20', tag_fg: '#ffffff', creator: 88200001 }],
        checklists: [{ id: 'c-uji-1', task_id: t.id, name: 'Langkah kerja', orderindex: 0, resolved: 1, unresolved: 2, items: [
          { id: 'i-2', name: 'Kirim ke pemilik', orderindex: 1, assignee: null, group_assignee: null, resolved: false, parent: null, date_created: '1790000000000',
            children: [{ id: 'i-3', name: 'Cek ulang angka', orderindex: 0, assignee: null, resolved: false, parent: 'i-2', children: [] }] },
          { id: 'i-1', name: 'Siapkan draf', orderindex: 0, assignee: null, group_assignee: null, resolved: true, parent: null, date_created: '1790000000000', children: [] },
        ] }],
      };
      sqlUbahLokal(`update public.tasks set extra = '${JSON.stringify(extra)}'::jsonb where id = '${t.id}'`);
      await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
      const tag = page.locator('[data-uji=tag-tugas] .chip.tag');
      await expect(tag).toHaveText(['prioritas', 'iklan']);
      const cl = page.locator('[data-uji=checklist]');
      await expect(cl.locator('.checklist-kepala')).toHaveText(/Langkah kerja\s*1\/3/);
      await expect(cl.locator('.chip.butir .teks-butir')).toHaveText(['Siapkan draf', 'Kirim ke pemilik', 'Cek ulang angka']);
      await expect(cl.locator('.chip.butir.beres')).toHaveText(/Siapkan draf/);
      await expect(cl.locator('input, button, select, textarea, a')).toHaveCount(0);                       // hanya-baca
      await expect(page.locator('[data-uji=tag-tugas] button, [data-uji=tag-tugas] input')).toHaveCount(0);
      await cl.scrollIntoViewIfNeeded();
      await foto(page, `poles-8-tag-checklist-${vp.nama}`);
      await page.goto(`/t/${polos.id}`);
      await expect(page.locator('[data-uji=judul-tugas]')).toContainText('tanpa tag');
      await expect(page.locator('[data-uji=tag-tugas], [data-uji=checklist]')).toHaveCount(0);
    });
  });
}

// ================================================================== 7 board
test.describe('7. board desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('kolom membagi lebar layar (tidak terpotong), tanpa snap; seret mouse ke kolom ketiga', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'papan lebar', due: tanggalWib(2), assignees: [AKUN.dodi.id] });
    await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
    await expect(page.locator(`.kartu-papan[data-id="${t.id}"]`)).toBeVisible();
    const u = await page.evaluate(() => {
      const papan = document.querySelector('.papan');
      const kolom = [...document.querySelectorAll('.kolom')].map((k) => k.getBoundingClientRect());
      return { lebarPapan: papan.getBoundingClientRect().width, scrollW: papan.scrollWidth, clientW: papan.clientWidth,
        snap: getComputedStyle(papan).scrollSnapType, kolom: kolom.map((r) => ({ kiri: r.left, kanan: r.right, lebar: r.width })),
        isiLebar: document.getElementById('isi').classList.contains('lebar'), docScroll: document.documentElement.scrollWidth };
    });
    expect(u.isiLebar).toBe(true);
    expect(u.lebarPapan).toBeGreaterThan(1200);                    // dulu 760 px (kolom ke-3 terpotong)
    expect(u.scrollW).toBeLessThanOrEqual(u.clientW + 1);          // tidak perlu digeser
    expect(u.kolom.length).toBeGreaterThanOrEqual(3);
    for (const k of u.kolom) {
      expect(k.kiri).toBeGreaterThanOrEqual(0);
      expect(k.kanan).toBeLessThanOrEqual(1280);
      expect(k.lebar).toBeGreaterThanOrEqual(260);
    }
    expect(u.snap).toMatch(/none/);
    expect(u.docScroll).toBeLessThanOrEqual(1280);
    await expect(page.locator('.mode-board .petunjuk')).toHaveText('Seret kartu ke kolom lain untuk mengubah status.');
    await foto(page, 'poles-7-board-desktop1280');

    await seretMouse(page, page.locator(`.kartu-papan[data-id="${t.id}"]`), page.locator('.kolom-isi[data-status="complete"]'));
    await expect(page.locator('.toast').last()).toContainText('Status: complete');
    expect((await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id })).task.status).toBe('complete');
    // daftar (bukan papan) tetap lebar baca 760 px
    await page.locator('[data-uji=tab-daftar]').click();
    await expect(page).toHaveURL(new RegExp(`/l/${listId}$`));
    expect(await page.evaluate(() => document.getElementById('isi').getBoundingClientRect().width)).toBeLessThanOrEqual(760);
  });
});

test.describe('7. board HP 390×844 (tidak regresi)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('papan tetap geser horizontal + snap; tekan-tahan & seret ke tepi → auto-scroll ke kolom tersembunyi', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'papan hp', assignees: [AKUN.dodi.id] });
    await masuk(page, AKUN.dodi.email, undefined, `/l/${listId}?v=board`);
    const kartu = page.locator(`.kartu-papan[data-id="${t.id}"]`);
    await expect(kartu).toBeVisible();
    await page.waitForLoadState('networkidle');
    const u = await page.evaluate(() => {
      const papan = document.querySelector('.papan');
      return { scrollW: papan.scrollWidth, clientW: papan.clientWidth, snap: getComputedStyle(papan).scrollSnapType,
        lebarKolom: document.querySelector('.kolom').getBoundingClientRect().width, docScroll: document.documentElement.scrollWidth,
        kolomBawah: document.querySelector('.kolom').getBoundingClientRect().bottom, navAtas: document.querySelector('#nav-bawah').getBoundingClientRect().top };
    });
    expect(u.kolomBawah).toBeLessThanOrEqual(u.navAtas);            // remah 44 px tidak mendorong kolom ke bawah nav
    expect(u.scrollW).toBeGreaterThan(u.clientW + 200);
    expect(u.snap).toContain('mandatory');
    expect(u.lebarKolom).toBeLessThanOrEqual(0.84 * 390 + 1);
    expect(u.docScroll).toBeLessThanOrEqual(390);
    await expect(page.locator('.mode-board .petunjuk')).toContainText('Tekan-tahan');
    const kolomSelesai = page.locator('.kolom-isi[data-status="complete"]');
    expect((await kolomSelesai.boundingBox()).x).toBeGreaterThan(390);
    const cdp = await page.context().newCDPSession(page);
    const sentuh = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await kartu.scrollIntoViewIfNeeded();
    const a = await kartu.boundingBox();
    const x0 = a.x + 40;
    const y0 = a.y + 15;
    await sentuh('touchStart', x0, y0);
    await page.waitForTimeout(450);
    for (let i = 1; i <= 10; i++) await sentuh('touchMove', x0 + ((382 - x0) * i) / 10, y0 + i);
    let gulir = 0;
    for (let i = 0; i < 40 && gulir < 500; i++) {
      await page.waitForTimeout(100);
      await sentuh('touchMove', 382, y0 + 10 + (i % 2));
      gulir = await page.evaluate(() => document.querySelector('.papan').scrollLeft);
    }
    expect(gulir).toBeGreaterThan(500);
    const b = await kolomSelesai.boundingBox();
    for (let i = 1; i <= 4; i++) await sentuh('touchMove', 382 - ((382 - (b.x + b.width / 2)) * i) / 4, b.y + 60);
    await page.waitForTimeout(150);
    await sentuh('touchEnd');
    await expect(page.locator('.toast').last()).toContainText('Status: complete');
    expect((await rpcSebagai(AKUN.dodi.email, 'web_detail', { p_task: t.id })).task.status).toBe('complete');
    await foto(page, 'poles-7-board-hp390');
  });
});

// ================================================================== 8 perubahan DB terbaru
test.describe('8. perubahan DB terbaru (HP 390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('kartu di list/space diarsip tidak muncul di Tugas Saya; muncul lagi setelah arsip dibuka', async ({ page }) => {
    const { spaceId } = await siapkanPapan();
    const listArsip = await listUji(`${AWALAN} Papan Arsip`, spaceId);
    const t = await buatTugas(listArsip, { name: 'kartu wadah arsip', due: hariKerjaKe(1), assignees: [AKUN.dodi.id] });
    const baris = page.locator(`.baris-tugas[data-id="${t.id}"]`);
    const simpan = (p) => rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p });
    try {
      await masuk(page, AKUN.dodi.email, undefined, '/saya');
      await expect(baris).toBeVisible();
      await simpan({ jenis: 'list', id: listArsip, archived: true });
      await page.reload();
      await expect(page.locator('p.redup.kecil').filter({ hasText: 'kartu terbuka' })).toBeVisible();
      await expect(baris).toHaveCount(0);
      await foto(page, 'poles-8-saya-list-arsip-hp390');
      await simpan({ jenis: 'list', id: listArsip, archived: false });
      await simpan({ jenis: 'space', id: spaceId, archived: true });
      await page.reload();
      await expect(page.locator('p.redup.kecil').filter({ hasText: 'kartu terbuka' })).toBeVisible();
      await expect(baris).toHaveCount(0);
      await simpan({ jenis: 'space', id: spaceId, archived: false });
      await page.reload();
      await expect(baris).toBeVisible();
    } finally {
      await simpan({ jenis: 'space', id: spaceId, archived: false }).catch(() => {});
      await simpan({ jenis: 'list', id: listArsip, archived: false }).catch(() => {});
    }
  });

  test('Cari: tempel tautan list aplikasi / URL tampilan ClickUp → langsung membuka list itu', async ({ page }) => {
    const { listId } = await siapkanPapan();
    await masuk(page, AKUN.owner.email, undefined, '/cari');
    const q = page.locator('input[name=q]');
    await q.fill(`http://127.0.0.1:4173/l/${listId}`);
    await q.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/l/${listId}$`));
    await expect(page.locator('#judul')).toHaveText(`${AWALAN} Papan`);
    await page.goto('/cari');
    await page.locator('input[name=q]').fill('https://app.clickup.com/90180000/v/l/6-1100340000900101-1');
    await page.locator('input[name=q]').press('Enter');
    await expect(page).toHaveURL(/\/l\/1100340000900101$/);
    await expect(page.locator('#judul')).toHaveText('Fase Uji 1');
  });

  test('lampiran CSV dari Excel Windows (application/vnd.ms-excel) bisa diunggah', async ({ page }) => {
    const { listId } = await siapkanPapan();
    const t = await buatTugas(listId, { name: 'csv windows', assignees: [AKUN.owner.id] });
    await masuk(page, AKUN.owner.email, undefined, `/t/${t.id}`);
    const accept = await page.locator('[data-uji=input-lampiran]').getAttribute('accept');
    for (const e of ['.csv', '.xls', '.tsv', '.doc', '.pptx', '.heic']) expect(accept.split(',')).toContain(e);
    await page.locator('[data-uji=input-lampiran]').setInputFiles({ name: 'ekspor-windows.csv', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('kode;jumlah\r\nY7;3\r\n') });
    await expect(page.locator('.toast.sukses').last()).toContainText('1 lampiran terunggah');
    await expect(page.locator('li.lampiran .judul')).toHaveText('ekspor-windows.csv');
    expect(objekLampiran(t.id)).toHaveLength(1);
  });
});
