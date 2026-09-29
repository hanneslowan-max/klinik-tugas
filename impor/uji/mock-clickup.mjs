// Server ClickUp API v2 TIRUAN (node:http, tanpa dependensi) untuk uji importer (impor/sinkron.mjs) dan
// uji banding (uji/banding.mjs). Data dari fixture SINTETIS impor/uji/fixture/*.json.
//
// Bentuk JSON meniru ClickUp v2 (task/comment/list/folder/space/team/member/attachment). Perilaku yang BELUM
// dipastikan lewat probe ClickUp asli sengaja disamakan dengan asumsi kontrak A2 (docs/KONTRAK-DB.md) dan
// ditandai "ASUMSI" di bawah — daftar lengkapnya di uji/banding/README.md.
//
// Hanya GET. Method lain → 405 dan dicatat (stat.nonGet) supaya uji bisa membuktikan importer tidak menulis.
//
// Pemakaian:
//   node impor/uji/mock-clickup.mjs [--port 0] [--varian awal|ubah] [--run abcd] [--tis] [--429 N]
//     → baris pertama stdout: {"base":"http://127.0.0.1:<port>/api/v2","port":…,"token":"pk_…"}
//   import { mulaiMock } from "./mock-clickup.mjs";  const m = await mulaiMock({ varian: "awal" });  … m.tutup()

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = path.join(HERE, "fixture");
export const TOKEN_TIRUAN = "pk_88200001_TIRUANB2UJI";

// ---------------------------------------------------------------- waktu
// 'YYYY-MM-DD' = due tanpa jam → ms 12:00 WIB (sama dengan toMs clickup.mjs). ISO → ms persis.
function msDari(v) {
  if (v === undefined || v === null || v === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return String(Date.parse(`${v}T12:00:00+07:00`));
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`fixture: tanggal tidak sah "${v}"`);
  return String(t);
}
const berjam = (v) => typeof v === "string" && /T\d/.test(v);

const PRIORITAS = {
  1: { id: "1", priority: "urgent", color: "#f50000", orderindex: "1" },
  2: { id: "2", priority: "high", color: "#ffcc00", orderindex: "2" },
  3: { id: "3", priority: "normal", color: "#6fddff", orderindex: "3" },
  4: { id: "4", priority: "low", color: "#d8d8d8", orderindex: "4" },
};

const MIME_EKST = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf", csv: "text/csv", svg: "image/svg+xml", txt: "text/plain" };

