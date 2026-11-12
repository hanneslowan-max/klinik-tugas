// Bukti "byte-identik" cli/tugas.mjs terhadap clickup.mjs asli (rhj-brain/tools/clickup.mjs).
// 1) Statis: potongan kode brief/getComments/allTasks/agenda/parser argumen/--dry-run/{deleted}/pesan galat sama persis.
// 2) Perilaku: perintah yang sama dijalankan lewat
//      A = clickup.mjs asli (BASE diarahkan ke Edge lokal),
//      B = cli/tugas.mjs mode tugas,
//      C = salinan cli/tugas.mjs bernama clickup.mjs (mode clickup, BASE diarahkan ke Edge lokal)
//    → stdout A = B = C byte-per-byte; stderr A = C, dan B = A dengan prefix "clickup:" → "tugas:"; exit code sama.
//    Normalisasi hanya: `sejak` di agenda (Date.now() tiap proses) dan query token signed URL lampiran.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLI, HERE, cek, jalankan, sama } from "./_lib.mjs";

const SNAPSHOT = path.join(HERE, "asli", "clickup.mjs");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function potong(teks, awal, akhir) {
  const i = teks.indexOf(awal);
  if (i < 0) return null;
  const j = akhir ? teks.indexOf(akhir, i + awal.length) : teks.length;
  if (j < 0) return null;
  return teks.slice(i, j);
}

// [nama, penanda awal, penanda akhir (eksklusif)]
const SEGMEN = [
  ["loadEnv", "function loadEnv(file) {", "const env = loadEnv("],
  ["pesan galat HTTP api()", "    const text = await res.text();", "// --- argumen ---"],
  ["parser argumen + toMs/out/wibDate/brief + getComments", "// --- argumen ---", "async function allTasks("],
  ["allTasks", "async function allTasks(", "async function teamId() {"],
  ["allLists + customFieldValuesSet", "async function allLists() {", "\n// --- tambahan KHUSUS mode tugas"],
  ["whoami/tasks/folder-tasks/task/comments/agenda/create/update", '    case "whoami": {', '    case "comment": {'],
  ["comment: baca teks", '    case "comment": {\n      const text = opt.file ? fs.readFileSync(opt.file, "utf8") : opt.text;\n      if (!text) throw new Error("comment: --text atau --file wajib");\n', null],
  ["comment: --dry-run & kirim", '      if (opt["dry-run"]) return out({ dry_run: true, method: "POST", task: pos[0], body: { comment_text: text, notify_all: false } });', '    case "move": {'],
  ["move: cek argumen", '    case "move": {', "      const url = "],
  ["move: dry-run + GET ulang", '      if (opt["dry-run"]) return out({ dry_run: true, method: "PUT", url });', '    case "delete": {'],
  ["delete/fields", '    case "delete": {', '    case "audit-free": {'],
];

export function bandingStatis(asliPath) {
  const tugas = fs.readFileSync(CLI, "utf8");
  const snap = fs.readFileSync(SNAPSHOT, "utf8");
  if (fs.existsSync(asliPath)) {
    const asli = fs.readFileSync(asliPath, "utf8");
    cek(`snapshot uji/kontrak/asli/clickup.mjs = ${asliPath} (sha ${sha(asli).slice(0, 12)})`, sha(asli) === sha(snap),
      "clickup.mjs di rhj-brain berubah: perbarui snapshot + cli/tugas.mjs");
  } else {
    console.log(`  (lewati: ${asliPath} tidak ada, pakai snapshot)`);
  }
  for (const [nama, a, b] of SEGMEN) {
    if (b === null) { // cukup ada persis di kedua file
      cek(`segmen identik: ${nama}`, snap.includes(a) && tugas.includes(a));
      continue;
    }
    const x = potong(snap, a, b === "\n// --- tambahan KHUSUS mode tugas" ? "\nasync function main() {" : b);
    const y = potong(tugas, a, b);
    cek(`segmen identik: ${nama}`, x !== null && y !== null && x === y, x === null || y === null ? "penanda tak ketemu" : "isi beda");
  }
  // Pesan galat yang dicetak main(): sama persis (prefix mengikuti mode).
  for (const s of [
    '"create: --name wajib"', '"update: tak ada field yang diubah"', '"comment: --text atau --file wajib"',
    '"move: <task_id> <list_id> wajib"', '"delete: tambahkan --yes (hapus permanen, tak bisa dibatalkan)"',
    "`${method} ${url} -> 429 terus setelah 4 percobaan`",
    '"clickup: CLICKUP_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"',
  ]) cek(`pesan ada di kedua file: ${s}`, snap.includes(s) && tugas.includes(s));
}

// Normalisasi output yang pasti beda antarproses (bukan antarbackend).
function normal(s) {
  return s
    .replace(/("sejak": ")[^"]+"/g, '$1<sejak>"')
    .replace(/(\/storage\/v1\/object\/sign\/[^"?]+)\?token=[^"]+/g, "$1?token=<token>");
}

export async function bandingPerilaku(cfg, token, perintah) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uji-b1-banding-"));
  try {
    const v2 = cfg.api, v3 = cfg.api.replace(/\/v2$/, "/v3");
    const ganti = (t) => t.replaceAll("https://api.clickup.com/api/v2", v2).replaceAll("https://api.clickup.com/api/v3", v3);
    const asliSrc = fs.readFileSync(SNAPSHOT, "utf8");
    const dA = path.join(tmp, "a"), dC = path.join(tmp, "c");
    fs.mkdirSync(dA); fs.mkdirSync(dC);
    const fA = path.join(dA, "clickup.mjs"), fC = path.join(dC, "clickup.mjs");
    fs.writeFileSync(fA, ganti(asliSrc));
    fs.writeFileSync(fC, ganti(fs.readFileSync(CLI, "utf8")));
    cek("salinan A hanya berubah di BASE", ganti(asliSrc) !== asliSrc && ganti(asliSrc).split("\n").length === asliSrc.split("\n").length);

    const envA = { CLICKUP_API_TOKEN: token };
    const envB = { TUGAS_API_URL: cfg.api, TUGAS_API_TOKEN: token };
    for (const args of perintah) {
      const label = args.join(" ");
      const [a, b, c] = await Promise.all([
        jalankan(fA, args, envA, { cwd: tmp }),
        jalankan(CLI, args, envB),
        jalankan(fC, args, envA, { cwd: tmp }),
      ]);
      const ok = cek(`[${label}] stdout asli = tugas`, normal(a.stdout) === normal(b.stdout),
        { asli: a.stdout.slice(0, 300), tugas: b.stdout.slice(0, 300), errA: a.stderr.slice(0, 200), errB: b.stderr.slice(0, 200) });
      cek(`[${label}] stdout asli = tugas.mjs mode clickup`, normal(a.stdout) === normal(c.stdout), { c: c.stdout.slice(0, 300) });
      sama(`[${label}] exit code sama`, [a.code, b.code, c.code], [a.code, a.code, a.code]);
      cek(`[${label}] stderr asli = mode clickup`, a.stderr === c.stderr, { asli: a.stderr, c: c.stderr });
      const harapB = a.stderr.replace(/^clickup:/gm, "tugas:").replace("tools/clickup.mjs", "tools/tugas.mjs");
      cek(`[${label}] stderr tugas = asli (prefix tugas:)`, b.stderr === harapB, { asli: a.stderr, tugas: b.stderr });
      if (ok && process.env.UJI_VERBOSE) console.log(`     (${a.stdout.length} byte, exit ${a.code})`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
