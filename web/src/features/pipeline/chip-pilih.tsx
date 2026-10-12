"use client";

// Chip pilih (satu ketuk) ala mockup: tunggal (sumber) & ganda (produk). Aksesibel: aria-pressed, target ≥ 44px HP.
import { cn } from "@/lib/utils";

const kelasChip = (aktif: boolean) =>
  cn(
    "inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11",
    aktif
      ? "border-primary bg-primary/10 font-semibold text-primary"
      : "border-border bg-background text-foreground hover:bg-muted",
  );

/** Pilih satu (sumber). Sekali pilih tidak bisa dikosongkan lagi (sumber wajib, §3). */
export function GrupChip<T extends string>({
  opsi,
  nilai,
  onUbah,
  label,
  ariaInvalid,
}: {
  opsi: readonly T[];
  nilai: T | null;
  onUbah: (v: T) => void;
  label: string;
  ariaInvalid?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap gap-1.5", ariaInvalid && "rounded-lg p-1 ring-1 ring-telat/50")}
    >
      {opsi.map((o) => (
        <button key={o} type="button" aria-pressed={nilai === o} className={kelasChip(nilai === o)} onClick={() => onUbah(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Pilih banyak (produk). */
export function GrupChipGanda<T extends string>({
  opsi,
  nilai,
  onUbah,
  label,
}: {
  opsi: readonly T[];
  nilai: T[];
  onUbah: (v: T[]) => void;
  label: string;
}) {
  const alih = (o: T) => onUbah(nilai.includes(o) ? nilai.filter((x) => x !== o) : [...nilai, o]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {opsi.map((o) => (
        <button key={o} type="button" aria-pressed={nilai.includes(o)} className={kelasChip(nilai.includes(o))} onClick={() => alih(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