// ---------------------------------------------------------------- model
export function muatModel({ varian = "awal", run = "0000", dir = FIXTURE_DIR } = {}) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, "awal.json"), "utf8"));
  const statusId = (listId, nama) => `sc${listId}_${crypto.createHash("sha1").update(`${listId}:${nama}`).digest("hex").slice(0, 8)}`;

  // status per list (id dihitung dari nama AWAL; ganti nama mempertahankan id seperti ClickUp)
  for (const l of fx.lists) {
    const set = typeof l.statuses === "string" ? fx.status_set[l.statuses] : l.statuses;
    if (!set) throw new Error(`fixture: status_set ${l.statuses} tak ada`);
    l.statuses = set.map((s, i) => ({ id: statusId(l.id, s.status), status: s.status, type: s.type, color: s.color, orderindex: i }));
  }

  // tugas generik (list besar untuk uji paginasi 100/halaman)
  for (const g of fx.generate || []) {
    for (let n = 1; n <= g.jumlah; n++) {
      const nnn = String(n).padStart(3, "0");
      const dibuat = new Date(Date.parse(g.dibuat_mulai) + (n - 1) * g.jarak_jam * 3600e3).toISOString();
      const selesai = g.selesai_tiap && n % g.selesai_tiap === 0;
      fx.tasks.push({
        id: `${g.awalan_id}${String(n).padStart(4, "0")}`, list: g.list, name: g.nama.replace("{nnn}", nnn).replace("{n}", String(n)),
        status: selesai ? "complete" : "to do", creator: g.creator,
        assignees: g.assignee_tiap && n % g.assignee_tiap === 0 ? [g.assignee] : [],
        archived: !!(g.arsip_tiap && n % g.arsip_tiap === 0),
        created: dibuat, updated: dibuat, closed: selesai ? dibuat : undefined, orderindex: String(n),
      });
    }
  }
  // kartu dengan komentar banyak (>25, uji paginasi start/start_id)
  for (const k of fx.komentar_banyak || []) {
    for (let n = 1; n <= k.jumlah; n++) {
      fx.comments.push({
        id: `${k.awalan_id}${String(n).padStart(2, "0")}`, task: k.task, user: k.users[(n - 1) % k.users.length],
        date: new Date(Date.parse(k.mulai) + (n - 1) * k.jarak_menit * 60e3).toISOString(), teks: k.teks.replace("{n}", String(n)),
      });
    }
    if (k.balasan) {
      fx.comments.push({ ...k.balasan, task: k.task, reply_to: `${k.awalan_id}${String(k.balasan_pada).padStart(2, "0")}` });
    }
  }

  if (varian !== "awal") {
    const ubah = JSON.parse(fs.readFileSync(path.join(dir, `${varian}.json`), "utf8").replaceAll("{RUN}", run));
    for (const op of ubah.ops) terapkan(fx, op);
  }

  // indeks + validasi (fixture salah → gagal keras, bukan diam)
  const m = {
    sekarang: fx.sekarang, team: fx.team, pemilik: fx.pemilik_token, varian,
    users: new Map(fx.users.map((u) => [u.id, u])),
    spaces: new Map(fx.spaces.map((s) => [s.id, s])),
    folders: new Map(fx.folders.map((f) => [f.id, f])),
    lists: new Map(fx.lists.map((l) => [l.id, l])),
    tasks: new Map(), comments: new Map(), lampiran: new Map(), berkas: new Map(), host: "",
  };
  const wajib = (ok, pesan) => { if (!ok) throw new Error(`fixture (${varian}): ${pesan}`); };
  for (const f of fx.folders) wajib(m.spaces.has(f.space), `folder ${f.id}: space ${f.space} tak ada`);
  for (const l of fx.lists) {
    wajib(m.spaces.has(l.space), `list ${l.id}: space tak ada`);
    wajib(l.folder === null || m.folders.has(l.folder), `list ${l.id}: folder tak ada`);
    wajib(l.folder !== null || l.folder_hidden_id, `list ${l.id}: list tanpa folder wajib folder_hidden_id`);
  }
  for (const t of fx.tasks) {
    const l = m.lists.get(t.list);
    wajib(l, `task ${t.id}: list ${t.list} tak ada`);
    wajib(l.statuses.some((s) => s.status === t.status), `task ${t.id}: status "${t.status}" tak ada di list ${t.list}`);
    for (const u of [t.creator, ...(t.assignees || [])]) wajib(m.users.has(u), `task ${t.id}: user ${u} tak ada`);
    wajib(!m.tasks.has(t.id), `task ${t.id} dobel`);
    m.tasks.set(t.id, { assignees: [], ...t });
  }
  for (const t of m.tasks.values()) wajib(!t.parent || m.tasks.has(t.parent), `task ${t.id}: parent ${t.parent} tak ada`);
  for (const c of fx.comments) {
    wajib(m.tasks.has(c.task), `komentar ${c.id}: task tak ada`);
    wajib(m.users.has(c.user), `komentar ${c.id}: user tak ada`);
    wajib(!m.comments.has(c.id), `komentar ${c.id} dobel`);
    m.comments.set(c.id, c);
  }
  for (const c of m.comments.values()) wajib(!c.reply_to || m.comments.has(c.reply_to), `komentar ${c.id}: induk tak ada`);

  const muatBerkas = (nama) => {
    if (!nama) return null;
    if (!m.berkas.has(nama)) m.berkas.set(nama, fs.readFileSync(path.join(dir, "berkas", nama)));
    return m.berkas.get(nama);
  };
  for (const t of m.tasks.values()) {
    for (const a of t.attachments || []) {
      const buf = muatBerkas(a.berkas);
      m.lampiran.set(a.id, { ...a, task: t.id, comment: null, size: buf ? buf.length : a.ukuran ?? 0 });
    }
  }
  for (const c of m.comments.values()) {
    for (const p of c.parts || []) {
      if (!p.lampiran) continue;
      const buf = muatBerkas(p.lampiran.berkas);
      // ASUMSI (A2 / probe b): lampiran komentar ikut muncul di task.attachments.
      m.lampiran.set(p.lampiran.id, { ...p.lampiran, task: c.task, comment: c.id, user: c.user, date: c.date, size: buf ? buf.length : 0 });
    }
  }
  for (const a of m.lampiran.values()) wajib(m.users.has(a.user), `lampiran ${a.id}: user tak ada`);
  return m;
}

