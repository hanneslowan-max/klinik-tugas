// Batalkan order (14 Okt 2026, migrasi 20261014130000): tombol "Batalkan order" di detail lead ORDER, alasan TERTULIS
// wajib (5–500 karakter), lead pindah ke BATAL (alasan "Order dibatalkan"), keluar dari tab Order & rekapnya, data order
// (No SP, nominal, pembayaran) tetap tampil sebagai riwayat. Hak: rep PEMILIK atau admin; order tanpa pemilik → admin.
// Seed sintetis tidak punya data Pipeline → tiap tes menyiapkan akses (citra rep, dodi baca, eka rep lain) + 2 order
// (milik citra & tanpa pemilik) + 1 lead BARU lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Batal Order";
const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const ALASAN = "Customer membatalkan: proyek gudang ditunda\nsampai tahun depan";
const GALAT_WAJIB = "Alasan pembatalan wajib ditulis (minimal 5 karakter).";

let order = ""; // ORDER milik citra, DP Rp2.500.000
let tanpa = ""; // ORDER tanpa pemilik
let baru = ""; // BARU milik citra
let spOrder = "";
let spTanpa = "";

const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

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
  [order, tanpa, baru] = [`ld${acak()}`, `ld${acak()}`, `ld${acak()}`];
  const ini = sqlLokal(`select to_char(public.hari_ini_wib(), 'YYYY-MM-DD')`);
  // No SP berpola & unik (DB dipakai bersama): nomor urut 5 digit acak
  const nomor = 10000 + Math.floor(Math.random() * 80000);
  const sp = (n: number) => `${n}/RSG/${ROMAWI[Number(ini.slice(5, 7)) - 1]}/${ini.slice(0, 4)}`;
  [spOrder, spTanpa] = [sp(nomor), sp(nomor + 1)];
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null),` +
      ` (${AKUN.eka.id}, 'rep', 'MCE');` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Gresik');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${order}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${spOrder}', '${ini}', 12500000),` +
      ` ('${tanpa}', '${pl}', 'Referral', null, 'ORDER', '${spTanpa}', '${ini}', 3000000),` +
      ` ('${baru}', '${pl}', 'Telepon', ${AKUN.citra.id}, 'BARU', null, null, null);` +
      ` update public.lead set bayar_status = 'DP', bayar_dp = 2500000, tanggal_dp = '${ini}' where id = '${order}';` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${order}', 'Pallet Mesh', 40), ('${tanpa}', 'Locker', 6), ('${baru}', 'Roda', 2);`,
  );
});

test.afterEach(() => bersihkan());

/** Isi baris info detail lead (dt → dd) di kartu info (dl pertama; dialog di-portal ke akhir body). */
const kv = (page: Page, dt: string) =>
  page.locator("dl").first().locator(`xpath=./dt[normalize-space()="${dt}"]/following-sibling::dd[1]`);
const barisOrder = (page: Page, id: string) => page.locator(`[data-uji="baris-order"][data-id="${id}"]`);
const tahapDb = (id: string) => sqlLokal(`select tahap from public.lead where id = '${id}'`);

/** Detail lead sudah termuat (baris No SP order tampil) — sebelum memeriksa tombol yang TIDAK boleh ada. */
async function bukaDetailOrder(page: Page, id: string, sp: string) {
  await page.goto(`/pipeline/${id}`);
  await expect(kv(page, "No SP")).toContainText(sp);
}

/** Tab Order, semua pemilik, dibatasi ke pelanggan tes (DB e2e dipakai bersama). */
async function bukaTabOrder(page: Page) {
  await page.goto("/pipeline?tab=order&m=semua");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  await expect(barisOrder(page, tanpa)).toBeVisible();
}

