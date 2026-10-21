// Konstanta & pembantu modul Pipeline. Nilai (produk/sumber/tahap/alasan) PERSIS dengan CHECK di migrasi
// 20261011120000 (alasan "Order dibatalkan": 20261014130000) — jangan ubah ejaan tanpa mengubah migrasi.
// Batalkan order (20261014130000): alasan tertulis wajib 5–500 karakter; dirapikan PERSIS seperti server.
import type { VariantProps } from "class-variance-authority";

import type { chipVariants } from "@/components/umum/chip";
import { fmtTanggal, fmtWaktu, selisihHari } from "@/lib/tanggal";
import type {
  AlasanBatal,
  AlasanDobel,
  JenisAktivitas,
  KelasBuktiSumber,
  LeadDetail,
  ProdukLead,
  SaringPelanggan,
  SatuanItem,
  StatusBayar,
  SumberLead,
  TahapLead,
  UrutPelanggan,
} from "@/types/domain";

export const PRODUK: ProdukLead[] = [
  "Roda", "Pallet Mesh", "Airport Trolley", "Shopping Cart",
  "Lemari Arsip", "Material Handling", "Locker", "Lainnya",
];

export const SUMBER: SumberLead[] = [
  "Google Ads", "Meta Ads", "Website organik", "WA langsung",
  "Telepon", "Referral", "Repeat order", "Lainnya",
];

/**
 * Teks bantu di bawah pilihan Sumber (form Lead baru & Ubah). Data 15 Okt: 46 dari 48 lead baru diisi "WA langsung"
 * dan 0 "Google Ads" walau iklan Google ±8 konversi/hari — rep mengisi MEDIA chat, bukan ASAL pelanggan.
 */
export const BANTU_SUMBER =
  "Tanya pelanggan: dapat kontak kami dari mana? Pilih ASALNYA (Google = Google Ads/Website organik, Instagram/Facebook = Meta Ads). 'WA langsung' hanya bila pelanggan sudah menyimpan nomor kita sebelumnya.";

/**
 * Label kelas bukti sumber dari chat WA 0878 (diisi agent, 20261021120000). Kunci PERSIS dengan
 * public.pipeline_sumber_bukti_kelas() — kelas baru di server = tambah di sini juga (sampai itu, kode kelasnya tampil apa adanya).
 */
export const BUKTI_SUMBER: Record<KelasBuktiSumber, string> = {
  "situs-rh": "Form situs RH",
  "situs-oy": "Form situs OYAMA",
  "web-rh": "Tombol WA situs RH",
  "ga-rh": "Google Ads · situs RH",
  "web-oy": "Tombol WA situs OYAMA",
  "ga-oy": "Google Ads · situs OYAMA",
  meta: "Iklan Meta",
  lastri: "Sapaan \"Halo Bu Lastri\"",
  "katalog-wa": "Katalog WhatsApp",
  "xs-pm": "Kode XS-PM",
  tidur: "Kode TIDUR",
  "tanpa-sinyal": "Chat tanpa bukti sumber",
};

/**
 * Satu baris bukti sumber untuk detail lead: "Form situs RH · chat 16 Okt 2026, 10.32 WIB", kode bila ada
 * ("Google Ads · situs OYAMA (GA-OY-7K3F) · chat …"). null bila belum ada bukti (baris tidak ditampilkan).
 */
export function teksBuktiSumber(
  b: Pick<LeadDetail, "sumber_bukti" | "sumber_bukti_kode" | "sumber_bukti_chat_pada">,
): string | null {
  if (!b.sumber_bukti) return null;
  const label = BUKTI_SUMBER[b.sumber_bukti] ?? b.sumber_bukti;
  const kode = b.sumber_bukti_kode ? ` (${b.sumber_bukti_kode})` : "";
  const chat = b.sumber_bukti_chat_pada ? fmtWaktu(b.sumber_bukti_chat_pada) : "";
  return `${label}${kode}${chat ? ` · chat ${chat}` : ""}`;
}

export const SATUAN: SatuanItem[] = ["unit", "set", "pcs"];

/** Jenis follow-up yang bisa dipilih rep (tanpa "Catatan impor" yang khusus impor). */
export const JENIS_FU: JenisAktivitas[] = ["Telepon", "WA", "Email", "Visit", "Kirim penawaran", "Catatan"];

