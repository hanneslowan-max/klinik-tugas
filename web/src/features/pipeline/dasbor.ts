// Dasbor Pipeline Tahap 1 (brief Hannes 29 Okt 2026): fungsi hitung murni (tanpa DOM) supaya bisa diuji.
// Agregat lead dihitung di server (web_pipeline_dasbor); di sini hanya turunan untuk tampilan: hari kerja
// (Senin–Sabtu, tanpa hari libur — sama dengan pipeline_hk_antara), proyeksi target, dan ambang "belum valid".
import type { MetrikDasbor } from "@/types/domain";

/** Target omzet bulanan (keputusan Hannes 29 Okt 2026). Ubah di sini saja. */
export const TARGET_OMZET = {
  tim: 300_000_000,
  /** per sales; anggota tanpa entri di `perSales` memakai `salesBaku` */
  salesBaku: 150_000_000,
  perSales: {} as Record<number, number>,
};

export function targetSales(id: number | null | undefined): number {
  return (id != null && TARGET_OMZET.perSales[id]) || TARGET_OMZET.salesBaku;
}

/** Ambang data cukup (brief Tahap 1, bagian 3–4). */
export const AMBANG = {
  /** nilai penawaran PM per sales tampil bila ≥ 50% lead PM terbuka punya nilai penawaran */
  nilaiPenawaran: 0.5,
  /** win rate PM per qty (<20 vs ≥20) tampil bila ≥ 30% lead PM punya qty > 1 */
  qtyPm: 0.3,
  /** median waktu siklus tampil bila sampel ≥ 10 lead */
  sampelSiklus: 10,
};

const HARI = 86_400_000;
const keUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const keIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Tanggal ISO + n hari. */
export function tambahHari(iso: string, n: number): string {
  return keIso(keUtc(iso) + n * HARI);
}

/** Jumlah hari kerja (Senin–Sabtu) d dengan dari < d ≤ sampai; 0 bila sampai ≤ dari. Sama dengan pipeline_hk_antara. */
export function hariKerjaAntara(dari: string, sampai: string): number {
  const n = Math.round((keUtc(sampai) - keUtc(dari)) / HARI);
  if (n <= 0) return 0;
  const isodow = ((new Date(keUtc(dari)).getUTCDay() + 6) % 7) + 1; // 1 = Senin … 7 = Minggu
  const mingguPertama = 7 - (isodow % 7); // hari ke-j pertama (j ≥ 1) yang jatuh Minggu
  const minggu = n >= mingguPertama ? Math.floor((n - mingguPertama) / 7) + 1 : 0;
  return n - minggu;
}

/** Hari kerja pertama sesudah tanggal (Sabtu → Senin). Sama dengan pipeline_hk_berikut. */
export function hariKerjaBerikut(iso: string): string {
  const besok = tambahHari(iso, 1);
  return new Date(keUtc(besok)).getUTCDay() === 0 ? tambahHari(iso, 2) : besok;
}

/** Hari pertama & terakhir bulan 'YYYY-MM'. */
export function rentangBulan(bulan: string): { awal: string; akhir: string } {
  const [t, b] = bulan.split("-").map(Number);
  return { awal: `${bulan}-01`, akhir: keIso(Date.UTC(t, b, 0)) };
}

export type SkorTarget = {
  target: number;
  persen: number;
  kurang: number;
  /** hari kerja sebulan */
  hkBulan: number;
  /** hari kerja yang sudah lewat (s/d kemarin; bulan lalu = sebulan) */
  hkLewat: number;
  /** sisa hari kerja termasuk hari ini (0 untuk bulan yang sudah selesai) */
  sisaHk: number;
  perluPerHari: number | null;
  laju: number | null;
  proyeksi: number | null;
  /** bulan sudah lewat (bukan bulan berjalan) */
  selesai: boolean;
};

/**
 * Turunan skor omzet vs target. Kurang = target − omzet (≥ 0). Sisa hari kerja = hari ini s/d akhir bulan.
 * Perlu per hari = kurang ÷ sisa hari kerja. Laju = omzet ÷ hari kerja yang sudah lewat (s/d kemarin);
 * proyeksi = laju × hari kerja sebulan. Bulan yang sudah selesai: proyeksi = omzet, sisa = 0.
 */
