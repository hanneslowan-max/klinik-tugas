"use client";

// Baca data Pipeline (fungsi web_pipeline_* → rpc()). Semua tulis ada di mutasi.ts.
import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";

/** Akses modul untuk pengguna ini (gerbang menu & layar, §6). */
export function usePipelineSaya() {
  return useQuery({
    queryKey: kunci.pipelineSaya,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_saya"),
    staleTime: 5 * 60_000,
  });
}

/** Daftar lead tersaring (tab/pemilik/pencarian). */
export function usePipelineDaftar(arg: { tab: string; pemilik: number | null; q: string }) {
  return useQuery({
    queryKey: kunci.pipelineDaftar(arg.tab, arg.pemilik, arg.q),
    queryFn: () =>
      rpc(klienBrowser(), "web_pipeline_daftar", {
        p: { tab: arg.tab, pemilik: arg.pemilik ?? undefined, q: arg.q || undefined },
      }),
    placeholderData: (lama) => lama,
  });
}

/** Detail satu lead. */
export function usePipelineLead(id: string) {
  return useQuery({
    queryKey: kunci.pipelineLead(id),
    queryFn: () => rpc(klienBrowser(), "web_pipeline_lead", { p_id: id }),
  });
}

/** Ringkasan bulanan (§4). dasar: 'sp' (default) | 'lead'; bulan 'YYYY-MM' opsional (kosong = semua bulan). */
export function usePipelineRingkas(arg: { bulan: string; dasar: "sp" | "lead" }) {
  return useQuery({
    queryKey: kunci.pipelineRingkas(arg.bulan, arg.dasar),
    queryFn: () =>
      rpc(klienBrowser(), "web_pipeline_ringkas", { p: { dasar: arg.dasar, bulan: arg.bulan || undefined } }),
    placeholderData: (lama) => lama,
  });
}