/** Pilihan dialog Batal biasa (lead BARU/PENAWARAN). TANPA "Order dibatalkan": server menolaknya di aksi 'batal'. */
export const ALASAN_BATAL: AlasanBatal[] = [
  "Harga", "Stok/waktu kirim", "Spesifikasi tidak cocok", "Tidak ada respon",
  "Beli di tempat lain", "Proyek batal/ditunda", "Lainnya",
];

/** Kategori alasan_batal yang diisi server saat order dibatalkan (aksi 'batal_order'); teksnya di alasan_batal_lain. */
export const ALASAN_BATAL_ORDER = "Order dibatalkan" satisfies AlasanBatal;
export const ALASAN_ORDER_MIN = 5;
export const ALASAN_ORDER_MAKS = 500;

/**
 * Rapikan alasan pembatalan order PERSIS seperti server: CRLF → LF, lalu buang spasi/tab/baris baru di awal & akhir
 * (btrim(..., E' \t\r\n') — bukan String.trim, yang juga membuang spasi Unicode lain).
 */
export function rapikanAlasanOrder(teks: string | null | undefined): string {
  return (teks ?? "").replace(/\r\n/g, "\n").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** Galat alasan pembatalan order (pesan sama dengan server), atau null bila sah. Panjang = jumlah karakter (char_length). */
export function galatAlasanOrder(teks: string | null | undefined): string | null {
  const n = Array.from(rapikanAlasanOrder(teks)).length;
  if (n < ALASAN_ORDER_MIN) return `Alasan pembatalan wajib ditulis (minimal ${ALASAN_ORDER_MIN} karakter).`;
  if (n > ALASAN_ORDER_MAKS) return `Alasan pembatalan maksimal ${ALASAN_ORDER_MAKS} karakter.`;
  return null;
}

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

/**
 * Tab daftar "Lead saya" (§5). Kunci = nilai `tab` yang diterima web_pipeline_daftar. Tab "Pallet Mesh" (`pm`) diganti
 * pilihan Produk di sebelah Filter (19 Okt) yang berlaku untuk semua produk & semua tab; `pm` di server dibiarkan.
 */
export const TAB_DAFTAR = [
  { kunci: "semua", label: "Semua" },
  { kunci: "fu", label: "Follow up hari ini" },
  { kunci: "diam", label: "Diam >7 hari" },
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

// -------------------------------------------------------------------- database pelanggan (20261017120000)
/**
 * Nama tampilan pelanggan. Nama pengisi dari sheet ("-", "Perorangan", "Pribadi", …; `semu` dari server) diganti nama
 * PIC; tanpa PIC (atau disembunyikan untuk peran baca) → "Perorangan".
 */
export function namaPelanggan(p: { nama: string; semu?: boolean; pic?: string | null }): string {
  if (!p.semu) return p.nama;
  return p.pic?.trim() || "Perorangan";
}

export const SARING_PELANGGAN: { kunci: SaringPelanggan; label: string }[] = [
  { kunci: "semua", label: "Semua" },
  { kunci: "repeat", label: "Repeat order" },
  { kunci: "order", label: "Pernah order" },
  { kunci: "aktif", label: "Ada lead aktif" },
];

export const URUT_PELANGGAN: { kunci: UrutPelanggan; label: string }[] = [
  { kunci: "terakhir", label: "Aktivitas terakhir" },
  { kunci: "order", label: "Order terbanyak" },
  { kunci: "nilai", label: "Nilai order terbesar" },
  { kunci: "nama", label: "Nama (A–Z)" },
];

export const ALASAN_DOBEL: Record<AlasanDobel, string> = {
  nama: "Nama sama",
  telepon: "Nomor HP sama",
  mirip: "Nama mirip",
};

/** Tanggal "kejadian" lead di log pelanggan: tanggal SP untuk order (atau order dibatalkan), selain itu tanggal masuk. */
export function tanggalLog(l: { tanggal_masuk: string; tanggal_sp: string | null; no_sp: string | null }): string {
  return l.no_sp && l.tanggal_sp ? l.tanggal_sp : l.tanggal_masuk;
}
