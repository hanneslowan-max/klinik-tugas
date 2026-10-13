"use client";

// Data order (revisi #5–#7): nominal order, No SP (nomor urut → nomor/KODE/ROMAWI/TAHUN dari tanggal SP), No PO customer,
// dan pembayaran Belum bayar / DP / Lunas → web_pipeline_order_ubah. Hanya isian yang berubah yang dikirim. Dibuka dari
// detail lead maupun baris tab Order. Hak (rep pemilik + admin) & aturan nilai ditegakkan server; galatnya ditampilkan.
import { useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GrupChip } from "@/features/pipeline/chip-pilih";
import { BAYAR, pratinjauNoSp, rupiah } from "@/features/pipeline/konstanta";
import { useOrderUbah, type BodyOrderUbah } from "@/features/pipeline/mutasi";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal } from "@/lib/tanggal";
import type { LeadRingkas, StatusBayar } from "@/types/domain";

/** Cukup data order dari baris daftar (LeadRingkas) atau detail (LeadDetail). */
export type DataOrder = Pick<
  LeadRingkas,
  "id" | "kode" | "no_sp" | "tanggal_sp" | "nilai_transaksi" | "no_po" | "bayar_status" | "bayar_dp" | "tanggal_dp" | "tanggal_lunas"
> & { pemilik_kode_sp?: string | null };

const POLA_SP = /^(\d+)\/(RSG|MCE)\/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\/(20\d\d)$/;
const STATUS: StatusBayar[] = ["BELUM", "DP", "LUNAS"];
const angka = (s: string) => s.replace(/\D/g, "");

