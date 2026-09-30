"use client";

// Checklist kartu ClickUp (tasks.extra.checklists, diimpor verbatim; hanya-baca): butir bertingkat + hitungan
// selesai/total. Centang di ClickUp; perubahan masuk lewat sinkron.
import { Check, Circle } from "lucide-react";
import { useId } from "react";

import { Chip } from "@/components/umum/chip";
import { useDetail } from "@/features/detail/konteks";
import { cn } from "@/lib/utils";
import type { ButirChecklist, ChecklistClickUp } from "@/types/domain";

/** [selesai, total] termasuk anak butir. */
function hitung(items: ButirChecklist[]): [number, number] {
  return items.reduce<[number, number]>(
    (n, it) => {
      const anak = Array.isArray(it.children) ? hitung(it.children) : [0, 0];
      return [n[0] + (it.resolved ? 1 : 0) + anak[0], n[1] + 1 + anak[1]];
    },
    [0, 0],
  );
}

function DaftarButir({ items, anak = false }: { items: ButirChecklist[]; anak?: boolean }) {
  const urut = items.filter(Boolean).sort((a, b) => (Number(a.orderindex) || 0) - (Number(b.orderindex) || 0));
  return (
    <ul className={cn("flex flex-wrap gap-1.5", anak && "basis-full pl-4")}>
      {urut.map((it, i) => (
        <li key={it.id ?? i} className="flex max-w-full flex-wrap gap-1.5">
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              it.resolved ? "bg-sukses-lembut text-sukses" : "bg-muted text-foreground",
            )}
            data-beres={it.resolved ? "1" : "0"}
          >
            <span className="sr-only">{it.resolved ? "Selesai: " : "Belum: "}</span>
            {it.resolved ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            <span className={cn(it.resolved && "line-through")}>{it.name || "(tanpa nama)"}</span>
          </span>
          {Array.isArray(it.children) && it.children.length ? <DaftarButir items={it.children} anak /> : null}
        </li>
      ))}
    </ul>
  );
}

function SatuChecklist({ c }: { c: ChecklistClickUp }) {
  const [beres, total] = hitung(c.items);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>{c.name || "Checklist"}</span>
        <Chip nada="garis" aria-label={`${beres} dari ${total} selesai`}>
          {beres}/{total}
        </Chip>
      </div>
      {c.items.length ? <DaftarButir items={c.items} /> : <p className="text-xs text-muted-foreground">Belum ada butir.</p>}
    </div>
  );
}

export function Checklist() {
  const { d } = useDetail();
  const idJudul = useId();
  const mentah = d.task.extra?.checklists;
  const daftar = (Array.isArray(mentah) ? mentah : []).filter((c) => c && Array.isArray(c.items));
  if (!daftar.length) return null;
  return (
    <section aria-labelledby={idJudul} className="space-y-2" data-uji="checklist">
      <div>
        <h3 id={idJudul} className="text-sm font-semibold">
          Checklist
        </h3>
        <p className="text-xs text-muted-foreground">Dari ClickUp, hanya-baca. Centang di ClickUp; perubahan masuk lewat sinkron.</p>
      </div>
      <div className="space-y-3">
        {daftar.map((c, i) => (
          <SatuChecklist key={c.id ?? i} c={c} />
        ))}
      </div>
    </section>
  );
}
