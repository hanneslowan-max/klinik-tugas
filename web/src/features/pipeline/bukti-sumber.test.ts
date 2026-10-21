import { describe, expect, it } from "vitest";

import { BUKTI_SUMBER, teksBuktiSumber } from "@/features/pipeline/konstanta";
import { fmtWaktu } from "@/lib/tanggal";
import type { KelasBuktiSumber } from "@/types/domain";

// Bukti sumber dari chat WA (agent, 20261021120000): baris hanya-baca di detail lead.
const KOSONG = { sumber_bukti: null, sumber_bukti_kode: null, sumber_bukti_chat_pada: null };

describe("teksBuktiSumber", () => {
  it("tanpa bukti → null (baris tidak ditampilkan)", () => {
    expect(teksBuktiSumber(KOSONG)).toBeNull();
  });
  it("kelas + waktu chat WIB", () => {
    const iso = "2026-10-16T03:32:00.000Z";
    const teks = teksBuktiSumber({ ...KOSONG, sumber_bukti: "situs-rh", sumber_bukti_chat_pada: iso });
    expect(teks).toBe(`Form situs RH · chat ${fmtWaktu(iso)}`);
    expect(teks).toMatch(/16 Okt 2026.*10\.32 WIB$/);
  });
  it("kode tampil dalam kurung; tanpa waktu chat tidak ada bagian chat", () => {
    expect(teksBuktiSumber({ ...KOSONG, sumber_bukti: "ga-oy", sumber_bukti_kode: "GA-OY-7K3F" })).toBe(
      "Google Ads · situs OYAMA (GA-OY-7K3F)",
    );
    expect(teksBuktiSumber({ ...KOSONG, sumber_bukti: "meta", sumber_bukti_kode: "PM-06" })).toBe("Iklan Meta (PM-06)");
  });
  it("kelas baru dari server yang belum dikenal web → kode kelas apa adanya", () => {
    expect(teksBuktiSumber({ ...KOSONG, sumber_bukti: "tiktok" as KelasBuktiSumber })).toBe("tiktok");
  });
});

describe("BUKTI_SUMBER", () => {
  it("label untuk setiap kelas allowlist DB (pipeline_sumber_bukti_kelas, urutan sama)", () => {
    expect(Object.keys(BUKTI_SUMBER)).toEqual([
      "situs-rh", "situs-oy", "web-rh", "ga-rh", "web-oy", "ga-oy", "meta",
      "lastri", "katalog-wa", "xs-pm", "tidur", "tanpa-sinyal",
    ]);
    expect(Object.values(BUKTI_SUMBER).every((l) => l.trim().length > 0)).toBe(true);
  });
});
