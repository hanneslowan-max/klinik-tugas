// Tab Order Pipeline (revisi #3–#7): rekap & kelompok per bulan SP, saringan status bayar/tanggal/produk, urutan, cari
// No PO/produk, Data order (No PO, DP → sisa tagihan, Lunas), detail lead, dan unduh CSV. Seed sintetis tidak punya data
// Pipeline → tiap tes menyiapkan akses + 2 order + 1 lead lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Order Rekap";
const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
let lunas = "";
let belum = "";
let baru = "";

const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.pipeline_akses where member_id = ${AKUN.citra.id};`,
  );
}

test.beforeEach(() => {
  bersihkan();
  const pl = `pl${acak()}`;
  [lunas, belum, baru] = [`ld${acak()}`, `ld${acak()}`, `ld${acak()}`];
  // tanggal SP: bulan ini (lunas) & bulan lalu (belum), No SP berpola dengan bulan romawi yang sesuai
  const [ini, lalu] = sqlLokal(
    `select to_char(public.hari_ini_wib(), 'YYYY-MM-DD') || ',' || to_char((date_trunc('month', public.hari_ini_wib()) - interval '1 day')::date, 'YYYY-MM-DD')`,
  ).split(",");
  const sp = (n: number, t: string) => `${n}/RSG/${ROMAWI[Number(t.slice(5, 7)) - 1]}/${t.slice(0, 4)}`;
  const nomor = 900 + Math.floor(Math.random() * 90);
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Sidoarjo');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${lunas}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${sp(nomor, ini)}', '${ini}', 10000000),` +
      ` ('${belum}', '${pl}', 'Referral', ${AKUN.citra.id}, 'ORDER', '${sp(nomor + 1, lalu)}', '${lalu}', 5000000),` +
      ` ('${baru}', '${pl}', 'Telepon', ${AKUN.citra.id}, 'BARU', null, null, null);` +
      ` update public.lead set bayar_status = 'LUNAS', tanggal_lunas = '${ini}' where id = '${lunas}';` +
      ` insert into public.lead_item (lead_id, produk, qty, spesifikasi) values ('${lunas}', 'Pallet Mesh', 40, null), ('${belum}', 'Locker', 6, 'loker uji 12 pintu'), ('${baru}', 'Roda', 2, null);`,
  );
});

test.afterEach(() => bersihkan());

const baris = (page: Page, id: string) => page.locator(`[data-uji="baris-order"][data-id="${id}"]`);

/** Batasi ke pelanggan tes ini (DB e2e dipakai bersama: rekap & CSV tidak boleh ikut data lain). */
async function hanyaPelangganUji(page: Page) {
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.locator('[data-uji="baris-order"]')).toHaveCount(2);
}

/** Pilih urutan lewat menu, lalu tunggu menu terlepas: menu Radix yang sama tidak terbuka bila diketuk lagi selagi
 *  animasi tutupnya berjalan (±60 ms; jauh di bawah ketukan manusia, tetapi tes bisa secepat itu di runner CI). */
async function pilihUrut(page: Page, kunci: string) {
  await page.getByTestId("tombol-urut").click();
  await page.getByTestId(`urut-${kunci}`).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

async function bukaOrder(page: Page) {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline?tab=order");
  await expect(page.getByTestId("daftar-order")).toBeVisible();
  await hanyaPelangganUji(page);
}

test("tab Order: rekap, kelompok per bulan SP, saringan status bayar", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByRole("tab", { name: "Order" }).click();
  await expect(page).toHaveURL(/tab=order/);
  await hanyaPelangganUji(page);
  await expect(page.getByTestId("rekap-jumlah")).toHaveText("2");
  await expect(page.getByTestId("rekap-nominal")).toHaveText("Rp15.000.000");
  await expect(page.getByTestId("rekap-terbayar")).toHaveText("Rp10.000.000");
  await expect(page.getByTestId("rekap-sisa")).toHaveText("Rp5.000.000");
  await expect(page.getByTestId("grup-order")).toHaveCount(2);
  // bulan terbaru dulu: order lunas (bulan ini) di grup pertama
  await expect(page.getByTestId("grup-order").first().locator(`[data-id="${lunas}"]`)).toBeVisible();
  await expect(baris(page, baru)).toHaveCount(0);
  // lead non-order tidak masuk tab Order
  await expect(page.getByText("Roda · 2 unit")).toHaveCount(0);

  await page.getByTestId("tombol-saringan").click();
  await page.getByTestId("saring-status-BELUM").click();
  await expect(page).toHaveURL(/st=BELUM/);
  await expect(baris(page, belum)).toBeVisible();
  await expect(baris(page, lunas)).toHaveCount(0);
  await expect(page.getByText(/^1 dari \d+ order$/)).toBeVisible();
  await expect(page.getByTestId("rekap-sisa")).toHaveText("Rp5.000.000");

  await page.getByTestId("reset-saringan").click();
  await expect(baris(page, lunas)).toBeVisible();
  // pindah ke tab lain membuang saringan status bayar
  await page.getByTestId("saring-status-LUNAS").click();
  await expect(page).toHaveURL(/st=LUNAS/);
  await page.getByRole("tab", { name: "Semua" }).click();
  await expect(page).toHaveURL(/\/pipeline(\?(?!.*st=).*)?$/);
  await expect(page).not.toHaveURL(/st=/);
});

