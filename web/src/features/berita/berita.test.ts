import { describe, expect, it } from "vitest";

import {
  bacaSaringWilayah, bacaTabBerita, domainDari, gantiDiData, hitungWilayah, hrefBerita, kelompokSkor, labelEdisi, pesanTarik,
  saringPilihan, terapkanTanda,
} from "@/features/berita/berita";
import type { DataBerita, PilihanBerita } from "@/types/domain";

const p = (id: number, skor: number, wilayah: "dalam" | "luar" = "dalam", ekstra: Partial<PilihanBerita> = {}): PilihanBerita => ({
  id, edisi_id: 1, urutan: id, url: `https://contoh.id/${id}`, judul: `Berita ${id}`, sumber: "Contoh", terbit_at: null, wilayah,
  kategori: "ekonomi", skor, ringkasan: "r", dampak: "d", bahan_relasi: null, dibaca: false, disimpan: false, kurang: false,
  disimpan_at: null, ...ekstra,
});

describe("kelompokSkor", () => {
  it("memisah 5 / 4 / ≤3 dan membuang kelompok kosong", () => {
    const t = kelompokSkor([p(1, 5), p(2, 3), p(3, 1), p(4, 5)]);
    expect(t.map((x) => x.kunci)).toEqual(["wajib", "perlu"]);
    expect(t[0].items.map((x) => x.id)).toEqual([1, 4]);
    expect(t[1].items.map((x) => x.id)).toEqual([2, 3]);
  });
  it("kosong → tanpa kelompok", () => expect(kelompokSkor([])).toEqual([]));
});

describe("saringan wilayah", () => {
  const items = [p(1, 5, "dalam"), p(2, 4, "luar"), p(3, 3, "luar")];
  it("hitung per wilayah", () => expect(hitungWilayah(items)).toEqual({ semua: 3, dalam: 1, luar: 2 }));
  it("saring", () => {
    expect(saringPilihan(items, "luar").map((x) => x.id)).toEqual([2, 3]);
    expect(saringPilihan(items, "semua")).toHaveLength(3);
  });
  it("nilai URL tak dikenal → semua / pilihan", () => {
    expect(bacaSaringWilayah("mars")).toBe("semua");
    expect(bacaSaringWilayah("luar")).toBe("luar");
    expect(bacaTabBerita(null)).toBe("pilihan");
    expect(bacaTabBerita("simpan")).toBe("simpan");
  });
});

describe("hrefBerita", () => {
  it("parameter bawaan tidak ditulis", () => {
    expect(hrefBerita("pilihan")).toBe("/berita");
    expect(hrefBerita("pilihan", { wilayah: "semua", edisi: null })).toBe("/berita");
    expect(hrefBerita("semua", { wilayah: "luar", sumber: "bbc-world", q: "baja" })).toBe("/berita?tab=semua&wilayah=luar&sumber=bbc-world&q=baja");
  });
});

describe("tanda", () => {
  it("simpan mengisi disimpan_at, batal mengosongkan", () => {
    const a = terapkanTanda(p(1, 5), { disimpan: true }, "2026-11-07T01:00:00Z");
    expect(a.disimpan && a.disimpan_at).toBe("2026-11-07T01:00:00Z");
    expect(terapkanTanda(a, { disimpan: false }, "x").disimpan_at).toBeNull();
    expect(terapkanTanda(a, { dibaca: true }, "x").disimpan_at).toBe("2026-11-07T01:00:00Z");
  });
  it("gantiDiData menyesuaikan hitungan tersimpan", () => {
    const d: DataBerita = {
      edisi: { id: 1, dibuat_at: "2026-11-07T00:00:00Z", garis_besar: "g", pantau: null, kandidat: 10, catatan: null, pilihan: [p(1, 5), p(2, 4)] },
      daftar_edisi: [], tersimpan: 3, sumber: { aktif: 36, galat: 0, terakhir_tarik: null },
    };
    const d2 = gantiDiData(d, { ...p(2, 4), disimpan: true });
    expect(d2.tersimpan).toBe(4);
    expect(d2.edisi?.pilihan[1].disimpan).toBe(true);
    expect(gantiDiData(d2, { ...p(2, 4), disimpan: false }).tersimpan).toBe(3);
    expect(gantiDiData({ ...d, edisi: null }, p(1, 5)).edisi).toBeNull();
  });
});

describe("teks", () => {
  it("label edisi dalam WIB", () => {
    expect(labelEdisi({ id: 1, dibuat_at: "2026-11-07T07:05:00Z", jumlah: 12, wajib: 2 })).toMatch(/14[.:]05 · 12 berita \(2 wajib\)$/);
    expect(labelEdisi({ id: 1, dibuat_at: "2026-11-07T07:05:00Z", jumlah: 3, wajib: 0 })).toMatch(/3 berita$/);
  });
  it("pesan tarik", () => {
    expect(pesanTarik({ ditunda: true, terakhir_tarik: "x" })).toMatch(/90 detik/);
    expect(pesanTarik({ sumber: 36, sumber_ok: 35, sumber_galat: 1, item: 1300, baru: 120, dobel: 1180, dilewati: 0, dihapus: 0, per_sumber: [] }))
      .toBe("120 berita baru dari 35 sumber, 1 sumber gagal.");
  });
  it("domain", () => {
    expect(domainDari("https://www.kontan.co.id/a?b=1")).toBe("kontan.co.id");
    expect(domainDari("bukan url")).toBe("");
  });
});
