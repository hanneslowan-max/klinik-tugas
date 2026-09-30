"use client";

// Data & aksi bersama layar detail tugas (web_detail). Semua simpan field lewat web_ubah_tugas dengan cek versi:
// 409 KONFLIK_001 → pesan + muat ulang. Sesudah ubah assignee/due → peringatan B5 bila ada assignee kelebihan beban.
// Penyegaran saat tab browser terlihat lagi ditunda selama pengguna sedang mengedit (deskripsi, balas/ubah komentar).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { useProfil } from "@/features/profil/penyedia-profil";
import { segarkanTugas, useUbahTugas, type BodyUbahTugas } from "@/features/tugas/mutasi";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtTanggal } from "@/lib/tanggal";
import type { DetailTugas } from "@/types/domain";

export function useDataDetail(id: string) {
  return useQuery({
    queryKey: kunci.detail(id),
    queryFn: () => rpc(klienBrowser(), "web_detail", { p_task: id }),
    // diganti penyegaran sendiri di PenyediaDetail (menunggu pengguna selesai mengedit)
    refetchOnWindowFocus: false,
  });
}

type NilaiDetail = {
  id: string;
  d: DetailTugas;
  /** tugas boleh diubah (bukan kartu ClickUp di mode cermin, bukan di Sampah) */
  bolehUbah: boolean;
  /** muat ulang web_detail; mengembalikan data terbaru */
  muat: () => Promise<DetailTugas | undefined>;
  /** sesudah mutasi di luar web_ubah_tugas (komentar, lampiran): tandai daftar/Tugas Saya basi lalu muat ulang */
  segarkan: () => Promise<DetailTugas | undefined>;
  /** web_ubah_tugas + toast; false bila gagal (data sudah dimuat ulang) */
  ubah: (body: BodyUbahTugas, pesan?: string) => Promise<boolean>;
  /** tandai bagian yang sedang diedit (kunci unik per bagian) */
  tandaiEdit: (kunci: string, aktif: boolean) => void;
};

const Konteks = createContext<NilaiDetail | null>(null);

type Props = {
  id: string;
  d: DetailTugas;
  refetch: (opsi?: { cancelRefetch?: boolean }) => Promise<{ data?: DetailTugas }>;
  children: ReactNode;
};

export function PenyediaDetail({ id, d, refetch, children }: Props) {
  const { hariIni } = useProfil();
  const qc = useQueryClient();
  const ubahTugas = useUbahTugas();
  const pengedit = useRef(new Set<string>());

  // cancelRefetch:false → bergabung dengan pemuatan yang sedang berjalan (mis. hasil invalidasi sesudah mutasi)
  const muat = useCallback(async () => (await refetch({ cancelRefetch: false })).data, [refetch]);

  const segarkan = useCallback(() => {
    void segarkanTugas(qc, id);
    return muat();
  }, [qc, id, muat]);

  const tandaiEdit = useCallback((k: string, aktif: boolean) => {
    if (aktif) pengedit.current.add(k);
    else pengedit.current.delete(k);
  }, []);

  const saatTerlihat = useEffectEvent(() => {
    if (document.visibilityState === "visible" && pengedit.current.size === 0) void muat();
  });
  useEffect(() => {
    const f = () => saatTerlihat();
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  async function ubah(body: BodyUbahTugas, pesan?: string) {
    try {
      await ubahTugas.mutateAsync({ id, versi: d.task.versi, body });
      if (pesan) toast.success(pesan, { duration: 1800 });
    } catch (e) {
      toast.error(e instanceof GalatApi && e.konflik ? "Tugas sudah diubah orang lain. Data dimuat ulang." : pesanGalat(e), {
        duration: 5000,
      });
      await muat();
      return false;
    }
    const baru = await muat();
    if (baru && !baru.task.selesai && baru.peringatan.beban_lebih.length && ("assignees" in body || "due" in body)) {
      toast.warning(
        `Peringatan B5: ${baru.peringatan.beban_lebih.join(", ")} punya lebih dari 7 kartu due pada ${fmtTanggal(baru.task.due_wib, hariIni)}.`,
        { duration: 7000 },
      );
    }
    return true;
  }

  return <Konteks.Provider value={{ id, d, bolehUbah: d.boleh.ubah, muat, segarkan, ubah, tandaiEdit }}>{children}</Konteks.Provider>;
}

export function useDetail(): NilaiDetail {
  const k = useContext(Konteks);
  if (!k) throw new Error("useDetail di luar PenyediaDetail");
  return k;
}

/** Tandai bagian ini sedang diedit selama `aktif` (penyegaran otomatis ditunda). */
export function useTandaiEdit(k: string, aktif: boolean) {
  const { tandaiEdit } = useDetail();
  useEffect(() => {
    tandaiEdit(k, aktif);
    return () => tandaiEdit(k, false);
  }, [k, aktif, tandaiEdit]);
}
