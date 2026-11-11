import { describe, expect, it } from "vitest";

import {
  argKeputusan, bacaSaringKeputusan, cekForm, detakBot, fmtUsd, labelAlasan, nadaKeputusan, pesanTolak, saringBaris,
  urutPerAlasan,
} from "@/features/bot-wa/bot-wa";
import type { BarisLogWa } from "@/types/domain";

const b = (id: number, keputusan: BarisLogWa["keputusan"], arah: BarisLogWa["arah"] = "sistem"): BarisLogWa => ({
  id, waktu: "2026-11-11T12:00:00Z", arah, jenis: null, keputusan, alasan: null, periode: null, teks_bot: null, panjang: null,
  token_masuk: null, token_keluar: null, biaya_usd: null, model: null, nomor: "abcd1234", percakapan: null,
});

describe("saringan keputusan", () => {
  it("nilai tak dikenal → bawaan 'bot'", () => {
    expect(bacaSaringKeputusan(null)).toBe("bot");
    expect(bacaSaringKeputusan("x")).toBe("bot");
    expect(bacaSaringKeputusan("tolak")).toBe("tolak");
  });
  it("'bot' dan 'semua' tidak memfilter di DB", () => {
    expect(argKeputusan("bot")).toBeUndefined();
    expect(argKeputusan("semua")).toBeUndefined();
    expect(argKeputusan("kirim")).toBe("kirim");
  });
  it("'bot' membuang catatan webhook", () => {
    const items = [b(1, "catat", "masuk"), b(2, "kirim", "keluar_bot"), b(3, "batal")];
    expect(saringBaris(items, "bot").map((x) => x.id)).toEqual([2, 3]);
    expect(saringBaris(items, "semua").map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe("label", () => {
  it("alasan dikenal diterjemahkan, sisanya ikut", () => {
    expect(labelAlasan("manusia_saja")).toBe("Topik khusus sales (kata kunci)");
    expect(labelAlasan("validator: harga,janji_kirim")).toBe("Ditolak validator: harga,janji_kirim");
    expect(labelAlasan("daftar_diam:pemasok")).toBe("Nomor di daftar diam: pemasok");
    expect(labelAlasan("kapso_503_x (3x)")).toBe("kapso_503_x (3x)");
    expect(labelAlasan(null)).toBe("");
  });
  it("nada keputusan", () => {
    expect(nadaKeputusan("kirim")).toBe("sukses");
    expect(nadaKeputusan("tolak")).toBe("telat");
    expect(nadaKeputusan("batal")).toBe("biasa");
  });
  it("per_alasan diurut terbanyak", () => {
    const r = urutPerAlasan({ "batal:saklar_mati": 3, "diam:manusia_saja": 7, "tolak:validator": 1 });
    expect(r.map((x) => x.kunci)).toEqual(["diam:manusia_saja", "batal:saklar_mati", "tolak:validator"]);
    expect(r[0]).toMatchObject({ keputusan: "diam", n: 7 });
  });
  it("biaya USD", () => {
    expect(fmtUsd(0.0123)).toBe("$0,0123");
    expect(fmtUsd(12.5)).toBe("$12,50");
    expect(fmtUsd(0)).toBe("$0,00");
  });
  it("pesan tolak validator manusiawi", () => {
    expect(pesanTolak("ditolak validator: harga, situasi:tautan")).toBe("Ditolak validator bot: menyebut harga/angka rupiah, situasi berisi tautan/alamat web.");
    expect(pesanTolak("galat lain")).toBe("galat lain");
  });
});

describe("detak", () => {
  const kini = Date.parse("2026-11-11T12:00:00Z");
  it("proses ≤ 5 mnt & jaga ≤ 30 mnt sehat; kosong tidak sehat", () => {
    const d = detakBot({ terakhir_webhook: null, terakhir_proses: "2026-11-11T11:57:00Z", terakhir_jaga: "2026-11-11T11:00:00Z" }, kini);
    expect(d.map((x) => x.sehat)).toEqual([false, true, false]);
  });
});

describe("cekForm", () => {
  it("panjang teks & situasi", () => {
    expect(cekForm("fakta", "ab", "")).toMatch(/minimal 3/);
    expect(cekForm("fakta", "x".repeat(701), "")).toMatch(/maksimal 700/);
    expect(cekForm("contoh", "Baik Bapak/Ibu.", "")).toMatch(/Situasi minimal/);
    expect(cekForm("contoh", "Baik Bapak/Ibu.", "Tanya roda")).toBeNull();
    expect(cekForm("fakta", "Lemari arsip TIDAK bisa custom.", "")).toBeNull();
  });
});
