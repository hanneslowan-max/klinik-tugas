#!/usr/bin/env node
// Self-test bagian murni rute klik iklan (supabase/functions/api/iklan.ts) — MURNI Node 22.18+ (TypeScript dibaca
// langsung, tanpa DB / Docker / jaringan): allow-list origin, validasi kiriman situs (kode/domain/panjang/waktu/halaman),
// ember laju, token unggah (Bearer/Basic, waktu-konstan), dan format CSV impor konversi offline Google Ads.
//   node uji/iklan/jalankan.mjs            (UJI_VERBOSE=1 → cetak semua cek)
// Exit 0 = lulus, 1 = ada gagal.

import {
  argKlik, ASAL_IKLAN, asalIklanBoleh, buatEmber, csvUnggah, kandidatToken, KOLOM_CSV, normalKlik, tokenUnggahCocok,
} from "../../supabase/functions/api/iklan.ts";

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); console.log(`  GAGAL ${nama}${info === undefined ? "" : `  <- ${JSON.stringify(info).slice(0, 600)}`}`); }
}
const bagian = (n) => console.log(`\n== ${n}`);
const SEKARANG = Date.parse("2026-11-08T03:00:00Z"); // 10:00 WIB
const RH = "https://www.rodahammerindo.com";
const OY = "https://palletmeshindonesia.com";
const dasar = { kode: "GA-RH-7K3F", id_klik: "Cj0KCQiAuji37abcdefgh_BwE", jenis_id: "gclid", domain: "rodahammerindo.com",
  waktu_klik: "2026-11-08T09:55:00+07:00", halaman: "/Product/casters/" };
const n = (ubah, origin = RH) => normalKlik({ ...dasar, ...ubah }, { origin, sekarang: SEKARANG });

bagian("Origin");
cek("4 origin situs diizinkan", [...ASAL_IKLAN].every(asalIklanBoleh) && ASAL_IKLAN.size === 4);
cek("app, localhost, http, subdomain lain, null ditolak",
  !asalIklanBoleh("https://tugas.palletmeshindonesia.com") && !asalIklanBoleh("http://localhost:3000")
  && !asalIklanBoleh("http://rodahammerindo.com") && !asalIklanBoleh("https://blog.rodahammerindo.com")
  && !asalIklanBoleh("https://rodahammerindo.com.evil.id") && !asalIklanBoleh(null) && !asalIklanBoleh("null"));

bagian("Validasi klik");
let r = n({});
cek("kiriman sah → ok + dinormalkan", r.ok && r.klik.kode === "GA-RH-7K3F" && r.klik.waktu_klik === "2026-11-08T02:55:00.000Z", r);
r = n({ kode: " ga-rh-7k3f ", jenis_id: "GCLID", domain: "WWW.RodaHammerindo.com" });
cek("kode huruf besar, jenis huruf kecil, www dibuang", r.ok && r.klik.kode === "GA-RH-7K3F" && r.klik.jenis_id === "gclid" && r.klik.domain === "rodahammerindo.com", r);
cek("id_klik huruf besar/kecil dipertahankan", n({}).klik.id_klik === dasar.id_klik);
for (const [kode, alasan] of [["GA-RH-7K3", "3 karakter"], ["GA-RH-7K3FX", "5 karakter"], ["WEB-RH", "organik"], ["GA-XX-7K3F", "awalan asing"],
  ["GA-RH-7K-F", "tanda -"], ["GA-RH-7K3É", "huruf non-ASCII"], ["", "kosong"]]) {
  r = n({ kode });
  cek(`kode ${alasan} → ditolak`, !r.ok && /GA-RH-XXXX/.test(r.pesan), r);
}
r = n({ domain: "contoh.com" });
cek("domain asing → ditolak", !r.ok && /domain harus/.test(r.pesan), r);
r = n({ kode: "GA-OY-7K3F" });
cek("kode OY dengan domain RH → ditolak", !r.ok && /tidak cocok dengan domain/.test(r.pesan), r);
r = n({ kode: "GA-OY-7K3F", domain: "palletmeshindonesia.com" }, RH);
cek("kode+domain OY dikirim dari origin RH → ditolak", !r.ok && /asal permintaan/.test(r.pesan), r);
r = n({ kode: "GA-OY-7K3F", domain: "palletmeshindonesia.com" }, OY);
cek("kode+domain OY dari origin OY → ok", r.ok, r);
cek("id_klik 200 karakter → ok; 201 → ditolak", n({ id_klik: "a".repeat(200) }).ok && !n({ id_klik: "a".repeat(201) }).ok);
cek("id_klik 'test' (pendek) / berkarakter aneh → ditolak", !n({ id_klik: "test" }).ok && !n({ id_klik: "Cj0KCQ<script>x" }).ok && !n({ id_klik: "Cj0KCQ abcdef" }).ok);
cek("jenis gbraid/wbraid ok, fbclid ditolak", n({ jenis_id: "gbraid" }).ok && n({ jenis_id: "wbraid" }).ok && !n({ jenis_id: "fbclid" }).ok);
cek("kunci tak dikenal (ip / user_agent) → ditolak", !n({ ip: "1.2.3.4" }).ok && /Kunci tidak dikenal: user_agent/.test(n({ user_agent: "x" }).pesan));
cek("nilai bukan teks → ditolak", /id_klik harus teks/.test(n({ id_klik: 1234567890 }).pesan));
cek("body bukan objek → ditolak", !normalKlik([]).ok && !normalKlik(null).ok && !normalKlik("x").ok);