test("saringan Produk: semua produk + jumlah, berlaku di tab Semua & Order, ikut Reset (ganti tab Pallet Mesh)", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await expect(page.getByRole("tab", { name: "Pallet Mesh" })).toHaveCount(0);
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.getByTestId("baris-lead")).toHaveCount(3);

  await page.getByTestId("tombol-produk").click();
  const pilihan = (nama: string | RegExp) => page.getByRole("menuitemradio", { name: nama });
  await expect(pilihan(/^Semua produk/)).toContainText("3");
  await expect(pilihan(/^Roda/)).toContainText("1");
  await expect(pilihan(/^Lemari Arsip/)).toContainText("0");
  await pilihan(/^Roda/).click();
  await expect(page).toHaveURL(/produk=Roda/);
  await expect(page.getByTestId("tombol-produk")).toHaveText(/Roda/);
  await expect(page.getByTestId("baris-lead")).toHaveCount(1);
  await expect(page.getByText("Roda · 2 unit")).toBeVisible();
  await expect(page.getByText(/^1 dari 3 lead$/)).toBeVisible();

  // pindah tab: produk tetap; lead Roda belum order → tab Order kosong
  await page.getByRole("tab", { name: "Order" }).click();
  await expect(page).toHaveURL(/tab=order.*produk=Roda|produk=Roda.*tab=order/);
  await expect(page.getByText("Tidak ada order yang cocok.")).toBeVisible();
  await page.getByTestId("tombol-produk").click();
  await pilihan(/^Pallet Mesh/).click();
  await expect(baris(page, lunas)).toBeVisible();
  await expect(page.locator('[data-uji="baris-order"]')).toHaveCount(1);

  await page.getByTestId("reset-saringan").click();
  await expect(page).not.toHaveURL(/produk=/);
  await expect(page.getByTestId("tombol-produk")).toHaveText(/Semua produk/);
  await expect(page.locator('[data-uji="baris-order"]')).toHaveCount(2);
});

test("Urutkan: terbaru/terlama masuk di daftar lead; tab Order punya pilihan sendiri (tanggal SP); tersimpan di URL", async ({ page }) => {
  sqlLokal(
    `update public.lead set tanggal_masuk = case id when '${lunas}' then date '2026-03-01' when '${belum}' then date '2026-01-01'` +
      ` else date '2026-02-01' end where id in ('${lunas}', '${belum}', '${baru}');`,
  );
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.getByTestId("baris-lead")).toHaveCount(3);
  const urutanLead = () => page.getByTestId("baris-lead").evaluateAll((el) => el.map((e) => e.getAttribute("href")?.split("/").pop()));
  const urutanOrder = () => page.locator('[data-uji="baris-order"]').evaluateAll((el) => el.map((e) => e.getAttribute("data-id")));

  await expect(page.getByTestId("tombol-urut")).toHaveText(/Paling lama diam/);
  await pilihUrut(page, "baru");
  await expect(page).toHaveURL(/urut=baru/);
  await expect.poll(urutanLead).toEqual([lunas, baru, belum]);
  await pilihUrut(page, "lama");
  await expect(page.getByTestId("tombol-urut")).toHaveText(/Terlama masuk/);
  await expect.poll(urutanLead).toEqual([belum, baru, lunas]);

  // masuk tab Order: urutan lead dibuang, pilihannya berganti (bawaan tanggal SP terbaru)
  await page.getByRole("tab", { name: "Order" }).click();
  await expect(page).not.toHaveURL(/urut=/);
  await expect(page.getByTestId("tombol-urut")).toHaveText(/Tanggal SP terbaru/);
  await expect.poll(urutanOrder).toEqual([lunas, belum]);
  await page.getByTestId("tombol-urut").click();
  await expect(page.getByTestId("urut-nilai")).toBeVisible();
  await expect(page.getByTestId("urut-baru")).toHaveCount(0); // pilihan tab lead tidak ada di tab Order
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await pilihUrut(page, "lama");
  await expect.poll(urutanOrder).toEqual([belum, lunas]);
});

test("Papan + tab Order + saringan Lunas: hanya order lunas", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline?tab=order&v=papan&st=LUNAS");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(page.locator(`[data-uji="kartu-lead"][data-id="${lunas}"]`)).toBeVisible();
  await expect(page.locator(`[data-uji="kartu-lead"][data-id="${belum}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-uji="kartu-lead"][data-id="${baru}"]`)).toHaveCount(0);
  // status tak dikenal di URL diabaikan (bukan mengosongkan daftar)
  await page.goto("/pipeline?tab=order&st=ngawur");
  await hanyaPelangganUji(page);
});

