// tugas.mjs / clickup.mjs — satu file, DUA backend (salinan tools/clickup.mjs rhj-brain + mode aplikasi Tugas RHJ).
//   Mode "tugas"  : REST aplikasi Tugas RHJ (Edge Function `api`, meniru ClickUp v2). Env TUGAS_API_URL
//                   (…/functions/v1/api/v2) + TUGAS_API_TOKEN (rtk_…). Tanpa throttle; 429 → tunggu Retry-After.
//   Mode "clickup": ClickUp REST v2, PERSIS seperti clickup.mjs lama (throttle 670 ms, CLICKUP_API_TOKEN).
//   Pilih mode: nama file (tugas*.mjs → tugas, selain itu clickup); override TUGAS_BACKEND=tugas|clickup dari env
//   proses ATAU file .env di folder skrip (di desktop: tools/.env; env proses menang). Cek: `backend`.
//   brief(), getComments(), agenda, parser argumen, --dry-run, {deleted}, pesan galat = sama byte-per-byte
//   dengan clickup.mjs; di mode tugas prefix pesan "clickup:" menjadi "tugas:".
//   Tambahan KHUSUS mode tugas:
//   node tools/tugas.mjs activity <task_id>                           riwayat kartu (siapa ubah apa, kapan)
//   node tools/tugas.mjs resolve <id|url>                             ID/URL (app.clickup.com/t/…, URL list/board/folder/space
//                                                                     ClickUp mis. /v/l/6-<list>-1, /v/b/6-<list>-2) → {type,id,url}
//   node tools/tugas.mjs search "<q>" [--space id] [--closed]         cari nama/kode/isi/ID/URL (cek duplikat M6); URL list/
//                                                                     folder/space → kartu di dalamnya
//   node tools/tugas.mjs verify [--list id] [--folder id] [--space id] [--sumber clickup|app]   hitungan sensus
//   node tools/tugas.mjs tenggat [--tanggal YYYY-MM-DD] [--folder id]    angka B10/B5 (telat, hari ini, ≤3 HK, H-1, beban)
//   node tools/tugas.mjs comment <task_id> --reply-to <comment_id> --text "..." | --file <path> [--dry-run]   balasan thread
//   node tools/tugas.mjs pipeline list [--tab diam|pm|penawaran|order|batal|periksa] [--pemilik id] [--q ...]   lead pipeline (READ-ONLY)
//                                                                     --tab batal ikut memuat order yang dibatalkan (data order tetap
//                                                                     terisi; order = tahap ORDER saja); alasannya lewat pipeline get
//   node tools/tugas.mjs pipeline get <lead_id>                        detail lead
//   node tools/tugas.mjs pipeline summary [--dasar sp|lead] [--bulan YYYY-MM]   ringkasan §4 (omzet, win-rate, siklus)
//   node tools/tugas.mjs pipeline fu-set --leads "ld1,ld2=YYYY-MM-DD"   tandai lead utk follow-up (tab "Follow up hari ini"); scope tulis
//   node tools/tugas.mjs pipeline bukti-set --file <items.json> [--dry-run]   bukti sumber lead dari chat WA (TIDAK mengubah
//                                                                     `sumber` sales); scope tulis, token owner/bot. Berkas = {"items":[…]}
//                                                                     atau array [{lead_id, bukti, kode?, chat_pada?}], maks 200 per panggilan
//   node tools/tugas.mjs pipeline biaya-set --file <items.json> [--dry-run]   biaya iklan harian per campaign (dasbor bagian 5);
//                                                                     scope tulis, token owner/bot. Berkas = {"items":[…]} atau array
//                                                                     [{tanggal, platform google|meta, campaign, biaya, klik?, tayang?,
//                                                                     konversi?}], maks 1000; per (tanggal, platform) = keadaan lengkap
//   node tools/tugas.mjs pipeline order-erp --file <sp.json> [--dry-run]   SP ERP → ORDER (idempoten per erp_so_id); scope tulis,
//                                                                     token owner/bot. Berkas = {"items":[…]} / array / satu SP
//                                                                     {erp_so_id, no_sp, tanggal_sp, nilai, batal?, no_po?, sales?,
//                                                                     pelanggan?, hp?, kota?, items?, produk?}, maks 100; hasil per item
//   node tools/tugas.mjs pipeline lead-otomatis --file <chat.json> [--dry-run]   chat WA calon pembeli → lead (idempoten per
//                                                                     kunci_luar wa:K-xxxxxx:YYYY-MM-DD; nomor ber-lead terbuka tidak
//                                                                     dibuat dobel); scope tulis. Berkas = {"items":[…]} / array / satu
//                                                                     chat {kunci_luar, hp, sumber, pelanggan?, produk?, pemilik?,
//                                                                     alasan_pemilik?, …}, maks 100; hasil per item
//   node tools/tugas.mjs pipeline tautan [--jenis erp_sp|wa] [--sejak YYYY-MM-DD] [--batas n]   audit sinkron (tanpa nomor HP)
//   node tools/tugas.mjs pipeline asal-situs [--produk "Pallet Mesh"] [--sejak YYYY-MM-DD] [--sampai YYYY-MM-DD]   asal lead per
//                                                                     situs (kode Ref chat WA): situs RH/OY (organik vs Google Ads),
//                                                                     Meta, lain, tanpa kode, belum; = kartu dasbor. Bawaan sejak
//                                                                     2026-10-21 s/d hari ini; READ-ONLY
//   node tools/tugas.mjs wa ringkas [--hari 7]                         bot WA 0878 luar jam: masuk/kirim/diam per alasan,
//                                                                     biaya AI, contoh teks bot (tanpa isi chat/nomor); owner/bot
//   node tools/tugas.mjs wa saklar <mati|uji|kirim> [--catatan "..."]  matikan / mode uji (hanya nomor uji, kapan saja) / nyalakan
//   node tools/tugas.mjs wa uji [--nomor 0812… [--hapus] [--catatan "..."]]   daftar nomor uji (tanpa --nomor = lihat, disamarkan)
//   node tools/tugas.mjs wa diam --nomor 0812… --alasan internal|pemasok|ekspedisi|minta_berhenti|lain [--hapus]
//                                                                     daftar nomor yang tidak dibalas bot (scope tulis)
//   node tools/tugas.mjs wa pengetahuan                                fakta + contoh balasan bot (aktif & nonaktif)
//   node tools/tugas.mjs wa penugasan [--hari 3]                       pembagian seketika chat baru jam kerja: nomor, pemilik,
//                                                                     status (MEMUAT nomor HP: hanya ke /tmp, jangan ke repo/memori)
//   node tools/tugas.mjs wa bagi [--aktif|--mati] [--sales id,id] [--jeda detik] [--luar-jam ya|tidak]   setelan pembagian
//                                                                     seketika (tanpa opsi = lihat; --luar-jam ya = chat luar jam juga)
//   node tools/tugas.mjs wa fakta --teks "..." [--urutan n]            tambah fakta terkunci (ubah: --id n [--teks] [--nonaktif|--aktif])
//   node tools/tugas.mjs wa contoh --situasi "..." --teks "..."        tambah contoh balasan (ubah: --id n …); teks dicek validator bot
//   audit-free tidak berlaku di mode tugas.
//   node tools/<tugas|clickup>.mjs backend                             (KEDUA mode) backend aktif + asal pilihan mode
//
// clickup.mjs — Akses ClickUp lewat REST API v2 (BUKAN konektor MCP).
// Kenapa: konektor MCP ClickUp punya kuota HARIAN per workspace (Free 50-100, Unlimited 300 panggilan/24 jam,
// dibagi semua rutin & sesi). REST API cuma dibatasi 100 request/MENIT per token, tanpa batas harian.
// Lihat memori/PELAJARAN-PIC.md 2026-09-23.
//
// Pemakaian (output JSON ke stdout):
//   node tools/clickup.mjs whoami
//   node tools/clickup.mjs tasks <list_id> [--closed] [--full]        semua halaman; ringkas kecuali --full
//   node tools/clickup.mjs folder-tasks <folder_id> [--closed]        semua list di folder
//   node tools/clickup.mjs task <task_id>                             detail + lampiran + custom field
//   node tools/clickup.mjs comments <task_id> [--replies]                  --replies = ikut balasan thread (pagar M-CU)
//   node tools/clickup.mjs agenda [folder_id] [--hours 26] [--all-comments] [--desc]
//        sapuan Agen Data: kartu due hari ini / telat / berubah / ditutup dalam N jam + SEMUA komentar & balasannya
//   node tools/clickup.mjs create <list_id> --name "..." [--desc "..."] [--assignee 123,456] [--due YYYY-MM-DD] [--priority 1-4] [--status "to do"]
//   node tools/clickup.mjs update <task_id> [--name] [--desc] [--status] [--due YYYY-MM-DD|none] [--priority 1-4] [--add-assignee 123] [--rem-assignee 123] [--dry-run]
//   node tools/clickup.mjs comment <task_id> --text "..." | --file <path> [--dry-run]
//   --dry-run = cetak body yang AKAN dikirim, tanpa mengubah ClickUp
//   node tools/clickup.mjs move <task_id> <list_id> [--dry-run]              pindah home list (API v3)
//   node tools/clickup.mjs delete <task_id> --yes
//   node tools/clickup.mjs fields <list_id>
//   node tools/clickup.mjs audit-free                                 cek kelayakan paket Free (lampiran + custom field)
//
// Kredensial dari ENV (di cloud) — JANGAN commit:
//   CLICKUP_API_TOKEN  (wajib; token pribadi "pk_...", ClickUp > Settings > Apps > API Token)
//   CLICKUP_TEAM_ID    (opsional; default workspace pertama milik token)
//   Mode tugas: TUGAS_API_URL + TUGAS_API_TOKEN (wajib), TUGAS_TEAM_ID (opsional). Fallback: file .env di folder ini
//   (juga untuk TUGAS_BACKEND).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* .env tak ada -> pakai process.env */ }
  return out;
}
const env = loadEnv(path.join(HERE, ".env"));
// Mode: env proses > .env di folder skrip (sama seperti TUGAS_API_URL/TOKEN; di desktop = tools/.env) > nama file.
// Tanpa fallback .env, shim clickup.mjs di desktop diam-diam tetap memakai ClickUp walau .env berisi TUGAS_BACKEND.
const MODE_ENV = (process.env.TUGAS_BACKEND || "").trim(), MODE_DOTENV = (env.TUGAS_BACKEND || "").trim();
const MODE_DARI = MODE_ENV ? "env TUGAS_BACKEND" : MODE_DOTENV ? ".env TUGAS_BACKEND" : "nama file";
const MODE = (MODE_ENV || MODE_DOTENV).toLowerCase()
  || (path.basename(fileURLToPath(import.meta.url)).startsWith("tugas") ? "tugas" : "clickup");
