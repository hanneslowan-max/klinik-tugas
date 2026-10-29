// Tempel biaya iklan dari sheet (cadangan bila Agen Data Harian belum mengirim): teks hasil salin Google Sheets (tab) /
// CSV (koma / titik koma) → item web_pipeline_biaya_iklan_set. Murni (tanpa DOM) supaya bisa diuji.
// Kolom dikenali dari judul (Indonesia/Inggris, huruf besar-kecil bebas): tanggal, campaign, biaya, klik, tayang, konversi.
// Baris total/kosong dilewati dengan alasan; baris ganda (tanggal + campaign sama) dijumlahkan.
import type { ItemBiayaIklan, PlatformIklan } from "@/types/domain";

export type KolomBiaya = "tanggal" | "campaign" | "biaya" | "klik" | "tayang" | "konversi";

const POLA_KOLOM: Record<KolomBiaya, RegExp> = {
  tanggal: /^(tanggal|tgl|date|day|hari)$/,
  campaign: /^(campaign|kampanye|nama campaign|campaign name)$/,
  biaya: /^(biaya|cost|spend|amount spent|amount|biaya \(idr\)|cost \(idr\))$/,
  klik: /^(klik|clicks?)$/,
  tayang: /^(tayang|tayangan|impr\.?|impressions?)$/,
  konversi: /^(konversi|conversions?|conv\.?)$/,
};

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

const iso = (t: number, b: number, h: number): string | null => {
  const d = new Date(Date.UTC(t, b - 1, h));
  if (d.getUTCFullYear() !== t || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== h) return null;
  return d.toISOString().slice(0, 10);
};

/** '2026-10-27' · '27/10/2026' · '27-10-2026' · '27 Okt 2026' · 'Oct 27, 2026' → ISO; selain itu null. */
export function bacaTanggal(teks: string): string | null {
  const s = teks.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2}) ([a-z]+)\.? (\d{4})$/);
  if (m && BULAN[m[2]]) return iso(+m[3], BULAN[m[2]], +m[1]);
  m = s.match(/^([a-z]+)\.? (\d{1,2}) (\d{4})$/);
  if (m && BULAN[m[1]]) return iso(+m[3], BULAN[m[1]], +m[2]);
  return null;
}

/**
 * Angka Indonesia atau Inggris → number ('Rp1.234.567' · '1.234.567,89' · '1,234,567.89' · '423,5' · '423.5' · '1.234').
 * Ada titik & koma → pemisah desimal = yang terakhir. Hanya satu jenis: pola ribuan (1.234 / 1,234,567) dibaca ribuan,
 * selain itu desimal. Kosong / '-' → 0. Tidak terbaca → null.
 */
