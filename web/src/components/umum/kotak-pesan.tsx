import { AlertTriangle, Info, Lock, OctagonX } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const NADA = {
  galat: { kelas: "border-telat/30 bg-telat-lembut text-telat", Ikon: OctagonX },
  peringatan: { kelas: "border-hari-ini/30 bg-hari-ini-lembut text-hari-ini", Ikon: AlertTriangle },
  info: { kelas: "border-info/25 bg-info-lembut text-foreground", Ikon: Info },
  cermin: { kelas: "border-cermin/30 bg-cermin-lembut text-cermin", Ikon: Lock },
} as const;

type Props = Omit<ComponentProps<"div">, "title"> & {
  nada: keyof typeof NADA;
  judul?: ReactNode;
  tanpaIkon?: boolean;
};

/** Kotak pesan (galat / peringatan / info / mode cermin). Galat memakai role="alert". */
export function KotakPesan({ nada, judul, tanpaIkon, className, children, ...props }: Props) {
  const { kelas, Ikon } = NADA[nada];
  return (
    <div
      role={nada === "galat" ? "alert" : "note"}
      className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", kelas, className)}
      {...props}
    >
      {tanpaIkon ? null : <Ikon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">
        {judul ? <div className="font-semibold">{judul}</div> : null}
        <div className="[&_a]:underline">{children}</div>
      </div>
    </div>
  );
}
