"use client";

// Mutasi tugas bersama (dipakai List/Board, Detail, Tugas Saya). Setiap mutasi menyegarkan layar yang terdampak.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

/** Segarkan semua tampilan tugas (daftar, Tugas Saya, cari, hitungan struktur) + detail kartu tertentu. */
export function segarkanTugas(qc: QueryClient, id?: string) {
  void qc.invalidateQueries({ queryKey: kunci.semuaDaftar });
  void qc.invalidateQueries({ queryKey: kunci.semuaTugasSaya });
  void qc.invalidateQueries({ queryKey: kunci.semuaCari });
  void qc.invalidateQueries({ queryKey: kunci.struktur });
  if (id) void qc.invalidateQueries({ queryKey: kunci.detail(id) });
}

export type BodyUbahTugas = {
  name?: string;
  status?: string;
  markdown_description?: string;
  due?: string | null;
  start_date?: string | null;
  priority?: number | null;
  assignees?: { add: number[]; rem: number[] };
};

/** web_ubah_tugas dengan cek versi (409 KONFLIK_001 bila kartu sudah diubah orang lain). */
export function useUbahTugas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; versi: number; body: BodyUbahTugas }) =>
      rpc(klienBrowser(), "web_ubah_tugas", { p_task: v.id, p_body: v.body as Json, p_versi: v.versi }),
    onSettled: (_d, _e, v) => segarkanTugas(qc, v.id),
  });
}

export type BodyBuatTugas = {
  name: string;
  status?: string;
  markdown?: string;
  due?: string;
  priority?: number;
  assignees?: number[];
  parent_id?: string;
};

export function useBuatTugas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { list: string; body: BodyBuatTugas }) =>
      rpc(klienBrowser(), "web_buat_tugas", { p_list: v.list, p_body: v.body as Json }),
    onSuccess: (t) => segarkanTugas(qc, t.parent_id ?? undefined),
  });
}
