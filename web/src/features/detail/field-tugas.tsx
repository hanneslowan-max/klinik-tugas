"use client";

// Kolom field tugas: Status, Assignee (beban due + nonaktif), Due, Mulai, Prioritas, Induk, Label (tag ClickUp),
// Dibuat / Diubah / Ditutup. Bisa diubah hanya bila boleh.ubah; selain itu tampil hanya-baca.
import { Flag } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { ChipDue } from "@/components/umum/chip-tugas";
import { StatusPil, TitikWarna } from "@/components/umum/status-pil";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PemilihAnggota } from "@/features/anggota/pemilih-anggota";
import { InputTanggal } from "@/features/detail/input-tanggal";
import { useDetail } from "@/features/detail/konteks";
import { useProfil } from "@/features/profil/penyedia-profil";
import { selisihAssignee } from "@/features/tugas/util";
import { PRIORITAS } from "@/lib/konstanta";
import { fmtJamWib, fmtTanggal, fmtWaktu, peringatanTanggal, tanggalWib } from "@/lib/tanggal";
import { warnaAman } from "@/lib/teks";
import { cn } from "@/lib/utils";
import type { AssigneeDetail, Prioritas } from "@/types/domain";

const TANPA = "tanpa";

function Baris({ label, children, uji }: { label: string; children: ReactNode; uji?: string }) {
  return (
    <div className="grid min-h-13 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 border-b py-1.5 last:border-b-0" data-field={uji}>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">{children}</dd>
    </div>
  );
}

const Redup = ({ children }: { children: ReactNode }) => <span className="text-sm text-muted-foreground">{children}</span>;

function FieldStatus() {
  const { d, bolehUbah, ubah } = useDetail();
  const [tertunda, setTertunda] = useState<string | null>(null);
  const t = d.task;
  const warna = t.statuses.find((s) => s.status === t.status)?.color ?? t.status_color;

  if (!bolehUbah) {
    return (
      <Baris label="Status">
        <StatusPil nama={t.status} warna={warna} />
      </Baris>
    );
  }
  return (
    <Baris label="Status">
      <Select
        value={tertunda ?? t.status}
        onValueChange={async (v) => {
          if (v === t.status) return;
          setTertunda(v);
          try {
            await ubah({ status: v }, `Status: ${v}`);
          } finally {
            setTertunda(null);
          }
        }}
      >
        <SelectTrigger className="w-full" aria-label="Status" data-uji="pilih-status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {t.statuses.map((s) => (
            <SelectItem key={s.status} value={s.status}>
              <TitikWarna warna={s.color} />
              {s.status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Baris>
  );
}

function ChipAssignee({ a }: { a: AssigneeDetail }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-xs font-medium",
        a.beban_lebih && "bg-hari-ini-lembut text-hari-ini",
      )}
      title={a.beban !== null && a.beban !== undefined ? `${a.beban} kartu due di tanggal ini` : undefined}
      data-uji="assignee-chip"
      data-lebih={a.beban_lebih ? "1" : undefined}
    >
      <AvatarAnggota anggota={a} />
      <span className="truncate">
        {a.username}
        {a.beban_lebih ? ` · ${a.beban} due` : ""}
        {a.aktif === false ? " (nonaktif)" : ""}
      </span>
    </span>
  );
}

function FieldAssignee() {
  const { d, bolehUbah, ubah } = useDetail();
  const [buka, setBuka] = useState(false);
  return (
    <Baris label="Assignee">
      {d.assignees.length ? d.assignees.map((a) => <ChipAssignee key={a.id} a={a} />) : <Redup>Belum ada</Redup>}
      {bolehUbah ? (
        <>
          <Button variant="outline" size="sm" data-uji="ubah-assignee" onClick={() => setBuka(true)}>
            Ubah
          </Button>
          <PemilihAnggota
            buka={buka}
            ubahBuka={setBuka}
            terpilih={d.assignees}
            onSimpan={async (ids) => {
              // dialog juga menampilkan assignee nonaktif (bisa dilepas); yang dikirim hanya selisihnya ({add, rem})
              // supaya eks-anggota yang tetap terpasang tidak membuat simpan gagal "Assignee tidak dikenal"
              const beda = selisihAssignee(
                d.assignees.map((a) => a.id),
                ids,
              );
              if (beda) await ubah({ assignees: beda }, "Assignee disimpan");
            }}
          />
        </>
      ) : null}
    </Baris>
  );
}

