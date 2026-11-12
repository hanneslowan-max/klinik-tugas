import type { ReactNode } from "react";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Skeleton } from "@/components/ui/skeleton";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";

/** Keadaan kosong (tidak ada data). */
export function Kosong({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>{children}</p>;
}

/** Kerangka memuat untuk daftar kartu. */
export function MemuatDaftar({ baris = 5 }: { baris?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: baris }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Galat pemuatan + tombol coba lagi. */
export function GalatMuat({ galat, ulang }: { galat: unknown; ulang?: () => void }) {
  return (
    <div className="space-y-3">
      <KotakPesan nada="galat">{pesanGalat(galat)}</KotakPesan>
      {ulang ? (
        <button type="button" onClick={ulang} className="text-sm font-medium text-primary underline underline-offset-2">
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}
