#!/usr/bin/env node
// Kontrak rute Edge GET /x/pipeline/asal-situs + CLI `pipeline asal-situs` (20261111150000_pipeline_asal_situs) terhadap stack
// Supabase LOKAL (alamat tetap 127.0.0.1 → tidak mungkin menembak produksi). Syarat: `supabase start` + `supabase db reset` +
// `supabase functions serve`.
//   node uji/pipeline/asal-situs-kontrak.mjs
// Yang diuji: tanpa token 401, token baca bot 200 (angka per kelompok + jalur sesuai data), saringan produk & rentang lewat
// query string, galat 400 {err, ECODE}, CLI = respons Edge. Data uji (pelanggan & lead fiktif, tanggal 2026-10-22) dibuat
// lewat psql lalu dihapus.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "http://127.0.0.1:54321/functions/v1/api";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
async function minta(jalur, token) {
  const r = await fetch(`${API}${jalur}`, { headers: token ? { authorization: token } : {} });
  const raw = await r.text();
  let j = null;
  try { j = raw ? JSON.parse(raw) : null; } catch { /* bukan JSON */ }
  return { s: r.status, j, raw };
}

const TOK = "rtk_kontrak_asal_baca_1";
const ID_TOK = "d3d3d3d3-0000-4000-8000-000000000001";
const PL = "plkontrakasal";
const TGL = "2026-10-22";
// kelas bukti per lead (semua PM kecuali r4 Roda) · r1 & t1 ORDER
const LEAD = [
  ["ldkasr1", "web-rh", "Pallet Mesh", 2500000], ["ldkasr2", "ga-rh", "Pallet Mesh", null], ["ldkasr3", "situs-rh", "Pallet Mesh", null],
  ["ldkasr4", "web-rh", "Roda", null], ["ldkaso1", "web-oy", "Pallet Mesh", null], ["ldkasm1", "meta", "Pallet Mesh", null],
  ["ldkast1", "tanpa-sinyal", "Pallet Mesh", 4000000], ["ldkasl1", "katalog-wa", "Pallet Mesh", null], ["ldkasb1", null, "Pallet Mesh", null],
];

function bersih() {
  sql(`delete from public.api_tokens where id = '${ID_TOK}';
       delete from public.lead where pelanggan_id = '${PL}';
       delete from public.pelanggan where id = '${PL}';`);
}

const cekEdge = await fetch(`${API}/v2/user`).catch(() => null);
if (!cekEdge || cekEdge.status !== 401) {
  console.error("Edge lokal tidak terjangkau di 127.0.0.1:54321 (jalankan supabase functions serve)");
  process.exit(2);
}
const lain = Number(sql(`select count(*) from public.lead where tanggal_masuk = '${TGL}' and pelanggan_id <> '${PL}'`));
if (lain > 0) {
  console.error(`DB lokal sudah punya ${lain} lead bertanggal ${TGL}; jalankan di DB hasil db reset (seed tanpa Pipeline)`);
  process.exit(2);
}
bersih();
let no = 9500;
sql(`insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
       ('${ID_TOK}', 900000000002, 'kontrak asal baca', 'rtk_kab1', '${sha(TOK)}', 'baca');
     insert into public.pelanggan (id, nama) values ('${PL}', 'PT Kontrak Asal Fiktif');
     insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi) values
     ${LEAD.map(([id, , , nilai]) => nilai
       ? `('${id}', '${PL}', 'WA langsung', 100000002, 'ORDER', '${TGL}', '${no++}/RSG/X/2026', '${TGL}', ${nilai})`
       : `('${id}', '${PL}', 'WA langsung', 100000002, 'BARU', '${TGL}', null, null, null)`).join(",\n     ")};
     insert into public.lead_item (lead_id, produk, qty) values ${LEAD.map(([id, , produk]) => `('${id}', '${produk}', 1)`).join(", ")};
     select set_config('app.sumber_bukti_tulis', 'ya', true);
     update public.lead l set sumber_bukti = x.k, sumber_bukti_diisi_pada = now()
       from (values ${LEAD.filter(([, k]) => k).map(([id, k]) => `('${id}', '${k}')`).join(", ")}) x(id, k) where l.id = x.id;`);