function terapkan(fx, op) {
  const task = (id) => {
    const t = fx.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`ubah: task ${id} tak ada`);
    return t;
  };
  switch (op.op) {
    case "tambah_user": fx.users.push(op.user); break;
    case "ubah_task": Object.assign(task(op.id), op.set); break;
    case "hapus_task": fx.tasks = fx.tasks.filter((t) => t.id !== op.id); fx.comments = fx.comments.filter((c) => c.task !== op.id); break;
    case "tambah_task": fx.tasks.push(op.task); break;
    case "ubah_komentar": {
      const c = fx.comments.find((x) => x.id === op.id);
      if (!c) throw new Error(`ubah: komentar ${op.id} tak ada`);
      c.teks = op.teks; delete c.parts;
      break;
    }
    case "hapus_komentar": fx.comments = fx.comments.filter((c) => c.id !== op.id && c.reply_to !== op.id); break;
    case "tambah_komentar": fx.comments.push(op.comment); break;
    case "hapus_lampiran":
      for (const t of fx.tasks) if (t.attachments) t.attachments = t.attachments.filter((a) => a.id !== op.id);
      break;
    case "ubah_list": Object.assign(fx.lists.find((l) => l.id === op.id), op.set); break;
    case "ganti_status": {
      const l = fx.lists.find((x) => x.id === op.list);
      const s = l.statuses.find((x) => x.status === op.dari);
      if (!s) throw new Error(`ubah: status ${op.dari} tak ada`);
      s.status = op.ke; // id tetap (rename ClickUp)
      for (const t of fx.tasks) if (t.list === op.list && t.status === op.dari) t.status = op.ke;
      break;
    }
    default: throw new Error(`ubah: op tak dikenal ${op.op}`);
  }
}

// ---------------------------------------------------------------- bentuk JSON ClickUp
function jUserMember(u) {
  return { id: u.id, username: u.username, color: u.color, initials: u.initials, email: u.email, profilePicture: u.profilePicture ?? null };
}
const jCreator = (u) => ({ id: u.id, username: u.username, color: u.color, email: u.email, profilePicture: u.profilePicture ?? null });

function jFolderTask(m, l) {
  if (l.folder) {
    const f = m.folders.get(l.folder);
    return { id: f.id, name: f.name, hidden: !!f.hidden, access: true };
  }
  // List tanpa folder: ClickUp menaruhnya di folder tersembunyi ber-ID nyata.
  return { id: l.folder_hidden_id, name: "hidden", hidden: true, access: true };
}

function akarInduk(m, t) {
  let x = t, n = 0;
  while (x.parent && n++ < 50) x = m.tasks.get(x.parent);
  return x.id;
}

