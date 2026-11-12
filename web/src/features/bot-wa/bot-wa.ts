// Logika murni halaman Bot WA (owner; keputusan Hannes 11 Nov 2026): label keputusan/alasan, saringan, kesehatan detak,
// biaya, validasi form fakta/contoh. Data: web_wa_ringkas / web_wa_log / web_wa_saklar / web_wa_pengetahuan_daftar
// (20261111120000_wa_web.sql); simpan fakta/contoh lewat Edge /x/admin/wa-pengetahuan (validator bot).
// Halaman TIDAK menampilkan isi chat pelanggan (memang tidak disimpan); isi chat penuh dibaca di HP 0878 / inbox Kapso.
import type { BarisLogWa, KeputusanWa, RingkasBotWa } from "@/types/domain";

export const INBOX_KAPSO = "https://inbox.kapso.ai";

export type SaringKeputusan = "bot" | "semua" | KeputusanWa;

/** Saringan daftar. "bot" (bawaan) = semua keputusan bot (tanpa catatan webhook masuk/keluar). */
export const SARING_KEPUTUSAN: { nilai: SaringKeputusan; label: string }[] = [
  { nilai: "bot", label: "Keputusan bot" },
  { nilai: "kirim", label: "Terkirim" },
  { nilai: "diam", label: "Diam" },
  { nilai: "batal", label: "Batal" },
  { nilai: "tolak", label: "Ditolak validator" },
  { nilai: "gagal", label: "Gagal" },
  { nilai: "tunda", label: "Tunda" },
  { nilai: "catat", label: "Catatan webhook" },
  { nilai: "semua", label: "Semua" },
];

const NILAI_SARING = new Set<string>(SARING_KEPUTUSAN.map((s) => s.nilai));
export function bacaSaringKeputusan(v: string | null | undefined): SaringKeputusan {
  return v && NILAI_SARING.has(v) ? (v as SaringKeputusan) : "bot";
}

/** Argumen web_wa_log untuk saringan: "bot" & "semua" tidak memfilter di DB ("bot" disaring di klien). */
export function argKeputusan(s: SaringKeputusan): KeputusanWa | undefined {
  return s === "bot" || s === "semua" ? undefined : s;
}

/** Baris yang tampil untuk saringan "bot": buang catatan webhook (arah masuk/keluar_* dengan keputusan catat). */
export function saringBaris(items: BarisLogWa[], s: SaringKeputusan): BarisLogWa[] {
  if (s !== "bot") return items;
  return items.filter((b) => b.keputusan !== "catat");
}

export const LABEL_KEPUTUSAN: Record<KeputusanWa, string> = {
  catat: "Dicatat",
  kirim: "Terkirim",
  diam: "Diam",
  batal: "Batal",
  tolak: "Ditolak",
  gagal: "Gagal",
  tunda: "Tunda",
};

export type NadaKeputusan = "sukses" | "telat" | "dekat" | "info" | "biasa";
export function nadaKeputusan(k: KeputusanWa): NadaKeputusan {
  if (k === "kirim") return "sukses";
  if (k === "tolak" || k === "gagal") return "telat";
  if (k === "tunda") return "dekat";
  if (k === "diam") return "info";
  return "biasa";
}

/** Penjelasan alasan (awalan sebelum ':' ) dalam bahasa sehari-hari. Alasan tak dikenal ditampilkan apa adanya. */
const LABEL_ALASAN: Record<string, string> = {
  jam_kerja: "Jam kerja (bot tidak membalas)",
  saklar_mati: "Saklar mati",
  daftar_diam: "Nomor di daftar diam",
  minta_berhenti: "Pelanggan minta berhenti",
  sales_membalas: "Sales sudah membalas",
  chat_berjalan: "Chat sedang dilayani sales",
  jendela_24jam: "Lewat 24 jam (aturan Meta)",
  batas_periode: "Batas pesan per periode",
  batas_24jam: "Batas pesan per 24 jam",
  manusia_saja: "Topik khusus sales (kata kunci)",
  auto_reply: "Lawan tampak balasan otomatis",
  hanya_reaksi: "Hanya reaksi/stiker",
  reaksi: "Reaksi",
  stiker: "Stiker",
  tes: "Pesan tes",
  tunda: "API Kapso belum memuat pesan",
  tunda_habis: "Tunda habis (3x)",
  api_belum_memuat_pesan: "API Kapso belum memuat pesan",
  ai_tidak_kirim: "AI memutuskan tidak membalas",
  validator: "Ditolak validator",
  teks_otomatis_aplikasi: "Teks otomatis aplikasi HP",
  pemutus: "Pemutus otomatis",
};