export function bacaAngka(teks: string): number | null {
  let s = teks.trim().replace(/^rp\.?/i, "").replace(/idr/i, "").replace(/\s/g, "");
  if (s === "" || s === "-" || s === "--") return 0;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const titik = s.lastIndexOf(".");
  const koma = s.lastIndexOf(",");
  if (titik >= 0 && koma >= 0) {
    const desimal = titik > koma ? "." : ",";
    const ribuan = desimal === "." ? "," : ".";
    s = s.split(ribuan).join("").replace(desimal, ".");
  } else if (koma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (titik >= 0) {
    s = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Pisah satu baris CSV sederhana (tanda kutip ganda didukung). */
function pecahBaris(baris: string, pemisah: string): string[] {
  const hasil: string[] = [];
  let sel = "";
  let kutip = false;
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (kutip) {
      if (c === '"' && baris[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) { hasil.push(sel); sel = ""; }
    else sel += c;
  }
  hasil.push(sel);
  return hasil.map((x) => x.trim());
}

export type HasilTempel = {
  items: ItemBiayaIklan[];
  /** baris yang dilewati (nomor baris teks, mulai 1) */
  lewati: { baris: number; alasan: string }[];
  kolom: Partial<Record<KolomBiaya, number>>;
  /** galat yang membatalkan seluruh tempelan (judul kolom tidak lengkap, dsb.) */
  galat: string | null;
};

/** Baca teks tempelan → item per (tanggal, campaign) untuk satu platform. */
export function bacaTempelan(teks: string, platform: PlatformIklan): HasilTempel {
  const baris = teks.replace(/\r\n?/g, "\n").split("\n");
  const iJudul = baris.findIndex((b) => b.trim() !== "");
  const kosong: HasilTempel = { items: [], lewati: [], kolom: {}, galat: null };
  if (iJudul < 0) return { ...kosong, galat: "Tempelan kosong." };
  const judul = baris[iJudul];
  const pemisah = judul.includes("\t") ? "\t" : (judul.split(";").length > judul.split(",").length ? ";" : ",");
  const kolom: Partial<Record<KolomBiaya, number>> = {};
  pecahBaris(judul, pemisah).forEach((j, i) => {
    const n = j.toLowerCase().replace(/\s+/g, " ").trim();
    for (const k of Object.keys(POLA_KOLOM) as KolomBiaya[]) if (kolom[k] == null && POLA_KOLOM[k].test(n)) kolom[k] = i;
  });
  const kurang = (["tanggal", "campaign", "biaya"] as const).filter((k) => kolom[k] == null);
  if (kurang.length) {
    return { ...kosong, kolom, galat: `Kolom wajib tidak ditemukan di baris judul: ${kurang.join(", ")}. Judul yang dikenali: tanggal/date, campaign/kampanye, biaya/cost.` };
  }
  const gabung = new Map<string, ItemBiayaIklan>();
  const lewati: HasilTempel["lewati"] = [];
  for (let i = iJudul + 1; i < baris.length; i++) {
    if (baris[i].trim() === "") continue;
    const sel = pecahBaris(baris[i], pemisah);
    const ambil = (k: KolomBiaya) => (kolom[k] == null ? "" : (sel[kolom[k]!] ?? ""));
    const campaign = ambil("campaign").replace(/\s+/g, " ").trim();
    const tglTeks = ambil("tanggal");
    if (/^(total|jumlah|grand total)/i.test(campaign) || /^(total|jumlah)/i.test(tglTeks)) {
      lewati.push({ baris: i + 1, alasan: "baris total" });
      continue;
    }
    const tanggal = bacaTanggal(tglTeks);
    if (!tanggal) { lewati.push({ baris: i + 1, alasan: `tanggal tidak terbaca: "${tglTeks}"` }); continue; }
    if (!campaign) { lewati.push({ baris: i + 1, alasan: "campaign kosong" }); continue; }
    if (campaign.length > 120) { lewati.push({ baris: i + 1, alasan: "nama campaign lebih dari 120 karakter" }); continue; }
    const biaya = bacaAngka(ambil("biaya"));
    const klik = bacaAngka(ambil("klik"));
    const tayang = bacaAngka(ambil("tayang"));
    const konversi = bacaAngka(ambil("konversi"));
    if (biaya == null || biaya < 0) { lewati.push({ baris: i + 1, alasan: `biaya tidak terbaca: "${ambil("biaya")}"` }); continue; }
    if (klik == null || klik < 0 || tayang == null || tayang < 0 || konversi == null || konversi < 0) {
      lewati.push({ baris: i + 1, alasan: "klik/tayang/konversi tidak terbaca" });
      continue;
    }
    const kunci = `${tanggal}|${campaign.toLowerCase()}`;
    const lama = gabung.get(kunci);
    if (lama) {
      lama.biaya += biaya;
      lama.klik = (lama.klik ?? 0) + Math.round(klik);
      lama.tayang = (lama.tayang ?? 0) + Math.round(tayang);
      lama.konversi = (lama.konversi ?? 0) + konversi;
    } else {
      gabung.set(kunci, { tanggal, platform, campaign, biaya, klik: Math.round(klik), tayang: Math.round(tayang), konversi });
    }
  }
  // server menerima maks 2 desimal
  const items = [...gabung.values()].map((x) => ({
    ...x,
    biaya: Math.round(x.biaya * 100) / 100,
    konversi: Math.round((x.konversi ?? 0) * 100) / 100,
  }));
  items.sort((a, b) => (a.tanggal === b.tanggal ? a.campaign.localeCompare(b.campaign) : a.tanggal < b.tanggal ? -1 : 1));
  return { items, lewati, kolom, galat: items.length ? null : "Tidak ada baris yang bisa dibaca." };
}

/**
 * Pecah item menjadi kiriman ≤ maks item TANPA memisah satu (tanggal, platform): server memperlakukan item per
 * (tanggal, platform) sebagai keadaan lengkap hari itu, jadi satu hari yang terbelah akan menghapus separuhnya.
 */
export function pecahKiriman(items: ItemBiayaIklan[], maks = 1000): ItemBiayaIklan[][] {
  const perHari = new Map<string, ItemBiayaIklan[]>();
  for (const x of items) {
    const k = `${x.tanggal}|${x.platform}`;
    perHari.set(k, [...(perHari.get(k) ?? []), x]);
  }
  const kiriman: ItemBiayaIklan[][] = [];
  let kini: ItemBiayaIklan[] = [];
  for (const hari of perHari.values()) {
    if (kini.length && kini.length + hari.length > maks) { kiriman.push(kini); kini = []; }
    kini = [...kini, ...hari];
  }
  if (kini.length) kiriman.push(kini);
  return kiriman;
}