test("saringan tanggal bisa diketik dengan keyboard (draf lokal, URL diisi saat tanggal lengkap)", async ({ page }) => {
  test.skip(diHp(page), "HP memakai pemilih tanggal bawaan");
  await bukaOrder(page);
  await page.getByTestId("tombol-saringan").click();
  const tahun = sqlLokal(`select extract(year from public.hari_ini_wib())::int`);
  // 01-01: urutan segmen dd/mm atau mm/dd tidak berpengaruh
  const dari = page.getByTestId("saring-dari");
  await dari.focus();
  await page.keyboard.type(`0101${tahun}`, { delay: 60 });
  await expect(dari).toHaveValue(`${tahun}-01-01`);
  await expect(page).toHaveURL(new RegExp(`dari=${tahun}-01-01`));
  await page.keyboard.press("Tab");
  await expect(dari).toHaveValue(`${tahun}-01-01`);
  // order tes dengan tanggal SP >= 1 Januari tahun ini tetap tampil sesuai data
  const harap = Number(sqlLokal(`select count(*) from public.lead where id in ('${lunas}', '${belum}') and tanggal_sp >= '${tahun}-01-01'`));
  await expect(page.locator('[data-uji="baris-order"]')).toHaveCount(harap);
});

test("Data order: isi No PO + DP → sisa tagihan, lalu Lunas", async ({ page }) => {
  await bukaOrder(page);
  await baris(page, belum).getByTestId("ubah-order").click();
  const dialog = page.getByTestId("dialog-order");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("input-no-po").fill("PO-UJI/2026/117");
  await dialog.getByRole("button", { name: "DP", exact: true }).click();
  await dialog.getByTestId("input-dp").fill("2000000");
  await expect(dialog.getByTestId("pratinjau-sisa")).toHaveText("Rp3.000.000");
  await dialog.getByTestId("simpan-order").click();
  await expect(dialog).toBeHidden();

  await expect(baris(page, belum)).toContainText("PO-UJI/2026/117");
  await expect(baris(page, belum).getByTestId("pil-bayar")).toHaveText("DP");
  await expect(baris(page, belum)).toContainText("sisa Rp3.000.000");
  await expect(page.getByTestId("rekap-terbayar")).toHaveText("Rp12.000.000");
  await expect(page.getByTestId("rekap-sisa")).toHaveText("Rp3.000.000");
  expect(sqlLokal(`select no_po || '|' || bayar_status || '|' || bayar_dp from public.lead where id = '${belum}'`)).toBe("PO-UJI/2026/117|DP|2000000");

  // DP tidak boleh >= nominal: ditolak di dialog
  await baris(page, belum).getByTestId("ubah-order").click();
  await dialog.getByTestId("input-dp").fill("5000000");
  await dialog.getByTestId("simpan-order").click();
  await expect(dialog.getByText("Nominal DP harus lebih kecil dari nominal order")).toBeVisible();
  // → tandai Lunas
  await dialog.getByRole("button", { name: "Lunas", exact: true }).click();
  await dialog.getByTestId("simpan-order").click();
  await expect(dialog).toBeHidden();
  await expect(baris(page, belum).getByTestId("pil-bayar")).toHaveText("Lunas");
  await expect(page.getByTestId("rekap-sisa")).toHaveText("Rp0");
});

test("cari No PO, produk, dan spesifikasi; detail lead menampilkan data order", async ({ page }) => {
  sqlLokal(`update public.lead set no_po = 'PO-CARI-778' where id = '${lunas}'`);
  await bukaOrder(page);
  const cari = page.getByTestId("cari-lead");
  await cari.fill("cari-778");
  await expect(baris(page, lunas)).toBeVisible();
  await expect(baris(page, belum)).toHaveCount(0);
  await cari.fill("loker uji");
  await expect(baris(page, belum)).toBeVisible();
  await expect(baris(page, lunas)).toHaveCount(0);
  await cari.fill(PELANGGAN);

  await baris(page, lunas).getByRole("link", { name: PELANGGAN }).click();
  await expect(page).toHaveURL(new RegExp(`/pipeline/${lunas}`));
  await expect(page.getByText("PO-CARI-778")).toBeVisible();
  await expect(page.getByTestId("detail-bayar")).toHaveText("Lunas");
  await expect(page.getByTestId("aksi-data-order")).toBeVisible();
});

test("unduh CSV berisi order yang tampil", async ({ page }) => {
  test.skip(diHp(page), "unduh berkas diuji di desktop");
  await bukaOrder(page);
  const [unduhan] = await Promise.all([page.waitForEvent("download"), page.getByTestId("unduh-csv").click()]);
  expect(unduhan.suggestedFilename()).toMatch(/^order-anvil-\d{4}-\d{2}-\d{2}\.csv$/);
  const isi = await (await unduhan.createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8"));
  expect(isi.startsWith("﻿Tanggal SP;No SP;No PO;")).toBe(true);
  expect(isi).toContain(PELANGGAN);
  expect(isi).toContain(";10000000;Lunas;");
  expect(isi).toContain(";5000000;Belum bayar;");
  expect(isi).not.toContain("Roda 2 unit");
});
