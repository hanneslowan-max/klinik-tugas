"use client";

// Tab Daftar ↔ Papan (Board). Berupa tautan (bisa dibuka di tab baru) yang membawa filter aktif.
import { List, SquareKanban } from "lucide-react";
import Link from "next/link";
import type { KeyboardEvent } from "react";

import { urlList, type FilterList, type ModeList } from "@/features/list/filter";
import { cn } from "@/lib/utils";

const TAB: readonly { mode: ModeList; label: string; Ikon: typeof List; uji: string }[] = [
  { mode: "daftar", label: "Daftar", Ikon: List, uji: "tab-daftar" },
  { mode: "board", label: "Papan (Board)", Ikon: SquareKanban, uji: "tab-board" },
];

/** Panah kiri/kanan memindah fokus antar-tab (pola tablist). */
function geserFokus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tab = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
  const i = tab.indexOf(document.activeElement as HTMLAnchorElement);
  if (i < 0) return;
  e.preventDefault();
  tab[(i + (e.key === "ArrowRight" ? 1 : tab.length - 1)) % tab.length]?.focus();
}

type Props = { listId: string; mode: ModeList; filter: FilterList; className?: string };

export function TabTampilan({ listId, mode, filter, className }: Props) {
  return (
    <div role="tablist" aria-label="Tampilan" onKeyDown={geserFokus} className={cn("inline-flex shrink-0 rounded-lg bg-muted p-[3px]", className)}>
      {TAB.map(({ mode: m, label, Ikon, uji }) => {
        const aktif = mode === m;
        return (
          <Link
            key={m}
            role="tab"
            aria-selected={aktif}
            tabIndex={aktif ? 0 : -1}
            href={urlList(listId, m, filter)}
            data-uji={uji}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              aktif ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Ikon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
