#!/usr/bin/env node
// uji/banding.mjs — uji banding output CLI (ARSITEKTUR §12):
//   A = clickup.mjs ASLI (rhj-brain/tools/clickup.mjs; salinan di folder temp, hanya konstanta BASE + URL v3 diganti)
//       → server ClickUp tiruan (impor/uji/mock-clickup.mjs, fixture sintetis)
//   B = cli/tugas.mjs mode tugas → Edge `api` lokal, SETELAH fixture yang sama diimpor lewat impor/sinkron.mjs
// Perintah baca: whoami, tasks (±--closed, --full), folder-tasks (±--closed), task, comments (±--replies), agenda
// (jam dibekukan lewat uji/banding/beku-waktu.mjs), fields, + 1 kasus galat. Dibandingkan secara struktural setelah
// normalisasi yang DICATAT (uji/banding/normalisasi.mjs + README). Target: sisa beda = 0.
//
//   node uji/banding.mjs [--varian awal|ubah] [--lewati-impor] [--saring <regex perintah>] [--izinkan-diketahui] [--simpan]
// Syarat: Supabase lokal + `supabase functions serve`. Exit 0 = sisa beda 0, 1 = ada beda/gagal, 2 = prasyarat.
// Hasil: uji/banding/hasil/<waktu>-<varian>.json (gitignored).

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mulaiMock } from "../impor/uji/mock-clickup.mjs";
import { BOT_ID, MOCK_PORT, SINKRON, Token, edgeSiap, jalankanNode, konfigurasi, psql } from "../impor/uji/_bantu.mjs";
import { DIKETAHUI, beda, buatAturan, urutanKunciBeda } from "./banding/normalisasi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CLI_TUGAS = path.join(ROOT, "cli", "tugas.mjs");
const BEKU = pathToFileURL(path.join(HERE, "banding", "beku-waktu.mjs")).href;
const HASIL_DIR = path.join(HERE, "banding", "hasil");
const ASLI_KANDIDAT = [process.env.CLICKUP_MJS_ASLI, "/home/user/rhj-brain/tools/clickup.mjs", path.join(ROOT, "uji", "kontrak", "asli", "clickup.mjs")].filter(Boolean);

// ---------------------------------------------------------------- argumen
const argv = process.argv.slice(2);
const opsi = { varian: "awal", lewatiImpor: false, saring: null, izinkanDiketahui: false, simpan: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--varian") opsi.varian = argv[++i];
  else if (a === "--lewati-impor") opsi.lewatiImpor = true;
  else if (a === "--saring") opsi.saring = new RegExp(argv[++i]);
  else if (a === "--izinkan-diketahui") opsi.izinkanDiketahui = true;
  else if (a === "--simpan") opsi.simpan = true;
  else { console.error(`banding: argumen tidak dikenal ${a}`); process.exit(2); }
}
if (!["awal", "ubah"].includes(opsi.varian)) { console.error("banding: --varian awal|ubah"); process.exit(2); }

