import { describe, expect, it } from "vitest";

import {
  AMBANG,
  hariKerjaAntara,
  hariKerjaBerikut,
  labelRentang,
  labelSisa,
  nilaiPenawaranValid,
  perubahan,
  rentangBulan,
  rupiahJuta,
  siklusValid,
  skorTarget,
  splitQtyValid,
  tambahHari,
  targetSales,
} from "./dasbor";

/** hitung manual: hari d (dari < d ≤ sampai) yang bukan Minggu */
function manual(dari: string, sampai: string): number {
  let n = 0;
  for (let d = tambahHari(dari, 1); d <= sampai; d = tambahHari(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) n++;
  return n;
}

describe("hari kerja (Senin–Sabtu)", () => {
  it("rumus tertutup = hitung manual untuk banyak pasangan tanggal", () => {
    for (let i = 0; i < 21; i++) {
      const dari = tambahHari("2026-10-01", i);
      for (let n = -3; n <= 40; n++) expect(hariKerjaAntara(dari, tambahHari(dari, n))).toBe(manual(dari, tambahHari(dari, n)));
    }
  });
  it("Oktober 2026: 27 hari kerja; 24 s/d 28 Okt", () => {
    expect(hariKerjaAntara("2026-09-30", "2026-10-31")).toBe(27);
    expect(hariKerjaAntara("2026-09-30", "2026-10-28")).toBe(24);
  });
  it("hari kerja berikut: Jumat → Sabtu, Sabtu → Senin, Minggu → Senin", () => {
    expect(hariKerjaBerikut("2026-10-23")).toBe("2026-10-24");
    expect(hariKerjaBerikut("2026-10-24")).toBe("2026-10-26");
    expect(hariKerjaBerikut("2026-10-25")).toBe("2026-10-26");
  });
  it("disentuh ≤1 hari kerja: batasnya hari kerja pertama sesudah tanggal masuk", () => {
    // lead masuk Sabtu 24 Okt: sentuhan Senin 26 Okt masih tepat waktu, Selasa 27 terlambat
    const batas = hariKerjaBerikut("2026-10-24");
    expect("2026-10-26" <= batas).toBe(true);
    expect("2026-10-27" <= batas).toBe(false);
    // umur ≥ 1 hari kerja: lead masuk hari ini belum dihitung, masuk kemarin sudah
    expect(hariKerjaAntara("2026-10-29", "2026-10-29")).toBe(0);
    expect(hariKerjaAntara("2026-10-28", "2026-10-29")).toBe(1);
  });
  it("rentang bulan", () => {
    expect(rentangBulan("2026-02")).toEqual({ awal: "2026-02-01", akhir: "2026-02-28" });
    expect(rentangBulan("2026-10")).toEqual({ awal: "2026-10-01", akhir: "2026-10-31" });
  });
});

describe("skor target & proyeksi", () => {
  it("angka mockup 29 Okt 2026: kurang Rp56,7 jt, sisa 3 hk, perlu Rp18,9 jt/hari, laju Rp10,1 jt/hari, proyeksi Rp273,7 jt", () => {
    const s = skorTarget({ omzet: 243_308_307, target: 300_000_000, bulan: "2026-10", hariIni: "2026-10-29" });
    expect(s.hkBulan).toBe(27);
    expect(s.hkLewat).toBe(24);
    expect(s.sisaHk).toBe(3);
    expect(s.kurang).toBe(56_691_693);
    expect(rupiahJuta(s.kurang)).toBe("Rp56,7 jt");
    expect(rupiahJuta(s.perluPerHari)).toBe("Rp18,9 jt");
    expect(rupiahJuta(s.laju)).toBe("Rp10,1 jt");
    expect(rupiahJuta(s.proyeksi)).toBe("Rp273,7 jt");
    expect(Math.round(s.persen * 100)).toBe(81);
    expect(s.selesai).toBe(false);
  });
  it("tanggal 1 (belum ada hari kerja lewat): laju & proyeksi kosong, sisa = sebulan", () => {
    const s = skorTarget({ omzet: 0, target: 300_000_000, bulan: "2026-10", hariIni: "2026-10-01" });
    expect(s.hkLewat).toBe(0);
    expect(s.laju).toBeNull();
    expect(s.proyeksi).toBeNull();
    expect(s.sisaHk).toBe(27);
  });
  it("bulan yang sudah selesai: sisa 0, proyeksi = omzet, tidak ada 'perlu per hari'", () => {
    const s = skorTarget({ omzet: 320_000_000, target: 300_000_000, bulan: "2026-09", hariIni: "2026-10-29" });
    expect(s).toMatchObject({ selesai: true, sisaHk: 0, kurang: 0, perluPerHari: null, proyeksi: 320_000_000, hkLewat: s.hkBulan });
  });
  it("target melampaui: kurang tidak negatif", () => {
    expect(skorTarget({ omzet: 400, target: 300, bulan: "2026-10", hariIni: "2026-10-29" }).kurang).toBe(0);
  });
  it("target per sales: baku Rp150 jt", () => {
    expect(targetSales(240260558)).toBe(150_000_000);
    expect(targetSales(null)).toBe(150_000_000);
  });
});

describe("ambang 'belum valid'", () => {
  it("nilai penawaran PM per sales: ≥ 50% lead PM terbuka bernilai", () => {
    expect(AMBANG.nilaiPenawaran).toBe(0.5);
    expect(nilaiPenawaranValid(1, 90)).toBe(false); // data 29 Okt
    expect(nilaiPenawaranValid(45, 90)).toBe(true);
    expect(nilaiPenawaranValid(44, 90)).toBe(false);
    expect(nilaiPenawaranValid(0, 0)).toBe(false);
  });
  it("win rate PM per qty: ≥ 30% lead PM punya qty > 1", () => {
    expect(splitQtyValid(10, 212)).toBe(false); // data 29 Okt
    expect(splitQtyValid(64, 212)).toBe(true);
    expect(splitQtyValid(63, 212)).toBe(false);
    expect(splitQtyValid(0, 0)).toBe(false);
  });
  it("waktu siklus: sampel ≥ 10", () => {
    expect(siklusValid(1)).toBe(false); // data 29 Okt
    expect(siklusValid(9)).toBe(false);
    expect(siklusValid(10)).toBe(true);
  });
});

describe("format", () => {
  it("rupiah juta & rentang", () => {
    expect(rupiahJuta(596_759_433)).toBe("Rp596,8 jt");
    expect(rupiahJuta(850_000)).toBe("Rp850 rb");
    expect(rupiahJuta(300_000_000)).toBe("Rp300 jt");
    expect(rupiahJuta(147_999_694)).toBe("Rp148,0 jt");
    expect(labelRentang("2026-09-29")).toBe("1–29 Sep");
    expect(labelSisa("2026-10-29", "2026-10")).toBe("29–31 Okt");
    expect(labelSisa("2026-10-31", "2026-10")).toBe("31 Okt");
  });
  it("perubahan relatif", () => {
    expect(perubahan(335, 385)).toBe("−13%");
    expect(perubahan(51, 50)).toBe("+2%");
    expect(perubahan(5, 0)).toBeNull();
  });
});
