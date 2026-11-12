"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { ListDatar, Struktur } from "@/types/domain";

export function useStruktur() {
  return useQuery({ queryKey: kunci.struktur, queryFn: () => rpc(klienBrowser(), "web_struktur"), staleTime: 60_000 });
}

/** Semua list (datar) dari struktur, dengan label "Space › Folder › List". */
export function listDatar(s: Struktur | undefined, termasukArsip = false): ListDatar[] {
  if (!s) return [];
  const hasil: ListDatar[] = [];
  for (const sp of s.spaces) {
    if (sp.archived && !termasukArsip) continue;
    for (const f of sp.folders) {
      if (f.archived && !termasukArsip) continue;
      for (const l of f.lists) {
        if (l.archived && !termasukArsip) continue;
        hasil.push({ ...l, space: sp, folder: f, label: `${sp.name} › ${f.hidden ? "" : `${f.name} › `}${l.name}` });
      }
    }
    for (const l of sp.lists) {
      if (l.archived && !termasukArsip) continue;
      hasil.push({ ...l, space: sp, folder: null, label: `${sp.name} › ${l.name}` });
    }
  }
  return hasil;
}
