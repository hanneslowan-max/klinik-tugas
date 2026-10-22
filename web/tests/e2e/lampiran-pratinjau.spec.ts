// Pratinjau lampiran (22 Okt 2026): unggah PNG, PDF, DOCX, CSV (pemisah ';'), TXT, dan XLSX ke tugas app, lalu buka
// Lihat: gambar tampil, PDF di <iframe> (desktop; CSP frame-src Storage) atau tombol "Buka PDF" (HP), DOCX jadi HTML,
// CSV jadi tabel, TXT apa adanya, XLSX "belum tersedia". Lembar selalu punya tombol Unduh; nama berkas panjang tidak
// membuat halaman melebar di HP. Lampiran uji dihapus sesudahnya.
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, SEED, sqlLokal } from "./bantu";

const AWALAN = "uji-pratinjau";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEJMDGgAQBXmgIDwc3nxgAAAABJRU5ErkJggg==",
  "base64",
);

function bersihkan() {
  sqlLokal(`delete from public.attachments where task_id = '${SEED.tugasApp}' and title like '${AWALAN}%';`);
}

test.beforeEach(() => bersihkan());
test.afterEach(() => bersihkan());

const baris = (page: Page, nama: string) => page.locator("[data-lampiran]", { hasText: nama });

async function lihat(page: Page, nama: string) {
  await baris(page, nama).getByTestId("lihat-lampiran").click();
  const lembar = page.getByTestId("lembar-pratinjau");
  await expect(lembar).toBeVisible();
  await expect(lembar).toContainText(nama);
  await expect(lembar.getByTestId("unduh-lampiran")).toBeVisible();
  return lembar;
}

async function tutup(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("lembar-pratinjau")).toHaveCount(0);
}

test("Lihat lampiran: gambar, PDF, DOCX, CSV, TXT tampil tanpa unduh; XLSX belum bisa dipratinjau", async ({ page }) => {
  const galatCsp: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (frame|load|connect)/i.test(m.text())) galatCsp.push(m.text());
  });
  await masuk(page, AKUN.owner.email);
  await page.goto(`/t/${SEED.tugasApp}`);
  const contoh = (ext: string, mimeType: string) => ({
    name: `${AWALAN}.${ext}`,
    mimeType,
    buffer: readFileSync(path.join(__dirname, "berkas", `${AWALAN}.${ext}`)),
  });
  await page.getByTestId("input-lampiran").setInputFiles([
    { name: `${AWALAN}.png`, mimeType: "image/png", buffer: PNG_1PX },
    contoh("pdf", "application/pdf"),
    contoh("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    { name: `${AWALAN}.csv`, mimeType: "text/csv", buffer: Buffer.from("﻿nama;kota;nilai\nPT Uji Satu;Bekasi;1.500.000\n\"PT Dua; Tbk\";Bali;250\n") },
    { name: `${AWALAN}.txt`, mimeType: "text/plain", buffer: Buffer.from("Catatan uji pratinjau\nbaris kedua") },
    { name: `${AWALAN}-nama-berkas-yang-sangat-panjang-sekali-untuk-uji-tata-letak-baris.txt`, mimeType: "text/plain", buffer: Buffer.from("x") },
    {
      name: `${AWALAN}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("PK bukan excel sungguhan"),
    },
  ]);
  await expect(page.locator("[data-lampiran]", { hasText: AWALAN })).toHaveCount(7, { timeout: 20_000 });
  // nama berkas panjang terpotong "…", baris (thumbnail + Lihat + Unduh + Hapus) tidak melebar keluar layar
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // gambar: termuat (naturalWidth > 0) dari signed URL Storage
  let l = await lihat(page, `${AWALAN}.png`);
  const img = l.getByTestId("pratinjau-gambar");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  await tutup(page);

  // PDF: desktop di <iframe> (berkasnya benar-benar termuat, tidak diblokir), HP lewat penampil PDF bawaan
  // (tautan tanpa atribut download)
  const pdfTermuat = diHp(page)
    ? null
    : page.waitForResponse((r) => /\/storage\/v1\/object\/sign\/.*\.pdf\?token=/.test(r.url()) && r.request().resourceType() === "document");
  l = await lihat(page, `${AWALAN}.pdf`);
  if (diHp(page)) {
    const buka = l.getByTestId("buka-pdf");
    await expect(buka).toHaveAttribute("href", /\/storage\/v1\/object\/sign\//);
    await expect(buka).toHaveAttribute("target", "_blank");
    await expect(buka).not.toHaveAttribute("download", /.*/);
  } else {
    await expect(l.getByTestId("pratinjau-pdf")).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/.*\.pdf\?token=/);
    const res = await pdfTermuat!;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["content-disposition"] ?? "").not.toMatch(/attachment/);
  }
  await tutup(page);

  // DOCX → HTML tersaring
  l = await lihat(page, `${AWALAN}.docx`);
  const docx = l.getByTestId("pratinjau-docx");
  await expect(docx.locator("strong")).toHaveText("Penawaran Uji Pratinjau");
  await expect(docx).toContainText("Roda karet 4 inci, 20 unit.");
  await tutup(page);

  // CSV (Excel Indonesia: ';', BOM, kutip berisi ';') → tabel
  l = await lihat(page, `${AWALAN}.csv`);
  const tabel = l.getByTestId("pratinjau-tabel");
  await expect(tabel.locator("th")).toHaveText(["nama", "kota", "nilai"]);
  await expect(tabel.locator("tbody tr")).toHaveCount(2);
  await expect(tabel.locator("tbody tr").nth(1).locator("td")).toHaveText(["PT Dua; Tbk", "Bali", "250"]);
  await tutup(page);

  l = await lihat(page, `${AWALAN}.txt`);
  await expect(l.getByTestId("pratinjau-teks")).toHaveText("Catatan uji pratinjau\nbaris kedua");
  await tutup(page);

  l = await lihat(page, `${AWALAN}.xlsx`);
  await expect(l).toContainText("Pratinjau belum tersedia untuk berkas XLSX");
  await tutup(page);

  // ketuk nama berkas = Lihat
  await baris(page, `${AWALAN}.txt`).getByRole("button", { name: `Lihat ${AWALAN}.txt` }).click();
  await expect(page.getByTestId("pratinjau-teks")).toBeVisible();
  await tutup(page);

  expect(galatCsp).toEqual([]);
});
