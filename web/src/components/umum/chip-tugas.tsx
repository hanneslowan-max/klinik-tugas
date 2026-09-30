"use client";

import { CalendarDays, Flag } from "lucide-react";

import { Chip } from "@/components/umum/chip";
import { useProfil } from "@/features/profil/penyedia-profil";
import { PRIORITAS } from "@/lib/konstanta";
import { infoDue } from "@/lib/tanggal";
import type { Prioritas } from "@/types/domain";

const NADA_DUE = { telat: "telat", hari_ini: "hari-ini", tiga_hk: "dekat" } as const;

/** Chip due: 'Hari ini' / 'Rab, 1 Okt · sisa 2 hk' / '… · telat 3 hr' (WIB, hari kerja memakai hari libur). */
export function ChipDue({
  tugas,
}: {
  tugas: { selesai: boolean; due_wib: string | null; due_at: string | null; due_has_time: boolean };
}) {
  const { hariIni, libur } = useProfil();
  const info = infoDue(tugas, hariIni, libur);
  if (!info) return null;
  const nada = info.kategori && info.kategori in NADA_DUE ? NADA_DUE[info.kategori as keyof typeof NADA_DUE] : "biasa";
  return (
    <Chip nada={nada} title={info.judul} data-due={info.kategori ?? "selesai"}>
      <CalendarDays aria-hidden />
      {info.teks}
    </Chip>
  );
}

export function ChipPrioritas({ prioritas }: { prioritas: Prioritas | null | undefined }) {
  if (!prioritas || !PRIORITAS[prioritas]) return null;
  const p = PRIORITAS[prioritas];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground" title={`Prioritas ${p.nama}`}>
      <Flag className="size-3" style={{ color: p.warna, fill: p.warna }} aria-hidden />
      {p.nama}
    </span>
  );
}
