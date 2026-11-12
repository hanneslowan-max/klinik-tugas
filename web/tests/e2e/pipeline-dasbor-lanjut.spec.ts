// Dasbor Pipeline Tahap 2 (29 Okt 2026): admin melihat bagian 5–10, menempel biaya iklan dari sheet (tersimpan ke
// iklan_biaya, kartu biaya Google terisi), dan angka pembayaran membuka daftar order-nya; sales hanya mendapat kartu
// "Pembayaran order saya" & "Rapikan lead saya" (tanpa biaya/angka tim); peran baca melihat bagian 5–10 tanpa tombol tempel.
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses + lead lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Dasbor Lanjut";
const CAMPAIGN = "Uji E2E Roda";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
// a = BARU citra sumber Lainnya · b = ORDER citra (status bayar kosong) · c = ORDER eka BELUM · d = BATAL citra (masuk bulan ini)
let L: Record<"a" | "b" | "c" | "d", string>;

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.iklan_biaya where campaign = '${CAMPAIGN}';` +
      ` delete from public.pipeline_akses where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id}, ${AKUN.eka.id});`,
  );
}

test.beforeEach(() => {
  bersihkan();
  const pl = `pl${acak()}`;
  L = { a: `ld${acak()}`, b: `ld${acak()}`, c: `ld${acak()}`, d: `ld${acak()}` };
  const sp = (k: string) => `${10000 + Math.floor(Math.random() * 80000)}/${k}/X/2026`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null),` +
      ` (${AKUN.eka.id}, 'rep', 'MCE');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Malang');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi, alasan_batal) values` +
      ` ('${L.a}', '${pl}', 'Lainnya', ${AKUN.citra.id}, 'BARU', null, null, null, null),` +
      ` ('${L.b}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${sp("RSG")}', public.hari_ini_wib(), 7000000, null),` +
      ` ('${L.c}', '${pl}', 'Telepon', ${AKUN.eka.id}, 'ORDER', '${sp("MCE")}', public.hari_ini_wib(), 9000000, null),` +
      ` ('${L.d}', '${pl}', 'WA langsung', ${AKUN.citra.id}, 'BATAL', null, null, null, 'Harga');` +
      ` update public.lead set bayar_status = null where id = '${L.b}';` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${L.a}', 'Roda', 1), ('${L.b}', 'Roda', 2), ('${L.c}', 'Pallet Mesh', 3), ('${L.d}', 'Roda', 1);`,
  );
});

test.afterEach(() => bersihkan());

const tidakMelebar = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("admin: bagian 5–10, tempel biaya iklan dari sheet, angka pembayaran → daftar order", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.goto("/pipeline/dasbor");
  for (const b of ["dasbor-sumber", "dasbor-bayar", "dasbor-batal", "dasbor-kualitas", "dasbor-produk", "dasbor-tren"]) {
    await expect(page.getByTestId(b)).toBeVisible();
  }
  await expect(page.getByTestId("kartu-biaya-google")).toContainText("Belum ada data biaya Google Ads");
  await expect(page.getByTestId("grafik-kumulatif")).toBeVisible();
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0); // grafik & tabel tidak melebarkan halaman HP
  await expect(page.locator('[data-uji="baris-bayar"]').filter({ hasText: AKUN.citra.username }).getByTestId("bayar-order")).toHaveText("1");

  // tempel tabel dari sheet (tab), tanggal = tgl 1 bulan berjalan
  const tgl = sqlLokal("select to_char(date_trunc('month', public.hari_ini_wib()), 'DD/MM/YYYY')");
  await page.getByTestId("buka-tempel-biaya").click();
  await page.getByTestId("tempel-biaya").fill(`Tanggal\tCampaign\tBiaya\tKlik\tKonversi\n${tgl}\t${CAMPAIGN}\tRp1.250.000\t40\t2,5\nTotal\t\t1.250.000\t40\t2,5`);
  await expect(page.getByTestId("ringkas-tempel")).toContainText("1 baris");
  await expect(page.getByTestId("dialog-biaya-iklan")).toContainText("1 baris dilewati");
  await page.getByTestId("simpan-biaya").click();
  await expect(page.getByText("Biaya iklan tersimpan: 1 baru")).toBeVisible();
  expect(sqlLokal(`select biaya || '|' || klik || '|' || konversi from public.iklan_biaya where campaign = '${CAMPAIGN}'`)).toBe("1250000.00|40|2.50");
  await expect(page.getByTestId("biaya-google")).toHaveText("Rp1,25 jt");
  await expect(page.getByTestId("baris-kampanye").filter({ hasText: CAMPAIGN })).toBeVisible();

  // angka order belum lunas citra → daftar order itu
  await page.locator('[data-uji="baris-bayar"]').filter({ hasText: AKUN.citra.username }).getByTestId("bayar-order").click();
  await expect(page.getByTestId("saringan-dasbor")).toContainText(`Order belum lunas (SP 90 hari terakhir) · ${AKUN.citra.username} · 1 lead`);
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.locator(`a[href="/pipeline/${L.b}"]`)).toBeVisible();
});

test("sales: kartu pembayaran & rapikan miliknya saja, tanpa biaya iklan atau angka tim", async ({ page }) => {
  sqlLokal(`insert into public.iklan_biaya (tanggal, platform, campaign, biaya) values (date_trunc('month', public.hari_ini_wib())::date, 'google', '${CAMPAIGN}', 999000)`);
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline/dasbor");
  await expect(page.getByTestId("sales-bayar")).toBeVisible();
  await expect(page.getByTestId("bayar-saya")).toHaveText("1");
  await expect(page.getByTestId("rapikan-lainnya")).toHaveText("1");
  await expect(page.getByTestId("rapikan-batal")).toHaveText("1");
  await expect(page.getByTestId("dasbor-sumber")).toHaveCount(0);
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("buka-tempel-biaya")).toHaveCount(0);
  const isi = (await page.locator("main").textContent()) ?? "";
  for (const x of [CAMPAIGN, AKUN.eka.username, "Rp9,0 jt", "Rp9 jt"]) expect(isi).not.toContain(x);

  await page.getByRole("link", { name: "Isi status bayar" }).click();
  await expect(page.getByTestId("saringan-dasbor")).toContainText("Order belum lunas");
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.locator(`a[href="/pipeline/${L.b}"]`)).toBeVisible();
});

test("peran baca: bagian 5–10 tampil tanpa tombol tempel biaya", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto("/pipeline/dasbor");
  await expect(page.getByTestId("dasbor-sumber")).toBeVisible();
  await expect(page.getByTestId("kartu-biaya-google")).toBeVisible();
  await expect(page.getByTestId("buka-tempel-biaya")).toHaveCount(0);
});
