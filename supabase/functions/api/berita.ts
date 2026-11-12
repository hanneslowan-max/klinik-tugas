// Modul Berita (migrasi 20261107120000_berita.sql): tarik feed RSS 2.0 / RSS 1.0 (RDF) / Atom dan urai jadi item.
// Tanpa dependensi luar (parser regex toleran: feed media sering tidak valid XML). Dipakai index.ts rute
// POST /x/berita/tarik (token agent) dan POST /x/admin/berita-tarik (sesi owner).
// Hanya sintaks TypeScript yang bisa dihapus (tanpa enum/namespace/parameter property) supaya bisa diuji Node
// langsung: node uji/berita/jalankan.mjs.

export type ItemFeed = { url: string; judul: string; cuplikan?: string; penerbit?: string; terbit?: string };
export type SumberFeed = { id: string; nama: string; url: string };
export type HasilSumber = { sumber_id: string; ok: boolean; galat?: string; items: ItemFeed[] };

/** Batas per feed: item terbaru, ukuran unduhan, umur item (feed basi tidak membanjiri kandidat). */
export const MAKS_ITEM = 50;
export const MAKS_BYTE = 1_500_000;
export const MAKS_UMUR_HARI = 4;
const BATAS_WAKTU_MS = 12_000;
const AGEN = "Mozilla/5.0 (compatible; AnvilBerita/1.0; +https://tugas.palletmeshindonesia.com)";

const ENTITAS: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘",
  rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", yen: "¥", deg: "°", times: "×", eacute: "é", egrave: "è", aacute: "á", oacute: "ó",
  uacute: "ú", iacute: "í", ntilde: "ñ", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
};

export function dekodeEntitas(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k: string) => {
    if (k[0] === "#") {
      const n = k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return ENTITAS[k.toLowerCase()] ?? m;
  });
}

const tanpaCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/** Teks polos dari isi elemen: CDATA dibuka, entitas didekode, tag HTML dibuang (dua kali: HTML sering di-escape). */
export function teksPolos(s: string | undefined): string {
  if (!s) return "";
  let t = dekodeEntitas(tanpaCdata(s));
  t = t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ");
  t = dekodeEntitas(t).replace(/<[^>]*>/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function esc(tag: string) {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Isi mentah elemen pertama <tag>…</tag> (tag boleh ber-namespace, mis. dc:date). */
function isi(blok: string, tag: string): string | undefined {
  const m = blok.match(new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, "i"));
  return m ? m[1] : undefined;
}

function atribut(tagMentah: string, nama: string): string | undefined {
  const m = tagMentah.match(new RegExp(`\\s${esc(nama)}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? dekodeEntitas(m[2] ?? m[3] ?? "") : undefined;
}

function tautan(blok: string): string {
  // RSS: <link>url</link>; Atom: <link rel="alternate" href="…"/> (rel lain dilewati); cadangan guid/origLink/rdf:about
  const orig = isi(blok, "feedburner:origLink");
  if (orig && /^https?:\/\//i.test(teksPolos(orig))) return teksPolos(orig);
  const rss = isi(blok, "link");
  if (rss !== undefined && /^\s*(<!\[CDATA\[)?\s*https?:\/\//i.test(rss)) return teksPolos(rss);
  const tags = blok.match(/<link\b[^>]*\/?>/gi) ?? [];
  let cadangan = "";
  for (const t of tags) {
    const href = atribut(t, "href");
    if (!href) continue;
    const rel = (atribut(t, "rel") ?? "alternate").toLowerCase();
    if (rel === "alternate") return href.trim();
    if (!cadangan && rel !== "self" && rel !== "enclosure" && rel !== "replies") cadangan = href.trim();
  }
  if (cadangan) return cadangan;
  const guid = isi(blok, "guid");
  if (guid && /^https?:\/\//i.test(teksPolos(guid))) return teksPolos(guid);
  return "";
}

/** Waktu dari pubDate (RFC 822) / published / updated / dc:date → ISO UTC; tidak terbaca → undefined. */
export function waktuIso(s: string | undefined): string | undefined {
  const t = teksPolos(s);
  if (!t) return undefined;
  let ms = Date.parse(t);
  if (Number.isNaN(ms)) {
    // "Sat, 07 Nov 2026 13:00:28 WIB" dan sejenisnya
    const zona: Record<string, string> = { WIB: "+0700", WITA: "+0800", WIT: "+0900" };
    const m = t.match(/^(.*\d{1,2}:\d{2}(?::\d{2})?)\s+(WIB|WITA|WIT)$/i);
    if (m) ms = Date.parse(`${m[1]} ${zona[m[2].toUpperCase()]}`);
  }
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function normalUrl(u: string): string {
  let s = u.trim();
  try {
    const url = new URL(s);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    // buang parameter pelacak umum (berita yang sama dari kampanye berbeda tetap satu URL)
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|cmpid$|ocid$)/i.test(k)) url.searchParams.delete(k);
    }
    url.hash = "";
    s = url.toString();
  } catch {
    return "";
  }
  return s;
}

/** Urai satu dokumen feed. `sekarang` untuk menyaring item basi (MAKS_UMUR_HARI). */
export function uraiFeed(xml: string, opsi: { maks?: number; sekarang?: number } = {}): ItemFeed[] {
  const maks = opsi.maks ?? MAKS_ITEM;
  const sekarang = opsi.sekarang ?? Date.now();
  const batasLama = sekarang - MAKS_UMUR_HARI * 86_400_000;
  let blok = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[0]);
  if (!blok.length) blok = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[0]);
  const hasil: ItemFeed[] = [];
  const sudah = new Set<string>();
  for (const b of blok) {
    if (hasil.length >= maks) break;
    let judul = teksPolos(isi(b, "title"));
    let url = normalUrl(tautan(b));
    if (!url) {
      const about = b.match(/^<item\b[^>]*>/i)?.[0];
      url = about ? normalUrl(atribut(about, "rdf:about") ?? "") : "";
    }
    if (!judul || !url || sudah.has(url)) continue;
    const terbit = waktuIso(isi(b, "pubDate") ?? isi(b, "published") ?? isi(b, "dc:date") ?? isi(b, "updated"));
    if (terbit && Date.parse(terbit) < batasLama) continue;
    // Google News: <source url="…">CNN Indonesia</source> + judul "… - CNN Indonesia"
    let penerbit = teksPolos(isi(b, "source")) || undefined;
    if (penerbit && judul.endsWith(` - ${penerbit}`)) judul = judul.slice(0, -(penerbit.length + 3)).trim();
    let cuplikan = teksPolos(isi(b, "description") ?? isi(b, "summary") ?? isi(b, "content:encoded") ?? isi(b, "content"));
    if (/news\.google\.com/i.test(url)) cuplikan = ""; // isinya daftar tautan judul yang sama
    if (cuplikan && (cuplikan === judul || cuplikan.startsWith(judul))) cuplikan = cuplikan.slice(judul.length).trim();
    if (cuplikan.length > 300) cuplikan = `${cuplikan.slice(0, 297).replace(/\s+\S*$/, "")}…`;
    if (penerbit && penerbit.length > 120) penerbit = penerbit.slice(0, 120);
    sudah.add(url);
    hasil.push({
      url, judul: judul.slice(0, 400),
      ...(cuplikan ? { cuplikan } : {}), ...(penerbit ? { penerbit } : {}), ...(terbit ? { terbit } : {}),
    });
  }
  return hasil;
}

async function unduh(url: string, f: typeof fetch): Promise<string> {
  const res = await f(url, {
    headers: { "user-agent": AGEN, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(BATAS_WAKTU_MS),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${res.status}`);
  }
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAKS_BYTE * 2) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`feed terlalu besar (${len} byte)`);
  }
  const teks = await res.text();
  return teks.length > MAKS_BYTE ? teks.slice(0, MAKS_BYTE) : teks;
}

/** Tarik semua sumber bersamaan; satu sumber gagal tidak menggagalkan yang lain. */
export async function tarikSemua(sumber: SumberFeed[], f: typeof fetch = fetch, sekarang = Date.now()): Promise<HasilSumber[]> {
  return await Promise.all(sumber.map(async (s): Promise<HasilSumber> => {
    try {
      const xml = await unduh(s.url, f);
      if (!/<(rss|feed|rdf:RDF)\b/i.test(xml.slice(0, 5000))) throw new Error("bukan feed RSS/Atom");
      return { sumber_id: s.id, ok: true, items: uraiFeed(xml, { sekarang }) };
    } catch (e) {
      const pesan = e instanceof Error ? (e.name === "TimeoutError" ? "batas waktu habis" : e.message) : String(e);
      return { sumber_id: s.id, ok: false, galat: pesan.slice(0, 300), items: [] };
    }
  }));
}

/** Ringkas untuk respons: angka per sumber tanpa isi item. */
export function ringkasTarik(h: HasilSumber[]) {
  return h.map((x) => ({ sumber_id: x.sumber_id, ok: x.ok, item: x.items.length, ...(x.galat ? { galat: x.galat } : {}) }));
}
