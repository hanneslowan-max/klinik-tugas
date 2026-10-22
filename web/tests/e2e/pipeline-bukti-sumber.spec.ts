// Bukti sumber dari chat WA 0878 (21 Okt 2026, Kapso Fase 1, migrasi 20261021120000): agent menulis kelas bukti lewat
// x_pipeline_sumber_bukti_set (di sini dipanggil psql lokal atas nama owner, sama dengan jalur Edge), detail lead
// menampilkan satu baris HANYA-BACA di bawah Sumber isian sales; lead tanpa bukti tidak menampilkan apa pun.
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses (citra rep, dodi baca) + 2 lead lewat psql lokal.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Bukti Sumber E2E";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

let bukti = ""; // lead berbukti (sumber sales "WA langsung", bukti agent = Google Ads → situs OYAMA)
let polos = ""; // lead tanpa bukti

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.pipeline_akses where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id});`,
  );
}

test.beforeEach(() => {
  bersihkan();
  const pl = `pl${acak()}`;
  [bukti, polos] = [`ld${acak()}`, `ld${acak()}`];
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null);` +
      ` insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Gresik');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap) values` +
      ` ('${bukti}', '${pl}', 'WA langsung', ${AKUN.citra.id}, 'BARU'), ('${polos}', '${pl}', 'Telepon', ${AKUN.citra.id}, 'BARU');` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${bukti}', 'Pallet Mesh', 40), ('${polos}', 'Roda', 2);`,
  );
  sqlLokal(
    `select public.x_pipeline_sumber_bukti_set(${AKUN.owner.id}, '{"items":[{"lead_id":"${bukti}","bukti":"ga-oy",` +
      `"kode":"GA-OY-7K3F","chat_pada":"2026-10-15T08:05:00+07:00"}]}')`,
  );
});

test.afterEach(() => bersihkan());

/** Isi baris info detail lead (dt → dd) di kartu info. */
const kv = (page: Page, dt: string) =>
  page.locator("dl").first().locator(`xpath=./dt[normalize-space()="${dt}"]/following-sibling::dd[1]`);

test("detail lead: bukti sumber agent tampil hanya-baca di bawah Sumber sales; lead tanpa bukti tidak", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/${bukti}`);
  const sumber = kv(page, "Sumber");
  await expect(sumber).toContainText("WA langsung");
  const baris = sumber.getByTestId("detail-bukti-sumber");
  await expect(baris).toContainText("Bukti sumber (agent): Google Ads · situs OYAMA (GA-OY-7K3F) · chat 15 Okt 2026");
  await expect(baris).toContainText("08.05 WIB");
  // hanya teks: tanpa kontrol isian, dan dialog Ubah tidak memuat bukti
  await expect(sumber.locator("input, select, textarea, button")).toHaveCount(0);
  await page.getByTestId("aksi-ubah").click();
  const dialog = page.getByTestId("dialog-ubah");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("Bukti sumber");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.goto(`/pipeline/${polos}`);
  await expect(kv(page, "Sumber")).toHaveText("Telepon");
  await expect(page.getByTestId("detail-bukti-sumber")).toHaveCount(0);

  // sumber sales tetap, bukti tidak tersentuh
  expect(sqlLokal(`select concat_ws('|', sumber, sumber_bukti, sumber_bukti_kode) from public.lead where id = '${bukti}'`)).toBe(
    "WA langsung|ga-oy|GA-OY-7K3F",
  );
});

test("peran baca (tanpa tombol tulis) juga melihat bukti sumber", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto(`/pipeline/${bukti}`);
  await expect(kv(page, "Sumber").getByTestId("detail-bukti-sumber")).toContainText("Google Ads · situs OYAMA (GA-OY-7K3F)");
  await expect(page.getByTestId("aksi-ubah")).toHaveCount(0);
});
