import { describe, expect, it } from "vitest";

import { angkaNotif, bacaDari, belumTab, hrefNotif, tabLain, tandaiDibaca, tandaiTabDibaca } from "@/features/notif/dari";
import type { DaftarNotif, Notifikasi } from "@/types/domain";

function notif(x: Partial<Notifikasi> & { id: number }): Notifikasi {
  return {
    jenis: "komentar",
    task: { id: "rtujib0001", name: "L1", deleted: false },
    actor: { id: 100000001, username: "budi santoso", role: "owner" },
    cuplikan: null,
    comment_id: null,
    read_at: null,
    created_at: "2026-10-13T03:00:00.000Z",
    dari: "tim",
    lewat_api: false,
    ...x,
  };
}

const data: DaftarNotif = {
  belum: 5,
  belum_tim: 2,
  belum_agent: 3,
  dari: "agent",
  items: [
    notif({ id: 3, dari: "agent", lewat_api: true }),
    notif({ id: 2, dari: "agent", lewat_api: true, read_at: "2026-10-13T04:00:00.000Z" }),
    notif({ id: 1, dari: "agent", lewat_api: true }),
  ],
};

describe("tab notifikasi di URL", () => {
  it("?dari=agent → agent; kosong / nilai asing → tim", () => {
    expect(bacaDari(new URLSearchParams("dari=agent"))).toBe("agent");
    expect(bacaDari(new URLSearchParams(""))).toBe("tim");
    expect(bacaDari(new URLSearchParams("dari=AGENT"))).toBe("tim");
    expect(bacaDari(new URLSearchParams("dari=tim"))).toBe("tim");
    expect(bacaDari(null)).toBe("tim");
  });
  it("tab bawaan tanpa parameter; tab lain", () => {
    expect(hrefNotif("tim")).toBe("/notif");
    expect(hrefNotif("agent")).toBe("/notif?dari=agent");
    expect(tabLain("tim")).toBe("agent");
    expect(tabLain("agent")).toBe("tim");
  });
});

describe("angka belum dibaca", () => {
  it("per tab, aman bila data belum ada", () => {
    expect(belumTab(data, "tim")).toBe(2);
    expect(belumTab(data, "agent")).toBe(3);
    expect(belumTab(undefined, "agent")).toBe(0);
  });
  it("lencana 99+", () => {
    expect(angkaNotif(7)).toBe("7");
    expect(angkaNotif(99)).toBe("99");
    expect(angkaNotif(100)).toBe("99+");
  });
});

describe("tandai dibaca (optimistis)", () => {
  const kini = "2026-10-13T05:00:00.000Z";
  it("satu item: total & kelompoknya turun satu kali", () => {
    const d = tandaiDibaca(data, 3, kini);
    expect([d.belum, d.belum_tim, d.belum_agent]).toEqual([4, 2, 2]);
    expect(d.items.find((x) => x.id === 3)?.read_at).toBe(kini);
    expect(tandaiDibaca(d, 3, kini)).toBe(d);
  });
  it("item yang sudah dibaca / tidak ada → data tetap", () => {
    expect(tandaiDibaca(data, 2, kini)).toBe(data);
    expect(tandaiDibaca(data, 99, kini)).toBe(data);
  });
  it("item tim menurunkan belum_tim", () => {
    const d = tandaiDibaca({ ...data, items: [notif({ id: 9 })] }, 9, kini);
    expect([d.belum, d.belum_tim, d.belum_agent]).toEqual([4, 1, 3]);
  });
  it("tandai semua di satu tab: angka tab 0, total turun sebanyak yang ditandai server, tab lain utuh", () => {
    const d = tandaiTabDibaca(data, "agent", 3, kini);
    expect([d.belum, d.belum_tim, d.belum_agent]).toEqual([2, 2, 0]);
    expect(d.items.every((x) => x.read_at)).toBe(true);
    expect(d.items.find((x) => x.id === 2)?.read_at).toBe("2026-10-13T04:00:00.000Z");
    expect(tandaiTabDibaca(data, "tim", 2, kini).belum_agent).toBe(3);
  });
});
