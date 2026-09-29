#!/usr/bin/env node
// impor/sinkron.mjs — importer/sinkron ClickUp → aplikasi Tugas RHJ (docs/ARSITEKTUR.md §10, riset
// rancang-kompatibilitas §6, kontrak fungsi docs/KONTRAK-DB.md §5). Node >= 20, tanpa dependensi.
//
//   node impor/sinkron.mjs --mode penuh|akhir|uji [--only list=<id>[,<id>]] [--dry-run]
//                          [--muat impor|sinkron] [--tanpa-lampiran] [--paksa-hilang] [--laporan <dir>]
//
// Env (JANGAN di repo):
//   CLICKUP_API_TOKEN   token ClickUp (hanya dipakai membaca: klien menolak method selain GET)
//   CLICKUP_API_BASE    opsional, default https://api.clickup.com/api/v2 (uji: server tiruan)
//   CLICKUP_TEAM_ID     opsional, default team pertama dari GET /team
//   TUGAS_API_URL       …/functions/v1/api/v2 (sama dengan CLI) atau …/functions/v1/api
//   TUGAS_IMPORT_TOKEN  token app scope 'impor' (wajib kecuali --dry-run)
//   SINKRON_RPM         batas permintaan ClickUp per menit (default 60; ke api.clickup.com maks 60)
//
// Mode run (sync_runs.mode):
//   penuh = sapuan penuh idempoten + tandai hilang + sensus.   akhir = penuh, wajib tanpa --only/--tanpa-lampiran.
//   uji   = penuh TANPA tandai hilang (aman dicoba).            --dry-run = hanya baca ClickUp (+ baca sensus app).
// Muat (p_mode impor_batch): otomatis 'impor' bila list cakupan belum punya data ClickUp di app, selain itu
//   'sinkron' (perubahan tercatat activity sumber=sinkron, lengkap=false). --muat memaksa.
// Keluaran: stdout = ringkasan JSON (angka saja). Laporan angka per list → impor/laporan/<tanggal WIB>.md (+ .json).
// Kode keluar: 0 = sukses & sensus selisih 0; 2 = selesai tetapi ada selisih/baris gagal/tertunda; 1 = galat fatal.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CLICKUP_DEFAULT = "https://api.clickup.com/api/v2";
export const KUNCI_SENSUS = [
  "tasks_total", "open", "closed", "archived", "subtasks", "comments_top", "replies", "reply_count_sum",
  "attachments_task", "attachments_comment", "assignee_links", "sha_ids_tasks", "sha_ids_comments",
];
// Allowlist bucket 'lampiran' (migrasi 20260929100400) + batas 25 MB. WAJIB sama dengan bucket (diuji
// impor/uji/jalankan.mjs terhadap storage.buckets). (perbaikan P3) + xls/CSV Windows, tsv, doc, pptx, heic, heif.
export const MIME_IZIN = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel", "text/csv", "text/plain", "text/tab-separated-values",
]);
export const MAKS_LAMPIRAN = 25 * 1024 * 1024;
const MIME_EKST = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", doc: "application/msword",
  xls: "application/vnd.ms-excel", tsv: "text/tab-separated-values", heic: "image/heic", heif: "image/heif",
  svg: "image/svg+xml", html: "text/html", zip: "application/zip", mp4: "video/mp4",
};
// Alasan lampiran tidak disalin (status_salin 'tautan_saja'; clickup_url tetap tersimpan → tetap bisa dibuka).
export function alasanTautanSaja(a, maks = MAKS_LAMPIRAN) {
  const mime = String(a.mimetype || "").toLowerCase().split(";")[0].trim();
  if (!a.url) return "tanpa URL";
  if (!mime) return "MIME tidak diketahui";
  if (!MIME_IZIN.has(mime)) return `MIME di luar allowlist (${mime})`;
  if (a.size && a.size > maks) return `ukuran ${a.size} byte > 25 MB`;
  return null;
}

// ---------------------------------------------------------------- util
export const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
// Urutan = ORDER BY text Postgres (collation ICU en-US, deterministik: seri dipecah per byte). Untuk ID ClickUp
// (huruf kecil + angka) hasilnya sama dengan urutan byte; Intl.Collator dipakai supaya aman bila ada huruf besar.
const KOLATOR = new Intl.Collator("en-US");
export function urutId(ids) {
  return [...ids].sort((a, b) => KOLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}
export const shaIds = (ids) => sha256(urutId(ids).join(","));
export function potong(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
const ekstensi = (nama) => (/\.([A-Za-z0-9]{1,8})$/.exec(String(nama || "")) || [])[1]?.toLowerCase() || null;
export function namaObjek(id, judul) {
  const dasar = String(id).replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
  const nama = String(judul || "berkas").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.{2,}/g, ".").replace(/^[._]+/, "").slice(-100) || "berkas";
  return `${dasar}-${nama}`;
}
function tanggalWib(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}
function jamWib(d = new Date()) {
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(11, 19);
}

export class GalatHttp extends Error {
  constructor(status, pesan, jalur, ecode) {
    super(`${jalur} → HTTP ${status}: ${pesan}`);
    this.status = status;
    this.ecode = ecode ?? null;
  }
}

// ---------------------------------------------------------------- argumen
export function bacaArgumen(argv) {
  const o = { mode: "penuh", only: null, dryRun: false, muat: null, tanpaLampiran: false, paksaHilang: false, laporan: null, bantuan: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i], v;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0 && ["--mode", "--only", "--muat", "--laporan"].includes(a.slice(0, eq))) {
      v = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const nilai = () => {
      if (v !== undefined) return v;
      const x = argv[++i];
      if (x === undefined || x.startsWith("--")) throw new Error(`${a} butuh nilai`);
      return x;
    };
    switch (a) {
      case "--mode": o.mode = nilai(); break;
      case "--only": {
        const x = nilai();
        const m = /^list=([0-9A-Za-z_,-]+)$/.exec(x);
        if (!m) throw new Error('--only harus berbentuk list=<id>[,<id>]');
        o.only = new Set(m[1].split(",").filter(Boolean));
        break;
      }
      case "--dry-run": o.dryRun = true; break;
      case "--muat": o.muat = nilai(); break;
      case "--tanpa-lampiran": o.tanpaLampiran = true; break;
      case "--paksa-hilang": o.paksaHilang = true; break;
      case "--laporan": o.laporan = nilai(); break;
      case "-h": case "--help": o.bantuan = true; break;
      default: throw new Error(`argumen tidak dikenal: ${a}`);
    }
  }
  if (!["penuh", "akhir", "uji"].includes(o.mode)) throw new Error("--mode harus penuh, akhir, atau uji");
  if (o.muat !== null && !["impor", "sinkron"].includes(o.muat)) throw new Error("--muat harus impor atau sinkron");
  if (o.mode === "akhir" && (o.only || o.tanpaLampiran)) throw new Error("--mode akhir wajib cakupan penuh dan menyalin lampiran");
  return o;
}

// ---------------------------------------------------------------- klien ClickUp (HANYA GET)
const HOST_CLICKUP = /(^|\.)clickup\.com$/i;
const HOST_LAMPIRAN = /(^|\.)(clickup\.com|clickup-attachments\.com)$/i;

// Guard keras: satu-satunya jalur ke ClickUp melewati fungsi ini.
export function hanyaGet(method) {
  if (String(method).toUpperCase() !== "GET") {
    throw new Error(`Klien ClickUp HANYA boleh GET (ditolak: ${method}). Importer tidak pernah menulis ke ClickUp.`);
  }
}

function tunggu429(h) {
  const ra = Number(h.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 65_000) + 250;
  const reset = Number(h.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) return Math.min(Math.max(reset * 1000 - Date.now(), 1000), 65_000) + 500;
  return 5000;
}