bagian("Waktu & halaman");
cek("waktu kosong → null (DB now())", n({ waktu_klik: "" }).klik.waktu_klik === null && n({ waktu_klik: null }).klik.waktu_klik === null);
cek("zona +0700 / +07 / Z / mikrodetik", n({ waktu_klik: "2026-11-08T09:55:00+0700" }).klik?.waktu_klik === "2026-11-08T02:55:00.000Z"
  && n({ waktu_klik: "2026-11-08 09:55+07" }).klik?.waktu_klik === "2026-11-08T02:55:00.000Z"
  && n({ waktu_klik: "2026-11-08T02:55:00.123456Z" }).klik?.waktu_klik === "2026-11-08T02:55:00.123Z", n({ waktu_klik: "2026-11-08T02:55:00.123456Z" }));
cek("tanpa zona → ditolak", /dengan zona/.test(n({ waktu_klik: "2026-11-08T09:55:00" }).pesan));
cek("> 5 menit ke depan → ditolak; 4 menit → ok", !n({ waktu_klik: "2026-11-08T03:06:00Z" }).ok && n({ waktu_klik: "2026-11-08T03:04:00Z" }).ok);
cek("> 3 hari lalu → ditolak", /di luar rentang/.test(n({ waktu_klik: "2026-11-05T02:59:00Z" }).pesan));
cek("tanggal mustahil → ditolak", !n({ waktu_klik: "2026-13-45T10:00:00Z" }).ok);
cek("halaman: query & fragmen dibuang", n({ halaman: "/Product/casters/?gclid=Cj0&utm_source=g#atas" }).klik.halaman === "/Product/casters/");
cek("halaman kosong → /", n({ halaman: "" }).klik.halaman === "/" && normalKlik({ ...dasar, halaman: undefined }, { sekarang: SEKARANG }).klik.halaman === "/");
cek("halaman dipotong 300 karakter", n({ halaman: "/" + "x".repeat(400) }).klik.halaman.length === 300);
cek("halaman URL penuh / berspasi / tanpa / → ditolak", !n({ halaman: "https://rodahammerindo.com/x" }).ok && !n({ halaman: "/a b" }).ok && !n({ halaman: "x" }).ok);
cek("argKlik: waktu null tidak dikirim", !("waktu_klik" in argKlik(n({ waktu_klik: "" }).klik)) && argKlik(n({}).klik).waktu_klik === "2026-11-08T02:55:00.000Z");

bagian("Ember laju");
let jam = 0;
const ember = buatEmber(3, 6, () => jam); // 3 sekaligus, isi ulang 6/menit (1 per 10 detik)
cek("3 kiriman pertama lolos, ke-4 ditolak", ember("a").ok && ember("a").ok && ember("a").ok && !ember("a").ok);
cek("kunci lain punya ember sendiri", ember("b").ok);
const t = ember("a");
cek("tunggu ≈ 10 detik", !t.ok && t.tunggu > 9000 && t.tunggu <= 10000, t);
jam = 10_000;
cek("sesudah 10 detik terisi 1", ember("a").ok && !ember("a").ok);