function jLampiran(m, a) {
  const url = `${m.host}/files/${a.id}/${encodeURIComponent(a.title)}`;
  const gambar = /^image\/(png|jpeg|gif|webp)$/.test(a.mimetype);
  return {
    id: a.id, date: msDari(a.date), title: a.title, type: 1, source: 1, version: 0,
    extension: a.title.split(".").pop(),
    thumbnail_small: gambar ? `${m.host}/files/${a.id}/small_${encodeURIComponent(a.title)}` : null,
    thumbnail_large: gambar ? `${m.host}/files/${a.id}/large_${encodeURIComponent(a.title)}` : null,
    is_folder: null, mimetype: a.mimetype, hidden: false, parent_id: a.task, size: a.size,
    total_comments: 0, resolved_comments: 0, user: jUserMember(m.users.get(a.user)), deleted: false, orientation: null, url,
  };
}

export function jTask(m, t, { md = false, lampiran = false } = {}) {
  const l = m.lists.get(t.list);
  const st = l.statuses.find((s) => s.status === t.status);
  const fo = jFolderTask(m, l);
  const teks = t.teks ?? t.md ?? "";
  const pengamat = [];
  for (const id of [t.creator, ...t.assignees]) if (!pengamat.includes(id)) pengamat.push(id);
  const o = { id: t.id, custom_id: null, custom_item_id: 0, name: t.name, text_content: teks, description: teks };
  if (md) o.markdown_description = t.md ?? "";
  Object.assign(o, {
    status: { id: st.id, status: st.status, color: st.color, orderindex: st.orderindex, type: st.type },
    orderindex: t.orderindex ?? "0",
    date_created: msDari(t.created), date_updated: msDari(t.updated ?? t.created),
    date_closed: msDari(t.closed), date_done: msDari(t.done ?? t.closed),
    archived: !!t.archived,
    creator: jCreator(m.users.get(t.creator)),
    // ASUMSI (probe): urutan assignees = urutan di fixture (fixture memakai urut id / urut penugasan).
    assignees: t.assignees.map((u) => jUserMember(m.users.get(u))),
    group_assignees: [],
    watchers: pengamat.map((u) => jUserMember(m.users.get(u))),
    checklists: t.checklists ?? [],
    tags: (t.tags ?? []).map((x) => ({ ...x })),
    parent: t.parent ?? null,
    top_level_parent: t.parent ? akarInduk(m, t) : null,
    priority: t.priority ? PRIORITAS[t.priority] : null,
    due_date: msDari(t.due), due_date_time: t.due_jam ?? berjam(t.due),
    start_date: msDari(t.start), start_date_time: t.start_jam ?? berjam(t.start),
    points: null, time_estimate: null, custom_fields: [], dependencies: [], linked_tasks: [], locations: [],
    team_id: m.team.id,
    url: `https://app.clickup.com/t/${t.id}`,
    sharing: {
      public: false, public_share_expires_on: null,
      public_fields: ["assignees", "priority", "due_date", "content", "comments", "attachments", "customFields", "subtasks", "tags", "checklists", "coverimage"],
      token: null, seo_optimized: false,
    },
    permission_level: "create",
    list: { id: l.id, name: l.name, access: true },
    project: fo, folder: { ...fo },
    space: { id: l.space },
  });
  if (lampiran) {
    // ASUMSI (A2): urut tanggal lalu id; lampiran komentar ikut.
    o.attachments = [...m.lampiran.values()].filter((a) => a.task === t.id)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || (a.id < b.id ? -1 : 1)).map((a) => jLampiran(m, a));
  }
  return o;
}

