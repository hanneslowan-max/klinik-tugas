// Pembantu tes end-to-end. Data uji = seed SINTETIS stack lokal (supabase/seed.sql). psql hanya ke DB LOKAL
// (127.0.0.1:54322) untuk menyiapkan/memulihkan keadaan; aplikasi sendiri tidak pernah memakai kunci service.
import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

export const SANDI = "rahasia-dev-123"; // seed.sql — dev lokal saja

export const AKUN = {
  owner: { email: "budi.uji@contoh.test", id: 100000001, username: "budi santoso" },
  citra: { email: "citra.uji@contoh.test", id: 100000002, username: "citra lestari" },
  dodi: { email: "dodi.uji@contoh.test", id: 100000003, username: "dodi pratama" },
  eka: { email: "eka.uji@contoh.test", id: 900000000001, username: "eka wulandari" },
} as const;

/** Data seed yang dipakai tes. */
export const SEED = {
  listApp: "rlujib0001", // "Latihan Uji" (sumber app, bisa diubah)
  listClickUp: "1100340000900101", // "Fase Uji 1" (sumber ClickUp, hanya-baca di mode cermin)
  tugasApp: "rtujib0001", // "L1 · Latihan tugas baru"
  tugasTerhapus: "rtujib0004", // "L4 · Latihan terhapus"
  tugasClickUp: "z8r3uj0001", // "Y7 · Uji ringkasan kampanye iklan"
} as const;

/** Jalankan SQL di DB lokal (keluaran baris-baris, -At). */
export function sqlLokal(sql: string): string {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: { ...process.env, PGPASSWORD: "postgres" },
    encoding: "utf8",
  }).trim();
}

export async function masuk(page: Page, email: string, sandi = SANDI, tujuan = /\/saya$/) {
  await page.goto("/masuk");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(sandi);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(tujuan);
}

export async function keluar(page: Page, hp: boolean) {
  if (hp) {
    await page.getByTestId("tombol-menu").click();
    await page.getByRole("dialog").getByTestId("keluar").click();
  } else {
    await page.locator("aside").getByTestId("keluar").click();
  }
  await expect(page).toHaveURL(/\/masuk/);
}

/** true bila proyek Playwright = HP (nav bawah, lembar bawah). */
export function diHp(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}
