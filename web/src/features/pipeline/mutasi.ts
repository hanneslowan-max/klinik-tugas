"use client";

// Tulis data Pipeline (fungsi web_pipeline_* SECURITY DEFINER). Setiap mutasi menyegarkan daftar + detail +
// ringkasan (invalidasi akar kunci.semuaPipeline). Pesan galat DB (Bahasa Indonesia) diteruskan via GalatApi.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import type { PelangganCari, ProdukLead, SatuanItem, SumberLead } from "@/types/domain";

function segarkanPipeline(qc: QueryClient, id?: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: kunci.semuaPipeline }),
    id ? qc.invalidateQueries({ queryKey: kunci.pipelineLead(id) }) : null,
  ]);
}

export type ItemMasuk = { produk: ProdukLead; qty: number; satuan?: SatuanItem; spesifikasi?: string | null };

export type BodyLeadBaru = {
  sumber: SumberLead;
  tanggal_masuk?: string;
  konfirmasi?: boolean;
  pelanggan_id?: string;
  pelanggan?: { nama: string; jenis?: "perusahaan" | "perorangan"; kota?: string | null };
  kontak?: { nama?: string | null; telepon?: string | null; jabatan?: string | null };
  pemilik?: number;
  kebutuhan?: string | null;
  catatan?: string | null;
  items: ItemMasuk[];
};

export function useLeadBaru() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyLeadBaru) => rpc(klienBrowser(), "web_pipeline_lead_buat", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead.id),
  });
}

export type BodyFu = {
  lead_id: string;
  jenis: string;
  hasil?: string | null;
  rencana_berikutnya?: string | null;
};

export function useFuCatat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyFu) => rpc(klienBrowser(), "web_pipeline_fu_catat", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead.id),
  });
}

export type BodyTahap = {
  lead_id: string;
  aksi: "penawaran" | "order" | "batal" | "alihkan";
  nilai_penawaran?: number | null;
  nomor?: string;
  no_sp?: string;
  tanggal_sp?: string;
  nilai_transaksi?: number;
  alasan_batal?: string;
  alasan_batal_lain?: string | null;
  dialihkan_ke?: string;
};

export function useTahap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyTahap) => rpc(klienBrowser(), "web_pipeline_tahap", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead.id),
  });
}

export type BodyLeadUbah = {
  lead_id: string;
  kebutuhan?: string | null;
  catatan?: string | null;
  sumber?: SumberLead;
  klaim?: boolean;
  items?: ItemMasuk[];
};

export function useLeadUbah() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyLeadUbah) => rpc(klienBrowser(), "web_pipeline_lead_ubah", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead.id),
  });
}

/** Pencarian pelanggan (dedup saat input lead baru). Dipanggil imperatif (debounce di komponen). */
export function cariPelanggan(q: string): Promise<PelangganCari[]> {
  return rpc(klienBrowser(), "web_pipeline_pelanggan_cari", { p_q: q });
}
