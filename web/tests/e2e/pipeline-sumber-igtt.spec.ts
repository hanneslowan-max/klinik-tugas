// Pilihan Sumber "Instagram/TikTok organik" (21 Okt 2026, migrasi 20261021140000_pipeline_sumber_igtt): chip baru di form
// "Lead baru" tepat sesudah "Website organik" (kelompok kanal digital), teks bantu menyebut akun IG/TikTok Bu Lastri /
// "Halo Bu Lastri", dan lead tersimpan dengan sumber itu (diterima CHECK lead.sumber). Akses citra (rep) disiapkan lewat psql.
import { expect, test } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const AWALAN = "PT Uji Sumber IGTT";

function bersihkan() {
  sqlLokal(
    `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama like '${AWALAN}%');` +
      ` delete from public.pelanggan where nama like '${AWALAN}%';` +
      ` delete from public.pipeline_akses where member_id = ${AKUN.citra.id};`,
  );
}

test.beforeEach(() => {
  bersihkan();
  sqlLokal(`insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG');`);
});

test.afterEach(() => bersihkan());

test("Lead baru: chip Instagram/TikTok organik sesudah Website organik, tersimpan sebagai sumber", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByTestId("tombol-lead-baru").filter({ visible: true }).click();
  const dlg = page.getByTestId("dialog-lead-baru");
  await expect(dlg).toBeVisible();

  const grupSumber = dlg.getByRole("group", { name: "Sumber lead" });
  await expect(grupSumber.getByRole("button")).toHaveText([
    "Google Ads", "Meta Ads", "Website organik", "Instagram/TikTok organik",
    "WA langsung", "Telepon", "Referral", "Repeat order", "Lainnya",
  ]);
  await expect(dlg.getByText(/akun Instagram\/TikTok Bu Lastri atau sapaan "Halo Bu Lastri" = Instagram\/TikTok organik/)).toBeVisible();

  const nama = `${AWALAN} ${Date.now()}`;
  await page.getByTestId("lb-nama").fill(nama);
  await dlg.getByRole("group", { name: "Produk" }).getByRole("button", { name: "Pallet Mesh" }).click();
  await dlg.getByLabel("Qty Pallet Mesh").fill("5");
  const chip = grupSumber.getByRole("button", { name: "Instagram/TikTok organik" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("kirim-lead-baru").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Lead L-\d+ dibuat/ })).toBeVisible();

  expect(
    sqlLokal(`select l.sumber from public.lead l join public.pelanggan p on p.id = l.pelanggan_id where p.nama = '${nama}'`),
  ).toBe("Instagram/TikTok organik");
});
