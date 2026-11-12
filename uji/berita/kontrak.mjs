#!/usr/bin/env node
// Kontrak rute Edge modul Berita terhadap stack Supabase LOKAL (alamat tetap 127.0.0.1, tidak membaca env apa pun →
// tidak mungkin menembak produksi). Syarat: `supabase start` + `supabase db reset` + `supabase functions serve`.
//   node uji/berita/kontrak.mjs
// Token uji dibuat lewat psql lokal lalu dihapus. Feed sungguhan boleh gagal di sandbox tanpa internet/CA (tiap sumber
// cukup tercatat ok ATAU galat); yang diuji = hak, scope, validasi, tunda 90 detik, dan bentuk respons.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const API = "http://127.0.0.1:54321/functions/v1/api";
const AUTH = "http://127.0.0.1:54321/auth/v1";
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
async function minta(metode, jalur, { token, sesi, body, origin } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = token;
  if (sesi) h["x-sesi"] = sesi;
  if (origin) h.origin = origin;
  const r = await fetch(`${API}${jalur}`, { method: metode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* kosong */ }
  return { s: r.status, j, h: r.headers };
}

const TOK = { tulis: "rtk_kontrak_berita_tulis_1", baca: "rtk_kontrak_berita_baca_1", citra: "rtk_kontrak_berita_citra_1" };
const ID = { tulis: "d0d0d0d0-0000-4000-8000-000000000001", baca: "d0d0d0d0-0000-4000-8000-000000000002", citra: "d0d0d0d0-0000-4000-8000-000000000003" };
function bersih() {
  sql(`delete from public.api_tokens where id in ('${ID.tulis}','${ID.baca}','${ID.citra}');
       delete from public.berita_edisi where garis_besar like 'KONTRAK%';
       delete from public.berita; update public.berita_sumber set terakhir_tarik = null, terakhir_ok = null, terakhir_galat = null, terakhir_item = null;`);
}

const cekEdge = await fetch(`${API}/v2/user`).catch(() => null);
if (!cekEdge || cekEdge.status !== 401) {
  console.error("Edge lokal tidak terjangkau di 127.0.0.1:54321 (jalankan supabase functions serve)");
  process.exit(2);
}
bersih();
sql(`insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('${ID.tulis}', 900000000002, 'kontrak berita tulis', 'rtk_kbt1', '${sha(TOK.tulis)}', 'tulis'),
  ('${ID.baca}', 900000000002, 'kontrak berita baca', 'rtk_kbb1', '${sha(TOK.baca)}', 'baca'),
  ('${ID.citra}', 100000002, 'kontrak berita citra', 'rtk_kbc1', '${sha(TOK.citra)}', 'tulis')`);

try {
  console.log("== hak & scope");
  let r = await minta("POST", "/x/berita/tarik");
  cek("tanpa token → 401", r.s === 401 && r.j?.ECODE === "OAUTH_017", r);
  r = await minta("POST", "/x/berita/tarik", { token: TOK.citra });
  cek("token anggota biasa → 403", r.s === 403 && /owner atau agent/.test(r.j?.err ?? ""), r);
  r = await minta("POST", "/x/berita/tarik", { token: TOK.baca });
  cek("token baca tidak bisa tarik → 403 scope", r.s === 403 && /Scope/.test(r.j?.err ?? ""), r);
  r = await minta("GET", "/x/berita/tarik", { token: TOK.tulis });
  cek("metode salah → 405", r.s === 405, r);

  console.log("== tarik");
  r = await minta("POST", "/x/berita/tarik", { token: `Bearer ${TOK.tulis}` });
  cek("tarik (Bearer) → 200, 36 sumber tercatat", r.s === 200 && r.j?.sumber === 36 && r.j?.sumber_ok + r.j?.sumber_galat === 36, r.j && { ...r.j, per_sumber: undefined });
  cek("per_sumber ringkas tanpa isi item", Array.isArray(r.j?.per_sumber) && r.j.per_sumber.length === 36 && !("items" in r.j.per_sumber[0]), r.j?.per_sumber?.[0]);
  cek("status sumber tersimpan di DB", sql("select count(*) from public.berita_sumber where terakhir_tarik is not null") === "36");
  r = await minta("POST", "/x/berita/tarik", { token: TOK.tulis });
  cek("tarik ulang < 90 detik → ditunda", r.s === 200 && r.j?.ditunda === true && typeof r.j?.terakhir_tarik === "string", r.j);

  console.log("== kandidat & edisi");
  r = await minta("GET", "/x/berita/kandidat?jam=6", { token: TOK.baca });
  cek("kandidat (token baca) → 200 + bentuk", r.s === 200 && Array.isArray(r.j?.kandidat) && "umpan_balik" in r.j && "sumber_galat" in r.j, r.j && Object.keys(r.j));
  r = await minta("GET", "/x/berita/kandidat?jam=abc", { token: TOK.baca });
  cek("jam bukan angka → 400", r.s === 400 && r.j?.ECODE === "INPUT_001", r.j);
  r = await minta("GET", "/x/berita/kandidat?jam=99", { token: TOK.baca });
  cek("jam > 48 → 400", r.s === 400, r.j);
  r = await minta("POST", "/x/berita/edisi", { token: TOK.baca, body: { garis_besar: "KONTRAK", pilihan: [] } });
  cek("edisi dengan token baca → 403", r.s === 403, r.j);
  r = await minta("POST", "/x/berita/edisi", { token: TOK.tulis, body: { garis_besar: "KONTRAK", pilihan: [{ url: "https://a.contoh.test/1", judul: "J", sumber: "S", wilayah: "dalam", kategori: "ekonomi", skor: 9, ringkasan: "r", dampak: "d" }] } });
  cek("edisi tidak sah → 400 menyebut item", r.s === 400 && /pilihan\[0\]: skor/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/berita/edisi", { token: TOK.tulis, body: "bukan objek" });
  cek("body bukan objek → 400", r.s === 400, r.j);
  r = await minta("POST", "/x/berita/edisi", {
    token: TOK.tulis,
    body: { garis_besar: "KONTRAK garis besar", kandidat: 0, pilihan: [
      { url: "https://a.contoh.test/1", judul: "J1", sumber: "S", wilayah: "dalam", kategori: "ekonomi", skor: 3, ringkasan: "r", dampak: "d" },
      { url: "https://a.contoh.test/2", judul: "J2", sumber: "S", wilayah: "luar", kategori: "logistik", skor: 5, ringkasan: "r", dampak: "d", bahan_relasi: "b" },
    ] },
  });
  cek("edisi sah → 200 {id, pilihan:2}", r.s === 200 && Number.isInteger(r.j?.id) && r.j?.pilihan === 2, r.j);
  const idEdisi = r.j?.id;
  r = await minta("GET", "/x/berita/kandidat", { token: TOK.baca });
  cek("kandidat memuat edisi_terakhir baru", r.j?.edisi_terakhir?.id === idEdisi && r.j.edisi_terakhir.pilihan[0].skor === 5, r.j?.edisi_terakhir);

  console.log("== tombol owner (/x/admin/berita-tarik)");
  r = await minta("POST", "/x/admin/berita-tarik");
  cek("tanpa sesi → 401", r.s === 401, r.j);
  const masuk = async (email) => {
    const kunci = sql("select 1") && execFileSync("bash", ["-c", "/tmp/sbcli/node_modules/.bin/supabase status -o env 2>/dev/null | grep '^PUBLISHABLE_KEY=' | cut -d'\"' -f2"], { encoding: "utf8" }).trim();
    const t = await fetch(`${AUTH}/token?grant_type=password`, { method: "POST", headers: { apikey: kunci, "content-type": "application/json" }, body: JSON.stringify({ email, password: "rahasia-dev-123" }) });
    return (await t.json()).access_token;
  };
  const jwtCitra = await masuk("citra.uji@contoh.test");
  const jwtBudi = await masuk("budi.uji@contoh.test");
  if (jwtCitra && jwtBudi) {
    r = await minta("POST", "/x/admin/berita-tarik", { sesi: jwtCitra });
    cek("sesi anggota biasa → 403", r.s === 403, r.j);
    r = await minta("POST", "/x/admin/berita-tarik", { sesi: jwtBudi });
    cek("sesi owner → 200 (ditunda: baru ditarik)", r.s === 200 && r.j?.ditunda === true, r.j);
  } else {
    cek("login uji GoTrue lokal (seed) berhasil", false, { jwtCitra: !!jwtCitra, jwtBudi: !!jwtBudi });
  }
  // Kong lokal menjawab CORS sendiri; di cloud fungsi yang menjawab → uji langsung ke kontainer edge runtime (IP privat
  // Docker, sama dengan uji/kontrak/_lib.mjs edgeLangsung)
  let ip = "";
  try {
    ip = execFileSync("docker", ["inspect", "supabase_edge_runtime_rhj-tugas", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/)[0];
  } catch { /* tanpa docker */ }
  if (/^(10|172|192)\./.test(ip)) {
    const pre = await fetch(`http://${ip}:8081/api/x/admin/berita-tarik`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:3000", "access-control-request-method": "POST", "access-control-request-headers": "x-sesi, content-type" } });
    cek("preflight OPTIONS (fungsi) → 204 + ACAO + x-sesi", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "http://127.0.0.1:3000"
      && /x-sesi/.test(pre.headers.get("access-control-allow-headers") ?? ""), pre.status);
    const asing = await fetch(`http://${ip}:8081/api/x/admin/berita-tarik`, { method: "OPTIONS", headers: { origin: "https://jahat.contoh.test", "access-control-request-method": "POST" } });
    cek("preflight origin asing → 403", asing.status === 403 && !asing.headers.get("access-control-allow-origin"), asing.status);
  } else {
    console.log("  (lewati uji CORS: kontainer edge runtime tidak ditemukan)");
  }
} finally {
  bersih();
}

console.log(`\n${hasil.lulus} cek lulus, ${hasil.gagal.length} gagal`);
process.exit(hasil.gagal.length ? 1 : 0);
