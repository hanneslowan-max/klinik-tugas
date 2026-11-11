import { describe, expect, it } from "vitest";

import { bacaSaringAsal, labelRentangAsal, labelSaringAsal, rentangAsal, sebelumBukti, tautanAsal, type SaringAsal } from "./asal-situs";
import { ASAL_SITUS, BUKTI_SEJAK } from "./konstanta";

const sp = (href: string) => new URL(href, "http://x").searchParams;

describe("rentang kartu asal lead", () => {
  it("bulan berjalan = tgl 1 s/d hari ini; bulan selesai = sebulan penuh", () => {
    expect(rentangAsal("bulan", "2026-11", "2026-11-11")).toEqual({ sejak: "2026-11-01", sampai: "2026-11-11" });
    expect(rentangAsal("bulan", "2026-10", "2026-11-11")).toEqual({ sejak: "2026-10-01", sampai: "2026-10-31" });
    expect(rentangAsal("bulan", "2026-02", "2026-11-11")).toEqual({ sejak: "2026-02-01", sampai: "2026-02-28" });
  });
  it("sejak bukti dicatat = 21 Okt 2026 s/d hari ini (cek manual 11 Nov)", () => {
    expect(BUKTI_SEJAK).toBe("2026-10-21");
    expect(rentangAsal("bukti", "2026-09", "2026-11-11")).toEqual({ sejak: "2026-10-21", sampai: "2026-11-11" });
  });
  it("rentang sebelum bukti dicatat ditandai", () => {
    expect(sebelumBukti("2026-09-30")).toBe(true);
    expect(sebelumBukti("2026-10-21")).toBe(false);
    expect(sebelumBukti("2026-10-31")).toBe(false);
  });
  it("label rentang", () => {
    expect(labelRentangAsal("2026-10-21", "2026-11-11")).toBe("21 Okt–11 Nov 2026");
    expect(labelRentangAsal("2026-09-01", "2026-09-30")).toBe("1–30 Sep 2026");
    expect(labelRentangAsal("2026-10-21", "2026-10-21")).toBe("21 Okt 2026");
    expect(labelRentangAsal("2025-12-20", "2026-01-05")).toBe("20 Des 2025–5 Jan 2026");
  });
});

describe("tautan angka asal → daftar lead", () => {
  const dasar: SaringAsal = { kelompok: "situs_rh", jalur: null, produk: "Pallet Mesh", sejak: "2026-10-21", sampai: "2026-11-11" };
  it("kelompok + produk + rentang; tidak memakai ?produk/?dari/?sampai saringan daftar", () => {
    const u = tautanAsal(dasar);
    expect(u).toBe("/pipeline?kes=asal_situs&ka=situs_rh&kpr=Pallet+Mesh&kd=2026-10-21&ks=2026-11-11");
    const p = sp(u);
    for (const k of ["produk", "dari", "sampai", "kb", "kp"]) expect(p.has(k)).toBe(false);
  });
  it("jalur hanya untuk kelompok situs; total = semua asal tanpa ka", () => {
    expect(sp(tautanAsal({ ...dasar, jalur: "google_ads" })).get("kj")).toBe("google_ads");
    expect(sp(tautanAsal({ ...dasar, kelompok: "meta", jalur: "organik" })).has("kj")).toBe(false);
    const semua = sp(tautanAsal({ ...dasar, kelompok: "semua", produk: null }));
    expect(semua.has("ka")).toBe(false);
    expect(semua.has("kpr")).toBe(false);
  });
  it("bolak-balik: baca kembali = saringan asal", () => {
    for (const k of [...(Object.keys(ASAL_SITUS) as SaringAsal["kelompok"][]), "semua" as const]) {
      const s = { ...dasar, kelompok: k, jalur: k === "situs_oy" ? ("organik" as const) : null };
      expect(bacaSaringAsal(sp(tautanAsal(s)))).toEqual(s);
    }
  });
  it("parameter tidak sah dibuang", () => {
    expect(bacaSaringAsal(sp("/pipeline?kes=asal_situs&ka=situs-rh&kj=organik&kpr=Kursi&kd=2026-13-01&ks=kemarin"))).toEqual({
      kelompok: "semua",
      jalur: null,
      produk: null,
      sejak: "",
      sampai: "",
    });
    expect(bacaSaringAsal(sp("/pipeline?kes=asal_situs&ka=meta&kj=google_ads")).jalur).toBeNull();
  });
  it("label spanduk daftar", () => {
    expect(labelSaringAsal({ ...dasar, jalur: "google_ads" })).toBe("Situs Hammerindo · Google Ads · Pallet Mesh · 21 Okt–11 Nov 2026");
    expect(labelSaringAsal({ kelompok: "semua", jalur: null, produk: null, sejak: "", sampai: "" })).toBe("Semua asal · Semua produk");
  });
});
