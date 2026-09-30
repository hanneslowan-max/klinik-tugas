import { describe, expect, it } from "vitest";

import { kolomKartu, nilaiUrut, rencanaUrut, susunanDari, urutStatus } from "@/features/list/urutan";
import type { StatusList, Tugas } from "@/types/domain";

const statuses: StatusList[] = [
  { status: "complete", type: "closed", color: "#6bc950", orderindex: 9 },
  { status: "to do", type: "open", color: "#d3d3d3", orderindex: 0 },
  { status: "in progress", type: "custom", color: "#4194f6", orderindex: 1 },
];

function tugas(id: string, x: Partial<Tugas> = {}): Tugas {
  return { id, status: "to do", orderindex: null, sumber: "app", ...x } as Tugas;
}

describe("susunan papan", () => {
  it("kolom urut orderindex; kolom selesai kosong kecuali tampil selesai", () => {
    expect(urutStatus(statuses).map((s) => s.status)).toEqual(["to do", "in progress", "complete"]);
    const tampak = [tugas("a"), tugas("b", { status: "complete" }), tugas("c", { status: "in progress" })];
    expect(susunanDari(statuses, tampak, false)).toEqual({ complete: [], "to do": ["a"], "in progress": ["c"] });
    expect(susunanDari(statuses, tampak, true).complete).toEqual(["b"]);
    expect(kolomKartu({ x: ["a"], y: ["b"] }, "b")).toBe("y");
    expect(kolomKartu({ x: ["a"] }, "z")).toBeUndefined();
  });
  it("orderindex numeric dari DB bisa berupa string", () => {
    expect(nilaiUrut(tugas("a", { orderindex: "1500.5" }))).toBe(1500.5);
    expect(nilaiUrut(tugas("a", { orderindex: null }))).toBeNull();
    expect(nilaiUrut(undefined)).toBeNull();
  });
});

describe("rencanaUrut", () => {
  const tidakKunci = () => false;
  it("di antara tetangga / sesudah / sebelum", () => {
    const peta = new Map([tugas("a", { orderindex: 1000 }), tugas("x"), tugas("b", { orderindex: 2000 })].map((t) => [t.id, t]));
    expect(rencanaUrut(["a", "x", "b"], "x", peta, false, tidakKunci)).toEqual({ orderindex: 1500, penomoran: [] });
    expect(rencanaUrut(["a", "x"], "x", peta, true, tidakKunci)).toEqual({ orderindex: 1001, penomoran: [] });
    expect(rencanaUrut(["x", "b"], "x", peta, true, tidakKunci)).toEqual({ orderindex: 1999, penomoran: [] });
  });
  it("pindah kolom tanpa tetangga berurutan → hanya status", () => {
    const peta = new Map([tugas("x"), tugas("y")].map((t) => [t.id, t]));
    expect(rencanaUrut(["x"], "x", peta, true, tidakKunci)).toEqual({ orderindex: null, penomoran: [] });
    expect(rencanaUrut(["y", "x"], "x", peta, true, tidakKunci)).toEqual({ orderindex: null, penomoran: [] });
  });
  it("urut dalam kolom tanpa orderindex → nomor (i+1)*1000 untuk kartu yang tidak terkunci", () => {
    const peta = new Map([tugas("x"), tugas("k", { sumber: "clickup" }), tugas("y")].map((t) => [t.id, t]));
    const kunci = (t: Tugas) => t.sumber === "clickup";
    expect(rencanaUrut(["y", "k", "x"], "x", peta, false, kunci)).toEqual({
      orderindex: null,
      penomoran: [
        { id: "y", orderindex: 1000 },
        { id: "x", orderindex: 2000 },
      ],
    });
  });
});
