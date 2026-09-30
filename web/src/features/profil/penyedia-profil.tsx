"use client";

// Profil (web_saya) + hari libur untuk seluruh layar yang butuh login. Diisi awal dari server (layout (app)),
// lalu disegarkan tiap 60 dtk saat tab terlihat (lonceng notifikasi & mode aplikasi, sama dengan web lama).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { rpc } from "@/lib/api/rpc";
import { klienBrowser } from "@/lib/supabase/client";
import type { Profil } from "@/types/domain";

export const KUNCI_PROFIL = ["profil"] as const;
export const KUNCI_LIBUR = ["hari-libur"] as const;

type NilaiProfil = {
  profil: Profil;
  member: NonNullable<Profil["member"]>;
  owner: boolean;
  cermin: boolean;
  hariIni: string;
  libur: ReadonlySet<string>;
};

const Konteks = createContext<NilaiProfil | null>(null);

async function muatLibur(): Promise<string[]> {
  const { data, error } = await klienBrowser().from("hari_libur").select("tanggal");
  if (error) return [];
  return (data ?? []).map((r) => r.tanggal);
}

export function PenyediaProfil({ awal, liburAwal, children }: { awal: Profil; liburAwal: string[]; children: ReactNode }) {
  const { data: profil } = useQuery({
    queryKey: KUNCI_PROFIL,
    queryFn: () => rpc(klienBrowser(), "web_saya"),
    initialData: awal,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const { data: libur } = useQuery({ queryKey: KUNCI_LIBUR, queryFn: muatLibur, initialData: liburAwal, staleTime: 10 * 60_000 });

  // beri tahu bila mode aplikasi berubah (cermin ↔ utama) saat layar terbuka
  const modeLama = useRef(profil.mode);
  useEffect(() => {
    if (modeLama.current !== profil.mode) toast.info(`Mode aplikasi sekarang: ${profil.mode}`);
    modeLama.current = profil.mode;
  }, [profil.mode]);

  const nilai = useMemo<NilaiProfil | null>(
    () =>
      profil.member
        ? {
            profil,
            member: profil.member,
            owner: profil.owner,
            cermin: profil.mode === "cermin",
            hariIni: profil.hari_ini,
            libur: new Set(libur),
          }
        : null,
    [profil, libur],
  );

  if (!nilai) return null;
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function useProfil(): NilaiProfil {
  const k = useContext(Konteks);
  if (!k) throw new Error("useProfil di luar PenyediaProfil");
  return k;
}

/** Kartu terkunci: mode cermin + kartu/komentar/lampiran asal ClickUp. */
export function useTerkunci() {
  const { cermin } = useProfil();
  return (x: { sumber?: string } | null | undefined) => cermin && x?.sumber === "clickup";
}

/** Ubah angka lonceng secara lokal (langsung turun sesudah notifikasi dibuka), lalu disamakan dengan server. */
export function useSetNotifBelum() {
  const qc = useQueryClient();
  return (n: number) =>
    qc.setQueryData<Profil>(KUNCI_PROFIL, (p) => (p ? { ...p, notif_belum: Math.max(0, Number(n) || 0) } : p));
}
