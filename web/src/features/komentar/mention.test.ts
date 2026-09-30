import { describe, expect, it } from "vitest";

import { cariMention, sisipMention } from "@/features/komentar/mention";

const ANGGOTA = [
  { username: "budi santoso", nama: "Budi Santoso (uji)" },
  { username: "citra lestari", nama: "Citra Lestari (uji)" },
  { username: "eka wulandari", nama: null },
];

describe("cariMention", () => {
  it("menyarankan dari awal username, nama, atau kata dalam username", () => {
    expect(cariMention(ANGGOTA, "Mohon cek @bud", 14)?.pilihan.map((x) => x.username)).toEqual(["budi santoso"]);
    expect(cariMention(ANGGOTA, "@lest", 5)?.pilihan.map((x) => x.username)).toEqual(["citra lestari"]);
    expect(cariMention(ANGGOTA, "(@", 2)?.pilihan).toHaveLength(3);
  });

  it("posisi awal = indeks '@'", () => {
    expect(cariMention(ANGGOTA, "halo @ci", 8)?.awal).toBe(5);
  });

  it("tidak aktif di tengah kata / email / sesudah spasi yang bukan bagian username", () => {
    expect(cariMention(ANGGOTA, "a@bud", 5)).toBeNull();
    expect(cariMention(ANGGOTA, "@xyz", 4)).toBeNull();
    expect(cariMention(ANGGOTA, "@eka ", 5)).not.toBeNull();
    expect(cariMention(ANGGOTA, "@lestari ", 9)).toBeNull();
  });
});

describe("sisipMention", () => {
  it("mengganti '@kata' dengan username lengkap + spasi", () => {
    expect(sisipMention("Mohon cek @bud!", 10, 14, "budi santoso")).toEqual({ teks: "Mohon cek @budi santoso !", kursor: 24 });
  });
});