try {
  const q = `?sejak=${TGL}&sampai=${TGL}`;
  let r = await minta(`/x/pipeline/asal-situs${q}`);
  cek("tanpa token → 401", r.s === 401 && r.j?.ECODE === "OAUTH_017", r);

  r = await minta(`/x/pipeline/asal-situs${q}`, TOK);
  const kel = (j, k) => j?.kelompok?.find((x) => x.kelompok === k);
  cek("token baca bot → 200, cakupan semua, rentang dari query", r.s === 200 && r.j?.cakupan === "semua" && r.j?.sejak === TGL
    && r.j?.sampai === TGL && r.j?.produk === null && r.j?.bukti_sejak === "2026-10-21", r.j);
  cek("urutan kelompok tetap", r.j?.kelompok?.map((x) => x.kelompok).join(",") === "situs_rh,situs_oy,meta,lain,tanpa_kode,belum", r.j);
  cek("semua produk: total 9 lead, 2 order, Rp6.500.000", r.j?.total?.lead === 9 && r.j?.total?.order === 2 && r.j?.total?.nilai === 6500000, r.j?.total);
  cek("situs RH 4 (organik 3 = web-rh 2 + situs-rh 1, Google Ads 1)", kel(r.j, "situs_rh")?.lead === 4
    && JSON.stringify(kel(r.j, "situs_rh")?.jalur?.map((x) => [x.jalur, x.lead])) === JSON.stringify([["organik", 3], ["google_ads", 1]]), kel(r.j, "situs_rh"));
  cek("katalog-wa → lain; meta/tanpa kode/belum masing-masing 1", kel(r.j, "lain")?.lead === 1 && kel(r.j, "lain")?.kelas?.[0]?.kelas === "katalog-wa"
    && kel(r.j, "meta")?.lead === 1 && kel(r.j, "tanpa_kode")?.order === 1 && kel(r.j, "belum")?.lead === 1 && kel(r.j, "meta")?.jalur === undefined, r.j);

  r = await minta(`/x/pipeline/asal-situs${q}&produk=${encodeURIComponent("Pallet Mesh")}`, TOK);
  cek("produk Pallet Mesh: Roda web-rh tidak ikut (RH 3, total 8)", r.s === 200 && r.j?.produk === "Pallet Mesh" && kel(r.j, "situs_rh")?.lead === 3
    && r.j?.total?.lead === 8, r.j);
  const edgePm = r.j;

  r = await minta(`/x/pipeline/asal-situs`, TOK);
  cek("tanpa query: bawaan sejak 2026-10-21 s/d hari ini", r.s === 200 && r.j?.sejak === "2026-10-21"
    && r.j?.sampai === sql("select to_char(public.hari_ini_wib(), 'YYYY-MM-DD')") && r.j?.total?.lead >= 9, r.j);
  r = await minta(`/x/pipeline/asal-situs?produk=Kursi`, TOK);
  cek("produk tak dikenal → 400 INPUT_001", r.s === 400 && r.j?.ECODE === "INPUT_001" && /produk/.test(r.j?.err ?? ""), r.j);
  r = await minta(`/x/pipeline/asal-situs?sejak=2026-11-05&sampai=2026-11-01`, TOK);
  cek("sejak > sampai → 400", r.s === 400 && r.j?.ECODE === "INPUT_001", r.j);

  // CLI = Edge
  const cli = (args) => execFileSync("node", [path.join(ROOT, "cli", "tugas.mjs"), ...args], {
    env: { PATH: process.env.PATH, TUGAS_API_URL: `${API}/v2`, TUGAS_API_TOKEN: TOK }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const keluar = JSON.parse(cli(["pipeline", "asal-situs", "--produk", "Pallet Mesh", "--sejak", TGL, "--sampai", TGL]));
  cek("CLI pipeline asal-situs = respons Edge", JSON.stringify(keluar) === JSON.stringify(edgePm), keluar);
  let galat = "";
  try { cli(["pipeline", "asal-situs", "--sejak", "22-10-2026"]); } catch (e) { galat = String(e.stderr ?? e.message); }
  cek("CLI --sejak salah format ditolak sebelum request", /--sejak harus YYYY-MM-DD/.test(galat), galat);
} finally {
  bersih();
}

console.log(`\nLulus ${hasil.lulus}, gagal ${hasil.gagal.length}`);
process.exit(hasil.gagal.length ? 1 : 0);
