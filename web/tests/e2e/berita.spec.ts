// Modul Berita (7 Nov 2026, khusus owner): edisi kurasi tampil per tingkat skor dengan garis besar, saring wilayah,
// simpan / kurang relevan tersimpan di server, tab Semua (cari + sumber + status sumber), Tersimpan; anggota biasa tidak
// melihat menu dan halaman menolak. Data disiapkan lewat psql lokal (berita sintetis, URL contoh.test) dan dibersihkan.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const AWALAN = "https://berita.contoh.test/e2e-";

function bersihkan() {
  sqlLokal(
    `delete from public.berita_edisi where garis_besar like 'E2E%';` +
      ` delete from public.berita where url like '${AWALAN}%';`,
  );
}

/** 3 item mentah + 1 edisi berisi 3 pilihan (skor 5 dalam, 4 luar, 2 luar). Hasil: id pilihan skor 5. */
function siapkan(): string {
  bersihkan();
  sqlLokal(
    `insert into public.berita (sumber_id, url, judul, judul_kunci, cuplikan, terbit_at) values` +
      ` ('antara-ekonomi', '${AWALAN}1', 'E2E Tarif impor baja diperketat', public.berita_kunci('E2E Tarif impor baja diperketat'), 'Cuplikan baja', now() - interval '1 hour'),` +
      ` ('bbc-world', '${AWALAN}2', 'E2E Harga kontainer Asia turun', public.berita_kunci('E2E Harga kontainer Asia turun'), null, now() - interval '2 hours'),` +
      ` ('mining', '${AWALAN}3', 'E2E Nikel melemah pekan ini', public.berita_kunci('E2E Nikel melemah pekan ini'), null, null);`,
  );
  const ed = sqlLokal(
    `insert into public.berita_edisi (dibuat_oleh, garis_besar, pantau, kandidat) values (900000000002, 'E2E Garis besar hari ini', 'E2E Pantau rilis inflasi', 3) returning id`,
  );
  return sqlLokal(
    `insert into public.berita_pilihan (edisi_id, berita_id, urutan, url, judul, sumber, terbit_at, wilayah, kategori, skor, ringkasan, dampak, bahan_relasi)
     select ${ed}, b.id, v.urutan, b.url, b.judul, v.sumber, b.terbit_at, v.wilayah, v.kategori, v.skor, v.ringkasan, v.dampak, v.relasi
       from (values ('${AWALAN}1', 1, 'Antara', 'dalam', 'kebijakan', 5, 'Ringkasan baja', 'Dampak bahan baku roda', 'Tanya pemasok'),
                    ('${AWALAN}2', 2, 'BBC', 'luar', 'logistik', 4, 'Ringkasan kontainer', 'Dampak ongkos impor', null),
                    ('${AWALAN}3', 3, 'Mining.com', 'luar', 'komoditas', 2, 'Ringkasan nikel', 'Dampak harga baja tahan karat', null))
            as v(url, urutan, sumber, wilayah, kategori, skor, ringkasan, dampak, relasi)
       join public.berita b on b.url = v.url
     order by v.urutan
     returning id`,
  ).split("\n")[0];
}

test.afterEach(() => bersihkan());

