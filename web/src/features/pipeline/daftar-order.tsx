"use client";

// Tab "Order" (revisi #3–#7): rekap (jumlah, nominal, terbayar, sisa tagihan) + order per bulan SP (terbaru dulu) dengan
// subtotal per bulan. Desktop: tabel (Tgl SP · No SP/No PO · Pelanggan · Produk · Pemilik · Nominal · Pembayaran);
// HP: kartu. Tombol pensil membuka Data order (nominal, No SP, No PO, pembayaran) bagi yang berhak (rep pemilik + admin;
// server tetap menegakkan). "Unduh CSV" = order yang sedang tampil, untuk rekap manual di Excel.
// Rekap, subtotal per bulan, dan CSV selalu dari SEMUA order; hanya baris yang dirender dibatasi (`batas`, bertahap).
import { Download, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { DialogOrder } from "@/features/pipeline/dialog-order";
import { BAYAR, BAYAR_BELUM_DICATAT, ringkasProduk, rupiah } from "@/features/pipeline/konstanta";
import { csvOrder, kelompokOrder, sisaTagihan, type GrupOrder } from "@/features/pipeline/order";
import { useProfil } from "@/features/profil/penyedia-profil";
import { useDesktop } from "@/hooks/use-media-query";
import { fmtTanggal } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { LeadRingkas } from "@/types/domain";

/** 'PO/WG/2026/008' tetap; '117' → 'PO 117' (tanpa awalan PO dobel). */
const labelPo = (no: string) => (/^po\b/i.test(no) ? no : `PO ${no}`);

type Props = {
  /** order yang lolos saringan (urutan bebas; dikelompokkan di sini) */
  leads: LeadRingkas[];
  namaKategori: (leadId: string) => string | undefined;
  bisaUbah: (lead: LeadRingkas) => boolean;
  /** jumlah baris order yang dirender (urut kelompok); sisanya lewat `lagi` */
  batas?: number;
  /** kontrol "tampilkan lagi" bila masih ada baris yang belum dirender */
  lagi?: (sisa: number) => ReactNode;
};

export function DaftarOrder({ leads, namaKategori, bisaUbah, batas = Infinity, lagi }: Props) {
  const { hariIni } = useProfil();
  const desktop = useDesktop();
  // lead terakhir yang diubah tetap disimpan saat dialog tertutup: dialog tetap ter-mount supaya animasi tutup jalan dan
  // fokus kembali ke tombol pensil
  const [ubah, setUbah] = useState<LeadRingkas | null>(null);
  const [bukaUbah, setBukaUbah] = useState(false);
  const mulaiUbah = (l: LeadRingkas) => {
    setUbah(l);
    setBukaUbah(true);
  };
  const r = kelompokOrder(leads);
  const tampil = irisGrup(r.grup, batas);
  const sisa = r.grup.reduce((n, g) => n + g.items.length, 0) - tampil.reduce((n, x) => n + x.items.length, 0);

  const unduh = () => {
    const urut = r.grup.flatMap((g) => g.items);
    const url = URL.createObjectURL(new Blob([csvOrder(urut)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-anvil-${hariIni}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4" data-uji="daftar-order">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Ubin label="Order" nilai={r.jumlah.toLocaleString("id-ID")} uji="rekap-jumlah" />
        <Ubin label="Nominal" nilai={rupiah(r.nilai)} uji="rekap-nominal" />
        <Ubin label="Terbayar" nilai={rupiah(r.terbayar)} nada="sukses" uji="rekap-terbayar" />
        <Ubin label="Sisa tagihan" nilai={rupiah(r.sisa)} nada={r.sisa ? "telat" : undefined} uji="rekap-sisa" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {r.belumDicatat ? <span>{r.belumDicatat} order lama belum dicatat status bayarnya (tidak dihitung di sisa tagihan)</span> : null}
        {r.tanpaNilai ? <span>{r.tanpaNilai} order tanpa nominal</span> : null}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={unduh} disabled={!r.jumlah} data-uji="unduh-csv">
          <Download aria-hidden />
          Unduh CSV
        </Button>
      </div>

      {tampil.map(({ g, items }) => (
        <section key={g.kunci} aria-label={g.label} className="space-y-2" data-uji="grup-order" data-bulan={g.kunci}>
          <KepalaGrup g={g} />
          {desktop ? (
            <TabelOrder items={items} hariIni={hariIni} namaKategori={namaKategori} bisaUbah={bisaUbah} onUbah={mulaiUbah} />
          ) : (
            <ul className="space-y-2">
              {items.map((l) => (
                <KartuOrder key={l.id} lead={l} hariIni={hariIni} kategori={namaKategori(l.id)} bisaUbah={bisaUbah(l)} onUbah={mulaiUbah} />
              ))}
            </ul>
          )}
        </section>
      ))}

      {sisa > 0 && lagi ? lagi(sisa) : null}

      {ubah ? <DialogOrder key={ubah.id} buka={bukaUbah} ubahBuka={setBukaUbah} lead={ubah} /> : null}
    </div>
  );
}

/** Iris tampilan SESUDAH pengelompokan (urut grup): kepala grup tetap menampilkan subtotal penuh. */
function irisGrup(grup: GrupOrder[], batas: number): { g: GrupOrder; items: LeadRingkas[] }[] {
  const hasil: { g: GrupOrder; items: LeadRingkas[] }[] = [];
  let kuota = batas;
  for (const g of grup) {
    if (kuota <= 0) break;
    const items = g.items.slice(0, kuota);
    kuota -= items.length;
    hasil.push({ g, items });
  }
  return hasil;
}

function Ubin({ label, nilai, nada, uji }: { label: string; nilai: string; nada?: "sukses" | "telat"; uji: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn("truncate font-semibold tabular-nums", nada === "sukses" && "text-sukses", nada === "telat" && "text-telat")}
        data-uji={uji}
      >
        {nilai}
      </div>
    </div>
  );
}

function KepalaGrup({ g }: { g: GrupOrder }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b pb-1.5">
      <h3 className="text-sm font-semibold">{g.label}</h3>
      <span className="text-xs text-muted-foreground tabular-nums">
        {g.jumlah} order · {rupiah(g.nilai)}
        {g.sisa ? ` · sisa ${rupiah(g.sisa)}` : ""}
      </span>
    </div>
  );
}

function PilBayar({ lead: l, hariIni }: { lead: LeadRingkas; hariIni: string }) {
  const b = l.bayar_status ? BAYAR[l.bayar_status] : BAYAR_BELUM_DICATAT;
  const sisa = sisaTagihan(l);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Chip nada={b.nada} data-uji="pil-bayar">
        {b.label}
      </Chip>
      {l.bayar_status === "DP" && sisa != null ? <span className="text-xs text-muted-foreground tabular-nums">sisa {rupiah(sisa)}</span> : null}
      {l.bayar_status === "LUNAS" && l.tanggal_lunas ? (
        <span className="text-xs text-muted-foreground">{fmtTanggal(l.tanggal_lunas, hariIni)}</span>
      ) : null}
    </div>
  );
}

function TombolUbah({ lead, onUbah }: { lead: LeadRingkas; onUbah: (l: LeadRingkas) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="pointer-coarse:size-11"
      onClick={() => onUbah(lead)}
      aria-label={`Ubah data order ${lead.kode}`}
      data-uji="ubah-order"
    >
      <Pencil aria-hidden />
    </Button>
  );
}

type PropsBaris = {
  items: LeadRingkas[];
  hariIni: string;
  namaKategori: (leadId: string) => string | undefined;
  bisaUbah: (lead: LeadRingkas) => boolean;
  onUbah: (l: LeadRingkas) => void;
};

function TabelOrder({ items, hariIni, namaKategori, bisaUbah, onUbah }: PropsBaris) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      {/* table-fixed + colgroup: kolom sejajar di semua tabel bulan */}
      <table className="w-full min-w-[52rem] table-fixed text-sm">
        <colgroup>
          <col className="w-[10%]" />
          <col className="w-[16%]" />
          <col className="w-[21%]" />
          <col className="w-[16%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[11%]" />
          <col className="w-[4%]" />
        </colgroup>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Tgl SP</th>
            <th className="px-3 py-2 font-medium">No SP / No PO</th>
            <th className="px-3 py-2 font-medium">Pelanggan</th>
            <th className="px-3 py-2 font-medium">Produk</th>
            <th className="px-3 py-2 font-medium">Pemilik</th>
            <th className="px-3 py-2 text-right font-medium">Nominal</th>
            <th className="px-3 py-2 text-right font-medium">Pembayaran</th>
            <th className="w-10 px-1 py-2">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((l) => {
            const kat = namaKategori(l.id);
            return (
              <tr key={l.id} className="align-top hover:bg-muted/40" data-uji="baris-order" data-id={l.id}>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{l.tanggal_sp ? fmtTanggal(l.tanggal_sp, hariIni) : "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs break-all">{l.no_sp || "—"}</div>
                  {l.no_po ? <div className="text-xs text-muted-foreground">{labelPo(l.no_po)}</div> : null}
                </td>
                <td className="px-3 py-2 break-words">
                  <Link href={`/pipeline/${encodeURIComponent(l.id)}`} className="font-medium hover:underline">
                    {l.pelanggan}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {l.kode}
                    {l.kota ? ` · ${l.kota}` : ""}
                    {l.periksa ? " · periksa" : ""}
                  </div>
                  {kat ? (
                    <Chip nada="garis" className="mt-1 max-w-full truncate">
                      {kat}
                    </Chip>
                  ) : null}
                </td>
                <td className="px-3 py-2 break-words text-muted-foreground">{ringkasProduk(l.produk)}</td>
                <td className="truncate px-3 py-2 text-muted-foreground">{l.pemilik_nama ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">{rupiah(l.nilai_transaksi)}</td>
                <td className="px-3 py-2 text-right">
                  <PilBayar lead={l} hariIni={hariIni} />
                </td>
                <td className="px-1 py-1.5">{bisaUbah(l) ? <TombolUbah lead={l} onUbah={onUbah} /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KartuOrder({
  lead: l,
  hariIni,
  kategori,
  bisaUbah,
  onUbah,
}: {
  lead: LeadRingkas;
  hariIni: string;
  kategori?: string;
  bisaUbah: boolean;
  onUbah: (l: LeadRingkas) => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5" data-uji="baris-order" data-id={l.id}>
      <div className="min-w-0 flex-1 space-y-1">
        <Link href={`/pipeline/${encodeURIComponent(l.id)}`} className="block truncate font-semibold">
          {l.pelanggan}
        </Link>
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{l.no_sp || "—"}</span>
          {l.tanggal_sp ? ` · ${fmtTanggal(l.tanggal_sp, hariIni)}` : ""}
          {l.no_po ? ` · ${labelPo(l.no_po)}` : ""}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {ringkasProduk(l.produk)}
          {l.pemilik_nama ? ` · ${l.pemilik_nama}` : ""}
        </div>
        {kategori ? (
          <Chip nada="garis" className="max-w-full truncate">
            {kategori}
          </Chip>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{rupiah(l.nilai_transaksi)}</span>
        <div className="flex items-center gap-1">
          <PilBayar lead={l} hariIni={hariIni} />
          {bisaUbah ? <TombolUbah lead={l} onUbah={onUbah} /> : null}
        </div>
      </div>
    </li>
  );
}