// ---------------------------------------------------------------- salinan clickup.mjs (hanya BASE + URL v3)
function siapkanClickupAsli(base) {
  const asli = ASLI_KANDIDAT.find((p) => fs.existsSync(p));
  if (!asli) throw new Error("clickup.mjs asli tidak ditemukan");
  const src = fs.readFileSync(asli, "utf8");
  const A = 'const BASE = "https://api.clickup.com/api/v2";';
  const V3 = "https://api.clickup.com/api/v3/";
  if (src.split(A).length !== 2 || src.split(V3).length !== 2) throw new Error("penanda BASE/v3 tidak tepat satu kali di clickup.mjs");
  const baru = src.replace(A, `const BASE = ${JSON.stringify(base)};`).replace(V3, `${base.replace(/\/v2$/, "/v3")}/`);
  const barisA = src.split("\n"), barisB = baru.split("\n");
  const berubah = barisA.filter((l, i) => l !== barisB[i]).length;
  if (barisA.length !== barisB.length || berubah !== 2 || baru.includes("api.clickup.com")) throw new Error(`salinan clickup.mjs berubah ${berubah} baris (harus 2)`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rhj-banding-"));
  const f = path.join(dir, "clickup.mjs");
  fs.writeFileSync(f, baru);
  return { f, asli, sha: crypto.createHash("sha256").update(src).digest("hex"), dir };
}

async function pool(items, n, fn) {
  let i = 0;
  const out = new Array(items.length);
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

function daftarPerintah(model) {
  const p = [["whoami"]];
  for (const id of model.lists.keys()) p.push(["tasks", id], ["tasks", id, "--closed"], ["tasks", id, "--closed", "--full"]);
  for (const id of model.folders.keys()) p.push(["folder-tasks", id], ["folder-tasks", id, "--closed"]);
  const berkomentar = new Set([...model.comments.values()].map((c) => c.task));
  for (const id of model.tasks.keys()) {
    p.push(["task", id], ["comments", id, "--replies"]);
    if (berkomentar.has(id)) p.push(["comments", id]);
  }
  p.push(["agenda", "901822000011", "--hours", "26"], ["agenda", "901822000011", "--hours", "26", "--desc", "--all-comments"],
    ["agenda", "901822000011", "--hours", "400"], ["agenda", "901822000012", "--hours", "72", "--all-comments"],
    ["agenda", "901822000014", "--hours", "26"], ["fields", "901822000101"], ["task", "86b2zzzzz"]);
  return opsi.saring ? p.filter((c) => opsi.saring.test(c.join(" "))) : p;
}

// ---------------------------------------------------------------- utama
const cfg = konfigurasi();
if (!(await edgeSiap(cfg))) {
  console.error(`banding: Edge api tidak jalan di ${cfg.api} (jalankan: supabase functions serve)`);
  process.exit(2);
}
const RUN = crypto.randomBytes(3).toString("hex").slice(0, 4);
const mock = await mulaiMock({ port: MOCK_PORT, varian: opsi.varian, run: RUN });
const tok = new Token(cfg, `banding-${opsi.varian}`);
let tImpor = null;
let kode = 1;
const impor = async (label) => {
  const r = await jalankanNode([SINKRON, "--mode", "penuh"], {
    CLICKUP_API_TOKEN: mock.token, CLICKUP_API_BASE: mock.base, TUGAS_API_URL: cfg.api, TUGAS_IMPORT_TOKEN: tImpor, SINKRON_RPM: "6000",
    SINKRON_LAPORAN_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "rhj-banding-laporan-")),
  });
  console.log(`impor (${label}): kode ${r.code}, sensus ${JSON.stringify(r.json?.sensus)}, tulis tugas ${JSON.stringify(r.json?.tulis?.tasks)}`);
  return r;
};