export function skorTarget({ omzet, target, bulan, hariIni }: { omzet: number; target: number; bulan: string; hariIni: string }): SkorTarget {
  const { awal, akhir } = rentangBulan(bulan);
  const sebelumAwal = tambahHari(awal, -1);
  const hkBulan = hariKerjaAntara(sebelumAwal, akhir);
  const selesai = hariIni > akhir;
  const kemarin = tambahHari(hariIni, -1);
  const hkLewat = selesai ? hkBulan : hariKerjaAntara(sebelumAwal, kemarin < sebelumAwal ? sebelumAwal : kemarin);
  const sisaHk = selesai ? 0 : hariKerjaAntara(kemarin, akhir);
  const kurang = Math.max(0, target - omzet);
  const laju = hkLewat > 0 ? omzet / hkLewat : null;
  return {
    target,
    persen: target > 0 ? omzet / target : 0,
    kurang,
    hkBulan,
    hkLewat,
    sisaHk,
    perluPerHari: sisaHk > 0 ? kurang / sisaHk : null,
    laju,
    proyeksi: selesai ? omzet : laju != null ? laju * hkBulan : null,
    selesai,
  };
}

/** x ÷ y (0 bila y = 0). */
export function rasio(x: number, y: number): number {
  return y > 0 ? x / y : 0;
}

/** Nilai penawaran PM per sales layak ditampilkan? (≥ 50% lead PM terbuka bernilai) */
export function nilaiPenawaranValid(bernilai: number, terbuka: number): boolean {
  return terbuka > 0 && bernilai / terbuka >= AMBANG.nilaiPenawaran;
}

/** Win rate PM per qty layak ditampilkan? (≥ 30% lead PM punya qty > 1) */
export function splitQtyValid(qtyLebih1: number, leadPm: number): boolean {
  return leadPm > 0 && qtyLebih1 / leadPm >= AMBANG.qtyPm;
}

/** Median waktu siklus layak ditampilkan? (sampel ≥ 10) */
export function siklusValid(n: number): boolean {
  return n >= AMBANG.sampelSiklus;
}

// ------------------------------------------------------------------ format
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SATU_DESIMAL = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PERSEN = new Intl.NumberFormat("id-ID", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PERSEN_BULAT = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 });
const ANGKA = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** '1.727' / '4,5' */
export const angka = (n: number) => ANGKA.format(n);

export const namaBulan = (bulan: string, panjang = false) =>
  (panjang ? BULAN_PANJANG : BULAN_PENDEK)[Number(bulan.slice(5, 7)) - 1] ?? bulan;

/** 'Rp243,3 jt' (juta, satu desimal; juta bulat 'Rp300 jt'); di bawah 1 jt: 'Rp850 rb'. */
export function rupiahJuta(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "Rp0";
  if (Math.abs(n) < 1_000_000) return `Rp${Math.round(n / 1000).toLocaleString("id-ID")} rb`;
  // juta bulat (target) tanpa desimal: 'Rp300 jt'
  return `Rp${n % 1_000_000 === 0 ? n / 1_000_000 : SATU_DESIMAL.format(n / 1_000_000)} jt`;
}

const DUA_DESIMAL = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Biaya per hasil: 'Rp8,1 jt' · 'Rp415 rb' · 'Rp38,2 rb' · 'Rp850'. */
export function rupiahRingkas(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return rupiahJuta(n);
  if (Math.abs(n) >= 100_000) return `Rp${Math.round(n / 1000)} rb`;
  if (Math.abs(n) >= 1000) return `Rp${SATU_DESIMAL.format(n / 1000)} rb`;
  return `Rp${Math.round(n)}`;
}

/** Biaya campaign: 'Rp7,78 jt' (dua desimal). */
export const rupiahJuta2 = (n: number) => `Rp${DUA_DESIMAL.format(n / 1_000_000)} jt`;

/** '37,9%' */
export const persen = (r: number) => PERSEN.format(r);
/** '25%' */
export const persenBulat = (r: number) => PERSEN_BULAT.format(r);

/** '1–29 Sep' dari tanggal batas pembanding (bulan lalu). */
export function labelRentang(batas: string): string {
  return `1–${Number(batas.slice(8, 10))} ${namaBulan(batas.slice(0, 7))}`;
}

/** '29–31 Okt' = sisa hari kalender bulan berjalan (hari ini termasuk). */
export function labelSisa(hariIni: string, bulan: string): string {
  const { akhir } = rentangBulan(bulan);
  const a = Number(hariIni.slice(8, 10));
  const b = Number(akhir.slice(8, 10));
  return a === b ? `${a} ${namaBulan(bulan)}` : `${a}–${b} ${namaBulan(bulan)}`;
}

