// Kartu "Klik iklan → order" di layar Ringkasan Pipeline (migrasi 20261108120000_iklan_klik, web_iklan_ringkas):
// admin/baca melihat klik tercatat 7/30 hari per domain, kode yang muncul di lead, order + nilai, isi CSV unggah, dan
// gbraid/wbraid yang belum ikut CSV. Data klik & lead disiapkan lewat psql lokal (penerima klik Edge diuji di
// uji/iklan/kontrak.mjs).
import { expect, test } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const PELANGGAN = "PT Uji Klik Iklan E2E";

function bersihkan() {
  sqlLokal(
    `select set_config('app.sumber_bukti_tulis', 'ya', false);` +
      ` delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
      ` delete from public.pelanggan where nama = '${PELANGGAN}';` +
      ` delete from public.iklan_klik; delete from public.pipeline_akses where member_id = ${AKUN.dodi.id};`,
  );
}

test.beforeEach(() => {
  bersihkan();
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran) values (${AKUN.dodi.id}, 'baca');` +
      ` insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain) values` +
      ` ('GA-RH-E2E1', 'Cj0KCQiAe2e_rh_00001', 'gclid', now() - interval '2 days', 'rodahammerindo.com'),` +
      ` ('GA-RH-E2E2', 'Cj0KCQiAe2e_rh_00002', 'gclid', now() - interval '12 days', 'rodahammerindo.com'),` +
      ` ('GA-OY-E2E3', 'gbraid_e2e_oy_00003', 'gbraid', now() - interval '3 days', 'palletmeshindonesia.com');` +
      ` select set_config('app.sumber', 'ui', false), set_config('app.actor_id', '${AKUN.owner.id}', false),` +
      ` set_config('app.sumber_bukti_tulis', 'ya', false);` +
      ` insert into public.pelanggan (id, nama, kota) values ('plujie2eikl', '${PELANGGAN}', 'Surabaya');` +
      ` insert into public.lead (id, pelanggan_id, sumber, tahap, no_sp, tanggal_sp, nilai_transaksi, sumber_bukti, sumber_bukti_kode, sumber_bukti_diisi_pada)` +
      ` values ('ldujie2eikl1', 'plujie2eikl', 'Google Ads', 'ORDER', '9601/E2E/XI/2026', public.hari_ini_wib() - 1, 2972370, 'ga-rh', 'GA-RH-E2E1', now()),` +
      ` ('ldujie2eikl2', 'plujie2eikl', 'Google Ads', 'BARU', null, null, null, 'ga-rh', 'GA-RH-E2E2', now());`,
  );
});

test.afterEach(() => bersihkan());

test("ringkasan: kartu klik iklan per domain + isi CSV unggah (peran baca)", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto("/pipeline/ringkasan");
  const kartu = page.getByTestId("kartu-klik-iklan");
  await expect(kartu).toBeVisible();
  const rh = kartu.locator("div.rounded-xl", { hasText: "rodahammerindo.com" });
  // 7 hari: E2E1 (order); 30 hari: E2E1 + E2E2 (BARU)
  await expect(rh).toContainText("7 hari1 klik1 di lead (100%)1 orderRp2.972.370");
  await expect(rh).toContainText("30 hari2 klik2 di lead (100%)1 orderRp2.972.370");
  await expect(kartu.locator("div.rounded-xl", { hasText: "palletmeshindonesia.com" })).toContainText("7 hari1 klik0 di lead (0%)0 order");
  await expect(kartu).toContainText("CSV unggah Google Ads saat ini: 1 order (Rp2.972.370)");
  await expect(kartu).toContainText("gbraid/wbraid (iOS) 30 hari: 1 klik");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
