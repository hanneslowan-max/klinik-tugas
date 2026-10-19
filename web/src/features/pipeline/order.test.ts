import { describe, expect, it } from "vitest";

import {
  BELUM_DICATAT, bulanSebelum, csvOrder, daftarSales, hitungProduk, jumlahSaringan, kelompokOrder, labelBulan, rentangBulan,
  rentangMinggu, SARINGAN_KOSONG, saringLead, sisaTagihan, TANPA_PEMILIK, TANPA_TANGGAL, terbayar, urutkan, urutSah,
} from "@/features/pipeline/order";
import type { LeadRingkas } from "@/types/domain";

function lead(kode: string, sebagian: Partial<LeadRingkas>): LeadRingkas {
  return {
    id: `ld${kode}`, kode, tahap: "ORDER", sumber: "Google Ads", pelanggan: `PT ${kode}`, kota: null, pemilik: null,
    pemilik_nama: null, pemilik_kode_sp: null, tanggal_masuk: "2026-01-01", diam_hari: 0, fu_berikutnya: null, nilai_transaksi: null, no_sp: null,
    tanggal_sp: null, no_po: null, bayar_status: "BELUM", bayar_dp: null, tanggal_dp: null, tanggal_lunas: null,
    periksa: false, pelanggan_id: `pl${kode}`, order_sebelumnya: 0, produk: [], ...sebagian,
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

  it("order yang dibatalkan (BATAL, data order tetap tersimpan) tidak ikut grup, total, maupun bulan", () => {
    const dibatalkan = lead("L-00020", {
      tahap: "BATAL", no_sp: "20/RSG/VIII/2026", tanggal_sp: "2026-08-14", nilai_transaksi: 9_000_000, bayar_status: "DP",
      bayar_dp: 3_000_000, tanggal_dp: "2026-08-15",
    });
    const lunasBatal = lead("L-00021", { tahap: "BATAL", tanggal_sp: "2026-10-02", nilai_transaksi: 4_000_000, bayar_status: "LUNAS" });
    const tetap = lead("L-00022", { tanggal_sp: "2026-10-03", nilai_transaksi: 1_500_000, bayar_status: "BELUM" });
    const r = kelompokOrder([dibatalkan, lunasBatal, tetap]);
    expect(r).toMatchObject({ jumlah: 1, nilai: 1_500_000, terbayar: 0, sisa: 1_500_000 });
    expect(r.grup.map((g) => g.kunci)).toEqual(["2026-10"]);
    expect(r.grup[0].items.map((l) => l.kode)).toEqual(["L-00022"]);
    expect(kelompokOrder([dibatalkan, lunasBatal])).toMatchObject({ jumlah: 0, nilai: 0, terbayar: 0, sisa: 0, grup: [] });
  });
});

