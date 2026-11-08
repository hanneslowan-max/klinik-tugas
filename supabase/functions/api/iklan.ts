// Klik iklan Google → ORDER (migrasi 20261108120000_iklan_klik.sql). Bagian MURNI rute /x/iklan/* (tanpa Deno API,
// tanpa jaringan) supaya bisa diuji Node langsung: uji/iklan/jalankan.mjs. Sintaks TypeScript yang bisa dihapus saja
// (tanpa enum / parameter property) karena Node menjalankan berkas ini dengan type stripping.
//
// - asalIklanBoleh: allow-list origin KHUSUS rute penerima klik (dua situs). CORS rute lain tidak berubah.
// - normalKlik    : validasi + normalisasi kiriman situs (cermin aturan inti_iklan_klik_catat; DB tetap memeriksa ulang).
// - buatEmber     : batas laju per isolate per kunci kasar (origin / jenis rute). Tidak menyimpan IP.
// - tokenUnggahCocok: token CSV dari Authorization Bearer ATAU Basic (password = token), dibandingkan waktu-konstan.
// - csvUnggah     : CSV impor konversi offline Google Ads.

type Obj = Record<string, unknown>;

export const PATH_KLIK = "/x/iklan/klik";
export const MAKS_BODY_KLIK = 2048;

export const ASAL_IKLAN: ReadonlySet<string> = new Set([
  "https://rodahammerindo.com",
  "https://www.rodahammerindo.com",
  "https://palletmeshindonesia.com",
  "https://www.palletmeshindonesia.com",
]);

export function asalIklanBoleh(origin: string | null | undefined): boolean {
  return typeof origin === "string" && ASAL_IKLAN.has(origin);
}

const DOMAIN = ["rodahammerindo.com", "palletmeshindonesia.com"] as const;
const KUNCI_KLIK = new Set(["kode", "id_klik", "jenis_id", "waktu_klik", "domain", "halaman"]);
const POLA_KODE = /^GA-(RH|OY)-[A-Z0-9]{4}$/;
const POLA_ID = /^[A-Za-z0-9_.~-]{8,200}$/;
const POLA_WAKTU = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$/;
// deno-lint-ignore no-control-regex -- sengaja menolak spasi & karakter kontrol di path
const POLA_HALAMAN = /^\/[^\s\x00-\x1f\x7f]*$/;

export interface Klik {
  kode: string;
  id_klik: string;
  jenis_id: "gclid" | "gbraid" | "wbraid";
  waktu_klik: string | null; // ISO UTC; null = waktu server (DB now())
  domain: (typeof DOMAIN)[number];
  halaman: string;
}

export type HasilKlik = { ok: true; klik: Klik } | { ok: false; pesan: string };

const tolak = (pesan: string): HasilKlik => ({ ok: false, pesan });

/**
 * Validasi kiriman situs. `origin` (header Origin yang sudah lolos asalIklanBoleh) wajib sedomain dengan field domain:
 * situs RH tidak bisa mencatat kode OY dan sebaliknya. `sekarang` = ms epoch (disuntik untuk tes).
 */
