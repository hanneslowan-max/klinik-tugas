import type { StatusList } from "@/types/domain";

/** Status tujuan untuk tombol selesai/buka lagi (status open pertama / closed-atau-done pertama menurut urutan). */
export function statusToggle(statuses: StatusList[], selesai: boolean): string {
  const urut = [...statuses].sort((a, b) => a.orderindex - b.orderindex);
  if (selesai) return (urut.find((s) => s.type === "open") ?? urut[0]).status;
  return (urut.find((s) => s.type === "closed") ?? urut.find((s) => s.type === "done") ?? urut[urut.length - 1]).status;
}

/**
 * Selisih himpunan assignee → body {add, rem} untuk web_ubah_tugas (DB hanya memvalidasi `add`, jadi assignee lama
 * yang sudah nonaktif tidak membuat simpan gagal). null bila tidak ada perubahan.
 */
export function selisihAssignee(lama: number[], baru: number[]) {
  const a = new Set(lama.map(Number));
  const b = new Set(baru.map(Number));
  const add = [...b].filter((x) => !a.has(x));
  const rem = [...a].filter((x) => !b.has(x));
  return add.length || rem.length ? { add, rem } : null;
}

/** Nilai orderindex di antara dua tetangga (seret di papan). null bila keduanya tidak punya urutan. */
export function urutanDiAntara(sebelum: number | null, sesudah: number | null): number | null {
  if (sebelum !== null && sesudah !== null) return (sebelum + sesudah) / 2;
  if (sebelum !== null) return sebelum + 1;
  if (sesudah !== null) return sesudah - 1;
  return null;
}
