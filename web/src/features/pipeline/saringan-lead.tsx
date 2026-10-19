"use client";

// Saringan daftar Pipeline (revisi #4), melengkapi kotak cari (perusahaan, PIC, produk, No SP/PO, kode — di server):
// status (tab Order = status bayar, tab lain = tahap) + rentang tanggal (tab Order = tanggal SP, tab lain = tanggal masuk):
// pintasan Hari ini / Minggu ini (Senin–Minggu) / Bulan ini / Bulan lalu / Tahun ini, atau Custom = isi Dari–Sampai sendiri
// (19 Okt, ganti daftar bulan). Disimpan di URL (st, dari, sampai) oleh layar daftar; panel terbuka bila ada saringan aktif.
// Baris tombol: Filter, Produk (19 Okt, ganti tab "Pallet Mesh"; ?produk=, berlaku di semua tab), Urutkan (?urut=; bukan
// saringan, Reset tidak mengubahnya), Reset. Urutkan dulu di baris jumlah lead, tetapi di HP tertutup tombol "Lead baru".
import { ArrowUpDown, ChevronDown, Package, SlidersHorizontal, X } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BAYAR, BAYAR_BELUM_DICATAT, PRODUK, TAHAP } from "@/features/pipeline/konstanta";
import {
  BELUM_DICATAT,
  bulanSebelum,
  jumlahSaringan,
  opsiUrut,
  rentangBulan,
  rentangMinggu,
  SARINGAN_KOSONG,
  type SaringanLead,
} from "@/features/pipeline/order";
import { cn } from "@/lib/utils";
import type { StatusBayar, TahapLead } from "@/types/domain";

const STATUS_ORDER: { v: string; label: string }[] = [
  ...(["BELUM", "DP", "LUNAS"] as StatusBayar[]).map((v) => ({ v, label: BAYAR[v].label })),
  { v: BELUM_DICATAT, label: BAYAR_BELUM_DICATAT.label },
];
/** Status yang bisa dipilih di tab ini (nilai lain di URL diabaikan). Tab FU/Diam hanya memuat lead terbuka; tab Penawaran
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

// Tombol menu (Produk, Urutkan): pemicu menu memakai data-slot sendiri → aturan 44px [data-slot="button"] layar sentuh tidak
// berlaku, jadi disamakan di sini; saat terpilih diberi warna primer (juga di mode gelap, yang punya gaya outline sendiri).
const kelasTombolMenu = (aktif: boolean) =>
  cn(
    "min-w-0 pointer-coarse:min-h-[44px]",
    aktif &&
      "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary dark:bg-primary/10 dark:hover:bg-primary/15",
  );

type Props = {
  tab: string;
  modeOrder: boolean;
  nilai: SaringanLead;
  ubah: (f: SaringanLead) => void;
  hariIni: string;
  /** jumlah lead per produk & total, dengan saringan lain tetap berlaku */
  jumlahProduk: Map<string, number>;
  jumlahSemua: number;
  urut: string | null;
  ubahUrut: (u: string | null) => void;
};

const ANGKA = new Intl.NumberFormat("id-ID");

