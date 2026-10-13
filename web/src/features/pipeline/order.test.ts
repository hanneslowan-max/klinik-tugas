import { describe, expect, it } from "vitest";

import {
  BELUM_DICATAT, bulanSebelum, bulanTersedia, csvOrder, kelompokOrder, labelBulan, rentangBulan, saringLead, sisaTagihan,
  TANPA_TANGGAL, terbayar,
} from "@/features/pipeline/order";
import type { LeadRingkas } from "@/types/domain";

function lead(kode: string, sebagian: Partial<LeadRingkas>): LeadRingkas {
  return {
    id: `ld${kode}`, kode, tahap: "ORDER", sumber: "Google Ads", pelanggan: `PT ${kode}`, kota: null, pemilik: null,
    pemilik_nama: null, tanggal_masuk: "2026-01-01", diam_hari: 0, fu_berikutnya: null, nilai_transaksi: null, no_sp: null,
    tanggal_sp: null, no_po: null, bayar_status: "BELUM", bayar_dp: null, tanggal_dp: null, tanggal_lunas: null,
    periksa: false, produk: [], ...sebagian,
  };
}

const DATA = [
  lead("L-00001", { tanggal_sp: "2026-09-03", nilai_transaksi: 1_000_000, bayar_status: "LUNAS", tanggal_lunas: "2026-09-20" }),
  lead("L-00002", { tanggal_sp: "2026-10-01", nilai_transaksi: 2_500_000, bayar_status: "DP", bayar_dp: 1_000_000, tanggal_dp: "2026-10-02" }),
  lead("L-00003", { tanggal_sp: "2026-10-12", nilai_transaksi: 500_000 }),
  lead("L-00004", { tanggal_sp: null, nilai_transaksi: 750_000, bayar_status: null }),
  lead("L-00005", { tanggal_sp: "2026-10-12", nilai_transaksi: null }),
  lead("L-00006", { tahap: "PENAWARAN", tanggal_masuk: "2026-10-05", bayar_status: null }),
];

describe("terbayar & sisaTagihan", () => {
  it("LUNAS = penuh, DP = nominal DP, BELUM = 0; sisa mengikuti", () => {
    expect([terbayar(DATA[0]), sisaTagihan(DATA[0])]).toEqual([1_000_000, 0]);
    expect([terbayar(DATA[1]), sisaTagihan(DATA[1])]).toEqual([1_000_000, 1_500_000]);
    expect([terbayar(DATA[2]), sisaTagihan(DATA[2])]).toEqual([0, 500_000]);
  });
  it("belum dicatat / nominal kosong → sisa tidak diketahui (null)", () => {
    expect(sisaTagihan(DATA[3])).toBeNull();
    expect(sisaTagihan(DATA[4])).toBeNull();
  });
});

describe("kelompokOrder", () => {
  it("per bulan SP, terbaru dulu, 'Tanpa tanggal SP' terakhir; abaikan non-ORDER", () => {
    const r = kelompokOrder(DATA);
    expect(r.grup.map((g) => g.kunci)).toEqual(["2026-10", "2026-09", TANPA_TANGGAL]);
    expect(r.grup[2].label).toBe("Tanpa tanggal SP");
    expect(r.jumlah).toBe(5);
  });

  it("dalam bulan: tanggal SP terbaru dulu, lalu kode terbaru", () => {
    expect(kelompokOrder(DATA).grup[0].items.map((l) => l.kode)).toEqual(["L-00005", "L-00003", "L-00002"]);
  });

  it("rekap: nominal, terbayar, sisa; tanpa nominal & belum dicatat dihitung terpisah", () => {
    const r = kelompokOrder(DATA);
    expect(r.grup[0]).toMatchObject({ jumlah: 3, nilai: 3_000_000, terbayar: 1_000_000, sisa: 2_000_000, tanpaNilai: 1, belumDicatat: 0 });
    expect(r).toMatchObject({ jumlah: 5, nilai: 4_750_000, terbayar: 2_000_000, sisa: 2_000_000, tanpaNilai: 1, belumDicatat: 1 });
  });

  it("tanpa order → kosong", () => {
    expect(kelompokOrder([lead("L-1", { tahap: "BARU" })])).toMatchObject({ jumlah: 0, nilai: 0, grup: [] });
  });
});

describe("saringLead", () => {
  it("tab Order: status bayar, termasuk 'belum dicatat'", () => {
    const st = (status: string) => saringLead(DATA, { status, dari: null, sampai: null }, true).map((l) => l.kode);
    expect(st("DP")).toEqual(["L-00002"]);
    expect(st("BELUM")).toEqual(["L-00003", "L-00005"]);
    expect(st(BELUM_DICATAT)).toEqual(["L-00004", "L-00006"]);
  });

  it("tab Order: rentang tanggal SP inklusif; tanpa tanggal tersaring keluar", () => {
    const r = saringLead(DATA, { status: null, ...rentangBulan("2026-10") }, true).map((l) => l.kode);
    expect(r).toEqual(["L-00002", "L-00003", "L-00005"]);
    expect(saringLead(DATA, { status: null, dari: "2026-10-12", sampai: null }, true).map((l) => l.kode)).toEqual(["L-00003", "L-00005"]);
  });

  it("tab lain: status = tahap, tanggal = tanggal masuk", () => {
    expect(saringLead(DATA, { status: "PENAWARAN", dari: null, sampai: null }, false).map((l) => l.kode)).toEqual(["L-00006"]);
    expect(saringLead(DATA, { status: null, dari: "2026-10-01", sampai: "2026-10-31" }, false).map((l) => l.kode)).toEqual(["L-00006"]);
  });

  it("tanpa saringan → daftar yang sama", () => {
    expect(saringLead(DATA, { status: null, dari: null, sampai: null }, true)).toBe(DATA);
  });
});

describe("bulan", () => {
  it("label Indonesia, rentang bulan (termasuk Februari & kabisat), bulan sebelum", () => {
    expect(labelBulan("2026-10")).toBe("Oktober 2026");
    expect(rentangBulan("2026-02")).toEqual({ dari: "2026-02-01", sampai: "2026-02-28" });
    expect(rentangBulan("2028-02").sampai).toBe("2028-02-29");
    expect(bulanSebelum("2026-01")).toBe("2025-12");
    expect(bulanSebelum("2026-10")).toBe("2026-09");
  });
  it("bulanTersedia: bulan SP order saja, terbaru dulu", () => {
    expect(bulanTersedia(DATA)).toEqual(["2026-10", "2026-09"]);
  });
});

describe("csvOrder", () => {
  it("BOM + pemisah ';' + kutip bila perlu; status belum dicatat tertulis", () => {
    const csv = csvOrder([
      lead("L-00009", { pelanggan: 'PT "Maju"; Jaya', no_sp: "9/RSG/X/2026", nilai_transaksi: 1_200_000, bayar_status: "DP", bayar_dp: 200_000,
        produk: [{ produk: "Roda", qty: 1000, satuan: "pcs" }] }),
      lead("L-00010", { bayar_status: null }),
    ]);
    expect(csv.startsWith("﻿Tanggal SP;No SP;No PO;")).toBe(true);
    const baris = csv.trim().split("\r\n");
    expect(baris).toHaveLength(3);
    expect(baris[1]).toContain('"PT ""Maju""; Jaya"');
    expect(baris[1]).toContain(";Roda 1.000 pcs;");
    expect(baris[1]).toContain(";1200000;DP;200000;;200000;1000000;");
    expect(baris[2]).toContain(";Belum dicatat;");
  });
});