export function normalKlik(b: unknown, opsi: { origin?: string | null; sekarang?: number } = {}): HasilKlik {
  if (!b || typeof b !== "object" || Array.isArray(b)) return tolak("Body harus objek JSON");
  const o = b as Obj;
  for (const k of Object.keys(o)) {
    if (!KUNCI_KLIK.has(k)) return tolak(`Kunci tidak dikenal: ${k}`);
    if (o[k] !== null && o[k] !== undefined && typeof o[k] !== "string") return tolak(`${k} harus teks`);
  }
  const teks = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");

  const kode = teks("kode").toUpperCase();
  if (!POLA_KODE.test(kode)) return tolak("kode harus berformat GA-RH-XXXX atau GA-OY-XXXX");
  const id = teks("id_klik");
  if (!POLA_ID.test(id)) return tolak("id_klik tidak sah (8–200 karakter huruf/angka/_.~-)");
  const jenis = teks("jenis_id").toLowerCase();
  if (jenis !== "gclid" && jenis !== "gbraid" && jenis !== "wbraid") return tolak("jenis_id harus gclid, gbraid, atau wbraid");
  const domain = teks("domain").toLowerCase().replace(/^www\./, "");
  if (domain !== DOMAIN[0] && domain !== DOMAIN[1]) return tolak("domain harus rodahammerindo.com atau palletmeshindonesia.com");
  if ((domain === "rodahammerindo.com") !== kode.startsWith("GA-RH-")) return tolak(`kode ${kode} tidak cocok dengan domain ${domain}`);
  if (opsi.origin !== undefined && opsi.origin !== null) {
    let host = "";
    try { host = new URL(opsi.origin).hostname.replace(/^www\./, ""); } catch { /* host kosong → ditolak */ }
    if (host !== domain) return tolak(`domain ${domain} tidak cocok dengan asal permintaan`);
  }

  let waktu: string | null = null;
  const w = teks("waktu_klik");
  if (w) {
    if (!POLA_WAKTU.test(w)) return tolak("waktu_klik harus waktu ISO dengan zona, mis. 2026-11-08T10:15:00+07:00");
    const t = Date.parse(w.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00"));
    if (!Number.isFinite(t)) return tolak("waktu_klik tidak valid");
    const now = opsi.sekarang ?? Date.now();
    if (t > now + 5 * 60_000 || t < now - 3 * 86_400_000) return tolak("waktu_klik di luar rentang (3 hari lalu s/d sekarang)");
    waktu = new Date(t).toISOString();
  }

  let hal = (typeof o.halaman === "string" ? o.halaman : "").split("#")[0].split("?")[0].slice(0, 300);
  if (hal === "") hal = "/";
  if (!POLA_HALAMAN.test(hal)) return tolak('halaman harus path yang diawali "/" tanpa spasi');

  return {
    ok: true,
    klik: { kode, id_klik: id, jenis_id: jenis as Klik["jenis_id"], waktu_klik: waktu, domain: domain as Klik["domain"], halaman: hal },
  };
}

/** Bentuk p untuk x_iklan_klik_catat (waktu_klik null → tidak dikirim, DB memakai now()). */
export function argKlik(k: Klik): Obj {
  const { waktu_klik, ...sisa } = k;
  return waktu_klik ? { ...sisa, waktu_klik } : sisa;
}

/**
 * Ember token per kunci (per isolate, bukan global lintas instance): `kapasitas` permintaan sekaligus, isi ulang
 * `perMenit`. Kunci = origin / nama rute (kasar, tanpa IP). `jam` disuntik untuk tes.
 */
export function buatEmber(kapasitas: number, perMenit: number, jam: () => number = Date.now) {
  const isi = new Map<string, { n: number; t: number }>();
  const perMs = perMenit / 60_000;
  return function ambil(kunci: string): { ok: boolean; tunggu: number } {
    const now = jam();
    if (isi.size > 1000) for (const [k, v] of isi) if (now - v.t > 600_000) isi.delete(k);
    const e = isi.get(kunci) ?? { n: kapasitas, t: now };
    e.n = Math.min(kapasitas, e.n + (now - e.t) * perMs);
    e.t = now;
    isi.set(kunci, e);
    if (e.n >= 1) {
      e.n -= 1;
      return { ok: true, tunggu: 0 };
    }
    return { ok: false, tunggu: Math.ceil((1 - e.n) / perMs) };
  };
}

// ---------------------------------------------------------------- token unggah CSV
/** Ambil kandidat token: `Bearer <t>` atau `Basic base64(user:password)` → password. Selain itu null. */
export function kandidatToken(header: string | null | undefined): string | null {
  const h = (header ?? "").trim();
  let m = h.match(/^bearer\s+(.+)$/i);
  if (m) return m[1].trim() || null;
  m = h.match(/^basic\s+([A-Za-z0-9+/=_-]+)$/i);
  if (m) {
    let isi = "";
    try {
      const biner = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
      isi = new TextDecoder().decode(Uint8Array.from(biner, (c) => c.charCodeAt(0)));
    } catch {
      return null;
    }
    const i = isi.indexOf(":");
    if (i < 0) return null;
    return isi.slice(i + 1) || null;
  }
  return null;
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Panjang minimum token unggah di env: lebih pendek = dianggap belum disetel (semua permintaan ditolak). */
export const MIN_TOKEN_UNGGAH = 24;

/**
 * Token cocok? Keduanya di-hash dulu (panjang tetap 32 byte) lalu dibandingkan dengan XOR tanpa keluar lebih awal →
 * waktu tidak bergantung pada isi/panjang token kiriman.
 */
export async function tokenUnggahCocok(header: string | null | undefined, harap: string | null | undefined): Promise<boolean> {
  const t = (harap ?? "").trim();
  const k = kandidatToken(header);
  const [a, b] = await Promise.all([sha256(k ?? ""), sha256(t)]);
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a[i] ^ b[i];
  return beda === 0 && k !== null && t.length >= MIN_TOKEN_UNGGAH;
}

// ---------------------------------------------------------------- CSV Google Ads
export interface BarisUnggah {
  id_klik: string;
  nama: string;
  waktu: string; // yyyy-MM-dd HH:mm:ss (WIB)
  nilai: number | string;
}

export const KOLOM_CSV = ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"];

function selCsv(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * CSV impor konversi offline (zona di baris parameter). Baris yang bentuknya tidak sah dilewati (seharusnya tidak
 * terjadi; DB sudah menyaring) supaya satu baris rusak tidak menggagalkan seluruh unggahan Google.
 */
export function csvUnggah(baris: BarisUnggah[]): { csv: string; n: number } {
  const garis = ["Parameters:TimeZone=Asia/Jakarta", KOLOM_CSV.join(",")];
  let n = 0;
  for (const b of baris ?? []) {
    const nilai = String(b?.nilai ?? "");
    if (!POLA_ID.test(String(b?.id_klik ?? "")) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(b?.waktu ?? ""))
        || !/^\d+(\.\d+)?$/.test(nilai) || !b?.nama) continue;
    garis.push([b.id_klik, b.nama, b.waktu, nilai, "IDR"].map((v) => selCsv(String(v))).join(","));
    n++;
  }
  return { csv: garis.join("\r\n") + "\r\n", n };
}