bagian("Token unggah");
const TOKEN = "tku_0123456789abcdefghijklmnop";
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
cek("kandidat Bearer", kandidatToken(`Bearer ${TOKEN}`) === TOKEN && kandidatToken(`bearer   ${TOKEN}  `) === TOKEN);
cek("kandidat Basic = password (username bebas, password boleh berisi ':')", kandidatToken(basic("google", TOKEN)) === TOKEN
  && kandidatToken(basic("", "a:b")) === "a:b");
cek("tanpa skema / Basic rusak / tanpa ':' → null", kandidatToken(TOKEN) === null && kandidatToken("Basic !!!") === null
  && kandidatToken(`Basic ${Buffer.from("tanpatitikdua").toString("base64")}`) === null && kandidatToken(null) === null);
cek("Bearer benar → cocok", await tokenUnggahCocok(`Bearer ${TOKEN}`, TOKEN));
cek("Basic benar → cocok", await tokenUnggahCocok(basic("google-ads", TOKEN), TOKEN));
cek("token salah / tanpa header / Basic username=token → tidak cocok",
  !(await tokenUnggahCocok(`Bearer ${TOKEN}x`, TOKEN)) && !(await tokenUnggahCocok(null, TOKEN))
  && !(await tokenUnggahCocok(basic(TOKEN, ""), TOKEN)));
cek("env kosong / pendek (< 24) → selalu tidak cocok", !(await tokenUnggahCocok("Bearer ", "")) && !(await tokenUnggahCocok(null, ""))
  && !(await tokenUnggahCocok("Bearer pendek123", "pendek123")));

bagian("CSV");
const { csv, n: jml } = csvUnggah([
  { id_klik: "Cj0KCQiA_rh-001", nama: "Order SP RH", waktu: "2026-11-03 12:00:00", nilai: 2972370 },
  { id_klik: "Cj0KCQiA_oy-002", nama: "Order SP OY", waktu: "2026-11-05 15:01:00", nilai: "7500000" },
  { id_klik: "rusak id", nama: "Order SP RH", waktu: "2026-11-05 12:00:00", nilai: 1 },
  { id_klik: "Cj0KCQiA_rh-003", nama: "Order SP RH", waktu: "2026-11-05", nilai: 1 },
  { id_klik: "Cj0KCQiA_rh-004", nama: "Order SP RH", waktu: "2026-11-05 12:00:00", nilai: null },
]);
const garis = csv.split("\r\n");
cek("baris 1 = parameter zona", garis[0] === "Parameters:TimeZone=Asia/Jakarta", garis[0]);
cek("baris 2 = header Google", garis[1] === "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"
  && KOLOM_CSV.length === 5, garis[1]);
cek("baris data RH", garis[2] === "Cj0KCQiA_rh-001,Order SP RH,2026-11-03 12:00:00,2972370,IDR", garis[2]);
cek("baris data OY", garis[3] === "Cj0KCQiA_oy-002,Order SP OY,2026-11-05 15:01:00,7500000,IDR", garis[3]);
cek("baris rusak dilewati (n = 2), diakhiri CRLF", jml === 2 && garis.length === 5 && garis[4] === "" && csv.endsWith("\r\n"), { jml, garis });
const kosong = csvUnggah([]);
cek("tanpa baris → hanya parameter + header", kosong.n === 0 && kosong.csv === "Parameters:TimeZone=Asia/Jakarta\r\n" + KOLOM_CSV.join(",") + "\r\n");
cek("nama berkoma di-quote (CSV aman)", csvUnggah([{ id_klik: "Cj0KCQiA_x", nama: 'Order, "SP"', waktu: "2026-11-03 12:00:00", nilai: 1 }])
  .csv.split("\r\n")[2] === 'Cj0KCQiA_x,"Order, ""SP""",2026-11-03 12:00:00,1,IDR');

console.log(`\nLulus ${hasil.lulus}, gagal ${hasil.gagal.length}`);
process.exit(hasil.gagal.length ? 1 : 0);
