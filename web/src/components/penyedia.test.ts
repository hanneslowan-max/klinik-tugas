import { describe, expect, it } from "vitest";

import { buatQueryClient } from "@/components/penyedia";
import { SEGAR_URL } from "@/features/lampiran/api";

describe("buatQueryClient", () => {
  it("gcTime bawaan 30 menit, staleTime 30 dtk", () => {
    const q = buatQueryClient().getDefaultOptions().queries!;
    expect(q.gcTime).toBe(1_800_000);
    expect(q.staleTime).toBe(30_000);
    expect(q.refetchOnWindowFocus).toBe(true);
  });

  it("gcTime bawaan < SEGAR_URL (signed URL lampiran tetap terbuang sebelum kedaluwarsa)", () => {
    expect(buatQueryClient().getDefaultOptions().queries!.gcTime as number).toBeLessThan(SEGAR_URL);
  });
});
