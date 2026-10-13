// Tab "Order" Pipeline (revisi #3–#7) + saringan daftar (#4). Fungsi murni (tanpa DOM) supaya bisa diuji.
// Order dikelompokkan per bulan SP (dasar yang sama dengan Ringkasan "dasar SP"), terbaru dulu, dengan rekap per bulan:
// jumlah, nominal, terbayar, sisa tagihan. Pembayaran: BELUM | DP | LUNAS; null = order lama yang status bayarnya belum
// dicatat — tidak dihitung sebagai terbayar maupun sisa tagihan (tidak diketahui).
import type { LeadRingkas, StatusBayar, TahapLead } from "@/types/domain";

/** Kunci grup untuk order tanpa tanggal SP (data impor lama yang tidak lengkap). */
export const TANPA_TANGGAL = "tanpa";
/** Nilai saringan status untuk order yang status bayarnya belum dicatat. */
export const BELUM_DICATAT = "TANPA";

export type StatusSaring = StatusBayar | typeof BELUM_DICATAT | TahapLead;

/** Saringan daftar: status (tab Order = status bayar, tab lain = tahap) + rentang tanggal (Order = tanggal SP, lain = tanggal masuk). */
export type SaringanLead = { status: string | null; dari: string | null; sampai: string | null };

export const SARINGAN_KOSONG: SaringanLead = { status: null, dari: null, sampai: null };

export const jumlahSaringan = (f: SaringanLead) => [f.status, f.dari, f.sampai].filter(Boolean).length;

/** Tanggal acuan saringan & pengelompokan. */
export const tanggalAcuan = (l: LeadRingkas, modeOrder: boolean) => (modeOrder ? l.tanggal_sp : l.tanggal_masuk);

export function saringLead(leads: LeadRingkas[], f: SaringanLead, modeOrder: boolean): LeadRingkas[] {
  if (!jumlahSaringan(f)) return leads;
  return leads.filter((l) => {
    if (f.status) {
      if (modeOrder) {
        if (f.status === BELUM_DICATAT ? l.bayar_status != null : l.bayar_status !== f.status) return false;
      } else if (l.tahap !== f.status) return false;
    }
    if (f.dari || f.sampai) {
      const t = tanggalAcuan(l, modeOrder);
      if (!t) return false;
      if (f.dari && t < f.dari) return false;
      if (f.sampai && t > f.sampai) return false;
    }
    return true;
  });
}

/** Uang yang sudah diterima: LUNAS = nominal, DP = nominal DP, selain itu 0. */
export function terbayar(l: LeadRingkas): number {
  if (l.bayar_status === "LUNAS") return l.nilai_transaksi ?? 0;
  if (l.bayar_status === "DP") return l.bayar_dp ?? 0;
  return 0;
}

/** Sisa tagihan; null bila tidak diketahui (status bayar belum dicatat, atau nominal kosong). */
export function sisaTagihan(l: LeadRingkas): number | null {
  if (l.bayar_status == null || l.nilai_transaksi == null) return l.bayar_status === "LUNAS" ? 0 : null;
  if (l.bayar_status === "LUNAS") return 0;
  return Math.max(0, l.nilai_transaksi - (l.bayar_status === "DP" ? (l.bayar_dp ?? 0) : 0));
}

type Rekap = {
  jumlah: number;
  nilai: number;
  terbayar: number;
  sisa: number;
  /** order tanpa nominal (tidak ikut total nominal) */
  tanpaNilai: number;
  /** order lama yang status bayarnya belum dicatat */
  belumDicatat: number;
};

export type GrupOrder = Rekap & {
  /** 'YYYY-MM' atau TANPA_TANGGAL */
  kunci: string;
  label: string;
  items: LeadRingkas[];
};

export type RingkasOrder = Rekap & { grup: GrupOrder[] };

function rekap(items: LeadRingkas[]): Rekap {
  return {
    jumlah: items.length,
    nilai: items.reduce((n, l) => n + (l.nilai_transaksi ?? 0), 0),
    terbayar: items.reduce((n, l) => n + terbayar(l), 0),
    sisa: items.reduce((n, l) => n + (sisaTagihan(l) ?? 0), 0),
    tanpaNilai: items.filter((l) => l.nilai_transaksi == null).length,
    belumDicatat: items.filter((l) => l.bayar_status == null).length,
  };
}

