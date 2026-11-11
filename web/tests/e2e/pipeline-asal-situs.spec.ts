// Kartu "Asal lead per situs" (11 Nov 2026, migrasi 20261111150000): admin melihat lead masuk per kelompok bukti sumber
// (situs Hammerindo / Palletmesh dengan rincian organik vs Google Ads, Meta, tanpa kode, belum ada bukti), menyaring
// produk & rentang (bulan dasbor / sejak bukti dicatat), angka lead membuka daftar lead yang dihitung; sales hanya
// melihat lead miliknya. Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses + lead (fiktif) lewat psql lokal.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Asal Situs E2E";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
// r1 web-rh ORDER · r2/r3 ga-rh · o1 ga-oy · m1 meta · t1 tanpa-sinyal ORDER · b1 tanpa bukti (semua PM, masuk hari ini)
// x1 = Roda web-rh (tidak ikut saringan Pallet Mesh). r*, x1 milik citra; sisanya eka.
let L: Record<"r1" | "r2" | "r3" | "o1" | "m1" | "t1" | "b1" | "x1", string>;

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
  L = { r1: "", r2: "", r3: "", o1: "", m1: "", t1: "", b1: "", x1: "" };
  for (const k of Object.keys(L) as (keyof typeof L)[]) L[k] = `ld${acak()}`;
  const sp = (k: string) => `${10000 + Math.floor(Math.random() * 80000)}/${k}/XI/2026`;
  const c = AKUN.citra.id;
  const e = AKUN.eka.id;
  const baris = (id: string, pemilik: number, tahap = "BARU", order = "null, null, null") =>
    `('${id}', '${pl}', 'WA langsung', ${pemilik}, '${tahap}', ${order})`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${c}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null),` +
      ` (${e}, 'rep', 'MCE');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Sidoarjo');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values ` +
      [
        baris(L.r1, c, "ORDER", `'${sp("RSG")}', public.hari_ini_wib(), 2500000`),
        baris(L.r2, c),
        baris(L.r3, c),
        baris(L.o1, e),
        baris(L.m1, e),
        baris(L.t1, e, "ORDER", `'${sp("MCE")}', public.hari_ini_wib(), 4000000`),
        baris(L.b1, e),
        baris(L.x1, c),
      ].join(", ") +
      `; insert into public.lead_item (lead_id, produk, qty) values ` +
      [L.r1, L.r2, L.r3, L.o1, L.m1, L.t1, L.b1].map((id) => `('${id}', 'Pallet Mesh', 10)`).join(", ") +
      `, ('${L.x1}', 'Roda', 4);`,
  );
  const bukti = [
    { lead_id: L.r1, bukti: "web-rh", kode: "WEB-RH" },
    { lead_id: L.r2, bukti: "ga-rh", kode: "GA-RH-7K3F" },
    { lead_id: L.r3, bukti: "ga-rh", kode: "GA-RH-9Q2M" },
    { lead_id: L.o1, bukti: "ga-oy", kode: "GA-OY-4T8P" },
    { lead_id: L.m1, bukti: "meta", kode: "PM-06" },
    { lead_id: L.t1, bukti: "tanpa-sinyal" },
    { lead_id: L.x1, bukti: "web-rh", kode: "WEB-RH" },
  ];
  sqlLokal(`select public.x_pipeline_sumber_bukti_set(${AKUN.owner.id}, '${JSON.stringify({ items: bukti })}')`);
});

test.afterEach(() => bersihkan());

const tidakMelebar = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const baris = (page: Page, uji: string) => page.getByTestId("kartu-asal-situs").getByTestId(uji);
const lead = (page: Page, uji: string) => baris(page, uji).getByTestId("asal-lead");

