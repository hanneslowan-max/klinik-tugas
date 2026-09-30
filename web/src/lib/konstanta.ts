// Konstanta domain yang dipakai lintas fitur. Nilai DB tetap (prioritas 1–4, peran owner/member/bot);
// label tampil berbahasa Indonesia.
import type { Peran, Prioritas } from "@/types/domain";

export const PRIORITAS: Record<Prioritas, { nama: string; warna: string }> = {
  1: { nama: "Mendesak", warna: "#f50000" },
  2: { nama: "Tinggi", warna: "#ffcc00" },
  3: { nama: "Normal", warna: "#6fddff" },
  4: { nama: "Rendah", warna: "#d8d8d8" },
};

export const LABEL_PERAN: Record<Peran, string> = { owner: "owner", member: "anggota", bot: "bot" };

export const WARNA_ANGGOTA_BAKU = "#7b68ee";

/** Batas unggah = bucket `lampiran` (25 MB). */
export const BATAS_BERKAS = 25 * 1024 * 1024;
export const BUCKET_LAMPIRAN = "lampiran";

// SAMA dengan allowlist bucket 'lampiran' (migrasi 20260929100400, perbaikan P3) dan impor/sinkron.mjs MIME_IZIN.
// CSV dari Excel Windows sering bertipe application/vnd.ms-excel → diterima apa adanya (bucket mengizinkan).
export const MIME_IZIN: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/msword": ["doc"],
  "application/vnd.ms-excel": ["xls"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "text/tab-separated-values": ["tsv"],
};

export const ACCEPT_LAMPIRAN = Object.values(MIME_IZIN).flat().map((e) => `.${e}`).join(",");

/** MIME yang diizinkan untuk berkas (dari tipe browser, atau dari ekstensi bila tipe kosong/tak dikenal). */
export function mimeBerkas(file: { name: string; type: string }): string | null {
  const ext = file.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
  if (file.type && MIME_IZIN[file.type]) return file.type;
  for (const [m, exts] of Object.entries(MIME_IZIN)) if (ext && exts.includes(ext)) return m;
  return null;
}
