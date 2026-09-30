// Tugas Saya, Jelajah, Cari, Notifikasi, Sampah.
import { expect, test } from "@playwright/test";

import { AKUN, SEED, masuk, sqlLokal } from "./bantu";

test.describe("Tugas Saya", () => {
  test("kelompok due dan pilih anggota lain", async ({ page }) => {
    await masuk(page, AKUN.owner.email);
    await expect(page.getByText(/\(WIB\) · \d+ kartu terbuka/)).toBeVisible();
    await expect(page.locator("[data-grup]").first()).toBeVisible();

    await page.getByTestId("pilih-pemilik").click();
    await page.getByRole("option", { name: AKUN.citra.username }).click();
    await expect(page).toHaveURL(new RegExp(`/saya\\?m=${AKUN.citra.id}$`));
    await expect(page.getByTestId("judul-halaman")).toHaveText(`Tugas ${AKUN.citra.username}`);
    await expect(page.locator("[data-grup=telat] [data-uji=baris-tugas]").first()).toBeVisible();
  });
});

test.describe("Jelajah", () => {
  test("space → folder → list dengan hitungan; arsip bisa ditampilkan", async ({ page }) => {
    await masuk(page, AKUN.citra.email);
    await page.goto("/jelajah");
    const list = page.locator(`[data-list="${SEED.listClickUp}"]`);
    await expect(list).toContainText("Fase Uji 1");
    await expect(list).toContainText(/\d+ terbuka/);
    await page.getByRole("link", { name: "Tampilkan arsip" }).click();
    await expect(page).toHaveURL(/\/jelajah\?arsip=1$/);
    await list.click();
    await expect(page).toHaveURL(new RegExp(`/l/${SEED.listClickUp}`));
  });
});

test.describe("Cari", () => {
  test("kata kunci, URL tugas ClickUp, URL list ClickUp", async ({ page }) => {
    await masuk(page, AKUN.owner.email);
    await page.goto("/cari");
    await page.getByLabel("Kata kunci").fill("Latihan");
    await page.getByTestId("tombol-cari").click();
    await expect(page).toHaveURL(/\/cari\?q=Latihan$/);
    await expect(page.getByTestId("baris-tugas").first()).toBeVisible();

    await page.getByLabel("Kata kunci").fill(`https://app.clickup.com/t/${SEED.tugasClickUp}`);
    await page.getByTestId("tombol-cari").click();
    await expect(page).toHaveURL(new RegExp(`/t/${SEED.tugasClickUp}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/cari\?q=https/);

    await page.getByLabel("Kata kunci").fill(`https://app.clickup.com/1100340000004525/v/l/6-${SEED.listClickUp}-1`);
    await page.getByTestId("tombol-cari").click();
    await expect(page).toHaveURL(new RegExp(`/l/${SEED.listClickUp}$`));
  });
});

test.describe("Notifikasi", () => {
  test("membuka notifikasi menurunkan lonceng; tandai semua dibaca", async ({ page }) => {
    const belumAwal = sqlLokal(`select string_agg(id::text, ',') from public.notifications where member_id = ${AKUN.owner.id} and read_at is null`);
    try {
      await masuk(page, AKUN.owner.email);
      const lonceng = page.getByTestId("lonceng").first();
      await expect(lonceng).toHaveAttribute("aria-label", /2 belum dibaca/);
      await page.goto("/notif");
      const pertama = page.locator("[data-notif]").first();
      await expect(pertama).toContainText("baru");
      await pertama.locator("a").click();
      await expect(page).toHaveURL(/\/t\//);
      await expect(page.getByTestId("lonceng").first()).toHaveAttribute("aria-label", /1 belum dibaca/);
      await page.goto("/notif");
      await page.getByRole("button", { name: "Tandai semua dibaca" }).click();
      await expect(page.getByTestId("lonceng").first()).toHaveAttribute("aria-label", "Notifikasi");
    } finally {
      if (belumAwal) sqlLokal(`update public.notifications set read_at = null where id in (${belumAwal})`);
    }
  });
});

test.describe("Sampah", () => {
  test("owner melihat & memulihkan; anggota ditolak", async ({ page, browser }) => {
    try {
      await masuk(page, AKUN.owner.email);
      await page.goto("/sampah");
      const baris = page.locator(`[data-uji=daftar-sampah] [data-id="${SEED.tugasTerhapus}"]`);
      await expect(baris).toContainText("L4 · Latihan terhapus");
      await baris.getByRole("button", { name: "Pulihkan" }).click();
      await expect(baris).toHaveCount(0);
      expect(sqlLokal(`select deleted_at is null from public.tasks where id = '${SEED.tugasTerhapus}'`)).toBe("t");
    } finally {
      // kembalikan keadaan seed: tugas L4 ada di Sampah
      const uid = sqlLokal(`select auth_user_id from public.members where id = ${AKUN.owner.id}`);
      sqlLokal(
        `begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated;` +
          ` select public.web_hapus('${SEED.tugasTerhapus}'); commit;`,
      );
    }
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await masuk(p2, AKUN.citra.email);
    await p2.goto("/sampah");
    await expect(p2.getByTestId("khusus-owner")).toHaveText("Halaman Sampah khusus owner.");
    await ctx.close();
  });
});
