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

  it("kosong / null → string kosong", () => {
    expect(teksPolosMarkdown(null)).toBe("");
    expect(teksPolosMarkdown(undefined)).toBe("");
    expect(teksPolosMarkdown("")).toBe("");
  });
});
