"use client";

// Penyimak Realtime (Supabase postgres_changes): satu kanal per tab untuk seluruh aplikasi. Perubahan dari anggota
// lain (status pindah kolom, komentar baru, assignee, lampiran, struktur) membuat data layar yang terdampak dimuat
// ulang. Perubahan dikumpulkan sebentar (400 ms) supaya sinkron ClickUp yang mengubah ratusan baris tidak memicu
// ratusan permintaan. Hanya INSERT & UPDATE: RLS diperiksa Realtime per pelanggan untuk keduanya (tidak untuk DELETE).
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect } from "react";
import { toast } from "sonner";

import { KUNCI_PROFIL, useProfil } from "@/features/profil/penyedia-profil";
import { jalankanAtauTunda } from "@/features/realtime/tahanan";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";

const TABEL_TUGAS = ["tasks", "task_assignees", "comments", "attachments"] as const;
const TABEL_STRUKTUR = ["spaces", "folders", "lists", "list_statuses"] as const;
const JEDA_MS = 400;

type Baris = Record<string, unknown>;

/** ID tugas yang terdampak satu perubahan baris. */
export function idTugasTerdampak(tabel: string, baru: Baris): string[] {
  const ids = tabel === "tasks" ? [baru.id, baru.parent_id] : [baru.task_id];
  return ids.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export function PenyimakRealtime() {
  const qc = useQueryClient();
  const { member } = useProfil();
  const idSaya = member.id;

  useEffect(() => {
    const klien = klienBrowser();
    let kanal: RealtimeChannel | null = null;
    let berhenti = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const antre = { daftar: false, struktur: false, notif: false, detail: new Set<string>() };
    const sudahDiberitahu = new Set<string>();

    function siram() {
      timer = undefined;
      if (antre.daftar) {
        // Tugas Saya, cari, hitungan list: selalu langsung; List/Papan ditunda selama kartu diseret
        void qc.invalidateQueries({ queryKey: kunci.semuaTugasSaya });
        void qc.invalidateQueries({ queryKey: kunci.semuaCari });
        jalankanAtauTunda("daftar", () => void qc.invalidateQueries({ queryKey: kunci.semuaDaftar }));
      }
      if (antre.struktur || antre.daftar) void qc.invalidateQueries({ queryKey: kunci.struktur });
      for (const id of antre.detail) {
        const ditunda = jalankanAtauTunda(`detail:${id}`, () => {
          sudahDiberitahu.delete(id);
          void qc.invalidateQueries({ queryKey: kunci.detail(id) });
        });
        if (ditunda && !sudahDiberitahu.has(id)) {
          sudahDiberitahu.add(id);
          toast.info("Kartu ini baru diubah orang lain. Tampilan diperbarui setelah Anda selesai mengedit.", { duration: 6000 });
        }
      }
      if (antre.notif) {
        void qc.invalidateQueries({ queryKey: KUNCI_PROFIL });
        void qc.invalidateQueries({ queryKey: kunci.notif });
      }
      antre.daftar = antre.struktur = antre.notif = false;
      antre.detail.clear();
    }

    function jadwalkan() {
      if (timer === undefined) timer = setTimeout(siram, JEDA_MS);
    }

    function terimaTugas(tabel: string) {
      return (p: RealtimePostgresChangesPayload<Baris>) => {
        antre.daftar = true;
        for (const id of idTugasTerdampak(tabel, p.new as Baris)) antre.detail.add(id);
        jadwalkan();
      };
    }

    async function mulai() {
      await klien.realtime.setAuth(); // token sesi dari cookie (bukan kunci publik) → RLS berlaku per pengguna
      if (berhenti) return;
      const k = klien.channel(`rhj-data-${idSaya}`);
      for (const tabel of TABEL_TUGAS) {
        k.on("postgres_changes", { event: "INSERT", schema: "public", table: tabel }, terimaTugas(tabel));
        k.on("postgres_changes", { event: "UPDATE", schema: "public", table: tabel }, terimaTugas(tabel));
      }
      for (const tabel of TABEL_STRUKTUR) {
        const f = () => {
          antre.struktur = true;
          antre.daftar = true;
          jadwalkan();
        };
        k.on("postgres_changes", { event: "INSERT", schema: "public", table: tabel }, f);
        k.on("postgres_changes", { event: "UPDATE", schema: "public", table: tabel }, f);
      }
      const notif = () => {
        antre.notif = true;
        jadwalkan();
      };
      const saringNotif = `member_id=eq.${idSaya}`;
      k.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: saringNotif }, notif);
      k.on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: saringNotif }, notif);
      k.subscribe((status, err) => {
        document.documentElement.dataset.realtime = status;
        if (err) console.warn("Realtime:", status, err.message);
      });
      kanal = k;
    }

    void mulai();
    return () => {
      berhenti = true;
      if (timer !== undefined) clearTimeout(timer);
      delete document.documentElement.dataset.realtime;
      if (kanal) void klien.removeChannel(kanal);
    };
  }, [qc, idSaya]);

  return null;
}
