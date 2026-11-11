#!/usr/bin/env node
// Self-test sapu sore (supabase/functions/api/sapu.ts + konteks sapu di wa.ts) — MURNI Node 22.18+, tiruan Kapso/rpc.
//   node uji/wa/sapu.mjs            (UJI_VERBOSE=1 → cetak semua cek)
import { belumDibalas, sapuProses } from "../../supabase/functions/api/sapu.ts";
import { envDari, nilaiChat, pesanUntukAi } from "../../supabase/functions/api/wa.ts";

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); console.log(`  GAGAL ${nama}${info === undefined ? "" : `  <- ${JSON.stringify(info).slice(0, 700)}`}`); }
}
const env = envDari((k) => ({ KAPSO_API_KEY: "kapso-tiruan", KAPSO_API_URL: "http://kapso.tiruan" })[k]);
const ts = (wib) => String(Math.floor(Date.parse(`${wib}:00+07:00`) / 1000));
const N = (n) => `6281200000${n}`;
let id = 0;
const msk = (n, wib, body = "Halo, mau tanya", ubah = {}) => ({ id: `in${++id}`, timestamp: ts(wib), type: "text", from: N(n), text: { body },
  kapso: { direction: "inbound", origin: "cloud_api", whatsapp_conversation_id: `conv-${n}` }, ...ubah });
const klr = (n, wib, body, origin = "business_app") => ({ id: `out${++id}`, timestamp: ts(wib), type: "text", to: N(n), text: { body },
  kapso: { direction: "outbound", origin } });
const SEJAK = new Date("2026-11-12T16:00:00+07:00").toISOString();
const SAMPAI = new Date("2026-11-12T17:00:00+07:00").toISOString();

const pesan = [
  msk(801, "2026-11-12 16:10"),                                                  // belum dibalas
  msk(802, "2026-11-12 16:05"), klr(802, "2026-11-12 16:20", "Baik, saya cek dulu"), // sudah dibalas
  klr(803, "2026-11-12 16:15", "Ini penawarannya"), msk(803, "2026-11-12 16:40", "Ok, kalau 50 unit?"), // dibalas lalu pelanggan menulis lagi
  msk(804, "2026-11-12 16:30"), klr(804, "2026-11-12 16:30", "Terima kasih telah menghubungi Roda Hammerindo"), // hanya teks otomatis aplikasi
  msk(805, "2026-11-12 17:05"),                                                  // sesudah jam tutup → alur luar jam biasa
  msk(806, "2026-11-12 16:45", "", { type: "sticker", text: undefined }),        // stiker saja
  msk(807, "2026-11-12 16:50"), klr(807, "2026-11-12 17:06", "Halo, saya asisten RHJ", "cloud_api"), // bot sudah membalas
  msk(808, "2026-11-12 15:40"), msk(808, "2026-11-12 16:55", "Halo?"),           // pertanyaan sejak 15:40, terakhir 16:55
];
const b = belumDibalas(pesan, SEJAK, SAMPAI);
const nom = b.map((x) => x.nomor).sort();
cek("belumDibalas: 801, 803, 804, 808", JSON.stringify(nom) === JSON.stringify([N(801), N(803), N(804), N(808)]), nom);
const x808 = b.find((x) => x.nomor === N(808));
cek("pesan pertama = pesan pertama sesudah balasan sales (15:40), terakhir 16:55, percakapan dari Kapso",
    x808?.pesan_pertama_pada === new Date("2026-11-12T15:40:00+07:00").toISOString()
    && x808?.pesan_terakhir_pada === new Date("2026-11-12T16:55:00+07:00").toISOString() && x808?.percakapan === "conv-808", x808);
cek("803: pesan pertama 16:40 (sesudah balasan sales 16:15)", b.find((x) => x.nomor === N(803))?.pesan_pertama_pada === new Date("2026-11-12T16:40:00+07:00").toISOString());

// ---------------------------------------------------------------- nilaiChat + prompt
const it = { antrean_id: 1, nomor: N(803), percakapan: "conv-803", pesan_pertama_pada: new Date("2026-11-12T16:40:00+07:00").toISOString(),
  pesan_terakhir_pada: new Date("2026-11-12T16:40:00+07:00").toISOString(), periode: "2026-11-13", hari: "besok pagi", bot_periode: 0, sisa: 3,
  percobaan: 0, id_bot: [] };
