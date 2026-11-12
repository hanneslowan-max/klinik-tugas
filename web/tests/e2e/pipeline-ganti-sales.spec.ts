// Ganti sales (29 Okt 2026): detail lead → Ganti sales (rep: lead sendiri; tercatat di Riwayat), daftar lead → mode
// Pilih → pindah massal (admin: lead siapa pun; rep: lead lain redup & tak bisa dipilih; peran baca tanpa tombol).
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses + 5 lead lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Ganti Sales";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
// a, b = BARU/PENAWARAN citra · c = BARU eka · d = BARU tanpa pemilik · e = ORDER citra (No SP tetap)
let L: Record<"a" | "b" | "c" | "d" | "e", string>;
let sp = "";

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
  L = { a: `ld${acak()}`, b: `ld${acak()}`, c: `ld${acak()}`, d: `ld${acak()}`, e: `ld${acak()}` };
  sp = `${10000 + Math.floor(Math.random() * 80000)}/RSG/X/2026`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null),` +
      ` (${AKUN.eka.id}, 'rep', 'MCE');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Malang');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${L.a}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'BARU', null, null, null),` +
      ` ('${L.b}', '${pl}', 'Telepon', ${AKUN.citra.id}, 'PENAWARAN', null, null, null),` +
      ` ('${L.c}', '${pl}', 'Referral', ${AKUN.eka.id}, 'BARU', null, null, null),` +
      ` ('${L.d}', '${pl}', 'WA langsung', null, 'BARU', null, null, null),` +
      ` ('${L.e}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${sp}', public.hari_ini_wib(), 7000000);` +
      ` insert into public.lead_item (lead_id, produk, qty) select l.id, 'Roda', 2 from public.lead l where l.pelanggan_id = '${pl}';`,
  );
});

test.afterEach(() => bersihkan());

const pemilik = (id: string) => sqlLokal(`select coalesce(pemilik::text, 'null') from public.lead where id = '${id}'`);
const tidakMelebar = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function pilihSales(page: Page, nama: RegExp) {
  const dialog = page.getByTestId("dialog-ganti-sales");
  await dialog.getByTestId("pilih-sales-baru").click();
  await page.getByRole("option", { name: nama }).click();
  await dialog.getByTestId("kirim-ganti-sales").click();
}

