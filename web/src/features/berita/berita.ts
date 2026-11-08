// Logika murni modul Berita (owner): label, pengelompokan skor, saringan, pembaruan cache sesudah tanda, teks hasil tarik.
// Data: web_berita / web_berita_semua / web_berita_tersimpan / web_berita_tanda (20261107120000_berita.sql).
import type {
  DataBerita, HasilTarikBerita, KategoriBerita, PilihanBerita, RingkasEdisiBerita, WilayahBerita,
} from "@/types/domain";

export const KATEGORI_BERITA: Record<KategoriBerita, string> = {
  ekonomi: "Ekonomi & pasar",
  kebijakan: "Kebijakan & regulasi",
  industri: "Industri & manufaktur",
  logistik: "Logistik & rantai pasok",
  komoditas: "Komoditas & energi",
  bisnis: "Korporasi & bisnis",
  geopolitik: "Geopolitik & dunia",
  nasional: "Nasional & politik",
  teknologi: "Teknologi",
  lainnya: "Lainnya",
};

export const WILAYAH_BERITA: Record<WilayahBerita, string> = { dalam: "Dalam negeri", luar: "Luar negeri" };

export type SaringWilayah = "semua" | WilayahBerita;
export const SARING_WILAYAH: { nilai: SaringWilayah; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "dalam", label: "Dalam negeri" },
  { nilai: "luar", label: "Luar negeri" },
];

export function bacaSaringWilayah(v: string | null | undefined): SaringWilayah {
  return v === "dalam" || v === "luar" ? v : "semua";
}

export type TabBerita = "pilihan" | "semua" | "simpan";
export function bacaTabBerita(v: string | null | undefined): TabBerita {
  return v === "semua" || v === "simpan" ? v : "pilihan";
}

/** URL tab + saringan (tanpa parameter bawaan supaya tautan /berita tetap pendek). */
export function hrefBerita(tab: TabBerita, ekstra: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams();
  if (tab !== "pilihan") q.set("tab", tab);
  for (const [k, v] of Object.entries(ekstra)) {
    if (v === null || v === undefined || v === "" || v === "semua") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `/berita?${s}` : "/berita";
}

export type Tingkat = { kunci: "wajib" | "penting" | "perlu"; judul: string; keterangan: string; items: PilihanBerita[] };

/** Kelompok tampil menurut skor: 5 wajib baca, 4 penting, ≤3 perlu tahu (kelompok kosong dibuang). */
export function kelompokSkor(items: PilihanBerita[]): Tingkat[] {
  const t: Tingkat[] = [
    { kunci: "wajib", judul: "Wajib baca", keterangan: "Langsung berdampak ke bisnis atau keputusan Bapak", items: [] },
    { kunci: "penting", judul: "Penting", keterangan: "Perlu diketahui hari ini", items: [] },
    { kunci: "perlu", judul: "Perlu tahu", keterangan: "Konteks dan bahan obrolan", items: [] },
  ];
  for (const p of items) (p.skor >= 5 ? t[0] : p.skor === 4 ? t[1] : t[2]).items.push(p);
  return t.filter((x) => x.items.length > 0);
}

export function saringPilihan(items: PilihanBerita[], wilayah: SaringWilayah): PilihanBerita[] {
  return wilayah === "semua" ? items : items.filter((p) => p.wilayah === wilayah);
}

export function hitungWilayah(items: PilihanBerita[]): Record<SaringWilayah, number> {
  const n = { semua: items.length, dalam: 0, luar: 0 };
  for (const p of items) n[p.wilayah]++;
  return n;
}

export type Tanda = Partial<Pick<PilihanBerita, "dibaca" | "disimpan" | "kurang">>;

/** Terapkan tanda ke satu pilihan (optimistis, sebelum server menjawab). */
export function terapkanTanda(p: PilihanBerita, tanda: Tanda, kini: string): PilihanBerita {
  const baru = { ...p, ...tanda };
  if (tanda.disimpan !== undefined) baru.disimpan_at = tanda.disimpan ? (p.disimpan_at ?? kini) : null;
  return baru;
}

/** Ganti satu pilihan di data edisi (cache web_berita); hitungan tersimpan ikut disesuaikan. */
export function gantiDiData(d: DataBerita, baru: PilihanBerita): DataBerita {
  if (!d.edisi) return d;
  let selisih = 0;
  const pilihan = d.edisi.pilihan.map((p) => {
    if (p.id !== baru.id) return p;
    selisih = Number(baru.disimpan) - Number(p.disimpan);
    return baru;
  });
  return { ...d, tersimpan: Math.max(0, d.tersimpan + selisih), edisi: { ...d.edisi, pilihan } };
}

const fmtJam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
const fmtHari = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short" });

/** Label pilihan edisi: "Sab, 7 Nov · 14.05 · 12 berita (2 wajib)". */
export function labelEdisi(e: RingkasEdisiBerita): string {
  const d = new Date(e.dibuat_at);
  const wajib = e.wajib ? ` (${e.wajib} wajib)` : "";
  return `${fmtHari.format(d)} · ${fmtJam.format(d)} · ${e.jumlah} berita${wajib}`;
}

/** Pesan toast sesudah tombol Tarik terbaru. */
export function pesanTarik(h: HasilTarikBerita): string {
  if (h.ditunda) return "Baru saja ditarik (kurang dari 90 detik lalu). Coba lagi sebentar lagi.";
  const galat = h.sumber_galat ? `, ${h.sumber_galat} sumber gagal` : "";
  return `${h.baru} berita baru dari ${h.sumber_ok} sumber${galat}.`;
}

/** Domain singkat untuk label tautan ("kontan.co.id"). */
export function domainDari(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