export function SaringanLead({ tab, modeOrder, nilai: f, ubah, hariIni, jumlahProduk, jumlahSemua, urut, ubahUrut }: Props) {
  const aktif = jumlahSaringan(f);
  const [buka, setBuka] = useState(aktif > 0);
  const status = opsiStatus(tab);
  const bulanIni = hariIni.slice(0, 7);
  const tahun = hariIni.slice(0, 4);
  const pintasan = [
    { kunci: "hari", label: "Hari ini", dari: hariIni, sampai: hariIni },
    { kunci: "minggu", label: "Minggu ini", ...rentangMinggu(hariIni) },
    { kunci: "bulan", label: "Bulan ini", ...rentangBulan(bulanIni) },
    { kunci: "bulan-lalu", label: "Bulan lalu", ...rentangBulan(bulanSebelum(bulanIni)) },
    { kunci: "tahun", label: "Tahun ini", dari: `${tahun}-01-01`, sampai: `${tahun}-12-31` },
  ];
  const rentangSama = (r: { dari: string; sampai: string }) => f.dari === r.dari && f.sampai === r.sampai;
  // Custom: dipilih pengguna, atau rentang di URL bukan salah satu pintasan (diketik sendiri, tautan lama, Kembali)
  const [pilihKustom, setPilihKustom] = useState(false);
  const adaTanggal = Boolean(f.dari || f.sampai);
  const kustom = pilihKustom || (adaTanggal && !pintasan.some(rentangSama));
  const kosongkanTanggal = () => ubah({ ...f, dari: null, sampai: null });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setBuka((b) => !b)} aria-expanded={buka} data-uji="tombol-saringan">
          <SlidersHorizontal aria-hidden />
          Filter
          {aktif ? <span className="rounded-full bg-primary px-1.5 text-xs leading-4 text-primary-foreground">{aktif}</span> : null}
          <ChevronDown aria-hidden className={cn("transition-transform", buka && "rotate-180")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={kelasTombolMenu(Boolean(f.produk))}
              data-uji="tombol-produk"
            >
              <Package aria-hidden />
              <span className="truncate">{f.produk ?? "Produk"}</span>
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuRadioGroup value={f.produk ?? ""} onValueChange={(v) => ubah({ ...f, produk: v || null })}>
              <DropdownMenuRadioItem value="" className="min-h-11" data-uji="pilih-produk-semua">
                Semua produk
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ANGKA.format(jumlahSemua)}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {PRODUK.map((p) => (
                <DropdownMenuRadioItem key={p} value={p} className="min-h-11" data-uji={`pilih-produk-${p}`}>
                  {p}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{ANGKA.format(jumlahProduk.get(p) ?? 0)}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <PilihUrut nilai={urut} modeOrder={modeOrder} ubah={ubahUrut} />
        {aktif || f.produk ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPilihKustom(false);
              ubah(SARINGAN_KOSONG);
            }}
            data-uji="reset-saringan"
          >
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
              {pintasan.map((p) => {
                const terpilih = !kustom && rentangSama(p);
                return (
                  <button
                    key={p.kunci}
                    type="button"
                    aria-pressed={terpilih}
                    className={kelasChip(terpilih)}
                    onClick={() => {
                      setPilihKustom(false);
                      if (terpilih) kosongkanTanggal();
                      else ubah({ ...f, dari: p.dari, sampai: p.sampai });
                    }}
                    data-uji={`saring-tanggal-${p.kunci}`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={kustom}
                aria-expanded={kustom}
                className={kelasChip(kustom)}
                onClick={() => {
                  if (!kustom) {
                    setPilihKustom(true); // tanggal yang sudah ada (mis. dari pintasan) jadi titik awal
                    return;
                  }
                  setPilihKustom(false);
                  if (adaTanggal) kosongkanTanggal();
                }}
                data-uji="saring-tanggal-kustom"
              >
                Custom
              </button>
            </div>
            {kustom ? (
            <div className="grid max-w-sm grid-cols-2 items-end gap-2">
              <div className="min-w-0 space-y-1">
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
              <div className="min-w-0 space-y-1">
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
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Pilihan urutan daftar (URUT_LEAD / URUT_ORDER): "Urutkan" saat bawaan, nama pendek urutan bila dipilih. */
function PilihUrut({ nilai, modeOrder, ubah }: { nilai: string | null; modeOrder: boolean; ubah: (u: string | null) => void }) {
  const opsi = opsiUrut(modeOrder);
  const pilih = opsi.find((o) => o.k === nilai) ?? opsi[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Urutkan: ${pilih.label}`}
          className={kelasTombolMenu(Boolean(pilih.k))}
          data-uji="tombol-urut"
        >
          <ArrowUpDown aria-hidden />
          <span className="truncate">{pilih.pendek}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Urutkan</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pilih.k ?? ""} onValueChange={(v) => ubah(v || null)}>
          {opsi.map((o) => (
            <DropdownMenuRadioItem key={o.label} value={o.k ?? ""} className="min-h-11" data-uji={`urut-${o.k ?? "bawaan"}`}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      className="h-9 w-full min-w-0"
    />
  );
}
