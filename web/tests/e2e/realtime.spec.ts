// Real-time: perubahan oleh anggota lain langsung tampil tanpa muat ulang (Supabase Realtime, postgres_changes).
// Perubahan "orang lain" disimulasikan dengan memanggil fungsi web_* sebagai owner (budi) lewat psql lokal — jalur
// yang sama dengan tombol di web, jadi trigger & Realtime berjalan seperti aslinya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, SEED, masuk, sqlLokal } from "./bantu";

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

function ubahSebagaiBudi(id: string, body: Record<string, unknown>) {
  const versi = sqlLokal(`select versi from public.tasks where id = '${id}'`);
  sebagaiBudi(`select public.web_ubah_tugas('${id}', '${JSON.stringify(body).replace(/'/g, "''")}'::jsonb, ${versi})`);
}

async function tungguTersambung(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.realtime), { timeout: 20_000 }).toBe("SUBSCRIBED");
}

test.describe.configure({ mode: "serial" });

test("status yang diubah anggota lain langsung pindah grup di List", async ({ page }) => {
  const awal = sqlLokal(`select status from public.tasks where id = '${SEED.tugasApp}'`);
  try {
    await masuk(page, AKUN.citra.email);
    await page.goto(`/l/${SEED.listApp}`);
    await tungguTersambung(page);
    const baris = page.locator(`[data-id="${SEED.tugasApp}"]`);
    await expect(baris).toBeVisible();

    ubahSebagaiBudi(SEED.tugasApp, { status: "in progress" });
    await expect(page.locator(`[data-status="in progress"] [data-id="${SEED.tugasApp}"], details[data-status="in progress"] [data-id="${SEED.tugasApp}"]`).first()).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    ubahSebagaiBudi(SEED.tugasApp, { status: awal });
  }
});

test("detail kartu ikut berubah; saat sedang mengedit, perubahan ditahan sampai selesai", async ({ page }) => {
  const namaAwal = sqlLokal(`select name from public.tasks where id = '${SEED.tugasApp}'`);
  try {
    await masuk(page, AKUN.citra.email);
    await page.goto(`/t/${SEED.tugasApp}`);
    await tungguTersambung(page);
    const judul = page.getByTestId("judul-tugas");
    await expect(judul).toContainText(namaAwal);

    ubahSebagaiBudi(SEED.tugasApp, { name: `${namaAwal} (real-time 1)` });
    await expect(judul).toContainText("(real-time 1)", { timeout: 15_000 });

    // mulai mengedit deskripsi → perubahan orang lain ditahan
    await page.getByTestId("desk-edit").click();
    await expect(page.getByTestId("desk-teks")).toBeVisible();
    ubahSebagaiBudi(SEED.tugasApp, { name: `${namaAwal} (real-time 2)` });
    await expect(page.getByText("Kartu ini baru diubah orang lain.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(judul).toContainText("(real-time 1)");

    // selesai mengedit → perubahan yang ditahan langsung dimuat
    await page.getByRole("button", { name: "Batal" }).first().click();
    await expect(judul).toContainText("(real-time 2)", { timeout: 15_000 });
  } finally {
    ubahSebagaiBudi(SEED.tugasApp, { name: namaAwal });
  }
});

test("lonceng notifikasi bertambah begitu anggota lain menyebut kita", async ({ page }) => {
  let komentar = "";
  try {
    await masuk(page, AKUN.citra.email);
    await tungguTersambung(page);
    const lonceng = page.getByTestId("lonceng").first();
    const label = (await lonceng.getAttribute("aria-label")) ?? "";
    const sebelum = Number(label.match(/(\d+) belum dibaca/)?.[1] ?? 0);

    komentar = sebagaiBudi(
      `select (public.web_komentar('${SEED.tugasApp}', '@${AKUN.citra.username} cek uji real-time', null, null))->>'id'`,
    );
    await expect(lonceng).toHaveAttribute("aria-label", `Notifikasi, ${sebelum + 1} belum dibaca`, { timeout: 15_000 });
  } finally {
    if (komentar) {
      sqlLokal(`delete from public.notifications where comment_id = '${komentar}'`);
      sebagaiBudi(`select public.web_komentar_hapus('${komentar}')`);
    }
  }
});
