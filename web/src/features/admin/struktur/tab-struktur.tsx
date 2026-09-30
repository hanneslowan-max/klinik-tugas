"use client";

// Admin › Struktur: pohon space → folder → list dengan tanda (ClickUp, arsip, tersembunyi, tidak ditagih),
// tambah & ubah (web_admin_struktur_simpan). Mode cermin: struktur ClickUp hanya-baca kecuali "tidak ditagih".
import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { useStrukturAdmin, type JenisStruktur } from "@/features/admin/queries";
import { DialogStruktur, type ItemStruktur, type SasaranStruktur } from "@/features/admin/struktur/form-struktur";
import { BarisAdmin, DaftarAdmin, SubBaris } from "@/features/admin/umum";
import { useProfil } from "@/features/profil/penyedia-profil";
import { cn } from "@/lib/utils";

export function TabStruktur() {
  const q = useStrukturAdmin();
  const { cermin } = useProfil();
  const [sasaran, setSasaran] = useState<SasaranStruktur | null>(null);

  if (q.isPending) return <MemuatDaftar />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;

  const s = q.data;
  const ubah = (jenis: JenisStruktur, item: ItemStruktur) => setSasaran({ jenis, item });
  const baris = (jenis: JenisStruktur, x: ItemStruktur, tingkat: 0 | 1 | 2, sub?: ReactNode) => (
    <BarisStruktur key={`${jenis}:${x.id}`} jenis={jenis} item={x} tingkat={tingkat} sub={sub} onUbah={() => ubah(jenis, x)} />
  );

  return (
    <section className="space-y-3" aria-label="Struktur">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setSasaran({ jenis: "space", item: null })} aria-label="Tambah space">
          <Plus aria-hidden />
          Space
        </Button>
        <Button variant="outline" onClick={() => setSasaran({ jenis: "folder", item: null })} aria-label="Tambah folder" disabled={!s.spaces.length}>
          <Plus aria-hidden />
          Folder
        </Button>
        <Button variant="outline" onClick={() => setSasaran({ jenis: "list", item: null })} aria-label="Tambah list" disabled={!s.spaces.length} data-uji="tambah-list">
          <Plus aria-hidden />
          List
        </Button>
      </div>
      {cermin ? <KotakPesan nada="cermin">Mode cermin: struktur ClickUp hanya-baca, kecuali tanda &quot;tidak ditagih&quot; pada list.</KotakPesan> : null}

      {s.spaces.length === 0 ? <Kosong>Belum ada space.</Kosong> : null}
      {s.spaces.map((sp) => (
        <DaftarAdmin key={sp.id} data-space={sp.id} aria-label={`Space ${sp.name}`}>
          {baris("space", sp, 0)}
          {sp.folders.map((f) => [
            baris("folder", f, 1),
            ...f.lists.map((l) => baris("list", l, 2, <span>di {f.name}</span>)),
          ])}
          {sp.lists.map((l) => baris("list", l, 1, <span>tanpa folder</span>))}
        </DaftarAdmin>
      ))}

      <DialogStruktur sasaran={sasaran} ubahBuka={(b) => !b && setSasaran(null)} struktur={s} />
    </section>
  );
}

const INDEN = ["", "pl-6 sm:pl-8", "pl-10 sm:pl-14"] as const;

function BarisStruktur({
  jenis,
  item: x,
  tingkat,
  sub,
  onUbah,
}: {
  jenis: JenisStruktur;
  item: ItemStruktur;
  tingkat: 0 | 1 | 2;
  sub?: ReactNode;
  onUbah: () => void;
}) {
  return (
    <BarisAdmin data-struktur={x.id} data-jenis={jenis} className={cn(INDEN[tingkat], x.archived && "bg-muted/40")}>
      <div className="min-w-0 flex-1">
        <strong className={cn("block truncate text-sm", jenis === "space" ? "font-bold" : "font-semibold", x.archived && "text-muted-foreground")}>
          {x.name}
        </strong>
        <SubBaris>
          <Chip>{jenis}</Chip>
          {x.sumber === "clickup" ? <Chip nada="garis">ClickUp</Chip> : null}
          {x.archived ? <Chip nada="garis">arsip</Chip> : null}
          {"private" in x && x.private ? <Chip nada="garis">privat</Chip> : null}
          {"hidden" in x && x.hidden ? <Chip nada="garis">tersembunyi</Chip> : null}
          {"tidak_ditagih" in x && x.tidak_ditagih ? <Chip nada="hari-ini">tidak ditagih</Chip> : null}
          {sub}
        </SubBaris>
      </div>
      <Button variant="outline" aria-label={`Ubah ${jenis} ${x.name}`} onClick={onUbah}>
        Ubah
      </Button>
    </BarisAdmin>
  );
}