export class KlienClickUp {
  #token;
  constructor({ base = CLICKUP_DEFAULT, token, rpm = 60, log = () => {} } = {}) {
    if (!token) throw new Error("CLICKUP_API_TOKEN kosong");
    this.base = String(base).replace(/\/+$/, "");
    const u = new URL(this.base);
    this.resmi = HOST_CLICKUP.test(u.hostname);
    this.hostApi = u.host;
    const r = Number(rpm) > 0 ? Number(rpm) : 60;
    this.rpm = this.resmi ? Math.min(r, 60) : r; // ke ClickUp asli: maks 60/menit (jatah 100/menit dibagi routine)
    this.jedaMs = 60_000 / this.rpm;
    this.#token = token;
    this.berikut = 0;
    this.stat = { permintaan: 0, r429: 0, ulang: 0, unduh: 0, tunggu_ms: 0 };
    this.log = log;
  }

  async #antre() {
    const kini = Date.now();
    const mulai = Math.max(kini, this.berikut);
    this.berikut = mulai + this.jedaMs;
    if (mulai > kini) {
      this.stat.tunggu_ms += mulai - kini;
      await tidur(mulai - kini);
    }
  }

  url(jalur, query = {}) {
    const u = new URL(this.base + jalur);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      for (const x of Array.isArray(v) ? v : [v]) u.searchParams.append(k, String(x));
    }
    return u;
  }

  async minta(method, jalur, query = {}) {
    hanyaGet(method);
    const u = this.url(jalur, query);
    for (let coba = 1; ; coba++) {
      await this.#antre();
      let res;
      try {
        res = await fetch(u, { method: "GET", headers: { Authorization: this.#token, accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      } catch (e) {
        if (coba < 4) { this.stat.ulang++; await tidur(2000 * coba); continue; }
        throw new GalatHttp(0, `ClickUp tak terjangkau: ${e.message}`, jalur);
      }
      this.stat.permintaan++;
      if (res.status === 429) {
        this.stat.r429++;
        await res.arrayBuffer().catch(() => {});
        if (coba >= 8) throw new GalatHttp(429, "rate limit terus setelah 8 percobaan", jalur);
        const t = tunggu429(res.headers);
        this.log(`  ClickUp 429 → tunggu ${Math.round(t / 1000)} dtk`);
        this.berikut = Math.max(this.berikut, Date.now() + t);
        continue;
      }
      if (res.status >= 500 && coba < 4) {
        this.stat.ulang++;
        await res.arrayBuffer().catch(() => {});
        await tidur(1500 * coba);
        continue;
      }
      const teks = await res.text();
      let j = null;
      try { j = teks ? JSON.parse(teks) : {}; } catch { j = null; }
      if (!res.ok) throw new GalatHttp(res.status, j?.err || j?.ECODE || teks.slice(0, 200), jalur, j?.ECODE);
      if (j === null) throw new GalatHttp(res.status, "respons bukan JSON", jalur);
      return j;
    }
  }

  get(jalur, query) {
    return this.minta("GET", jalur, query);
  }

  // Unduh berkas lampiran (URL CDN ClickUp). GET saja. Token ClickUp hanya dikirim bila server menolak tanpa
  // auth (401/403) DAN host milik ClickUp / host API yang dikonfigurasi.
  async unduh(url, { maksByte = MAKS_LAMPIRAN } = {}) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error(`URL lampiran tidak didukung: ${u.protocol}`);
    const percaya = u.host === this.hostApi || HOST_LAMPIRAN.test(u.hostname);
    for (let coba = 1; ; coba++) {
      let res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(120_000) });
      if ((res.status === 401 || res.status === 403) && percaya) {
        await res.arrayBuffer().catch(() => {});
        res = await fetch(u, { method: "GET", headers: { Authorization: this.#token }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
      }
      if ((res.status === 429 || res.status >= 500) && coba < 3) {
        await res.arrayBuffer().catch(() => {});
        await tidur(res.status === 429 ? tunggu429(res.headers) : 1500 * coba);
        continue;
      }
      if (!res.ok) {
        await res.arrayBuffer().catch(() => {});
        throw new GalatHttp(res.status, "unduh lampiran gagal", "lampiran");
      }
      const pj = Number(res.headers.get("content-length"));
      if (Number.isFinite(pj) && pj > maksByte) throw new GalatHttp(413, `berkas ${pj} byte > batas`, "lampiran");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maksByte) throw new GalatHttp(413, `berkas ${buf.length} byte > batas`, "lampiran");
      this.stat.unduh++;
      return { buf, tipe: (res.headers.get("content-type") || "").split(";")[0].trim() || null };
    }
  }
}

// ---------------------------------------------------------------- klien aplikasi Tugas (/x/impor/*)
export function turunkanX(url) {
  const u = String(url || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(u)) throw new Error("TUGAS_API_URL kosong/tidak sah");
  return (/\/v2$/.test(u) ? u.slice(0, -3) : u) + "/x";
}

export class KlienTugas {
  #token;
  constructor({ url, token }) {
    if (!token) throw new Error("TUGAS_IMPORT_TOKEN kosong");
    this.x = turunkanX(url);
    this.#token = token;
    this.stat = { permintaan: 0, r429: 0 };
  }

  async minta(method, jalur, body, { ulang = true, url = null } = {}) {
    for (let coba = 1; ; coba++) {
      let res;
      try {
        res = await fetch(url ?? this.x + jalur, {
          method, headers: { Authorization: this.#token, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(300_000),
        });
      } catch (e) {
        if (ulang && coba < 4) { await tidur(1000 * coba); continue; }
        throw new GalatHttp(0, `aplikasi Tugas tak terjangkau: ${e.message}`, jalur);
      }
      this.stat.permintaan++;
      if (res.status === 429 && coba < 12) {
        this.stat.r429++;
        await res.arrayBuffer().catch(() => {});
        const ra = Number(res.headers.get("retry-after"));
        await tidur((Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000) + 250);
        continue;
      }
      if (ulang && res.status >= 502 && res.status <= 504 && coba < 4) {
        await res.arrayBuffer().catch(() => {});
        await tidur(2000 * coba);
        continue;
      }
      const teks = await res.text();
      let j = null;
      try { j = teks ? JSON.parse(teks) : null; } catch { /* bukan JSON */ }
      if (!res.ok) throw new GalatHttp(res.status, j?.err || teks.slice(0, 200), jalur, j?.ECODE);
      return j;
    }
  }

  sensus() { return this.minta("GET", "/sensus?sumber=clickup"); }
  ekspor() { return this.minta("GET", "/export"); }
  batch(jenis, rows, mode, atAwal) {
    return this.minta("POST", "/impor/batch", { jenis, rows, mode, ...(atAwal ? { at_awal: atAwal } : {}) });
  }
  hilang(jenis, idsAda, mode, lingkup) {
    return this.minta("POST", "/impor/hilang", { jenis, ids_ada: idsAda, mode, ...(lingkup ? { lingkup } : {}) });
  }
  // ID tugas (tidak terhapus) di satu list app, semua status/arsip/sub-tugas — lewat /v2 (scope baca cukup).
  async idsTugasList(listId) {
    const ids = [];
    const v2 = this.x.replace(/\/x$/, "/v2");
    for (const arsip of ["false", "true"]) {
      for (let page = 0; page < 1000; page++) {
        const q = `list/${encodeURIComponent(listId)}/task?page=${page}&include_closed=true&subtasks=true&archived=${arsip}`;
        const j = await this.minta("GET", `/v2/${q}`, undefined, { url: `${v2}/${q}` });
        for (const t of j?.tasks || []) ids.push(String(t.id));
        if (j?.last_page === true || (j?.tasks || []).length < 100) break;
      }
    }
    return ids;
  }
  runMulai(mode) { return this.minta("POST", "/impor/run", { aksi: "mulai", mode }, { ulang: false }); }
  runSelesai(id, isi) { return this.minta("POST", "/impor/run", { aksi: "selesai", id, ...isi }); }
  uploadUrl(jalur) { return this.minta("POST", "/impor/upload-url", { path: jalur }); }

  async unggah(url, buf, tipe) {
    for (let coba = 1; ; coba++) {
      const res = await fetch(url, { method: "PUT", headers: { "content-type": tipe }, body: buf, signal: AbortSignal.timeout(300_000) });
      const teks = await res.text();
      if (res.ok) return;
      if (res.status >= 500 && coba < 3) { await tidur(1500 * coba); continue; }
      throw new GalatHttp(res.status, `unggah Storage gagal ${teks.slice(0, 160)}`, "storage");
    }
  }
}

// ---------------------------------------------------------------- tarik (ClickUp → payload)
function tambahList(p, l, spaceId, folderId, arsip) {
  if (p.lists.has(String(l.id))) return;
  p.lists.set(String(l.id), {
    id: String(l.id), space_id: spaceId, folder_id: folderId, name: l.name, content: l.content ?? null,
    archived: !!(l.archived ?? arsip), orderindex: l.orderindex ?? null, statuses: null,
  });
}

function anggotaDari(p, u, alasan) {
  if (!u || u.id === undefined || u.id === null || !/^\d{1,18}$/.test(String(u.id))) return;
  const id = Number(u.id);
  if (p.anggota.has(id)) return;
  p.anggota.set(id, { id, username: u.username ?? null, email: u.email ?? null, color: u.color ?? null, initials: u.initials ?? null,
    aktif: false, tim: false, alasan });
}

async function tarikKomentar(cu, taskId, catat) {
  const rows = [];
  const seen = new Set();
  let q = {};
  try {
    for (let hal = 0; hal < 400; hal++) {
      const j = await cu.get(`/task/${encodeURIComponent(taskId)}/comment`, q);
      const isi = j.comments || [];
      let baru = 0;
      for (const c of isi) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        rows.push({ ...c, task_id: taskId, parent_id: null });
        baru++;
      }
      if (isi.length < 25 || baru === 0) break; // halaman ClickUp = 25 komentar
      const akhir = isi[isi.length - 1];
      q = { start: akhir.date, start_id: akhir.id };
    }
    for (const c of rows.slice()) {
      if (!(Number(c.reply_count) > 0)) continue;
      const r = await cu.get(`/comment/${encodeURIComponent(c.id)}/reply`);
      for (const x of r.comments || []) {
        if (seen.has(x.id)) continue;
        seen.add(x.id);
        rows.push({ ...x, task_id: taskId, parent_id: c.id });
      }
    }
    return { rows, ok: true };
  } catch (e) {
    catat("komentar", taskId, e);
    return { rows, ok: false };
  }
}

function barisLampiran(a, taskId, commentId, cadangan = {}) {
  const title = a.title || a.name || cadangan.title || "berkas";
  const ext = (a.extension || ekstensi(title) || "").toLowerCase() || null;
  return {
    id: String(a.id), task_id: taskId, comment_id: commentId, title, extension: ext,
    mimetype: a.mimetype || (ext && MIME_EKST[ext]) || null,
    size: a.size !== undefined && a.size !== null && a.size !== "" ? Number(a.size) : null,
    url: a.url || null, date: a.date ?? cadangan.date ?? null,
    user: a.user?.id !== undefined ? { id: a.user.id } : cadangan.user?.id !== undefined ? { id: cadangan.user.id } : null,
  };
}

export async function tarik(cu, { only = null, teamId = null, log = () => {} } = {}) {
  const p = {
    team: null, timMentah: null, anggota: new Map(), spaces: new Map(), folders: new Map(), lists: new Map(), listMentah: new Map(),
    tugas: new Map(), komentar: new Map(), lampiran: new Map(), tis: null, galat: [], info: [],
    ok: { listTugas: new Set(), tugasKomentar: new Set(), tugasLampiran: new Set() }, cakupan: [], strukturLengkap: true,
    spaceAnggota: new Map(), anggotaListMentah: new Map(),
  };
  const catat = (fase, id, e) => {
    p.galat.push({ fase, id, status: e.status ?? null, err: String(e.message).slice(0, 300) });
    log(`  ! ${fase} ${id}: ${e.message}`);
  };

  // 1. workspace + anggota
  const tj = await cu.get("/team");
  const tim = (tj.teams || []).find((t) => !teamId || String(t.id) === String(teamId));
  if (!tim) throw new Error(teamId ? `team ${teamId} tidak ada di token ini` : "token tidak punya workspace");
  p.team = { id: String(tim.id), name: tim.name };
  p.timMentah = tim;
  for (const mb of tim.members || []) {
    const u = mb.user || mb;
    if (u?.id === undefined) continue;
    p.anggota.set(Number(u.id), { id: Number(u.id), username: u.username ?? null, email: u.email || null, color: u.color ?? null,
      initials: u.initials ?? null, aktif: true, tim: true, role: Number(u.role ?? mb.role) || null });
  }
  log(`workspace ${p.team.id}: ${p.anggota.size} anggota`);

  // 2. spaces (aktif + arsip)
  for (const arsip of [false, true]) {
    const j = await cu.get(`/team/${p.team.id}/space`, { archived: arsip });
    for (const s of j.spaces || []) {
      p.spaces.set(String(s.id), { id: String(s.id), name: s.name, private: !!s.private, archived: !!(s.archived ?? arsip), color: s.color ?? null });
    }
  }
  // 3. folders (termasuk hidden) + list tanpa folder, lalu list per folder (aktif + arsip)
  for (const s of p.spaces.values()) {
    for (const arsip of [false, true]) {
      try {
        const j = await cu.get(`/space/${s.id}/folder`, { archived: arsip });
        for (const f of j.folders || []) {
          p.folders.set(String(f.id), { id: String(f.id), space_id: s.id, name: f.name, hidden: !!f.hidden,
            archived: !!(f.archived ?? arsip), orderindex: f.orderindex ?? null });
        }
      } catch (e) { catat("folder", s.id, e); p.strukturLengkap = false; }
      try {
        const j = await cu.get(`/space/${s.id}/list`, { archived: arsip });
        for (const l of j.lists || []) tambahList(p, l, s.id, null, arsip);
      } catch (e) { catat("list_tanpa_folder", s.id, e); p.strukturLengkap = false; }
    }
  }
  for (const f of p.folders.values()) {
    for (const arsip of [false, true]) {
      try {
        const j = await cu.get(`/folder/${f.id}/list`, { archived: arsip });
        for (const l of j.lists || []) tambahList(p, l, f.space_id, f.id, arsip);
      } catch (e) { catat("list", f.id, e); p.strukturLengkap = false; }
    }
  }
  // 4. detail list → statuses (+ content)
  for (const l of p.lists.values()) {
    try {
      const d = await cu.get(`/list/${l.id}`);
      l.content = d.content ?? l.content;
      l.statuses = (d.statuses || []).map((s) => ({ status: s.status, type: s.type, orderindex: s.orderindex, color: s.color, id: s.id ?? null }));
      p.listMentah.set(l.id, d);
    } catch (e) { catat("status_list", l.id, e); }
  }
  log(`struktur: ${p.spaces.size} space, ${p.folders.size} folder, ${p.lists.size} list`);

  // GET /list/{id}/member (sekali per list per run; galat dicatat sekali lalu dilempar ke pemanggil)
  const cacheAnggota = new Map();
  const anggotaList = async (lid) => {
    if (!cacheAnggota.has(lid)) {
      cacheAnggota.set(lid, cu.get(`/list/${lid}/member`).then((j) => j.members || []).catch((e) => { catat("anggota_list", lid, e); throw e; }));
    }
    return cacheAnggota.get(lid);
  };
  const isiEmail = (members) => {
    for (const u of members) {
      const a = p.anggota.get(Number(u.id));
      if (a && !a.email && u.email) a.email = u.email;
    }
  };

  // 5. (perbaikan P2) anggota space PRIVAT. ClickUp v2 tidak punya endpoint anggota space: turunkan dari gabungan
  //    GET /list/{id}/member SEMUA list (aktif + arsip) di space itu + owner/admin workspace (role 1/2 di /team; di
  //    app mereka anggota biasa, R1). ASUMSI yang wajib diprobe (impor/README.md): /list/{id}/member di space privat
  //    = orang yang punya akses ke list itu. Satu list gagal dibaca, atau struktur tidak tersapu lengkap (daftar list
  //    bisa kurang) → anggota space itu tidak dikirim (anggota lama tidak disentuh).
  const pengelola = [...p.anggota.values()].filter((a) => a.tim && (a.role === 1 || a.role === 2)).map((a) => a.id);
  for (const s of p.spaces.values()) {
    if (!s.private) continue;
    const ids = new Set(pengelola);
    let ok = p.strukturLengkap, nList = 0;
    for (const l of p.lists.values()) {
      if (l.space_id !== s.id) continue;
      nList++;
      try {
        const members = await anggotaList(l.id);
        p.anggotaListMentah.set(l.id, members);
        isiEmail(members);
        for (const u of members) if (/^\d{1,18}$/.test(String(u?.id ?? ""))) ids.add(Number(u.id));
      } catch { ok = false; }
    }
    p.spaceAnggota.set(s.id, { space_id: s.id, ids: [...ids].sort((a, b) => a - b), list: nList, ok });
    if (!ok) p.info.push({ fase: "space_anggota", id: s.id, pesan: `anggota space privat ${s.id} tidak dikirim (list/struktur gagal dibaca)` });
  }

  // 6. email anggota yang masih kosong di /team → /list/{id}/member (berhenti begitu lengkap; maks 5 list)
  const tanpaEmail = () => [...p.anggota.values()].filter((a) => a.tim && !a.email);
  for (const l of [...p.lists.values()].slice(0, 5)) {
    if (!tanpaEmail().length) break;
    try { isiEmail(await anggotaList(l.id)); } catch { /* dicatat anggotaList */ }
  }
  if (tanpaEmail().length) p.info.push({ fase: "email_anggota", pesan: `${tanpaEmail().length} anggota tanpa email ClickUp` });

  // 7. tugas per list (archived false/true, include_closed, subtasks, semua halaman)
  if (only) {
    const takAda = [...only].filter((id) => !p.lists.has(id));
    if (takAda.length) throw new Error(`--only: list tidak ada di ClickUp: ${takAda.join(",")}`);
  }
  p.cakupan = only ? [...only] : [...p.lists.keys()];
  for (const lid of p.cakupan) {
    let ok = true;
    for (const arsip of [false, true]) {
      if (!ok) break;
      for (let page = 0; page < 1000; page++) {
        let j;
        try {
          j = await cu.get(`/list/${lid}/task`, { archived: arsip, include_closed: true, subtasks: true, include_markdown_description: true, page });
        } catch (e) { catat("tugas_list", lid, e); ok = false; break; }
        for (const t of j.tasks || []) if (!p.tugas.has(t.id)) p.tugas.set(t.id, t);
        if (j.last_page === true || (j.tasks || []).length < 100) break;
      }
    }
    if (ok) p.ok.listTugas.add(lid);
  }
  log(`tugas: ${p.tugas.size} dari ${p.cakupan.length} list`);

  // 8. detail tugas (lampiran, creator, markdown) + komentar (paginasi start/start_id) + balasan
  let n = 0;
  for (const id of [...p.tugas.keys()]) {
    let detailOk = true;
    try {
      p.tugas.set(id, await cu.get(`/task/${encodeURIComponent(id)}`, { include_markdown_description: true }));
    } catch (e) {
      if (e.status === 404) { // terhapus di antara daftar dan detail
        p.tugas.delete(id);
        p.info.push({ fase: "tugas_detail", id, pesan: "404 saat detail (dihapus di ClickUp saat sapuan)" });
        continue;
      }
      catat("tugas_detail", id, e);
      detailOk = false;
    }
    const kom = await tarikKomentar(cu, id, catat);
    p.komentar.set(id, kom.rows);
    if (kom.ok) p.ok.tugasKomentar.add(id);
    if (detailOk && kom.ok) p.ok.tugasLampiran.add(id);
    if (++n % 50 === 0) log(`  detail+komentar ${n}/${p.tugas.size}`);
  }

  // 9. lampiran: task.attachments + part komentar (attachment/image). Yang muncul di keduanya = lampiran komentar.
  for (const t of p.tugas.values()) {
    for (const a of t.attachments || []) if (a?.id) p.lampiran.set(String(a.id), barisLampiran(a, t.id, null));
  }
  for (const [taskId, rows] of p.komentar) {
    for (const c of rows) {
      for (const part of Array.isArray(c.comment) ? c.comment : []) {
        const a = part?.type === "attachment" ? part.attachment : part?.type === "image" ? part.image : null;
        if (!a?.id) continue;
        const ada = p.lampiran.get(String(a.id));
        if (ada) { ada.comment_id = c.id; continue; }
        p.lampiran.set(String(a.id), barisLampiran(a, taskId, c.id, { title: part.text, date: c.date, user: c.user }));
      }
    }
  }

  // 10. user di payload yang bukan anggota tim (sudah keluar) → anggota nonaktif
  for (const t of p.tugas.values()) {
    anggotaDari(p, t.creator, "creator");
    for (const u of t.assignees || []) anggotaDari(p, u, "assignee");
  }
  for (const rows of p.komentar.values()) {
    for (const c of rows) {
      anggotaDari(p, c.user, "penulis komentar");
      for (const part of Array.isArray(c.comment) ? c.comment : []) if (part?.type === "tag") anggotaDari(p, part.user, "mention");
    }
  }
  for (const t of p.tugas.values()) for (const a of t.attachments || []) anggotaDari(p, a.user, "pengunggah");

  // 11. time_in_status (dicoba; ditolak → dicatat sebagai info, bukan galat)
  p.tis = { ditolak: false, data: {} };
  for (const k of potong([...p.tugas.keys()], 100)) {
    try {
      Object.assign(p.tis.data, await cu.get("/task/bulk_time_in_status/task_ids", { task_ids: k }));
    } catch (e) {
      p.tis = { ditolak: true, status: e.status ?? null, err: String(e.message).slice(0, 200), data: null };
      p.info.push({ fase: "time_in_status", pesan: `ditolak ClickUp (HTTP ${e.status ?? "?"}): ${String(e.message).slice(0, 160)}` });
      break;
    }
  }
  log(`komentar ${[...p.komentar.values()].reduce((x, r) => x + r.length, 0)}, lampiran ${p.lampiran.size}, anggota ${p.anggota.size}`);
  return p;
}

// ---------------------------------------------------------------- sensus dari payload (tanpa panggil ClickUp lagi)
export function sensusPayload(p, listIds) {
  const per = new Map();
  for (const id of listIds) {
    per.set(id, { list_id: id, name: p.lists.get(id)?.name ?? null, tasks_total: 0, open: 0, closed: 0, archived: 0, subtasks: 0,
      comments_top: 0, replies: 0, reply_count_sum: 0, attachments_task: 0, attachments_comment: 0, assignee_links: 0, _t: [], _c: [] });
  }
  for (const t of p.tugas.values()) {
    const L = per.get(String(t.list?.id));
    if (!L) continue;
    L.tasks_total++;
    if (t.status?.type === "closed" || t.status?.type === "done") L.closed++; else L.open++;
    if (t.archived) L.archived++;
    if (t.parent) L.subtasks++;
    L.assignee_links += (t.assignees || []).length;
    L._t.push(String(t.id));
    for (const c of p.komentar.get(t.id) || []) {
      if (c.parent_id) L.replies++;
      else { L.comments_top++; L.reply_count_sum += Number(c.reply_count) || 0; }
      L._c.push(String(c.id));
    }
  }
  for (const a of p.lampiran.values()) {
    const t = p.tugas.get(a.task_id);
    const L = t && per.get(String(t.list?.id));
    if (!L) continue;
    if (a.comment_id) L.attachments_comment++; else L.attachments_task++;
  }
  for (const L of per.values()) {
    L.sha_ids_tasks = shaIds(L._t);
    L.sha_ids_comments = shaIds(L._c);
    L._ids = { tasks: L._t, comments: L._c };
    delete L._t;
    delete L._c;
  }
  return per;
}

export function bandingSensus(per, db) {
  const dbMap = new Map((db?.lists || []).map((l) => [String(l.list_id), l]));
  const baris = [];
  const selisih = [];
  for (const [id, a] of per) {
    const b = dbMap.get(id);
    const beda = [];
    if (!b) {
      beda.push("(list)");
      selisih.push({ list_id: id, kunci: "(list)", clickup: "ada", db: "tidak ada" });
    } else {
      for (const k of KUNCI_SENSUS) {
        if (a[k] !== b[k]) {
          beda.push(k);
          selisih.push({ list_id: id, kunci: k, clickup: a[k], db: b[k] });
        }
      }
    }
    const pilih = (x) => (x ? Object.fromEntries(KUNCI_SENSUS.map((k) => [k, x[k]])) : null);
    baris.push({ list_id: id, name: a.name, clickup: pilih(a), db: pilih(b), db_deleted: b?.deleted ?? null, beda });
  }
  return { baris, selisih };
}

// Rincian ID yang beda (hanya bila sha beda): pakai /x/export (scope impor).
async function rinciSelisih(tg, per, selisih) {
  const listBeda = new Set(selisih.filter((s) => s.kunci.startsWith("sha_") || s.kunci === "tasks_total").map((s) => s.list_id));
  if (!listBeda.size) return [];
  const ex = await tg.ekspor();
  const tugasDb = (ex.tasks || []).filter((t) => t.sumber === "clickup");
  const listHidup = new Map(tugasDb.filter((t) => !t.deleted_at).map((t) => [t.id, t.list_id])); // tugas hidup → list
  const out = [];
  for (const lid of listBeda) {
    const a = per.get(lid);
    const dbT = tugasDb.filter((t) => t.list_id === lid && !t.deleted_at).map((t) => t.id);
    const dbC = (ex.comments || []).filter((c) => c.sumber === "clickup" && !c.deleted_at && listHidup.get(c.task_id) === lid).map((c) => c.id);
    const beda = (x, y) => { const ys = new Set(y); return x.filter((v) => !ys.has(v)).slice(0, 25); };
    out.push({
      list_id: lid,
      tugas_hanya_clickup: beda(a._ids.tasks, dbT), tugas_hanya_db: beda(dbT, a._ids.tasks),
      komentar_hanya_clickup: beda(a._ids.comments, dbC), komentar_hanya_db: beda(dbC, a._ids.comments),
    });
  }
  return out;
}

// ---------------------------------------------------------------- baris impor
export function urutKedalaman(tugas) {
  const byId = new Map(tugas.map((t) => [String(t.id), t]));
  const dalam = (t) => {
    let d = 0, x = t;
    while (x?.parent && byId.has(String(x.parent)) && d < 50) { d++; x = byId.get(String(x.parent)); }
    return d;
  };
  return tugas.map((t, i) => ({ t, i, d: dalam(t) })).sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.t);
}
function barisTugas(t) {
  const { attachments: _lampiran, ...sisa } = t; // payload mentah LENGKAP (kontrak §5), lampiran dikirim terpisah
  return sisa;
}
const barisAnggota = (a) => ({
  user: { id: a.id, username: a.username, email: a.email, color: a.color, initials: a.initials }, aktif: a.aktif,
});

