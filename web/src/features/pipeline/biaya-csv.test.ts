import { describe, expect, it } from "vitest";

import { bacaAngka, bacaTanggal, bacaTempelan, pecahKiriman } from "./biaya-csv";

describe("baca tanggal", () => {
  it("ISO, dd/mm/yyyy, nama bulan Indonesia/Inggris", () => {
    expect(bacaTanggal("2026-10-27")).toBe("2026-10-27");
    expect(bacaTanggal("27/10/2026")).toBe("2026-10-27");
    expect(bacaTanggal("1-9-2026")).toBe("2026-09-01");
    expect(bacaTanggal("27 Okt 2026")).toBe("2026-10-27");
    expect(bacaTanggal("Oct 27, 2026")).toBe("2026-10-27");
    expect(bacaTanggal("3 Agustus 2026")).toBe("2026-08-03");
  });
  it("tanggal mustahil / teks lain → null", () => {
    expect(bacaTanggal("31/02/2026")).toBeNull();
    expect(bacaTanggal("Total")).toBeNull();
    expect(bacaTanggal("")).toBeNull();
  });
});

describe("baca angka", () => {
  it("format Indonesia & Inggris", () => {
    expect(bacaAngka("Rp1.234.567")).toBe(1234567);
    expect(bacaAngka("1.234.567,89")).toBe(1234567.89);
    expect(bacaAngka("1,234,567.89")).toBe(1234567.89);
    expect(bacaAngka("423,5")).toBe(423.5);
    expect(bacaAngka("423.5")).toBe(423.5);
    expect(bacaAngka("1.234")).toBe(1234);
    expect(bacaAngka("Rp 16.190.000")).toBe(16190000);
    expect(bacaAngka("IDR 512345")).toBe(512345);
  });
  it("kosong / '-' = 0; teks = null", () => {
    expect(bacaAngka("")).toBe(0);
    expect(bacaAngka("-")).toBe(0);
    expect(bacaAngka("abc")).toBeNull();
  });
});

describe("tempelan sheet", () => {
  it("salinan Google Sheets (tab): kolom dikenali, total dilewati, ganda dijumlahkan", () => {
    const teks = [
      "Tanggal\tCampaign\tBiaya\tKlik\tImpr.\tKonversi",
      "27/10/2026\tGeneral Roda\tRp512.345\t120\t3.400\t31,5",
      "27/10/2026\tPallet Mesh (Stocky)\t200.000\t40\t900\t4",
      "27/10/2026\tGeneral Roda\t100\t1\t10\t0",
      "28/10/2026\t\t5000\t1\t1\t0",
      "Total\t\t812.445\t161\t4310\t35,5",
    ].join("\n");
    const h = bacaTempelan(teks, "google");
    expect(h.galat).toBeNull();
    expect(h.items).toEqual([
      { tanggal: "2026-10-27", platform: "google", campaign: "General Roda", biaya: 512445, klik: 121, tayang: 3410, konversi: 31.5 },
      { tanggal: "2026-10-27", platform: "google", campaign: "Pallet Mesh (Stocky)", biaya: 200000, klik: 40, tayang: 900, konversi: 4 },
    ]);
    expect(h.lewati).toEqual([
      { baris: 5, alasan: "campaign kosong" },
      { baris: 6, alasan: "baris total" },
    ]);
  });
  it("CSV koma dengan kutip & judul Inggris", () => {
    const h = bacaTempelan('Day,Campaign,Cost,Clicks,Conversions\n2026-10-01,"Filing, Cabinet",2700000.00,300,12.5\n', "meta");
    expect(h.items).toEqual([{ tanggal: "2026-10-01", platform: "meta", campaign: "Filing, Cabinet", biaya: 2700000, klik: 300, tayang: 0, konversi: 12.5 }]);
  });
  it("kolom wajib tidak ada → galat yang menyebut kolomnya", () => {
    expect(bacaTempelan("Tanggal\tKlik\n2026-10-01\t3", "google").galat).toContain("campaign, biaya");
    expect(bacaTempelan("   \n", "google").galat).toBe("Tempelan kosong.");
  });
});

describe("pecah kiriman", () => {
  it("tidak memisah satu (tanggal, platform)", () => {
    const hari = (t: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ tanggal: t, platform: "google" as const, campaign: `c${i}`, biaya: 1 }));
    const k = pecahKiriman([...hari("2026-10-01", 3), ...hari("2026-10-02", 3), ...hari("2026-10-03", 2)], 5);
    expect(k.map((x) => x.length)).toEqual([3, 5]);
    expect(new Set(k[1].map((x) => x.tanggal))).toEqual(new Set(["2026-10-02", "2026-10-03"]));
  });
});
