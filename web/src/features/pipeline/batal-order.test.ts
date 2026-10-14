import { describe, expect, it } from "vitest";

import {
  ALASAN_BATAL, ALASAN_BATAL_ORDER, ALASAN_ORDER_MAKS, ALASAN_ORDER_MIN, galatAlasanOrder, rapikanAlasanOrder,
} from "@/features/pipeline/konstanta";

// Batalkan order (migrasi 20261014130000): alasan dirapikan PERSIS seperti server —
// btrim(replace(alasan, E'\r\n', E'\n'), E' \t\r\n') — lalu wajib 5–500 karakter (char_length).

describe("rapikanAlasanOrder", () => {
  it("buang spasi/tab/baris baru di awal & akhir; isi tengah dipertahankan", () => {
    expect(rapikanAlasanOrder("  \t\n Proyek ditunda \n\t ")).toBe("Proyek ditunda");
    expect(rapikanAlasanOrder("Baris 1\n\n  Baris 2")).toBe("Baris 1\n\n  Baris 2");
  });

  it("CRLF → LF (di tengah maupun di tepi)", () => {
    expect(rapikanAlasanOrder("\r\nBaris 1\r\nBaris 2\r\n")).toBe("Baris 1\nBaris 2");
    expect(rapikanAlasanOrder("a\rb")).toBe("a\rb"); // CR tunggal di tengah tidak diubah (sama dengan server)
  });

  it("hanya spasi / kosong / null → string kosong", () => {
    expect(rapikanAlasanOrder(" \t\r\n \r\n ")).toBe("");
    expect(rapikanAlasanOrder("")).toBe("");
    expect(rapikanAlasanOrder(null)).toBe("");
    expect(rapikanAlasanOrder(undefined)).toBe("");
  });

  it("spasi Unicode lain (NBSP) TIDAK dibuang — server hanya membuang spasi, tab, CR, LF", () => {
    expect(rapikanAlasanOrder(" batal ")).toBe(" batal ");
  });
});

describe("galatAlasanOrder", () => {
  it("kosong / hanya spasi / < 5 karakter sesudah dirapikan → wajib ditulis", () => {
    for (const t of ["", "    ", "\r\n\t", "abcd", "  abcd  \n"]) {
      expect(galatAlasanOrder(t)).toBe(`Alasan pembatalan wajib ditulis (minimal ${ALASAN_ORDER_MIN} karakter).`);
    }
  });

  it("tepat 5 dan tepat 500 karakter → sah", () => {
    expect(galatAlasanOrder("abcde")).toBeNull();
    expect(galatAlasanOrder(`  ${"x".repeat(ALASAN_ORDER_MAKS)}\n`)).toBeNull();
  });

  it("> 500 karakter → terlalu panjang", () => {
    expect(galatAlasanOrder("x".repeat(ALASAN_ORDER_MAKS + 1))).toBe(`Alasan pembatalan maksimal ${ALASAN_ORDER_MAKS} karakter.`);
  });

  it("panjang dihitung per karakter (seperti char_length), bukan unit UTF-16", () => {
    expect(galatAlasanOrder("😀😀😀😀😀")).toBeNull(); // 5 karakter, .length = 10
    expect(galatAlasanOrder("😀".repeat(ALASAN_ORDER_MAKS))).toBeNull();
    expect(galatAlasanOrder("😀😀")).not.toBeNull();
  });
});

describe("pilihan alasan batal", () => {
  it('"Order dibatalkan" khusus tombol Batalkan order, bukan pilihan dialog Batal biasa', () => {
    expect(ALASAN_BATAL_ORDER).toBe("Order dibatalkan");
    expect(ALASAN_BATAL).not.toContain(ALASAN_BATAL_ORDER);
  });
});