// ---------------------------------------------------------------- tulis ke app
async function tulis(tg, cu, p, o, log) {
  const r = { batch: {}, tertunda: [], gagal: [], hilang: {}, lampiran: { ok: 0, sudah_ada: 0, gagal: 0, tautan_saja: 0, dilewati: 0 },
    lampiran_gagal: [], lampiran_tautan: [], induk_luar: [], peringatan: [] };
  const tambah = (jenis, h) => {
    const x = (r.batch[jenis] ??= { inserted: 0, updated: 0, unchanged: 0, gagal: 0 });
    x.inserted += h?.inserted || 0;
    x.updated += h?.updated || 0;
    x.unchanged += h?.unchanged || 0;
    for (const k of ["dihapus", "ditambah", "dibuang"]) if (typeof h?.[k] === "number") x[k] = (x[k] || 0) + h[k];
    for (const g of h?.gagal || []) {
      x.gagal++;
      r.gagal.push({ jenis, id: g.id, err: String(g.err).slice(0, 300) });
    }
    if (Array.isArray(h?.dipertahankan) && h.dipertahankan.length) {
      r.peringatan.push(`list_statuses dipertahankan (masih dipakai tugas): ${JSON.stringify(h.dipertahankan).slice(0, 300)}`);
    }
    if (jenis === "space_anggota" && Array.isArray(h?.dilewati) && h.dilewati.length) {
      r.peringatan.push(`space_anggota: ID belum diimpor sebagai anggota (dilewati): ${JSON.stringify(h.dilewati).slice(0, 300)}`);
    }
  };
  const kirim = async (jenis, rows, ukuran) => {
    const tunda = [];
    for (const k of potong(rows, ukuran)) {
      const h = await tg.batch(jenis, k, o.muat, o.atAwal);
      tambah(jenis, h);
      tunda.push(...(h?.tertunda || []));
    }
    return tunda;
  };

  await kirim("workspace", [{ id: p.team.id, name: p.team.name }], 1);
  await kirim("members", [...p.anggota.values()].map(barisAnggota), 200);
  await kirim("spaces", [...p.spaces.values()].map((s) => ({ id: s.id, name: s.name, private: s.private, archived: s.archived, color: s.color })), 200);
  await kirim("folders", [...p.folders.values()].map((f) => ({ id: f.id, space_id: f.space_id, name: f.name, hidden: f.hidden,
    archived: f.archived, orderindex: f.orderindex })), 200);
  await kirim("lists", [...p.lists.values()].map((l) => ({ id: l.id, space_id: l.space_id, folder_id: l.folder_id, name: l.name,
    content: l.content, archived: l.archived, orderindex: l.orderindex })), 200);
  // (P2) anggota space privat = himpunan penuh sumber clickup per space (anggota tambahan Admin/app tidak disentuh)
  const rowsSA = [...p.spaceAnggota.values()].filter((x) => x.ok).map((x) => ({ space_id: x.space_id, member_ids: x.ids }));
  if (rowsSA.length) await kirim("space_anggota", rowsSA, 100);
  await kirim("list_statuses", [...p.lists.values()].filter((l) => l.statuses?.length).map((l) => ({ list_id: l.id, statuses: l.statuses })), 50);
  log(`struktur ditulis (muat=${o.muat})`);

  // tugas: induk sebelum anak (seluruh payload), lalu ulang baris tertunda; induk di luar cakupan diambil dari ClickUp
  let tunda = await kirim("tasks", urutKedalaman([...p.tugas.values()]).map(barisTugas), 40);
  const indukLuar = new Map();
  const indukHilang = new Set();
  for (let putaran = 1; tunda.length && putaran <= 6; putaran++) {
    const perlu = [...new Set(tunda.map((x) => String(x.parent_id)))]
      .filter((id) => !p.tugas.has(id) && !indukLuar.has(id) && !indukHilang.has(id));
    for (const id of perlu) {
      try {
        indukLuar.set(id, await cu.get(`/task/${encodeURIComponent(id)}`, { include_markdown_description: true }));
        r.induk_luar.push(id);
      } catch (e) {
        indukHilang.add(id);
        if (e.status !== 404) r.gagal.push({ jenis: "tasks", id, err: `ambil induk di luar cakupan: ${String(e.message).slice(0, 200)}` });
      }
    }
    const ulang = [];
    for (const id of perlu) if (indukLuar.has(id)) ulang.push(barisTugas(indukLuar.get(id)));
    for (const x of tunda) {
      const t = p.tugas.get(String(x.id)) ?? indukLuar.get(String(x.id));
      if (!t) continue;
      if (indukHilang.has(String(x.parent_id))) {
        ulang.push({ ...barisTugas(t), parent: null });
        r.peringatan.push(`induk ${x.parent_id} tidak ada di ClickUp: tugas ${x.id} dikirim tanpa induk`);
      } else ulang.push(barisTugas(t));
    }
    tunda = await kirim("tasks", urutKedalaman(ulang), 40);
  }
  r.tertunda.push(...tunda.map((x) => ({ jenis: "tasks", ...x })));
  log(`tugas ditulis: ${JSON.stringify(r.batch.tasks)}`);

  // komentar: top-level dulu, lalu balasan
  const semuaKom = [...p.komentar.values()].flat();
  let tundaK = await kirim("comments", [...semuaKom.filter((c) => !c.parent_id), ...semuaKom.filter((c) => c.parent_id)], 200);
  if (tundaK.length) {
    const byId = new Map(semuaKom.map((c) => [String(c.id), c]));
    tundaK = await kirim("comments", tundaK.map((x) => byId.get(String(x.id))).filter(Boolean), 200);
  }
  r.tertunda.push(...tundaK.map((x) => ({ jenis: "comments", ...x })));
  log(`komentar ditulis: ${JSON.stringify(r.batch.comments ?? {})}`);

  // lampiran: salin berkas (unduh ClickUp → signed upload URL) lalu catat baris
  const barisL = [];
  for (const a of p.lampiran.values()) {
    const row = { id: a.id, task_id: a.task_id, comment_id: a.comment_id, title: a.title, extension: a.extension,
      mimetype: a.mimetype, size: a.size, url: a.url, date: a.date, user: a.user };
    barisL.push(row);
    if (o.tanpaLampiran) { r.lampiran.dilewati++; continue; } // tanpa storage_path/status_salin → nilai lama dipertahankan
    const mime = String(a.mimetype || "").toLowerCase().split(";")[0].trim();
    const alasan = alasanTautanSaja(a);
    if (alasan) {
      row.storage_path = null;
      row.status_salin = "tautan_saja"; // tipe di luar allowlist bucket / terlalu besar / tanpa URL → tautan ClickUp saja
      r.lampiran.tautan_saja++;
      r.lampiran_tautan.push({ id: a.id, task_id: a.task_id, alasan }); // dilaporkan, bukan diam-diam
      continue;
    }
    const jalur = `t/${a.task_id}/${namaObjek(a.id, a.title)}`;
    try {
      const u = await tg.uploadUrl(jalur);
      const { buf } = await cu.unduh(a.url);
      await tg.unggah(u.url, buf, mime);
      row.storage_path = jalur;
      row.status_salin = "ok";
      r.lampiran.ok++;
    } catch (e) {
      if (e.status === 409 && e.ecode === "KONFLIK_001") { // objek sudah disalin run sebelumnya
        row.storage_path = jalur;
        row.status_salin = "ok";
        r.lampiran.sudah_ada++;
      } else {
        row.storage_path = null;
        row.status_salin = "gagal";
        r.lampiran.gagal++;
        r.lampiran_gagal.push({ id: a.id, task_id: a.task_id, status: e.status ?? null, err: String(e.message).slice(0, 200) });
      }
    }
  }
  await kirim("attachments", barisL, 100);
  log(`lampiran: ${JSON.stringify(r.lampiran)}`);

  // payload mentah (owner-only di app) untuk uji golden & forensik
  const mentah = [{ entity: "team", id: p.team.id, payload: p.timMentah }];
  for (const [id, d] of p.listMentah) mentah.push({ entity: "list", id, payload: d });
  for (const [id, m] of p.anggotaListMentah) mentah.push({ entity: "list_member", id, payload: m }); // (P2) bahan probe
  for (const t of p.tugas.values()) mentah.push({ entity: "task", id: String(t.id), payload: t });
  for (const [id, rows] of p.komentar) mentah.push({ entity: "komentar", id: String(id), payload: rows });
  if (p.tis && !p.tis.ditolak) for (const [id, v] of Object.entries(p.tis.data || {})) mentah.push({ entity: "time_in_status", id, payload: v });
  await kirim("sync_raw", mentah, 50);

  // tandai hilang (soft-delete) — hanya dalam lingkup yang benar-benar tersapu
  if (o.mode === "uji") {
    r.hilang = { dilewati: "mode uji" };
  } else {
    const idsTugas = [...p.tugas.keys(), ...indukLuar.keys()].map(String);
    const lists = [...p.ok.listTugas];
    // Verifikasi kandidat hilang: tugas yang ada di list app tetapi tidak muncul di daftar ClickUp list itu.
    // GET /task/{id} ClickUp: 404 = benar hilang; 200 = pindah ke list di luar cakupan (mis. --only) → diimpor
    // (list ikut pindah), bukan ditandai hilang; galat lain = tidak pasti → tidak ditandai.
    const kandidat = [];
    for (const lid of lists) {
      for (const id of await tg.idsTugasList(lid)) {
        if (!p.tugas.has(id) && !indukLuar.has(id) && !/^rt[0-9a-z]+$/.test(id)) kandidat.push(id);
      }
    }
    r.hilang_verifikasi = { kandidat: kandidat.length, hilang: 0, pindah: [], tak_pasti: [] };
    if (kandidat.length > 200 && !o.paksaHilang) {
      r.peringatan.push(`${kandidat.length} kandidat hilang > 200: verifikasi & tandai hilang tugas dilewati (pakai --paksa-hilang)`);
      lists.length = 0;
    } else {
      const pindahan = [];
      for (const id of kandidat) {
        try {
          const d = await cu.get(`/task/${encodeURIComponent(id)}`, { include_markdown_description: true });
          pindahan.push(d);
          idsTugas.push(id);
        } catch (e) {
          if (e.status === 404) r.hilang_verifikasi.hilang++;
          else { idsTugas.push(id); r.hilang_verifikasi.tak_pasti.push(id); }
        }
      }
      if (pindahan.length) {
        await kirim("tasks", urutKedalaman(pindahan).map(barisTugas), 40);
        r.hilang_verifikasi.pindah = pindahan.map((d) => String(d.id));
        r.peringatan.push(`${pindahan.length} tugas tidak ada di daftar list cakupan tetapi masih ada di ClickUp (pindah list): diimpor, tidak ditandai hilang`);
      }
    }
    if (lists.length) {
      const dbLama = (o.dbAwal?.lists || []).filter((l) => lists.includes(String(l.list_id))).reduce((n, l) => n + (l.tasks_total || 0), 0);
      const ada = [...p.tugas.values()].filter((t) => lists.includes(String(t.list?.id))).length;
      if (!o.paksaHilang && dbLama > 0 && dbLama - ada > Math.max(10, 0.25 * dbLama)) {
        r.peringatan.push(`tandai hilang tugas DILEWATI: app ${dbLama} vs ClickUp ${ada} (> 25%). Periksa lalu ulang dengan --paksa-hilang.`);
        r.hilang.tasks = { dilewati: true };
      } else {
        r.hilang.tasks = await tg.hilang("tasks", idsTugas, o.muat, { list_ids: lists });
      }
    }
    const tk = [...p.ok.tugasKomentar];
    if (tk.length) r.hilang.comments = await tg.hilang("comments", semuaKom.map((c) => String(c.id)), o.muat, { task_ids: tk });
    const tl = [...p.ok.tugasLampiran];
    if (tl.length) r.hilang.attachments = await tg.hilang("attachments", [...p.lampiran.keys()], o.muat, { task_ids: tl });
    for (const k of Object.keys(r.hilang)) if (r.hilang[k]?.ids) r.hilang[k] = { ditandai: r.hilang[k].ditandai, ids: r.hilang[k].ids.slice(0, 50) };
  }
  return r;
}

