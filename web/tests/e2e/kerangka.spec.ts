// Kerangka: navigasi HP vs desktop, menu owner/anggota, ukuran sentuh, tanpa gulir samping, PWA.
import { expect, test } from "@playwright/test";

import { AKUN, diHp, masuk } from "./bantu";

test("navigasi sesuai perangkat; Admin & Sampah hanya untuk owner", async ({ page, browser }) => {
  await masuk(page, AKUN.owner.email);
  if (diHp(page)) {
    await expect(page.getByTestId("nav-bawah")).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
    await page.getByTestId("tombol-menu").click();
    await expect(page.getByTestId("menu-admin")).toBeVisible();
    await expect(page.getByTestId("menu-sampah")).toBeVisible();
  } else {
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByTestId("nav-bawah")).toBeHidden();
    await expect(page.locator("aside").getByRole("link", { name: "Admin" })).toBeVisible();
  }

  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const p2 = await ctx.newPage();
  await masuk(p2, AKUN.citra.email);
  if (diHp(p2)) {
    await p2.getByTestId("tombol-menu").click();
    await expect(p2.getByTestId("menu-notif")).toBeVisible();
    await expect(p2.getByTestId("menu-admin")).toHaveCount(0);
  } else {
    await expect(p2.locator("aside").getByRole("link", { name: "Admin" })).toHaveCount(0);
  }
  await ctx.close();
});

test("HP 360px: tanpa gulir samping dan target sentuh ≥ 44px", async ({ page }) => {
  test.skip(!diHp(page), "khusus layar sentuh");
  await page.setViewportSize({ width: 360, height: 780 });
  await masuk(page, AKUN.owner.email);
  for (const path of ["/saya", "/jelajah", "/cari", "/notif"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const lebar = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(lebar, `gulir samping di ${path}`).toBeLessThanOrEqual(360);
    const kecil = await page.$$eval('main button, main a, main [role="combobox"], nav a, nav button, header a, header button', (els) =>
      els
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
        })
        .map((e) => ({ teks: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30), t: e.getBoundingClientRect().height }))
        .filter((x) => x.t < 43.5),
    );
    expect(kecil, `target sentuh < 44px di ${path}`).toEqual([]);
  }
});

test("manifest & service worker tersedia", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  const isi = await m.json();
  expect(isi.name).toBe("Tugas RHJ");
  expect(isi.start_url).toBe("/saya");
  for (const ikon of isi.icons) expect((await request.get(ikon.src)).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
});
