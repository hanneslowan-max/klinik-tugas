import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Chip kecil untuk meta kartu (due, komentar, label, status akun). Warna semantik dari globals.css.
export const chipVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      nada: {
        biasa: "bg-muted text-muted-foreground",
        garis: "border border-border text-muted-foreground",
        telat: "bg-telat-lembut text-telat",
        "hari-ini": "bg-hari-ini-lembut text-hari-ini",
        dekat: "bg-dekat-lembut text-dekat",
        sukses: "bg-sukses-lembut text-sukses",
        cermin: "bg-cermin-lembut text-cermin",
        info: "bg-info-lembut text-info",
      },
    },
    defaultVariants: { nada: "biasa" },
  },
);

export function Chip({ className, nada, ...props }: ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return <span className={cn(chipVariants({ nada }), className)} {...props} />;
}