// ---------------------------------------------------------------- laporan
function tulisLaporan(dir, h) {
  fs.mkdirSync(dir, { recursive: true });
  const tgl = tanggalWib(h.mulai);
  const baris = [];
  const L = (s = "") => baris.push(s);
  L(`## Run ${h.run_id ?? "-"} · mode ${h.mode} · muat ${h.muat ?? "-"}${h.dry_run ? " · DRY-RUN" : ""} · ${tgl} ${jamWib(h.mulai)} WIB`);
  L();
  L(`- Durasi: ${h.durasi_detik} dtk. ClickUp: ${h.clickup.permintaan} permintaan (${h.clickup.r429}× 429, ${h.clickup.unduh} unduhan). App: ${h.app?.permintaan ?? 0} permintaan.`);
  L(`- Cakupan: ${h.cakupan.length} list${h.only ? ` (--only ${[...h.only].join(",")})` : ""}. Tugas ${h.jumlah.tugas}, komentar ${h.jumlah.komentar}, lampiran ${h.jumlah.lampiran}, anggota ${h.jumlah.anggota}.`);
  if (h.space_privat?.length) L(`- Space privat: ${h.space_privat.map((s) => `${s.space_id} ${s.ok ? `${s.anggota} anggota dari ${s.list} list` : "TIDAK dikirim (list/struktur gagal dibaca)"}`).join("; ")}`);
  if (h.tulis) {
    L(`- Tulis: ${Object.entries(h.tulis.batch).map(([k, v]) => `${k} +${v.inserted}/~${v.updated}/=${v.unchanged}${v.gagal ? `/gagal ${v.gagal}` : ""}`).join("; ")}`);
    L(`- Lampiran: ${Object.entries(h.tulis.lampiran).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    L(`- Hilang: ${JSON.stringify(Object.fromEntries(Object.entries(h.tulis.hilang).map(([k, v]) => [k, v?.ditandai ?? v])))}`
      + (h.tulis.hilang_verifikasi ? `; verifikasi kandidat ${h.tulis.hilang_verifikasi.kandidat} (404 ${h.tulis.hilang_verifikasi.hilang}, pindah list ${h.tulis.hilang_verifikasi.pindah.length}, tak pasti ${h.tulis.hilang_verifikasi.tak_pasti.length})` : ""));
    if (h.tulis.induk_luar.length) L(`- Induk di luar cakupan diimpor (tanpa komentar): ${h.tulis.induk_luar.join(", ")}`);
  }
  L(`- time_in_status: ${h.tis}`);
  L(`- Galat baca ClickUp: ${h.galat.length}. Baris gagal: ${h.tulis?.gagal.length ?? 0}. Tertunda: ${h.tulis?.tertunda.length ?? 0}.`);
  L();
  if (h.sensus) {
    L(`Sensus per list (ClickUp / app; sumber=clickup). Selisih: **${h.sensus.selisih.length}**.`);
    L();
    L("| list | nama | tugas | open | closed | arsip | sub | kom | bls | Σreply | lamp t | lamp k | assign | sha t | sha k | hapus(app) | beda |");
    L("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const b of h.sensus.baris) {
      const s = (k) => (b.db ? (b.clickup[k] === b.db[k] ? String(b.clickup[k]) : `${b.clickup[k]}/${b.db[k]}`) : `${b.clickup[k]}/-`);
      const sha = (k) => (b.db && b.clickup[k] === b.db[k] ? "sama" : "BEDA");
      L(`| ${b.list_id} | ${String(b.name ?? "").replace(/\|/g, "/")} | ${s("tasks_total")} | ${s("open")} | ${s("closed")} | ${s("archived")} | ${s("subtasks")} | ${s("comments_top")} | ${s("replies")} | ${s("reply_count_sum")} | ${s("attachments_task")} | ${s("attachments_comment")} | ${s("assignee_links")} | ${sha("sha_ids_tasks")} | ${sha("sha_ids_comments")} | ${b.db_deleted ?? "-"} | ${b.beda.join(",") || "-"} |`);
    }
    L();
    if (h.sensus.rinci?.length) L(`Rincian ID beda: \`${JSON.stringify(h.sensus.rinci).slice(0, 2000)}\``);
  }
  const catatan = [
    ...h.galat.map((g) => `galat ${g.fase} ${g.id}: ${g.err}`),
    ...(h.tulis?.gagal || []).map((g) => `gagal ${g.jenis} ${g.id}: ${g.err}`),
    ...(h.tulis?.tertunda || []).map((g) => `tertunda ${g.jenis} ${g.id} (induk ${g.parent_id})`),
    ...(h.tulis?.lampiran_gagal || []).map((g) => `lampiran gagal ${g.id} (tugas ${g.task_id}): ${g.err}`),
    ...(h.tulis?.lampiran_tautan || []).map((g) => `lampiran tautan_saja ${g.id} (tugas ${g.task_id}): ${g.alasan}`),
    ...(h.tulis?.peringatan || []), ...h.peringatan, ...h.info.map((i) => `info ${i.fase}: ${i.pesan ?? i.id}`),
  ];
  if (catatan.length) {
    L("Catatan:");
    for (const c of catatan.slice(0, 200)) L(`- ${c}`);
  }
  L();
  const md = path.join(dir, `${tgl}.md`);
  const baru = !fs.existsSync(md);
  fs.appendFileSync(md, (baru ? `# Laporan sinkron ClickUp → Tugas · ${tgl}\n\nHanya angka per list (tanpa nama kartu). Jangan di-commit.\n\n` : "") + baris.join("\n") + "\n");
  const js = path.join(dir, `${tgl}-${jamWib(h.mulai).replace(/:/g, "")}-${h.mode}${h.dry_run ? "-dry" : ""}.json`);
  fs.writeFileSync(js, JSON.stringify({ ...h, only: h.only ? [...h.only] : null }, null, 2));
  return { md, json: js };
}

