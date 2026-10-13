"use client";

// Baca data Pipeline (fungsi web_pipeline_* → rpc()). Semua tulis ada di mutasi.ts.
import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { PipelineSaya } from "@/types/domain";

/**
 * Akses modul untuk pengguna ini (gerbang menu & layar, §6). `awal` = hasil server dari layout (app) (KerangkaApp
 * meneruskannya) → menu & GerbangPipeline siap sejak HTML pertama. Umur data = jam klien (bukan jam server).
 */
export function usePipelineSaya(awal?: PipelineSaya) {
  return useQuery({
    queryKey: kunci.pipelineSaya,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_saya"),
    initialData: awal,
    staleTime: 5 * 60_000,
  });
}

/**
 * gcTime daftar lead: varian per kata cari (bisa ±1 MB tiap varian) dibuang dalam 5 mnt; daftar tanpa cari ikut
 * bawaan QueryClient (30 mnt). Kunci gcTime HANYA dipasang bila ada cari: `gcTime: undefined` menimpa bawaan.
 */
export const opsiGcDaftar = (q: string): { gcTime?: number } => (q ? { gcTime: 5 * 60_000 } : {});

/** Daftar lead tersaring (tab/pemilik/pencarian). */
export function usePipelineDaftar(arg: { tab: string; pemilik: number | null; q: string }) {
  return useQuery({
    queryKey: kunci.pipelineDaftar(arg.tab, arg.pemilik, arg.q),
    queryFn: () =>
      rpc(klienBrowser(), "web_pipeline_daftar", {
        p: { tab: arg.tab, pemilik: arg.pemilik ?? undefined, q: arg.q || undefined },
      }),
    // data lama dipakai selama mengetik cari / ganti pemilik di tab yang SAMA; ganti tab = tampilkan memuat (jangan
    // menampilkan isi & hitungan tab sebelumnya di bawah judul tab baru)
    placeholderData: (lama, kueriLama) => (kueriLama?.queryKey[2] === arg.tab ? lama : undefined),
    ...opsiGcDaftar(arg.q),
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

/** Papan pribadi: kategori buatan pengguna ini + penempatan lead {lead_id: kategori_id}. */
export function usePipelineKategori() {
  return useQuery({
    queryKey: kunci.pipelineKategori,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_kategori"),
  });
}
