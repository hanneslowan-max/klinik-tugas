import { cn } from "@/lib/utils";
import { WARNA_ANGGOTA_BAKU } from "@/lib/konstanta";
import { inisial, warnaAman } from "@/lib/teks";
import type { AnggotaRingkas } from "@/types/domain";

type Props = {
  anggota: Pick<AnggotaRingkas, "username"> & Partial<AnggotaRingkas>;
  ukuran?: "kecil" | "sedang" | "besar";
  className?: string;
};

const UKURAN = { kecil: "size-6 text-[10px]", sedang: "size-8 text-xs", besar: "size-10 text-sm" } as const;

/** Lingkaran inisial dengan warna anggota (warna dari data, disaring warnaAman). */
export function AvatarAnggota({ anggota, ukuran = "kecil", className }: Props) {
  const warna = warnaAman(anggota.color) ?? WARNA_ANGGOTA_BAKU;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-background select-none",
        UKURAN[ukuran],
        className,
      )}
      style={{ backgroundColor: warna }}
      title={anggota.nama || anggota.username}
      aria-hidden
    >
      {inisial(anggota)}
    </span>
  );
}

/** Tumpukan avatar assignee (maks. `maks`, sisanya "+n"). */
export function AvatarTumpuk({ daftar, maks = 4 }: { daftar: AnggotaRingkas[]; maks?: number }) {
  if (!daftar.length) return null;
  const tampak = daftar.slice(0, maks);
  const sisa = daftar.length - tampak.length;
  return (
    <span className="inline-flex items-center -space-x-1.5" aria-label={`Assignee: ${daftar.map((a) => a.username).join(", ")}`}>
      {tampak.map((a) => (
        <AvatarAnggota key={a.id} anggota={a} />
      ))}
      {sisa > 0 ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background">
          +{sisa}
        </span>
      ) : null}
    </span>
  );
}
