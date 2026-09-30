"use client";

// Lampiran di Storage (bucket `lampiran`): unggah ke t/<task>/<uuid>-<nama aman> lalu catat lewat web_lampiran_catat.
// Tautan unduh & pratinjau gambar = signed URL (berlaku 60 mnt, disimpan di cache query ±50 mnt).
import { useQuery } from "@tanstack/react-query";

import { GalatApi } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { BATAS_BERKAS, BUCKET_LAMPIRAN, mimeBerkas } from "@/lib/konstanta";
import { klienBrowser } from "@/lib/supabase/client";
import type { Lampiran } from "@/types/domain";

/** Umur signed URL yang masih dianggap segar (masa berlaku 60 mnt; sisakan jeda 10 mnt). */
export const SEGAR_URL = 50 * 60_000;
const BERLAKU_DETIK = 3600;

/** Alasan berkas ditolak sebelum diunggah (tipe / ukuran), atau null bila boleh. */
export function cekBerkas(file: File): string | null {
  if (!mimeBerkas(file)) {
    return `Tipe berkas tidak diizinkan: ${file.name}. Boleh: gambar (termasuk HEIC), PDF, DOC/DOCX, XLS/XLSX, PPTX, CSV, TSV, TXT.`;
  }
  if (file.size > BATAS_BERKAS) return `Berkas ${file.name} melebihi 25 MB.`;
  return null;
}

function namaAman(nama: string) {
  const bersih = nama.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "");
  return (bersih || "berkas").slice(-80);
}

/** Unggah satu berkas ke Storage lalu catat sebagai lampiran tugas (atau lampiran komentar bila commentId diisi). */
export async function unggahLampiran(taskId: string, file: File, commentId: string | null = null): Promise<Lampiran> {
  const alasan = cekBerkas(file);
  if (alasan) throw new GalatApi({ message: alasan });
  const mime = mimeBerkas(file)!;
  const path = `t/${taskId}/${crypto.randomUUID()}-${namaAman(file.name)}`;
  const { error } = await klienBrowser()
    .storage.from(BUCKET_LAMPIRAN)
    .upload(path, file, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (error) {
    const pesan = /row-level security|Unauthorized|403/i.test(error.message)
      ? "Tidak boleh mengunggah ke tugas ini (mode cermin / tugas terhapus / bukan anggota)."
      : `Gagal mengunggah: ${error.message}`;
    const kode = (error as { statusCode?: string | number }).statusCode;
    throw new GalatApi({ message: pesan, status: kode ? Number(kode) : null });
  }
  // p_comment '' = lampiran tugas (fungsi SQL memakai nullif(p_comment, ''))
  return rpc(klienBrowser(), "web_lampiran_catat", {
    p_task: taskId,
    p_comment: commentId ?? "",
    p_path: path,
    p_title: file.name,
    p_mime: mime,
    p_size: file.size,
  });
}

/** Signed URL Storage — unduh=true memaksa Content-Disposition attachment dengan nama asli. */
export async function urlLampiran(path: string, judul: string | null, unduh: boolean): Promise<string> {
  const { data, error } = await klienBrowser()
    .storage.from(BUCKET_LAMPIRAN)
    .createSignedUrl(path, BERLAKU_DETIK, unduh ? { download: judul || true } : undefined);
  if (error) throw new GalatApi({ message: `Gagal membuat tautan unduh: ${error.message}` });
  return data.signedUrl;
}

export const kunciUrlLampiran = (path: string | null, unduh: boolean) => ["url-lampiran", path, unduh] as const;

/** Signed URL lampiran (cache ±50 mnt, diperbarui otomatis sebelum kedaluwarsa). Nonaktif bila tanpa berkas Storage. */
export function useUrlLampiran(a: Pick<Lampiran, "storage_path" | "title">, unduh: boolean, aktif = true) {
  return useQuery({
    queryKey: kunciUrlLampiran(a.storage_path, unduh),
    queryFn: () => urlLampiran(a.storage_path!, a.title, unduh),
    enabled: aktif && Boolean(a.storage_path),
    staleTime: SEGAR_URL,
    gcTime: SEGAR_URL,
    refetchInterval: SEGAR_URL,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
