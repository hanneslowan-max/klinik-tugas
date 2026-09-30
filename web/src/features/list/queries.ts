"use client";

// Data layar List/Board: web_daftar + pindah kartu di Board (web_ubah_tugas status dengan versi, lalu web_urut).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { segarkanTugas } from "@/features/tugas/mutasi";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Tugas } from "@/types/domain";

/** web_daftar. Ganti filter selesai / mode di list yang sama tetap menampilkan data lama sampai data baru tiba. */
export function useDaftarList(listId: string, termasukSelesai: boolean) {
  return useQuery({
    queryKey: kunci.daftar(listId, termasukSelesai),
    queryFn: () => rpc(klienBrowser(), "web_daftar", { p_list: listId, p_include_closed: termasukSelesai }),
    placeholderData: (lama, qLama) => (qLama?.queryKey[1] === listId ? lama : undefined),
  });
}

export type PindahKartu = {
  tugas: Tugas;
  /** status kolom tujuan */
  ke: string;
  orderindex: number | null;
  penomoran: { id: string; orderindex: number }[];
};

/**
 * Pindah kartu di Board. Status berubah lewat web_ubah_tugas (cek versi → 409 KONFLIK_001), urutan lewat web_urut.
 * Selesai (berhasil/gagal) sesudah daftar dimuat ulang, supaya papan tidak sempat melompat ke susunan lama.
 */
export function usePindahKartu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tugas, ke, orderindex, penomoran }: PindahKartu) => {
      const k = klienBrowser();
      if (ke !== tugas.status) await rpc(k, "web_ubah_tugas", { p_task: tugas.id, p_body: { status: ke }, p_versi: tugas.versi });
      if (orderindex !== null) await rpc(k, "web_urut", { p_task: tugas.id, p_orderindex: orderindex });
      // berurutan (bukan paralel) supaya urutan tulis sama dengan web lama
      else for (const p of penomoran) await rpc(k, "web_urut", { p_task: p.id, p_orderindex: p.orderindex });
    },
    onSettled: async (_d, _e, v) => {
      segarkanTugas(qc, v.tugas.id);
      await qc.invalidateQueries({ queryKey: kunci.semuaDaftar }, { cancelRefetch: false });
    },
  });
}