describe("saringLead", () => {
  it("tab Order: status bayar, termasuk 'belum dicatat'", () => {
    const st = (status: string) => saringLead(DATA, { status, dari: null, sampai: null, produk: null, sales: null }, true).map((l) => l.kode);
    expect(st("DP")).toEqual(["L-00002"]);
    expect(st("BELUM")).toEqual(["L-00003", "L-00005"]);
    expect(st(BELUM_DICATAT)).toEqual(["L-00004", "L-00006"]);
  });

  it("tab Order: rentang tanggal SP inklusif; tanpa tanggal tersaring keluar", () => {
    const r = saringLead(DATA, { status: null, produk: null, sales: null, ...rentangBulan("2026-10") }, true).map((l) => l.kode);
    expect(r).toEqual(["L-00002", "L-00003", "L-00005"]);
    expect(saringLead(DATA, { status: null, dari: "2026-10-12", sampai: null, produk: null, sales: null }, true).map((l) => l.kode)).toEqual(["L-00003", "L-00005"]);
  });

  it("tab lain: status = tahap, tanggal = tanggal masuk", () => {
    expect(saringLead(DATA, { status: "PENAWARAN", dari: null, sampai: null, produk: null, sales: null }, false).map((l) => l.kode)).toEqual(["L-00006"]);
    expect(saringLead(DATA, { status: null, dari: "2026-10-01", sampai: "2026-10-31", produk: null, sales: null }, false).map((l) => l.kode)).toEqual(["L-00006"]);
  });

  it("tanpa saringan → daftar yang sama", () => {
    expect(saringLead(DATA, SARINGAN_KOSONG, true)).toBe(DATA);
  });

  it("produk: lead yang memuat produk itu di salah satu item; bisa digabung dengan saringan lain", () => {
    const P = [
      lead("L-00011", { tahap: "PENAWARAN", produk: [{ produk: "Roda", qty: 2, satuan: "unit" }] }),
      lead("L-00012", { tahap: "BARU", produk: [{ produk: "Pallet Mesh", qty: 40, satuan: "unit" }, { produk: "Roda", qty: 4, satuan: "unit" }] }),
      lead("L-00013", { tahap: "PENAWARAN", produk: [{ produk: "Lemari Arsip", qty: 1, satuan: "unit" }] }),
      lead("L-00014", { tahap: "BARU", produk: [] }),
    ];
    const kode = (f: Partial<typeof SARINGAN_KOSONG>) => saringLead(P, { ...SARINGAN_KOSONG, ...f }, false).map((l) => l.kode);
    expect(kode({ produk: "Roda" })).toEqual(["L-00011", "L-00012"]);
    expect(kode({ produk: "Lemari Arsip" })).toEqual(["L-00013"]);
    expect(kode({ produk: "Locker" })).toEqual([]);
    expect(kode({ produk: "Roda", status: "PENAWARAN" })).toEqual(["L-00011"]);
    expect(jumlahSaringan({ ...SARINGAN_KOSONG, produk: "Roda" })).toBe(0); // produk tidak dihitung di lencana Filter
  });
});

describe("urutkan", () => {
  const L = [
    lead("L-00031", { tahap: "BARU", pelanggan: "PT Zeta", tanggal_masuk: "2026-10-02", fu_berikutnya: null }),
    lead("L-00032", { tahap: "PENAWARAN", pelanggan: "cv alfa", tanggal_masuk: "2026-10-05", fu_berikutnya: "2026-10-20" }),
    lead("L-00033", { tahap: "BARU", pelanggan: "PT Beta", tanggal_masuk: "2026-09-30", fu_berikutnya: "2026-10-19" }),
    lead("L-00034", { tahap: "BARU", pelanggan: "PT Beta", tanggal_masuk: "2026-10-05", fu_berikutnya: null }),
  ];
  const kode = (u: string | null) => urutkan(L, u, false).map((l) => l.kode);

  it("bawaan (null / kunci tak dikenal) = urutan server, tanpa salinan", () => {
    expect(urutkan(L, null, false)).toBe(L);
    expect(urutkan(L, "nilai", false)).toBe(L); // 'nilai' hanya untuk tab Order
    expect(urutSah("ngawur", false)).toBeNull();
  });

  it("terbaru / terlama masuk (seri: kode), follow up terdekat (tanpa jadwal di akhir), nama A–Z tanpa beda huruf besar", () => {
    expect(kode("baru")).toEqual(["L-00034", "L-00032", "L-00031", "L-00033"]);
    expect(kode("lama")).toEqual(["L-00033", "L-00031", "L-00032", "L-00034"]);
    expect(kode("fu")).toEqual(["L-00033", "L-00032", "L-00031", "L-00034"]);
    expect(kode("nama")).toEqual(["L-00032", "L-00033", "L-00034", "L-00031"]); // seri nama: urutan server
    expect(L.map((l) => l.kode)).toEqual(["L-00031", "L-00032", "L-00033", "L-00034"]); // asli tidak berubah
  });

  it("tab Order: nilai terbesar / nama dalam bulan; terlama membalik bulan (Tanpa tanggal SP tetap terakhir)", () => {
    const nilai = kelompokOrder(DATA, "nilai").grup.map((g) => g.items.map((l) => l.kode));
    expect(nilai).toEqual([["L-00002", "L-00003", "L-00005"], ["L-00001"], ["L-00004"]]);
    const lama = kelompokOrder(DATA, "lama").grup.map((g) => [g.kunci, ...g.items.map((l) => l.kode)]);
    expect(lama).toEqual([["2026-09", "L-00001"], ["2026-10", "L-00002", "L-00003", "L-00005"], [TANPA_TANGGAL, "L-00004"]]);
    expect(kelompokOrder(DATA, "baru")).toEqual(kelompokOrder(DATA)); // 'baru' tidak ada di tab Order → bawaan
  });
});

