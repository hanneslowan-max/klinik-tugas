"use client";

// Gerbang akses modul Pipeline (§6). Render-prop: hanya memanggil children saat pengguna punya akses.
import type { ReactNode } from "react";

import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { usePipelineSaya } from "@/features/pipeline/queries";
import type { PeranPipeline } from "@/types/domain";

export type AksesPipeline = {
  peran: PeranPipeline;
  boleh_ringkas: boolean;
  /** admin/rep boleh membuat & mengubah lead; 'baca' (Yosie) hanya melihat. */
  bolehTulis: boolean;
};

export function GerbangPipeline({
  perlu,
  children,
}: {
  perlu?: "ringkas";
  children: (akses: AksesPipeline) => ReactNode;
}) {
  const q = usePipelineSaya();
  if (q.isPending) return <MemuatDaftar />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => void q.refetch()} />;

  const { peran, boleh_ringkas } = q.data;
  if (!peran) {
    return (
      <KotakPesan nada="info" judul="Tidak ada akses">
        Modul Pipeline hanya untuk tim sales. Hubungi admin bila Anda perlu akses.
      </KotakPesan>
    );
  }
  if (perlu === "ringkas" && !boleh_ringkas) {
    return (
      <KotakPesan nada="info" judul="Ringkasan terbatas">
        Halaman Ringkasan hanya untuk admin. Buka daftar lead di menu Pipeline.
      </KotakPesan>
    );
  }
  return <>{children({ peran, boleh_ringkas, bolehTulis: peran === "admin" || peran === "rep" })}</>;
}
