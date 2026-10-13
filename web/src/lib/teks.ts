// Pembantu teks murni: path tujuan aman, ukuran berkas, URL aman, pemecah URL dalam teks, markdown → teks polos.

/** Path tujuan setelah login yang aman (hanya path internal, bukan //host atau URL lain). */
export function lanjutAman(s: string | null | undefined, cadangan = "/saya", larang: string[] = []): string {
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return cadangan;
  if (larang.some((p) => s.startsWith(p))) return cadangan;
  return s;
}

export function ukuranBerkas(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** URL http(s) yang sah, selain itu null (mencegah javascript:, data:, …). */
export function urlAman(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
  } catch {
    return null;
  }
}

export type PotonganTeks = { jenis: "teks"; isi: string } | { jenis: "url"; isi: string; href: string };

/** Pecah teks menjadi potongan teks biasa & URL http(s) (untuk dirender sebagai tautan tanpa innerHTML). */
export function pecahUrl(teks: string): PotonganTeks[] {
  const hasil: PotonganTeks[] = [];
  const pola = /https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g;
  let pos = 0;
  for (const m of teks.matchAll(pola)) {
    const i = m.index ?? 0;
    if (i > pos) hasil.push({ jenis: "teks", isi: teks.slice(pos, i) });
    const href = urlAman(m[0]);
    hasil.push(href ? { jenis: "url", isi: m[0], href } : { jenis: "teks", isi: m[0] });
    pos = i + m[0].length;
  }
  if (pos < teks.length) hasil.push({ jenis: "teks", isi: teks.slice(pos) });
  return hasil;
}

export function inisial(m: { initials?: string | null; username?: string | null }): string {
  return (
    m.initials ||
    (m.username || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  );
}

/** Warna hex yang aman dipakai di style (#rgb … #rrggbbaa), selain itu null. */
export function warnaAman(w: unknown): string | null {
  return typeof w === "string" && /^#[0-9a-f]{3,8}$/i.test(w) ? w : null;
}

/**
 * Markdown → teks polos yang mudah dibaca: tanda sintaks (**tebal**, _miring_, `kode`, ~~coret~~, # judul, > kutipan,
 * pagar kode, garis ---) dibuang, [teks](url) / ![alt](url) → teks / alt, butir "- " / "* " → "• ". Dipakai <Markdown>
 * selama lib/markdown belum termuat (HTML server muat penuh /t, hidrasi): pembaca tidak melihat sintaks mentah sebelum
 * format diterapkan. Heuristik ringan (fungsi murni, sama di server & klien): bukan pengurai markdown lengkap.
 */
export function teksPolosMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .split("\n")
    .filter((b) => !/^\s{0,3}(```|~~~)/.test(b) && !/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(b))
    .map((b) =>
      b
        // karakter ber-escape (\*, \_, …) disimpan sementara di area pakai-pribadi supaya tidak dianggap tanda sintaks
        .replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
        .replace(/^\s{0,3}#{1,6}\s+(.*?)(\s+#+)?\s*$/, "$1")
        .replace(/^(\s{0,3}>\s?)+/, "")
        .replace(/^(\s*)[-*+]\s+/, "$1• ")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)\s]*(\s+"[^"]*")?\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*(?=\S)(.*?\S)\*\*/g, "$1")
        .replace(/(^|\W)__(?=\S)(.*?\S)__(?!\w)/g, "$1$2")
        .replace(/~~(?=\S)(.*?\S)~~/g, "$1")
        .replace(/(^|[^*\w])\*(?=[^\s*])(.*?[^\s*])\*(?![*\w])/g, "$1$2")
        .replace(/(^|\W)_(?=[^\s_])(.*?[^\s_])_(?!\w)/g, "$1$2")
        .replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000)),
    )
    .join("\n");
}