describe("saringan sales", () => {
  const S = [
    lead("L-00041", { tahap: "BARU", pemilik: 7, pemilik_nama: "Riksa Sri Gustiana" }),
    lead("L-00042", { tahap: "PENAWARAN", pemilik: 5, pemilik_nama: "michael eppy" }),
    lead("L-00043", { tahap: "BARU", pemilik: null, pemilik_nama: null }),
    lead("L-00044", { tahap: "PENAWARAN", pemilik: 7, pemilik_nama: "Riksa Sri Gustiana" }),
  ];
  const kode = (f: Partial<typeof SARINGAN_KOSONG>) => saringLead(S, { ...SARINGAN_KOSONG, ...f }, false).map((l) => l.kode);

  it("per pemilik, tanpa pemilik, digabung dengan saringan lain; dihitung di lencana Filter", () => {
    expect(kode({ sales: "7" })).toEqual(["L-00041", "L-00044"]);
    expect(kode({ sales: TANPA_PEMILIK })).toEqual(["L-00043"]);
    expect(kode({ sales: "7", status: "PENAWARAN" })).toEqual(["L-00044"]);
    expect(kode({ sales: "99" })).toEqual([]);
    expect(jumlahSaringan({ ...SARINGAN_KOSONG, sales: "7" })).toBe(1);
  });

  it("daftarSales: nama dari semua lead, jumlah dari yang tersaring; urut nama, Tanpa pemilik terakhir", () => {
    const penawaran = saringLead(S, { ...SARINGAN_KOSONG, status: "PENAWARAN" }, false);
    expect(daftarSales(S, penawaran)).toEqual([
      { k: "5", nama: "michael eppy", n: 1 },
      { k: "7", nama: "Riksa Sri Gustiana", n: 1 },
      { k: TANPA_PEMILIK, nama: "Tanpa pemilik", n: 0 },
    ]);
  });
});

describe("hitungProduk", () => {
  it("jumlah lead per produk; produk yang sama dua kali di satu lead dihitung sekali", () => {
    const m = hitungProduk([
      lead("L-00021", { produk: [{ produk: "Roda", qty: 2, satuan: "unit" }, { produk: "Roda", qty: 1, satuan: "set" }] }),
      lead("L-00022", { produk: [{ produk: "Pallet Mesh", qty: 40, satuan: "unit" }, { produk: "Roda", qty: 4, satuan: "unit" }] }),
      lead("L-00023", { produk: [] }),
    ]);
    expect(Object.fromEntries(m)).toEqual({ Roda: 2, "Pallet Mesh": 1 });
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
  it("rentangMinggu: Senin–Minggu, termasuk lintas bulan & tahun", () => {
    expect(rentangMinggu("2026-10-19")).toEqual({ dari: "2026-10-19", sampai: "2026-10-25" }); // Senin
    expect(rentangMinggu("2026-10-25")).toEqual({ dari: "2026-10-19", sampai: "2026-10-25" }); // Minggu
    expect(rentangMinggu("2026-10-01")).toEqual({ dari: "2026-09-28", sampai: "2026-10-04" }); // Kamis
    expect(rentangMinggu("2027-01-01")).toEqual({ dari: "2026-12-28", sampai: "2027-01-03" });
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

  it("teks yang diawali = + - @ tidak dijalankan Excel sebagai formula; angka tetap angka", () => {
    const csv = csvOrder([lead("L-00011", { pelanggan: "=HYPERLINK(\"x\")", kota: "+62", no_po: "@SUM(A1)", nilai_transaksi: 500 })]);
    const b = csv.trim().split("\r\n")[1];
    expect(b).toContain(`;"'=HYPERLINK(""x"")";'+62;`);
    expect(b).toContain(";'@SUM(A1);");
    expect(b).toContain(";500;");
  });
});