test("detail lead: rep mengganti sales lead miliknya → tercatat di Riwayat; lead rep lain tanpa tombol", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/${L.a}`);
  await expect(page.getByTestId("detail-sales")).toHaveText(AKUN.citra.username);
  await page.getByTestId("aksi-ganti-sales").click();
  const dialog = page.getByTestId("dialog-ganti-sales");
  await expect(dialog.getByTestId("sales-asal")).toHaveText(AKUN.citra.username);
  // pilihan: owner + rep (tanpa peran baca)
  await dialog.getByTestId("pilih-sales-baru").click();
  await expect(page.getByRole("option", { name: /^eka wulandari · MCE$/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /^budi santoso$/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /dodi/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await pilihSales(page, /^eka wulandari/);
  await expect(page.getByText(`Sales diganti ke ${AKUN.eka.username}`)).toBeVisible();
  await expect(page.getByTestId("detail-sales")).toHaveText(AKUN.eka.username);
  await expect(page.getByTestId("log-sales")).toContainText(`Sales ${AKUN.citra.username} → ${AKUN.eka.username}`);
  await expect(page.getByTestId("log-sales")).toContainText(AKUN.citra.username); // oleh citra
  // citra bukan pemilik lagi → tidak bisa menarik kembali
  await expect(page.getByTestId("aksi-ganti-sales")).toHaveCount(0);
  expect(pemilik(L.a)).toBe(String(AKUN.eka.id));

  await page.goto(`/pipeline/${L.c}`);
  await expect(page.getByTestId("detail-sales")).toHaveText(AKUN.eka.username);
  await expect(page.getByTestId("aksi-ganti-sales")).toHaveCount(0);
  // lead tanpa pemilik boleh dibagikan rep
  await page.goto(`/pipeline/${L.d}`);
  await expect(page.getByTestId("aksi-ganti-sales")).toBeVisible();
});

test("daftar lead: admin memilih banyak lead → pindah massal ke satu sales; ORDER tetap dengan No SP-nya", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.goto("/pipeline");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.getByTestId("baris-lead")).toHaveCount(5);
  await page.getByTestId("mode-pilih").click();
  await expect(page.getByTestId("bar-pilih")).toContainText("0 lead dipilih");
  await expect(page.getByTestId("pindahkan-sales")).toBeDisabled();
  await expect(page.locator('button.fixed[data-uji="tombol-lead-baru"]')).toHaveCount(0); // FAB disembunyikan selama memilih
  await page.getByTestId("pilih-semua").click();
  await expect(page.getByTestId("bar-pilih")).toContainText("5 lead dipilih");
  await expect(page.getByTestId("pilih-semua")).toHaveText("Batalkan pilihan");
  // lepas satu (lead ORDER) dengan mengetuk barisnya
  await page.locator(`label[for="pilih-${L.e}"]`).click();
  await expect(page.getByTestId("bar-pilih")).toContainText("4 lead dipilih");
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);

  await page.getByTestId("pindahkan-sales").click();
  const dialog = page.getByTestId("dialog-ganti-sales");
  await expect(dialog).toContainText("Pindahkan 4 lead");
  await expect(dialog.getByTestId("sales-asal")).toContainText(`${AKUN.citra.username} 2`);
  await expect(dialog.getByTestId("sales-asal")).toContainText(`${AKUN.eka.username} 1`);
  await expect(dialog.getByTestId("sales-asal")).toContainText("tanpa pemilik 1");
  await pilihSales(page, /^eka wulandari/);
  await expect(page.getByText(`3 lead dipindah ke ${AKUN.eka.username} (1 sudah milik ${AKUN.eka.username})`)).toBeVisible();
  // selesai → keluar dari mode Pilih, daftar memuat pemilik baru
  await expect(page.getByTestId("bar-pilih")).toHaveCount(0);
  await expect(page.getByTestId("mode-pilih")).toBeVisible();
  for (const k of ["a", "b", "c", "d"] as const) expect(pemilik(L[k])).toBe(String(AKUN.eka.id));
  expect(pemilik(L.e)).toBe(String(AKUN.citra.id));
  expect(sqlLokal(`select no_sp from public.lead where id = '${L.e}'`)).toBe(sp);
  expect(sqlLokal(`select count(*) from public.lead_riwayat_pemilik where lead_id in ('${L.a}','${L.b}','${L.c}','${L.d}')`)).toBe("3");
  await expect(page.locator(`a[href="/pipeline/${L.d}"]`)).toContainText(AKUN.eka.username);

  // keluar mode Pilih tanpa memindah (X)
  await page.getByTestId("mode-pilih").click();
  await page.getByRole("button", { name: "Keluar dari mode pilih" }).click();
  await expect(page.getByTestId("bar-pilih")).toHaveCount(0);
});

test("daftar lead: rep hanya bisa memilih lead miliknya / tanpa pemilik; peran baca tanpa mode Pilih", async ({ page, browser }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline?m=semua");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.getByTestId("baris-lead")).toHaveCount(5);
  await page.getByTestId("mode-pilih").click();
  await expect(page.getByTestId("pilih-semua")).toHaveText("Pilih semua (4)");
  await expect(page.locator(`#pilih-${L.c}`)).toBeDisabled();
  await page.getByTestId("pilih-semua").click();
  await expect(page.getByTestId("bar-pilih")).toContainText("4 lead dipilih");
  await page.getByTestId("pindahkan-sales").click();
  await pilihSales(page, /^budi santoso/);
  await expect(page.getByText(`4 lead dipindah ke ${AKUN.owner.username}`)).toBeVisible();
  for (const k of ["a", "b", "d", "e"] as const) expect(pemilik(L[k])).toBe(String(AKUN.owner.id));
  expect(pemilik(L.c)).toBe(String(AKUN.eka.id));

  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, isMobile: diHp(page), hasTouch: diHp(page) });
  const baca = await ctx.newPage();
  await masuk(baca, AKUN.dodi.email);
  await baca.goto("/pipeline");
  await baca.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(baca.getByTestId("baris-lead")).toHaveCount(5);
  await expect(baca.getByTestId("mode-pilih")).toHaveCount(0);
  await baca.goto(`/pipeline/${L.c}`);
  await expect(baca.getByTestId("detail-sales")).toHaveText(AKUN.eka.username);
  await expect(baca.getByTestId("aksi-ganti-sales")).toHaveCount(0);
  await ctx.close();
});