function partsKomentar(m, c) {
  if (!c.parts) return [{ text: c.teks }];
  return c.parts.map((p) => {
    if (p.tag !== undefined) {
      const u = m.users.get(p.tag);
      return { type: "tag", user: { id: u.id, username: u.username, email: u.email, color: u.color, initials: u.initials, profilePicture: u.profilePicture ?? null } };
    }
    if (p.lampiran) {
      const a = m.lampiran.get(p.lampiran.id);
      const url = `${m.host}/files/${a.id}/${encodeURIComponent(a.title)}`;
      if (p.lampiran.jenis === "image") {
        return { type: "image", text: a.title, image: { id: a.id, name: a.title, title: a.title, type: a.title.split(".").pop(),
          extension: a.title.split(".").pop(), thumbnail_large: url, thumbnail_medium: url, thumbnail_small: url, url, uploaded: true } };
      }
      return { type: "attachment", text: a.title, attachment: { id: a.id, date: msDari(a.date), title: a.title, type: 1, source: 1, version: 0,
        extension: a.title.split(".").pop(), thumbnail_small: null, thumbnail_large: null, url } };
    }
    return { text: p.text };
  });
}
function teksKomentar(m, c) {
  if (!c.parts) return c.teks;
  return c.parts.map((p) => (p.tag !== undefined ? `@${m.users.get(p.tag).username}` : p.lampiran ? p.lampiran.title : p.text)).join("");
}
function jKomentar(m, c, { balasan = false } = {}) {
  const o = {
    id: c.id, comment: partsKomentar(m, c), comment_text: teksKomentar(m, c), user: jUserMember(m.users.get(c.user)),
    assignee: null, group_assignee: null, reactions: [], date: msDari(c.date), resolved: false,
  };
  if (!balasan) o.reply_count = String([...m.comments.values()].filter((r) => r.reply_to === c.id).length);
  return o;
}

function jumlahTugas(m, listId) {
  return [...m.tasks.values()].filter((t) => t.list === listId && !t.archived).length;
}
function jList(m, l, { statuses = false } = {}) {
  const s = m.spaces.get(l.space);
  const o = {
    id: l.id, name: l.name, orderindex: l.orderindex, content: l.content ?? "", status: null, priority: null, assignee: null,
    task_count: jumlahTugas(m, l.id), due_date: null, start_date: null,
    folder: l.folder ? (({ id, name, hidden }) => ({ id, name, hidden: !!hidden, access: true }))(m.folders.get(l.folder))
      : { id: l.folder_hidden_id, name: "hidden", hidden: true, access: true },
    space: { id: s.id, name: s.name, access: true },
    archived: !!l.archived, override_statuses: true, permission_level: "create",
  };
  if (statuses) o.statuses = l.statuses.map((x) => ({ id: x.id, status: x.status, orderindex: x.orderindex, color: x.color, type: x.type }));
  return o;
}
function jFolder(m, f) {
  const s = m.spaces.get(f.space);
  const lists = [...m.lists.values()].filter((l) => l.folder === f.id && !l.archived).sort((a, b) => a.orderindex - b.orderindex);
  return {
    id: f.id, name: f.name, orderindex: f.orderindex, override_statuses: false, hidden: !!f.hidden,
    space: { id: s.id, name: s.name }, task_count: String(lists.reduce((n, l) => n + jumlahTugas(m, l.id), 0)),
    archived: !!f.archived, statuses: [], lists: lists.map((l) => jList(m, l)), permission_level: "create",
  };
}
function jSpace(m, s) {
  return {
    id: s.id, name: s.name, color: s.color ?? null, private: !!s.private, avatar: null, admin_can_manage: false,
    statuses: [], multiple_assignees: true,
    features: { due_dates: { enabled: true, start_date: true, remap_due_dates: false, remap_closed_due_date: false },
      time_tracking: { enabled: false }, tags: { enabled: true }, time_estimates: { enabled: false }, checklists: { enabled: true },
      custom_fields: { enabled: true }, remap_dependencies: { enabled: false }, dependency_warning: { enabled: false }, portfolios: { enabled: false } },
    archived: !!s.archived,
  };
}

// ---------------------------------------------------------------- server
function kirim(res, status, data, headers = {}) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body);
}
const b = (q, k) => q.get(k) === "true";

