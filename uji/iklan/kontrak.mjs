#!/usr/bin/env node
// Kontrak rute Edge klik iklan terhadap stack Supabase LOKAL (alamat tetap 127.0.0.1 / IP privat kontainer edge runtime →
// tidak mungkin menembak produksi). Header CORS diuji langsung ke edge runtime (Kong lokal menimpa CORS dengan "*" dan
// menjawab preflight sendiri; di cloud fungsi yang menjawab) — sama dengan ujiCors di uji/kontrak/jalankan.mjs.
// Syarat: `supabase start` + `supabase db reset` + `supabase functions serve --env-file uji/iklan/serve.env` (token unggah
// tiruan untuk GET /x/iklan/unggah.csv).
//   node uji/iklan/kontrak.mjs
// Yang diuji: CORS khusus dua situs (rute lain tidak ikut longgar), penerima klik (204, idempoten, 409 tabrakan, 400
// validasi, 413, 405, 429 batas laju per origin), CSV unggah (401 tanpa/ salah token, Bearer & Basic, isi baris ORDER),
// ringkasan (token baca) dan perawatan 90 hari (token impor). Data uji dibuat lewat psql lokal lalu dihapus.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const API = "http://127.0.0.1:54321/functions/v1/api";
// Edge runtime langsung (tanpa Kong): http://<ip kontainer supabase_edge_runtime_rhj-tugas>:8081/api
function edgeLangsung() {
  try {
    const ip = execFileSync("docker", ["inspect", "supabase_edge_runtime_rhj-tugas", "--format",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/)[0];
    return ip && /^(10|172|192)\./.test(ip) ? `http://${ip}:8081/api` : "";
  } catch {
    return "";
  }
}
const LANGSUNG = process.env.UJI_EDGE_LANGSUNG || edgeLangsung();
if (LANGSUNG && !/^http:\/\/(127\.0\.0\.1|10\.|172\.|192\.168\.)/.test(LANGSUNG)) { console.error("UJI_EDGE_LANGSUNG harus alamat lokal/privat"); process.exit(3); }
const BASE = LANGSUNG || API;   // rute klik & CORS lewat runtime langsung bila ada
const TOKEN_UNGGAH = "uji-lokal-token-unggah-iklan-000000000001"; // = uji/iklan/serve.env
const sha = (s) => createHash("sha256").update(s).digest("hex");
const sql = (q) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    env: { PATH: process.env.PATH, PGPASSWORD: "postgres" }, encoding: "utf8",
  }).trim();

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); console.log(`  GAGAL ${nama}${info === undefined ? "" : `  <- ${JSON.stringify(info).slice(0, 500)}`}`); }
}
async function minta(metode, jalur, { token, origin, body, teks, headers = {}, base = BASE } = {}) {
  const h = { ...headers };
  if (token) h.authorization = token;
  if (origin) h.origin = origin;
  let isi;
  if (teks !== undefined) { isi = teks; h["content-type"] ??= "text/plain;charset=UTF-8"; }
  else if (body !== undefined) { isi = JSON.stringify(body); h["content-type"] ??= "application/json"; }
  const r = await fetch(`${base}${jalur}`, { method: metode, headers: h, body: isi });
  const raw = await r.text();
  let j = null;
  try { j = raw ? JSON.parse(raw) : null; } catch { /* bukan JSON (CSV) */ }
  return { s: r.status, j, raw, h: r.headers };
}

const RH = "https://rodahammerindo.com";
const RHW = "https://www.rodahammerindo.com";
const OYW = "https://www.palletmeshindonesia.com";
const APP = "https://tugas.palletmeshindonesia.com";
const TOK = { baca: "rtk_kontrak_iklan_baca_1", impor: "rtk_kontrak_iklan_impor_1" };
const ID = { baca: "d1d1d1d1-0000-4000-8000-000000000001", impor: "d1d1d1d1-0000-4000-8000-000000000002" };
const KODE = ["GA-RH-KT01", "GA-RH-KT02", "GA-OY-KT03"];
const klik = (ubah = {}) => ({ kode: "GA-RH-KT01", id_klik: "Cj0KCQiAkontrak_rh_0001", jenis_id: "gclid", domain: "rodahammerindo.com",
  halaman: "/Product/casters/?gclid=Cj0KCQiAkontrak_rh_0001", ...ubah });
