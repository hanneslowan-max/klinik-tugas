#!/usr/bin/env node
// Self-test logika pembagian seketika (supabase/functions/api/bagi.ts) — MURNI Node 22.18+ (TypeScript dibaca langsung).
// Kapso, Telegram, dan rpc DB TIRUAN di berkas ini; tanpa jaringan. Nomor tiruan 6281200000xxx.
//   node uji/wa/bagi.mjs            (UJI_VERBOSE=1 → cetak semua cek)
import { bagiProses, nomorLokal, putuskan, teksUmum } from "../../supabase/functions/api/bagi.ts";
import { envDari } from "../../supabase/functions/api/wa.ts";

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); console.log(`  GAGAL ${nama}${info === undefined ? "" : `  <- ${JSON.stringify(info).slice(0, 700)}`}`); }
}
const env = envDari((k) => ({ KAPSO_API_KEY: "kapso-tiruan", TELEGRAM_BOT_TOKEN: "tg-tiruan", KAPSO_API_URL: "http://kapso.tiruan",
  TELEGRAM_API_URL: "http://tg.tiruan" })[k]);
const SALES = [{ id: 11, nama: "Riksa" }, { id: 12, nama: "Michael" }];
const ts = (iso) => String(Math.floor(Date.parse(iso) / 1000));
const MASUK = "2026-11-12T02:00:00.000Z";   // 09.00 WIB
const calon = { id: 1, nomor: "6281200000701", percakapan: "conv-701", masuk_pada: MASUK };
const msk = (iso, body = "halo") => ({ id: `in-${iso}`, timestamp: ts(iso), type: "text", text: { body }, kapso: { direction: "inbound" } });
const klr = (iso, body) => ({ id: `out-${iso}`, timestamp: ts(iso), type: "text", text: { body }, kapso: { direction: "outbound" } });

// ---------------------------------------------------------------- putuskan
cek("chat baru belum dibalas → tugaskan giliran", putuskan(calon, [msk(MASUK)], SALES, 7).keputusan === "tugaskan"
    && putuskan(calon, [msk(MASUK)], SALES, 7).sales === undefined);
cek("pesan 2 hari sebelumnya → batal percakapan_berjalan",
    putuskan(calon, [msk("2026-11-10T02:00:00Z"), msk(MASUK)], SALES, 7).alasan === "percakapan_berjalan");
cek("pesan 8 hari sebelumnya → tetap chat baru",
    putuskan(calon, [msk("2026-11-04T01:00:00Z"), msk(MASUK)], SALES, 7).keputusan === "tugaskan");
cek("pesan 30 dtk sebelum pesan pertama (beruntun) → tidak dianggap lama",
    putuskan(calon, [msk("2026-11-12T01:59:30Z"), msk(MASUK)], SALES, 7).keputusan === "tugaskan");
const r1 = putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:40Z", "Selamat pagi, dengan Michael dari RHJ")], SALES, 7);
cek("sales membalas menyebut namanya → tugaskan ke sales itu", r1.keputusan === "tugaskan" && r1.sales === 12 && r1.alasan === "sudah_membalas", r1);
cek("sales membalas tanpa nama → batal sudah_dibalas",
    putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:40Z", "Selamat pagi, ada yang bisa dibantu?")], SALES, 7).alasan === "sudah_dibalas");
cek("dua nama disebut → batal sudah_dibalas",
    putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:40Z", "Saya Riksa, nanti Michael bantu")], SALES, 7).alasan === "sudah_dibalas");
cek("teks otomatis aplikasi tidak dihitung balasan",
    putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:05Z", "Terima kasih telah menghubungi Roda Hammerindo")], SALES, 7).keputusan === "tugaskan"
    && putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:05Z", "Terima kasih telah menghubungi Roda Hammerindo")], SALES, 7).sales === undefined);
cek("nama di dalam kata lain tidak cocok (Michaela)",
    putuskan(calon, [msk(MASUK), klr("2026-11-12T02:00:40Z", "Dengan Michaela")], SALES, 7).alasan === "sudah_dibalas");
cek("nomorLokal 62 → 0", nomorLokal("6281200000701") === "081200000701");
const t = teksUmum([{ id: 1, nomor: "6281200000701", pemilik_nama: "Riksa" }, { id: 2, nomor: "6281200000702", pemilik_nama: "Michael" }]);
cek("teks grup: nomor lokal + nama sales, tanpa nomor 62", t.includes("- 081200000701 → Riksa") && t.includes("- 081200000702 → Michael") && !t.includes("62812"), t);

// ---------------------------------------------------------------- bagiProses (tiruan rpc + fetch)
function buat({ aktif = true, items = [], umum = [], kapsoOk = true, pesan = {}, tgOk = true, chatSales = "-555" } = {}) {
  const log = { rpc: [], tg: [], kapso: [] };
  const rpc = async (fn, args) => {
    log.rpc.push([fn, args.p]);
    if (fn === "x_wa_bagi_ambil") return { aktif, hari_baru: 7, sales: SALES, items, umum };
    if (fn === "x_wa_bagi_hasil") {
      return { umum: args.p.items.filter((k) => k.keputusan === "tugaskan").map((k) => ({ id: k.id, nomor: items.find((c) => c.id === k.id).nomor,
        pemilik_nama: k.sales === 12 ? "Michael" : "Riksa" })) };
    }
    if (fn === "x_wa_bagi_umum") return { diubah: args.p.ids.length };
    throw new Error(`rpc tak dikenal ${fn}`);
  };
  const fetch = async (url, init) => {
    if (url.startsWith("http://kapso.tiruan")) {
      log.kapso.push(url);
      const conv = new URL(url).searchParams.get("conversation_id");
      if (!kapsoOk) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ data: pesan[conv] ?? [] }), { status: 200 });
    }
    if (url.startsWith("http://tg.tiruan")) {
      log.tg.push(JSON.parse(init.body));
      return new Response("{}", { status: tgOk ? 200 : 500 });
    }
    throw new Error(`fetch tak dikenal ${url}`);
  };
  return { d: { rpc, fetch, env, chatSales }, log };
}

