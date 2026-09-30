"use client";

// Filter List/Board: assignee · status · chip due · tampilkan selesai. Di Board dilipat ("Filter · n aktif") supaya
// papan mulai tinggi di layar HP.
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { jumlahFilterAktif, PILIHAN_DUE, type FilterList } from "@/features/list/filter";
import { cn } from "@/lib/utils";
import type { StatusList } from "@/types/domain";

// Radix Select tidak menerima value "" → nilai pengganti untuk "semua"
const SEMUA = "__semua__";

type Props = {
  filter: FilterList;
  ubah: (ubah: Partial<FilterList>) => void;
  statuses: StatusList[];
};

export function FilterListIsi({ filter, ubah, statuses }: Props) {
  const anggota = useAnggotaAktif();
  const idSelesai = useId();
  return (
    <div className="space-y-2" data-uji="filter-list">
      <div className="grid grid-cols-2 gap-2 md:max-w-xl">
        <Select value={filter.a || SEMUA} onValueChange={(v) => ubah({ a: v === SEMUA ? "" : v })} name="assignee">
          <SelectTrigger className="h-9 w-full" aria-label="Filter assignee" data-uji="filter-assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEMUA}>Semua assignee</SelectItem>
            <SelectItem value="saya">Saya</SelectItem>
            <SelectItem value="kosong">Tanpa assignee</SelectItem>
            {(anggota.data ?? []).map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.s || SEMUA} onValueChange={(v) => ubah({ s: v === SEMUA ? "" : v })} name="status">
          <SelectTrigger className="h-9 w-full" aria-label="Filter status" data-uji="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEMUA}>Semua status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.status} value={s.status}>
                {s.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* chip due: satu baris, geser horizontal di HP */}
      <div
        role="group"
        aria-label="Filter due"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {PILIHAN_DUE.map((p) => {
          const aktif = filter.d === p.v;
          return (
            <button
              key={p.v || "semua"}
              type="button"
              data-due={p.v || "semua"}
              data-uji="chip-due"
              aria-pressed={aktif}
              onClick={() => ubah({ d: p.v })}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                aktif ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-11 items-center gap-2.5 md:min-h-9">
        <Checkbox
          id={idSelesai}
          name="selesai"
          checked={filter.selesai}
          onCheckedChange={(v) => ubah({ selesai: v === true })}
          data-uji="filter-selesai"
        />
        <Label htmlFor={idSelesai} className="cursor-pointer font-normal">
          Tampilkan selesai
        </Label>
      </div>
    </div>
  );
}

/** Wadah filter terlipat (mode Board). */
export function FilterLipat({ filter, children }: { filter: FilterList; children: ReactNode }) {
  const n = jumlahFilterAktif(filter);
  return (
    <details className="group/filter" data-uji="filter-lipat">
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold select-none md:min-h-9 md:w-fit",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/filter:rotate-90" aria-hidden />
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <span>Filter</span>
        <span className={cn("text-xs font-normal", n ? "text-primary" : "text-muted-foreground")} data-uji="ringkas-filter">
          {n ? `${n} aktif` : "semua kartu"}
        </span>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
