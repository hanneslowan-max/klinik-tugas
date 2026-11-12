import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BANTU_SUMBER, SUMBER } from "@/features/pipeline/konstanta";

// Daftar Sumber lead tinggal di 4 tempat: CHECK lead.sumber (migrasi terbaru yang menggantinya), SUMBER (urutan chip
// web), tipe SumberLead, dan SUMBER_SAH alat impor. Tes ini menjaga web, DB, dan alat impor tetap sama (tipe dijaga
// typecheck: SUMBER bertipe SumberLead[]). Pilihan baru 21 Okt: "Instagram/TikTok organik" (20261021140000).

const AKAR = path.resolve(__dirname, "../../../..");
const MIGRASI = path.join(AKAR, "supabase/migrations/20261021140000_pipeline_sumber_igtt.sql");
const ALAT_IMPOR = path.join(AKAR, "alat/impor-pipeline.mjs");

/** Ambil isi literal '…' / "…" dari potongan teks. */
const literal = (teks: string) => [...teks.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);

describe("SUMBER (pilihan Sumber lead)", () => {
  it("memuat Instagram/TikTok organik, di kelompok kanal digital sesudah Website organik", () => {
    expect(SUMBER).toEqual([
      "Google Ads", "Meta Ads", "Website organik", "Instagram/TikTok organik",
      "WA langsung", "Telepon", "Referral", "Repeat order", "Lainnya",
    ]);
    expect(new Set(SUMBER).size).toBe(SUMBER.length);
  });

  it("sama persis dengan CHECK lead.sumber di migrasi 20261021140000", () => {
    const sql = readFileSync(MIGRASI, "utf8");
    const cek = sql.match(/add constraint lead_sumber_check check \(sumber in \(([\s\S]*?)\)\)/);
    expect(cek).not.toBeNull();
    expect(literal(cek![1])).toEqual(SUMBER);
  });

  it("sama persis dengan SUMBER_SAH alat impor", () => {
    const js = readFileSync(ALAT_IMPOR, "utf8");
    const baris = js.match(/export const SUMBER_SAH = \[([^\]]*)\]/);
    expect(baris).not.toBeNull();
    expect(literal(baris![1])).toEqual(SUMBER);
  });

  it("teks bantu menjelaskan organik IG/TikTok Bu Lastri vs iklan Meta", () => {
    expect(BANTU_SUMBER).toContain("Halo Bu Lastri");
    expect(BANTU_SUMBER).toContain("= Instagram/TikTok organik");
    expect(BANTU_SUMBER).toContain("iklan Instagram/Facebook = Meta Ads");
  });
});
