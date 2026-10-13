"use client";

// Saringan daftar Pipeline (revisi #4), melengkapi kotak cari (perusahaan, PIC, produk, No SP/PO, kode — di server):
// status (tab Order = status bayar, tab lain = tahap) + rentang tanggal (tab Order = tanggal SP, tab lain = tanggal masuk)
// dengan pintasan bulan. Disimpan di URL (st, dari, sampai) oleh layar daftar; panel terbuka bila ada saringan aktif.
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BAYAR, BAYAR_BELUM_DICATAT, TAHAP } from "@/features/pipeline/konstanta";
import { BELUM_DICATAT, bulanSebelum, jumlahSaringan, labelBulan, rentangBulan, SARINGAN_KOSONG, type SaringanLead } from "@/features/pipeline/order";
import { cn } from "@/lib/utils";
import type { StatusBayar, TahapLead } from "@/types/domain";

const STATUS_ORDER: { v: string; label: string }[] = [
  ...(["BELUM", "DP", "LUNAS"] as StatusBayar[]).map((v) => ({ v, label: BAYAR[v].label })),
  { v: BELUM_DICATAT, label: BAYAR_BELUM_DICATAT.label },
];
const STATUS_TAHAP: { v: string; label: string }[] = (["BARU", "PENAWARAN", "ORDER", "BATAL", "DIALIHKAN"] as TahapLead[]).map((v) => ({
  v,
  label: TAHAP[v].label,
}));

const kelasChip = (aktif: boolean) =>
  cn(
    "inline-flex min-h-8 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10",
    aktif ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted",
  );

type Props = {
  modeOrder: boolean;
  nilai: SaringanLead;
  ubah: (f: SaringanLead) => void;
  hariIni: string;
  /** bulan SP yang ada (tab Order) untuk pintasan */
  bulan: string[];
};

export function SaringanLead({ modeOrder, nilai: f, ubah, hariIni, bulan }: Props) {
  const aktif = jumlahSaringan(f);
  const [buka, setBuka] = useState(aktif > 0);
  const status = modeOrder ? STATUS_ORDER : STATUS_TAHAP;
  const bulanIni = hariIni.slice(0, 7);
  const pintasan = [
    { label: "Bulan ini", ...rentangBulan(bulanIni) },
    { label: "Bulan lalu", ...rentangBulan(bulanSebelum(bulanIni)) },
    { label: "Tahun ini", dari: `${hariIni.slice(0, 4)}-01-01`, sampai: `${hariIni.slice(0, 4)}-12-31` },
  ];
  const bulanLain = modeOrder ? bulan.filter((b) => b !== bulanIni && b !== bulanSebelum(bulanIni)).slice(0, 12) : [];
  const rentangSama = (r: { dari: string; sampai: string }) => f.dari === r.dari && f.sampai === r.sampai;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setBuka((b) => !b)} aria-expanded={buka} data-uji="tombol-saringan">
          <SlidersHorizontal aria-hidden />
          Filter
          {aktif ? <span className="rounded-full bg-primary px-1.5 text-xs leading-4 text-primary-foreground">{aktif}</span> : null}
          <ChevronDown aria-hidden className={cn("transition-transform", buka && "rotate-180")} />
        </Button>
        {aktif ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => ubah(SARINGAN_KOSONG)} data-uji="reset-saringan">
            <X aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>

      {buka ? (
        <div className="space-y-3 rounded-xl border bg-card p-3" data-uji="panel-saringan">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{modeOrder ? "Status pembayaran" : "Tahap"}</div>
            <div role="group" aria-label={modeOrder ? "Status pembayaran" : "Tahap"} className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={!f.status} className={kelasChip(!f.status)} onClick={() => ubah({ ...f, status: null })}>
                Semua
              </button>
              {status.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  aria-pressed={f.status === s.v}
                  className={kelasChip(f.status === s.v)}
                  onClick={() => ubah({ ...f, status: f.status === s.v ? null : s.v })}
                  data-uji={`saring-status-${s.v}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{modeOrder ? "Tanggal SP" : "Tanggal masuk"}</div>
            <div className="flex flex-wrap gap-1.5">
              {pintasan.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={rentangSama(p)}
                  className={kelasChip(rentangSama(p))}
                  onClick={() => ubah(rentangSama(p) ? { ...f, dari: null, sampai: null } : { ...f, dari: p.dari, sampai: p.sampai })}
                >
                  {p.label}
                </button>
              ))}
              {bulanLain.map((b) => {
                const r = rentangBulan(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={rentangSama(r)}
                    className={kelasChip(rentangSama(r))}
                    onClick={() => ubah(rentangSama(r) ? { ...f, dari: null, sampai: null } : { ...f, ...r })}
                  >
                    {labelBulan(b)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="saring-dari" className="text-xs font-normal">
                  Dari
                </Label>
                <Input
                  id="saring-dari"
                  type="date"
                  value={f.dari ?? ""}
                  max={f.sampai ?? undefined}
                  onChange={(e) => ubah({ ...f, dari: e.target.value || null })}
                  className="h-9 w-40"
                  data-uji="saring-dari"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="saring-sampai" className="text-xs font-normal">
                  Sampai
                </Label>
                <Input
                  id="saring-sampai"
                  type="date"
                  value={f.sampai ?? ""}
                  min={f.dari ?? undefined}
                  onChange={(e) => ubah({ ...f, sampai: e.target.value || null })}
                  className="h-9 w-40"
                  data-uji="saring-sampai"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
