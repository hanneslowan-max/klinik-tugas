"use client";

// Catat follow-up (§5): jenis (chips) + hasil + rencana berikutnya (opsional) → web_pipeline_fu_catat.
import { useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GrupChip } from "@/features/pipeline/chip-pilih";
import { JENIS_FU } from "@/features/pipeline/konstanta";
import { useFuCatat } from "@/features/pipeline/mutasi";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal } from "@/lib/tanggal";
import type { JenisAktivitas } from "@/types/domain";

export function DialogFu({ buka, ubahBuka, leadId }: { buka: boolean; ubahBuka: (b: boolean) => void; leadId: string }) {
  const simpan = useFuCatat();
  const { hariIni } = useProfil();
  const [jenis, setJenis] = useState<JenisAktivitas>("Telepon");
  const [hasil, setHasil] = useState("");
  const [rencana, setRencana] = useState("");
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    setGalat(null);
    try {
      await simpan.mutateAsync({
        lead_id: leadId,
        jenis,
        hasil: hasil.trim() || undefined,
        rencana_berikutnya: rencana || undefined,
      });
      toast.success("Follow-up tercatat");
      ubahBuka(false);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul="Catat follow-up" data-uji="dialog-fu">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Jenis</Label>
          <GrupChip opsi={JENIS_FU} nilai={jenis} onUbah={setJenis} label="Jenis follow-up" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-hasil">Hasil</Label>
          <Textarea id="fu-hasil" rows={3} value={hasil} onChange={(e) => setHasil(e.target.value)} placeholder="Apa hasil kontak ini?" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fu-next">
            Rencana berikutnya <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Input id="fu-next" type="date" value={rencana} onChange={(e) => setRencana(e.target.value)} />
          {rencana ? <p className="text-xs text-muted-foreground">{fmtTanggal(rencana, hariIni)}</p> : null}
        </div>
        {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
        <KakiLembar>
          <Button type="button" variant="outline" onClick={() => ubahBuka(false)}>
            Batal
          </Button>
          <Button type="button" onClick={kirim} disabled={simpan.isPending} data-uji="kirim-fu">
            {simpan.isPending ? "Menyimpan…" : "Simpan FU"}
          </Button>
        </KakiLembar>
      </div>
    </Lembar>
  );
}
