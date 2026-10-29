"use client";

// Kepingan tampilan Dasbor Pipeline (dipakai layar-dasbor & bagian-lanjut): kartu, judul bagian bernomor, angka besar,
// meter progres (satu seri), angka bergaris titik yang membuka daftar lead, dan catatan "kenapa belum valid".
import { Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { angka } from "@/features/pipeline/dasbor";
import { cn } from "@/lib/utils";

export function Kartu({ children, className, uji }: { children: ReactNode; className?: string; uji?: string }) {
  return (
    // min-w-0: kartu = item grid; isi lebar (grafik, tabel) tidak boleh melebarkan kolom di HP
    <div className={cn("min-w-0 rounded-xl border bg-card p-4", className)} data-uji={uji}>
      {children}
    </div>
  );
}

export function JudulBagian({ no, children }: { no?: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      {no ? (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary tabular-nums">
          {no}
        </span>
      ) : null}
      {children}
    </h2>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}

export function Besar({ children, uji }: { children: ReactNode; uji?: string }) {
  return (
    <div className="text-2xl font-semibold tabular-nums" data-uji={uji}>
      {children}
    </div>
  );
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xs text-muted-foreground", className)}>{children}</div>;
}

/** Progres ke target (satu seri: tanpa legenda; angkanya tertulis di samping). */
export function Meter({ r, label, className }: { r: number; label: string; className?: string }) {
  const p = Math.max(0, Math.min(1, r));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(r * 100)}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

/** Angka yang membuka daftar lead di baliknya. */
export function Angka({ n, href, uji, className }: { n: number; href: string; uji?: string; className?: string }) {
  return (
    <Link
      href={href}
      data-uji={uji}
      className={cn(
        "tabular-nums underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 hover:text-primary hover:decoration-primary",
        className,
      )}
    >
      {angka(n)}
    </Link>
  );
}

/** Catatan "kenapa angka ini kosong / belum valid" (oranye lembut, ikon + teks). */
export function Catatan({ children, uji }: { children: ReactNode; uji?: string }) {
  return (
    <p className="flex gap-2 rounded-lg bg-hari-ini-lembut px-3 py-2 text-xs text-foreground" data-uji={uji}>
      <Info className="mt-px size-3.5 shrink-0 text-hari-ini" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export const namaSales = (nama: string | null, pemilik: number | null) => (pemilik == null ? "Tanpa pemilik" : (nama ?? `#${pemilik}`));
