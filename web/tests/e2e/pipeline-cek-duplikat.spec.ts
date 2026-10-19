// Peringatan lead dobel per nomor WA (15 Okt 2026, IMP-CMO-261015-1, migrasi 20261015120000): form "Lead baru" memanggil
// web_pipeline_cek_duplikat saat kolom Telepon / WA ditinggalkan dan sebelum simpan. Nomor sama (format apa pun:
// 08…, +62 8…, spasi/strip) → PERINGATAN berisi kode lead, tahap, PIC (sales pemilik) — BUKAN blokir: tetap bisa
// disimpan. Bila baru ketahuan saat Simpan, simpan ditahan sekali; tekan lagi = tersimpan. Juga teks bantu Sumber.
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses citra (rep) + 1 lead "-" bernomor lewat psql lokal.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const AWALAN = "PT Uji Cek Dobel";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

let kodeLama = "";
let lokal = ""; // 8 digit acak → nomor 0812-xxxx-xxxx (DB e2e dipakai bersama)

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama like '${AWALAN}%');` +
      ` delete from public.pelanggan where nama like '${AWALAN}%';` +
      ` delete from public.pipeline_akses where member_id = ${AKUN.citra.id};`,
  );
}

test.beforeEach(() => {
  bersihkan();
  lokal = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
  const [pl, kt, ld] = [`pl${acak()}`, `kt${acak()}`, `ld${acak()}`];
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG');` +
      // nama pelanggan "-" seperti 50 lead Okt; sufiks supaya bisa dibersihkan
      ` insert into public.pelanggan (id, nama) values ('${pl}', '${AWALAN} -');` +
      ` insert into public.kontak (id, pelanggan_id, nama, telepon, telepon_tampil) values` +
      ` ('${kt}', '${pl}', 'Pak Lama', public.pipeline_telp_norm('0812${lokal}'), '0812${lokal}');` +
      ` insert into public.lead (id, pelanggan_id, kontak_id, sumber, pemilik, tahap) values ('${ld}', '${pl}', '${kt}', 'WA langsung', ${AKUN.citra.id}, 'PENAWARAN');` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${ld}', 'Roda', 4);`,
  );
  kodeLama = sqlLokal(`select kode from public.lead where id = '${ld}'`);
});

test.afterEach(() => bersihkan());

const jumlahLeadNomor = () =>
  Number(sqlLokal(`select count(*) from public.lead l join public.kontak k on k.id = l.kontak_id where k.telepon = '62812${lokal}'`));

async function bukaForm(page: Page) {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByTestId("tombol-lead-baru").filter({ visible: true }).click();
  await expect(page.getByTestId("dialog-lead-baru")).toBeVisible();
}

/** Isian wajib selain telepon: perusahaan, produk + qty, sumber. */
async function isiWajib(page: Page, nama: string) {
  const dlg = page.getByTestId("dialog-lead-baru");
  await page.getByTestId("lb-nama").fill(nama);
  await dlg.getByRole("group", { name: "Produk" }).getByRole("button", { name: "Pallet Mesh" }).click();
  await dlg.getByLabel("Qty Pallet Mesh").fill("10");
  await dlg.getByRole("group", { name: "Sumber lead" }).getByRole("button", { name: "Google Ads" }).click();
}

test("nomor sama (format lain) → peringatan saat kolom ditinggalkan, tetap bisa disimpan", async ({ page }) => {
  await bukaForm(page);
  const dlg = page.getByTestId("dialog-lead-baru");
  await expect(dlg.getByText("Tanya pelanggan: dapat kontak kami dari mana? Pilih ASALNYA")).toBeVisible();

  await isiWajib(page, `${AWALAN} Baru A`);
  await page.getByTestId("lb-telp").fill(`+62 812-${lokal.slice(0, 4)}-${lokal.slice(4)}`);
  await page.getByTestId("lb-telp").blur();
  const peringatan = page.getByTestId("peringatan-dobel");
  await expect(peringatan).toContainText(
    `Nomor ini sudah ada di lead: ${kodeLama} (PENAWARAN, PIC ${AKUN.citra.username}) — cek dulu, jangan dobel.`,
  );
  await expect(peringatan.getByRole("link", { name: kodeLama })).toHaveAttribute("href", /\/pipeline\/ld/);

  // sudah terlihat → sekali tekan langsung tersimpan (peringatan, bukan blokir)
  await page.getByTestId("kirim-lead-baru").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Lead L-\d+ dibuat/ })).toBeVisible();
  expect(jumlahLeadNomor()).toBe(2);
});

test("langsung tekan Simpan tanpa meninggalkan kolom → ditahan sekali, tekan lagi tersimpan", async ({ page }) => {
  await bukaForm(page);
  await isiWajib(page, `${AWALAN} Baru B`);
  await page.getByTestId("lb-telp").fill(`0812 ${lokal}`);
  await page.getByTestId("kirim-lead-baru").click();
  await expect(page.getByTestId("tahan-dobel")).toBeVisible();
  await expect(page.getByTestId("peringatan-dobel")).toContainText(kodeLama);
  expect(jumlahLeadNomor()).toBe(1);

  await page.getByTestId("kirim-lead-baru").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Lead L-\d+ dibuat/ })).toBeVisible();
  expect(jumlahLeadNomor()).toBe(2);
});

test("nomor lain atau pendek → tanpa peringatan, langsung tersimpan", async ({ page }) => {
  await bukaForm(page);
  await isiWajib(page, `${AWALAN} Baru C`);
  const lain = lokal.startsWith("9") ? `1${lokal.slice(1)}` : `9${lokal.slice(1)}`;
  await page.getByTestId("lb-telp").fill(`0812${lain}`);
  await page.getByTestId("lb-telp").blur();
  await page.getByTestId("lb-telp").fill("0812");
  await page.getByTestId("lb-telp").blur();
  await expect(page.getByTestId("peringatan-dobel")).toHaveCount(0);
  await page.getByTestId("lb-telp").fill(`0812${lain}`);
  await page.getByTestId("kirim-lead-baru").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Lead L-\d+ dibuat/ })).toBeVisible();
  await expect(page.getByTestId("tahan-dobel")).toHaveCount(0);
  expect(jumlahLeadNomor()).toBe(1);
});