// ---------------------------------------------------------------- utama
export async function jalankan(argv, env = process.env) {
  const mulai = new Date();
  const diam = env.SINKRON_DIAM === "1";
  const log = (s) => { if (!diam) console.error(`[sinkron ${jamWib()}] ${s}`); };
  let o;
  try {
    o = bacaArgumen(argv);
  } catch (e) {
    console.error(`sinkron: ${e.message}`);
    return { kode: 1 };
  }
  if (o.bantuan) {
    console.error(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 24).join("\n"));
    return { kode: 0 };
  }
  const h = {
    mulai, mode: o.mode, dry_run: o.dryRun, only: o.only, muat: null, run_id: null, cakupan: [], galat: [], info: [], peringatan: [],
    clickup: {}, app: null, jumlah: {}, space_privat: [], tulis: null, sensus: null, tis: "-", durasi_detik: 0,
  };
  let cu, tg = null, run = null, p = null, kode = 0;
  try {
    cu = new KlienClickUp({ base: env.CLICKUP_API_BASE || CLICKUP_DEFAULT, token: (env.CLICKUP_API_TOKEN || "").trim(), rpm: env.SINKRON_RPM, log });
    const urlApp = (env.TUGAS_API_URL || "").trim();
    const tokApp = (env.TUGAS_IMPORT_TOKEN || "").trim();
    if (urlApp && tokApp) tg = new KlienTugas({ url: urlApp, token: tokApp });
    else if (!o.dryRun) throw new Error("TUGAS_API_URL dan TUGAS_IMPORT_TOKEN wajib (kecuali --dry-run)");
    log(`mulai: mode ${o.mode}${o.dryRun ? " (dry-run)" : ""}, ClickUp ${cu.resmi ? "asli" : cu.base} ≤${cu.rpm}/menit`);

    p = await tarik(cu, { only: o.only, teamId: env.CLICKUP_TEAM_ID || null, log });
    h.cakupan = p.cakupan;
    h.galat.push(...p.galat);
    h.info.push(...p.info);
    h.tis = p.tis?.ditolak ? `ditolak (HTTP ${p.tis.status ?? "?"})` : `ok (${Object.keys(p.tis?.data || {}).length} tugas)`;
    h.jumlah = { tugas: p.tugas.size, komentar: [...p.komentar.values()].reduce((n, r) => n + r.length, 0), lampiran: p.lampiran.size,
      anggota: p.anggota.size, anggota_nonaktif: [...p.anggota.values()].filter((a) => !a.aktif).length, list: p.lists.size };
    h.space_privat = [...p.spaceAnggota.values()].map((x) => ({ space_id: x.space_id, list: x.list, anggota: x.ids.length, ok: x.ok }));
    if (!p.strukturLengkap) h.peringatan.push("struktur ClickUp tidak tersapu lengkap (lihat galat)");

    const dbAwal = tg ? await tg.sensus() : null;
    const listSensus = p.cakupan.filter((id) => p.ok.listTugas.has(id));
    const per = sensusPayload(p, listSensus);
    if (dbAwal) {
      const adaData = (dbAwal.lists || []).some((l) => p.cakupan.includes(String(l.list_id)) && (l.tasks_total || 0) + (l.deleted || 0) > 0);
      h.muat = o.muat || (adaData ? "sinkron" : "impor");
    }

    if (!o.dryRun) {
      run = await tg.runMulai(o.mode);
      h.run_id = run.id;
      log(`run ${run.id} (at_awal ${run.at_awal ?? "-"}), muat=${h.muat}`);
      h.tulis = await tulis(tg, cu, p, { ...o, muat: h.muat, atAwal: run.at_awal, dbAwal }, log);
    }
    if (tg) {
      const dbAkhir = o.dryRun ? dbAwal : await tg.sensus();
      h.sensus = bandingSensus(per, dbAkhir);
      if (h.sensus.selisih.length && !o.dryRun) {
        try { h.sensus.rinci = await rinciSelisih(tg, per, h.sensus.selisih); } catch (e) { h.peringatan.push(`rinci selisih gagal: ${e.message}`); }
      }
      // list ClickUp di app yang tak lagi terlihat di ClickUp (space yang sama)
      if (!o.only) {
        const hilangList = (dbAkhir?.lists || []).filter((l) => p.spaces.has(String(l.space_id)) && !p.lists.has(String(l.list_id)));
        if (hilangList.length) h.peringatan.push(`${hilangList.length} list di app tidak ditemukan di ClickUp: ${hilangList.map((l) => l.list_id).join(",")}`);
      }
    } else {
      h.sensus = { baris: [...per.values()].map((a) => ({ list_id: a.list_id, name: a.name, clickup: Object.fromEntries(KUNCI_SENSUS.map((k) => [k, a[k]])), db: null, db_deleted: null, beda: [] })), selisih: [] };
      h.peringatan.push("dry-run tanpa token app: sensus tidak dibandingkan");
    }
    // Lampiran gagal salin TIDAK memicu kode 2 (status_salin='gagal' + clickup_url = hasil sah kontrak; diulang tiap run).
    const bermasalah = h.sensus.selisih.length || h.galat.length || h.tulis?.gagal.length || h.tulis?.tertunda.length;
    kode = bermasalah ? 2 : 0;
  } catch (e) {
    kode = 1;
    h.galat.push({ fase: "fatal", id: null, status: e.status ?? null, err: String(e.message).slice(0, 500) });
    console.error(`sinkron: GAGAL -> ${e.message}`);
  } finally {
    h.durasi_detik = Math.round((Date.now() - mulai.getTime()) / 1000);
    h.clickup = cu ? { ...cu.stat, rpm: cu.rpm } : {};
    h.app = tg ? { ...tg.stat } : null;
    if (run && tg) {
      try {
        await tg.runSelesai(run.id, {
          counts: { ...h.jumlah, space_privat: h.space_privat, tulis: h.tulis?.batch ?? null, lampiran: h.tulis?.lampiran ?? null, hilang: h.tulis?.hilang ?? null,
            clickup: h.clickup, muat: h.muat, only: o?.only ? [...o.only] : null, durasi_detik: h.durasi_detik },
          census: h.sensus ? { lists: h.sensus.baris.map((b) => ({ list_id: b.list_id, clickup: b.clickup, db: b.db })) } : null,
          diffs: h.sensus ? { selisih: h.sensus.selisih, rinci: h.sensus.rinci ?? [] } : null,
          errors: [...h.galat, ...(h.tulis?.gagal || []), ...(h.tulis?.tertunda || []).map((t) => ({ ...t, err: "tertunda" })),
            ...(h.tulis?.lampiran_gagal || [])].slice(0, 500),
        });
      } catch (e) {
        h.peringatan.push(`impor_run_selesai gagal: ${e.message}`);
        if (kode === 0) kode = 2;
      }
    }
  }
  let berkas = null;
  try {
    berkas = tulisLaporan(o.laporan || env.SINKRON_LAPORAN_DIR || path.join(HERE, "laporan"), h);
  } catch (e) {
    console.error(`sinkron: laporan gagal ditulis: ${e.message}`);
  }
  const ringkas = {
    kode, mode: h.mode, dry_run: h.dry_run, muat: h.muat, run_id: h.run_id, durasi_detik: h.durasi_detik,
    clickup: { permintaan: h.clickup.permintaan, r429: h.clickup.r429, unduh: h.clickup.unduh, rpm: h.clickup.rpm },
    jumlah: h.jumlah, space_privat: h.space_privat, tulis: h.tulis?.batch ?? null, lampiran: h.tulis?.lampiran ?? null,
    hilang: h.tulis ? Object.fromEntries(Object.entries(h.tulis.hilang).map(([k, v]) => [k, v?.ditandai ?? v])) : null,
    hilang_verifikasi: h.tulis?.hilang_verifikasi ? { kandidat: h.tulis.hilang_verifikasi.kandidat, hilang_404: h.tulis.hilang_verifikasi.hilang,
      pindah: h.tulis.hilang_verifikasi.pindah.length, tak_pasti: h.tulis.hilang_verifikasi.tak_pasti.length } : null,
    tertunda: h.tulis?.tertunda.length ?? 0, gagal: h.tulis?.gagal.length ?? 0, galat: h.galat.length,
    sensus: h.sensus ? { list: h.sensus.baris.length, selisih: h.sensus.selisih.length } : null,
    time_in_status: h.tis, peringatan: h.peringatan.length + (h.tulis?.peringatan.length ?? 0), induk_luar: h.tulis?.induk_luar.length ?? 0,
    laporan: berkas?.md ?? null, laporan_json: berkas?.json ?? null,
  };
  return { kode, ringkas, hasil: h, payload: p };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await jalankan(process.argv.slice(2));
  if (r.ringkas) console.log(JSON.stringify(r.ringkas, null, 2));
  process.exit(r.kode);
}
