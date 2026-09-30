import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Wadah isi halaman: lebar baca nyaman (max 3xl); `lebar` = penuh (papan/Board, admin). */
export function IsiHalaman({ children, lebar, className }: { children: ReactNode; lebar?: boolean; className?: string }) {
  return <div className={cn("mx-auto w-full flex-1 px-4 py-4 md:px-6", lebar ? "max-w-none" : "max-w-3xl", className)}>{children}</div>;
}
