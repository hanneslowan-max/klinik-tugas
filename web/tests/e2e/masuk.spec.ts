// Masuk / keluar / penjaga sesi / parameter lanjut / keamanan kredensial.
import { expect, test } from "@playwright/test";

import { AKUN, SANDI, SEED, diHp, keluar, masuk, sqlLokal } from "./bantu";

test("tanpa sesi diarahkan ke Masuk, lalu kembali ke tautan yang dituju", async ({ page }) => {
  await page.goto(`/cari?q=uji`);
  await expect(page).toHaveURL(/\/masuk\?lanjut=%2Fcari%3Fq%3Duji$/);
  await expect(page.getByRole("heading", { name: "Tugas RHJ" })).toBeVisible();
  await expect(page.getByText("Silakan masuk untuk melanjutkan.")).toBeVisible();

  await page.locator("#email").fill(AKUN.owner.email);
  await page.locator("#password").fill("password-salah");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Email atau password salah.");

  await page.locator("#password").fill(SANDI);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/cari\?q=uji$/);
});

test("login owner → Tugas Saya, lalu keluar menutup sesi", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await expect(page.getByTestId("judul-halaman")).toHaveText("Tugas Saya");
  await keluar(page, diHp(page));
  await page.goto("/saya");
  await expect(page).toHaveURL(/\/masuk\?lanjut=%2Fsaya$/);
});

test("sudah masuk: membuka /masuk langsung diteruskan", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/masuk?lanjut=${encodeURIComponent(`/l/${SEED.listApp}`)}`);
  await expect(page).toHaveURL(new RegExp(`/l/${SEED.listApp}$`));
});

test("parameter lanjut hanya menerima path internal", async ({ page }) => {
  for (const jahat of ["//contoh.test/curi", "https://contoh.test/curi", "/\\contoh.test"]) {
    await page.goto(`/masuk?lanjut=${encodeURIComponent(jahat)}`);
    await page.locator("#email").fill(AKUN.citra.email);
    await page.locator("#password").fill(SANDI);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/saya$/);
    await page.context().clearCookies();
  }
});

test("tanpa JavaScript, form masuk tidak pernah menaruh password di URL", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/masuk");
  await page.locator("#email").fill(AKUN.citra.email);
  await page.locator("#password").fill(SANDI);
  await page.locator("form button[type=submit]").click();
  await page.waitForLoadState();
  expect(page.url()).not.toContain(SANDI);
  expect(page.url()).not.toContain("password=");
  await ctx.close();
});

test("header keamanan: CSP ber-nonce, noindex, tanpa frame", async ({ request }) => {
  const r = await request.get("/masuk");
  expect(r.status()).toBe(200);
  const h = r.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-robots-tag"]).toContain("noindex");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-powered-by"]).toBeUndefined();
  const r2 = await request.get("/masuk");
  expect(r2.headers()["content-security-policy"]).not.toBe(h["content-security-policy"]); // nonce baru tiap permintaan
});

test("anggota nonaktif bisa login tetapi hanya melihat pesan", async ({ page }) => {
  sqlLokal(`update public.members set aktif = false where id = ${AKUN.dodi.id}`);
  try {
    await page.goto("/masuk");
    await page.locator("#email").fill(AKUN.dodi.email);
    await page.locator("#password").fill(SANDI);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page.getByTestId("akun-belum-aktif")).toHaveText("Akun Anda sedang nonaktif. Hubungi owner.");
    await expect(page.getByTestId("nav-bawah")).toHaveCount(0);
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/masuk/);
  } finally {
    sqlLokal(`update public.members set aktif = true where id = ${AKUN.dodi.id}`);
  }
});
