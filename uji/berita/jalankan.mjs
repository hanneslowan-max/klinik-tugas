#!/usr/bin/env node
// Self-test parser feed modul Berita (supabase/functions/api/berita.ts) — MURNI Node 22.18+ (TypeScript dibaca langsung,
// tanpa DB / Docker / jaringan). Fixture sintetis: RSS 2.0 + CDATA + entitas, Google News (<source>), Atom, RSS 1.0 (RDF),
// item basi, parameter pelacak, dan tarikSemua dengan fetch tiruan (HTTP galat, bukan feed, batas waktu).
//   node uji/berita/jalankan.mjs            (UJI_VERBOSE=1 → cetak semua cek)
// Exit 0 = lulus, 1 = ada gagal.

import { dekodeEntitas, ringkasTarik, tarikSemua, teksPolos, uraiFeed, waktuIso } from "../../supabase/functions/api/berita.ts";

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); console.log(`  GAGAL ${nama}${info === undefined ? "" : `  <- ${JSON.stringify(info).slice(0, 600)}`}`); }
}
const bagian = (n) => console.log(`\n== ${n}`);
const SEKARANG = Date.parse("2026-11-07T10:00:00Z");

bagian("Entitas & teks polos");
cek("entitas bernama + angka", dekodeEntitas("A &amp; B &#8211; C &#x2019; &hellip;") === "A & B – C ’ …", dekodeEntitas("A &amp; B &#8211; C &#x2019; &hellip;"));
cek("entitas tak dikenal dibiarkan", dekodeEntitas("&zzz; &#0;") === "&zzz; &#0;");
cek("HTML ter-escape dibuang", teksPolos("&lt;p&gt;Halo &lt;b&gt;dunia&lt;/b&gt;&lt;/p&gt;") === "Halo dunia", teksPolos("&lt;p&gt;Halo &lt;b&gt;dunia&lt;/b&gt;&lt;/p&gt;"));
cek("CDATA + script dibuang", teksPolos("<![CDATA[<script>alert(1)</script><p>Isi  berita</p>]]>") === "Isi berita");

bagian("Waktu");
cek("RFC 822 +0700", waktuIso("Sat, 07 Nov 2026 13:00:28 +0700") === "2026-11-07T06:00:28.000Z");
cek("GMT", waktuIso("Sat, 07 Nov 2026 11:22:56 GMT") === "2026-11-07T11:22:56.000Z");
cek("ISO Atom", waktuIso("2026-11-07T08:00:00+08:00") === "2026-11-07T00:00:00.000Z");
cek("zona WIB", waktuIso("Sat, 07 Nov 2026 13:00:28 WIB") === "2026-11-07T06:00:28.000Z", waktuIso("Sat, 07 Nov 2026 13:00:28 WIB"));
cek("tak terbaca → undefined", waktuIso("kemarin sore") === undefined && waktuIso("") === undefined);

