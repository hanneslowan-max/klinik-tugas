import { describe, expect, it } from "vitest";

import { teksPolosMarkdown } from "@/lib/teks";

describe("teksPolosMarkdown (cadangan <Markdown> sebelum lib/markdown termuat)", () => {
  it("membuang tanda tebal/miring/kode/coret, mempertahankan isinya", () => {
    expect(teksPolosMarkdown("Contoh deskripsi **markdown**.")).toBe("Contoh deskripsi markdown.");
    expect(teksPolosMarkdown("a _miring_ dan *miring* lalu `kode` ~~coret~~ __tebal__")).toBe("a miring dan miring lalu kode coret tebal");
  });

  it("tautan & gambar → teksnya, URL polos tetap", () => {
    expect(teksPolosMarkdown("[teks](https://contoh.test/a) dan ![logo](https://contoh.test/l.png) https://x.test/b")).toBe(
      "teks dan logo https://x.test/b",
    );
    expect(teksPolosMarkdown('[judul](https://contoh.test "Judul")')).toBe("judul");
    expect(teksPolosMarkdown("[klik](javascript:alert(1)) ![x](data:x(1))")).toBe("klik x");
  });

  it("judul, kutipan, butir, pagar kode, garis", () => {
    const md = "# Judul\n## Sub ##\n> kutip\n- satu\n* dua\n  + tiga\n1. nomor\n```js\nkode()\n```\n---\nakhir";
    expect(teksPolosMarkdown(md)).toBe("Judul\nSub\nkutip\n• satu\n• dua\n  • tiga\n1. nomor\nkode()\nakhir");
  });

  it("tidak merusak teks biasa: snake_case, perkalian, garis bawah di tengah kata, escape", () => {
    expect(teksPolosMarkdown("nama_kolom_baru 2 * 3 * 4 = 24")).toBe("nama_kolom_baru 2 * 3 * 4 = 24");
    expect(teksPolosMarkdown("harga \\*bukan miring\\*")).toBe("harga *bukan miring*");
    expect(teksPolosMarkdown("Halo **tebal**\n\n<img src=x onerror=alert(1)>")).toBe("Halo tebal\n\n<img src=x onerror=alert(1)>");
  });

  it("waktu linear untuk masukan jahat (jalan di server pada muat penuh /t): 300 KB tiap pola < 300 ms", () => {
    const jahat = [" **x", " __x", " ~~x", " *x", " _x", "[a", "![a](", "[a](b(", "[a]((", "`a", "# a", "> a"];
    for (const potong of jahat) {
      for (const md of [potong.repeat(75_000), `${potong.repeat(400)}\n`.repeat(190)]) {
        const t0 = performance.now();
        teksPolosMarkdown(md);
        expect(performance.now() - t0, `pola ${JSON.stringify(potong)}`).toBeLessThan(300);
      }
    }
  });

  it("baris sangat panjang tidak diolah inline (tetap utuh)", () => {
    const panjang = `**a** ${"x".repeat(2100)}`;
    expect(teksPolosMarkdown(panjang)).toBe(panjang);
  });

  it("kosong / null → string kosong", () => {
    expect(teksPolosMarkdown(null)).toBe("");
    expect(teksPolosMarkdown(undefined)).toBe("");
    expect(teksPolosMarkdown("")).toBe("");
  });
});
