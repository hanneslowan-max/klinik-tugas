// Tanggal & waktu WIB (Asia/Jakarta), hari kerja, kategori due. Fungsi murni (tanpa DOM) supaya bisa diuji.
// Semantik sama dengan SQL: due_wib = tanggal WIB, hari_kerja(a,b) = Senin–Jumat a < d ≤ b di luar hari_libur.

import type { KategoriDue } from "@/types/domain";

export const ZONA = "Asia/Jakarta";

const fmtTgl = new Intl.DateTimeFormat("id-ID", { timeZone: ZONA, weekday: "short", day: "numeric", month: "short" });
const fmtTglTahun = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA, weekday: "short", day: "numeric", month: "short", year: "numeric",
});
const fmtJam = new Intl.DateTimeFormat("id-ID", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtLengkap = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const fmtIsoWib = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtTglPanjang = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const fmtJamDetik = new Intl.DateTimeFormat("id-ID", {
  timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

export const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

const sah = (d: Date) => !Number.isNaN(d.getTime());

/** 'YYYY-MM-DD' (tanggal WIB) dari Date/ISO. */
export function tanggalWib(t: Date | string | null | undefined): string | null {
  if (!t) return null;
  const d = t instanceof Date ? t : new Date(t);
  return sah(d) ? fmtIsoWib.format(d) : null;
}

/** Tanggal WIB 'YYYY-MM-DD' → Date pukul 12:00 WIB (aman untuk format). */
export function dariTanggal(s: string): Date {
  return new Date(`${s}T12:00:00+07:00`);
}

/** 'Sen, 29 Sep' (+ tahun bila beda tahun dengan hariIni). */
export function fmtTanggal(s: string | null | undefined, hariIni?: string | null): string {
  if (!s) return "";
  const tahunSama = Boolean(hariIni) && s.slice(0, 4) === hariIni!.slice(0, 4);
  return (tahunSama ? fmtTgl : fmtTglTahun).format(dariTanggal(s));
}

/** '29 Sep 2026 14.05 WIB' dari ISO. */
export function fmtWaktu(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return sah(d) ? `${fmtLengkap.format(d)} WIB` : "";
}

/** 'Selasa, 29 September 2026' dari tanggal WIB. */
export function fmtTanggalPanjang(s: string | null | undefined): string {
  return s ? fmtTglPanjang.format(dariTanggal(s)) : "";
}

/** 'Selasa, 29 September 2026 pukul 11.25.31 WIB' dari ISO (tooltip). */
export function fmtWaktuPanjang(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return sah(d) ? `${fmtTglPanjang.format(d)} pukul ${fmtJamDetik.format(d)} WIB` : "";
}

export function fmtJamWib(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return sah(d) ? `${fmtJam.format(d)} WIB` : "";
}

export function jam(iso: string): string {
  return fmtJam.format(new Date(iso));
}

export function tambahHari(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function selisihHari(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** 0 Minggu … 6 Sabtu. */
export function hariDalamMinggu(s: string): number {
  return new Date(`${s}T00:00:00Z`).getUTCDay();
}

/** Waktu relatif singkat: 'baru saja', '5 mnt lalu', '3 jam lalu', 'hari ini 14.05', 'kemarin 14.05', 'Sen, 12 Sep'. */
export function fmtRelatif(iso: string | null | undefined, hariIni?: string | null, sekarang: number = Date.now()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!sah(d)) return "";
  const detik = (sekarang - d.getTime()) / 1000;
  if (detik < 60 && detik > -60) return "baru saja";
  if (detik > 0 && detik < 3600) return `${Math.floor(detik / 60)} mnt lalu`;
  if (detik > 0 && detik < 6 * 3600) return `${Math.floor(detik / 3600)} jam lalu`;
  const tgl = tanggalWib(d)!;
  const hi = hariIni || tanggalWib(new Date(sekarang))!;
  if (tgl === hi) return `hari ini ${fmtJam.format(d)}`;
  if (tgl === tambahHari(hi, -1)) return `kemarin ${fmtJam.format(d)}`;
  return fmtTanggal(tgl, hi);
}

/** Sama dengan SQL hari_kerja(a,b): jumlah d Senin–Jumat, a < d ≤ b, bukan hari libur; negatif bila b < a. */
export function hariKerja(a: string, b: string, libur?: ReadonlySet<string>): number {
  if (b < a) return -hariKerja(b, a, libur);
  let n = 0;
  for (let d = tambahHari(a, 1); d <= b; d = tambahHari(d, 1)) {
    const w = hariDalamMinggu(d);
    if (w !== 0 && w !== 6 && !libur?.has(d)) n++;
  }
  return n;
}

type BerDue = { selesai: boolean; due_wib: string | null };

/** Kategori due kartu terbuka (sama dengan web_tugas_saya); null bila selesai. */
export function kategoriDue(t: BerDue, hariIni: string, libur?: ReadonlySet<string>) {
  if (t.selesai) return null;
  if (!t.due_wib) return "tanpa_due" as const;
  if (t.due_wib < hariIni) return "telat" as const;
  if (t.due_wib === hariIni) return "hari_ini" as const;
  if (hariKerja(hariIni, t.due_wib, libur) <= 3) return "tiga_hk" as const;
  return "nanti" as const;
}

/** Tanggal (YYYY-MM-DD) n hari kerja setelah `dari` (Senin–Jumat, bukan hari libur); n harus ≥ 1. */
export function tanggalHariKerjaKe(dari: string, n: number, libur?: ReadonlySet<string>): string {
  let d = dari;
  for (let sisa = n; sisa > 0; ) {
    d = tambahHari(d, 1);
    const w = hariDalamMinggu(d);
    if (w !== 0 && w !== 6 && !libur?.has(d)) sisa--;
  }
  return d;
}

/**
 * Tenggat (due_wib) agar kartu terbuka masuk kolom `kategori` di Papan Tugas Saya — konsisten dengan kategoriDue():
 * `null` menghapus tenggat (tanpa_due), string = tanggal. `undefined` = kategori bukan tujuan yang sah ('telat':
 * tidak masuk akal menjadwalkan kartu ke masa lampau), pemanggil harus menolak drop.
 */
export function tenggatUntukKategori(
  kategori: KategoriDue,
  hariIni: string,
  libur?: ReadonlySet<string>,
): string | null | undefined {
  switch (kategori) {
    case "tanpa_due":
      return null;
    case "hari_ini":
      return hariIni;
    case "tiga_hk":
      return tanggalHariKerjaKe(hariIni, 1, libur); // hari kerja berikutnya → sisa 1 hk (≤ 3)
    case "nanti":
      return tanggalHariKerjaKe(hariIni, 4, libur); // > 3 hk
    default:
      return undefined; // 'telat'
  }
}

export type InfoDue = { teks: string; kategori: ReturnType<typeof kategoriDue>; judul: string };

/** Teks chip due: 'Hari ini' / 'Rab, 1 Okt · sisa 2 hk' / 'Sen, 29 Sep · telat 3 hr'. null bila tanpa due. */
export function infoDue(
  t: BerDue & { due_at: string | null; due_has_time: boolean },
  hariIni: string,
  libur?: ReadonlySet<string>,
): InfoDue | null {
  if (!t.due_wib) return null;
  const kategori = kategoriDue(t, hariIni, libur);
  const j = t.due_has_time && t.due_at ? ` ${jam(t.due_at)}` : "";
  let teks = fmtTanggal(t.due_wib, hariIni) + j;
  if (kategori === "telat") teks = `${teks} · telat ${selisihHari(t.due_wib, hariIni)} hr`;
  else if (kategori === "hari_ini") teks = `Hari ini${j}`;
  else if (kategori === "tiga_hk") teks = `${teks} · sisa ${hariKerja(hariIni, t.due_wib, libur)} hk`;
  return { teks, kategori, judul: `Due ${fmtTanggalPanjang(t.due_wib)}${j} (WIB)` };
}

/** Peringatan tanggal non-blokir (akhir pekan / hari libur). */
export function peringatanTanggal(tgl: string | null | undefined, libur?: ReadonlySet<string>): string | null {
  if (!tgl) return null;
  const w = hariDalamMinggu(tgl);
  if (w === 0 || w === 6) return `Due jatuh hari ${NAMA_HARI[w]} (akhir pekan). Cek hari kerja dulu.`;
  if (libur?.has(tgl)) return "Due jatuh di hari libur.";
  return null;
}
