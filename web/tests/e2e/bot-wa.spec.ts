// Halaman Bot WA (11 Nov 2026, khusus owner): ringkasan + saklar (konfirmasi), daftar keputusan dengan teks bot lengkap
// tanpa nomor telepon, fakta & contoh balasan (simpan lewat Edge /x/admin/wa-pengetahuan, validator bot). Anggota biasa
// ditolak. Data disiapkan lewat psql lokal (log sintetis, nomor tiruan 62812000005xx) dan dibersihkan.
// Bagian simpan pengetahuan butuh Edge lokal (`supabase functions serve --env-file uji/wa/serve.env`).
import { expect, test } from "@playwright/test";

import { AKUN, masuk, sqlLokal } from "./bantu";

const TEKS_BOT = "Selamat malam Bapak/Ibu, sales kami membalas besok pagi. Boleh info ukuran troli? (E2E)";

function bersihkan() {
  sqlLokal(
    `delete from wa.log where id_pesan like 'wamid.e2e.%' or alasan like 'saklar % oleh %';` +
      ` delete from wa.antrean where percakapan = 'conv_e2e_1';` +
      ` delete from wa.pengetahuan where situasi like 'E2E%' or teks like 'E2E%';` +
      ` update wa.pengaturan set saklar = 'mati', saklar_alasan = 'awal';`,
  );
}

function siapkan() {
  bersihkan();
  sqlLokal(
    `insert into wa.antrean (nomor, percakapan, periode, pesan_pertama_pada, pesan_terakhir_pada, tempo_dasar, jatuh_tempo, status)` +
      ` values ('6281200000501', 'conv_e2e_1', current_date + 1, now() - interval '1 hour', now() - interval '1 hour', now(), now(), 'selesai');` +
      ` insert into wa.log (waktu, arah, keputusan, alasan, nomor_hash, id_pesan, antrean_id, teks_bot, token_masuk, token_keluar, biaya_usd, model)` +
      ` select now() - interval '5 minutes', 'keluar_bot', 'kirim', 'tanya ukuran', repeat('cd', 32), 'wamid.e2e.1', a.id,` +
      ` '${TEKS_BOT}', 1100, 90, 0.0031, 'claude-sonnet-5-5' from wa.antrean a where a.percakapan = 'conv_e2e_1';` +
      ` insert into wa.log (waktu, arah, keputusan, alasan, nomor_hash, id_pesan) values` +
      ` (now() - interval '6 minutes', 'masuk', 'catat', null, repeat('cd', 32), 'wamid.e2e.0'),` +
      ` (now() - interval '4 minutes', 'sistem', 'diam', 'manusia_saja', repeat('ef', 32), 'wamid.e2e.2');`,
  );
}

test.afterEach(() => bersihkan());

test("owner: ringkasan, saklar dengan konfirmasi, keputusan + teks bot, fakta & contoh", async ({ page }, info) => {
  siapkan();
  await masuk(page, AKUN.owner.email);
  await page.goto("/bot-wa");
  await expect(page.getByTestId("status-saklar")).toHaveText("Bot mati");
  await page.screenshot({ path: info.outputPath(`bot-wa-ringkasan-${info.project.name}.png`), fullPage: true });

  // saklar: konfirmasi → nyala → matikan lagi
  await page.getByTestId("tombol-saklar").click();
  await page.getByRole("button", { name: "Nyalakan", exact: true }).last().click();
  await expect(page.getByTestId("status-saklar")).toHaveText("Bot menyala");
  expect(sqlLokal("select saklar from wa.pengaturan")).toBe("kirim");
  await page.getByTestId("tombol-saklar").click();
  await page.getByRole("button", { name: "Matikan", exact: true }).last().click();
  await expect(page.getByTestId("status-saklar")).toHaveText("Bot mati");
  expect(sqlLokal("select saklar from wa.pengaturan")).toBe("mati");

  // keputusan: teks bot lengkap, catatan webhook tersembunyi di saringan bawaan, tanpa nomor telepon
  await page.getByTestId("tab-bot-keputusan").click();
  await expect(page.getByText(TEKS_BOT)).toBeVisible();
  await expect(page.getByText("Topik khusus sales (kata kunci)")).toBeVisible();
  await expect(page.getByTestId("baris-keputusan").filter({ hasText: "Pesan masuk" })).toHaveCount(0);
  expect(await page.content()).not.toContain("6281200000501");
  await page.screenshot({ path: info.outputPath(`bot-wa-keputusan-${info.project.name}.png`), fullPage: true });
  await page.getByTestId("saring-keputusan").getByRole("button", { name: "Catatan webhook" }).click();
  await expect(page.getByTestId("baris-keputusan").filter({ hasText: "Pesan masuk" }).first()).toBeVisible();

  // pengetahuan: fakta isi awal tampil; contoh berisi janji kirim ditolak validator; contoh sah tersimpan
  await page.getByTestId("tab-bot-pengetahuan").click();
  await expect(page.getByTestId("baris-fakta").filter({ hasText: "Lemari arsip TIDAK bisa custom." })).toBeVisible();
  await page.getByTestId("tambah-contoh").click();
  await page.locator("#situasi-bot").fill("E2E pelanggan tanya troli");
  await page.locator("#teks-bot").fill("E2E Siap, bisa dikirim besok.");
  await page.getByTestId("simpan-pengetahuan").click();
  await expect(page.getByText(/Ditolak validator bot: menjanjikan waktu\/tanggal kirim/)).toBeVisible();
  await page.locator("#teks-bot").fill("E2E Baik Bapak/Ibu, troli untuk barang apa dan bebannya berapa kg?");
  await page.getByTestId("simpan-pengetahuan").click();
  await expect(page.getByTestId("baris-contoh").filter({ hasText: "E2E pelanggan tanya troli" })).toBeVisible();
  expect(sqlLokal("select oleh from wa.pengetahuan where situasi = 'E2E pelanggan tanya troli'")).toBe(String(AKUN.owner.id));
  await page.screenshot({ path: info.outputPath(`bot-wa-pengetahuan-${info.project.name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("anggota biasa: halaman Bot WA ditolak", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/bot-wa");
  await expect(page.getByTestId("khusus-owner")).toBeVisible();
});
