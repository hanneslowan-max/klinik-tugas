"use client";

// Sub-tugas: daftar + tombol "Sub-tugas" (hanya bila tugas bisa diubah dan bukan sub-tugas; satu tingkat).
import { Plus } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDetail } from "@/features/detail/konteks";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
import { DialogBuatTugas, pramuatFormBuatTugas, usePramuatFormBuatTugas } from "@/features/tugas/dialog-buat-tugas";

export function Subtugas() {
  const { d, bolehUbah, muat } = useDetail();
  const idJudul = useId();
  const [buka, setBuka] = useState(false);
  const t = d.task;
  const bolehTambah = bolehUbah && !t.parent_id;
  usePramuatFormBuatTugas(bolehTambah); // form Sub-tugas dipramuat saat senggang
  if (!d.subtasks.length && !bolehUbah) return null;
  return (
    <section aria-labelledby={idJudul} className="space-y-2" data-uji="subtugas">
      <div className="flex min-h-11 items-center gap-2">
        <h3 id={idJudul} className="flex-1 text-sm font-semibold">
          Sub-tugas ({d.subtasks.length})
        </h3>
        {bolehTambah ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBuka(true)}
            onPointerDown={pramuatFormBuatTugas}
            onFocus={pramuatFormBuatTugas}
            data-uji="tambah-subtugas"
          >
            <Plus aria-hidden />
            Sub-tugas
          </Button>
        ) : null}
      </div>
      {d.subtasks.length ? <DaftarTugas daftar={d.subtasks} /> : null}
      {bolehTambah ? (
        <DialogBuatTugas
          buka={buka}
          ubahBuka={setBuka}
          list={{ id: t.list.id, name: t.list.name, statuses: t.statuses }}
          parentId={t.id}
          kategoriAwal={t.kategori_kerja?.id}
          onDibuat={() => void muat()}
        />
      ) : null}
    </section>
  );
}