function bersih() {
  sql(`delete from public.api_tokens where id in ('${ID.baca}','${ID.impor}');
       select set_config('app.sumber_bukti_tulis', 'ya', false);
       delete from public.lead_item where lead_id = 'ldkontrikl1'; delete from public.lead where id = 'ldkontrikl1';
       delete from public.pelanggan where id = 'plkontrikl1';
       delete from public.iklan_klik where kode like 'GA-__-KT%' or kode like 'GA-OY-L%';`);
}

const cekEdge = await fetch(`${API}/v2/user`).catch(() => null);
if (!cekEdge || cekEdge.status !== 401) {
  console.error("Edge lokal tidak terjangkau di 127.0.0.1:54321 (jalankan supabase functions serve --env-file uji/iklan/serve.env)");
  process.exit(2);
}
bersih();
sql(`insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('${ID.baca}', 900000000002, 'kontrak iklan baca', 'rtk_kib1', '${sha(TOK.baca)}', 'baca'),
  ('${ID.impor}', 900000000002, 'kontrak iklan impor', 'rtk_kii1', '${sha(TOK.impor)}', 'impor')`);

// Header CORS hanya bermakna bila langsung ke runtime; lewat Kong lokal cek ACAO dilewati (dicatat sekali).
const acao = (r, harap) => (LANGSUNG ? r.h.get("access-control-allow-origin") === harap : true);
if (!LANGSUNG) console.log("  LEWATI cek header CORS: alamat edge runtime langsung tak ditemukan (set UJI_EDGE_LANGSUNG=http://<ip>:8081/api)");