const TUGAS = MODE === "tugas";
const NAMA = TUGAS ? "tugas" : "clickup"; // prefix pesan galat
const BASE = TUGAS ? (process.env.TUGAS_API_URL || env.TUGAS_API_URL || "").trim().replace(/\/+$/, "") : "https://api.clickup.com/api/v2";
const BASE_V3 = TUGAS ? BASE.replace(/\/v2$/, "/v3") : "https://api.clickup.com/api/v3";
const BASE_X = BASE.replace(/\/v2$/, "/x"); // endpoint tambahan aplikasi Tugas
const TOKEN = (TUGAS ? process.env.TUGAS_API_TOKEN || env.TUGAS_API_TOKEN || "" : process.env.CLICKUP_API_TOKEN || env.CLICKUP_API_TOKEN || "").trim();

// --- HTTP: throttle <=~90 req/menit (hanya ClickUp), tunggu & ulang saat 429 ---
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!TUGAS) {
      const wait = lastCall + 670 - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
    }
    const res = await fetch((TUGAS ? /^https?:\/\//.test(url) : url.startsWith("https://")) ? url : BASE + url, {
      method,
      headers: { Authorization: TOKEN, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && TUGAS) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000) + 250);
      continue;
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      await sleep(Math.max(reset - Date.now(), 5000) + 1000);
      continue;
    }
    const text = await res.text();
    let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
    if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${j.err || j.ECODE || text.slice(0, 200)}`);
    return j;
  }
  throw new Error(`${method} ${url} -> 429 terus setelah 4 percobaan`);
}

// --- argumen ---
const [cmd, ...rest] = process.argv.slice(2);
const pos = [], opt = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const k = rest[i].slice(2), v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) opt[k] = true; else { opt[k] = v; i++; }
  } else pos.push(rest[i]);
}
const toMs = (d) => new Date(`${d}T12:00:00+07:00`).getTime(); // tanggal WIB
const out = (x) => console.log(JSON.stringify(x, null, 2));
const wibDate = (ms) => new Date(Number(ms) + 7 * 3600e3).toISOString().slice(0, 10); // tanggal WIB
const brief = (t) => ({
  id: t.id, name: t.name, status: t.status?.status,
  assignees: (t.assignees || []).map((a) => a.username || a.email),
  due: t.due_date ? wibDate(t.due_date) : null, // tanggal WIB (bukan UTC)
  updated: t.date_updated ? new Date(Number(t.date_updated)).toISOString() : null,
  list: t.list?.name, url: t.url,
});

async function getComments(taskId, withReplies) {
  const j = await api("GET", `/task/${taskId}/comment`);
  const res = [];
  for (const c of j.comments || []) {
    const row = { id: c.id, user: c.user?.username, date: new Date(Number(c.date)).toISOString(), text: c.comment_text, reply_count: Number(c.reply_count) || 0 };
    if (withReplies && row.reply_count > 0) {
      const r = await api("GET", `/comment/${c.id}/reply`);
      row.replies = (r.comments || []).map((x) => ({ user: x.user?.username, date: new Date(Number(x.date)).toISOString(), text: x.comment_text }));
    }
    res.push(row);
  }
  return res;
}

async function allTasks(listId, closed) {
  const tasks = [];
  for (let page = 0; ; page++) {
    const j = await api("GET", `/list/${listId}/task?page=${page}&subtasks=true&include_closed=${closed ? "true" : "false"}`);
    tasks.push(...(j.tasks || []));
    if (j.last_page === true || (j.tasks || []).length < 100) break;
  }
  return tasks;
}
async function teamId() {
  if (TUGAS && process.env.TUGAS_TEAM_ID) return process.env.TUGAS_TEAM_ID;
  if (!TUGAS && process.env.CLICKUP_TEAM_ID) return process.env.CLICKUP_TEAM_ID;
  const j = await api("GET", "/team");
  return j.teams?.[0]?.id;
}
async function allLists() {
  const tid = await teamId();
  const lists = [];
  const { spaces = [] } = await api("GET", `/team/${tid}/space?archived=false`);
  for (const s of spaces) {
    const { folders = [] } = await api("GET", `/space/${s.id}/folder?archived=false`);
    for (const f of folders) for (const l of f.lists || []) lists.push({ ...l, space: s.name, folder: f.name });
    const { lists: loose = [] } = await api("GET", `/space/${s.id}/list?archived=false`);
    for (const l of loose) lists.push({ ...l, space: s.name, folder: null });
  }
  return { tid, spaces, lists };
}
function customFieldValuesSet(t) {
  let n = 0;
  for (const f of t.custom_fields || []) {
    if (f.value === undefined || f.value === null || f.value === "") continue;
    n += Array.isArray(f.value) ? f.value.length : 1; // label: tiap label = 1 use
  }
  return n;
}

// --- tambahan KHUSUS mode tugas (endpoint /x aplikasi Tugas) ---
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => typeof v === "string" && v !== "")).toString();
const nilai = (k) => (typeof opt[k] === "string" ? opt[k] : undefined);
function wajibNilai(c, k) {
  if (opt[k] !== undefined && typeof opt[k] !== "string") throw new Error(`${c}: --${k} butuh nilai`);
  return nilai(k);
}
const EKSTRA = {
  async activity() {
    if (!pos[0]) throw new Error("activity: <task_id> wajib");
    return api("GET", `${BASE_X}/task/${encodeURIComponent(pos[0])}/activity`);
  },
  async resolve() {
    if (!pos[0]) throw new Error("resolve: <id|url> wajib");
    return api("GET", `${BASE_X}/resolve?${qs({ ref: pos[0] })}`);
  },
  async search() {
    const q = pos.join(" ").trim();
    if (!q) throw new Error('search: "<kata kunci>" wajib');
    return api("GET", `${BASE_X}/search?${qs({ q, space: wajibNilai("search", "space"), include_closed: opt.closed ? "true" : "" })}`);
  },
  async verify() {
    const f = { list: wajibNilai("verify", "list"), folder: wajibNilai("verify", "folder"), space: wajibNilai("verify", "space"), sumber: wajibNilai("verify", "sumber") };
    return api("GET", `${BASE_X}/count?${qs(f)}`);
  },
  async tenggat() {
    const tanggal = wajibNilai("tenggat", "tanggal");
    if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error("tenggat: --tanggal harus YYYY-MM-DD");
    return api("GET", `${BASE_X}/tenggat?${qs({ tanggal, folder: wajibNilai("tenggat", "folder") })}`);
  },
  // Pipeline sales (READ-ONLY): list | get <lead_id> | summary. Dipakai routine Analisa/Arahan Pipeline.
  async pipeline() {
    const sub = pos[0];
    if (sub === "list") {
      return api("GET", `${BASE_X}/pipeline/leads?${qs({ tab: wajibNilai("pipeline", "tab"), pemilik: wajibNilai("pipeline", "pemilik"), q: wajibNilai("pipeline", "q") })}`);
    }
    if (sub === "get") {
      if (!pos[1]) throw new Error("pipeline get: <lead_id> wajib");
      return api("GET", `${BASE_X}/pipeline/lead/${encodeURIComponent(pos[1])}`);
    }
    if (sub === "summary") {
      return api("GET", `${BASE_X}/pipeline/ringkas?${qs({ dasar: wajibNilai("pipeline", "dasar"), bulan: wajibNilai("pipeline", "bulan") })}`);
    }
    if (sub === "fu-set") {
      // Tandai lead utk follow-up (muncul di tab "Follow up hari ini"). Dipakai routine Arahan Pipeline. Scope token: tulis.
      const spec = wajibNilai("pipeline", "leads");
      if (!spec) throw new Error('pipeline fu-set: --leads "id[,id=YYYY-MM-DD]..." wajib (tanpa tanggal = hari ini)');
      const items = spec.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
        const [id, tgl] = x.split("=");
        return { lead_id: id.trim(), tanggal: (tgl || "").trim() || undefined };
      });
      if (!items.length) throw new Error("pipeline fu-set: --leads kosong");
      return api("POST", `${BASE_X}/pipeline/fu`, { items });
    }
    if (sub === "bukti-set") {
      // Bukti asal lead dari chat WA 0878 (Kapso, pola tetap) → kolom sumber_bukti* (BUKAN `sumber` isian sales).
      // Item = {lead_id, bukti (kelas | null = hapus), kode?, chat_pada? (ISO dengan zona)}; server memvalidasi semuanya
      // dan menolak seluruh panggilan bila satu item tidak sah (idempoten → kirim ulang aman). --dry-run: tanpa request.
      const berkas = wajibNilai("pipeline", "file");
      if (!berkas) throw new Error("pipeline bukti-set: --file <items.json> wajib");
      let isi;
      try { isi = JSON.parse(fs.readFileSync(berkas, "utf8")); } catch (e) { throw new Error(`pipeline bukti-set: ${berkas} tidak terbaca sebagai JSON (${e.message})`); }
      const items = Array.isArray(isi) ? isi : isi?.items;
      if (!Array.isArray(items)) throw new Error('pipeline bukti-set: isi berkas harus {"items":[…]} atau array item');
      if (!items.length) throw new Error("pipeline bukti-set: items kosong");
      if (items.length > 200) throw new Error(`pipeline bukti-set: maks 200 item per panggilan (berkas berisi ${items.length}); pecah berkasnya`);
      if (opt["dry-run"]) return { dry_run: true, method: "POST", path: "/x/pipeline/sumber-bukti", url: `${BASE_X}/pipeline/sumber-bukti`, jumlah: items.length, body: { items } };
      return api("POST", `${BASE_X}/pipeline/sumber-bukti`, { items });
    }
    if (sub === "biaya-set") {
      // Biaya iklan harian per campaign (Agen Data Harian). Item = {tanggal YYYY-MM-DD, platform google|meta, campaign,
      // biaya (rupiah), klik?, tayang?, konversi?}. Server memvalidasi semuanya (semua-atau-tidak); per (tanggal, platform)
      // payload = keadaan lengkap hari itu → campaign yang tidak dikirim dihapus. Idempoten. --dry-run: tanpa request.
      const berkas = wajibNilai("pipeline", "file");
      if (!berkas) throw new Error("pipeline biaya-set: --file <items.json> wajib");
      let isi;
      try { isi = JSON.parse(fs.readFileSync(berkas, "utf8")); } catch (e) { throw new Error(`pipeline biaya-set: ${berkas} tidak terbaca sebagai JSON (${e.message})`); }
      const items = Array.isArray(isi) ? isi : isi?.items;
      if (!Array.isArray(items)) throw new Error('pipeline biaya-set: isi berkas harus {"items":[…]} atau array item');
      if (!items.length) throw new Error("pipeline biaya-set: items kosong");
      if (items.length > 1000) throw new Error(`pipeline biaya-set: maks 1000 item per panggilan (berkas berisi ${items.length}); pecah per rentang tanggal`);
      if (opt["dry-run"]) return { dry_run: true, method: "POST", path: "/x/pipeline/biaya-iklan", url: `${BASE_X}/pipeline/biaya-iklan`, jumlah: items.length, body: { items } };
      return api("POST", `${BASE_X}/pipeline/biaya-iklan`, { items });
    }
    if (sub === "order-erp" || sub === "lead-otomatis") {
      // Sinkron dari luar (routine rhj-brain). order-erp: SP ERP-dev → ORDER (dibuat/diperbarui/tidak_berubah/
      // dilewati_bukan_online/dilewati_batal). lead-otomatis: chat WA 0878 calon pembeli → lead (dibuat/sudah_ada/
      // lead_terbuka_ada). Server memvalidasi; tiap item diproses sendiri (item gagal → {ok:false, status_http, err}).
      // Idempoten → kirim ulang aman. --dry-run: tanpa request.
      const jalur = sub === "order-erp" ? "/x/pipeline/order-erp" : "/x/pipeline/lead-otomatis";
      const pengenal = sub === "order-erp" ? "erp_so_id" : "kunci_luar";
      const berkas = wajibNilai("pipeline", "file");
      if (!berkas) throw new Error(`pipeline ${sub}: --file <berkas.json> wajib`);
      let isi;
      try { isi = JSON.parse(fs.readFileSync(berkas, "utf8")); } catch (e) { throw new Error(`pipeline ${sub}: ${berkas} tidak terbaca sebagai JSON (${e.message})`); }
      const satu = isi && typeof isi === "object" && !Array.isArray(isi) && pengenal in isi;
      const items = satu ? [isi] : Array.isArray(isi) ? isi : isi?.items;
      if (!Array.isArray(items)) throw new Error(`pipeline ${sub}: isi berkas harus {"items":[…]}, array item, atau satu objek ber-${pengenal}`);
      if (!items.length) throw new Error(`pipeline ${sub}: items kosong`);
      if (items.length > 100) throw new Error(`pipeline ${sub}: maks 100 item per panggilan (berkas berisi ${items.length}); pecah berkasnya`);
      const body = satu ? isi : { items };
      if (opt["dry-run"]) return { dry_run: true, method: "POST", path: jalur, url: `${BASE_X}${jalur.slice(2)}`, jumlah: items.length, body };
      return api("POST", `${BASE_X}${jalur.slice(2)}`, body);
    }
    if (sub === "tautan") {
      const jenis = wajibNilai("pipeline", "jenis");
      if (jenis && !["erp_sp", "wa"].includes(jenis)) throw new Error("pipeline tautan: --jenis harus erp_sp atau wa");
      return api("GET", `${BASE_X}/pipeline/tautan?${qs({ jenis, sejak: wajibNilai("pipeline", "sejak"), batas: wajibNilai("pipeline", "batas") })}`);
    }
    if (sub === "asal-situs") {
      const sejak = wajibNilai("pipeline", "sejak");
      const sampai = wajibNilai("pipeline", "sampai");
      for (const [k, v] of [["sejak", sejak], ["sampai", sampai]]) {
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`pipeline asal-situs: --${k} harus YYYY-MM-DD`);
      }
      return api("GET", `${BASE_X}/pipeline/asal-situs?${qs({ produk: wajibNilai("pipeline", "produk"), sejak, sampai })}`);
    }
    throw new Error("pipeline: subperintah harus list | get <lead_id> | summary | fu-set | bukti-set | biaya-set | order-erp | lead-otomatis | tautan | asal-situs");
  },
  // Bot WA 0878 luar jam (migrasi 20261110180000_wa_bot): ringkas | saklar <mati|kirim> | diam --nomor --alasan [--hapus].
  async wa() {
    const sub = pos[0];
    if (sub === "ringkas") {
      const hari = wajibNilai("wa ringkas", "hari");
      if (hari && !/^\d{1,2}$/.test(hari)) throw new Error("wa ringkas: --hari harus angka 1–90");
      return api("GET", `${BASE_X}/wa/ringkas?${qs({ hari })}`);
    }
    if (sub === "saklar") {
      const status = pos[1];
      if (!["mati", "kirim", "uji"].includes(status)) throw new Error("wa saklar: <mati|uji|kirim> wajib");
      return api("POST", `${BASE_X}/wa/saklar`, { status, catatan: wajibNilai("wa saklar", "catatan") });
    }
    if (sub === "diam") {
      const nomor = wajibNilai("wa diam", "nomor");
      if (!nomor) throw new Error("wa diam: --nomor wajib");
      if (opt.hapus) return api("POST", `${BASE_X}/wa/diam`, { nomor, hapus: true });
      const alasan = wajibNilai("wa diam", "alasan");
      if (!alasan) throw new Error("wa diam: --alasan internal|pemasok|ekspedisi|minta_berhenti|lain wajib");
      return api("POST", `${BASE_X}/wa/diam`, { nomor, alasan, catatan: wajibNilai("wa diam", "catatan") });
    }
    // Fakta & contoh balasan bot (tabel wa.pengetahuan, migrasi 20261111100000): tanpa deploy; teks dicek validator bot.
    if (sub === "pengetahuan") return api("GET", `${BASE_X}/wa/pengetahuan`);
    // Mode uji: nomor yang dibalas bot saat saklar 'uji' (kapan saja); tanpa --nomor = lihat daftar (nomor disamarkan).
    if (sub === "uji") {
      const nomor = wajibNilai("wa uji", "nomor");
      if (!nomor) return api("POST", `${BASE_X}/wa/uji`, {});
      return api("POST", `${BASE_X}/wa/uji`, opt.hapus ? { nomor, hapus: true } : { nomor, catatan: wajibNilai("wa uji", "catatan") });
    }
    if (sub === "fakta" || sub === "contoh") {
      const id = wajibNilai(`wa ${sub}`, "id");
      if (id && !/^\d+$/.test(id)) throw new Error(`wa ${sub}: --id harus angka`);
      const teks = wajibNilai(`wa ${sub}`, "teks");
      const situasi = sub === "contoh" ? wajibNilai("wa contoh", "situasi") : undefined;
      const urutan = wajibNilai(`wa ${sub}`, "urutan");
      if (!id && !teks) throw new Error(`wa ${sub}: --teks wajib untuk baris baru`);
      if (sub === "contoh" && !id && !situasi) throw new Error("wa contoh: --situasi wajib untuk baris baru");
      const body = { jenis: sub };
      if (id) body.id = Number(id);
      if (teks) body.teks = teks;
      if (situasi) body.situasi = situasi;
      if (urutan) body.urutan = Number(urutan);
      if (opt.nonaktif) body.aktif = false;
      if (opt.aktif) body.aktif = true;
      return api("POST", `${BASE_X}/wa/pengetahuan`, body);
    }
    // Pembagian seketika chat baru jam kerja (migrasi 20261111170000): penugasan = daftar (MEMUAT nomor, jangan disalin
    // ke repo/memori); bagi = setelan (tanpa opsi = lihat + hitungan hari ini tanpa nomor).
    if (sub === "penugasan") {
      const hari = wajibNilai("wa penugasan", "hari");
      if (hari && !/^\d{1,2}$/.test(hari)) throw new Error("wa penugasan: --hari harus angka 1–30");
      return api("GET", `${BASE_X}/wa/penugasan?${qs({ hari })}`);
    }
    if (sub === "bagi") {
      const body = {};
      if (opt.aktif && opt.mati) throw new Error("wa bagi: pilih --aktif atau --mati");
      if (opt.aktif) body.aktif = true;
      if (opt.mati) body.aktif = false;
      const sales = wajibNilai("wa bagi", "sales");
      if (sales) {
        const ids = sales.split(",").map((x) => x.trim());
        if (!ids.every((x) => /^\d{1,18}$/.test(x))) throw new Error("wa bagi: --sales = id anggota dipisah koma");
        body.sales = ids.map(Number);
      }
      const luar = wajibNilai("wa bagi", "luar-jam");
      if (luar) {
        if (!["ya", "tidak"].includes(luar)) throw new Error("wa bagi: --luar-jam ya|tidak");
        body.luar_jam = luar === "ya";
      }
      const jeda = wajibNilai("wa bagi", "jeda");
      if (jeda) {
        if (!/^\d{1,3}$/.test(jeda)) throw new Error("wa bagi: --jeda = detik 0–900");
        body.jeda_detik = Number(jeda);
      }
      return Object.keys(body).length ? api("POST", `${BASE_X}/wa/bagi-setel`, body) : api("GET", `${BASE_X}/wa/bagi-setel`);
    }
    throw new Error("wa: subperintah harus ringkas | saklar <mati|kirim> | diam --nomor --alasan | pengetahuan | fakta | contoh | penugasan | bagi");
  },
};

async function main() {
  if (!["tugas", "clickup"].includes(MODE)) { console.error(`${NAMA}: TUGAS_BACKEND harus "tugas" atau "clickup" (sekarang "${MODE}")`); process.exit(1); }
  if (!cmd || cmd === "help") { console.error(`usage: lihat header tools/${NAMA}.mjs`); process.exit(1); }
  if (cmd === "backend") { // diagnosa (kedua mode, tanpa request): backend mana yang aktif & dari mana dipilih
    return out({ backend: MODE, dipilih_dari: MODE_DARI, api: BASE || null, token: TOKEN ? "ada" : "kosong" });
  }
  if (TUGAS) {
    if (!TOKEN) { console.error("tugas: TUGAS_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"); process.exit(1); }
    if (!/^https?:\/\/.+\/v2$/.test(BASE)) { console.error("tugas: TUGAS_API_URL kosong/tidak sah (harus berakhiran /v2, mis. https://<ref>.supabase.co/functions/v1/api/v2)"); process.exit(1); }
  }
  if (!TOKEN) { console.error("clickup: CLICKUP_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"); process.exit(1); }

  switch (cmd) {
    case "whoami": {
      const u = await api("GET", "/user");
      const t = await api("GET", "/team");
      return out({ user: { id: u.user?.id, username: u.user?.username, email: u.user?.email },
        workspaces: (t.teams || []).map((x) => ({ id: x.id, name: x.name, members: x.members?.length })) });
    }
    case "tasks": {
      const ts = await allTasks(pos[0], opt.closed);
      return out(opt.full ? ts : ts.map(brief));
    }
    case "folder-tasks": {
      const { lists = [] } = await api("GET", `/folder/${pos[0]}/list?archived=false`);
      const res = [];
      for (const l of lists) res.push(...(await allTasks(l.id, opt.closed)).map(brief));
      return out(res);
    }
    case "task": return out(await api("GET", `/task/${pos[0]}?include_markdown_description=true`));
    case "comments": return out(await getComments(pos[0], opt.replies));
    case "agenda": {
      // Sapuan Agen Data: kartu yang perlu dilihat hari ini + semua komentarnya (pagar M-CU).
      const folderId = pos[0] || "1100340000026652"; // RHJ Eksekusi
      const hours = Number(opt.hours) || 26;
      const since = Date.now() - hours * 3600e3;
      const today = wibDate(Date.now());
      const { lists = [] } = await api("GET", `/folder/${folderId}/list?archived=false`);
      const all = [];
      for (const l of lists) all.push(...(await allTasks(l.id, true)));
      const isClosed = (t) => t.status?.type === "closed" || t.status?.type === "done";
      const picked = [];
      let openCount = 0;
      for (const t of all) {
        const tags = [];
        const closedAt = Number(t.date_closed || t.date_done || 0);
        if (isClosed(t)) { if (closedAt >= since) tags.push("ditutup_baru"); }
        else {
          openCount++;
          if (t.due_date) {
            const d = wibDate(t.due_date);
            if (d === today) tags.push("due_hari_ini"); else if (d < today) tags.push("telat");
          }
          if (Number(t.date_updated) >= since) tags.push("berubah_baru");
          if (opt["all-comments"]) tags.push("terbuka");
        }
        if (tags.length) picked.push({ t, tags });
      }
      const tasks = [];
      for (const { t, tags } of picked) {
        const row = { ...brief(t), kategori: tags, closed: t.date_closed ? new Date(Number(t.date_closed)).toISOString() : null };
        if (opt.desc) row.description = (await api("GET", `/task/${t.id}?include_markdown_description=true`)).markdown_description || "(isi deskripsi tak terbaca)";
        row.comments = await getComments(t.id, true);
        row.komentar_baru = row.comments.filter((c) => Date.parse(c.date) >= since || (c.replies || []).some((r) => Date.parse(r.date) >= since)).length;
        tasks.push(row);
      }
      const count = (k) => picked.filter((p) => p.tags.includes(k)).length;
      return out({
        tanggal_wib: today, sejak: new Date(since).toISOString(), folder: folderId,
        ringkas: { terbuka: openCount, due_hari_ini: count("due_hari_ini"), telat: count("telat"), berubah_baru: count("berubah_baru"), ditutup_baru: count("ditutup_baru"), kartu_dengan_komentar_baru: tasks.filter((x) => x.komentar_baru > 0).length },
        tasks,
      });
    }
    case "create": {
      if (!opt.name) throw new Error("create: --name wajib");
      const body = { name: opt.name };
      if (opt.desc) body.markdown_description = opt.desc;
      if (opt.assignee) body.assignees = String(opt.assignee).split(",").map(Number);
      if (opt.due) { body.due_date = toMs(opt.due); body.due_date_time = false; }
      if (opt.priority) body.priority = Number(opt.priority);
      if (opt.status) body.status = opt.status;
      const t = await api("POST", `/list/${pos[0]}/task`, body);
      return out(brief(t));
    }
    case "update": {
      const body = {};
      if (opt.name) body.name = opt.name;
      if (opt.desc) body.markdown_description = opt.desc;
      if (opt.status) body.status = opt.status;
      if (opt.due === "none") body.due_date = null; // hapus due (parkir kartu)
      else if (opt.due) { body.due_date = toMs(opt.due); body.due_date_time = false; }
      if (opt.priority) body.priority = Number(opt.priority);
      if (opt["add-assignee"] || opt["rem-assignee"]) body.assignees = {
        add: opt["add-assignee"] ? String(opt["add-assignee"]).split(",").map(Number) : [],
        rem: opt["rem-assignee"] ? String(opt["rem-assignee"]).split(",").map(Number) : [],
      };
      if (!Object.keys(body).length) throw new Error("update: tak ada field yang diubah");
      if (opt["dry-run"]) return out({ dry_run: true, method: "PUT", task: pos[0], body });
      return out(brief(await api("PUT", `/task/${pos[0]}`, body)));
    }
    case "comment": {
      const text = opt.file ? fs.readFileSync(opt.file, "utf8") : opt.text;
      if (!text) throw new Error("comment: --text atau --file wajib");
      if (opt["reply-to"] !== undefined) {
        // balasan thread: KHUSUS mode tugas (di mode clickup flag ini ditolak supaya tak jadi komentar top-level)
        if (!TUGAS) throw new Error("comment: --reply-to hanya tersedia di mode tugas");
        const rid = wajibNilai("comment", "reply-to");
        if (!rid) throw new Error("comment: --reply-to <comment_id> wajib berisi id");
        if (opt["dry-run"]) return out({ dry_run: true, method: "POST", task: pos[0], reply_to: rid, body: { comment_text: text, notify_all: false } });
        return out(await api("POST", `/comment/${rid}/reply`, { comment_text: text, notify_all: false }));
      }
      if (opt["dry-run"]) return out({ dry_run: true, method: "POST", task: pos[0], body: { comment_text: text, notify_all: false } });
      return out(await api("POST", `/task/${pos[0]}/comment`, { comment_text: text, notify_all: false }));
    }
    case "move": {
      // Pindah "home list" kartu (API v2 tak punya; pakai v3). Kartu tetap satu, ID sama.
      if (!pos[0] || !pos[1]) throw new Error("move: <task_id> <list_id> wajib");
      const url = `${BASE_V3}/workspaces/${await teamId()}/tasks/${pos[0]}/home_list/${pos[1]}`;
      if (opt["dry-run"]) return out({ dry_run: true, method: "PUT", url });
      await api("PUT", url);
      const t = await api("GET", `/task/${pos[0]}`);
      return out(brief(t));
    }
    case "delete": {
      if (!opt.yes) throw new Error("delete: tambahkan --yes (hapus permanen, tak bisa dibatalkan)");
      await api("DELETE", `/task/${pos[0]}`);
      return out({ deleted: pos[0] });
    }
    case "fields": return out((await api("GET", `/list/${pos[0]}/field`)).fields || []);
    case "audit-free": {
      if (TUGAS) { console.error("tugas: audit-free tidak berlaku di aplikasi Tugas (khusus paket ClickUp Free)"); process.exit(1); }
      const { tid, spaces, lists } = await allLists();
      let open = 0, closed = 0, cfUses = 0, attCount = 0, attBytes = 0, attNoSize = 0;
      const files = [], cfByList = {};
      for (const l of lists) {
        const ts = await allTasks(l.id, true);
        for (const t of ts) {
          (t.status?.type === "closed" || t.status?.type === "done") ? closed++ : open++;
          const n = customFieldValuesSet(t);
          cfUses += n; if (n) cfByList[l.name] = (cfByList[l.name] || 0) + n;
          // daftar task tak memuat lampiran -> ambil detail hanya bila perlu
          const d = await api("GET", `/task/${t.id}`);
          for (const a of d.attachments || []) {
            attCount++;
            const sz = Number(a.size);
            if (Number.isFinite(sz) && sz > 0) attBytes += sz; else attNoSize++;
            files.push({ task: t.name.slice(0, 60), file: a.title, bytes: Number.isFinite(sz) ? sz : null });
          }
        }
      }
      return out({
        workspace: tid, spaces: spaces.length, lists: lists.length, tasks: { open, closed },
        custom_field_values_now: cfUses, custom_field_by_list: cfByList,
        note_cf: "Free Forever = 60 use SEUMUR workspace; angka ini batas BAWAH (nilai yang pernah diisi lalu dihapus tetap terhitung use).",
        attachments: { count: attCount, total_mb: +(attBytes / 1048576).toFixed(2), without_size: attNoSize, files },
        note_storage: "Free Forever ~60-100 MB total (sumber beda); lampiran komentar/Docs mungkin tak ikut terhitung di sini.",
      });
    }
    default:
      if (TUGAS && Object.hasOwn(EKSTRA, cmd)) return out(await EKSTRA[cmd]());
      console.error(`${NAMA}: perintah tak dikenal "${cmd}"`); process.exit(1);
  }
}

main().catch((e) => { console.error(`${NAMA}: GAGAL ->`, e.message); process.exit(1); });