test("rep pemilik membatalkan order: alasan wajib ditulis, lead pindah ke BATAL, data order tetap tampil", async ({ page }) => {
  const kode = sqlLokal(`select kode from public.lead where id = '${order}'`);
  await masuk(page, AKUN.citra.email);

  // sebelum: kedua order ada di tab Order & rekapnya
  await bukaTabOrder(page);
  await expect(barisOrder(page, order)).toBeVisible();
  await expect(page.getByTestId("rekap-jumlah")).toHaveText("2");

  await bukaDetailOrder(page, order, spOrder);
  await page.getByTestId("aksi-batal-order").click();
  const dialog = page.getByTestId("dialog-batal-order");
  await expect(dialog).toBeVisible();
  // konsekuensi + ringkasan order
  await expect(dialog).toContainText("tidak bisa diurungkan");
  await expect(dialog).toContainText(spOrder);
  await expect(dialog).toContainText("Rp12.500.000");
  await expect(dialog).toContainText("DP Rp2.500.000 sudah dibayar");
  await expect(dialog).toContainText("Pengembalian dana diurus di luar Anvil");

  // kosong → ditolak di dialog, DB tetap ORDER
  const alasan = dialog.locator("#bo-alasan");
  await dialog.getByTestId("kirim-batal-order").click();
  await expect(dialog.getByRole("alert")).toHaveText(GALAT_WAJIB);
  await expect(alasan).toHaveAttribute("aria-invalid", "true");
  // 4 karakter → tetap ditolak
  await alasan.fill("abcd");
  await expect(dialog.getByTestId("hitung-alasan")).toHaveText("4/500");
  await dialog.getByTestId("kirim-batal-order").click();
  await expect(dialog.getByRole("alert")).toHaveText(GALAT_WAJIB);
  await expect(dialog).toBeVisible();
  expect(tahapDb(order)).toBe("ORDER");

  // alasan sah (spasi di tepi dibuang, baris baru dipertahankan)
  await alasan.fill(`  ${ALASAN}  `);
  await expect(alasan).not.toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByTestId("kirim-batal-order").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: `Order dibatalkan: ${kode}` })).toBeVisible();

  // detail: BATAL + alasan, data order tetap tampil (hanya-baca), tombol order hilang
  await expect(kv(page, "Tahap")).toHaveText("BATAL");
  const alasanBatal = page.getByTestId("detail-alasan-batal");
  await expect(alasanBatal).toContainText("Order dibatalkan");
  await expect(alasanBatal).toContainText("Customer membatalkan: proyek gudang ditunda");
  await expect(alasanBatal).toContainText("sampai tahun depan");
  await expect(kv(page, "No SP")).toContainText(spOrder);
  await expect(kv(page, "Nominal")).toHaveText("Rp12.500.000");
  await expect(page.getByTestId("detail-bayar")).toContainText("DP Rp2.500.000 sudah dibayar");
  await expect(page.getByTestId("detail-bayar")).toContainText("Order dibatalkan");
  await expect(page.getByTestId("aksi-batal-order")).toHaveCount(0);
  await expect(page.getByTestId("aksi-data-order")).toHaveCount(0);
  const riwayat = page.getByRole("region", { name: "Riwayat" });
  await expect(riwayat.getByText(/Order dibatalkan\. Alasan: Customer membatalkan: proyek gudang ditunda/)).toBeVisible();
  await expect(riwayat.getByText("Tahap ORDER → BATAL")).toBeVisible();

  // DB: BATAL + alasan tertulis (dirapikan); data order, pembayaran & pemilik tidak berubah; jejak siapa
  expect(
    sqlLokal(
      `select concat_ws('|', tahap, alasan_batal, alasan_batal_lain, no_sp, nilai_transaksi, bayar_status, bayar_dp, pemilik) from public.lead where id = '${order}'`,
    ),
  ).toBe(`BATAL|Order dibatalkan|${ALASAN}|${spOrder}|12500000|DP|2500000|${AKUN.citra.id}`);
  expect(sqlLokal(`select concat_ws('|', jenis, hasil, oleh) from public.lead_aktivitas where lead_id = '${order}' order by id desc limit 1`)).toBe(
    `Catatan|Order dibatalkan. Alasan: ${ALASAN}|${AKUN.citra.id}`,
  );
  expect(sqlLokal(`select concat_ws('|', dari, ke, oleh) from public.lead_riwayat_tahap where lead_id = '${order}' order by id desc limit 1`)).toBe(
    `ORDER|BATAL|${AKUN.citra.id}`,
  );

  // tab Order: order yang dibatalkan keluar dari daftar & rekap
  await bukaTabOrder(page);
  await expect(barisOrder(page, order)).toHaveCount(0);
  await expect(page.getByTestId("rekap-jumlah")).toHaveText("1");
  await expect(page.getByTestId("rekap-nominal")).toHaveText("Rp3.000.000");

  // saringan tahap BATAL: lead muncul di sana
  await page.goto("/pipeline?st=BATAL");
  await page.getByTestId("cari-lead").fill(PELANGGAN);
  const barisBatal = page.getByTestId("baris-lead");
  await expect(barisBatal).toHaveCount(1);
  await expect(barisBatal).toContainText(kode);
  await expect(barisBatal).toContainText("BATAL");
});

