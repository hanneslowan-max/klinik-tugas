"use client";

// Tampilan Daftar: kartu dikelompokkan per status (urut orderindex status), tiap grup bisa dilipat.
import { ChevronDown } from "lucide-react";

import { Kosong } from "@/components/umum/keadaan";
import { StatusPil } from "@/components/umum/status-pil";
import { urutStatus } from "@/features/list/urutan";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
import type { DaftarList, Tugas } from "@/types/domain";

type Props = {
  data: DaftarList;
  /** kartu yang lolos filter */
  tampak: Tugas[];
  toggle: (t: Tugas) => Promise<unknown>;
};

export function DaftarStatus({ data, tampak, toggle }: Props) {
  const grup = urutStatus(data.list.statuses)
    .map((s) => ({ s, isi: tampak.filter((t) => t.status === s.status) }))
    .filter((g) => g.isi.length);

  if (!grup.length) {
    return <Kosong>{data.tasks.length ? "Tidak ada tugas yang cocok dengan filter." : "List ini belum punya tugas."}</Kosong>;
  }

  return (
    <div className="space-y-3" data-uji="isi-list">
      {grup.map(({ s, isi }) => (
        <details key={s.status} open className="group/grup" data-status={s.status}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform group-open/grup:rotate-0" aria-hidden />
            <StatusPil nama={s.status} warna={s.color} className="text-sm" />
            <span className="rounded-full bg-muted px-2 text-xs leading-5 font-semibold text-muted-foreground">
              {isi.length}
              <span className="sr-only"> tugas</span>
            </span>
          </summary>
          <DaftarTugas daftar={isi} toggle={toggle} tampilStatus={false} />
        </details>
      ))}
    </div>
  );
}