/** Perubahan relatif: '−13%' / '+5%' (null bila pembanding 0). */
export function perubahan(baru: number, lama: number): string | null {
  if (!lama) return null;
  const r = Math.round(((baru - lama) / lama) * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}%`;
}

/** '1 Agu' */
export function tglPendek(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${namaBulan(iso.slice(0, 7))}`;
}

/** Awal basis kesehatan (lead terbuka ≤ 90 hari): tanggal_masuk > hari ini − 90, jadi mulai hari ini − 89. */
export const awalBasis90 = (hariIni: string) => tambahHari(hariIni, -89);

/** n bulan terakhir ('YYYY-MM', terbaru dulu) untuk pemilih bulan; bulan depan tidak bisa dipilih (server menolak). */
export function daftarBulan(hariIni: string, n = 12): string[] {
  const t = Number(hariIni.slice(0, 4));
  const b = Number(hariIni.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(t, b - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Label pendek metrik bagian 2 (spanduk "Dari dasbor" di daftar lead). */
export const LABEL_METRIK: Record<MetrikDasbor, string> = {
  terbuka90: "Lead terbuka ≤90 hari",
  lama: "Lead terbuka >90 hari",
  sentuh_basis: "Lead masuk (umur ≥1 hari kerja)",
  sentuh_cepat: "Lead baru disentuh ≤1 hari kerja",
  fu_hari_ini: "FU hari ini",
  fu_telat: "FU telat",
  tanpa_jadwal: "Tanpa jadwal FU",
  baru_tanpa_catatan: "BARU tanpa catatan",
  diam_0_7: "Diam 0–7 hari",
  diam_8_14: "Diam 8–14 hari",
  diam_15_30: "Diam 15–30 hari",
  diam_31: "Diam >30 hari",
  pm_terbuka: "Lead Pallet Mesh terbuka",
  bayar_belum_lunas: "Order belum lunas (SP 90 hari terakhir)",
  order_tanpa_bayar: "Order tanpa status bayar",
  nama_kosong: 'Nama pelanggan "-"',
  sumber_lainnya: 'Sumber "Lainnya"',
  batal_masuk: "Lead masuk yang BATAL",
  tanpa_bukti: "Tanpa bukti sumber",
  dibatalkan: "Lead dibatalkan",
  lead_dobel: "Pelanggan dengan >1 lead terbuka",
  pm_tanpa_nilai: "Lead PM terbuka tanpa nilai penawaran",
  asal_situs: "Asal lead per situs",
};

/** Metrik yang dihitung per bulan dipilih (spanduk daftar menyebut bulannya). */
export const METRIK_BULANAN: ReadonlySet<MetrikDasbor> = new Set<MetrikDasbor>([
  "sentuh_basis", "sentuh_cepat", "nama_kosong", "sumber_lainnya", "batal_masuk", "tanpa_bukti", "dibatalkan", "order_tanpa_bayar",
]);

export const metrikSah = (s: string | null): s is MetrikDasbor => s != null && Object.hasOwn(LABEL_METRIK, s);

/**
 * Tautan angka dasbor → daftar lead (/pipeline) tersaring id lead yang dihitung server (web_pipeline_dasbor_ids).
 * kes = metrik, kp = pemilik (id | 'tanpa'; kosong = semua), kb = bulan (basis "disentuh"). Tab Semua + pemilik
 * bawaan peran (admin: semua, sales: miliknya) — id sudah dibatasi server.
 */
export function tautanDaftar(metrik: MetrikDasbor, pemilik: number | null | "semua", bulan: string): string {
  const p = new URLSearchParams({ kes: metrik });
  if (pemilik !== "semua") p.set("kp", pemilik == null ? "tanpa" : String(pemilik));
  p.set("kb", bulan);
  return `/pipeline?${p.toString()}`;
}

/** Omzet harian [{tgl, omzet}] → kumulatif hari 1…hariAkhir (hari tanpa order = sama dengan hari sebelumnya). */
export function kumulatif(harian: { tgl: number; omzet: number }[], hariAkhir: number): number[] {
  const per = new Map(harian.map((x) => [x.tgl, x.omzet]));
  const hasil: number[] = [];
  let jalan = 0;
  for (let h = 1; h <= hariAkhir; h++) {
    jalan += per.get(h) ?? 0;
    hasil.push(jalan);
  }
  return hasil;
}

/** '3/8' (tanggal/bulan) untuk label minggu. */
export const labelTglBulan = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

const HARI_PENDEK = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
/** Nama hari ('Kamis') dari tanggal ISO. */
export const namaHari = (iso: string) => HARI_PENDEK[new Date(`${iso}T00:00:00Z`).getUTCDay()];