bagian("RSS 2.0");
const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>Media Contoh</title><link>https://media.contoh/</link>
<item><title><![CDATA[Harga Baja &amp; Besi Naik 5%]]></title><link>https://media.contoh/baja?utm_source=rss&amp;utm_medium=feed&amp;id=7#atas</link>
<description><![CDATA[<img src="x.jpg"/><p>Harga Baja &amp; Besi Naik 5% — produsen menaikkan harga HRC.</p>]]></description>
<pubDate>Sat, 07 Nov 2026 15:00:00 +0700</pubDate></item>
<item><title>Item basi</title><link>https://media.contoh/basi</link><pubDate>Sat, 31 Oct 2026 08:00:00 +0700</pubDate></item>
<item><title>Tanpa tanggal</title><link>https://media.contoh/tanpa</link><description>${"kata ".repeat(120)}</description></item>
<item><title>Dobel</title><link>https://media.contoh/baja?id=7&amp;utm_campaign=x</link></item>
<item><title></title><link>https://media.contoh/kosong</link></item>
<item><title>Link jahat</title><link>javascript:alert(1)</link></item>
<item><title>Guid saja</title><guid isPermaLink="true">https://media.contoh/guid</guid></item>
</channel></rss>`;
const r = uraiFeed(rss, { sekarang: SEKARANG });
cek("3 item sah (basi, dobel, judul kosong, link jahat dibuang)", r.length === 3, r.map((x) => x.judul));
cek("judul CDATA + entitas", r[0]?.judul === "Harga Baja & Besi Naik 5%", r[0]?.judul);
cek("parameter utm & hash dibuang", r[0]?.url === "https://media.contoh/baja?id=7", r[0]?.url);
cek("cuplikan tanpa pengulangan judul & tanpa HTML", r[0]?.cuplikan === "— produsen menaikkan harga HRC.", r[0]?.cuplikan);
cek("terbit ISO UTC", r[0]?.terbit === "2026-11-07T08:00:00.000Z", r[0]?.terbit);
cek("tanpa tanggal tetap masuk, tanpa terbit", r[1]?.judul === "Tanpa tanggal" && r[1]?.terbit === undefined);
cek("cuplikan dipotong ≤ 300 karakter + …", (r[1]?.cuplikan?.length ?? 0) <= 300 && r[1]?.cuplikan?.endsWith("…"), r[1]?.cuplikan?.length);
cek("guid permalink dipakai bila tanpa link", r.some((x) => x.url === "https://media.contoh/guid"));
cek("batas maks item", uraiFeed(rss, { sekarang: SEKARANG, maks: 2 }).length === 2);

bagian("Google News");
const gn = `<rss><channel><item><title>BI Tahan Suku Bunga - Kontan</title><link>https://news.google.com/rss/articles/ABC?oc=5</link>
<description>&lt;ol&gt;&lt;li&gt;&lt;a href="x"&gt;BI Tahan Suku Bunga&lt;/a&gt;&lt;/li&gt;&lt;/ol&gt;</description>
<pubDate>Sat, 07 Nov 2026 09:00:00 GMT</pubDate><source url="https://www.kontan.co.id">Kontan</source></item></channel></rss>`;
const g = uraiFeed(gn, { sekarang: SEKARANG });
cek("penerbit dari <source>", g[0]?.penerbit === "Kontan", g[0]);
cek("akhiran ' - Kontan' dibuang dari judul", g[0]?.judul === "BI Tahan Suku Bunga", g[0]?.judul);
cek("cuplikan Google News dikosongkan", g[0]?.cuplikan === undefined, g[0]?.cuplikan);

bagian("Atom & RSS 1.0");
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title type="html">Ekspor &lt;b&gt;naik&lt;/b&gt;</title><link rel="self" href="https://a.contoh/self"/>
<link rel="alternate" type="text/html" href="https://a.contoh/ekspor"/><published>2026-11-07T08:00:00+08:00</published>
<summary>Ringkasan ekspor.</summary></entry>
<entry><title>Hanya href</title><link href="https://a.contoh/href"/><updated>2026-11-06T08:00:00Z</updated></entry></feed>`;
const a = uraiFeed(atom, { sekarang: SEKARANG });
cek("Atom: link alternate, bukan self", a[0]?.url === "https://a.contoh/ekspor", a[0]);
cek("Atom: judul HTML jadi teks", a[0]?.judul === "Ekspor naik", a[0]?.judul);
cek("Atom: published + summary", a[0]?.terbit === "2026-11-07T00:00:00.000Z" && a[0]?.cuplikan === "Ringkasan ekspor.");
cek("Atom: link tanpa rel", a[1]?.url === "https://a.contoh/href");
const rdf = `<rdf:RDF xmlns="http://purl.org/rss/1.0/"><channel><items><rdf:Seq><rdf:li resource="https://n.contoh/1"/></rdf:Seq></items></channel>
<item rdf:about="https://n.contoh/1"><title><![CDATA[Berita RDF]]></title></item>
<item rdf:about="https://n.contoh/2"><title>Dengan dc:date</title><link>https://n.contoh/2</link><dc:date>2026-11-07T01:00:00Z</dc:date></item></rdf:RDF>`;
const n = uraiFeed(rdf, { sekarang: SEKARANG });
cek("RDF: <items> tidak dianggap item, rdf:about jadi URL", n.length === 2 && n[0]?.url === "https://n.contoh/1", n);
cek("RDF: dc:date", n[1]?.terbit === "2026-11-07T01:00:00.000Z");

bagian("tarikSemua (fetch tiruan)");
const tiruan = async (url, init) => {
  if (url.includes("galat")) return new Response("x", { status: 503 });
  if (url.includes("html")) return new Response("<!doctype html><html><body>Halaman</body></html>", { status: 200 });
  if (url.includes("lambat")) {
    // timer AbortSignal.timeout tidak menahan proses Node (unref) → tahan dengan timer biasa sampai dibatalkan
    return await new Promise((_, tolak) => {
      const jaga = setTimeout(() => {}, 20_000);
      init.signal.addEventListener("abort", () => { clearTimeout(jaga); tolak(init.signal.reason); });
    });
  }
  cek("user-agent dikirim", /AnvilBerita/.test(init.headers["user-agent"]));
  return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
};
const t0 = Date.now();
const h = await tarikSemua([
  { id: "ok", nama: "OK", url: "https://ok.contoh/rss" },
  { id: "galat", nama: "Galat", url: "https://galat.contoh/rss" },
  { id: "html", nama: "HTML", url: "https://html.contoh/" },
  { id: "lambat", nama: "Lambat", url: "https://lambat.contoh/rss" },
], tiruan, SEKARANG);
cek("sumber ok: 3 item", h[0].ok && h[0].items.length === 3, h[0]);
cek("HTTP 503 → galat, tidak melempar", !h[1].ok && h[1].galat === "HTTP 503", h[1]);
cek("bukan feed → galat", !h[2].ok && /bukan feed/.test(h[2].galat), h[2]);
cek("batas waktu → galat 'batas waktu habis'", !h[3].ok && h[3].galat === "batas waktu habis", h[3]);
cek("total ≤ 13 dtk (paralel, batas 12 dtk)", Date.now() - t0 < 13_000, Date.now() - t0);
const rk = ringkasTarik(h);
cek("ringkasan tanpa isi item", rk[0].item === 3 && !("items" in rk[0]) && rk[1].galat === "HTTP 503", rk);

console.log(`\n${hasil.lulus} cek lulus, ${hasil.gagal.length} gagal`);
process.exit(hasil.gagal.length ? 1 : 0);
