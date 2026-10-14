// Sidebar desktop bisa disembunyikan (permintaan Hannes 14 Okt): tombol di sidebar & di header, Ctrl+\, pilihan diingat
// lewat cookie dan sudah benar di HTML server (tanpa kedip). HP tidak terpengaruh (navigasi bawah).
import { expect, test, type BrowserContext } from "@playwright/test";

import { AKUN, diHp, masuk } from "./bantu";

const kuki = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === "anvil_sidebar")?.value;

test("desktop: sembunyikan & tampilkan sidebar, diingat sesudah muat ulang tanpa kedip", async ({ page, context }) => {
  test.skip(diHp(page), "sidebar hanya ada di desktop");
  await masuk(page, AKUN.owner.email);
  const sidebar = page.getByTestId("sidebar");
  const tampilkan = page.getByTestId("tampilkan-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(tampilkan).toHaveCount(0);

  await page.getByTestId("sembunyikan-sidebar").click();
  await expect(sidebar).toHaveAttribute("data-terbuka", "false");
  await expect(sidebar).toBeHidden();
  await expect(tampilkan).toBeVisible();
  await expect(tampilkan).toBeFocused(); // fokus pindah ke tombol pasangan (tombol yang diklik ikut tersembunyi)
  await expect.poll(async () => (await page.locator("main").boundingBox())?.x).toBeLessThan(5); // konten melebar penuh
  await expect(sidebar.getByRole("link", { name: "Jelajah" })).toBeHidden();
  expect(await kuki(context)).toBe("tutup");

  // HTML server sudah tertutup (bukan terbuka lalu menutup sesudah JS jalan)
  const html = await (await page.request.get("/saya")).text();
  expect(html).toMatch(/data-uji="sidebar"[^>]*data-terbuka="false"/);
  await page.reload();
  await expect(sidebar).toBeHidden();
  await expect(tampilkan).toBeVisible();

  // halaman lain juga punya tombol tampilkan
  await page.goto("/notif");
  await expect(tampilkan).toBeVisible();
  await tampilkan.click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId("sembunyikan-sidebar")).toBeFocused();
  await expect(tampilkan).toHaveCount(0);
  expect(await kuki(context)).toBe("buka");
});

test("desktop: pintasan Ctrl+\\ menyembunyikan & menampilkan", async ({ page }) => {
  test.skip(diHp(page), "sidebar hanya ada di desktop");
  await masuk(page, AKUN.owner.email);
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toBeVisible();
  await page.keyboard.press("Control+Backslash");
  await expect(sidebar).toBeHidden();
  await page.keyboard.press("Control+Backslash");
  await expect(sidebar).toBeVisible();
});

test("HP: tidak ada tombol sidebar (walau cookie tertutup), navigasi bawah tetap", async ({ page, context }) => {
  test.skip(!diHp(page), "khusus HP");
  await context.addCookies([{ name: "anvil_sidebar", value: "tutup", url: test.info().project.use.baseURL ?? "http://127.0.0.1:3000" }]);
  await masuk(page, AKUN.owner.email);
  await expect(page.getByTestId("tampilkan-sidebar")).toBeHidden();
  await expect(page.getByTestId("nav-bawah")).toBeVisible();
});
