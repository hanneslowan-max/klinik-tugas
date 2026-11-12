import { describe, expect, it } from "vitest";

import {
  AngkaBuruk,
  butirGalat,
  fmtDurasi,
  labelDari,
  NAMA_UKURAN,
  rapikan,
  rincianRun,
  ringkasanRun,
  tabelAngka,
  tabelEntitas,
  teksNilai,
  type BagianRun,
  type TabelAngka,
} from "@/features/admin/sinkron/format";
import type { RunSinkron } from "@/types/domain";

const run = (x: Partial<RunSinkron>): RunSinkron => ({
  id: 7,
  mode: "harian",
  started_at: "2026-09-29T22:45:00Z",
  finished_at: "2026-09-29T23:05:00Z",
  counts: null,
  census: null,
  diffs: null,
  errors: null,
  ...x,
});

/** Teks semua sel (termasuk label baris) per baris. */
const isi = (t: TabelAngka) => t.baris.map((b) => [b.label, ...b.sel.map((s) => s.teks)]);
const tabel = (bagian: BagianRun[], judul: string | RegExp) => {
  const b = bagian.find((x) => (typeof judul === "string" ? x.judul === judul : judul.test(x.judul)));
  if (!b || b.jenis !== "tabel") throw new Error(`tabel "${judul}" tidak ada`);
  return b;
};

describe("teksNilai", () => {
  it("nilai sederhana", () => {
    expect(teksNilai(null)).toBe("—");
    expect(teksNilai(undefined)).toBe("—");
    expect(teksNilai("")).toBe("—");
    expect(teksNilai(true)).toBe("ya");
    expect(teksNilai(false)).toBe("tidak");
    expect(teksNilai(1234567)).toBe("1.234.567");
    expect(teksNilai("apa adanya")).toBe("apa adanya");
  });
  it("array → jumlah butir, objek → label Indonesia (tidak pernah [object Object])", () => {
    expect(teksNilai([1, 2, 3])).toBe("3 butir");
    expect(teksNilai({ inserted: 3, gagal: 0 })).toBe("Baru 3 · Gagal 0");
    expect(teksNilai({ tasks: { inserted: 1 } })).toBe("Tugas Baru 1");
    expect(teksNilai({ kunci_baru: "x" })).toBe("Kunci baru x");
    expect(teksNilai({})).toBe("—");
    expect(teksNilai({ a: { b: { c: {} } } })).not.toContain("[object Object]");
  });
});

describe("label", () => {
  it("rapikan kunci yang belum dikenal", () => {
    expect(rapikan("anggota_nonaktif")).toBe("Anggota nonaktif");
  });
  it("hanya kunci milik peta (bukan properti prototipe)", () => {
    expect(labelDari(NAMA_UKURAN, "r429")).toBe("Kena batas (HTTP 429)");
    expect(labelDari(NAMA_UKURAN, "constructor")).toBe("Constructor");
    expect(labelDari(NAMA_UKURAN, "toString")).toBe("ToString");
    expect(labelDari(NAMA_UKURAN, 12)).toBe("12");
  });
  it("durasi", () => {
    expect(fmtDurasi(45)).toBe("45 detik");
    expect(fmtDurasi(120)).toBe("2 menit");
    expect(fmtDurasi(125)).toBe("2 menit 5 detik");
    expect(fmtDurasi(3725)).toBe("1 jam 2 menit");
    expect(fmtDurasi(7200)).toBe("2 jam");
  });
});

describe("tabelAngka", () => {
  it("kolom angka rata kanan, nol redup, AngkaBuruk merah", () => {
    const t = tabelAngka(["Data", "Baru", "Catatan"], [["Tugas", 0, "x"], ["List", new AngkaBuruk(2), 5]], "uji", {
      kolomAngka: [true, false],
    });
    expect(t.kepala).toEqual([
      { teks: "Data", angka: false },
      { teks: "Baru", angka: true },
      { teks: "Catatan", angka: false },
    ]);
    expect(t.baris[0].sel[0]).toEqual({ teks: "0", angka: true, nol: true, buruk: false });
    expect(t.baris[1].sel[0]).toEqual({ teks: "2", angka: true, nol: false, buruk: true });
    // angka di kolom non-angka tetap diformat, tapi tidak rata kanan
    expect(t.baris[1].sel[1]).toEqual({ teks: "5", angka: false, nol: false, buruk: false });
  });
});

