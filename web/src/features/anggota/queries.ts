"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Anggota } from "@/types/domain";

export function useAnggota() {
  return useQuery({ queryKey: kunci.anggota, queryFn: () => rpc(klienBrowser(), "web_anggota"), staleTime: 5 * 60_000 });
}

/** Anggota yang boleh di-assign / di-mention: aktif & bukan bot. */
export function bisaDitugaskan(m: Anggota) {
  return m.aktif && m.role !== "bot";
}

export function useAnggotaAktif() {
  const q = useAnggota();
  return { ...q, data: q.data?.filter(bisaDitugaskan) };
}