async function tanpaGulirSamping(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

test("owner: edisi per tingkat, saring wilayah, simpan & kurang relevan tersimpan, tab Tersimpan", async ({ page }) => {
  const pid = siapkan();
  await masuk(page, AKUN.owner.email);
  const nav = diHp(page) ? page.getByTestId("nav-bawah") : page.getByTestId("sidebar");
  await nav.getByRole("link", { name: "Berita" }).click();
  await expect(page).toHaveURL(/\/berita$/);

  await expect(page.getByTestId("garis-besar")).toContainText("E2E Garis besar hari ini");
  await expect(page.getByTestId("garis-besar")).toContainText("E2E Pantau rilis inflasi");
  await expect(page.getByTestId("tingkat-wajib").getByTestId("kartu-berita")).toHaveCount(1);
  await expect(page.getByTestId("tingkat-penting").getByTestId("kartu-berita")).toHaveCount(1);
  await expect(page.getByTestId("tingkat-perlu").getByTestId("kartu-berita")).toHaveCount(1);
  const wajib = page.getByTestId("tingkat-wajib").getByTestId("kartu-berita");
  await expect(wajib).toContainText("Dampak bahan baku roda");
  await expect(wajib).toContainText("Tanya pemasok");
  await expect(wajib.getByTestId("judul-berita")).toHaveAttribute("href", `${AWALAN}1`);
  await expect(wajib.getByTestId("judul-berita")).toHaveAttribute("target", "_blank");
  await tanpaGulirSamping(page);

  // saring luar negeri → wajib (dalam negeri) hilang
  await page.getByTestId("saring-wilayah").getByRole("button", { name: /Luar negeri/ }).click();
  await expect(page).toHaveURL(/wilayah=luar/);
  await expect(page.getByTestId("tingkat-wajib")).toHaveCount(0);
  await expect(page.getByTestId("kartu-berita")).toHaveCount(2);
  await page.getByTestId("saring-wilayah").getByRole("button", { name: /^Semua/ }).click();

  // simpan + kurang relevan → tersimpan di server
  await wajib.getByTestId("simpan-berita").click();
  await expect(wajib.getByTestId("simpan-berita")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => sqlLokal(`select disimpan_at is not null from public.berita_tanda where pilihan_id = ${pid}`)).toBe("t");
  const penting = page.getByTestId("tingkat-penting").getByTestId("kartu-berita");
  await penting.getByTestId("kurang-berita").click();
  await expect(penting.getByTestId("kurang-berita")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("tab-berita-simpan").click();
  await expect(page).toHaveURL(/tab=simpan/);
  await expect(page.getByTestId("daftar-tersimpan").getByTestId("kartu-berita")).toHaveCount(1);
  await expect(page.getByTestId("daftar-tersimpan")).toContainText("E2E Tarif impor baja diperketat");
  await tanpaGulirSamping(page);
});

test("owner: tab Semua — cari kata, saring sumber, status sumber", async ({ page }) => {
  siapkan();
  await masuk(page, AKUN.owner.email);
  await page.goto("/berita?tab=semua");
  await page.getByTestId("cari-berita").fill("E2E kontainer");
  await expect(page).toHaveURL(/q=E2E(\+|%20)kontainer/);
  await expect(page.getByTestId("daftar-semua").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("daftar-semua")).toContainText("E2E Harga kontainer Asia turun");

  await page.getByTestId("cari-berita").fill("E2E");
  await expect(page.getByTestId("daftar-semua").locator("li")).toHaveCount(3);
  await page.getByTestId("pilih-sumber").click();
  await page.getByRole("option", { name: "Mining.com (logam & tambang)" }).click();
  await expect(page).toHaveURL(/sumber=mining/);
  await expect(page.getByTestId("daftar-semua").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("daftar-semua")).toContainText("masuk"); // tanpa tanggal terbit

  await page.getByTestId("status-sumber").click();
  await expect(page.getByText(/Status sumber \(\d+\)/)).toBeVisible();
  await tanpaGulirSamping(page);
});

test("anggota biasa: menu Berita tidak ada dan halaman khusus owner", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  const nav = diHp(page) ? page.getByTestId("nav-bawah") : page.getByTestId("sidebar");
  await expect(nav.getByRole("link", { name: "Pipeline" }).or(nav.getByRole("link", { name: "Cari" })).first()).toBeVisible();
  await expect(nav.getByRole("link", { name: "Berita" })).toHaveCount(0);
  await page.goto("/berita");
  await expect(page.getByTestId("khusus-owner")).toBeVisible();
  await expect(page.getByTestId("garis-besar")).toHaveCount(0);
});