const fmtBulan = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

/** '2026-10' → 'Oktober 2026'; selain YYYY-MM → 'Tanpa tanggal SP'. */
export function labelBulan(kunci: string): string {
  if (!/^\d{4}-\d{2}$/.test(kunci)) return "Tanpa tanggal SP";
  return fmtBulan.format(new Date(`${kunci}-01T00:00:00Z`));
}

/** '2026-02' → { dari: '2026-02-01', sampai: '2026-02-28' } */
export function rentangBulan(kunci: string): { dari: string; sampai: string } {
  const [y, m] = kunci.split("-").map(Number);
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dari: `${kunci}-01`, sampai: `${kunci}-${String(akhir).padStart(2, "0")}` };
}

/** Bulan sebelum 'YYYY-MM'. */
export function bulanSebelum(kunci: string): string {
  const [y, m] = kunci.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const bulanDari = (l: LeadRingkas) =>
  l.tanggal_sp && /^\d{4}-\d{2}/.test(l.tanggal_sp) ? l.tanggal_sp.slice(0, 7) : TANPA_TANGGAL;

/**
 * Kelompokkan order per bulan SP, terbaru dulu ("Tanpa tanggal SP" paling akhir). Dalam bulan: tanggal SP terbaru dulu,
 * lalu kode lead terbaru. Lead selain tahap ORDER diabaikan.
 */
export function kelompokOrder(leads: LeadRingkas[]): RingkasOrder {
  const order = leads.filter((l) => l.tahap === "ORDER");
  const peta = new Map<string, LeadRingkas[]>();
  for (const l of order) {
    const k = bulanDari(l);
    const isi = peta.get(k);
    if (isi) isi.push(l);
    else peta.set(k, [l]);
  }
  const urutKunci = [...peta.keys()].sort((a, b) => (a === TANPA_TANGGAL ? 1 : b === TANPA_TANGGAL ? -1 : b.localeCompare(a)));
  const grup = urutKunci.map((kunci): GrupOrder => {
    const items = (peta.get(kunci) ?? []).sort(
      (a, b) => (b.tanggal_sp ?? "").localeCompare(a.tanggal_sp ?? "") || b.kode.localeCompare(a.kode),
    );
    return { kunci, label: labelBulan(kunci), items, ...rekap(items) };
  });
  return { ...rekap(order), grup };
}

/** Semua bulan SP yang ada di order (terbaru dulu) — pilihan cepat periode. */
export function bulanTersedia(leads: LeadRingkas[]): string[] {
  return [...new Set(leads.filter((l) => l.tahap === "ORDER").map(bulanDari))].filter((b) => b !== TANPA_TANGGAL).sort().reverse();
}

const LABEL_BAYAR: Record<StatusBayar, string> = { BELUM: "Belum bayar", DP: "DP", LUNAS: "Lunas" };

/**
 * CSV untuk rekap manual (Excel Indonesia): pemisah ';', UTF-8 dengan BOM, angka tanpa pemisah ribuan, tanggal YYYY-MM-DD.
 * Urutan baris = urutan yang diberikan.
 */
export function csvOrder(leads: LeadRingkas[]): string {
  const sel = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kepala = [
    "Tanggal SP", "No SP", "No PO", "Kode lead", "Perusahaan", "Kota", "Produk", "Pemilik",
    "Nominal", "Status bayar", "DP", "Tanggal DP", "Terbayar", "Sisa tagihan", "Tanggal lunas",
  ];
  const baris = leads.map((l) =>
    [
      l.tanggal_sp, l.no_sp, l.no_po, l.kode, l.pelanggan, l.kota,
      l.produk.map((p) => `${p.produk} ${Number(p.qty).toLocaleString("id-ID")} ${p.satuan}`).join(", "),
      l.pemilik_nama, l.nilai_transaksi, l.bayar_status ? LABEL_BAYAR[l.bayar_status] : "Belum dicatat",
      l.bayar_dp, l.tanggal_dp, l.bayar_status ? terbayar(l) : null, sisaTagihan(l), l.tanggal_lunas,
    ].map(sel).join(";"),
  );
  return `﻿${[kepala.join(";"), ...baris].join("\r\n")}\r\n`;
}