function FieldTanggal({ jenis }: { jenis: "due" | "mulai" }) {
  const { d, bolehUbah, ubah } = useDetail();
  const { hariIni, libur } = useProfil();
  const t = d.task;
  const due = jenis === "due";
  const label = due ? "Due" : "Mulai";
  const nilaiWib = due ? t.due_wib : tanggalWib(t.start_at);
  const iso = due ? t.due_at : t.start_at;
  const adaJam = due ? t.due_has_time : t.start_has_time;
  const teks = nilaiWib ? `${fmtTanggal(nilaiWib, hariIni)}${adaJam && iso ? ` ${fmtJamWib(iso)}` : ""}` : "Tanpa tanggal";
  const chip = due ? t.due_wib ? <ChipDue tugas={t} /> : <Redup>Tanpa due (parkir)</Redup> : null;

  if (!due && !t.start_at && !bolehUbah) return null;
  if (!bolehUbah) return <Baris label={label}>{chip ?? <span>{teks}</span>}</Baris>;

  async function simpan(v: string | null) {
    if (due) {
      const p = peringatanTanggal(v, libur);
      if (p) toast.warning(p, { duration: 5000 });
    }
    return ubah(due ? { due: v } : { start_date: v }, v ? `${label} disimpan` : `${label} dihapus`);
  }

  return (
    <Baris label={label}>
      {chip ?? (nilaiWib ? <Chip>{teks}</Chip> : null)}
      <InputTanggal label={label} nilai={nilaiWib} uji={due ? "input-due" : "input-mulai"} kunciUji={jenis} onSimpan={simpan} />
    </Baris>
  );
}

function FieldPrioritas() {
  const { d, bolehUbah, ubah } = useDetail();
  const [tertunda, setTertunda] = useState<string | null>(null);
  const p = d.task.priority;

  if (!bolehUbah) {
    return <Baris label="Prioritas">{p && PRIORITAS[p] ? <span>{PRIORITAS[p].nama}</span> : <Redup>—</Redup>}</Baris>;
  }
  const asli = p ? String(p) : TANPA;
  return (
    <Baris label="Prioritas">
      <Select
        value={tertunda ?? asli}
        onValueChange={async (v) => {
          if (v === asli) return;
          setTertunda(v);
          try {
            await ubah({ priority: v === TANPA ? null : Number(v) }, "Prioritas disimpan");
          } finally {
            setTertunda(null);
          }
        }}
      >
        <SelectTrigger className="w-full" aria-label="Prioritas" data-uji="pilih-prioritas">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TANPA}>— tanpa —</SelectItem>
          {(Object.entries(PRIORITAS) as [string, (typeof PRIORITAS)[Prioritas]][]).map(([k, x]) => (
            <SelectItem key={k} value={k}>
              <Flag style={{ color: x.warna, fill: x.warna }} aria-hidden />
              {x.nama}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Baris>
  );
}

/** Label dari ClickUp (tasks.extra.tags, hanya-baca): warna latar dari tag_bg. */
function FieldTag() {
  const { d } = useDetail();
  const mentah = d.task.extra?.tags;
  const tags = (Array.isArray(mentah) ? mentah : []).filter((x) => x && x.name);
  if (!tags.length) return null;
  return (
    <Baris label="Label">
      <span className="flex flex-wrap gap-1.5" data-uji="tag-tugas">
        {tags.map((x, i) => (
          <span
            key={`${x.name}-${i}`}
            title="Label dari ClickUp (hanya-baca)"
            style={{ "--warna": warnaAman(x.tag_bg) ?? "#8e8c99" } as CSSProperties}
            className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--warna)_55%,transparent)] bg-[color-mix(in_srgb,var(--warna)_20%,var(--card))] px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {x.name}
          </span>
        ))}
      </span>
    </Baris>
  );
}

export function FieldTugas() {
  const { d } = useDetail();
  const t = d.task;
  return (
    <section aria-label="Field tugas" className="rounded-xl border bg-card px-3">
      <dl>
        <FieldStatus />
        <FieldAssignee />
        <FieldTanggal jenis="due" />
        <FieldTanggal jenis="mulai" />
        <FieldPrioritas />
        {d.parent ? (
          <Baris label="Induk">
            <Link href={`/t/${encodeURIComponent(d.parent.id)}`} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
              {d.parent.name}
              {d.parent.deleted ? " (di Sampah)" : ""}
            </Link>
          </Baris>
        ) : null}
        <FieldTag />
        <Baris label="Dibuat">
          <span className="text-xs">
            {fmtWaktu(t.created_at)}
            {t.creator ? ` · ${t.creator.username}` : ""}
          </span>
        </Baris>
        <Baris label="Diubah">
          <span className="text-xs">{fmtWaktu(t.updated_at)}</span>
        </Baris>
        {t.closed_at ? (
          <Baris label="Ditutup">
            <span className="text-xs">
              {fmtWaktu(t.closed_at)}
              {t.reopen_count ? ` · dibuka ulang ${t.reopen_count}×` : ""}
            </span>
          </Baris>
        ) : null}
      </dl>
    </section>
  );
}
