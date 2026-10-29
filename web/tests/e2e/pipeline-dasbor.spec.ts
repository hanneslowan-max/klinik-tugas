// Dasbor Pipeline Tahap 1 (29 Okt 2026): admin melihat dasbor penuh (skor, kesehatan per sales, corong, Pallet Mesh) dan
// angka bagian 2 membuka daftar lead yang dihitung; sales (rep) hanya "milik saya" tanpa angka sales lain (selain progres
// target tim); peran baca melihat dasbor penuh tanpa tombol tulis.
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses + lead lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Dasbor";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
// a = BARU citra (PM 5, FU hari ini) · b = PENAWARAN citra (FU telat) · c = BARU eka (FU hari ini) · d = BARU tanpa
// pemilik (PM 2) · e = ORDER citra Rp7 jt · f = ORDER eka Rp9 jt (SP hari ini)
let L: Record<"a" | "b" | "c" | "d" | "e" | "f", string>;

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.pipeline_akses where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id}, ${AKUN.eka.id});`,
  );
}

test.beforeEach(() => {
  bersihkan();
  const pl = `pl${acak()}`;
  L = { a: `ld${acak()}`, b: `ld${acak()}`, c: `ld${acak()}`, d: `ld${acak()}`, e: `ld${acak()}`, f: `ld${acak()}` };
  const sp = (k: string) => `${10000 + Math.floor(Math.random() * 80000)}/${k}/X/2026`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null),` +
      ` (${AKUN.eka.id}, 'rep', 'MCE');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Malang');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${L.a}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'BARU', null, null, null),` +
      ` ('${L.b}', '${pl}', 'Telepon', ${AKUN.citra.id}, 'PENAWARAN', null, null, null),` +
      ` ('${L.c}', '${pl}', 'Referral', ${AKUN.eka.id}, 'BARU', null, null, null),` +
      ` ('${L.d}', '${pl}', 'WA langsung', null, 'BARU', null, null, null),` +
      ` ('${L.e}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${sp("RSG")}', public.hari_ini_wib(), 7000000),` +
      ` ('${L.f}', '${pl}', 'Telepon', ${AKUN.eka.id}, 'ORDER', '${sp("MCE")}', public.hari_ini_wib(), 9000000);` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${L.a}', 'Pallet Mesh', 5), ('${L.b}', 'Roda', 2),` +
      ` ('${L.c}', 'Roda', 1), ('${L.d}', 'Pallet Mesh', 2), ('${L.e}', 'Roda', 4), ('${L.f}', 'Roda', 6);` +
      ` update public.lead set fu_berikutnya = public.hari_ini_wib() where id in ('${L.a}', '${L.c}');` +
      ` update public.lead set fu_berikutnya = public.hari_ini_wib() - 3 where id = '${L.b}';` +
      ` update public.lead set fu_berikutnya = null where id = '${L.d}';`,
  );
});

test.afterEach(() => bersihkan());

const kode = (id: string) => sqlLokal(`select kode from public.lead where id = '${id}'`);
const tidakMelebar = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function bukaDasbor(page: Page) {
  await page.goto("/pipeline");
  if (diHp(page)) {
    await page.getByTestId("menu-pipeline").click();
    await page.getByTestId("menu-tautan-dasbor").click();
  } else {
    await page.getByTestId("tautan-dasbor").click();
  }
  await expect(page).toHaveURL(/\/pipeline\/dasbor$/);
}

