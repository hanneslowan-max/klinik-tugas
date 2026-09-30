import { describe, expect, it } from "vitest";

import { hariKerja, infoDue, kategoriDue, peringatanTanggal, selisihHari, tambahHari, tanggalWib } from "@/lib/tanggal";
import { lanjutAman, pecahUrl, ukuranBerkas, urlAman } from "@/lib/teks";

describe("tanggal WIB", () => {
  it("memakai zona Asia/Jakarta", () => {
    expect(tanggalWib("2026-09-29T17:30:00Z")).toBe("2026-09-30"); // 00:30 WIB
    expect(tanggalWib("2026-09-29T16:59:59Z")).toBe("2026-09-29");
  });
  it("tambahHari & selisihHari", () => {
    expect(tambahHari("2026-12-31", 1)).toBe("2027-01-01");
    expect(selisihHari("2026-09-27", "2026-09-30")).toBe(3);
  });
});

describe("hariKerja (sama dengan SQL hari_kerja)", () => {
  const libur = new Set(["2026-10-01"]);
  it("Senin–Jumat, a < d ≤ b", () => {
    expect(hariKerja("2026-09-30", "2026-10-05")).toBe(3); // Kam, Jum, Sen
  });
  it("mengurangi hari libur", () => {
    expect(hariKerja("2026-09-30", "2026-10-05", libur)).toBe(2);
  });
  it("negatif bila b < a", () => {
    expect(hariKerja("2026-10-05", "2026-09-30")).toBe(-3);
  });
});

describe("kategoriDue", () => {
  const hi = "2026-09-30";
  it("telat / hari_ini / tiga_hk / nanti / tanpa_due / selesai", () => {
    expect(kategoriDue({ selesai: false, due_wib: "2026-09-29" }, hi)).toBe("telat");
    expect(kategoriDue({ selesai: false, due_wib: hi }, hi)).toBe("hari_ini");
    expect(kategoriDue({ selesai: false, due_wib: "2026-10-05" }, hi)).toBe("tiga_hk");
    expect(kategoriDue({ selesai: false, due_wib: "2026-10-06" }, hi)).toBe("nanti");
    expect(kategoriDue({ selesai: false, due_wib: null }, hi)).toBe("tanpa_due");
    expect(kategoriDue({ selesai: true, due_wib: "2026-09-01" }, hi)).toBeNull();
  });
  it("teks chip", () => {
    const dasar = { selesai: false, due_at: null, due_has_time: false };
    expect(infoDue({ ...dasar, due_wib: "2026-09-27" }, hi)?.teks).toMatch(/telat 3 hr$/);
    expect(infoDue({ ...dasar, due_wib: hi }, hi)?.teks).toBe("Hari ini");
    expect(infoDue({ ...dasar, due_wib: "2026-10-02" }, hi)?.teks).toMatch(/sisa 2 hk$/);
    expect(infoDue({ ...dasar, due_wib: null }, hi)).toBeNull();
  });
  it("peringatan akhir pekan & libur", () => {
    expect(peringatanTanggal("2026-10-03")).toMatch(/Sabtu/);
    expect(peringatanTanggal("2026-10-01", new Set(["2026-10-01"]))).toMatch(/libur/);
    expect(peringatanTanggal("2026-10-02")).toBeNull();
  });
});

describe("teks", () => {
  it("lanjutAman hanya menerima path internal", () => {
    expect(lanjutAman("/t/abc")).toBe("/t/abc");
    expect(lanjutAman("//jahat.test")).toBe("/saya");
    expect(lanjutAman("https://jahat.test")).toBe("/saya");
    expect(lanjutAman("/\\jahat")).toBe("/saya");
    expect(lanjutAman("/masuk?x", "/saya", ["/masuk"])).toBe("/saya");
  });
  it("urlAman menolak skema selain http(s)", () => {
    expect(urlAman("javascript:alert(1)")).toBeNull();
    expect(urlAman("https://contoh.test/a")).toBe("https://contoh.test/a");
  });
  it("pecahUrl", () => {
    expect(pecahUrl("lihat https://contoh.test/x, ya")).toEqual([
      { jenis: "teks", isi: "lihat " },
      { jenis: "url", isi: "https://contoh.test/x", href: "https://contoh.test/x" },
      { jenis: "teks", isi: ", ya" },
    ]);
  });
  it("ukuranBerkas", () => {
    expect(ukuranBerkas(512)).toBe("512 B");
    expect(ukuranBerkas(51200)).toBe("50 KB");
    expect(ukuranBerkas(3 * 1024 * 1024 + 200000)).toBe("3,2 MB");
  });
});