export function DialogOrder({ buka, ubahBuka, lead }: { buka: boolean; ubahBuka: (b: boolean) => void; lead: DataOrder }) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={`Data order · ${lead.kode}`} data-uji="dialog-order">
      {buka ? <IsiOrder lead={lead} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function IsiOrder({ lead, onSelesai }: { lead: DataOrder; onSelesai: () => void }) {
  const simpan = useOrderUbah();
  const { hariIni } = useProfil();
  const cocok = lead.no_sp ? POLA_SP.exec(lead.no_sp) : null;
  const nomorAwal = cocok?.[1] ?? "";
  const kodeSp = cocok?.[2] ?? lead.pemilik_kode_sp ?? null;

  const [nomor, setNomor] = useState(nomorAwal);
  const [tanggalSp, setTanggalSp] = useState(lead.tanggal_sp ?? hariIni);
  const [noPo, setNoPo] = useState(lead.no_po ?? "");
  const [nilai, setNilai] = useState(lead.nilai_transaksi != null ? String(lead.nilai_transaksi) : "");
  const [status, setStatus] = useState<StatusBayar | null>(lead.bayar_status);
  const [dp, setDp] = useState(lead.bayar_dp != null ? String(lead.bayar_dp) : "");
  const [tglDp, setTglDp] = useState(lead.tanggal_dp ?? hariIni);
  const [tglLunas, setTglLunas] = useState(lead.tanggal_lunas ?? hariIni);
  const [galat, setGalat] = useState<string | null>(null);

  const nilaiAngka = Number(angka(nilai)) || 0;
  const dpAngka = Number(angka(dp)) || 0;

  const kirim = async () => {
    setGalat(null);
    const body: BodyOrderUbah = { lead_id: lead.id };

    if (!nilaiAngka) return setGalat("Nominal order wajib diisi (> 0).");
    if (nilaiAngka !== lead.nilai_transaksi) body.nilai_transaksi = nilaiAngka;

    if (!tanggalSp) return setGalat("Isi tanggal SP.");
    const tanggalBerubah = tanggalSp !== lead.tanggal_sp;
    if (tanggalBerubah) body.tanggal_sp = tanggalSp;
    if (nomorAwal && !angka(nomor)) return setGalat("Isi nomor urut SP.");
    // No SP berpola: kirim nomor bila nomor ATAU tanggal berubah, supaya bulan/tahun di No SP ikut tanggal SP
    if (angka(nomor) && (angka(nomor) !== nomorAwal || tanggalBerubah)) body.nomor = angka(nomor);

    const po = noPo.replace(/\s+/g, " ").trim();
    if (po !== (lead.no_po ?? "")) body.no_po = po || null;

    if (status) {
      const bayarBerubah =
        status !== lead.bayar_status ||
        (status === "DP" && (dpAngka !== lead.bayar_dp || tglDp !== lead.tanggal_dp)) ||
        (status === "LUNAS" && tglLunas !== lead.tanggal_lunas);
      if (bayarBerubah) {
        body.bayar_status = status;
        if (status === "DP") {
          if (!dpAngka) return setGalat("Isi nominal DP (> 0).");
          if (dpAngka >= nilaiAngka) return setGalat("Nominal DP harus lebih kecil dari nominal order. Bila sudah dibayar penuh, pilih Lunas.");
          body.bayar_dp = dpAngka;
          body.tanggal_dp = tglDp;
        } else if (status === "LUNAS") {
          body.tanggal_lunas = tglLunas;
        }
      }
    }

    if (Object.keys(body).length === 1) {
      onSelesai();
      return;
    }
    try {
      await simpan.mutateAsync(body);
      toast.success(`Data order ${lead.kode} disimpan`);
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label="Dokumen">
        <div className="space-y-1.5">
          <Label htmlFor="od-nomor">Nomor urut SP</Label>
          <Input id="od-nomor" inputMode="numeric" value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="mis. 214" />
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {nomorAwal || angka(nomor) ? (
              <>
                No SP: <span className="font-mono text-foreground">{pratinjauNoSp(nomor, tanggalSp, kodeSp)}</span>
              </>
            ) : (
              <>
                No SP sekarang: <span className="font-mono text-foreground">{lead.no_sp || "—"}</span>
                {lead.no_sp ? " (format lama). Isi nomor urut untuk menggantinya." : ""}
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="od-tsp">Tanggal SP</Label>
            <Input id="od-tsp" type="date" max={hariIni} value={tanggalSp} onChange={(e) => setTanggalSp(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="od-po">No PO customer</Label>
            <Input
              id="od-po"
              value={noPo}
              maxLength={60}
              onChange={(e) => setNoPo(e.target.value)}
              placeholder="opsional, mis. PO/2026/117"
              data-uji="input-no-po"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="od-nilai">Nominal order (Rp)</Label>
          <Input id="od-nilai" inputMode="numeric" value={nilai} onChange={(e) => setNilai(e.target.value)} data-uji="input-nominal" />
          {nilaiAngka ? <p className="text-xs font-medium tabular-nums">{rupiah(nilaiAngka)}</p> : null}
        </div>
      </section>

      <section className="space-y-3" aria-label="Pembayaran">
        <div className="space-y-1.5">
          <Label>Pembayaran</Label>
          <GrupChip opsi={STATUS} nilai={status} onUbah={setStatus} label="Status pembayaran" labelOpsi={(s) => BAYAR[s].label} />
          {lead.bayar_status == null && status == null ? (
            <p className="text-xs text-muted-foreground">Status bayar order ini belum dicatat. Pilih salah satu bila sudah diketahui.</p>
          ) : null}
        </div>
        {status === "DP" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="od-dp">Nominal DP (Rp)</Label>
              <Input id="od-dp" inputMode="numeric" value={dp} onChange={(e) => setDp(e.target.value)} data-uji="input-dp" />
              {dpAngka ? <p className="text-xs font-medium tabular-nums">{rupiah(dpAngka)}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-tdp">Tanggal DP</Label>
              <Input id="od-tdp" type="date" max={hariIni} value={tglDp} onChange={(e) => setTglDp(e.target.value)} />
            </div>
            <p className="col-span-2 text-sm">
              Sisa tagihan:{" "}
              <span className="font-semibold tabular-nums" data-uji="pratinjau-sisa">
                {rupiah(Math.max(0, nilaiAngka - dpAngka))}
              </span>
            </p>
          </div>
        ) : null}
        {status === "LUNAS" ? (
          <div className="space-y-1.5">
            <Label htmlFor="od-tl">Tanggal lunas</Label>
            <Input id="od-tl" type="date" max={hariIni} value={tglLunas} onChange={(e) => setTglLunas(e.target.value)} className="max-w-48" />
            {lead.bayar_dp ? (
              <p className="text-xs text-muted-foreground">
                DP sebelumnya {rupiah(lead.bayar_dp)}
                {lead.tanggal_dp ? ` (${fmtTanggal(lead.tanggal_dp, hariIni)})` : ""} tetap tercatat.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}

      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="button" onClick={kirim} disabled={simpan.isPending} data-uji="simpan-order">
          {simpan.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </div>
  );
}
