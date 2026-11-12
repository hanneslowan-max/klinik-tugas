"use client";

// Batalkan order (14 Okt 2026: "customer bisa membatalkan setelah terjadi order") → web_pipeline_tahap aksi 'batal_order'.
// Alasan TERTULIS wajib (5–500 karakter sesudah dirapikan, sama dengan server). Lead pindah ke BATAL (alasan "Order
// dibatalkan"); No SP, nominal & pembayaran tetap tersimpan sebagai riwayat. Hak (rep pemilik / admin) ditegakkan server.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALASAN_ORDER_MAKS, ALASAN_ORDER_MIN, galatAlasanOrder, rapikanAlasanOrder, rupiah } from "@/features/pipeline/konstanta";
import { useTahap } from "@/features/pipeline/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal } from "@/lib/tanggal";
import type { LeadDetail } from "@/types/domain";

export function DialogBatalOrder({ buka, ubahBuka, lead }: { buka: boolean; ubahBuka: (b: boolean) => void; lead: LeadDetail }) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={`Batalkan order · ${lead.kode}`} data-uji="dialog-batal-order">
      {/* isi dilepas saat tertutup → dibuka lagi = alasan & galat kosong */}
      {buka ? <IsiBatalOrder lead={lead} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function IsiBatalOrder({ lead, onSelesai }: { lead: LeadDetail; onSelesai: () => void }) {
  const simpan = useTahap();
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [alasanSalah, setAlasanSalah] = useState(false);
  const refAlasan = useRef<HTMLTextAreaElement>(null);
  const refGalat = useRef<HTMLDivElement>(null);

  // dialog ini tinggi (peringatan + ringkasan + textarea): galat (elemen terakhir sebelum KakiLembar yang lengket) bisa
  // tertutup kaki di HP 390×844 / laptop pendek. "nearest" tidak menggulir (galat dianggap sudah di dalam area gulir) →
  // "end" + scroll-mb (≥ tinggi kaki) = gulir sampai galat utuh di atas kaki.
  useEffect(() => {
    if (galat) refGalat.current?.scrollIntoView({ block: "end" });
  }, [galat]);

  const kirim = async () => {
    setGalat(null);
    const g = galatAlasanOrder(alasan);
    setAlasanSalah(Boolean(g));
    if (g) {
      refAlasan.current?.focus({ preventScroll: true });
      return setGalat(g);
    }
    try {
      await simpan.mutateAsync({ lead_id: lead.id, aksi: "batal_order", alasan: rapikanAlasanOrder(alasan) });
      toast.success(`Order dibatalkan: ${lead.kode}`);
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  // uang yang sudah diterima: LUNAS = nominal order, DP = nominal DP
  const dibayar = lead.bayar_status === "LUNAS" || lead.bayar_status === "DP";
  const nominalDibayar = lead.bayar_status === "LUNAS" ? lead.nilai_transaksi : lead.bayar_dp;
  const tanggalBayar = lead.bayar_status === "LUNAS" ? lead.tanggal_lunas : lead.tanggal_dp;

  return (
    <div className="space-y-4">
      <KotakPesan nada="peringatan" judul="Order ini akan dibatalkan">
        Lead pindah ke tahap BATAL dan keluar dari tab Order serta total order. No SP, nominal, dan data pembayaran tetap
        tersimpan sebagai riwayat. Pembatalan tidak bisa diurungkan dari aplikasi.
      </KotakPesan>

      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 text-sm" aria-label="Ringkasan order">
        <dt className="text-muted-foreground">No SP</dt>
        <dd className="min-w-0 font-mono break-words">{lead.no_sp || "—"}</dd>
        <dt className="text-muted-foreground">Nominal</dt>
        <dd className="font-medium tabular-nums">{rupiah(lead.nilai_transaksi)}</dd>
        <dt className="text-muted-foreground">Pembayaran</dt>
        <dd className="min-w-0">
          {dibayar ? (
            <>
              <span className="tabular-nums">
                {lead.bayar_status === "LUNAS" ? "Lunas" : "DP"}
                {nominalDibayar != null ? ` ${rupiah(nominalDibayar)}` : ""} sudah dibayar
                {tanggalBayar ? ` (${fmtTanggal(tanggalBayar)})` : ""}
              </span>
              <span className="block text-xs text-muted-foreground">Pengembalian dana diurus di luar Anvil.</span>
            </>
          ) : (
            <span className="text-muted-foreground">{lead.bayar_status === "BELUM" ? "Belum ada pembayaran" : "Pembayaran belum dicatat"}</span>
          )}
        </dd>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="bo-alasan">Alasan pembatalan</Label>
        <Textarea
          ref={refAlasan}
          id="bo-alasan"
          rows={4}
          required
          maxLength={ALASAN_ORDER_MAKS}
          value={alasan}
          onChange={(e) => {
            setAlasan(e.target.value);
            // sesudah ditolak: tanda galat hilang begitu alasan sudah sah
            if (alasanSalah && !galatAlasanOrder(e.target.value)) {
              setAlasanSalah(false);
              setGalat(null);
            }
          }}
          aria-invalid={alasanSalah || undefined}
          aria-describedby={galat ? "bo-alasan-bantu bo-alasan-galat" : "bo-alasan-bantu"}
          placeholder="Contoh: customer membatalkan karena proyek ditunda"
          data-uji="input-alasan-batal-order"
        />
        <div id="bo-alasan-bantu" className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>Wajib, minimal {ALASAN_ORDER_MIN} karakter. Tercatat di riwayat lead beserta nama Anda.</span>
          <span className="shrink-0 tabular-nums" data-uji="hitung-alasan">
            {/* dihitung seperti aturannya (sesudah dirapikan, per karakter) — "abcd " = 4, bukan 5 */}
            {Array.from(rapikanAlasanOrder(alasan)).length}/{ALASAN_ORDER_MAKS}
          </span>
        </div>
      </div>

      {galat ? (
        <KotakPesan ref={refGalat} id="bo-alasan-galat" nada="galat" className="scroll-mb-24">
          {galat}
        </KotakPesan>
      ) : null}

      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Kembali
        </Button>
        <Button type="button" variant="destructive" onClick={kirim} disabled={simpan.isPending} data-uji="kirim-batal-order">
          {simpan.isPending ? "Membatalkan…" : "Batalkan order"}
        </Button>
      </KakiLembar>
    </div>
  );
}
