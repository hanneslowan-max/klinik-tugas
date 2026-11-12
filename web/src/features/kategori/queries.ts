"use client";

// Kategori pekerjaan (28 Okt 2026): Jelajah per kategori (web_kategori_kerja), isi satu kategori lintas list
// (web_tugas_kategori). Daftar kategori juga dipakai pemilih kategori di detail tugas & form Tugas baru.
import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";

/** Segmen URL /jelajah/<id> untuk tugas tanpa kategori. */
export const TANPA_KATEGORI = "tanpa";

export function useKategoriKerja() {
  return useQuery({ queryKey: kunci.kategoriKerja, queryFn: () => rpc(klienBrowser(), "web_kategori_kerja"), staleTime: 60_000 });
}

/** Isi satu kategori (null = tanpa kategori); `selesai` = ikut muat tugas yang terakhir selesai. */
export function useIsiKategori(id: string | null, selesai: boolean) {
  return useQuery({
    queryKey: kunci.isiKategori(id, selesai),
    queryFn: () => rpc(klienBrowser(), "web_tugas_kategori", { p_kategori: id, p_selesai: selesai }),
    // alih "Tampilkan selesai" tidak mengosongkan layar: data lama tetap tampil sampai yang baru tiba (kategori sama)
    placeholderData: (lama, kueri) => (kueri?.queryKey[1] === (id ?? TANPA_KATEGORI) ? lama : undefined),
  });
}
