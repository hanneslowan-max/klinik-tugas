"use client";

// Saringan daftar Pipeline (revisi #4), melengkapi kotak cari (perusahaan, PIC, produk, No SP/PO, kode — di server):
// status (tab Order = status bayar, tab lain = tahap) + rentang tanggal (tab Order = tanggal SP, tab lain = tanggal masuk)
// dengan pintasan bulan. Disimpan di URL (st, dari, sampai) oleh layar daftar; panel terbuka bila ada saringan aktif.
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useState, type ComponentProps } from "react";

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
/** Status yang bisa dipilih di tab ini (nilai lain di URL diabaikan). Tab FU/Diam/PM hanya memuat lead terbuka; tab Penawaran
 * hanya satu tahap → tanpa pilihan status. */
export function opsiStatus(tab: string): { v: string; label: string }[] {
  if (tab === "order") return STATUS_ORDER;
  const tahap: TahapLead[] =
    tab === "penawaran" ? [] : tab === "semua" ? ["BARU", "PENAWARAN", "ORDER", "BATAL", "DIALIHKAN"] : ["BARU", "PENAWARAN"];
  return tahap.map((v) => ({ v, label: TAHAP[v].label }));
}

/** Tanggal saringan yang sah ('YYYY-MM-DD', tahun 2000–2099); selain itu null. */
export const tanggalSah = (s: string | null | undefined) => (s && /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s) ? s : null);

const kelasChip = (aktif: boolean) =>
  cn(
    "inline-flex min-h-8 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10",
    aktif ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted",
  );

type Props = {
  tab: string;
  modeOrder: boolean;
  nilai: SaringanLead;
  ubah: (f: SaringanLead) => void;
  hariIni: string;
  /** bulan SP yang ada (tab Order) untuk pintasan */
  bulan: string[];
};

export function SaringanLead({ tab, modeOrder, nilai: f, ubah, hariIni, bulan }: Props) {
  const aktif = jumlahSaringan(f);
  const [buka, setBuka] = useState(aktif > 0);
  const status = opsiStatus(tab);
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
          {status.length ? (
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
          ) : null}

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
                <InputTanggal
                  id="saring-dari"
                  nilai={f.dari}
                  max={f.sampai ?? undefined}
                  simpan={(v) => ubah({ ...f, dari: v })}
                  data-uji="saring-dari"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="saring-sampai" className="text-xs font-normal">
                  Sampai
                </Label>
                <InputTanggal
                  id="saring-sampai"
                  nilai={f.sampai}
                  min={f.dari ?? undefined}
                  simpan={(v) => ubah({ ...f, sampai: v })}
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

/**
 * Input tanggal dengan draf lokal: ketikan keyboard (dd/mm/yyyy, per segmen) tidak langsung ditulis ke URL — tiap ketukan
 * memicu router.replace async yang menimpa isian, dan segmen tahun yang belum lengkap (mis. 0002) ikut tersaring. Disimpan
 * saat tanggal sudah sah (tahun 2000–2099) atau saat fokus pergi (kosong = hapus saringan).
 */
function InputTanggal({
  nilai,
  simpan,
  ...rest
}: { nilai: string | null; simpan: (v: string | null) => void } & Omit<ComponentProps<"input">, "value" | "onChange" | "type">) {
  const [draf, setDraf] = useState(nilai ?? "");
  const [dariLuar, setDariLuar] = useState(nilai);
  if (nilai !== dariLuar) {
    // nilai berubah dari luar (pintasan bulan, Reset, kembali/maju) → samakan draf saat render
    setDariLuar(nilai);
    setDraf(nilai ?? "");
  }
  return (
    <Input
      {...rest}
      type="date"
      value={draf}
      onChange={(e) => {
        setDraf(e.target.value);
        const sah = tanggalSah(e.target.value);
        if (sah && sah !== nilai) simpan(sah);
      }}
      onBlur={() => {
        // kosong = hapus saringan; isian tak sah/setengah jadi = kembali ke nilai tersimpan
        if (!draf) {
          if (nilai) simpan(null);
          return;
        }
        const sah = tanggalSah(draf);
        if (!sah) setDraf(nilai ?? "");
        else if (sah !== nilai) simpan(sah);
      }}
      className="h-9 w-40"
    />
  );
}
