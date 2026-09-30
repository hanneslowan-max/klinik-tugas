import { describe, expect, it } from "vitest";

import { ABJAD_SANDI, MIN_SANDI, PANJANG_SANDI, sandiSementara } from "@/features/admin/anggota/sandi";

describe("sandiSementara", () => {
  it("12 karakter dari abjad tanpa karakter mirip", () => {
    for (let i = 0; i < 50; i++) {
      const s = sandiSementara();
      expect(s).toHaveLength(PANJANG_SANDI);
      expect(s.length).toBeGreaterThanOrEqual(MIN_SANDI);
      expect([...s].every((c) => ABJAD_SANDI.includes(c))).toBe(true);
      expect(s).not.toMatch(/[0O1lI]/);
    }
  });
  it("nilai acak di atas kelipatan panjang abjad dibuang (tanpa bias modulo)", () => {
    const tinggi = 0xffff_ffff; // ≥ batas → dibuang
    let panggil = 0;
    const s = sandiSementara(3, (isi) => {
      panggil++;
      isi.fill(panggil === 1 ? tinggi : 0);
      if (panggil === 1) isi[2] = 1;
      return isi;
    });
    expect(s).toBe(`${ABJAD_SANDI[1]}${ABJAD_SANDI[0]}${ABJAD_SANDI[0]}`);
  });
});