const p803 = pesan.filter((m) => m.from === N(803) || m.to === N(803));
cek("nilaiChat biasa: sales membalas < 24 jam → chat_berjalan", nilaiChat(p803, it, []).alasan === "chat_berjalan");
const n = nilaiChat(p803, { ...it, sapu: true }, []);
cek("nilaiChat sapu: lanjut, transkrip memuat balasan sales sebelumnya", n.lanjut === true && n.transkrip.includes("Ini penawarannya"), n);
const p2 = [...p803, klr(803, "2026-11-12 17:12", "Bisa Pak, saya hitung")];
cek("nilaiChat sapu: sales membalas sesudah pesan pelanggan → batal sales_membalas", nilaiChat(p2, { ...it, sapu: true }, []).alasan === "sales_membalas");
const u = pesanUntukAi({ ...it, sapu: true, pertama: true }, "Pelanggan: Ok");
cek("prompt sapu: minta maaf + di luar jam kerja + info lengkap [HARI]", /belum sempat dibalas/.test(u) && /di luar jam kerja/.test(u) && u.includes("[HARI]"), u);
cek("prompt biasa tanpa konteks sapu", !/belum sempat dibalas/.test(pesanUntukAi({ ...it, pertama: true }, "Pelanggan: Ok")));

// ---------------------------------------------------------------- sapuProses (tiruan)
function buat({ aktif = true, saklar = "kirim", kapsoOk = true, halaman = [pesan] } = {}) {
  const log = { rpc: [], kapso: [] };
  const rpc = async (fn, args) => {
    log.rpc.push([fn, args.p]);
    if (fn === "x_wa_sapu_mulai") return args.p.hasil ? { ok: true } : { aktif, saklar, sejak: SEJAK, sampai: SAMPAI };
    if (fn === "x_wa_sapu_antre") return { antre: args.p.items.length, lewat: {} };
    throw new Error(fn);
  };
  const fetch = async (url) => {
    log.kapso.push(url);
    if (!kapsoOk) return new Response("{}", { status: 503 });
    const u = new URL(url);
    const i = Number(u.searchParams.get("after") ?? 0);
    return new Response(JSON.stringify({ data: halaman[i] ?? [], paging: { cursors: { after: i + 1 < halaman.length ? String(i + 1) : null } } }), { status: 200 });
  };
  return { d: { rpc, fetch, env }, log };
}
{
  const { d, log } = buat({ aktif: false });
  const r = await sapuProses(d);
  cek("sapu mati → berhenti tanpa Kapso", r.aktif === false && log.kapso.length === 0);
  const { d: d2, log: l2 } = buat({ aktif: false });
  const r2 = await sapuProses({ ...d2, manual: true });
  cek("manual → jalan walau setelan mati", r2.ok === true && l2.kapso.length === 1, r2);
}
{
  const { d, log } = buat({ saklar: "mati" });
  const r = await sapuProses(d);
  cek("saklar bot bukan kirim → tidak mengantre", log.kapso.length === 0 && /saklar/.test(String(r.catatan)), r);
}
{
  const { d, log } = buat({ halaman: [pesan.slice(0, 6), pesan.slice(6)] });
  const r = await sapuProses(d);
  const a = log.rpc.find((x) => x[0] === "x_wa_sapu_antre")?.[1];
  cek("2 halaman Kapso digabung → 4 diantre", log.kapso.length === 2 && a?.items?.length === 4 && r.antre === 4 && r.belum_dibalas === 4, { r, k: log.kapso });
  cek("Kapso diminta dengan field arah/asal/percakapan + since", log.kapso[0].includes("whatsapp_conversation_id") && log.kapso[0].includes("since="));
  const h = log.rpc.filter((x) => x[0] === "x_wa_sapu_mulai").pop()?.[1]?.hasil;
  cek("hasil dicatat tanpa nomor", h?.antre === 4 && !JSON.stringify(h).includes("62812"), h);
}
{
  const { d } = buat({ kapsoOk: false });
  const r = await sapuProses(d);
  cek("Kapso gagal → ok false, tidak mengantre", r.ok === false && r.kapso === 503, r);
}

console.log(`\nsapu.ts: ${hasil.lulus} lulus, ${hasil.gagal.length} gagal`);
process.exit(hasil.gagal.length ? 1 : 0);