try {
  console.log("== CORS");
  let r = await minta("OPTIONS", "/x/iklan/klik", { origin: RHW, headers: { "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
  cek("preflight dari situs → 204 + izin POST/content-type", r.s === 204 && acao(r, RHW)
    && /POST/.test(r.h.get("access-control-allow-methods") ?? "") && /content-type/.test(r.h.get("access-control-allow-headers") ?? ""), [r.s, [...r.h]]);
  r = await minta("OPTIONS", "/x/iklan/klik", { origin: APP });
  cek("preflight dari app (bukan situs) → 403", r.s === 403 && acao(r, null), r.s);
  r = await minta("OPTIONS", "/x/iklan/klik", { origin: "https://evil.example" });
  cek("preflight dari origin asing → 403", r.s === 403, r.s);
  r = await minta("OPTIONS", "/v2/user", { origin: RH });
  cek("rute lain: preflight dari situs tetap 403 (CORS tidak dilonggarkan)", r.s === 403, r.s);
  r = await minta("GET", "/v2/user", { origin: RH });
  cek("rute lain: respons ke situs tanpa access-control-allow-origin", r.s === 401 && acao(r, null), [...r.h]);
  r = await minta("OPTIONS", "/v2/user", { origin: APP });
  cek("rute lain: app tetap diizinkan", r.s === 204 && acao(r, APP), r.s);

  console.log("== penerima klik");
  r = await minta("POST", "/x/iklan/klik", { body: klik() });
  cek("tanpa Origin → 403", r.s === 403 && r.j?.ECODE === "ACCESS_001", r);
  r = await minta("POST", "/x/iklan/klik", { body: klik(), origin: "https://evil.example" });
  cek("origin asing → 403 tanpa izin CORS", r.s === 403 && acao(r, null), r.s);
  r = await minta("POST", "/x/iklan/klik", { teks: JSON.stringify(klik()), origin: RHW });
  cek("kiriman sah (text/plain ala sendBeacon) → 204 tanpa isi + izin CORS", r.s === 204 && r.raw === "" && acao(r, RHW), [r.s, r.raw]);
  cek("baris tersimpan dinormalkan (path tanpa query)", sql("select kode || ' ' || jenis_id || ' ' || domain || ' ' || halaman from public.iklan_klik where kode = 'GA-RH-KT01'")
    === "GA-RH-KT01 gclid rodahammerindo.com /Product/casters/");
  r = await minta("POST", "/x/iklan/klik", { body: klik(), origin: RH });
  cek("kiriman ganda → 204 (idempoten), tetap 1 baris", r.s === 204 && sql("select count(*) from public.iklan_klik where kode = 'GA-RH-KT01'") === "1", r.s);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ id_klik: "Cj0KCQiAkunjunganlain_99" }), origin: RH });
  cek("kode sama, id_klik beda → 409 KONFLIK_001 (situs buat kode baru) + izin CORS", r.s === 409 && r.j?.ECODE === "KONFLIK_001"
    && acao(r, RH), r);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT0" }), origin: RH });
  cek("kode salah format → 400 INPUT_001 (situs bisa membaca galat)", r.s === 400 && r.j?.ECODE === "INPUT_001" && /GA-RH-XXXX/.test(r.j?.err)
    && acao(r, RH), r);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-OY-KT03", domain: "palletmeshindonesia.com" }), origin: RH });
  cek("kode/domain OY dari situs RH → 400", r.s === 400 && /asal permintaan/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT02", domain: "contoh.com" }), origin: RH });
  cek("domain asing → 400", r.s === 400 && /domain harus/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT02", id_klik: "x".repeat(201) }), origin: RH });
  cek("id_klik > 200 → 400", r.s === 400 && /id_klik/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT02", ip: "1.2.3.4" }), origin: RH });
  cek("kunci tambahan (ip) → 400", r.s === 400 && /Kunci tidak dikenal: ip/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/iklan/klik", { teks: "{bukan json", origin: RH });
  cek("bukan JSON → 400", r.s === 400 && r.j?.ECODE === "INPUT_001", r.j);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT02", halaman: "/" + "x".repeat(3000) }), origin: RH });
  cek("body > 2 KB → 413", r.s === 413, r.s);
  r = await minta("GET", "/x/iklan/klik", { origin: RH });
  cek("GET → 405", r.s === 405, r.s);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-OY-KT03", domain: "palletmeshindonesia.com", id_klik: "gbraid_kontrak_oy_03", jenis_id: "gbraid" }), origin: OYW });
  cek("klik OY gbraid dari www.palletmeshindonesia.com → 204", r.s === 204, r);
  cek("tabel tidak menyimpan apa pun selain kolom kode/klik/waktu/domain/halaman",
    sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='iklan_klik'")
      === "kode,id_klik,jenis_id,waktu_klik,domain,halaman,dibuat_pada");

  console.log("== batas laju per origin");
  const status = [];
  for (let i = 0; i < 40; i++) {
    const x = await minta("POST", "/x/iklan/klik", { body: klik({ kode: `GA-OY-L${String(i).padStart(3, "0")}`, domain: "palletmeshindonesia.com",
      id_klik: `Cj0KCQiAlaju_${i}_xxxxxx` }), origin: "https://palletmeshindonesia.com" });
    status.push(x.s);
    if (x.s === 429) { cek("429 punya retry-after + izin CORS", Number(x.h.get("retry-after")) >= 1 && acao(x, "https://palletmeshindonesia.com"), [...x.h]); break; }
  }
  // ember per isolate (kapasitas 30, isi 30/menit): jalan ulang dalam semenit bisa kena 429 lebih awal
  cek("kiriman beruntun dari satu origin → 429 paling lambat kiriman ke-31", status.includes(429) && status.length <= 31, status);
  r = await minta("POST", "/x/iklan/klik", { body: klik({ kode: "GA-RH-KT02", id_klik: "Cj0KCQiAkontrak_rh_0002" }), origin: RH });
  cek("origin lain tidak ikut terkena batas", r.s === 204, r.s);

  console.log("== CSV unggah");
  // lead ORDER ber-kode GA-RH-KT01 (klik barusan), SP hari ini − 0 → waktu konversi = klik + 1 menit bila sudah lewat 12:00
  sql(`select set_config('app.sumber', 'ui', false); select set_config('app.actor_id', '100000001', false);
       select set_config('app.sumber_bukti_tulis', 'ya', false);
       update public.iklan_klik set waktu_klik = now() - interval '3 days' where kode = 'GA-RH-KT01';
       insert into public.pelanggan (id, nama, kota) values ('plkontrikl1', 'PT Kontrak Iklan', 'Jakarta');
       insert into public.lead (id, pelanggan_id, sumber, tahap, no_sp, tanggal_sp, nilai_transaksi, sumber_bukti, sumber_bukti_kode, sumber_bukti_diisi_pada)
       values ('ldkontrikl1', 'plkontrikl1', 'Google Ads', 'ORDER', '9901/KTR/XI/2026', public.hari_ini_wib() - 1, 2972370, 'ga-rh', 'GA-RH-KT01', now());`);
  const tglSp = sql("select to_char(public.hari_ini_wib() - 1, 'YYYY-MM-DD')");
  r = await minta("GET", "/x/iklan/unggah.csv");
  cek("tanpa token → 401 + WWW-Authenticate Basic, tanpa isi data", r.s === 401 && /^Basic/.test(r.h.get("www-authenticate") ?? "")
    && r.j?.ECODE === "OAUTH_019" && !/Cj0KCQ/.test(r.raw), [r.s, r.raw]);
  r = await minta("GET", "/x/iklan/unggah.csv", { token: `Bearer ${TOKEN_UNGGAH}x` });
  cek("token salah → 401 (jawaban sama)", r.s === 401 && r.j?.err === "Token tidak sah", r.j);
  r = await minta("GET", "/x/iklan/unggah.csv", { token: `Bearer ${TOK.impor}` });
  cek("token API app (bukan token unggah) → 401", r.s === 401, r.s);
  r = await minta("GET", "/x/iklan/unggah.csv", { token: `Basic ${Buffer.from(`google:${TOKEN_UNGGAH}`).toString("base64")}` });
  if (r.s === 401) console.log("  (petunjuk) Edge belum memuat TOKEN_UNGGAH_IKLAN: jalankan supabase functions serve --env-file uji/iklan/serve.env");
  cek("Basic (password = token) → 200 text/csv", r.s === 200 && /^text\/csv/.test(r.h.get("content-type") ?? ""), [r.s, r.raw.slice(0, 200)]);
  const garis = r.raw.split("\r\n");
  cek("baris 1-2: parameter zona + header Google", garis[0] === "Parameters:TimeZone=Asia/Jakarta"
    && garis[1] === "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency", garis.slice(0, 2));
  cek("baris lead ORDER ber-kode cocok", garis.includes(`Cj0KCQiAkontrak_rh_0001,Order SP RH,${tglSp} 12:00:00,2972370,IDR`), garis);
  cek("gbraid tidak masuk CSV", !r.raw.includes("gbraid_kontrak_oy_03"));
  cek("header x-baris konsisten", Number(r.h.get("x-baris")) === garis.length - 3, [r.h.get("x-baris"), garis.length]);
  r = await minta("GET", "/x/iklan/unggah", { token: `Bearer ${TOKEN_UNGGAH}` });
  cek("Bearer + jalur tanpa .csv → 200", r.s === 200 && r.raw.includes("Cj0KCQiAkontrak_rh_0001"), r.s);
  r = await minta("POST", "/x/iklan/unggah.csv", { token: `Bearer ${TOKEN_UNGGAH}` });
  cek("POST → 405", r.s === 405, r.s);

  console.log("== ringkasan & perawatan");
  r = await minta("GET", "/x/iklan/ringkas");
  cek("ringkas tanpa token → 401", r.s === 401, r.s);
  r = await minta("GET", "/x/iklan/ringkas", { token: TOK.baca });
  cek("ringkas (token baca bot) → 200 + bentuk", r.s === 200 && Array.isArray(r.j?.per_domain) && r.j.per_domain.length === 2
    && "h7" in r.j.per_domain[0] && "unggah" in r.j && r.j.unggah.baris >= 1, r.j);
  r = await minta("POST", "/x/rawat/iklan-klik", { token: TOK.baca, body: {} });
  cek("rawat dengan token baca → 403", r.s === 403, r.s);
  r = await minta("POST", "/x/rawat/iklan-klik", { token: TOK.impor, body: { dry: true } });
  cek("rawat dry (token impor bot) → 200 {hari:90, dry:true}", r.s === 200 && r.j?.hari === 90 && r.j?.dry === true && Number.isInteger(r.j?.dihapus), r.j);
  r = await minta("POST", "/x/rawat/iklan-klik", { token: TOK.impor });
  cek("rawat tanpa body → 200 dry:false", r.s === 200 && r.j?.dry === false, r.j);
} finally {
  bersih();
}

console.log(`\nLulus ${hasil.lulus}, gagal ${hasil.gagal.length}`);
process.exit(hasil.gagal.length ? 1 : 0);
