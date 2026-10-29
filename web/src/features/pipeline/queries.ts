"use client";

// Baca data Pipeline (fungsi web_pipeline_* → rpc()). Semua tulis ada di mutasi.ts.
import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { MetrikDasbor, PipelineSaya, SaringPelanggan, UrutPelanggan } from "@/types/domain";

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

/** Sales yang sah sebagai tujuan Ganti sales (owner + akses admin/rep, aktif). */
export function useSalesPipeline(aktif = true) {
  return useQuery({ queryKey: kunci.pipelineSales, queryFn: () => rpc(klienBrowser(), "web_pipeline_sales"), staleTime: 5 * 60_000, enabled: aktif });
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

/** Dasbor Tahap 1: bulan 'YYYY-MM' (kosong = bulan berjalan). Cakupan (penuh / milik saya) ditentukan server. */
export function useDasborPipeline(bulan: string) {
  return useQuery({
    queryKey: kunci.pipelineDasbor(bulan),
    queryFn: () => rpc(klienBrowser(), "web_pipeline_dasbor", { p: { bulan: bulan || undefined } }),
    placeholderData: (lama) => lama,
  });
}

/** Dasbor Tahap 2 (bagian 5–10 untuk admin/baca; kartu bayar & rapikan untuk sales). Dimuat terpisah dari bagian 1–4. */
export function useDasborLanjut(bulan: string) {
  return useQuery({
    queryKey: kunci.pipelineDasborLanjut(bulan),
    queryFn: () => rpc(klienBrowser(), "web_pipeline_dasbor_lanjut", { p: { bulan: bulan || undefined } }),
    placeholderData: (lama) => lama,
  });
}

/** Id lead di balik satu angka bagian 2 dasbor (klik angka → daftar lead). pemilik: id | 'tanpa' | '' (semua). */
export function useDasborIds(arg: { metrik: MetrikDasbor | null; pemilik: string; bulan: string }) {
  return useQuery({
    queryKey: kunci.pipelineDasborIds(arg.metrik ?? "", arg.pemilik, arg.bulan),
    queryFn: () =>
      rpc(klienBrowser(), "web_pipeline_dasbor_ids", {
        p: { metrik: arg.metrik, pemilik: arg.pemilik || undefined, bulan: arg.bulan || undefined },
      }),
    enabled: arg.metrik != null,
  });
}

/** Papan pribadi: kategori buatan pengguna ini + penempatan lead {lead_id: kategori_id}. */
export function usePipelineKategori() {
  return useQuery({
    queryKey: kunci.pipelineKategori,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_kategori"),
  });
}

// -------------------------------------------------------------------- database pelanggan (20261017120000)
/** Daftar pelanggan + statistik lead/order. Data lama dipakai selama mengetik cari / ganti saringan. */
export function usePelangganDaftar(arg: { q: string; saring: SaringPelanggan; urut: UrutPelanggan }) {
  return useQuery({
    queryKey: kunci.pipelinePelangganDaftar(arg.q, arg.saring, arg.urut),
    queryFn: () =>
      rpc(klienBrowser(), "web_pipeline_pelanggan_daftar", {
        p: { q: arg.q || undefined, saring: arg.saring, urut: arg.urut },
      }),
    placeholderData: (lama) => lama,
    ...opsiGcDaftar(arg.q),
  });
}

/** Detail satu pelanggan: kontak, ringkasan, log lead/order, riwayat gabung (atau {digabung_ke} untuk tautan lama). */
export function usePelanggan(id: string) {
  return useQuery({
    queryKey: kunci.pipelinePelanggan(id),
    queryFn: () => rpc(klienBrowser(), "web_pipeline_pelanggan", { p_id: id }),
  });
}

/** Saran pelanggan dobel (admin saja). */
export function usePelangganDobel() {
  return useQuery({
    queryKey: kunci.pipelinePelangganDobel,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_pelanggan_dobel"),
  });
}
