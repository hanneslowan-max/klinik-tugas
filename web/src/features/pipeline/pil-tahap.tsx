import { Chip } from "@/components/umum/chip";
import { TAHAP } from "@/features/pipeline/konstanta";
import type { TahapLead } from "@/types/domain";

/** Pil tahap lead (BARU/PENAWARAN/ORDER/BATAL/DIALIHKAN) dengan warna semantik. */
export function PilTahap({ tahap, className }: { tahap: TahapLead; className?: string }) {
  const t = TAHAP[tahap];
  return (
    <Chip nada={t.nada} className={className}>
      {t.label}
    </Chip>
  );
}