describe("tabelEntitas", () => {
  it("kolom utama + Lainnya, gagal/ditandai > 0 buruk, ids diabaikan", () => {
    const t = tabelEntitas(
      {
        tasks: { inserted: 5, updated: 2, unchanged: 10, gagal: 1, ids: ["a"] },
        list_statuses: { ditambah: 2, dibuang: 1, gagal: 0 },
        catatan: "bukan objek",
      },
      "sinkron-tulis",
    )!;
    expect(t.kepala.map((k) => k.teks)).toEqual(["Data", "Baru", "Diubah", "Tetap", "Gagal", "Lainnya"]);
    expect(isi(t)).toEqual([
      ["Tugas", "5", "2", "10", "1", "—"],
      ["Status list", "0", "0", "0", "0", "Ditambah 2 · Dibuang 1"],
    ]);
    expect(t.baris[0].sel[3].buruk).toBe(true);
    expect(t.baris[1].sel[3].buruk).toBe(false);
    expect(t.kepala.at(-1)?.angka).toBe(false);
  });
  it("tanpa baris entitas → null", () => {
    expect(tabelEntitas({ dilewati: "mode uji" }, "x")).toBeNull();
    expect(tabelEntitas(null, "x")).toBeNull();
    expect(tabelEntitas([{ a: 1 }], "x")).toBeNull();
  });
});

describe("ringkasanRun", () => {
  it("urutan & label ukuran; kunci tak dikenal tetap tampil", () => {
    const b = ringkasanRun({
      tugas: 1500,
      muat: "sinkron",
      only: ["901", "902"],
      list: 12,
      lampiran: 40,
      durasi_detik: 83,
      tulis: { tasks: { inserted: 1 } },
      tasks: { inserted: 3 },
      kunci_baru: { a: "x" },
    });
    expect(b.map(([label, nilai]) => [label, teksNilai(nilai)])).toEqual([
      ["Jenis muat", "sinkron (perbarui data)"],
      ["Cakupan", "2 list terpilih (901, 902)"],
      ["List", "12"],
      ["Tugas", "1.500"],
      ["Lampiran", "40"],
      ["Durasi", "1 menit 23 detik"],
      ["Kunci baru", "A x"],
    ]);
  });
  it("only kosong/null = semua list; muat tak dikenal apa adanya", () => {
    expect(ringkasanRun({ only: null, muat: "lain" })).toEqual([
      ["Jenis muat", "lain"],
      ["Cakupan", "semua list"],
    ]);
    expect(ringkasanRun({})).toEqual([]);
  });
});

describe("butirGalat", () => {
  it("konteks berlabel, pesan apa adanya", () => {
    expect(butirGalat({ task_id: "86b1", fase: "tugas_detail", status: 404, err: "GET /task/86b1 → 404" })).toEqual({
      konteks: "tugas 86b1 · tahap detail tugas · HTTP 404",
      pesan: "GET /task/86b1 → 404",
    });
    expect(butirGalat({ jenis: "comments", id: "c9", err: "tertunda" })).toEqual({ konteks: "komentar c9", pesan: "tertunda" });
    expect(butirGalat({ fase: "fatal", id: null, status: null, err: "putus" })).toEqual({ konteks: "tahap fatal", pesan: "putus" });
    expect(butirGalat("teks polos")).toEqual({ konteks: null, pesan: "teks polos" });
    expect(butirGalat({})).toEqual({ konteks: null, pesan: "tanpa pesan" });
  });
  it("pesan objek → JSON, bukan [object Object]", () => {
    expect(butirGalat({ err: { kode: 1 } }).pesan).toBe('{"kode":1}');
  });
});