export function labelAlasan(alasan: string | null | undefined): string {
  if (!alasan) return "";
  const kunci = alasan.split(":")[0].trim();
  const dasar = LABEL_ALASAN[kunci];
  if (!dasar) return alasan;
  const sisa = alasan.slice(kunci.length).replace(/^:\s*/, "").trim();
  return sisa ? `${dasar}: ${sisa}` : dasar;
}

/** per_alasan ringkasan ("diam:manusia_saja" → n) diurut terbanyak, label manusiawi. */
export function urutPerAlasan(per: Record<string, number> | null | undefined): { kunci: string; keputusan: string; label: string; n: number }[] {
  return Object.entries(per ?? {})
    .map(([k, n]) => {
      const [keputusan, ...r] = k.split(":");
      const alasan = r.join(":");
      return { kunci: k, keputusan, label: labelAlasan(alasan) || alasan || "-", n: Number(n) || 0 };
    })
    .sort((a, b) => b.n - a.n || a.kunci.localeCompare(b.kunci));
}

/** "$0,0123" (4 desimal di bawah $1, 2 desimal di atasnya). */
export function fmtUsd(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  const d = n > 0 && n < 1 ? 4 : 2;
  return `$${n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export type Detak = { label: string; iso: string | null; sehat: boolean; batasMenit: number };

/**
 * Kesehatan detak: proses dipanggil cron tiap menit (sehat ≤ 5 mnt), jaga tiap 15 mnt (≤ 30 mnt). Webhook tergantung
 * pesan masuk, jadi hanya informasi (sehat bila pernah ada).
 */
export function detakBot(r: Pick<RingkasBotWa, "terakhir_webhook" | "terakhir_proses" | "terakhir_jaga">, kini: number): Detak[] {
  const umur = (iso: string | null) => (iso ? (kini - Date.parse(iso)) / 60_000 : Infinity);
  return [
    { label: "Webhook terakhir", iso: r.terakhir_webhook, sehat: r.terakhir_webhook !== null, batasMenit: Infinity },
    { label: "Proses terakhir", iso: r.terakhir_proses, sehat: umur(r.terakhir_proses) <= 5, batasMenit: 5 },
    { label: "Jaga terakhir", iso: r.terakhir_jaga, sehat: umur(r.terakhir_jaga) <= 30, batasMenit: 30 },
  ];
}

export const MAKS_TEKS = 700;
export const MAKS_SITUASI = 200;

/** Cek ringan sebelum kirim (validator bot sebenarnya di Edge). Hasil = pesan galat, atau null bila boleh dikirim. */
export function cekForm(jenis: "fakta" | "contoh", teks: string, situasi: string): string | null {
  const t = teks.trim();
  if (t.length < 3) return "Teks minimal 3 karakter.";
  if (t.length > MAKS_TEKS) return `Teks maksimal ${MAKS_TEKS} karakter.`;
  if (jenis === "contoh") {
    const s = situasi.trim();
    if (s.length < 3) return "Situasi minimal 3 karakter.";
    if (s.length > MAKS_SITUASI) return `Situasi maksimal ${MAKS_SITUASI} karakter.`;
  }
  return null;
}

/** Pesan galat validator Edge ("ditolak validator: harga, janji_kirim") → bahasa sehari-hari. */
const LABEL_TOLAK: Record<string, string> = {
  harga: "menyebut harga/angka rupiah",
  diskon: "menyebut diskon/promo",
  tautan: "berisi tautan/alamat web",
  distributor: "memakai kata 'distributor'",
  galvanis: "memakai kata 'galvanis'",
  lemari_custom: "menawarkan lemari arsip custom",
  produk_tidak_dijual: "menawarkan produk yang tidak dijual",
  nomor_telepon: "berisi nomor telepon",
  email: "berisi email",
  rekening: "berisi rekening/bank",
  janji_stok: "menjanjikan stok",
  janji_kirim: "menjanjikan waktu/tanggal kirim",
  terlalu_panjang: "terlalu panjang",
  kosong: "kosong",
};
export function pesanTolak(pesan: string): string {
  const m = /ditolak validator:\s*(.+)$/i.exec(pesan);
  if (!m) return pesan;
  const bagian = m[1].split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const situasi = x.startsWith("situasi:");
    const k = situasi ? x.slice("situasi:".length) : x;
    const l = LABEL_TOLAK[k] ?? k;
    return situasi ? `situasi ${l}` : l;
  });
  return `Ditolak validator bot: ${bagian.join(", ")}.`;
}
