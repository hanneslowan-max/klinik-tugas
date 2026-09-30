// Laporan sinkron (Admin › Sinkron) → tabel berlabel Bahasa Indonesia. Fungsi murni (tanpa React) supaya bisa diuji.
// counts dari impor/sinkron.mjs (runSelesai): jumlah (tugas/komentar/anggota/list), tulis {entitas: {inserted, updated,
// unchanged, gagal, …}}, lampiran {ok, gagal, …}, hilang {entitas: {ditandai, ids}} | teks, clickup {permintaan, r429, …},
// space_privat [..], muat, only, durasi_detik. Kunci yang belum dikenal tetap tampil dengan label yang dirapikan
// (tidak pernah "[object Object]").
import { fmtWaktu } from "@/lib/tanggal";
import type { RunSinkron } from "@/types/domain";

type Peta = Readonly<Record<string, string>>;

export const NAMA_ENTITAS: Peta = {
  tasks: "Tugas", lists: "List", spaces: "Space", folders: "Folder", members: "Anggota", comments: "Komentar",
  attachments: "Lampiran", list_statuses: "Status list", space_anggota: "Anggota space privat", workspace: "Ruang kerja",
  sync_raw: "Arsip data mentah", tags: "Label", checklists: "Checklist",
};
export const NAMA_KOLOM: Peta = {
  inserted: "Baru", updated: "Diubah", unchanged: "Tetap", ditambah: "Ditambah", dibuang: "Dibuang", dihapus: "Dihapus",
  gagal: "Gagal", ditandai: "Ditandai hilang", ok: "Tersalin", sudah_ada: "Sudah ada", tautan_saja: "Hanya tautan",
  dilewati: "Dilewati",
};
// kolom utama tabel entitas; kunci angka lain (ditambah/dibuang/dihapus …) digabung ke kolom "Lainnya"
const KOLOM_UTAMA = ["inserted", "updated", "unchanged", "ditandai", "gagal"];
const URUT_LAIN = ["ditambah", "dibuang", "dihapus"];
const urutLain = (a: string, b: string) =>
  (URUT_LAIN.indexOf(a) + 1 || 99) - (URUT_LAIN.indexOf(b) + 1 || 99) || a.localeCompare(b);
// ukuran sensus (KUNCI_SENSUS impor/sinkron.mjs) & fase galat importer
export const NAMA_SENSUS: Peta = {
  "(list)": "List", tasks_total: "Jumlah tugas", open: "Tugas terbuka", closed: "Tugas selesai", archived: "Tugas diarsip",
  subtasks: "Sub-tugas", comments_top: "Komentar", replies: "Balasan", reply_count_sum: "Jumlah balasan (hitungan ClickUp)",
  attachments_task: "Lampiran tugas", attachments_comment: "Lampiran komentar", assignee_links: "Penugasan",
  sha_ids_tasks: "Sidik ID tugas", sha_ids_comments: "Sidik ID komentar",
};
export const NAMA_FASE: Peta = {
  fatal: "fatal", email_anggota: "email anggota", space_anggota: "anggota space", anggota_list: "anggota list",
  time_in_status: "riwayat status", tugas_detail: "detail tugas", lampiran: "lampiran",
};
export const NAMA_UKURAN: Peta = {
  muat: "Jenis muat", only: "Cakupan", list: "List", tugas: "Tugas", komentar: "Komentar", anggota: "Anggota",
  anggota_nonaktif: "Anggota nonaktif", durasi_detik: "Durasi", lampiran: "Lampiran",
  permintaan: "Permintaan ke ClickUp", r429: "Kena batas (HTTP 429)", ulang: "Permintaan diulang", unduh: "Berkas diunduh",
  tunggu_ms: "Waktu tunggu batas", rpm: "Batas per menit",
};
const NILAI_MUAT: Peta = { sinkron: "sinkron (perbarui data)", impor: "impor awal" };
const PETA_NILAI: Peta = { ...NAMA_KOLOM, ...NAMA_UKURAN, ...NAMA_ENTITAS };
const PETA_RINGKASAN: Peta = { ...NAMA_UKURAN, ...NAMA_ENTITAS };

export type Objek = Record<string, unknown>;

export const objekBiasa = (v: unknown): v is Objek => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Objek berisi angka saja (mis. {"inserted": 3, "updated": 0}) → ditabelkan, bukan diringkas. */
const objekAngka = (v: unknown): v is Objek =>
  objekBiasa(v) && Object.values(v).length > 0 && Object.values(v).every((n) => typeof n === "number" || n === null);

