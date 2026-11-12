// Password sementara dari owner → wajib ganti saat masuk; validasi; sesudahnya bebas memakai aplikasi.
import { expect, test } from "@playwright/test";

import { AKUN, SANDI, sqlLokal } from "./bantu";

const BARU = "Sandi-Baru-Uji-2026";

function pulihkanDodi() {
  // kembalikan password seed + tanda wajib ganti (DB lokal saja)
  sqlLokal(
    `update auth.users set encrypted_password = extensions.crypt('${SANDI}', extensions.gen_salt('bf')) where email = '${AKUN.dodi.email}';` +
      `update public.members set harus_ganti_password = false where id = ${AKUN.dodi.id};`,
  );
}

test.afterEach(() => pulihkanDodi());

test("wajib ganti password sebelum membuka layar lain", async ({ page }) => {
  sqlLokal(`update public.members set harus_ganti_password = true where id = ${AKUN.dodi.id}`);
  await page.goto("/saya");
  await page.locator("#email").fill(AKUN.dodi.email);
  await page.locator("#password").fill(SANDI);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/ganti-password\?lanjut=%2Fsaya$/);
  await expect(page.getByTestId("wajib-ganti")).toBeVisible();

  // layar lain tetap mengarah ke ganti password
  await page.goto("/jelajah");
  await expect(page).toHaveURL(/\/ganti-password\?lanjut=%2Fjelajah$/);

  await page.locator("#password-baru").fill("pendek");
  await page.locator("#password-ulang").fill("pendek");
  await page.getByRole("button", { name: "Simpan password" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Password minimal 8 karakter.");

  await page.locator("#password-baru").fill(BARU);
  await page.locator("#password-ulang").fill(`${BARU}x`);
  await page.getByRole("button", { name: "Simpan password" }).click();
  await expect(page.locator("main [role=alert]")).toHaveText("Kedua password tidak sama.");

  await page.locator("#password-ulang").fill(BARU);
  await page.getByRole("button", { name: "Simpan password" }).click();
  await expect(page).toHaveURL(/\/jelajah$/);
  expect(sqlLokal(`select harus_ganti_password from public.members where id = ${AKUN.dodi.id}`)).toBe("f");
});

test("ganti password dari menu (tidak wajib) bisa dibatalkan", async ({ page }) => {
  await page.goto("/masuk?lanjut=%2Fganti-password");
  await page.locator("#email").fill(AKUN.dodi.email);
  await page.locator("#password").fill(SANDI);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/ganti-password$/);
  await expect(page.getByTestId("wajib-ganti")).toHaveCount(0);
  await page.getByRole("link", { name: "Batal" }).click();
  await expect(page).toHaveURL(/\/saya$/);
});
