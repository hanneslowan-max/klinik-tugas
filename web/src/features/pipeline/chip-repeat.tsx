import { Repeat } from "lucide-react";

import { Chip } from "@/components/umum/chip";

/** Label "Repeat" di baris lead: pelanggan ini sudah order `n` kali sebelum lead ini masuk (order_sebelumnya). */
export function ChipRepeat({ n }: { n: number | null | undefined }) {
  if (!n) return null;
  return (
    <Chip nada="sukses" title={`Pelanggan ini sudah order ${n}× sebelumnya`} data-uji="chip-repeat">
      <Repeat aria-hidden />
      Repeat{n > 1 ? ` ${n}×` : ""}
    </Chip>
  );
}
