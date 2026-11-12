import { describe, expect, it } from "vitest";

import { persenKodeDiLead, totalBraid } from "@/features/pipeline/klik-iklan";

describe("persenKodeDiLead", () => {
  it("klik 0 → — (belum bisa dihitung)", () => {
    expect(persenKodeDiLead({ klik: 0, kode_di_lead: 0 })).toBe("—");
  });
  it("dibulatkan ke persen terdekat", () => {
    expect(persenKodeDiLead({ klik: 7, kode_di_lead: 6 })).toBe("86%");
    expect(persenKodeDiLead({ klik: 3, kode_di_lead: 3 })).toBe("100%");
    expect(persenKodeDiLead({ klik: 45, kode_di_lead: 0 })).toBe("0%");
  });
});

describe("totalBraid", () => {
  it("menjumlah gbraid/wbraid 30 hari semua domain", () => {
    expect(totalBraid([{ h30: { braid: 2 } }, { h30: { braid: 1 } }])).toBe(3);
    expect(totalBraid([])).toBe(0);
  });
});
