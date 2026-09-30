"use client";

// Pemilih list (untuk memindah tugas): saring nama, pilih satu.
import { useState } from "react";

import { Kosong } from "@/components/umum/keadaan";
import { Lembar } from "@/components/umum/lembar";
import { Input } from "@/components/ui/input";
import { useProfil } from "@/features/profil/penyedia-profil";
import { listDatar, useStruktur } from "@/features/struktur/queries";
import type { ListDatar } from "@/types/domain";

type Props = {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  kecualiId?: string;
  judul?: string;
  onPilih: (l: ListDatar) => void;
};

export function PemilihList({ buka, ubahBuka, kecualiId, judul = "Pindah ke list", onPilih }: Props) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={judul}>
      {buka ? <IsiPemilihList kecualiId={kecualiId} onPilih={(l) => { ubahBuka(false); onPilih(l); }} /> : null}
    </Lembar>
  );
}

function IsiPemilihList({ kecualiId, onPilih }: { kecualiId?: string; onPilih: (l: ListDatar) => void }) {
  const { data, isPending } = useStruktur();
  const { cermin } = useProfil();
  const [q, setQ] = useState("");
  const kata = q.trim().toLowerCase();
  const lists = listDatar(data).filter((l) => l.id !== kecualiId && (!kata || l.label.toLowerCase().includes(kata)));
  return (
    <div className="space-y-3" data-uji="pemilih-list">
      <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Saring nama list…" aria-label="Saring list" autoFocus />
      {isPending ? (
        <Kosong>Memuat…</Kosong>
      ) : lists.length === 0 ? (
        <Kosong>Tidak ada list yang cocok.</Kosong>
      ) : (
        <ul className="divide-y rounded-xl border">
          {lists.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onPilih(l)} className="w-full px-3 py-2.5 text-left hover:bg-muted" data-list={l.id}>
                <div className="text-sm font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.label}</div>
                {cermin && l.sumber === "clickup" ? <div className="text-xs text-cermin">List ClickUp</div> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