{
  const { d, log } = buat({ aktif: false });
  const r = await bagiProses(d);
  cek("saklar mati → berhenti tanpa Kapso/Telegram", r.aktif === false && log.kapso.length === 0 && log.tg.length === 0, r);
}
{
  const items = [calon, { id: 2, nomor: "6281200000702", percakapan: "conv-702", masuk_pada: MASUK },
                 { id: 3, nomor: "6281200000703", percakapan: "conv-703", masuk_pada: MASUK }];
  const pesan = { "conv-701": [msk(MASUK)], "conv-702": [msk("2026-11-10T02:00:00Z"), msk(MASUK)],
                  "conv-703": [msk(MASUK), klr("2026-11-12T02:00:40Z", "Pagi, saya Michael")] };
  const { d, log } = buat({ items, pesan });
  const r = await bagiProses(d);
  const h = log.rpc.find((x) => x[0] === "x_wa_bagi_hasil")[1].items;
  cek("3 calon: giliran / berjalan / sudah_membalas", h.length === 3 && h[0].keputusan === "tugaskan" && h[1].alasan === "percakapan_berjalan"
      && h[2].sales === 12, h);
  cek("satu pesan Telegram ke grup sales berisi 2 penugasan", log.tg.length === 1 && log.tg[0].chat_id === "-555"
      && log.tg[0].text.includes("081200000701 → Riksa") && log.tg[0].text.includes("081200000703 → Michael")
      && !log.tg[0].text.includes("081200000702"), log.tg);
  const u = log.rpc.find((x) => x[0] === "x_wa_bagi_umum")[1];
  cek("umum ok dicatat untuk id 1 & 3", u.ok === true && JSON.stringify(u.ids) === "[1,3]", u);
  cek("hasil ringkas tanpa nomor", r.diumumkan === 2 && r.terkirim === true && !JSON.stringify(r).includes("62812"), r);
}
{
  const { d, log } = buat({ items: [calon], kapsoOk: false });
  await bagiProses(d);
  const h = log.rpc.find((x) => x[0] === "x_wa_bagi_hasil")[1].items;
  cek("Kapso gagal → tunda, tanpa Telegram", h[0].keputusan === "tunda" && log.tg.length === 0, h);
}
{
  const { d, log } = buat({ items: [calon], pesan: { "conv-701": [msk(MASUK)] }, tgOk: false });
  const r = await bagiProses(d);
  const u = log.rpc.find((x) => x[0] === "x_wa_bagi_umum")[1];
  cek("Telegram gagal → umum ok:false (diulang DB)", u.ok === false && r.terkirim === false, u);
}
{
  const { d, log } = buat({ items: [], umum: [{ id: 9, nomor: "6281200000709", pemilik_nama: "Michael" }] });
  await bagiProses(d);
  cek("pengumuman tertunda diulang tanpa calon baru", log.tg.length === 1 && log.tg[0].text.includes("081200000709 → Michael")
      && !log.rpc.some((x) => x[0] === "x_wa_bagi_hasil"), log);
}
{
  const { d, log } = buat({ items: [calon], pesan: { "conv-701": [msk(MASUK)] }, chatSales: "" });
  const r = await bagiProses(d);
  cek("TELEGRAM_CHAT_SALES kosong → tidak kirim, umum ok:false", log.tg.length === 0 && r.terkirim === false);
}

console.log(`\nbagi.ts: ${hasil.lulus} lulus, ${hasil.gagal.length} gagal`);
process.exit(hasil.gagal.length ? 1 : 0);
