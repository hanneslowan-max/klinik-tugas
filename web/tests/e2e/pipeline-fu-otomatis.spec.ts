// Jadwal FU otomatis (20 Okt 2026, IMP-PIP-261015-1, migrasi 20261020120000): "Catat FU" tanpa "Rencana berikutnya"
// pada lead BARU/PENAWARAN → server mengisi fu_berikutnya = hari ini (WIB) + 2 hari kerja; isian manual menang.
// Logika lengkap (Sabtu/Minggu, hari libur, lead tertutup) diuji di uji/db/29_pipeline_fu_otomatis.sql; di sini jalur
// web: teks bantu di dialog, toast menyebut tanggal FU berikutnya, nilai tersimpan.
// Seed sintetis tanpa data Pipeline → tiap tes menyiapkan akses citra (rep) + 1 lead BARU miliknya lewat psql lokal.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const AWALAN = "PT Uji FU Otomatis";
const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

let lead = "";

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama like '${AWALAN}%');` +
      ` delete from public.pelanggan where nama like '${AWALAN}%';` +
      ` delete from public.pipeline_akses where member_id = ${AKUN.citra.id};`,
  );
}

test.beforeEach(() => {
  bersihkan();
  const pl = `pl${acak()}`;
  lead = `ld${acak()}`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG');` +
      ` insert into public.pelanggan (id, nama) values ('${pl}', '${AWALAN}');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap) values ('${lead}', '${pl}', 'WA langsung', ${AKUN.citra.id}, 'BARU');` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${lead}', 'Roda', 4);`,
  );
});

test.afterEach(() => bersihkan());

const fuDb = () => sqlLokal(`select coalesce(fu_berikutnya::text, '') from public.lead where id = '${lead}'`);

async function bukaDialogFu(page: Page) {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/${lead}`);
  await page.getByTestId("aksi-fu").click();
  await expect(page.getByTestId("dialog-fu")).toBeVisible();
}

test("rencana kosong → FU berikutnya otomatis hari ini + 2 hari kerja", async ({ page }) => {
  const harap = sqlLokal(`select public.pipeline_tambah_hari_kerja(public.hari_ini_wib(), 2)::text`);
  await bukaDialogFu(page);
  const dlg = page.getByTestId("dialog-fu");
  await expect(dlg.getByText("Kosong = otomatis 2 hari kerja dari hari ini (lead BARU/PENAWARAN)")).toBeVisible();
  await dlg.getByLabel("Hasil").fill("belum diangkat");
  await page.getByTestId("kirim-fu").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Follow-up tercatat · FU berikutnya" })).toBeVisible();
  expect(fuDb()).toBe(harap);
});

test("rencana diisi manual → tanggal manual yang dipakai", async ({ page }) => {
  const manual = sqlLokal(`select (public.hari_ini_wib() + 9)::text`);
  await bukaDialogFu(page);
  const dlg = page.getByTestId("dialog-fu");
  await dlg.getByLabel(/Rencana berikutnya/).fill(manual);
  await expect(dlg.getByText("Kosong = otomatis 2 hari kerja")).toHaveCount(0);
  await page.getByTestId("kirim-fu").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Follow-up tercatat" })).toBeVisible();
  expect(fuDb()).toBe(manual);
});
