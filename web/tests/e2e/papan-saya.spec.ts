// Papan Tugas Saya: tombol Daftar↔Papan, kolom per tenggat, dan seret kartu antar kolom mengubah tenggat
// (web_ubah_tugas). "Perubahan orang lain" / penyiapan data dilakukan sebagai owner (budi) lewat psql lokal — jalur
// yang sama dengan tombol di web, jadi trigger berjalan seperti aslinya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

function sebagaiBudi(sql: string): string {
  const uid = sqlLokal(`select auth_user_id from public.members where id = ${AKUN.owner.id}`);
  return sqlLokal(
    `begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated; ` +
      `${sql}; commit;`,
  )
    .split("\n")
    .filter((b) => b && b !== "BEGIN" && b !== "COMMIT")
    .pop() as string;
}

/** Buat kartu app (list "Latihan Uji") milik citra, due hari ini WIB; kembalikan id-nya. */
function buatKartuCitra(nama: string): string {
  const hariIni = sqlLokal(`select (now() at time zone 'Asia/Jakarta')::date`);
  const body = JSON.stringify({ name: nama, assignees: [AKUN.citra.id], due: hariIni }).replace(/'/g, "''");
  return sebagaiBudi(`select (public.web_buat_tugas('rlujib0001', '${body}'::jsonb))->>'id'`);
}

async function seret(page: Page, id: string, keKolom: string) {
  const kartu = page.locator(`[data-uji="papan-saya"] [data-id="${id}"]`);
  const kolom = page.locator(`[data-kolom="${keKolom}"]`);
  await expect(kartu).toBeVisible();
  const a = await kartu.boundingBox();
  const b = await kolom.boundingBox();
  if (!a || !b) throw new Error("boundingBox kosong");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 }); // > jarak aktivasi (5px)
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 90), { steps: 14 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 90), { steps: 4 });
  await page.mouse.up();
}

test("tombol Daftar↔Papan menampilkan kolom per tenggat", async ({ page }) => {
  const id = buatKartuCitra("Papan · kartu uji kolom");
  try {
    await masuk(page, AKUN.citra.email);
    await page.getByTestId("tab-board").click();
    await expect(page).toHaveURL(/\/saya\?v=board/);
    await expect(page.getByTestId("papan-saya")).toBeVisible();
    for (const k of ["telat", "hari_ini", "tiga_hk", "nanti", "tanpa_due"]) {
      await expect(page.locator(`[data-kolom="${k}"]`)).toBeVisible();
    }
    // kartu due hari ini ada di kolom "Hari ini"
    await expect(page.locator(`[data-kolom="hari_ini"] [data-id="${id}"]`)).toBeVisible();
  } finally {
    sebagaiBudi(`select public.web_hapus('${id}')`);
  }
});

test("seret kartu ke 'Tanpa due' menghapus tenggatnya", async ({ page }) => {
  test.skip(diHp(page), "seret diuji di desktop (mouse); HP memakai tekan-tahan");
  const id = buatKartuCitra("Papan · kartu uji seret");
  try {
    await masuk(page, AKUN.citra.email);
    await page.goto("/saya?v=board");
    await expect(page.locator(`[data-kolom="hari_ini"] [data-id="${id}"]`)).toBeVisible();

    await seret(page, id, "tanpa_due");

    // pindah kolom di layar …
    await expect(page.locator(`[data-kolom="tanpa_due"] [data-id="${id}"]`)).toBeVisible({ timeout: 15_000 });
    // … dan tenggat benar-benar terhapus di basis data
    await expect.poll(() => sqlLokal(`select coalesce(due_wib::text,'(null)') from public.tasks where id = '${id}'`), {
      timeout: 15_000,
    }).toBe("(null)");
  } finally {
    sebagaiBudi(`select public.web_hapus('${id}')`);
  }
});