for (const [akun, label] of [
  [AKUN.dodi, "baca (dodi)"],
  [AKUN.eka, "rep lain (eka)"],
] as const) {
  test(`${label} tidak melihat Batalkan order pada order milik citra`, async ({ page }) => {
    await masuk(page, akun.email);
    await bukaDetailOrder(page, order, spOrder);
    if (akun.id === AKUN.eka.id) await expect(page.getByTestId("aksi-fu")).toBeVisible(); // rep: tombol tulis lain ada
    await expect(page.getByTestId("aksi-batal-order")).toHaveCount(0);
    await expect(page.getByTestId("aksi-data-order")).toHaveCount(0);
  });
}

test("admin (owner budi) melihat Batalkan order, juga pada order tanpa pemilik, dan bisa membatalkannya", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await bukaDetailOrder(page, order, spOrder);
  await expect(page.getByTestId("aksi-batal-order")).toBeVisible();

  await bukaDetailOrder(page, tanpa, spTanpa);
  await page.getByTestId("aksi-batal-order").click();
  const dialog = page.getByTestId("dialog-batal-order");
  await expect(dialog).toContainText("Belum ada pembayaran");
  await dialog.locator("#bo-alasan").fill("Customer pindah supplier");
  await dialog.getByTestId("kirim-batal-order").click();
  await expect(dialog).toBeHidden();
  await expect(kv(page, "Tahap")).toHaveText("BATAL");
  await expect(page.getByTestId("detail-bayar")).toContainText("Tidak ada pembayaran tercatat");
  expect(sqlLokal(`select concat_ws('|', tahap, alasan_batal, alasan_batal_lain, no_sp) from public.lead where id = '${tanpa}'`)).toBe(
    `BATAL|Order dibatalkan|Customer pindah supplier|${spTanpa}`,
  );
});

test("order tanpa pemilik: rep (citra) tidak melihat Batalkan order (Klaim dulu), Data order tetap ada", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await bukaDetailOrder(page, tanpa, spTanpa);
  await expect(page.getByTestId("aksi-data-order")).toBeVisible();
  await expect(page.getByTestId("aksi-batal-order")).toHaveCount(0);
});

test('lead BARU: tanpa Batalkan order; dialog Batal biasa tidak menawarkan "Order dibatalkan"', async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/${baru}`);
  await expect(page.getByTestId("aksi-order")).toBeVisible();
  await expect(page.getByTestId("aksi-batal-order")).toHaveCount(0);

  await page.getByRole("button", { name: "Batal", exact: true }).click();
  const dialog = page.getByTestId("dialog-tahap");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Alasan batal" }).click();
  await expect(page.getByRole("option", { name: "Harga", exact: true })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(7);
  await expect(page.getByRole("option", { name: "Order dibatalkan" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(tahapDb(baru)).toBe("BARU");
});
