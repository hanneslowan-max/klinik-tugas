"use client";

// Aksi tingkat tugas (menu ⋯ dan spanduk Sampah): salin tautan, pindah list, arsip, hapus ke Sampah, pulihkan,
// hapus permanen. Sesudah berhasil, semua tampilan tugas (daftar, Tugas Saya, cari, Sampah) ikut disegarkan.
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { useDetail } from "@/features/detail/konteks";
import { useProfil } from "@/features/profil/penyedia-profil";
import { useHapusPermanen } from "@/features/tugas/hapus-permanen";
import { segarkanTugas } from "@/features/tugas/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { ListDatar } from "@/types/domain";

/** Tautan kartu yang disalin: app_base_url (app_settings) atau asal halaman ini. */
export function tautanTugas(dasar: string | null | undefined, id: string) {
  return `${(dasar || window.location.origin).replace(/\/$/, "")}/t/${encodeURIComponent(id)}`;
}

export async function salinTeks(teks: string) {
  try {
    await navigator.clipboard.writeText(teks);
    toast.success("Disalin", { duration: 1800 });
  } catch {
    toast.error("Gagal menyalin. Salin manual.");
  }
}

export function useAksiTugas() {
  const { id, d, muat } = useDetail();
  const { profil } = useProfil();
  const konfirmasi = useKonfirmasi();
  const hapusPermanen = useHapusPermanen();
  const router = useRouter();
  const qc = useQueryClient();

  /** Jalankan RPC + toast; sesudah berhasil segarkan layar lain lalu muat ulang detail. */
  async function jalankan(kerja: () => Promise<unknown>, pesan: string) {
    try {
      await kerja();
      toast.success(pesan, { duration: 2000 });
    } catch (e) {
      toast.error(pesanGalat(e), { duration: 5000 });
      return false;
    }
    segarkanTugas(qc, id);
    void qc.invalidateQueries({ queryKey: kunci.sampah });
    await muat();
    return true;
  }

  const klien = () => klienBrowser();

  return {
    salinTautan: () => salinTeks(tautanTugas(profil.app_base_url, id)),

    async pindah(l: ListDatar) {
      const ok = await konfirmasi({
        judul: "Pindah list",
        pesan: `Pindahkan tugas ke list "${l.name}"? Status disesuaikan dengan status list tujuan; sub-tugas ikut pindah.`,
        ya: "Pindahkan",
      });
      if (ok) await jalankan(() => rpc(klien(), "web_pindah", { p_task: id, p_list: l.id }), `Dipindah ke ${l.name}`);
    },

    async arsip() {
      const arsip = !d.task.archived;
      await jalankan(() => rpc(klien(), "web_arsip", { p_task: id, p_arsip: arsip }), arsip ? "Diarsipkan" : "Dikeluarkan dari arsip");
    },

    async hapus() {
      const ok = await konfirmasi({
        pesan: "Pindahkan tugas ini ke Sampah? Owner bisa memulihkannya dari menu Sampah.",
        ya: "Hapus",
        bahaya: true,
      });
      if (ok) await jalankan(() => rpc(klien(), "web_hapus", { p_task: id }), "Tugas dipindah ke Sampah");
    },

    async pulihkan() {
      await jalankan(() => rpc(klien(), "web_pulihkan", { p_task: id }), "Tugas dipulihkan");
    },

    async purge() {
      const ok = await konfirmasi({
        judul: "Hapus permanen",
        pesan:
          "Hapus permanen tugas ini beserta sub-tugas, komentar, dan berkas lampirannya? Tindakan ini tidak bisa dibatalkan. Riwayat tetap tersimpan.",
        ya: "Hapus permanen",
        bahaya: true,
      });
      if (ok && (await hapusPermanen(id))) router.replace("/sampah");
    },
  };
}
