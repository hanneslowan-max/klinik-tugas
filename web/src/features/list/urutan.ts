// Susunan kartu Board & orderindex sesudah seret. Fungsi murni supaya bisa diuji.
import { urutanDiAntara } from "@/features/tugas/util";
import type { StatusList, Tugas } from "@/types/domain";

/** status → id kartu yang tampak di kolom itu (berurutan). */
export type Susunan = Record<string, string[]>;

/** Status diurutkan menurut orderindex (urutan kolom Board / grup Daftar). */
export function urutStatus(statuses: StatusList[]): StatusList[] {
  return [...statuses].sort((a, b) => a.orderindex - b.orderindex);
}

/** Kolom closed/done: kartunya disembunyikan kecuali filter "Tampilkan selesai" (tetap bisa menerima kartu). */
export function statusSelesai(s: Pick<StatusList, "type">): boolean {
  return s.type === "closed" || s.type === "done";
}

/** Susunan awal dari data server (urutan tugas dari web_daftar dipertahankan). */
export function susunanDari(statuses: StatusList[], tampak: Tugas[], tampilSelesai: boolean): Susunan {
  const hasil: Susunan = {};
  for (const s of statuses) {
    hasil[s.status] = statusSelesai(s) && !tampilSelesai ? [] : tampak.filter((t) => t.status === s.status).map((t) => t.id);
  }
  return hasil;
}

/** Kolom (status) tempat kartu berada, atau undefined. */
export function kolomKartu(susunan: Susunan, id: string): string | undefined {
  return Object.keys(susunan).find((s) => susunan[s].includes(id));
}

/** orderindex kartu sebagai angka (DB numeric bisa datang sebagai string); null bila belum ada. */
export function nilaiUrut(t: Pick<Tugas, "orderindex"> | undefined): number | null {
  if (!t || t.orderindex === null || t.orderindex === undefined || t.orderindex === "") return null;
  const n = Number(t.orderindex);
  return Number.isFinite(n) ? n : null;
}

export type RencanaUrut = {
  /** orderindex baru kartu yang diseret (di antara tetangga); null bila tetangga tidak punya urutan */
  orderindex: number | null;
  /** penomoran ulang kolom (hanya bila diurutkan di kolom yang sama dan tetangga belum punya orderindex) */
  penomoran: { id: string; orderindex: number }[];
};

/**
 * Rencana urutan sesudah kartu `id` dilepas di `kolom` (id berurutan, termasuk kartu itu sendiri).
 * orderindex = di antara tetangga. Tetangga tanpa orderindex + diurutkan di kolom yang sama → kartu yang boleh
 * diubah diberi nomor (i+1)*1000 menurut urutan baru (sama dengan web lama). Pindah kolom tanpa tetangga
 * berurutan → hanya status yang berubah.
 */
export function rencanaUrut(
  kolom: string[],
  id: string,
  peta: ReadonlyMap<string, Tugas>,
  pindahKolom: boolean,
  terkunci: (t: Tugas) => boolean,
): RencanaUrut {
  const i = kolom.indexOf(id);
  const sebelum = i > 0 ? nilaiUrut(peta.get(kolom[i - 1])) : null;
  const sesudah = i >= 0 && i < kolom.length - 1 ? nilaiUrut(peta.get(kolom[i + 1])) : null;
  const orderindex = urutanDiAntara(sebelum, sesudah);
  if (orderindex !== null || pindahKolom) return { orderindex, penomoran: [] };
  const bebas = kolom.filter((x) => {
    const t = peta.get(x);
    return t !== undefined && !terkunci(t);
  });
  return { orderindex: null, penomoran: bebas.map((x, j) => ({ id: x, orderindex: (j + 1) * 1000 })) };
}
