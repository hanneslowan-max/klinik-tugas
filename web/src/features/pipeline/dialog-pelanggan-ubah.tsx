"use client";

// Ubah data pelanggan (nama, jenis, kota, catatan) → web_pipeline_pelanggan_ubah (admin & rep). Berlaku untuk SEMUA lead
// pelanggan ini (nama di daftar lead ikut berubah).
import { useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GrupChip } from "@/features/pipeline/chip-pilih";
import { usePelangganUbah } from "@/features/pipeline/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import type { JenisPelanggan, PelangganDetail } from "@/types/domain";

const JENIS: JenisPelanggan[] = ["perusahaan", "perorangan"];

export function DialogPelangganUbah({
  buka,
  ubahBuka,
  pelanggan,
}: {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  pelanggan: PelangganDetail["pelanggan"];
}) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul="Ubah data pelanggan" data-uji="dialog-ubah-pelanggan">
      {buka ? <IsiUbah pelanggan={pelanggan} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function IsiUbah({ pelanggan: p, onSelesai }: { pelanggan: PelangganDetail["pelanggan"]; onSelesai: () => void }) {
  const ubah = usePelangganUbah();
  const [nama, setNama] = useState(p.nama);
  const [jenis, setJenis] = useState<JenisPelanggan>(p.jenis);
  const [kota, setKota] = useState(p.kota ?? "");
  const [catatan, setCatatan] = useState(p.catatan ?? "");
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    setGalat(null);
    if (!nama.trim()) return setGalat("Nama pelanggan wajib diisi.");
    try {
      await ubah.mutateAsync({
        pelanggan_id: p.id,
        nama: nama.trim(),
        jenis,
        kota: kota.trim() || null,
        catatan: catatan.trim() || null,
      });
      toast.success("Data pelanggan diperbarui");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="up-nama">Nama perusahaan / pelanggan</Label>
        <Input id="up-nama" value={nama} onChange={(e) => setNama(e.target.value)} autoComplete="off" maxLength={200} data-uji="up-nama" />
        {p.semu ? (
          <p className="text-xs text-muted-foreground">Nama ini masih pengisi dari sheet lama — ganti dengan nama asli bila tahu.</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label>Jenis</Label>
        <GrupChip
          opsi={JENIS}
          nilai={jenis}
          onUbah={setJenis}
          label="Jenis pelanggan"
          labelOpsi={(v) => (v === "perusahaan" ? "Perusahaan" : "Perorangan")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-kota">Kota / alamat</Label>
        <Input id="up-kota" value={kota} onChange={(e) => setKota(e.target.value)} autoComplete="off" maxLength={300} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-catatan">Catatan</Label>
        <Textarea id="up-catatan" rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={2000} />
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="button" onClick={kirim} disabled={ubah.isPending} data-uji="kirim-ubah-pelanggan">
          {ubah.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </div>
  );
}
