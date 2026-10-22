import { describe, expect, it } from "vitest";

import { jenisPratinjau, tebakPemisah, uraiTabel } from "@/features/lampiran/pratinjau";

const berkas = (mimetype: string | null, title: string, storage_path: string | null = "t/x/berkas") => ({
  mimetype,
  extension: null,
  title,
  storage_path,
});

describe("jenisPratinjau", () => {
  it("gambar, PDF, teks, tabel, DOCX; selain itu null", () => {
    expect(jenisPratinjau(berkas("image/png", "a.png"))).toBe("gambar");
    expect(jenisPratinjau(berkas("image/heic", "foto.HEIC"))).toBe("gambar");
    expect(jenisPratinjau(berkas("application/pdf", "sp.pdf"))).toBe("pdf");
    expect(jenisPratinjau(berkas("text/plain", "catatan.txt"))).toBe("teks");
    expect(jenisPratinjau(berkas("text/csv", "data.csv"))).toBe("tabel");
    expect(jenisPratinjau(berkas("application/vnd.ms-excel", "ekspor.csv"))).toBe("tabel"); // CSV dari Excel Windows
    expect(jenisPratinjau(berkas("application/vnd.ms-excel", "lama.xls"))).toBeNull();
    expect(jenisPratinjau(berkas("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "p.docx"))).toBe("docx");
    expect(jenisPratinjau(berkas("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x.xlsx"))).toBeNull();
    expect(jenisPratinjau(berkas("application/octet-stream", "tanpa-ekstensi"))).toBeNull();
  });

  it("tanpa berkas di Storage (tautan ClickUp saja) → null", () => {
    expect(jenisPratinjau(berkas("image/png", "a.png", null))).toBeNull();
  });
});

describe("uraiTabel", () => {
  it("kutip, koma di dalam kutip, kutip ganda, baris baru di dalam kutip, CRLF, BOM", () => {
    const csv = '﻿nama,catatan\r\n"PT A, Tbk","kata ""halo"""\r\nPT B,"dua\nbaris"\r\n';
    expect(uraiTabel(csv, ",")).toEqual({
      baris: [
        ["nama", "catatan"],
        ["PT A, Tbk", 'kata "halo"'],
        ["PT B", "dua\nbaris"],
      ],
      total: 3,
    });
  });

  it("batas baris: total tetap dihitung; baris kosong dilewati; tanpa baris baru di akhir", () => {
    const r = uraiTabel("a;b\n1;2\n\n3;4", ";", 2);
    expect(r).toEqual({ baris: [["a", "b"], ["1", "2"]], total: 3 });
  });

  it("tebakPemisah: TSV = tab; CSV Excel Indonesia ';'; bawaan ','", () => {
    expect(tebakPemisah("a\tb\n", "tsv")).toBe("\t");
    expect(tebakPemisah("nama;kota;nilai\nx;y;1,5", "csv")).toBe(";");
    expect(tebakPemisah("nama,kota\n", "csv")).toBe(",");
    expect(tebakPemisah("satu kolom", "csv")).toBe(",");
  });
});
