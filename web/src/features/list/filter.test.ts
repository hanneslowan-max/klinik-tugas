import { describe, expect, it } from "vitest";

import { bacaFilter, bacaMode, jumlahFilterAktif, lolosFilter, urlList, type FilterList } from "@/features/list/filter";
import type { Tugas } from "@/types/domain";

const kosong: FilterList = { a: "", s: "", d: "", selesai: false };

function tugas(x: Partial<Tugas>): Tugas {
  return { id: "t1", status: "to do", selesai: false, due_wib: null, assignees: [], ...x } as Tugas;
}

describe("filter di URL", () => {
  it("membaca mode & filter; nilai due tak dikenal diabaikan", () => {
    const q = new URLSearchParams("v=board&a=saya&s=in%20progress&d=telat&selesai=1");
    expect(bacaMode(q)).toBe("board");
    expect(bacaFilter(q)).toEqual({ a: "saya", s: "in progress", d: "telat", selesai: true });
    expect(bacaMode(new URLSearchParams(""))).toBe("daftar");
    expect(bacaFilter(new URLSearchParams("d=besok")).d).toBe("");
  });
  it("menulis URL tanpa parameter kosong, urutan v·a·s·d·selesai", () => {
    expect(urlList("rlujib0001", "daftar", kosong)).toBe("/l/rlujib0001");
    expect(urlList("rlujib0001", "board", { a: "7", s: "to do", d: "hari_ini", selesai: true })).toBe(
      "/l/rlujib0001?v=board&a=7&s=to+do&d=hari_ini&selesai=1",
    );
  });
  it("menghitung filter aktif", () => {
    expect(jumlahFilterAktif(kosong)).toBe(0);
    expect(jumlahFilterAktif({ a: "saya", s: "", d: "telat", selesai: true })).toBe(3);
  });
});

describe("lolosFilter", () => {
  const hariIni = "2026-09-30";
  const milikDua = tugas({ assignees: [{ id: 2, username: "citra" }] });
  it("assignee: saya / kosong / id anggota", () => {
    expect(lolosFilter(milikDua, { ...kosong, a: "saya" }, 2, hariIni)).toBe(true);
    expect(lolosFilter(milikDua, { ...kosong, a: "saya" }, 3, hariIni)).toBe(false);
    expect(lolosFilter(milikDua, { ...kosong, a: "kosong" }, 2, hariIni)).toBe(false);
    expect(lolosFilter(tugas({}), { ...kosong, a: "kosong" }, 2, hariIni)).toBe(true);
    expect(lolosFilter(milikDua, { ...kosong, a: "2" }, 9, hariIni)).toBe(true);
    expect(lolosFilter(milikDua, { ...kosong, a: "5" }, 9, hariIni)).toBe(false);
  });
  it("status & due", () => {
    expect(lolosFilter(tugas({ status: "complete" }), { ...kosong, s: "to do" }, 1, hariIni)).toBe(false);
    expect(lolosFilter(tugas({ due_wib: "2026-09-29" }), { ...kosong, d: "telat" }, 1, hariIni)).toBe(true);
    expect(lolosFilter(tugas({ due_wib: "2026-09-30" }), { ...kosong, d: "telat" }, 1, hariIni)).toBe(false);
    expect(lolosFilter(tugas({ due_wib: null }), { ...kosong, d: "tanpa_due" }, 1, hariIni)).toBe(true);
    // kartu selesai tidak punya kategori due
    expect(lolosFilter(tugas({ due_wib: "2026-09-01", selesai: true }), { ...kosong, d: "telat" }, 1, hariIni)).toBe(false);
  });
});
