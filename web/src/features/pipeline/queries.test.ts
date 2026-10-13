import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { buatQueryClient } from "@/components/penyedia";
import { opsiGcDaftar } from "@/features/pipeline/queries";
import { kunci } from "@/lib/kunci-query";

// usePipelineDaftar memakai opsiGcDaftar: gcTime khusus hanya untuk varian cari; tanpa cari harus ikut bawaan
// (30 mnt), bukan jatuh ke 5 mnt karena kunci `gcTime: undefined` menimpa bawaan.

describe("gcTime daftar Pipeline", () => {
  it("tanpa cari = bawaan 30 mnt; dengan cari = 5 mnt", () => {
    const qc = buatQueryClient();
    for (const [q, harap] of [
      ["", 30 * 60_000],
      ["sejahtera", 5 * 60_000],
    ] as const) {
      const queryKey = kunci.pipelineDaftar("semua", null, q);
      const obs = new QueryObserver(qc, { queryKey, queryFn: async () => 1, enabled: false, ...opsiGcDaftar(q) });
      const query = qc.getQueryCache().find({ queryKey });
      expect(obs.options.gcTime).toBe(harap);
      expect((query as unknown as { gcTime: number }).gcTime).toBe(harap);
    }
  });
});
