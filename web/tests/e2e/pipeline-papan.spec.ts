// Papan Pipeline (kategori PRIBADI): tombol Daftar↔Papan, tambah / ganti nama / hapus kategori, seret lead antar
// kolom (web_pipeline_kategori_pindah), chip kategori di tampilan Daftar, dan papan pengguna lain tetap kosong.
// Seed sintetis tidak punya data Pipeline → tiap tes menyiapkan akses + 1 lead lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Papan Kategori";
let lead = "";
let pelanggan = "";

function acak() {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

function bersihkan() {
  sqlLokal(
    `delete from public.pipeline_kategori where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id});` +
      ` delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.pipeline_akses where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id});`,
  );
}

test.beforeEach(() => {
  bersihkan();
  lead = `ld${acak()}`;
  pelanggan = `pl${acak()}`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran) values (${AKUN.citra.id}, 'rep'), (${AKUN.dodi.id}, 'baca');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pelanggan}', '${PELANGGAN}', 'Surabaya');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, dibuat_oleh) values ('${lead}', '${pelanggan}', 'Google Ads', ${AKUN.citra.id}, ${AKUN.citra.id});` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${lead}', 'Roda', 4);`,
  );
});

test.afterEach(() => bersihkan());

const kolomTanpa = (page: Page) => page.locator('[data-uji="kolom-kategori"][data-kolom="tanpa"]');
const kolomBernama = (page: Page, nama: string) =>
  page.locator('[data-uji="kolom-kategori"]').filter({ has: page.locator('[data-uji="nama-kategori"]', { hasText: new RegExp(`^${nama}$`) }) });

/** Batasi ke pelanggan tes (DB e2e dipakai bersama: lead lain bisa mendorong lead uji keluar dari 30 kartu pertama). */
async function hanyaPelangganUji(page: Page) {
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.locator('[data-uji="kartu-lead"]')).toHaveCount(1);
}

async function tambahKategori(page: Page, nama: string) {
  await page.getByTestId("tambah-kategori").click();
  await page.getByTestId("input-kategori").fill(nama);
  await page.getByTestId("simpan-kategori").click();
  await expect(kolomBernama(page, nama)).toBeVisible();
}

async function seret(page: Page, dari: string, ke: ReturnType<typeof kolomBernama>) {
  const kartu = page.locator(`[data-uji="papan-lead"] [data-id="${dari}"]`);
  await expect(kartu).toBeVisible();
  await ke.scrollIntoViewIfNeeded();
  const a = await kartu.boundingBox();
  const b = await ke.boundingBox();
  if (!a || !b) throw new Error("boundingBox kosong");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 }); // > jarak aktivasi (5px)
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 90), { steps: 14 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 90), { steps: 4 });
  await page.mouse.up();
}

test("tombol Papan: lead mulai di 'Tanpa kategori'; kategori bisa ditambah & diganti nama", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByTestId("tab-papan-lead").click();
  await expect(page).toHaveURL(/\/pipeline\?v=papan/);
  await expect(page.getByTestId("papan-lead")).toBeVisible();
  await hanyaPelangganUji(page);
  await expect(kolomTanpa(page).locator(`[data-id="${lead}"]`)).toBeVisible();

  await tambahKategori(page, "Prioritas");
  // kolom di luar layar tidak boleh melebarkan halaman (HP: tata letak menyusut / menu ⋯ merusak tampilan)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  // nama kembar (beda huruf besar/kecil) ditolak dengan pesan
  await page.getByTestId("tambah-kategori").click();
  await page.getByTestId("input-kategori").fill("prioritas");
  await page.getByTestId("simpan-kategori").click();
  await expect(page.getByText('Kategori "prioritas" sudah ada')).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();

  // ganti nama lewat menu ⋯
  await kolomBernama(page, "Prioritas").getByTestId("menu-kategori").click();
  await page.getByTestId("aksi-ganti-nama").click();
  const input = page.getByTestId("input-kategori");
  await expect(input).toBeFocused();
  await input.fill("Nunggu PO");
  await input.press("Enter");
  await expect(kolomBernama(page, "Nunggu PO")).toBeVisible();
  await expect(kolomBernama(page, "Prioritas")).toHaveCount(0);
  expect(sqlLokal(`select nama from public.pipeline_kategori where member_id = ${AKUN.citra.id}`)).toBe("Nunggu PO");

  // tampilan Daftar tetap seperti semula
  await page.getByTestId("tab-daftar-lead").click();
  await expect(page).toHaveURL(/\/pipeline$/);
  await expect(page.getByTestId("baris-lead").filter({ hasText: PELANGGAN })).toBeVisible();
});

test("seret lead ke kategori → tersimpan pribadi, tampil di Daftar, hapus kategori mengembalikannya", async ({ page }) => {
  test.skip(diHp(page), "seret diuji di desktop (mouse); HP memakai tekan-tahan");
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline?v=papan");
  await hanyaPelangganUji(page);
  await expect(kolomTanpa(page).locator(`[data-id="${lead}"]`)).toBeVisible();
  await tambahKategori(page, "Hot");

  await seret(page, lead, kolomBernama(page, "Hot"));
  await expect(kolomBernama(page, "Hot").locator(`[data-id="${lead}"]`)).toBeVisible();
  await expect
    .poll(() => sqlLokal(`select k.nama from public.pipeline_kategori_lead kl join public.pipeline_kategori k on k.id = kl.kategori_id where kl.lead_id = '${lead}'`), {
      timeout: 15_000,
    })
    .toBe("Hot");
  // tahap lead tidak berubah
  expect(sqlLokal(`select tahap from public.lead where id = '${lead}'`)).toBe("BARU");

  // muat ulang: posisi bertahan
  await page.reload();
  await hanyaPelangganUji(page);
  await expect(kolomBernama(page, "Hot").locator(`[data-id="${lead}"]`)).toBeVisible();

  // Daftar menampilkan chip kategori
  await page.getByTestId("tab-daftar-lead").click();
  await expect(page.getByTestId("baris-lead").filter({ hasText: PELANGGAN }).getByTestId("chip-kategori")).toHaveText("Hot");

  // hapus kategori → lead kembali ke Tanpa kategori
  await page.getByTestId("tab-papan-lead").click();
  await hanyaPelangganUji(page);
  await kolomBernama(page, "Hot").getByTestId("menu-kategori").click();
  await page.getByTestId("aksi-hapus-kategori").click();
  await page.getByTestId("konfirmasi-ya").click();
  await expect(kolomBernama(page, "Hot")).toHaveCount(0);
  await expect(kolomTanpa(page).locator(`[data-id="${lead}"]`)).toBeVisible();
});

test("kategori pribadi: pengguna lain tidak melihat kategori citra", async ({ page }) => {
  // citra punya kategori + penempatan (lewat fungsi yang sama dengan web)
  const uid = sqlLokal(`select auth_user_id from public.members where id = ${AKUN.citra.id}`);
  sqlLokal(
    `begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated;` +
      ` select public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"Rahasia Citra"}');` +
      ` select public.web_pipeline_kategori_pindah(jsonb_build_object('lead_id', '${lead}', 'kategori_id', (select id from public.pipeline_kategori limit 1))); commit;`,
  );
  await masuk(page, AKUN.dodi.email);
  await page.goto("/pipeline?v=papan");
  await hanyaPelangganUji(page);
  await expect(kolomTanpa(page).locator(`[data-id="${lead}"]`)).toBeVisible();
  await expect(page.getByText("Rahasia Citra")).toHaveCount(0);
  await expect(page.locator('[data-uji="kolom-kategori"]')).toHaveCount(1);
});