describe("rincianRun", () => {
  it("run seed (entitas di level atas) → hanya tabel data ditulis", () => {
    const r = rincianRun(run({ mode: "uji", counts: { tasks: { inserted: 20, updated: 0, unchanged: 0 } }, diffs: [], errors: [] }));
    expect(r.judul).toBe("#7 · uji (tanpa tandai hilang)");
    expect(r.jumlahGalat).toBe(0);
    expect(r.jumlahSelisih).toBe(0);
    // pemisah tanggal–jam bergantung versi ICU ("30 Sep 2026, 05.45" / "30 Sep 2026 05.45")
    expect(r.waktu).toMatch(/^Mulai 30 Sep 2026,? 05\.45 WIB · selesai 30 Sep 2026,? 06\.05 WIB$/);
    expect(r.bagian.map((b) => b.judul)).toEqual(["Data ditulis ke aplikasi"]);
    expect(isi(tabel(r.bagian, "Data ditulis ke aplikasi").tabel)).toEqual([["Tugas", "20", "0", "0"]]);
  });

  it("run lengkap impor/sinkron.mjs", () => {
    const r = rincianRun(
      run({
        finished_at: null,
        counts: {
          tugas: 1200, komentar: 3400, lampiran: { ok: 10, gagal: 2, sudah_ada: 5 }, anggota: 9, anggota_nonaktif: 1, list: 30,
          space_privat: [{ space_id: "90180001", list: 4, anggota: 3, ok: true }, { space_id: 90180002, list: 0, anggota: 0, ok: false }],
          tulis: { tasks: { inserted: 1, updated: 2, unchanged: 3, gagal: 0 } },
          hilang: { tasks: { ditandai: 2, ids: ["x", "y"] } },
          clickup: { permintaan: 812, r429: 3, ulang: 1, unduh: 10, tunggu_ms: 1500, rpm: 90 },
          muat: "impor", only: null, durasi_detik: 30,
        },
        diffs: { selisih: [{ list_id: "901", kunci: "open", clickup: 5, db: 4 }, { list_id: "902", kunci: "sha_ids_tasks", clickup: "abcdef0123456789abcd", db: "x" }] },
        errors: [{ task_id: "t1", fase: "lampiran", status: 500, err: "gagal unduh" }],
      }),
    );
    expect(r.waktu).toContain("belum selesai");
    expect(r.bagian.map((b) => b.judul)).toEqual([
      "Ringkasan",
      "Data ditulis ke aplikasi",
      "Salin lampiran",
      "Ditandai hilang di ClickUp",
      "Anggota space privat",
      "Pemakaian API ClickUp",
      "Galat (1)",
      "Selisih sensus (2)",
    ]);
    const lampiran = tabel(r.bagian, "Salin lampiran").tabel;
    expect(isi(lampiran)).toEqual([["Tersalin", "10"], ["Gagal", "2"], ["Sudah ada", "5"]]);
    expect(lampiran.baris[1].sel[0].buruk).toBe(true);
    expect(lampiran.baris[1].sel[0].angka).toBe(true);

    const hilang = tabel(r.bagian, "Ditandai hilang di ClickUp").tabel;
    expect(isi(hilang)).toEqual([["Tugas", "2"]]);
    expect(hilang.baris[0].sel[0].buruk).toBe(true);

    // ID space tanpa pemisah ribuan
    expect(isi(tabel(r.bagian, "Anggota space privat").tabel)).toEqual([
      ["90180001", "4", "3", "ok"],
      ["90180002", "0", "0", "tidak lengkap (tidak dikirim)"],
    ]);

    const cu = tabel(r.bagian, "Pemakaian API ClickUp").tabel;
    expect(isi(cu)).toContainEqual(["Waktu tunggu batas", "1,5 detik"]);
    expect(cu.baris.find((b) => b.label === "Kena batas (HTTP 429)")?.sel[0].buruk).toBe(true);

    expect(isi(tabel(r.bagian, /^Selisih/).tabel)).toEqual([
      ["901", "Tugas terbuka", "5", "4"],
      ["902", "Sidik ID tugas", "abcdef012345…", "x"],
    ]);
    const g = r.bagian.find((b) => b.jenis === "galat");
    expect(g && g.jenis === "galat" ? g.butir : null).toEqual([{ konteks: "tugas t1 · tahap lampiran · HTTP 500", pesan: "gagal unduh" }]);

    expect(JSON.stringify(r.bagian)).not.toContain("[object Object]");
    expect(JSON.parse(r.json).counts.tugas).toBe(1200);
  });

  it("hilang = teks atau objek non-entitas tetap tampil sebagai teks", () => {
    const a = rincianRun(run({ counts: { hilang: "dilewati (mode uji)" } }));
    expect(a.bagian).toEqual([{ jenis: "teks", judul: "Ditandai hilang di ClickUp", uji: "sinkron-hilang", teks: "dilewati (mode uji)" }]);
    const b = rincianRun(run({ counts: { hilang: { dilewati: "mode uji" } } }));
    expect(b.bagian).toEqual([{ jenis: "teks", judul: "Ditandai hilang di ClickUp", uji: "sinkron-hilang", teks: "Dilewati mode uji" }]);
  });

  it("galat maks 20 & selisih maks 50 (sisanya di rincian teknis)", () => {
    const r = rincianRun(
      run({
        errors: Array.from({ length: 23 }, (_, i) => ({ err: `galat ${i}` })),
        diffs: Array.from({ length: 51 }, (_, i) => ({ list_id: String(i), kunci: "open", clickup: 1, db: 0 })),
      }),
    );
    const g = r.bagian.find((b) => b.jenis === "galat")!;
    expect(g.jenis === "galat" && g.butir.length).toBe(20);
    expect(g.jenis === "galat" && g.catatan).toBe("… 3 galat lain ada di rincian teknis.");
    const s = tabel(r.bagian, /^Selisih/);
    expect(s.tabel.baris).toHaveLength(50);
    expect(s.catatan).toBe("… 1 selisih lain ada di rincian teknis.");
    expect(r.jumlahSelisih).toBe(51);
  });

  it("counts/errors/diffs aneh tidak membuat galat", () => {
    const r = rincianRun(run({ counts: [] as unknown as Record<string, unknown>, errors: "x", diffs: 5 }));
    expect(r.bagian).toEqual([]);
    expect(r.jumlahGalat).toBe(0);
    expect(r.jumlahSelisih).toBe(0);
  });
});