export async function mulaiMock(opsi = {}) {
  const {
    port = 0, varian = "awal", run = "0000", token = TOKEN_TIRUAN, dir = FIXTURE_DIR,
    tis = false, tolak429Setiap = 0, log = false,
  } = opsi;
  let m = muatModel({ varian, run, dir });
  const stat = { total: 0, perJalur: {}, nonGet: [], r429: 0, unduh: 0, tanpaAuth: 0, komentarLanjut: 0 };
  const hidup = { tis, tolak429Setiap }; // bisa diubah saat jalan lewat setel()

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const q = url.searchParams;
    stat.total++;
    if (log) console.error(`[mock] ${req.method} ${req.url}`);
    if (req.method !== "GET") {
      stat.nonGet.push(`${req.method} ${req.url}`);
      return kirim(res, 405, { err: "Server ClickUp tiruan hanya menerima GET", ECODE: "MOCK_405" });
    }
    // berkas lampiran (URL CDN; tanpa auth)
    let g = p.match(/^\/files\/([^/]+)\/(small_|large_)?[^/]+$/);
    if (g) {
      stat.unduh++;
      const a = m.lampiran.get(decodeURIComponent(g[1]));
      const buf = a && a.berkas ? m.berkas.get(a.berkas) : null;
      if (!buf) return kirim(res, 404, "Not Found", { "content-type": "text/plain" });
      res.writeHead(200, { "content-type": a.mimetype || "application/octet-stream", "content-length": String(buf.length) });
      return res.end(buf);
    }
    if (!p.startsWith("/api/v2/")) return kirim(res, 404, { err: "Route not found", ECODE: "APP_001" });
    if (req.headers.authorization !== token) {
      stat.tanpaAuth++;
      return kirim(res, 401, { err: "Token invalid", ECODE: "OAUTH_025" });
    }
    if (hidup.tolak429Setiap > 0 && stat.total % hidup.tolak429Setiap === 0) {
      stat.r429++;
      return kirim(res, 429, { err: "Rate limit reached", ECODE: "APP_002" }, {
        "x-ratelimit-limit": "100", "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1),
      });
    }
    const jalur = p.slice("/api/v2".length);
    const kunci = jalur.replace(/\/(?=[0-9a-z]*\d)[0-9a-z]{6,}(?=\/|$)/gi, "/:id");
    if (q.get("start_id")) stat.komentarLanjut++;
    stat.perJalur[kunci] = (stat.perJalur[kunci] || 0) + 1;
    try {
      const hasil = rute(m, jalur, q, { tis: hidup.tis });
      if (hasil === null) return kirim(res, 404, { err: "Route not found", ECODE: "APP_001" });
      if (hasil instanceof Galat) return kirim(res, hasil.status, hasil.body);
      return kirim(res, 200, hasil);
    } catch (e) {
      return kirim(res, 500, { err: String(e.message), ECODE: "MOCK_500" });
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const nyata = server.address().port;
  m.host = `http://127.0.0.1:${nyata}`;
  return {
    base: `${m.host}/api/v2`, port: nyata, token, stat,
    get model() { return m; },
    // ganti varian/run fixture tanpa mengganti port (URL lampiran tetap sama → idempotensi teruji apa adanya)
    ganti(o = {}) { m = muatModel({ varian: o.varian ?? m.varian, run: o.run ?? run, dir }); m.host = `http://127.0.0.1:${nyata}`; },
    setel(o = {}) { Object.assign(hidup, o); },
    reset() { Object.assign(stat, { total: 0, perJalur: {}, nonGet: [], r429: 0, unduh: 0, tanpaAuth: 0, komentarLanjut: 0 }); },
    tutup: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

class Galat {
  constructor(status, body) { this.status = status; this.body = body; }
}

function rute(m, jalur, q, { tis }) {
  let g;
  if (jalur === "/user") {
    const u = m.users.get(m.pemilik);
    return { user: { id: u.id, username: u.username, email: u.email, color: u.color, profilePicture: u.profilePicture ?? null,
      initials: u.initials, week_start_day: 0, global_font_support: false, timezone: "Asia/Jakarta" } };
  }
  if (jalur === "/team") {
    const members = [...m.users.values()].filter((u) => u.tim).map((u) => ({
      user: { id: u.id, username: u.username, email: u.email_di_tim === false ? null : u.email, color: u.color,
        profilePicture: u.profilePicture ?? null, initials: u.initials, role: u.role, custom_role: null,
        last_active: msDari(m.sekarang), date_joined: "1767225600000", date_invited: "1767225600000" },
    }));
    return { teams: [{ id: m.team.id, name: m.team.name, color: m.team.color, avatar: null, members }] };
  }
  if ((g = jalur.match(/^\/team\/([^/]+)\/space$/))) {
    if (g[1] !== m.team.id) return new Galat(401, { err: "Team not authorized", ECODE: "OAUTH_027" });
    return { spaces: [...m.spaces.values()].filter((s) => !!s.archived === b(q, "archived")).map((s) => jSpace(m, s)) };
  }
  if ((g = jalur.match(/^\/space\/([^/]+)\/folder$/))) {
    if (!m.spaces.has(g[1])) return new Galat(404, { err: "Project not found", ECODE: "PROJ_002" });
    return { folders: [...m.folders.values()].filter((f) => f.space === g[1] && !!f.archived === b(q, "archived"))
      .sort((a, c) => a.orderindex - c.orderindex).map((f) => jFolder(m, f)) };
  }
  if ((g = jalur.match(/^\/space\/([^/]+)\/list$/))) {
    if (!m.spaces.has(g[1])) return new Galat(404, { err: "Project not found", ECODE: "PROJ_002" });
    return { lists: [...m.lists.values()].filter((l) => l.space === g[1] && l.folder === null && !!l.archived === b(q, "archived"))
      .sort((a, c) => a.orderindex - c.orderindex).map((l) => jList(m, l)) };
  }
  if ((g = jalur.match(/^\/folder\/([^/]+)\/list$/))) {
    if (!m.folders.has(g[1])) return new Galat(404, { err: "Category not found", ECODE: "CAT_001" });
    return { lists: [...m.lists.values()].filter((l) => l.folder === g[1] && !!l.archived === b(q, "archived"))
      .sort((a, c) => a.orderindex - c.orderindex).map((l) => jList(m, l)) };
  }
  if ((g = jalur.match(/^\/list\/([^/]+)$/))) {
    const l = m.lists.get(g[1]);
    return l ? jList(m, l, { statuses: true }) : new Galat(404, { err: "List not found", ECODE: "SUBCAT_016" });
  }
  if ((g = jalur.match(/^\/list\/([^/]+)\/member$/))) {
    if (!m.lists.has(g[1])) return new Galat(404, { err: "List not found", ECODE: "SUBCAT_016" });
    return { members: [...m.users.values()].filter((u) => u.tim).map((u) => ({ ...jUserMember(u), profileInfo: {} })) };
  }
  if ((g = jalur.match(/^\/list\/([^/]+)\/field$/))) {
    return m.lists.has(g[1]) ? { fields: [] } : new Galat(404, { err: "List not found", ECODE: "SUBCAT_016" });
  }
  if ((g = jalur.match(/^\/list\/([^/]+)\/task$/))) {
    if (!m.lists.has(g[1])) return new Galat(404, { err: "List not found", ECODE: "SUBCAT_016" });
    const page = Number(q.get("page") || 0);
    const arsip = b(q, "archived"), tutup = b(q, "include_closed"), sub = b(q, "subtasks");
    const gt = q.get("date_updated_gt") ? Number(q.get("date_updated_gt")) : null;
    const semua = [...m.tasks.values()].filter((t) => {
      if (t.list !== g[1] || !!t.archived !== arsip) return false;
      const st = m.lists.get(t.list).statuses.find((s) => s.status === t.status);
      if (!tutup && (st.type === "closed" || st.type === "done")) return false; // ASUMSI (probe): done ikut disaring
      if (!sub && t.parent) return false;
      if (gt !== null && Number(msDari(t.updated ?? t.created)) <= gt) return false;
      return true;
    }).sort((a, c) => Date.parse(c.created) - Date.parse(a.created) || (a.id < c.id ? -1 : a.id > c.id ? 1 : 0)); // ASUMSI (A2): created desc, id
    const isi = semua.slice(page * 100, page * 100 + 100);
    return { tasks: isi.map((t) => jTask(m, t, { md: b(q, "include_markdown_description") })), last_page: (page + 1) * 100 >= semua.length };
  }
  if (jalur === "/task/bulk_time_in_status/task_ids") {
    const ids = q.getAll("task_ids");
    if (!tis) return new Galat(400, { err: "Time in Status ClickApp tidak aktif di workspace ini (tiruan)", ECODE: "TIS_TIRUAN" });
    if (ids.length > 100) return new Galat(400, { err: "Maks 100 task_ids", ECODE: "TIS_TIRUAN" });
    const out = {};
    for (const id of ids) {
      const t = m.tasks.get(id);
      if (!t) continue;
      const st = m.lists.get(t.list).statuses.find((s) => s.status === t.status);
      out[id] = { current_status: { status: st.status, color: st.color, total_time: { by_minute: 60, since: msDari(t.updated ?? t.created) } },
        status_history: [{ status: st.status, color: st.color, type: st.type, total_time: { by_minute: 60, since: msDari(t.created) }, orderindex: st.orderindex }] };
    }
    return out;
  }
  if ((g = jalur.match(/^\/task\/([^/]+)$/))) {
    const t = m.tasks.get(g[1]);
    if (!t) return new Galat(404, { err: "Task not found, deleted", ECODE: "ITEM_013" });
    return jTask(m, t, { md: b(q, "include_markdown_description"), lampiran: true });
  }
  if ((g = jalur.match(/^\/task\/([^/]+)\/comment$/))) {
    if (!m.tasks.has(g[1])) return new Galat(404, { err: "Task not found, deleted", ECODE: "ITEM_013" });
    // 25 komentar top-level terbaru; start+start_id = halaman berikut (lebih lama dari penanda).
    const top = [...m.comments.values()].filter((c) => c.task === g[1] && !c.reply_to)
      .sort((a, c) => Date.parse(c.date) - Date.parse(a.date) || (a.id < c.id ? 1 : -1));
    let mulai = 0;
    if (q.get("start_id")) {
      const i = top.findIndex((c) => c.id === q.get("start_id"));
      mulai = i >= 0 ? i + 1 : top.findIndex((c) => Number(msDari(c.date)) < Number(q.get("start")));
      if (mulai < 0) mulai = top.length;
    }
    return { comments: top.slice(mulai, mulai + 25).map((c) => jKomentar(m, c)) };
  }
  if ((g = jalur.match(/^\/comment\/([^/]+)\/reply$/))) {
    if (!m.comments.has(g[1])) return new Galat(404, { err: "Comment not found", ECODE: "COMM_005" });
    // ASUMSI (A2 / probe a): balasan terlama dulu.
    return { comments: [...m.comments.values()].filter((c) => c.reply_to === g[1])
      .sort((a, c) => Date.parse(a.date) - Date.parse(c.date) || (a.id < c.id ? -1 : 1)).map((c) => jKomentar(m, c, { balasan: true })) };
  }
  return null;
}

export { MIME_EKST };

// ---------------------------------------------------------------- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const ambil = (k, d) => { const i = a.indexOf(k); return i >= 0 && a[i + 1] !== undefined ? a[i + 1] : d; };
  const m = await mulaiMock({
    port: Number(ambil("--port", 0)), varian: ambil("--varian", "awal"), run: ambil("--run", "0000"),
    tis: a.includes("--tis"), tolak429Setiap: Number(ambil("--429", 0)), log: a.includes("--log"),
  });
  console.log(JSON.stringify({ base: m.base, port: m.port, token: m.token }));
  const henti = async () => { await m.tutup(); process.exit(0); };
  process.on("SIGINT", henti);
  process.on("SIGTERM", henti);
}
