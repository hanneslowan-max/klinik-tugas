import { describe, expect, it } from "vitest";

import { kalimatDuplikat, normalTelepon, rincianDuplikat, sisaDuplikat } from "@/features/pipeline/duplikat";
import type { CekDuplikatTelepon, LeadDuplikat } from "@/types/domain";

function lead(kode: string, sebagian: Partial<LeadDuplikat> = {}): LeadDuplikat {
  return {
    id: `ld${kode}`, kode, pelanggan: "-", tahap: "BARU", pemilik: null, pemilik_nama: null, kontak_nama: null,
    tanggal_masuk: "2026-10-02", dibuat_pada: "2026-10-02T03:00:00.000Z", ...sebagian,
  };
}

describe("normalTelepon (= public.pipeline_telp_norm + batas 8 digit)", () => {
  it("08… / 628… / +62 8… / spasi-strip-titik-kurung / 8… → 62…", () => {
    for (const s of ["081299001122", "6281299001122", "+62 812-9900-1122", " 0812 9900 1122 ", "+62.812.9900.1122",
      "(0812) 9900-1122", "81299001122"]) {
      expect(normalTelepon(s)).toBe("6281299001122");
    }
  });
  it("nomor pendek / kosong / tanpa digit → null (tidak dicek)", () => {
    for (const s of ["", null, undefined, "0812", "123456", "1234567", "belum ada nomor"]) expect(normalTelepon(s)).toBeNull();
  });
  it("tepat di batas: 0812345 (7 digit) → 62812345 (8 digit) dicek", () => {
    expect(normalTelepon("0812345")).toBe("62812345");
  });
  it("awalan lain dibiarkan (digit saja)", () => {
    expect(normalTelepon("+1 (415) 555-0100")).toBe("14155550100");
  });
});

describe("kalimat peringatan", () => {
  const satu: CekDuplikatTelepon = {
    telepon: "6281299001122", total: 1, items: [lead("L-00012", { tahap: "PENAWARAN", pemilik: 2, pemilik_nama: "riksa" })],
  };
  it("satu lead: format yang diminta", () => {
    expect(kalimatDuplikat(satu)).toBe("Nomor ini sudah ada di lead: L-00012 (PENAWARAN, PIC riksa) — cek dulu, jangan dobel.");
  });
  it("lead tanpa pemilik → PIC belum ada", () => {
    expect(rincianDuplikat(lead("L-1"))).toBe("(BARU, PIC belum ada)");
  });
  it("beberapa lead + sisa di luar 5 teratas", () => {
    const h: CekDuplikatTelepon = { telepon: "62857", total: 7, items: [lead("L-7"), lead("L-6", { pemilik_nama: "michael" })] };
    expect(sisaDuplikat(h)).toBe(5);
    expect(kalimatDuplikat(h)).toBe(
      "Nomor ini sudah ada di lead: L-7 (BARU, PIC belum ada), L-6 (BARU, PIC michael) dan 5 lainnya — cek dulu, jangan dobel.",
    );
  });
  it("tanpa cocok → null", () => {
    expect(kalimatDuplikat({ telepon: null, total: 0, items: [] })).toBeNull();
  });
});