try {
  tImpor = await tok.buat(BOT_ID, "impor", "importer");
  if (!opsi.lewatiImpor) {
    const r = await impor(opsi.varian);
    if (r.code !== 0 || r.json?.sensus?.selisih !== 0) throw new Error(`impor fixture gagal/selisih: kode ${r.code} ${r.stderr.slice(-400)}`);
  }
  const model = mock.model;
  // (R2) importer belum mengirim `members` space; ClickUp menyajikan space privat ke pemilik token → beri keanggotaan (sumber app)
  for (const s of model.spaces.values()) if (s.private) psql(`insert into public.space_anggota (space_id, member_id) values ('${s.id}', ${model.pemilik}) on conflict do nothing`);
  const tBaca = await tok.buat(model.pemilik, "baca", "pembaca");
  const asli = siapkanClickupAsli(mock.base);
  console.log(`clickup.mjs asli: ${asli.asli} (sha ${asli.sha.slice(0, 12)}) → ${asli.f} (2 baris diganti: BASE, URL v3)`);

  const appBase = JSON.parse(psql("select value::text from public.app_settings where key = 'app_base_url'") || '"https://tugas.palletmeshindonesia.com"');
  const timApp = await (await fetch(`${cfg.api}/team`, { headers: { Authorization: tBaca } })).json();
  const idTiruan = new Set([...model.users.values()].filter((u) => u.tim).map((u) => u.id));
  const luar = (timApp.teams?.[0]?.members || []).map((m) => m.user.id).filter((id) => !idTiruan.has(id));
  const aturan = buatAturan({ appBase, anggotaLuar: luar.length });

  const perintah = daftarPerintah(model);
  const envA = { CLICKUP_API_TOKEN: mock.token, BEKU_WAKTU: model.sekarang };
  const envB = { TUGAS_API_URL: cfg.api, TUGAS_API_TOKEN: tBaca, BEKU_WAKTU: model.sekarang };
  console.log(`menjalankan ${perintah.length} perintah × 2 sisi (jam beku ${model.sekarang})…`);
  const t0 = Date.now();
  const hasil = await pool(perintah, 4, async (cmd) => {
    const [a, b] = await Promise.all([
      jalankanNode(["--import", BEKU, asli.f, ...cmd], envA, { timeout: 300_000 }),
      jalankanNode(["--import", BEKU, CLI_TUGAS, ...cmd], envB, { timeout: 300_000 }),
    ]);
    return { cmd, a, b };
  });
  console.log(`selesai dalam ${Math.round((Date.now() - t0) / 1000)} dtk`);

  // ------------------------------------------------ bandingkan
  const per = { N4: 0 };
  for (const x of aturan) per[x.id] = { perubahan: 0, beda_diserap: 0 };
  const laporan = [];
  let mentahTotal = 0, cmdMentah = 0;
  const cekLampiran = [];
  for (const { cmd, a, b } of hasil) {
    const r = { perintah: cmd.join(" "), kode: [a.code, b.code], beda: [] };
    if (a.code !== b.code) r.beda.push({ jalur: "(kode keluar)", clickup: a.code, tugas: b.code });
    if (a.code !== 0 || b.code !== 0) {
      // kasus galat: bandingkan pesan sampai "HTTP <status>:"; teks err server (ClickUp vs app) dinormalisasi (N11)
      const norm = (s) => s.trim().replace(/^(clickup|tugas): /, "⟨cli⟩: ").replace(/(HTTP \d{3}): .*$/s, "$1: ⟨pesan server⟩");
      if (norm(a.stderr) !== norm(b.stderr)) r.beda.push({ jalur: "(stderr)", clickup: a.stderr.trim(), tugas: b.stderr.trim() });
      r.n11 = true;
      laporan.push(r);
      continue;
    }
    if (a.json === null || b.json === null) {
      r.beda.push({ jalur: "(stdout bukan JSON)", clickup: a.stdout.slice(0, 200), tugas: b.stdout.slice(0, 200) });
      laporan.push(r);
      continue;
    }
    if (urutanKunciBeda(a.json, b.json)) per.N4++;
    if (cmd[0] === "task") cekLampiran.push({ id: cmd[1], a: a.json, b: b.json });
    const A = structuredClone(a.json), B = structuredClone(b.json);
    let sebelum = beda(A, B).length;
    mentahTotal += sebelum;
    if (sebelum) cmdMentah++;
    r.mentah = sebelum;
    for (const x of aturan) {
      const n = x.terapkan(cmd, A, B);
      const sesudah = beda(A, B).length;
      per[x.id].perubahan += n;
      per[x.id].beda_diserap += Math.max(0, sebelum - sesudah);
      sebelum = sesudah;
    }
    r.beda.push(...beda(A, B));
    laporan.push(r);
  }

  // isi lampiran: signed URL app harus mengunduh byte yang sama dengan berkas fixture
  let lampOk = 0;
  const lampGagal = [];
  for (const { id, a, b } of cekLampiran) {
    for (const [i, x] of (b.attachments || []).entries()) {
      const y = a.attachments?.[i];
      const src = mock.model.lampiran.get(x.id);
      if (!y || !src) { lampGagal.push({ task: id, lampiran: x.id, err: "tak ada pasangan" }); continue; }
      if (x.url === y.url) { lampOk++; continue; } // tautan_saja/gagal: app memakai clickup_url
      const buf = src.berkas ? mock.model.berkas.get(src.berkas) : null;
      try {
        const res = await fetch(x.url);
        const isi = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf && isi.equals(buf)) lampOk++;
        else lampGagal.push({ task: id, lampiran: x.id, status: res.status, ukuran: isi.length });
      } catch (e) { lampGagal.push({ task: id, lampiran: x.id, err: e.message }); }
    }
  }

  const sisa = laporan.filter((r) => r.beda.length);
  const label = (d) => DIKETAHUI.find((k) => k.pola.test(d.jalur))?.id ?? null;
  for (const r of sisa) for (const d of r.beda) d.diketahui = label(d);
  const tidakDiketahui = sisa.filter((r) => r.beda.some((d) => !d.diketahui));
  const nSisa = sisa.reduce((n, r) => n + r.beda.length, 0);

  console.log(`\n== Banding varian ${opsi.varian}: ${laporan.length} perintah`);
  console.log(`kode keluar sama: ${laporan.filter((r) => r.kode[0] === r.kode[1]).length}/${laporan.length}; kasus galat: ${laporan.filter((r) => r.n11).length}`);
  console.log(`beda mentah (sebelum normalisasi): ${mentahTotal} entri di ${cmdMentah} perintah; urutan kunci beda (N4, struktural): ${per.N4} perintah`);
  for (const x of aturan) console.log(`  ${x.id} [${x.kategori}] ${x.nama}: ${per[x.id].perubahan} nilai dinormalisasi, ${per[x.id].beda_diserap} entri beda diserap`);
  console.log(`  N11 [ditemukan] teks pesan galat server (kasus galat): ${laporan.filter((r) => r.n11).length} perintah; format "<cli>: GAGAL -> <method> <path> -> HTTP <status>: " tetap dibandingkan`);
  console.log(`isi lampiran (signed URL app = berkas fixture / tautan ClickUp sama): ${lampOk} ok, ${lampGagal.length} gagal${lampGagal.length ? " " + JSON.stringify(lampGagal) : ""}`);
  console.log(`SISA BEDA: ${nSisa} entri di ${sisa.length} perintah` + (sisa.length ? ` (di luar daftar diketahui: ${tidakDiketahui.length} perintah)` : ""));
  for (const r of sisa.slice(0, 40)) {
    console.log(`  - ${r.perintah}`);
    for (const d of r.beda.slice(0, 6)) console.log(`      ${d.jalur}: clickup=${JSON.stringify(d.clickup)?.slice(0, 160)} · tugas=${JSON.stringify(d.tugas)?.slice(0, 160)}${d.diketahui ? ` [${d.diketahui}]` : ""}`);
  }
  for (const k of DIKETAHUI) {
    const n = sisa.filter((r) => r.beda.some((d) => d.diketahui === k.id)).length;
    if (n) console.log(`  ${k.id}: ${k.ringkas} — ${n} perintah`);
  }

  fs.mkdirSync(HASIL_DIR, { recursive: true });
  const berkas = path.join(HASIL_DIR, `${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}-${opsi.varian}.json`);
  fs.writeFileSync(berkas, JSON.stringify({
    varian: opsi.varian, jam_beku: model.sekarang, clickup_asli: { path: asli.asli, sha256: asli.sha }, perintah: laporan.length,
    beda_mentah: mentahTotal, normalisasi: Object.fromEntries(aturan.map((x) => [x.id, { ...per[x.id], kategori: x.kategori, nama: x.nama, alasan: x.alasan }])),
    urutan_kunci_beda: per.N4, anggota_luar_fixture: luar.length, lampiran: { ok: lampOk, gagal: lampGagal },
    sisa: sisa.map((r) => ({ perintah: r.perintah, kode: r.kode, beda: r.beda })),
    ...(opsi.simpan ? { mentah: hasil.map(({ cmd, a, b }) => ({ perintah: cmd.join(" "), clickup: a.json ?? a.stderr, tugas: b.json ?? b.stderr })) } : {}),
  }, null, 2));
  console.log(`hasil: ${path.relative(ROOT, berkas)}`);
  fs.rmSync(asli.dir, { recursive: true, force: true });
  kode = (tidakDiketahui.length || (!opsi.izinkanDiketahui && sisa.length) || lampGagal.length) ? 1 : 0;
} catch (e) {
  console.error(`banding: GAGAL -> ${e.stack || e.message}`);
  kode = 1;
} finally {
  if (opsi.varian !== "awal" && tImpor) {
    mock.ganti({ varian: "awal" });
    await impor("pulihkan ke awal").catch((e) => console.error(`pulihkan gagal: ${e.message}`));
  }
  const n = await tok.bersihkan().catch(() => -1);
  console.log(`token uji dibersihkan: ${n}`);
  await mock.tutup();
}
process.exit(kode);
