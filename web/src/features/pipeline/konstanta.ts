// Konstanta & pembantu modul Pipeline. Nilai (produk/sumber/tahap/alasan) PERSIS dengan CHECK di migrasi
// 20261011120000 — jangan ubah ejaan tanpa mengubah migrasi.
import type { VariantProps } from "class-variance-authority";

import type { chipVariants } from "@/components/umum/chip";
import { fmtTanggal, selisihHari } from "@/lib/tanggal";
import type { AlasanBatal, JenisAktivitas, ProdukLead, SatuanItem, StatusBayar, SumberLead, TahapLead } from "@/types/domain";

export const PRODUK: ProdukLead[] = [
  "Roda", "Pallet Mesh", "Airport Trolley", "Shopping Cart",
  "Lemari Arsip", "Material Handling", "Locker", "Lainnya",
];

export const SUMBER: SumberLead[] = [
  "Google Ads", "Meta Ads", "Website organik", "WA langsung",
  "Telepon", "Referral", "Repeat order", "Lainnya",
];

export const SATUAN: SatuanItem[] = ["unit", "set", "pcs"];

/** Jenis follow-up yang bisa dipilih rep (tanpa "Catatan impor" yang khusus impor). */
export const JENIS_FU: JenisAktivitas[] = ["Telepon", "WA", "Email", "Visit", "Kirim penawaran", "Catatan"];

export const ALASAN_BATAL: AlasanBatal[] = [
  "Harga", "Stok/waktu kirim", "Spesifikasi tidak cocok", "Tidak ada respon",
  "Beli di tempat lain", "Proyek batal/ditunda", "Lainnya",
];

type NadaChip = NonNullable<VariantProps<typeof chipVariants>["nada"]>;

/** Pil tahap: label + nada Chip (warna semantik globals.css). */
export const TAHAP: Record<TahapLead, { label: string; nada: NadaChip }> = {
  BARU: { label: "BARU", nada: "info" },
  PENAWARAN: { label: "PENAWARAN", nada: "hari-ini" },
  ORDER: { label: "ORDER", nada: "sukses" },
  BATAL: { label: "BATAL", nada: "telat" },
  DIALIHKAN: { label: "DIALIHKAN", nada: "biasa" },
};

/** Status pembayaran order (revisi #7). null = order lama yang status bayarnya belum dicatat. */
export const BAYAR: Record<StatusBayar, { label: string; nada: NadaChip }> = {
  BELUM: { label: "Belum bayar", nada: "telat" },
  DP: { label: "DP", nada: "hari-ini" },
  LUNAS: { label: "Lunas", nada: "sukses" },
};
export const BAYAR_BELUM_DICATAT = { label: "Belum dicatat", nada: "biasa" as NadaChip };

/** Tab daftar "Lead saya" (§5). Kunci = nilai `tab` yang diterima web_pipeline_daftar. */
export const TAB_DAFTAR = [
  { kunci: "semua", label: "Semua" },
  { kunci: "fu", label: "Follow up hari ini" },
  { kunci: "diam", label: "Diam >7 hari" },
  { kunci: "pm", label: "Pallet Mesh" },
  { kunci: "penawaran", label: "Penawaran" },
  { kunci: "order", label: "Order" },
] as const;

export type KunciTab = (typeof TAB_DAFTAR)[number]["kunci"];

export const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;

// Satu formatter untuk semua angka (keluaran identik dengan toLocaleString("id-ID")): toLocaleString membuat
// formatter baru di setiap panggilan (±4× lebih lambat), terasa saat merender ribuan lead.
const ANGKA = new Intl.NumberFormat("id-ID");

/** 'Rp1.250.000' atau '—' bila kosong. */
export function rupiah(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rp${ANGKA.format(Number(n))}`;
}

/** Ringkas daftar produk: 'Pallet Mesh · 40 unit' (produk pertama) + '+1' bila lebih. */
export function ringkasProduk(items: { produk: string; qty: number; satuan: string }[]): string {
  if (!items.length) return "—";
  const [p, ...sisa] = items;
  const utama = `${p.produk} · ${ANGKA.format(Number(p.qty))} ${p.satuan}`;
  return sisa.length ? `${utama} · +${sisa.length}` : utama;
}

/**
 * Pratinjau No SP untuk form Order. `kode` = kode SP pemilik lead (atau aktor saat klaim); bila belum diatur,
 * tampilkan penanda jelas. Bulan (romawi) & tahun dihitung dari tanggal SP. Server tetap memvalidasi pola & keunikan.
 */
export function pratinjauNoSp(nomor: string, tanggalSp: string, kode: string | null): string {
  const n = (nomor || "").replace(/\D/g, "");
  let bulan = "—";
  let tahun = "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(tanggalSp)) {
    const bln = Number(tanggalSp.slice(5, 7));
    bulan = ROMAWI[bln - 1] ?? "—";
    tahun = tanggalSp.slice(0, 4);
  }
  return `${n || "—"}/${kode || "⟨kode SP belum diatur⟩"}/${bulan}/${tahun}`;
}

/** Status rencana follow-up relatif hari ini (tab "Follow up hari ini", daftar & papan). */
export function infoFu(fu: string, hariIni: string): { teks: string; mendesak: boolean } {
  if (fu < hariIni) return { teks: `FU telat ${selisihHari(fu, hariIni)} hr`, mendesak: true };
  if (fu === hariIni) return { teks: "FU hari ini", mendesak: true };
  return { teks: `FU ${fmtTanggal(fu, hariIni)}`, mendesak: false };
}
