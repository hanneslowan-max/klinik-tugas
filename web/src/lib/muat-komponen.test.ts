import { afterEach, describe, expect, it, vi } from "vitest";

import { muatKomponen } from "@/lib/muat-komponen";

const Asli = () => null;

describe("muatKomponen (loader next/dynamic)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("impor berhasil → komponen asli", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", { removeItem: () => {} });
    const K = await muatKomponen(() => Promise.resolve({ X: Asli }), (m) => m.X, "papan");
    expect(K).toBe(Asli);
  });

  it("jaringan putus → TIDAK menolak (React.lazy akan menyimpan penolakan selamanya): komponen pemulih", async () => {
    vi.stubGlobal("window", { location: { reload: vi.fn() } });
    vi.stubGlobal("navigator", { onLine: false });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const muat = vi.fn(() => Promise.reject(new Error("Loading chunk 4923 failed.")));
    const K = await muatKomponen(muat, (m: { X: typeof Asli }) => m.X, "papan");
    expect(typeof K).toBe("function");
    expect(K).not.toBe(Asli);
    expect(muat).toHaveBeenCalledTimes(1); // offline: tidak dicoba ulang di loader, tidak muat ulang halaman
    expect((window as unknown as { location: { reload: () => void } }).location.reload).not.toHaveBeenCalled();
  });

  it("di server galat tetap dilempar", async () => {
    await expect(muatKomponen(() => Promise.reject(new Error("x")), (m: { X: typeof Asli }) => m.X, "papan")).rejects.toThrow("x");
  });
});
