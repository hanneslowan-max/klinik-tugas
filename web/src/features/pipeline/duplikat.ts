// Peringatan lead dobel per nomor WA/telepon (IMP-CMO-261015-1). Server: web_pipeline_cek_duplikat (normalisasi =
// public.pipeline_telp_norm). Di sini cermin normalisasinya, dipakai web untuk memutuskan KAPAN memanggil server
// (nomor < 8 digit tidak dicek) dan mencocokkan hasil dengan isi kolom saat ini (hasil nomor lama tidak ditampilkan).
import type { CekDuplikatTelepon, LeadDuplikat } from "@/types/domain";

/** Panjang minimum nomor TERNORMALISASI yang dicek (sama dengan server). */
export const MIN_DIGIT_DUPLIKAT = 8;

/**
 * Normalisasi nomor Indonesia → "62…" (digit saja; spasi, strip, titik, kurung, "+" dibuang; awalan 0 → 62, awalan
 * 8 → 628). Sama dengan public.pipeline_telp_norm, ditambah batas server: hasil < 8 digit → null (tidak dicek).
 */
export function normalTelepon(s: string | null | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  let n = d;
  if (d.startsWith("62")) n = d;
  else if (d.startsWith("0")) n = `62${d.slice(1)}`;
  else if (d.startsWith("8")) n = `62${d}`;
  return n.length < MIN_DIGIT_DUPLIKAT ? null : n;
}

/** "(PENAWARAN, PIC riksa)" — PIC = sales pemilik lead; lead tanpa pemilik → "PIC belum ada". */
export function rincianDuplikat(l: Pick<LeadDuplikat, "tahap" | "pemilik_nama">): string {
  return `(${l.tahap}, PIC ${l.pemilik_nama?.trim() || "belum ada"})`;
}

/** Sisa lead yang tidak ikut ditampilkan (server mengirim maks 5 + total). */
export function sisaDuplikat(h: CekDuplikatTelepon): number {
  return Math.max(0, h.total - h.items.length);
}

/**
 * Kalimat peringatan utuh (teks polos, untuk tes & pembaca layar):
 * "Nomor ini sudah ada di lead: L-00012 (PENAWARAN, PIC riksa) — cek dulu, jangan dobel."
 */
export function kalimatDuplikat(h: CekDuplikatTelepon): string | null {
  if (!h.items.length) return null;
  const daftar = h.items.map((l) => `${l.kode} ${rincianDuplikat(l)}`).join(", ");
  const sisa = sisaDuplikat(h);
  return `Nomor ini sudah ada di lead: ${daftar}${sisa ? ` dan ${sisa} lainnya` : ""} — cek dulu, jangan dobel.`;
}
