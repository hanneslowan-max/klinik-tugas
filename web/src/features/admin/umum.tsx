"use client";

// Potongan UI bersama tab Admin: daftar berbaris, bidang form berlabel, kotak rahasia (token / password sementara)
// yang tampil sekali, dan salin ke papan klip.
import { Copy } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { WARNA_ANGGOTA_BAKU } from "@/lib/konstanta";
import { cn } from "@/lib/utils";

/** Daftar admin (anggota, struktur, hari libur, token): kartu bergaris antar-baris. */
export function DaftarAdmin({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("divide-y rounded-xl border bg-card", className)} {...props} />;
}

/** Baris daftar admin: isi (fleksibel) + aksi di kanan. */
export function BarisAdmin({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("flex min-h-14 items-center gap-3 px-3 py-2.5", className)} {...props} />;
}

/** Keterangan kecil di bawah judul baris (chip, email, waktu). */
export function SubBaris({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)} {...props} />;
}

/** Bidang form: label, kontrol, keterangan (redup) dan pesan galat per bidang. */
export function Bidang({
  label,
  htmlFor,
  ket,
  galat,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  ket?: ReactNode;
  galat?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {ket ? <p className="text-xs text-muted-foreground">{ket}</p> : null}
      {galat ? <p className="text-xs text-telat">{galat}</p> : null}
    </div>
  );
}

/** Kotak teks rahasia (token / password sementara) — sekali klik memilih semua. */
export function TeksRahasia({ nilai, ...rest }: { nilai: string; "data-uji"?: string }) {
  return (
    <div className="rounded-lg bg-muted p-3 font-mono text-sm break-all select-all" data-uji={rest["data-uji"]}>
      {nilai}
    </div>
  );
}

export async function salinTeks(teks: string) {
  try {
    await navigator.clipboard.writeText(teks);
    toast.success("Disalin");
  } catch {
    toast.error("Gagal menyalin. Salin manual.");
  }
}

export function TombolSalin({ teks }: { teks: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => void salinTeks(teks)}>
      <Copy aria-hidden />
      Salin
    </Button>
  );
}

/** Warna untuk <input type="color"> (wajib #rrggbb): #abc → #aabbcc; tidak sah → cadangan. */
export function warnaInput(w: string | null | undefined, cadangan = WARNA_ANGGOTA_BAKU): string {
  if (w && /^#[0-9a-f]{6}$/i.test(w)) return w;
  const m = w?.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : cadangan;
}

/** Kelas <input type="color"> (setinggi kontrol lain; ≥44px di layar sentuh). */
export const KELAS_WARNA =
  "h-8 w-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-11";
