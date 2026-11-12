"use client";

// Hapus permanen tugas dari Sampah (owner). Jalur utama: Edge /x/admin/purge (web_purge sebagai user + hapus objek
// Storage dengan service role). Edge belum terpasang → konfirmasi eksplisit, lalu web_purge langsung dengan
// peringatan bahwa berkas tertinggal. Konfirmasi pertama dilakukan pemanggil.
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { segarkanTugas } from "@/features/tugas/mutasi";
import { edgeAdmin } from "@/lib/api/edge";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { HasilPurgeEdge } from "@/types/domain";

export function useHapusPermanen() {
  const konfirmasi = useKonfirmasi();
  const qc = useQueryClient();

  return async (taskId: string): Promise<(HasilPurgeEdge & { tanpaEdge?: boolean }) | null> => {
    let r: HasilPurgeEdge & { tanpaEdge?: boolean };
    try {
      r = await edgeAdmin<HasilPurgeEdge>("purge", { task_id: taskId });
    } catch (e) {
      if (!(e instanceof GalatApi) || e.hint !== "EDGE_TIDAK_ADA") {
        toast.error(pesanGalat(e), { duration: 6000 });
        return null;
      }
      const lanjut = await konfirmasi({
        judul: "Layanan Edge belum terpasang",
        pesan:
          "Bila tetap dihapus, data tugas hilang tetapi berkas lampirannya tertinggal di Storage sampai dibersihkan admin. Lanjutkan?",
        ya: "Tetap hapus",
        bahaya: true,
      });
      if (!lanjut) return null;
      try {
        const x = await rpc(klienBrowser(), "web_purge", { p_task: taskId });
        r = { ...x, storage_dihapus: [], storage_sisa: x.storage_paths ?? [], tanpaEdge: true };
      } catch (e2) {
        toast.error(pesanGalat(e2), { duration: 6000 });
        return null;
      }
    }
    const dihapus = r.storage_dihapus?.length ?? 0;
    const sisa = r.storage_sisa ?? [];
    toast.success(`Dihapus permanen (${r.purged.length} tugas${dihapus ? `, ${dihapus} berkas` : ""})`);
    if (sisa.length) {
      console.warn("berkas lampiran tertinggal di Storage:", sisa);
      toast.error(
        r.tanpaEdge
          ? `${sisa.length} berkas lampiran tertinggal di Storage (Edge belum terpasang). Minta admin membersihkannya.`
          : `${sisa.length} berkas lampiran gagal dihapus dan tertinggal di Storage. Minta admin membersihkannya.`,
        { duration: 8000 },
      );
    }
    // kartu sudah tidak ada: buang dari cache (bukan muat ulang → tidak ada kilasan 404 sebelum pindah halaman)
    qc.removeQueries({ queryKey: kunci.detail(taskId) });
    void segarkanTugas(qc);
    void qc.invalidateQueries({ queryKey: kunci.sampah });
    return r;
  };
}
