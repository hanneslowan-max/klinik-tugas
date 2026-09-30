// Filter layar List/Board (tersimpan di URL, sama dengan web lama):
//   ?v=board · a=<member id>|saya|kosong · s=<status> · d=telat|hari_ini|tiga_hk|tanpa_due · selesai=1
// Fungsi murni (tanpa DOM) supaya bisa diuji.
import { kategoriDue } from "@/lib/tanggal";
import type { Tugas } from "@/types/domain";

export type ModeList = "daftar" | "board";
export type FilterDue = "" | "telat" | "hari_ini" | "tiga_hk" | "tanpa_due";

export type FilterList = {
  /** '' semua · 'saya' · 'kosong' (tanpa assignee) · id anggota */
  a: string;
  /** '' semua · nama status */
  s: string;
  d: FilterDue;
  selesai: boolean;
};

export const PILIHAN_DUE: readonly { v: FilterDue; label: string }[] = [
  { v: "", label: "Semua due" },
  { v: "telat", label: "Telat" },
  { v: "hari_ini", label: "Hari ini" },
  { v: "tiga_hk", label: "≤3 hari kerja" },
  { v: "tanpa_due", label: "Tanpa due" },
];

const NILAI_DUE = new Set<string>(PILIHAN_DUE.map((p) => p.v));

type BacaParam = { get(nama: string): string | null };

export function bacaMode(q: BacaParam): ModeList {
  return q.get("v") === "board" ? "board" : "daftar";
}

export function bacaFilter(q: BacaParam): FilterList {
  const d = q.get("d") ?? "";
  return {
    a: q.get("a") ?? "",
    s: q.get("s") ?? "",
    d: (NILAI_DUE.has(d) ? d : "") as FilterDue,
    selesai: q.get("selesai") === "1",
  };
}

/** URL layar list dengan mode + filter (parameter kosong tidak ditulis; urutan sama dengan web lama). */
export function urlList(listId: string, mode: ModeList, f: FilterList): string {
  const u = new URLSearchParams();
  const g: [string, string][] = [
    ["v", mode === "board" ? "board" : ""],
    ["a", f.a],
    ["s", f.s],
    ["d", f.d],
    ["selesai", f.selesai ? "1" : ""],
  ];
  for (const [k, v] of g) if (v) u.set(k, v);
  const s = u.toString();
  return `/l/${encodeURIComponent(listId)}${s ? `?${s}` : ""}`;
}

/** Jumlah filter aktif (ringkasan "n aktif" di Board). */
export function jumlahFilterAktif(f: FilterList): number {
  return [f.a, f.s, f.d, f.selesai].filter(Boolean).length;
}

/** Kartu lolos filter assignee/status/due. Filter "selesai" diterapkan lewat p_include_closed & kolom tersembunyi. */
export function lolosFilter(t: Tugas, f: FilterList, idSaya: number, hariIni: string, libur?: ReadonlySet<string>): boolean {
  if (f.a === "saya" && !t.assignees.some((x) => Number(x.id) === idSaya)) return false;
  if (f.a === "kosong" && t.assignees.length) return false;
  if (f.a && f.a !== "saya" && f.a !== "kosong" && !t.assignees.some((x) => String(x.id) === f.a)) return false;
  if (f.s && t.status !== f.s) return false;
  if (f.d && kategoriDue(t, hariIni, libur) !== f.d) return false;
  return true;
}
