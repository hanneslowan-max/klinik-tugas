"use client";

import { Check, Lock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { AvatarTumpuk } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { ChipDue, ChipPrioritas } from "@/components/umum/chip-tugas";
import { Kosong } from "@/components/umum/keadaan";
import { StatusPil } from "@/components/umum/status-pil";
import { useProfil, useTerkunci } from "@/features/profil/penyedia-profil";
import { fmtRelatif } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { Tugas } from "@/types/domain";

type OpsiMeta = { tampilList?: boolean; tampilStatus?: boolean };

/** Meta ringkas kartu: status, due, prioritas, komentar, label, assignee. */
export function MetaTugas({ tugas: t, tampilList = false, tampilStatus = true }: { tugas: Tugas } & OpsiMeta) {
  const { hariIni } = useProfil();
  const terkunci = useTerkunci();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {tampilStatus ? <StatusPil nama={t.status} warna={t.status_color} /> : null}
      <ChipDue tugas={t} />
      <ChipPrioritas prioritas={t.priority} />
      {t.comment_count ? (
        // waktu relatif bergantung jam saat render: HTML server (data awal) bisa beda beberapa detik dengan hidrasi
        <Chip
          nada="garis"
          title={t.last_comment_at ? `Komentar terakhir ${fmtRelatif(t.last_comment_at, hariIni)}` : undefined}
          suppressHydrationWarning
        >
          <MessageSquare aria-hidden />
          {t.comment_count}
          {t.last_comment_at ? ` · ${fmtRelatif(t.last_comment_at, hariIni)}` : ""}
        </Chip>
      ) : null}
      {t.parent_id ? <Chip nada="garis">sub-tugas</Chip> : null}
      {t.menunggu_keputusan ? <Chip nada="info">menunggu keputusan</Chip> : null}
      {t.list?.tidak_ditagih ? <Chip nada="garis">tidak ditagih</Chip> : null}
      {terkunci(t) ? (
        <Chip nada="cermin" title="Kartu ClickUp, hanya-baca selama mode cermin">
          <Lock aria-hidden />
          ClickUp
        </Chip>
      ) : null}
      {tampilList && t.list ? <span className="truncate text-xs text-muted-foreground">{t.list.name}</span> : null}
      {t.assignees?.length ? (
        <span className="ml-auto">
          <AvatarTumpuk daftar={t.assignees} />
        </span>
      ) : null}
    </div>
  );
}

type OpsiBaris = OpsiMeta & {
  /** tampilkan tombol selesai/buka lagi (dinonaktifkan untuk kartu terkunci) */
  toggle?: (t: Tugas) => Promise<unknown>;
  ekstra?: (t: Tugas) => ReactNode;
};

export function BarisTugas({ tugas: t, toggle, ekstra, ...meta }: { tugas: Tugas } & OpsiBaris) {
  const terkunci = useTerkunci();
  const kunci = terkunci(t);
  const [sibuk, setSibuk] = useState(false);
  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40",
        t.selesai && "opacity-70",
      )}
      data-id={t.id}
      data-uji="baris-tugas"
    >
      {toggle ? (
        <button
          type="button"
          disabled={kunci || sibuk}
          aria-pressed={t.selesai}
          aria-label={t.selesai ? `Buka lagi: ${t.name}` : `Tandai selesai: ${t.name}`}
          title={kunci ? "Kartu ClickUp hanya-baca selama mode cermin" : t.selesai ? "Buka lagi" : "Tandai selesai"}
          onClick={async () => {
            setSibuk(true);
            try {
              await toggle(t);
            } finally {
              setSibuk(false);
            }
          }}
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border-2 transition-colors",
              t.selesai ? "border-sukses bg-sukses text-white" : "border-muted-foreground/50 group-hover:border-primary",
            )}
          >
            <Check className={cn("size-3", t.selesai ? "opacity-100" : "opacity-0")} strokeWidth={3} aria-hidden />
          </span>
        </button>
      ) : null}
      <Link href={`/t/${encodeURIComponent(t.id)}`} className="min-w-0 flex-1 outline-none">
        <IsiTautan className="space-y-1.5">
          <div className={cn("text-sm leading-snug font-medium break-words", t.selesai && "line-through decoration-muted-foreground")}>
            {t.name}
          </div>
          <MetaTugas tugas={t} {...meta} />
          {ekstra?.(t)}
        </IsiTautan>
      </Link>
    </li>
  );
}

export function DaftarTugas({ daftar, kosong = "Tidak ada tugas.", ...opsi }: { daftar: Tugas[]; kosong?: string } & OpsiBaris) {
  if (!daftar.length) return <Kosong>{kosong}</Kosong>;
  return (
    <ul className="space-y-2" data-uji="daftar-tugas">
      {daftar.map((t) => (
        <BarisTugas key={t.id} tugas={t} {...opsi} />
      ))}
    </ul>
  );
}
