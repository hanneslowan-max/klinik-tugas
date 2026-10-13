"use client";

// Dialog "Tugas baru" / "Sub-tugas baru" (web_buat_tugas). Default assignee = diri sendiri. Peringatan due jatuh
// di akhir pekan / hari libur tidak memblokir. Isi form (zod + react-hook-form) dimuat MALAS (next/dynamic,
// form-buat-tugas.tsx); Lembar/Dialog & pola `{buka ? <Form/> : null}` tetap statis (animasi, reset form, data-uji).
// Pramuat chunk form: saat browser senggang sesudah layar siap (usePramuatFormBuatTugas) dan saat tombol pembuka
// disentuh/difokus (pramuatFormBuatTugas) — jadi saat diklik form praktis langsung tampil. Gagal memuat (sinyal putus)
// → pesan + Coba lagi di dalam lembar (muatKomponen); layar di belakangnya beserta isiannya tetap utuh.
import dynamic from "next/dynamic";
import { useEffect } from "react";

import { Lembar } from "@/components/umum/lembar";
import { Skeleton } from "@/components/ui/skeleton";
import { pramuat, saatSenggang } from "@/lib/impor-aman";
import { muatKomponen } from "@/lib/muat-komponen";
import type { StatusList, Tugas } from "@/types/domain";

const FormBuatTugas = dynamic(() => muatKomponen(() => import("./form-buat-tugas"), (m) => m.FormBuatTugas, "form"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat form">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  ),
});

/** Pramuat chunk form (pointerdown/fokus tombol pembuka). */
export function pramuatFormBuatTugas() {
  pramuat(() => import("./form-buat-tugas"));
}

/** Pramuat chunk form saat browser senggang, begitu `aktif` (mis. data layar sudah tiba & tombol buat tersedia). */
export function usePramuatFormBuatTugas(aktif: boolean) {
  useEffect(() => (aktif ? saatSenggang(pramuatFormBuatTugas) : undefined), [aktif]);
}

type Props = {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  list: { id: string; name: string; statuses: StatusList[] };
  parentId?: string;
  judul?: string;
  onDibuat?: (t: Tugas) => void;
};

export function DialogBuatTugas({ buka, ubahBuka, list, parentId, judul, onDibuat }: Props) {
  return (
    <Lembar
      buka={buka}
      ubahBuka={ubahBuka}
      judul={judul ?? (parentId ? "Sub-tugas baru" : `Tugas baru · ${list.name}`)}
      data-uji="dialog-buat-tugas"
    >
      {buka ? <FormBuatTugas list={list} parentId={parentId} onBatal={() => ubahBuka(false)} onDibuat={(t) => { ubahBuka(false); onDibuat?.(t); }} /> : null}
    </Lembar>
  );
}