test("admin: dasbor penuh; angka kesehatan membuka daftar lead yang dihitung", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await bukaDasbor(page);
  await expect(page.getByTestId("dasbor-admin")).toBeVisible();
  await expect(page.getByTestId("skor-omzet")).toHaveText("Rp16 jt");
  await expect(page.getByTestId("skor-order")).toHaveText("2");
  await expect(page.getByTestId("skor-sales")).toHaveCount(2);
  const citra = page.locator(`[data-uji="baris-kesehatan"][data-pemilik="${AKUN.citra.id}"]`);
  await expect(citra.getByTestId("kes-terbuka90")).toHaveText("2");
  await expect(citra.getByTestId("kes-fu_hari_ini")).toHaveText("1");
  await expect(citra.getByTestId("kes-fu_telat")).toHaveText("1");
  await expect(page.locator(`[data-uji="baris-kesehatan"][data-pemilik="${AKUN.eka.id}"]`)).toBeVisible();
  await expect(page.locator('[data-uji="baris-kesehatan"][data-pemilik="tanpa"]').getByTestId("kes-tanpa_jadwal")).toHaveText("1");
  await expect(page.getByTestId("dasbor-corong")).toBeVisible();
  await expect(page.getByTestId("kotak-siklus")).toContainText("belum bisa dihitung");
  await expect(page.getByTestId("pm-total")).toHaveText("2");
  await expect(page.getByTestId("baris-pm-teratas")).toHaveCount(2);
  await expect(page.getByTestId("pm-win-qty")).toContainText("belum valid");
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);

  // FU telat citra (1) → daftar berisi tepat lead itu
  await citra.getByTestId("kes-fu_telat").click();
  await expect(page).toHaveURL(new RegExp(`/pipeline\\?kes=fu_telat&kp=${AKUN.citra.id}&kb=\\d{4}-\\d{2}$`));
  await expect(page.getByTestId("saringan-dasbor")).toContainText(`FU telat · ${AKUN.citra.username} · 1 lead`);
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.locator(`a[href="/pipeline/${L.b}"]`)).toBeVisible();
  // × → saringan dasbor hilang, daftar kembali utuh
  await page.getByTestId("hapus-saringan-dasbor").click();
  await expect(page.getByTestId("saringan-dasbor")).toHaveCount(0);
  await expect(page).toHaveURL(/\/pipeline$/);
});

test("sales: hanya milik saya + progres tim; angka sales lain tidak terkirim; Catat FU dari dasbor", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline/dasbor");
  await expect(page.getByTestId("dasbor-sales")).toBeVisible();
  await expect(page.getByTestId("dasbor-admin")).toHaveCount(0);
  await expect(page.getByTestId("baris-kesehatan")).toHaveCount(0);
  await expect(page.getByTestId("sales-omzet")).toHaveText("Rp7 jt");
  await expect(page.getByTestId("sales-tim")).toHaveText("5%"); // Rp16 jt dari Rp300 jt (satu-satunya angka tim)
  await expect(page.getByTestId("baris-fu-hari-ini")).toHaveCount(1);
  await expect(page.getByTestId("sales-fu-hari-ini")).toContainText(kode(L.a));
  await expect(page.getByTestId("pm-saya")).toHaveText("1");
  const isi = (await page.locator("main").textContent()) ?? "";
  for (const x of [AKUN.eka.username, kode(L.c), kode(L.f), "Rp9 jt"]) expect(isi).not.toContain(x);
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);

  await page.getByTestId("catat-fu-dasbor").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("link", { name: "Lihat semua" }).click();
  await expect(page.getByTestId("saringan-dasbor")).toContainText("FU hari ini");
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.locator(`a[href="/pipeline/${L.a}"]`)).toBeVisible();

  // pemilik sales lain di URL diabaikan server: tetap lead milik sendiri
  await page.goto(`/pipeline?m=semua&kes=fu_hari_ini&kp=${AKUN.eka.id}`);
  await expect(page.getByTestId("saringan-dasbor")).toContainText("1 lead");
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.locator(`a[href="/pipeline/${L.a}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/pipeline/${L.c}"]`)).toHaveCount(0);
});

test("peran baca: dasbor penuh, tanpa tombol tulis", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto("/pipeline/dasbor");
  await expect(page.getByTestId("dasbor-admin")).toBeVisible();
  await expect(page.getByTestId("skor-omzet")).toHaveText("Rp16 jt");
  await expect(page.getByTestId("catat-fu-dasbor")).toHaveCount(0);
});
