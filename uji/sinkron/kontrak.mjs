#!/usr/bin/env node
// Kontrak rute Edge sinkron dari luar (20261110120000_pipeline_sinkron_luar) terhadap stack Supabase LOKAL (alamat tetap
// 127.0.0.1 → tidak mungkin menembak produksi). Syarat: `supabase start` + `supabase db reset` + `supabase functions serve`.
//   node uji/sinkron/kontrak.mjs
// Yang diuji: POST /x/pipeline/lead-otomatis & /x/pipeline/order-erp (satu item → status, batch → hasil per item,
// idempoten, galat PTxxx → HTTP + {err, ECODE}, scope token), GET /x/pipeline/tautan (baca, saring, tanpa nomor HP).
// Data uji (nomor fiktif 0811-0003-9xxx) dibuat lewat API lalu dihapus lewat psql lokal.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const API = "http://127.0.0.1:54321/functions/v1/api";
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
async function minta(metode, jalur, { token, body } = {}) {
  const h = {};
  if (token) h.authorization = token;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(`${API}${jalur}`, { method: metode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await r.text();
  let j = null;
  try { j = raw ? JSON.parse(raw) : null; } catch { /* bukan JSON */ }
  return { s: r.status, j, raw };
}

const TOK = { tulis: "rtk_kontrak_sinkron_tulis_1", baca: "rtk_kontrak_sinkron_baca_1" };
const ID = { tulis: "d2d2d2d2-0000-4000-8000-000000000001", baca: "d2d2d2d2-0000-4000-8000-000000000002" };
const hari = (n = 0) => sql(`select to_char(public.hari_ini_wib() - ${Number(n)}, 'YYYY-MM-DD')`);
const HP = ["081100039001", "081100039002", "081100039003"];
const NORM = HP.map((h) => `62${h.slice(1)}`);

function bersih() {
  const daftar = NORM.map((n) => `'${n}'`).join(",");
  sql(`delete from public.api_tokens where id in ('${ID.tulis}','${ID.baca}');
       delete from public.pipeline_tautan_luar where kunci_luar like 'wa:K-kt%' or kunci_luar like 'erp-sp:kontrak-%';
       create temp table x_lead as select l.id, l.pelanggan_id from public.lead l join public.kontak k on k.id = l.kontak_id where k.telepon in (${daftar});
       delete from public.lead where id in (select id from x_lead);
       delete from public.kontak where telepon in (${daftar});
       delete from public.pelanggan p where p.id in (select pelanggan_id from x_lead)
         and not exists (select 1 from public.lead l where l.pelanggan_id = p.id);`);
}

const cekEdge = await fetch(`${API}/v2/user`).catch(() => null);
if (!cekEdge || cekEdge.status !== 401) {
  console.error("Edge lokal tidak terjangkau di 127.0.0.1:54321 (jalankan supabase functions serve)");
  process.exit(2);
}
bersih();
// citra = rep RSG ("Riksa"), dodi = rep MCE ("Michael") di DB lokal (seed sintetis). Isi pipeline_akses lama disimpan dan
// dikembalikan di akhir (tes DB lain memasukkan baris akses tanpa ON CONFLICT).
const aksesLama = sql(`select coalesce(json_agg(row_to_json(a)), '[]') from public.pipeline_akses a where member_id in (100000002, 100000003)`);
function pulihAkses() {
  sql(`delete from public.pipeline_akses where member_id in (100000002, 100000003);
       insert into public.pipeline_akses select * from json_populate_recordset(null::public.pipeline_akses, '${aksesLama.replace(/'/g, "''")}');`);
}
sql(`insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG'), (100000003, 'rep', 'MCE')
       on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
     insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
       ('${ID.tulis}', 900000000002, 'kontrak sinkron tulis', 'rtk_kst1', '${sha(TOK.tulis)}', 'tulis'),
       ('${ID.baca}', 900000000002, 'kontrak sinkron baca', 'rtk_ksb1', '${sha(TOK.baca)}', 'baca')`);

const chat = (kode, hp, ubah = {}) => ({ kunci_luar: `wa:${kode}:${hari()}`, hp, sumber: "Meta Ads", ...ubah });
const sp = (so, no, nilai, ubah = {}) => ({ erp_so_id: `kontrak-${so}`, no_sp: no, tanggal_sp: hari(), nilai, ...ubah });

try {
  console.log("== lead-otomatis");
  let r = await minta("POST", "/x/pipeline/lead-otomatis", { body: chat("K-kt0001", HP[0]) });
  cek("tanpa token → 401", r.s === 401 && r.j?.ECODE === "OAUTH_017", r);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.baca, body: chat("K-kt0001", HP[0]) });
  cek("token baca → 403 scope", r.s === 403 && /Scope/.test(r.j?.err ?? ""), r);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: chat("K-kt0001", HP[0], {
    pelanggan: "PT Kontrak Fiktif", pemilik: 100000002, alasan_pemilik: "balasan", produk: [{ produk: "Pallet Mesh", qty: 10 }] }) });
  cek("satu chat → 200 {status:dibuat, lead_id, kode, pemilik}", r.s === 200 && r.j?.status === "dibuat" && /^ld/.test(r.j?.lead_id ?? "")
    && /^L-\d+/.test(r.j?.kode ?? "") && r.j?.pemilik === 100000002, r);
  const lead1 = r.j?.lead_id;
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: chat("K-kt0001", HP[0]) });
  cek("kunci sama → sudah_ada (lead sama)", r.s === 200 && r.j?.status === "sudah_ada" && r.j?.lead_id === lead1, r.j);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: chat("K-kt0002", HP[0]) });
  cek("nomor ber-lead terbuka → lead_terbuka_ada", r.s === 200 && r.j?.status === "lead_terbuka_ada" && r.j?.lead_id === lead1, r.j);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: chat("K-kt0003", HP[1], { sumber: "Instagram" }) });
  cek("tidak sah → 400 INPUT_001 + pesan", r.s === 400 && r.j?.ECODE === "INPUT_001" && /sumber wajib/.test(r.j?.err ?? ""), r.j);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: { items: [chat("K-kt0004", HP[1]), chat("K-kt0005", "08")] } });
  cek("batch → 200 per item (1 dibuat, 1 gagal 400)", r.s === 200 && r.j?.diproses === 2 && r.j?.ok === 1 && r.j?.items?.[0]?.status === "dibuat"
    && r.j?.items?.[1]?.ok === false && r.j?.items?.[1]?.status_http === 400 && /^items\[1\]/.test(r.j?.items?.[1]?.err ?? ""), r.j);
  r = await minta("POST", "/x/pipeline/lead-otomatis", { token: TOK.tulis, body: { items: Array.from({ length: 101 }, (_, i) => chat(`K-kt${String(i).padStart(4, "9")}`, HP[2])) } });
  cek("batch > 100 → 400", r.s === 400 && /Maksimal 100/.test(r.j?.err ?? ""), r.j);
  r = await minta("GET", "/x/pipeline/lead-otomatis", { token: TOK.tulis });
  cek("GET lead-otomatis → bukan rute (404/405)", r.s === 404 || r.s === 405, r.s);

  console.log("== order-erp");
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.baca, body: sp("1", "0901/RSG/XI/2026", 1000000) });
  cek("token baca → 403", r.s === 403, r.s);
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.tulis, body: sp("1", "0901/RSG/XI/2026", 1500000, { hp: HP[0],
    items: [{ deskripsi: "Pallet mesh lipat", qty: 10, jenis: "Pallet Mesh" }] }) });
  cek("SP dengan HP ber-lead terbuka → diperbarui (lead WA tadi jadi ORDER)", r.s === 200 && r.j?.status === "diperbarui" && r.j?.lead_id === lead1
    && r.j?.cara === "hp", r.j);
  cek("lead ORDER dengan No SP ERP", sql(`select tahap || ' ' || no_sp || ' ' || nilai_transaksi from public.lead where id = '${lead1}'`)
    === "ORDER 0901/RSG/XI/2026 1500000");
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.tulis, body: sp("1", "0901/RSG/XI/2026", 1500000, { hp: HP[0] }) });
  cek("kirim ulang → tidak_berubah", r.s === 200 && r.j?.status === "tidak_berubah", r.j);
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.tulis, body: { items: [
    sp("2", "0902/MCE/XI/2026", 800000, { hp: HP[2], pelanggan: "CV Kontrak Fiktif", items: [{ deskripsi: "Roda 4 inch", qty: 4, jenis: "Roda" }] }),
    sp("3", "0903/XYZ/XI/2026", 800000),
    sp("1", "0901/RSG/XI/2026", 1500000, { batal: true }),
  ] } });
  cek("batch ERP → dibuat / dilewati_bukan_online / diperbarui (batal)", r.s === 200
    && r.j?.items?.map((x) => x.status).join(",") === "dibuat,dilewati_bukan_online,diperbarui", r.j);
  cek("SP batal → order batal", sql(`select tahap || ' ' || alasan_batal from public.lead where id = '${lead1}'`) === "BATAL Order dibatalkan");
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.tulis, body: sp("1", "0901/RSG/XI/2026", 1500000) });
  cek("SP aktif lagi sesudah batal final → 409 KONFLIK_001", r.s === 409 && r.j?.ECODE === "KONFLIK_001", r.j);
  r = await minta("POST", "/x/pipeline/order-erp", { token: TOK.tulis, body: sp("4", "0904/RSG/XI/2026", 0) });
  cek("nilai 0 SP aktif → 400", r.s === 400 && r.j?.ECODE === "INPUT_001", r.j);

  console.log("== tautan");
  r = await minta("GET", "/x/pipeline/tautan", { token: TOK.baca });
  cek("tautan (token baca) → 200 {total, sejak, items}", r.s === 200 && Number.isInteger(r.j?.total) && Array.isArray(r.j?.items)
    && r.j.items.some((x) => x.kunci_luar === "erp-sp:kontrak-1"), r.j);
  cek("tautan tanpa nomor HP", !NORM.some((n) => r.raw.includes(n)) && !HP.some((n) => r.raw.includes(n)));
  r = await minta("GET", "/x/pipeline/tautan?jenis=wa&batas=2", { token: TOK.baca });
  cek("tautan ?jenis=wa&batas=2", r.s === 200 && r.j.items.length <= 2 && r.j.items.every((x) => x.jenis === "wa"), r.j);
  r = await minta("GET", `/x/pipeline/tautan?sejak=${hari(-1)}`, { token: TOK.baca });
  cek("tautan ?sejak=besok → 0", r.s === 200 && r.j?.total === 0, r.j);
  r = await minta("GET", "/x/pipeline/tautan?jenis=sms", { token: TOK.baca });
  cek("tautan jenis tidak sah → 400", r.s === 400, r.s);
} finally {
  bersih();
  pulihAkses();
}

console.log(`\nLulus ${hasil.lulus}, gagal ${hasil.gagal.length}`);
process.exit(hasil.gagal.length ? 1 : 0);
