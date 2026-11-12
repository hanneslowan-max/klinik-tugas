import { beforeEach, describe, expect, it, vi } from "vitest";

import { aturTahanan, jalankanAtauTunda, kosongkanTahanan, sedangDitahan } from "@/features/realtime/tahanan";

describe("penahan penyegaran real-time", () => {
  beforeEach(() => kosongkanTahanan());

  it("tanpa tahanan, aksi langsung jalan", () => {
    const aksi = vi.fn();
    expect(jalankanAtauTunda("daftar", aksi)).toBe(false);
    expect(aksi).toHaveBeenCalledTimes(1);
  });

  it("selama ditahan, aksi ditunda lalu jalan sekali saat dilepas", () => {
    const pertama = vi.fn();
    const kedua = vi.fn();
    aturTahanan("detail:abc", true);
    expect(sedangDitahan("detail:abc")).toBe(true);
    expect(jalankanAtauTunda("detail:abc", pertama)).toBe(true);
    expect(jalankanAtauTunda("detail:abc", kedua)).toBe(true);
    expect(pertama).not.toHaveBeenCalled();
    aturTahanan("detail:abc", false);
    expect(pertama).not.toHaveBeenCalled(); // aksi tertunda terakhir menang
    expect(kedua).toHaveBeenCalledTimes(1);
    aturTahanan("detail:abc", false);
    expect(kedua).toHaveBeenCalledTimes(1);
  });

  it("tahanan per nama tidak saling memengaruhi", () => {
    const aksi = vi.fn();
    aturTahanan("detail:abc", true);
    expect(jalankanAtauTunda("detail:xyz", aksi)).toBe(false);
    expect(aksi).toHaveBeenCalledTimes(1);
  });
});