test("admin: asal lead per situs, saring Pallet Mesh, rincian organik vs Google Ads, angka → daftar lead", async ({ page }, info) => {
  await masuk(page, AKUN.owner.email);
  await page.goto("/pipeline/dasbor");
  const kartu = page.getByTestId("kartu-asal-situs");
  await expect(kartu).toBeVisible();
  // semua produk: Roda web-rh ikut
  await expect(lead(page, "asal-situs_rh")).toHaveText("4");
  await expect(lead(page, "asal-total")).toHaveText("8");

  await kartu.getByTestId("asal-produk").click();
  await page.getByRole("option", { name: "Pallet Mesh", exact: true }).click();
  await expect(lead(page, "asal-situs_rh")).toHaveText("3");
  await expect(lead(page, "asal-situs_rh-organik")).toHaveText("1");
  await expect(lead(page, "asal-situs_rh-google_ads")).toHaveText("2");
  await expect(baris(page, "asal-situs_rh").getByTestId("asal-order")).toHaveText("1");
  await expect(baris(page, "asal-situs_rh").getByTestId("asal-nilai")).toHaveText("Rp2,5 jt");
  await expect(baris(page, "asal-situs_rh")).toContainText("33,3%");
  await expect(lead(page, "asal-situs_oy")).toHaveText("1");
  await expect(lead(page, "asal-situs_oy-google_ads")).toHaveText("1");
  await expect(lead(page, "asal-situs_oy-organik")).toHaveText("0");
  await expect(lead(page, "asal-meta")).toHaveText("1");
  await expect(lead(page, "asal-lain")).toHaveText("0");
  await expect(lead(page, "asal-tanpa_kode")).toHaveText("1");
  await expect(baris(page, "asal-tanpa_kode").getByTestId("asal-nilai")).toHaveText("Rp4 jt");
  await expect(lead(page, "asal-belum")).toHaveText("1");
  await expect(lead(page, "asal-total")).toHaveText("7");
  await expect(kartu).toContainText("Asal situs dibaca dari kode Ref di chat WA 0878 (otomatis sejak 21 Okt 2026)");
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);
  // gambar kartu utuh: di HP kartu lebih tinggi dari layar (gulir di dalam kerangka) → layar ditinggikan sebentar
  const layar = page.viewportSize()!;
  await page.setViewportSize({ width: layar.width, height: 2400 });
  await kartu.screenshot({ path: `tests/e2e/hasil/kartu-asal-situs-${info.project.name}.png` });
  await page.setViewportSize(layar);

  // rentang sejak bukti dicatat: label berubah, angka sama (semua lead masuk hari ini)
  const hariIni = sqlLokal("select to_char(public.hari_ini_wib(), 'YYYY-MM-DD')");
  await kartu.getByTestId("asal-rentang-bukti").click();
  await expect(kartu.getByTestId("asal-rentang-bukti")).toHaveAttribute("aria-pressed", "true");
  await expect(kartu.getByTestId("asal-rentang")).toHaveText(new RegExp(`^21 Okt–${Number(hariIni.slice(8, 10))} `));
  await expect(lead(page, "asal-total")).toHaveText("7");

  // angka Google Ads situs RH → daftar 2 lead itu
  await lead(page, "asal-situs_rh-google_ads").getByRole("link").click();
  await expect(page).toHaveURL(/kes=asal_situs/);
  await expect(page.getByTestId("saringan-dasbor")).toContainText("Asal lead per situs · Situs Hammerindo · Google Ads · Pallet Mesh · 21 Okt");
  await expect(page.getByTestId("saringan-dasbor")).toContainText("2 lead");
  await expect(page.getByTestId("baris-lead")).toHaveCount(2);
  await expect(page.locator(`a[href="/pipeline/${L.r2}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/pipeline/${L.r3}"]`)).toBeVisible();
  // × menghapus saringan → semua lead uji tampil lagi
  await page.getByTestId("hapus-saringan-dasbor").click();
  await expect(page).not.toHaveURL(/kes=|ka=|kpr=|kd=/);
  await expect(page.getByTestId("baris-lead")).toHaveCount(8);
});

test("sales: kartu asal lead hanya menghitung lead miliknya", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline/dasbor");
  const kartu = page.getByTestId("kartu-asal-situs");
  await expect(kartu).toContainText("Asal lead saya per situs");
  await expect(lead(page, "asal-situs_rh")).toHaveText("4");
  await expect(lead(page, "asal-meta")).toHaveText("0");
  await expect(lead(page, "asal-belum")).toHaveText("0");
  await expect(lead(page, "asal-total")).toHaveText("4");
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);
  await lead(page, "asal-situs_rh").getByRole("link").click();
  await expect(page.getByTestId("saringan-dasbor")).toContainText("Situs Hammerindo · Semua produk");
  await expect(page.getByTestId("baris-lead")).toHaveCount(4);
});

test("peran baca: kartu asal lead tampil penuh", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto("/pipeline/dasbor");
  await expect(lead(page, "asal-total")).toHaveText("8");
  await expect(lead(page, "asal-tanpa_kode")).toHaveText("1");
});
