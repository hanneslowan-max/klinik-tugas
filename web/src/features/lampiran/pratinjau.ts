// Pratinjau lampiran (22 Okt 2026): jenis pratinjau per berkas + pengurai CSV/TSV. Fungsi murni (tanpa DOM) supaya bisa
// diuji. Produksi 22 Okt: PNG 178, PDF 104, DOCX 38, CSV 21, TXT 13, JPEG 6 lampiran.
import type { Lampiran } from "@/types/domain";

/**
 * gambar = <img>; pdf = <iframe> di desktop / penampil PDF bawaan HP di tab baru; teks = <pre>; tabel = CSV/TSV;
 * docx = mammoth → HTML tersaring. null = tidak bisa dipratinjau (DOC/XLS/XLSX/PPTX) → Unduh.
 */
export type JenisPratinjau = "gambar" | "pdf" | "teks" | "tabel" | "docx";

const EKSTENSI: Record<string, JenisPratinjau> = {
  png: "gambar",
  jpg: "gambar",
  jpeg: "gambar",
  webp: "gambar",
  gif: "gambar",
  heic: "gambar",
  heif: "gambar",
  pdf: "pdf",
  txt: "teks",
  csv: "tabel",
  tsv: "tabel",
  docx: "docx",
};

const MIME: Record<string, JenisPratinjau> = {
  "application/pdf": "pdf",
  "text/plain": "teks",
  "text/csv": "tabel",
  "text/tab-separated-values": "tabel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Ekstensi dari kolom extension, atau dari judul berkas. */
export function ekstensiLampiran(a: Pick<Lampiran, "extension" | "title">): string {
  return (a.extension || a.title?.match(/\.([A-Za-z0-9]+)$/)?.[1] || "").toLowerCase();
}

/** Jenis pratinjau lampiran; null bila tidak bisa dipratinjau atau berkasnya tidak ada di Storage. */
export function jenisPratinjau(a: Pick<Lampiran, "mimetype" | "extension" | "title" | "storage_path">): JenisPratinjau | null {
  if (!a.storage_path) return null;
  const mime = (a.mimetype ?? "").toLowerCase();
  if (/^image\//.test(mime)) return "gambar";
  // CSV dari Excel Windows sering bertipe application/vnd.ms-excel: ekstensi menentukan
  return EKSTENSI[ekstensiLampiran(a)] ?? MIME[mime] ?? null;
}

/** Berkas teks/tabel lebih besar dari ini tidak diambil untuk pratinjau (lampiran teks produksi maks. ±330 KB). */
export const BATAS_PRATINJAU_TEKS = 2 * 1024 * 1024;
/** Baris tabel yang dirender (sisanya disebut jumlahnya). */
export const BATAS_BARIS_TABEL = 200;

/** Pemisah kolom: tab untuk TSV; CSV → ';' (Excel Indonesia) atau ',' — yang lebih banyak di baris pertama. */
export function tebakPemisah(teks: string, ekstensi: string): string {
  if (ekstensi === "tsv") return "\t";
  const baris = teks.slice(0, teks.search(/\r?\n|$/));
  const hitung = (c: string) => baris.split(c).length - 1;
  return hitung(";") > hitung(",") ? ";" : hitung("\t") > hitung(",") ? "\t" : ",";
}

/**
 * Urai CSV/TSV (RFC 4180: kolom berkutip, "" = kutip, baris baru di dalam kutip). Baris kosong di akhir dibuang.
 * Berhenti sesudah `maks` baris; `total` = jumlah semua baris data.
 */
export function uraiTabel(teks: string, pemisah: string, maks = Infinity): { baris: string[][]; total: number } {
  const isi = teks.charCodeAt(0) === 0xfeff ? teks.slice(1) : teks; // BOM Excel
  const baris: string[][] = [];
  let total = 0;
  let sel = "";
  let kini: string[] = [];
  let kutip = false;
  const tutupBaris = () => {
    kini.push(sel);
    sel = "";
    if (!(kini.length === 1 && kini[0] === "")) {
      total++;
      if (baris.length < maks) baris.push(kini);
    }
    kini = [];
  };
  for (let i = 0; i < isi.length; i++) {
    const c = isi[i];
    if (kutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') {
          sel += '"';
          i++;
        } else kutip = false;
      } else sel += c;
    } else if (c === '"' && sel === "") kutip = true;
    else if (c === pemisah) {
      kini.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && isi[i + 1] === "\n") i++;
      tutupBaris();
    } else sel += c;
  }
  if (sel !== "" || kini.length) tutupBaris();
  return { baris, total };
}