/** "anggota_nonaktif" → "Anggota nonaktif". */
export function rapikan(k: string): string {
  const t = k.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Label dari peta (kunci milik peta sendiri saja, bukan "constructor" dsb.), selain itu kunci dirapikan. */
export function labelDari(peta: Peta, k: unknown): string {
  if (typeof k !== "string") return teksNilai(k);
  return Object.hasOwn(peta, k) ? peta[k] : rapikan(k);
}

export const angka = (n: number) => n.toLocaleString("id-ID");

/** Nilai apa pun → teks pendek berbahasa Indonesia (objek → "Label n · Label n", array → jumlah butir). */
export function teksNilai(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return angka(v);
  if (Array.isArray(v)) return `${angka(v.length)} butir`;
  if (typeof v === "object") {
    return Object.entries(v).map(([k, x]) => `${labelDari(PETA_NILAI, k)} ${teksNilai(x)}`).join(" · ") || "—";
  }
  return String(v);
}

/** ID (space/list) apa adanya — angka TIDAK diberi pemisah ribuan. */
function teksId(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? teksNilai(v) : String(v);
}

/** Pesan galat importer (teks log teknis apa adanya); objek → JSON, bukan "[object Object]". */
function teksPesan(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 45 → "45 detik"; 125 → "2 menit 5 detik"; 3725 → "1 jam 2 menit". */
export function fmtDurasi(detik: number): string {
  const d = Math.max(0, Math.round(detik));
  if (d < 60) return `${d} detik`;
  const jam = Math.floor(d / 3600);
  const menit = Math.floor((d % 3600) / 60);
  if (jam) return menit ? `${jam} jam ${menit} menit` : `${jam} jam`;
  const sisa = d % 60;
  return sisa ? `${menit} menit ${sisa} detik` : `${menit} menit`;
}

// ------------------------------------------------------------------ tabel

/** Angka bermasalah (gagal / ditandai hilang / HTTP 429 > 0) → sel merah. */
export class AngkaBuruk {
  constructor(readonly n: number) {}
}
const tandaiBuruk = (n: unknown) => (typeof n === "number" && n > 0 ? new AngkaBuruk(n) : n);

export type SelTabel = { teks: string; angka: boolean; nol: boolean; buruk: boolean };
export type KepalaTabel = { teks: string; angka: boolean };
export type TabelAngka = { uji: string; kepala: KepalaTabel[]; baris: { label: string; sel: SelTabel[] }[] };
/** [label baris, ...nilai sel] */
export type BarisMentah = readonly [string, ...unknown[]];

/**
 * Tabel: kolom pertama = label baris (th); kolom angka rata kanan (kolomAngka = true/false atau array per kolom
 * sesudah kolom pertama); sel AngkaBuruk = angka bermasalah (merah).
 */
export function tabelAngka(
  kepala: readonly string[],
  baris: readonly BarisMentah[],
  uji: string,
  { kolomAngka = true }: { kolomAngka?: boolean | readonly boolean[] } = {},
): TabelAngka {
  const angkaKah = (i: number) => (typeof kolomAngka === "boolean" ? kolomAngka : Boolean(kolomAngka[i]));
  return {
    uji,
    kepala: kepala.map((teks, i) => ({ teks, angka: i > 0 && angkaKah(i - 1) })),
    baris: baris.map(([label, ...sel]) => ({
      label,
      sel: sel.map((isi, i) => {
        const buruk = isi instanceof AngkaBuruk;
        const n = isi instanceof AngkaBuruk ? isi.n : isi;
        return { teks: teksNilai(n), angka: typeof n === "number" && angkaKah(i), nol: n === 0, buruk };
      }),
    })),
  };
}

/** {entitas: {kolom: n}} → tabel Entitas × kolom utama (Baru/Diubah/Tetap/Ditandai/Gagal) + "Lainnya" (teks). */
export function tabelEntitas(obj: unknown, uji: string, judulKolom = "Data"): TabelAngka | null {
  const rows = objekBiasa(obj) ? Object.entries(obj).filter((e): e is [string, Objek] => objekBiasa(e[1])) : [];
  if (!rows.length) return null;
  const angkaDari = (v: Objek) => Object.keys(v).filter((k) => k !== "ids" && (typeof v[k] === "number" || v[k] === null));
  const semua = new Set(rows.flatMap(([, v]) => angkaDari(v)));
  const utama = KOLOM_UTAMA.filter((k) => semua.has(k));
  const adaLain = [...semua].some((k) => !utama.includes(k));
  return tabelAngka(
    [judulKolom, ...utama.map((k) => labelDari(NAMA_KOLOM, k)), ...(adaLain ? ["Lainnya"] : [])],
    rows.map(([e, v]): BarisMentah => {
      const lain = angkaDari(v)
        .filter((k) => !utama.includes(k) && v[k])
        .sort(urutLain)
        .map((k) => `${labelDari(NAMA_KOLOM, k)} ${teksNilai(v[k])}`);
      return [
        labelDari(NAMA_ENTITAS, e),
        ...utama.map((k) => {
          const n = v[k] ?? 0;
          return k === "gagal" || k === "ditandai" ? tandaiBuruk(n) : n;
        }),
        ...(adaLain ? [lain.join(" · ") || "—"] : []),
      ];
    }),
    uji,
    { kolomAngka: [...utama.map(() => true), false] },
  );
}

/** Baris tabel "Ringkasan" (ukuran → nilai). Objek angka tidak ikut (ditabelkan di "Data ditulis"). */
export function ringkasanRun(c: Objek): BarisMentah[] {
  const baris: BarisMentah[] = [];
  const dipakai = new Set(["tulis", "lampiran", "hilang", "clickup", "space_privat"]);
  const tambah = (k: string, nilai: unknown) => {
    if (!Object.hasOwn(c, k)) return;
    baris.push([labelDari(NAMA_UKURAN, k), nilai]);
    dipakai.add(k);
  };
  const muat = typeof c.muat === "string" && Object.hasOwn(NILAI_MUAT, c.muat) ? NILAI_MUAT[c.muat] : c.muat;
  tambah("muat", muat || "—");
  tambah(
    "only",
    Array.isArray(c.only) && c.only.length
      ? `${angka(c.only.length)} list terpilih (${c.only.map(teksId).join(", ")})`
      : "semua list",
  );
  for (const k of ["list", "tugas", "komentar", "anggota", "anggota_nonaktif"]) tambah(k, c[k]);
  if (typeof c.lampiran === "number") baris.push([labelDari(NAMA_UKURAN, "lampiran"), c.lampiran]);
  tambah("durasi_detik", typeof c.durasi_detik === "number" ? fmtDurasi(c.durasi_detik) : c.durasi_detik);
  // kunci lain yang belum dikenal: tetap ditampilkan (teks); objek angka ditabelkan di bawah
  for (const [k, v] of Object.entries(c)) {
    if (dipakai.has(k) || objekAngka(v)) continue;
    baris.push([labelDari(PETA_RINGKASAN, k), v]);
  }
  return baris;
}

// ------------------------------------------------------------------ satu run

export type ButirGalat = { konteks: string | null; pesan: string };

export type BagianRun =
  | { jenis: "tabel"; judul: string; tabel: TabelAngka; catatan?: string }
  | { jenis: "teks"; judul: string; uji: string; teks: string }
  | { jenis: "galat"; judul: string; uji: string; butir: ButirGalat[]; catatan?: string };

export type RincianRun = {
  id: number;
  judul: string;
  jumlahGalat: number;
  jumlahSelisih: number;
  waktu: string;
  bagian: BagianRun[];
  /** rincian teknis (JSON mentah counts/census/diffs/errors) */
  json: string;
};

const MAKS_GALAT = 20;
const MAKS_SELISIH = 50;

/** Konteks galat berlabel Indonesia; pesannya = log teknis importer apa adanya (bisa berisi path API ClickUp). */
export function butirGalat(g: unknown): ButirGalat {
  if (!objekBiasa(g)) return { konteks: null, pesan: teksPesan(g) ?? "tanpa pesan" };
  const konteks = [
    g.task_id ? `tugas ${teksId(g.task_id)}` : null,
    !g.task_id && g.jenis && g.id ? `${labelDari(NAMA_ENTITAS, g.jenis).toLowerCase()} ${teksId(g.id)}` : null,
    g.fase ? `tahap ${labelDari(NAMA_FASE, g.fase).toLowerCase()}` : null,
    !g.task_id && !g.jenis && g.id ? `id ${teksId(g.id)}` : null,
    g.status ? `HTTP ${teksId(g.status)}` : null,
  ].filter(Boolean);
  return { konteks: konteks.join(" · ") || null, pesan: teksPesan(g.err) ?? teksPesan(g.message) ?? "tanpa pesan" };
}

const pendekkan = (v: unknown) => (typeof v === "string" && v.length > 16 ? `${v.slice(0, 12)}…` : v);

export function rincianRun(x: RunSinkron): RincianRun {
  const c: Objek = objekBiasa(x.counts) ? x.counts : {};
  const galat: unknown[] = Array.isArray(x.errors) ? x.errors : [];
  const selisih: unknown[] = Array.isArray(x.diffs)
    ? x.diffs
    : objekBiasa(x.diffs) && Array.isArray(x.diffs.selisih)
      ? x.diffs.selisih
      : [];
  const bagian: BagianRun[] = [];

  const ringkas = ringkasanRun(c);
  if (ringkas.length) {
    bagian.push({ jenis: "tabel", judul: "Ringkasan", tabel: tabelAngka(["Ukuran", "Nilai"], ringkas, "sinkron-ringkasan", { kolomAngka: false }) });
  }

  // entitas di level atas (bentuk lama/seed: {"tasks": {"inserted": …}}) digabung dengan counts.tulis
  const entitasAtas = Object.fromEntries(
    Object.entries(c).filter(([k, v]) => !["tulis", "hilang", "lampiran", "clickup"].includes(k) && objekAngka(v)),
  );
  const tulis = tabelEntitas({ ...entitasAtas, ...(objekBiasa(c.tulis) ? c.tulis : {}) }, "sinkron-tulis");
  if (tulis) bagian.push({ jenis: "tabel", judul: "Data ditulis ke aplikasi", tabel: tulis });

  if (objekBiasa(c.lampiran)) {
    const baris = Object.entries(c.lampiran).map(([k, v]): BarisMentah => [labelDari(NAMA_KOLOM, k), k === "gagal" ? tandaiBuruk(v) : v]);
    bagian.push({ jenis: "tabel", judul: "Salin lampiran", tabel: tabelAngka(["Hasil", "Jumlah"], baris, "sinkron-lampiran") });
  }

  const judulHilang = "Ditandai hilang di ClickUp";
  if (typeof c.hilang === "string") {
    bagian.push({ jenis: "teks", judul: judulHilang, uji: "sinkron-hilang", teks: c.hilang });
  } else if (objekBiasa(c.hilang)) {
    const t = tabelEntitas(c.hilang, "sinkron-hilang");
    // tanpa baris entitas (mis. {"dilewati": "mode uji"}) → tetap tampil sebagai teks
    if (t) bagian.push({ jenis: "tabel", judul: judulHilang, tabel: t });
    else if (Object.keys(c.hilang).length) bagian.push({ jenis: "teks", judul: judulHilang, uji: "sinkron-hilang", teks: teksNilai(c.hilang) });
  }

  if (Array.isArray(c.space_privat) && c.space_privat.length) {
    const baris = c.space_privat.map((sp): BarisMentah => {
      const o: Objek = objekBiasa(sp) ? sp : {};
      return [teksId(o.space_id), o.list ?? 0, o.anggota ?? 0, o.ok === false ? "tidak lengkap (tidak dikirim)" : "ok"];
    });
    bagian.push({
      jenis: "tabel",
      judul: "Anggota space privat",
      tabel: tabelAngka(["Space", "List dibaca", "Anggota", "Hasil"], baris, "sinkron-space", { kolomAngka: [true, true, false] }),
    });
  }

  if (objekBiasa(c.clickup) && Object.keys(c.clickup).length) {
    const baris = Object.entries(c.clickup).map(([k, v]): BarisMentah => [
      labelDari(NAMA_UKURAN, k),
      k === "tunggu_ms" && typeof v === "number"
        ? `${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} detik`
        : k === "r429"
          ? tandaiBuruk(v)
          : v,
    ]);
    bagian.push({ jenis: "tabel", judul: "Pemakaian API ClickUp", tabel: tabelAngka(["Ukuran", "Nilai"], baris, "sinkron-clickup", { kolomAngka: false }) });
  }

  if (galat.length) {
    bagian.push({
      jenis: "galat",
      judul: `Galat (${angka(galat.length)})`,
      uji: "sinkron-galat",
      butir: galat.slice(0, MAKS_GALAT).map(butirGalat),
      catatan: galat.length > MAKS_GALAT ? `… ${angka(galat.length - MAKS_GALAT)} galat lain ada di rincian teknis.` : undefined,
    });
  }

  if (selisih.length) {
    const baris = selisih.slice(0, MAKS_SELISIH).map((d): BarisMentah =>
      objekBiasa(d)
        ? [teksId(d.list_id), labelDari(NAMA_SENSUS, d.kunci ?? "—"), pendekkan(d.clickup ?? "—"), pendekkan(d.db ?? "—")]
        : [teksId(d), "—", "—", "—"],
    );
    bagian.push({
      jenis: "tabel",
      judul: `Selisih sensus (${angka(selisih.length)})`,
      tabel: tabelAngka(["List", "Ukuran", "ClickUp", "Aplikasi"], baris, "sinkron-selisih", { kolomAngka: false }),
      catatan: selisih.length > MAKS_SELISIH ? `… ${angka(selisih.length - MAKS_SELISIH)} selisih lain ada di rincian teknis.` : undefined,
    });
  }

  return {
    id: x.id,
    judul: `#${x.id} · ${x.mode === "uji" ? "uji (tanpa tandai hilang)" : x.mode}`,
    jumlahGalat: galat.length,
    jumlahSelisih: selisih.length,
    waktu: `Mulai ${fmtWaktu(x.started_at)} · ${x.finished_at ? `selesai ${fmtWaktu(x.finished_at)}` : "belum selesai"}`,
    bagian,
    json: JSON.stringify({ counts: x.counts, census: x.census, diffs: x.diffs, errors: x.errors }, null, 2),
  };
}
