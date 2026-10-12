"use client";

// Pindah tahap lead (§5): Kirim penawaran / Order / Batal / Alihkan → web_pipeline_tahap.
// Order: nomor urut SP + tanggal SP + nilai; pratinjau No SP + galat server (pola/duplikat/nilai/tanggal) ditampilkan.
// Batal: alasan (+ alasan lain bila "Lainnya").
import { useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALASAN_BATAL, pratinjauNoSp } from "@/features/pipeline/konstanta";
import { usePipelineSaya } from "@/features/pipeline/queries";
import { useTahap, type BodyTahap } from "@/features/pipeline/mutasi";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal } from "@/lib/tanggal";
import type { LeadDetail } from "@/types/domain";

export type AksiTahap = "penawaran" | "order" | "batal" | "alihkan";

const JUDUL: Record<AksiTahap, string> = {
  penawaran: "Kirim penawaran",
  order: "Catat order",
  batal: "Batalkan lead",
  alihkan: "Alihkan lead",
};

export function DialogTahap({
  buka,
  ubahBuka,
  lead,
  aksi,
}: {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  lead: LeadDetail;
  aksi: AksiTahap;
}) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={`${JUDUL[aksi]} · ${lead.kode}`} data-uji="dialog-tahap">
      {buka ? <IsiTahap lead={lead} aksi={aksi} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function IsiTahap({ lead, aksi, onSelesai }: { lead: LeadDetail; aksi: AksiTahap; onSelesai: () => void }) {
  const simpan = useTahap();
  const { hariIni } = useProfil(); // tanggal WIB dari server (hindari Date.now di render)
  const saya = usePipelineSaya();
  const kodeSp = lead.pemilik_kode_sp ?? saya.data?.kode_sp ?? null; // kode SP pemilik lead, atau aktor saat klaim
  const [galat, setGalat] = useState<string | null>(null);

  // penawaran
  const [nilaiPenawaran, setNilaiPenawaran] = useState(lead.nilai_penawaran != null ? String(lead.nilai_penawaran) : "");
  // order
  const [nomor, setNomor] = useState("");
  const [tanggalSp, setTanggalSp] = useState(hariIni);
  const [nilai, setNilai] = useState("");
  // batal
  const [alasan, setAlasan] = useState("");
  const [alasanLain, setAlasanLain] = useState("");
  // alihkan
  const [dialihkanKe, setDialihkanKe] = useState(lead.dialihkan_ke ?? "");

  const kirim = async () => {
    setGalat(null);
    const body: BodyTahap = { lead_id: lead.id, aksi };

    if (aksi === "penawaran") {
      if (nilaiPenawaran.trim()) body.nilai_penawaran = Number(nilaiPenawaran.replace(/\D/g, ""));
    } else if (aksi === "order") {
      if (!nomor.replace(/\D/g, "")) return setGalat("Isi nomor urut SP.");
      if (!tanggalSp) return setGalat("Isi tanggal SP.");
      const nil = Number(nilai.replace(/\D/g, ""));
      if (!nil || nil <= 0) return setGalat("Nilai transaksi wajib diisi (> 0) untuk order.");
      body.nomor = nomor;
      body.tanggal_sp = tanggalSp;
      body.nilai_transaksi = nil;
    } else if (aksi === "batal") {
      if (!alasan) return setGalat("Pilih alasan batal dulu.");
      body.alasan_batal = alasan;
      if (alasan === "Lainnya") {
        if (!alasanLain.trim()) return setGalat('Alasan "Lainnya" wajib diisi teks.');
        body.alasan_batal_lain = alasanLain.trim();
      }
    } else if (aksi === "alihkan") {
      if (!dialihkanKe.trim()) return setGalat("Isi tujuan pengalihan (nama sales / cabang).");
      body.dialihkan_ke = dialihkanKe.trim();
    }

    try {
      await simpan.mutateAsync(body);
      toast.success(`${JUDUL[aksi]}: ${lead.kode}`);
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      {aksi === "penawaran" ? (
        <div className="space-y-1.5">
          <Label htmlFor="th-np">
            Nilai penawaran (Rp) <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Input id="th-np" inputMode="numeric" value={nilaiPenawaran} onChange={(e) => setNilaiPenawaran(e.target.value)} />
          <p className="text-xs text-muted-foreground">Tahap pindah ke PENAWARAN. Tanggal penawaran dicatat otomatis.</p>
        </div>
      ) : null}

      {aksi === "order" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="th-nomor">Nomor urut SP</Label>
            <Input id="th-nomor" inputMode="numeric" value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="mis. 214" />
            <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              No SP jadi: <span className="font-mono text-foreground">{pratinjauNoSp(nomor, tanggalSp, kodeSp)}</span>
              <br />
              {kodeSp
                ? "Kode diisi otomatis dari pemilik lead; bulan & tahun dari tanggal SP."
                : "Kode SP pemilik belum diatur — minta admin set kode SP sebelum simpan order."}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="th-tsp">Tanggal SP</Label>
              <Input id="th-tsp" type="date" max={hariIni} value={tanggalSp} onChange={(e) => setTanggalSp(e.target.value)} />
              {tanggalSp ? <p className="text-xs text-muted-foreground">{fmtTanggal(tanggalSp, hariIni)}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="th-nilai">Nilai transaksi (Rp)</Label>
              <Input id="th-nilai" inputMode="numeric" value={nilai} onChange={(e) => setNilai(e.target.value)} />
            </div>
          </div>
        </>
      ) : null}

      {aksi === "batal" ? (
        <>
          <div className="space-y-1.5">
            <Label>Alasan batal</Label>
            <Select value={alasan} onValueChange={setAlasan}>
              <SelectTrigger className="w-full" aria-label="Alasan batal">
                <SelectValue placeholder="Pilih alasan" />
              </SelectTrigger>
              <SelectContent>
                {ALASAN_BATAL.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {alasan === "Lainnya" ? (
            <div className="space-y-1.5">
              <Label htmlFor="th-al">Alasan lain</Label>
              <Input id="th-al" value={alasanLain} onChange={(e) => setAlasanLain(e.target.value)} placeholder="Tulis alasan" />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">Alasan dipakai untuk membedah kenapa kalah (laporan Ringkasan).</p>
        </>
      ) : null}

      {aksi === "alihkan" ? (
        <div className="space-y-1.5">
          <Label htmlFor="th-ke">Dialihkan ke</Label>
          <Input
            id="th-ke"
            value={dialihkanKe}
            onChange={(e) => setDialihkanKe(e.target.value)}
            placeholder="Nama sales / cabang tujuan"
          />
          <p className="text-xs text-muted-foreground">Ketik nama sales atau cabang yang menerima lead ini.</p>
        </div>
      ) : null}

      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}

      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button
          type="button"
          variant={aksi === "batal" ? "destructive" : "default"}
          onClick={kirim}
          disabled={simpan.isPending}
          data-uji="kirim-tahap"
        >
          {simpan.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </div>
  );
}
