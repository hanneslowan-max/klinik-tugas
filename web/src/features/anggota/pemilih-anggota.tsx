"use client";

// Pemilih anggota (multi) untuk assignee. Anggota terpilih yang tidak bisa dipilih lagi (nonaktif / eks-anggota
// impor / bot) tetap tampil — tercentang, bertanda — supaya bisa DILEPAS; mereka tidak muncul untuk ditambahkan.
import { useState } from "react";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { Kosong } from "@/components/umum/keadaan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAnggotaAktif } from "@/features/anggota/queries";
import type { AnggotaRingkas } from "@/types/domain";

type Props = {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  /** assignee sekarang (objek, supaya yang nonaktif tetap bisa ditampilkan) */
  terpilih: AnggotaRingkas[];
  judul?: string;
  onSimpan: (ids: number[]) => void | Promise<void>;
};

export function PemilihAnggota(props: Props) {
  // isi dialog dipasang ulang tiap kali dibuka supaya pilihan awal = assignee terbaru
  return (
    <Lembar buka={props.buka} ubahBuka={props.ubahBuka} judul={props.judul ?? "Pilih assignee"}>
      {props.buka ? <IsiPemilih {...props} /> : null}
    </Lembar>
  );
}

function IsiPemilih({ terpilih, onSimpan, ubahBuka }: Props) {
  const { data: aktif, isPending } = useAnggotaAktif();
  const [set, setSet] = useState(() => new Set(terpilih.map((a) => Number(a.id))));
  const [sibuk, setSibuk] = useState(false);
  const idAktif = new Set((aktif ?? []).map((m) => Number(m.id)));
  const tertinggal = terpilih.filter((a) => !idAktif.has(Number(a.id)));

  const ubah = (id: number, v: boolean) =>
    setSet((lama) => {
      const s = new Set(lama);
      if (v) s.add(id);
      else s.delete(id);
      return s;
    });

  const baris = (m: AnggotaRingkas, nonaktif: boolean) => (
    <li key={m.id}>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
        <Checkbox checked={set.has(Number(m.id))} onCheckedChange={(v) => ubah(Number(m.id), v === true)} value={String(m.id)} />
        <AvatarAnggota anggota={m} ukuran="sedang" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.username}</span>
          {m.nama && m.nama !== m.username ? <span className="block truncate text-xs text-muted-foreground">{m.nama}</span> : null}
        </span>
        {nonaktif ? <Chip nada="garis">{m.aktif === false ? "nonaktif · hanya bisa dilepas" : "hanya bisa dilepas"}</Chip> : null}
      </label>
    </li>
  );

  return (
    <div className="space-y-3" data-uji="pemilih-anggota">
      {isPending ? (
        <Kosong>Memuat anggota…</Kosong>
      ) : (
        <ul className="space-y-0.5">
          {tertinggal.map((m) => baris(m, true))}
          {(aktif ?? []).map((m) => baris(m, false))}
        </ul>
      )}
      <KakiLembar>
        <Button variant="outline" onClick={() => ubahBuka(false)}>
          Batal
        </Button>
        <Button
          disabled={sibuk}
          data-uji="simpan-anggota"
          onClick={async () => {
            setSibuk(true);
            try {
              await onSimpan([...set]);
              ubahBuka(false);
            } finally {
              setSibuk(false);
            }
          }}
        >
          Simpan
        </Button>
      </KakiLembar>
    </div>
  );
}
