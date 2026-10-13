"use client";

// Umpan balik instan saat tautan diklik. Semua rute (app) dinamis dan sengaja TANPA loading.tsx (fallback generik
// justru menunda konten), jadi tanpa ini layar diam sampai RSC + chunk + render selesai. useLinkStatus (next/link)
// memakai useOptimistic: status pending tampil di frame yang sama dengan klik, tanpa Suspense.
// Semua komponen/hook di sini HANYA berlaku bila dirender sebagai TURUNAN <Link> (di luar Link selalu "tidak menunggu").
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** true sejak tautan induk diklik sampai URL berganti (navigasi selesai). */
export function useTautanMenunggu(): boolean {
  return useLinkStatus().pending;
}

/**
 * Garis progres kecil berukuran tetap. Selalu dirender (tidak menggeser tata letak); saat menunggu ia muncul sesudah
 * ±120 ms lalu berdenyut, jadi navigasi cepat tidak berkedip. Posisinya diatur pemanggil (induk harus `relative`).
 */
export function PetunjukTautan({ className }: { className?: string }) {
  const menunggu = useTautanMenunggu();
  return (
    <span
      aria-hidden
      data-uji="indikator-navigasi"
      data-pending={menunggu ? "" : undefined}
      className={cn("petunjuk-tautan pointer-events-none absolute rounded-full bg-primary", className)}
    />
  );
}

/**
 * Pembungkus isi tautan baris/kartu: seketika diredupkan saat diklik (tanda tap diterima) + garis progres di tepi
 * bawah bila navigasi lama. Tidak menambah handler apa pun (aman di dalam kartu dnd-kit).
 */
export function IsiTautan({
  className,
  kelasPetunjuk = "inset-x-0 -bottom-1 h-0.5",
  children,
}: {
  className?: string;
  /** posisi garis petunjuk (relatif terhadap pembungkus ini) */
  kelasPetunjuk?: string;
  children: ReactNode;
}) {
  const menunggu = useTautanMenunggu();
  return (
    <div data-pending={menunggu ? "" : undefined} className={cn("relative data-pending:opacity-60", className)}>
      {children}
      <PetunjukTautan className={kelasPetunjuk} />
    </div>
  );
}
