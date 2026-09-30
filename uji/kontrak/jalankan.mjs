#!/usr/bin/env node
// Uji kontrak Edge API + CLI mode tugas terhadap stack Supabase LOKAL (`supabase functions serve` wajib jalan).
//   node uji/kontrak/jalankan.mjs            (UJI_VERBOSE=1 untuk mencetak semua cek)
// Exit 0 = semua lulus; 1 = ada cek gagal; 2 = prasyarat (Edge/kunci) tidak ada.
//
// Data uji SINTETIS milik sendiri, berawalan "uji-b1": space/folder/list "uji-b1 …" (dibuat sekali lalu dipakai
// ulang), token "uji-b1 … <run>" (dicabut di akhir), tugas uji (dihapus + purge di akhir), anggota "uji-b1 akun"
// (dinonaktifkan di akhir, akun Auth dihapus), kartu ClickUp sementara "uji-b1-cu-<run>" di list seed asal ClickUp
// (dibuat lewat /x/impor/batch untuk alur salinan lampiran importer, lalu dihapus lewat psql dengan sumber sinkron;
// activity-nya tertinggal karena append-only). Data seed tidak diubah (hanya dibaca). DB tidak di-reset.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http_ from "node:http";
import os from "node:os";
import path from "node:path";
import {
  CLI, apiEdge, bagian, cek, geserHari, hasil, http, jalankan, konfigurasi, kunci, kunciSama, login, pilihWeb, rpcWeb,
  sama, sleep, svcHeaders, toMs, tugas, wibDate,
} from "./_lib.mjs";
import { bandingPerilaku, bandingStatis } from "./banding.mjs";

const cfg = konfigurasi();
const RUN = Date.now().toString(36).slice(-6);
const WS = "1100340000004525";
const ID = { budi: 100000001, citra: 100000002, dodi: 100000003, eka: 900000000001, bot: 900000000002 };
const U = { citra: "citra lestari", dodi: "dodi pratama", eka: "eka wulandari" };
const EMAIL = { budi: "budi.uji@contoh.test", citra: "citra.uji@contoh.test" };
const NAMA = {
  space: "uji-b1 Ruang Kontrak", folder: "uji-b1 Folder Kontrak",
  A: "uji-b1 List A", B: "uji-b1 List B", C: "uji-b1 List Lepas", akun: "uji-b1 akun",
};
const HARI_INI = wibDate(Date.now());
const KEMARIN = geserHari(HARI_INI, -1);
const BESOK = geserHari(HARI_INI, 1);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64",
);

const BRIEF = ["id", "name", "status", "assignees", "due", "updated", "list", "url"];
const TASK40 = [
  "id", "custom_id", "custom_item_id", "name", "text_content", "description", "status", "orderindex", "date_created",
  "date_updated", "date_closed", "date_done", "archived", "creator", "assignees", "group_assignees", "watchers",
  "checklists", "tags", "parent", "top_level_parent", "priority", "due_date", "due_date_time", "start_date",
  "start_date_time", "points", "time_estimate", "custom_fields", "dependencies", "linked_tasks", "locations", "team_id",
  "url", "sharing", "permission_level", "list", "project", "folder", "space",
];
const ATT_KEYS = [
  "id", "date", "title", "type", "source", "version", "extension", "thumbnail_small", "thumbnail_large", "is_folder",
  "mimetype", "hidden", "parent_id", "size", "total_comments", "resolved_comments", "user", "deleted", "orientation", "url",
];

const DB_URL = process.env.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LIST_CU = "1100340000900101"; // list seed asal ClickUp ("Fase Uji 1"), wadah kartu ClickUp sementara

const st = { tok: {}, tokId: {}, dicabut: new Set(), T: {}, L: {}, jwt: {}, storage: new Set(), akun: null, cu: null };
// psql superuser DB lokal (pembersihan & keadaan yang tak bisa dibuat lewat fungsi). r.error → psql tidak ada.
const psql = (sql) => spawnSync("psql", [DB_URL, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
// Unggah lampiran seperti aplikasi web: Storage API dengan sesi anggota (RLS bucket 'lampiran').
const unggahSesi = (jwt, p, buf, mime) => http("POST", `${cfg.url}/storage/v1/object/lampiran/${p}`, {
  headers: { apikey: cfg.anon, Authorization: `Bearer ${jwt}`, "content-type": mime }, body: buf, raw: true,
});
const galatCli = (r) => `${r.stderr}`.trim();
const urut = (a) => [...a].sort();

// ---------------------------------------------------------------- persiapan
async function cariAtauBuat(tabel, filter, p) {
  const ada = await pilihWeb(cfg, st.jwt.budi, tabel, `select=id,archived&${filter}`);
  if (ada[0]) {
    if (ada[0].archived) await rpcWeb(cfg, st.jwt.budi, "web_admin_struktur_simpan", { p: { jenis: p.jenis, id: ada[0].id, archived: false } });
    return ada[0].id;
  }
  return (await rpcWeb(cfg, st.jwt.budi, "web_admin_struktur_simpan", { p })).id;
}

async function buatToken(label, member, scope) {
  const r = await rpcWeb(cfg, st.jwt.budi, "web_admin_token_buat", { p_member: member, p_nama: `uji-b1 ${label} ${RUN}`, p_scope: scope });
  st.tok[label] = r.token;
  st.tokId[label] = r.id;
  return r;
}

async function buangTugasList() {
  const ids = Object.values(st.L).filter(Boolean);
  if (!ids.length) return { purged: 0 };
  const rows = await pilihWeb(cfg, st.jwt.budi, "tasks", `select=id,deleted_at,parent_id&list_id=in.(${ids.join(",")})`);
  for (const t of rows) {
    if (!t.deleted_at) {
      try { await rpcWeb(cfg, st.jwt.budi, "web_hapus", { p_task: t.id }); } catch { /* sub-tugas ikut induk */ }
    }
  }
  let purged = 0;
  for (const t of rows) {
    try {
      const r = await rpcWeb(cfg, st.jwt.budi, "web_purge", { p_task: t.id });
      purged += (r.purged || []).length;
      for (const p of r.storage_paths || []) st.storage.add(p);
    } catch { /* sudah ter-purge bersama induk */ }
  }
  return { purged, total: rows.length };
}

// Kartu ClickUp sementara tidak bisa dihapus lewat fungsi saat mode cermin (web_purge ditolak CERMIN_001), jadi
// dihapus lewat psql dengan sumber 'sinkron' (lampiran ikut cascade). Tanpa psql → cadangan: tandai hilang (soft).
async function hapusKartuCu() {
  if (!st.cu) return;
  const id = st.cu;
  const r = psql(`begin; select set_config('app.sumber', 'sinkron', true); delete from public.tasks where id = '${id}' and sumber = 'clickup' and name like 'uji-b1 %'; commit;`);
  if (r.error) {
    const x = await apiEdge(cfg, st.tok.impor)("POST", "/x/impor/hilang", { body: { jenis: "tasks", ids_ada: [], lingkup: { task_ids: [id] } } });
    console.log(`  LEWATI hapus permanen kartu ClickUp sementara ${id}: psql tidak ada (${r.error.code}); ditandai hilang: HTTP ${x.status}`);
    st.cu = null;
    return;
  }
  cek(`kartu ClickUp sementara ${id} dihapus (psql, sumber sinkron)`, r.status === 0, r.stderr);
  const sisa = psql(`select count(*) from public.tasks where id = '${id}'`);
  sama("kartu ClickUp sementara tidak tersisa", sisa.stdout.trim(), "0");
  st.cu = null;
}

async function hapusStorage() {
  const paths = [...st.storage];
  if (!paths.length) return;
  const r = await http("DELETE", `${cfg.url}/storage/v1/object/lampiran`, { headers: svcHeaders(cfg), body: { prefixes: paths } });
  cek(`objek Storage uji dihapus (${paths.length})`, r.status === 200, r.text);
}

async function siapkan() {
  bagian("persiapan (struktur, token)");
  st.jwt.budi = await login(cfg, EMAIL.budi);
  st.jwt.citra = await login(cfg, EMAIL.citra);
  st.S = await cariAtauBuat("spaces", `name=eq.${encodeURIComponent(NAMA.space)}`, { jenis: "space", name: NAMA.space });
  st.F = await cariAtauBuat("folders", `space_id=eq.${st.S}&name=eq.${encodeURIComponent(NAMA.folder)}`,
    { jenis: "folder", name: NAMA.folder, space_id: st.S });
  st.L.A = await cariAtauBuat("lists", `folder_id=eq.${st.F}&name=eq.${encodeURIComponent(NAMA.A)}`,
    { jenis: "list", name: NAMA.A, space_id: st.S, folder_id: st.F });
  st.L.B = await cariAtauBuat("lists", `folder_id=eq.${st.F}&name=eq.${encodeURIComponent(NAMA.B)}`,
    { jenis: "list", name: NAMA.B, space_id: st.S, folder_id: st.F });
  st.L.C = await cariAtauBuat("lists", `space_id=eq.${st.S}&folder_id=is.null&name=eq.${encodeURIComponent(NAMA.C)}`,
    { jenis: "list", name: NAMA.C, space_id: st.S });
  const sisa = await buangTugasList();
  cek("struktur uji siap (space/folder/3 list app)", /^rs/.test(st.S) && /^rf/.test(st.F) && Object.values(st.L).every((x) => /^rl/.test(x)));
  cek(`sisa tugas run lama dibersihkan (${sisa.purged ?? 0})`, true);
  await buatToken("baca", ID.bot, "baca");
  await buatToken("tulis", ID.bot, "tulis");
  await buatToken("owner", ID.budi, "tulis");
  await buatToken("member", ID.citra, "tulis");
  await buatToken("impor", ID.bot, "impor");
  await buatToken("cabut", ID.bot, "baca");
  await buatToken("burst", ID.bot, "baca");
  cek("7 token uji dibuat via web_admin_token_buat (rtk_ + 40)", Object.values(st.tok).every((t) => /^rtk_[0-9A-Za-z]{40}$/.test(t)));
  console.log(`  run=${RUN} space=${st.S} folder=${st.F} list=${JSON.stringify(st.L)}`);
}

async function bersihkan() {
  bagian("bersih-bersih");
  try {
    const r = await buangTugasList();
    cek(`tugas uji dihapus + purge (${r.purged}/${r.total})`, r.purged >= r.total);
  } catch (e) { cek("purge tugas uji", false, e.message); }
  try { await hapusKartuCu(); } catch (e) { cek("hapus kartu ClickUp sementara", false, e.message); }
  try { await hapusStorage(); } catch (e) { cek("hapus storage", false, e.message); }
  try { await bersihAkun(); } catch (e) { cek("bersih akun uji", false, e.message); }
  for (const [label, id] of Object.entries(st.tokId)) {
    if (st.dicabut.has(label)) continue;
    try { await rpcWeb(cfg, st.jwt.budi, "web_admin_token_cabut", { p_id: id }); st.dicabut.add(label); } catch (e) { cek(`cabut token ${label}`, false, e.message); }
  }
  cek("semua token uji dicabut", Object.keys(st.tokId).every((l) => st.dicabut.has(l)));
  // Baris token uji (sudah dicabut) dihapus supaya tidak menumpuk 7 baris/run di DB bersama (tak ada fungsi
  // hapus token; activity.token_id tidak ber-FK). Hanya milik run ini. Butuh psql; tanpa psql → dilewati.
  const ids = Object.entries(st.tokId).filter(([l]) => st.dicabut.has(l)).map(([, id]) => id);
  if (ids.length) {
    const r = psql(`delete from public.api_tokens where revoked_at is not null and nama like 'uji-b1 %' and id in (${ids.map((i) => `'${i}'`).join(",")})`);
    if (r.error) console.log(`  LEWATI hapus baris token uji: psql tidak ada (${r.error.code})`);
    else cek(`baris token uji run ini dihapus (${ids.length})`, r.status === 0, r.stderr);
  }
  try {
    await rpcWeb(cfg, st.jwt.budi, "web_admin_struktur_simpan", { p: { jenis: "space", id: st.S, archived: true } });
    cek("space uji diarsip (dipakai ulang run berikut)", true);
  } catch (e) { cek("arsip space uji", false, e.message); }
}

// ---------------------------------------------------------------- bagian uji
async function ujiModeDanPesan() {
  bagian("CLI: pemilihan mode, env, pesan");
  let r = await jalankan(CLI, [], {});
  sama("tanpa perintah → usage tools/tugas.mjs", [r.code, galatCli(r)], [1, "usage: lihat header tools/tugas.mjs"]);
  r = await jalankan(CLI, ["whoami"], { TUGAS_API_URL: cfg.api });
  sama("token kosong → pesan tugas:", [r.code, galatCli(r)], [1, "tugas: TUGAS_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"]);
  r = await jalankan(CLI, ["whoami"], { TUGAS_API_URL: cfg.api.replace(/\/v2$/, ""), TUGAS_API_TOKEN: st.tok.baca });
  cek("TUGAS_API_URL tanpa /v2 ditolak", r.code === 1 && /TUGAS_API_URL kosong\/tidak sah/.test(r.stderr), r.stderr);
  r = await jalankan(CLI, ["whoami"], { TUGAS_BACKEND: "clickup" });
  sama("TUGAS_BACKEND=clickup → pesan clickup asli", [r.code, galatCli(r)], [1, "clickup: CLICKUP_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"]);
  r = await jalankan(CLI, ["whoami"], { TUGAS_BACKEND: "salah" });
  cek("TUGAS_BACKEND tak dikenal ditolak", r.code === 1 && /TUGAS_BACKEND harus/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.baca, ["xyz"]);
  sama("perintah tak dikenal", [r.code, galatCli(r)], [1, 'tugas: perintah tak dikenal "xyz"']);
  r = await tugas(cfg, st.tok.baca, ["audit-free"]);
  cek("audit-free tidak berlaku di mode tugas", r.code === 1 && /audit-free tidak berlaku di aplikasi Tugas/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.baca, ["activity"]);
  sama("activity tanpa id", galatCli(r), "tugas: GAGAL -> activity: <task_id> wajib");

  // fallback file .env di folder skrip (di rhj-brain: tools/.env)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uji-b1-env-"));
  try {
    fs.copyFileSync(CLI, path.join(tmp, "tugas.mjs"));
    fs.writeFileSync(path.join(tmp, ".env"), `# uji\nTUGAS_API_URL=${cfg.api}\nTUGAS_API_TOKEN=${st.tok.baca}\n`);
    r = await jalankan(path.join(tmp, "tugas.mjs"), ["whoami"], {}, { cwd: tmp });
    cek("fallback .env di folder skrip terbaca", r.code === 0 && r.json?.user?.id === ID.bot, r.stderr);
    fs.copyFileSync(CLI, path.join(tmp, "clickup.mjs"));
    r = await jalankan(path.join(tmp, "clickup.mjs"), ["whoami"], {}, { cwd: tmp });
    sama("nama file clickup.mjs → mode clickup (butuh CLICKUP_API_TOKEN)", galatCli(r),
      "clickup: CLICKUP_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)");

    // Review: TUGAS_BACKEND juga dibaca dari .env (desktop: tools/.env). Sebelumnya shim clickup.mjs diam-diam
    // tetap memakai ClickUp. Sengaja TANPA CLICKUP_API_TOKEN supaya regresi gagal tanpa request ke ClickUp.
    const shim = path.join(tmp, "clickup.mjs");
    fs.writeFileSync(path.join(tmp, ".env"), `TUGAS_BACKEND=tugas\nTUGAS_API_URL=${cfg.api}\nTUGAS_API_TOKEN=${st.tok.baca}\n`);
    r = await jalankan(shim, ["whoami"], {}, { cwd: tmp });
    cek("clickup.mjs + .env TUGAS_BACKEND=tugas → mode tugas (whoami = bot)", r.code === 0 && r.json?.user?.id === ID.bot, r.stderr);
    r = await jalankan(shim, ["backend"], {}, { cwd: tmp });
    sama("backend: mode dari .env", [r.code, r.json], [0, { backend: "tugas", dipilih_dari: ".env TUGAS_BACKEND", api: cfg.api, token: "ada" }]);
    sama("backend: urutan kunci", Object.keys(r.json || {}), ["backend", "dipilih_dari", "api", "token"]);
    r = await jalankan(shim, ["whoami"], { TUGAS_BACKEND: "clickup" }, { cwd: tmp });
    sama("env proses TUGAS_BACKEND=clickup menang atas .env", [r.code, galatCli(r)],
      [1, "clickup: CLICKUP_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)"]);
    r = await jalankan(shim, ["backend"], { TUGAS_BACKEND: "clickup" }, { cwd: tmp });
    sama("backend: env proses menang", [r.code, r.json],
      [0, { backend: "clickup", dipilih_dari: "env TUGAS_BACKEND", api: "https://api.clickup.com/api/v2", token: "kosong" }]);
    fs.writeFileSync(path.join(tmp, ".env"), 'TUGAS_BACKEND="tugas"\n');
    r = await jalankan(shim, ["whoami"], {}, { cwd: tmp });
    cek(".env TUGAS_BACKEND berkutip → ditolak (tidak jatuh diam-diam ke ClickUp)", r.code === 1 && /TUGAS_BACKEND harus/.test(r.stderr), r.stderr);
    r = await jalankan(CLI, ["backend"], {});
    sama("backend tanpa konfigurasi: dari nama file, tanpa request", [r.code, r.json],
      [0, { backend: "tugas", dipilih_dari: "nama file", api: null, token: "kosong" }]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function ujiWhoami() {
  bagian("CLI baca: whoami, fields");
  let r = await tugas(cfg, st.tok.baca, ["whoami"]);
  cek("whoami exit 0", r.code === 0, r.stderr);
  kunciSama("whoami: kunci atas", r.json, ["user", "workspaces"]);
  kunciSama("whoami: kunci user", r.json?.user, ["id", "username", "email"]);
  kunciSama("whoami: kunci workspace", r.json?.workspaces?.[0], ["id", "name", "members"]);
  sama("whoami: user = bot claude (agent)", [r.json?.user?.id, r.json?.user?.username], [ID.bot, "claude (agent)"]);
  sama("whoami: workspace id", r.json?.workspaces?.map((w) => w.id), [WS]);
  cek("whoami: members angka (bot tidak dihitung)", Number.isInteger(r.json?.workspaces?.[0]?.members) && r.json.workspaces[0].members >= 4);
  r = await tugas(cfg, st.tok.owner, ["whoami"]);
  sama("whoami token owner → budi", r.json?.user?.id, ID.budi);
  r = await tugas(cfg, st.tok.baca, ["fields", st.L.A]);
  sama("fields <list> → []", [r.code, r.json], [0, []]);
  r = await tugas(cfg, st.tok.baca, ["fields", "rl-tidak-ada"]);
  cek("fields list tak ada → 404", r.code === 1 && r.stderr.includes("-> HTTP 404: List tidak ditemukan"), r.stderr);
}

async function buat(label, args, token = st.tok.tulis) {
  const r = await tugas(cfg, token, ["create", ...args]);
  if (r.code === 0 && r.json?.id) st.T[label] = r.json.id;
  return r;
}

async function ujiCreate() {
  bagian("CLI tulis: create (semua flag)");
  let r = await buat("T1", [st.L.A, "--name", `uji-b1 T1 kampanye ${RUN}`, "--desc", "Deskripsi **uji** T1", "--assignee",
    `${ID.citra},${ID.dodi}`, "--due", HARI_INI, "--priority", "2", "--status", "in progress"]);
  cek("create T1 exit 0", r.code === 0, r.stderr);
  sama("create: output = brief (kunci & urutan)", Object.keys(r.json || {}), BRIEF);
  cek("create: id app rt + 8 base36", /^rt[0-9a-z]{8}$/.test(r.json?.id || ""), r.json?.id);
  sama("create: nilai brief", [r.json?.name, r.json?.status, urut(r.json?.assignees || []), r.json?.due, r.json?.list],
    [`uji-b1 T1 kampanye ${RUN}`, "in progress", [U.citra, U.dodi], HARI_INI, NAMA.A]);
  cek("create: url /t/<id>", String(r.json?.url).endsWith(`/t/${r.json?.id}`), r.json?.url);
  cek("create: updated ISO", /^\d{4}-\d\d-\d\dT.*Z$/.test(r.json?.updated || ""));

  r = await tugas(cfg, st.tok.baca, ["task", st.T.T1]);
  cek("task T1 exit 0", r.code === 0, r.stderr);
  sama("task: 40 kunci + markdown_description + attachments", kunci(r.json), urut([...TASK40, "markdown_description", "attachments"]));
  const t = r.json || {};
  sama("task: prioritas high", t.priority, { id: "2", priority: "high", color: "#ffcc00", orderindex: "2" });
  sama("task: due ms 12:00 WIB, tanpa jam", [t.due_date, t.due_date_time], [String(toMs(HARI_INI)), false]);
  sama("task: markdown_description", t.markdown_description, "Deskripsi **uji** T1");
  sama("task: status in progress/custom", [t.status?.status, t.status?.type], ["in progress", "custom"]);
  sama("task: creator = bot", t.creator?.id, ID.bot);
  cek("task: tanggal string ms", /^\d{13}$/.test(t.date_created || "") && /^\d{13}$/.test(t.date_updated || ""));
  sama("task: list/folder/space", [t.list?.id, t.folder?.id, t.space?.id, t.team_id], [st.L.A, st.F, st.S, WS]);
  kunciSama("task: kunci assignee", t.assignees?.[0], ["id", "username", "email", "color", "initials", "profilePicture"]);

  r = await buat("T2", [st.L.A, "--name", `uji-b1 T2 telat ${RUN}`, "--assignee", String(ID.citra), "--due", KEMARIN]);
  sama("create T2 (due kemarin)", [r.code, r.json?.due], [0, KEMARIN]);
  r = await buat("T3", [st.L.A, "--name", `uji-b1 T3 selesai ${RUN}`, "--status", "complete", "--assignee", String(ID.dodi)]);
  sama("create T3 status complete", [r.code, r.json?.status], [0, "complete"]);
  r = await buat("T4", [st.L.A, "--name", `uji-b1 T4 untuk dihapus ${RUN}`]);
  sama("create T4 tanpa due/assignee", [r.code, r.json?.due, r.json?.assignees, r.json?.status], [0, null, [], "to do"]);
  r = await buat("T5", [st.L.A, "--name", `uji-b1 T5 pindah ${RUN}`, "--status", "In Progress"]);
  sama("create T5 (status beda huruf besar dinormalkan)", [r.code, r.json?.status], [0, "in progress"]);
  r = await buat("T8", [st.L.A, "--name", `uji-b1 T8 hari ini ${RUN}`, "--assignee", String(ID.dodi), "--due", HARI_INI]);
  sama("create T8 (due hari ini)", [r.code, r.json?.due], [0, HARI_INI]);
  r = await buat("T6", [st.L.C, "--name", `uji-b1 T6 list lepas ${RUN}`, "--priority", "4"]);
  sama("create T6 di list tanpa folder", [r.code, r.json?.list], [0, NAMA.C]);
  r = await tugas(cfg, st.tok.baca, ["task", st.T.T6]);
  sama("task T6: folder/project semu <list>-hidden", [r.json?.folder, r.json?.project],
    [{ id: `${st.L.C}-hidden`, name: "hidden", hidden: true, access: true }, { id: `${st.L.C}-hidden`, name: "hidden", hidden: true, access: true }]);

  r = await tugas(cfg, st.tok.tulis, ["create", st.L.A]);
  sama("create tanpa --name → pesan asli", [r.code, galatCli(r)], [1, "tugas: GAGAL -> create: --name wajib"]);
  r = await tugas(cfg, st.tok.tulis, ["create", st.L.A, "--name", "uji-b1 x", "--status", "status-ngawur"]);
  cek("create status tak dikenal → 400", r.code === 1 && /HTTP 400: Status "status-ngawur" tidak ada/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.tulis, ["create", st.L.A, "--name", "uji-b1 x", "--assignee", String(ID.bot)]);
  cek("create assignee bot → 400", r.code === 1 && /HTTP 400: Assignee tidak dikenal/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.tulis, ["create", "rl-tidak-ada", "--name", "uji-b1 x"]);
  cek("create di list tak ada → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);

  // idempotensi header x-rhj-idem (Edge → p_idem)
  const api = apiEdge(cfg, st.tok.tulis);
  const kunciIdem = `uji-b1-${RUN}`;
  const i1 = await api("POST", `/v2/list/${st.L.A}/task`, { headers: { "x-rhj-idem": kunciIdem }, body: { name: `uji-b1 T9 idem ${RUN}` } });
  const i2 = await api("POST", `/v2/list/${st.L.A}/task`, { headers: { "x-rhj-idem": kunciIdem }, body: { name: `uji-b1 T9 idem ${RUN}` } });
  if (i1.json?.id) st.T.T9 = i1.json.id;
  sama("create idempoten (x-rhj-idem sama → id sama)", [i1.status, i2.status, i2.json?.id], [200, 200, i1.json?.id]);
}

async function ujiUpdate() {
  bagian("CLI tulis: update (semua flag)");
  const T1 = st.T.T1;
  const nama = `uji-b1 T1 kampanye revisi ${RUN}`;
  const flag = ["--name", nama, "--desc", "Deskripsi baru T1", "--status", "to do", "--due", BESOK, "--priority", "3",
    "--add-assignee", String(ID.eka), "--rem-assignee", String(ID.dodi)];
  let r = await tugas(cfg, st.tok.tulis, ["update", T1, ...flag, "--dry-run"]);
  const harap = {
    dry_run: true, method: "PUT", task: T1,
    body: { name: nama, markdown_description: "Deskripsi baru T1", status: "to do", due_date: toMs(BESOK), due_date_time: false,
      priority: 3, assignees: { add: [ID.eka], rem: [ID.dodi] } },
  };
  sama("update --dry-run: stdout persis", r.stdout, JSON.stringify(harap, null, 2) + "\n");
  r = await tugas(cfg, st.tok.baca, ["task", T1]);
  sama("dry-run tidak mengubah data", r.json?.name, `uji-b1 T1 kampanye ${RUN}`);

  r = await tugas(cfg, st.tok.tulis, ["update", T1, ...flag]);
  cek("update exit 0", r.code === 0, r.stderr);
  sama("update: output brief", Object.keys(r.json || {}), BRIEF);
  sama("update: nilai", [r.json?.name, r.json?.status, r.json?.due, urut(r.json?.assignees || [])], [nama, "to do", BESOK, [U.citra, U.eka]]);
  r = await tugas(cfg, st.tok.baca, ["task", T1]);
  sama("update: prioritas normal + deskripsi", [r.json?.priority?.priority, r.json?.markdown_description], ["normal", "Deskripsi baru T1"]);
  sama("update: assignee id", urut((r.json?.assignees || []).map((a) => a.id)), urut([ID.citra, ID.eka]));

  r = await tugas(cfg, st.tok.tulis, ["update", T1, "--due", "none"]);
  sama("update --due none → due null (parkir)", [r.code, r.json?.due], [0, null]);
  r = await tugas(cfg, st.tok.baca, ["task", T1]);
  sama("task: due_date null", r.json?.due_date, null);

  r = await tugas(cfg, st.tok.tulis, ["update", T1]);
  sama("update tanpa field → pesan asli", [r.code, galatCli(r)], [1, "tugas: GAGAL -> update: tak ada field yang diubah"]);
  r = await tugas(cfg, st.tok.tulis, ["update", T1, "--status", "ngawur"]);
  cek("update status tak dikenal → 400", r.code === 1 && /HTTP 400: Status "ngawur" tidak ada/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.tulis, ["update", T1, "--add-assignee", "999"]);
  cek("update add-assignee tak dikenal → 400", r.code === 1 && r.stderr.includes("HTTP 400"), r.stderr);
  r = await tugas(cfg, st.tok.tulis, ["update", "z8r3uj0001", "--name", "uji-b1 tak boleh"]);
  cek("update kartu ClickUp saat mode cermin → 409", r.code === 1 && /HTTP 409: Mode cermin/.test(r.stderr), r.stderr);
  const d = await apiEdge(cfg, st.tok.tulis)("PUT", "/v2/task/z8r3uj0001", { body: { name: "uji-b1 tak boleh" } });
  sama("PUT kartu ClickUp: body {err, ECODE:CERMIN_001}", [d.status, d.json?.ECODE, kunci(d.json)], [409, "CERMIN_001", ["ECODE", "err"]]);
  r = await tugas(cfg, st.tok.tulis, ["update", "rt-tidak-ada", "--name", "x"]);
  cek("update tugas tak ada → 404", r.code === 1 && r.stderr.includes("-> HTTP 404: Tugas tidak ditemukan"), r.stderr);

  // buka ulang lalu tutup lagi (riwayat status + snapshot)
  r = await tugas(cfg, st.tok.tulis, ["update", st.T.T3, "--status", "in progress"]);
  sama("update T3 dibuka ulang", r.json?.status, "in progress");
  r = await tugas(cfg, st.tok.tulis, ["update", st.T.T3, "--status", "complete"]);
  sama("update T3 ditutup lagi", r.json?.status, "complete");
}

async function ujiComment() {
  bagian("CLI tulis: comment (--text/--file/--reply-to/--dry-run)");
  const T1 = st.T.T1;
  let r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--text", "Halo uji", "--dry-run"]);
  sama("comment --dry-run: stdout persis", r.stdout,
    JSON.stringify({ dry_run: true, method: "POST", task: T1, body: { comment_text: "Halo uji", notify_all: false } }, null, 2) + "\n");
  r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--text", `Halo @${U.citra}, cek uji-b1 ${RUN}`]);
  cek("comment --text exit 0", r.code === 0, r.stderr);
  kunciSama("comment: output {id, hist_id, date}", r.json, ["id", "hist_id", "date"]);
  cek("comment: id rc…, hist_id = id, date angka", /^rc/.test(r.json?.id || "") && r.json?.hist_id === r.json?.id && typeof r.json?.date === "number");
  const c1 = r.json?.id;
  await sleep(20);
  const f = path.join(os.tmpdir(), `uji-b1-komentar-${RUN}.txt`);
  fs.writeFileSync(f, "Baris satu dari file\nbaris dua — uji-b1\n");
  r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--file", f]);
  fs.rmSync(f, { force: true });
  cek("comment --file exit 0", r.code === 0 && /^rc/.test(r.json?.id || ""), r.stderr);
  const c2 = r.json?.id;

  r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--reply-to", c1, "--text", "balasan uji-b1", "--dry-run"]);
  sama("reply --dry-run", r.json, { dry_run: true, method: "POST", task: T1, reply_to: c1, body: { comment_text: "balasan uji-b1", notify_all: false } });
  r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--reply-to", c1, "--text", "balasan uji-b1"]);
  cek("reply exit 0 → {id, hist_id, date}", r.code === 0 && /^rc/.test(r.json?.id || ""), r.stderr);
  r = await tugas(cfg, st.tok.tulis, ["comment", T1, "--reply-to", "--text", "x"]);
  sama("reply tanpa id", galatCli(r), "tugas: GAGAL -> comment: --reply-to butuh nilai");
  r = await tugas(cfg, st.tok.tulis, ["comment", T1]);
  sama("comment tanpa teks → pesan asli", [r.code, galatCli(r)], [1, "tugas: GAGAL -> comment: --text atau --file wajib"]);
  r = await tugas(cfg, st.tok.tulis, ["comment", "z8r3uj0001", "--text", "uji-b1 tak boleh"]);
  cek("comment kartu ClickUp saat cermin → 409", r.code === 1 && r.stderr.includes("HTTP 409"), r.stderr);

  r = await tugas(cfg, st.tok.baca, ["comments", T1, "--replies"]);
  cek("comments --replies exit 0", r.code === 0, r.stderr);
  sama("comments: 2 top-level, terbaru dulu", (r.json || []).map((c) => c.id), [c2, c1]);
  sama("comments: kunci baris tanpa balasan", Object.keys(r.json?.[0] || {}), ["id", "user", "date", "text", "reply_count"]);
  sama("comments: kunci baris berbalasan", Object.keys(r.json?.[1] || {}), ["id", "user", "date", "text", "reply_count", "replies"]);
  sama("comments: balasan", r.json?.[1]?.replies?.map((x) => [Object.keys(x), x.user, x.text]),
    [[["user", "date", "text"], "claude (agent)", "balasan uji-b1"]]);
  sama("comments: teks file utuh", r.json?.[0]?.text, "Baris satu dari file\nbaris dua — uji-b1\n");
  r = await tugas(cfg, st.tok.baca, ["comments", T1]);
  cek("comments tanpa --replies: tanpa kunci replies", (r.json || []).every((c) => !("replies" in c)) && r.json?.[1]?.reply_count === 1);
  const n = await pilihWeb(cfg, st.jwt.citra, "notifications", `select=jenis&comment_id=eq.${c1}`);
  cek("mention @citra lestari → notifikasi mention untuk Citra", n.some((x) => x.jenis === "mention"), n);

  // paginasi start/start_id ala ClickUp
  const api = apiEdge(cfg, st.tok.baca);
  const all = await api("GET", `/v2/task/${T1}/comment`);
  const [baru, lama] = all.json?.comments || [];
  const p2 = await api("GET", `/v2/task/${T1}/comment?start=${baru?.date}&start_id=${baru?.id}`);
  sama("comment ?start&start_id → hanya yang lebih tua", (p2.json?.comments || []).map((c) => c.id), [lama?.id]);
  const p3 = await api("GET", `/v2/task/${T1}/comment?start=${lama?.date}&start_id=${lama?.id}`);
  sama("halaman berikut kosong", p3.json?.comments, []);
  st.c1 = c1;
}

async function ujiMove() {
  bagian("CLI tulis: move");
  const v3 = cfg.api.replace(/\/v2$/, "/v3");
  let r = await tugas(cfg, st.tok.tulis, ["move", st.T.T5, st.L.B, "--dry-run"]);
  sama("move --dry-run → URL v3", r.json, { dry_run: true, method: "PUT", url: `${v3}/workspaces/${WS}/tasks/${st.T.T5}/home_list/${st.L.B}` });
  r = await tugas(cfg, st.tok.tulis, ["move", st.T.T5, st.L.B]);
  sama("move → brief list B, status tetap", [r.code, Object.keys(r.json || {}), r.json?.list, r.json?.status], [0, BRIEF, NAMA.B, "in progress"]);
  r = await tugas(cfg, st.tok.tulis, ["move", st.T.T5]);
  sama("move tanpa list → pesan asli", galatCli(r), "tugas: GAGAL -> move: <task_id> <list_id> wajib");
  r = await tugas(cfg, st.tok.tulis, ["move", st.T.T5, "rl-tidak-ada"]);
  cek("move ke list tak ada → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);
  const x = await apiEdge(cfg, st.tok.tulis)("PUT", `/v3/workspaces/999/tasks/${st.T.T5}/home_list/${st.L.A}`);
  sama("v3 workspace salah → 404", [x.status, x.json?.ECODE], [404, "ITEM_013"]);
}

async function ujiDelete() {
  bagian("CLI tulis: delete (owner saja)");
  const T4 = st.T.T4;
  let r = await tugas(cfg, st.tok.owner, ["delete", T4]);
  sama("delete tanpa --yes → pesan asli", galatCli(r), "tugas: GAGAL -> delete: tambahkan --yes (hapus permanen, tak bisa dibatalkan)");
  r = await tugas(cfg, st.tok.tulis, ["delete", T4, "--yes"]);
  sama("delete token bot (tulis) → 403", [r.code, galatCli(r)], [1, `tugas: GAGAL -> DELETE /task/${T4} -> HTTP 403: Hanya owner yang boleh menghapus tugas`]);
  const d = await apiEdge(cfg, st.tok.tulis)("DELETE", `/v2/task/${T4}`);
  sama("DELETE bot: ECODE HAPUS_OWNER", [d.status, d.json?.ECODE], [403, "HAPUS_OWNER"]);
  r = await tugas(cfg, st.tok.member, ["delete", T4, "--yes"]);
  cek("delete token member → 403", r.code === 1 && r.stderr.includes("HTTP 403"), r.stderr);
  r = await tugas(cfg, st.tok.baca, ["delete", T4, "--yes"]);
  cek("delete token baca → 403 scope", r.code === 1 && /HTTP 403: Scope token "baca"/.test(r.stderr), r.stderr);
  r = await tugas(cfg, st.tok.owner, ["delete", T4, "--yes"]);
  sama("delete token owner → {deleted}", [r.code, r.json], [0, { deleted: T4 }]);
  r = await tugas(cfg, st.tok.baca, ["task", T4]);
  cek("tugas terhapus → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);
  r = await tugas(cfg, st.tok.owner, ["delete", T4, "--yes"]);
  cek("hapus ulang → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);
}

async function ujiBaca() {
  bagian("CLI baca: tasks, folder-tasks, task, comments (seed)");
  const { T1, T2, T3, T5, T6, T8, T9 } = st.T;
  let r = await tugas(cfg, st.tok.baca, ["tasks", st.L.A]);
  cek("tasks exit 0", r.code === 0, r.stderr);
  cek("tasks: semua baris brief", (r.json || []).every((x) => JSON.stringify(Object.keys(x)) === JSON.stringify(BRIEF)));
  sama("tasks A: tugas terbuka (tanpa selesai/terhapus/pindah)", urut((r.json || []).map((x) => x.id)), urut([T1, T2, T8, T9]));
  r = await tugas(cfg, st.tok.baca, ["tasks", st.L.A, "--closed"]);
  sama("tasks A --closed: + T3", urut((r.json || []).map((x) => x.id)), urut([T1, T2, T3, T8, T9]));
  const urutanBrief = (r.json || []).map((x) => x.id);
  r = await tugas(cfg, st.tok.baca, ["tasks", st.L.A, "--closed", "--full"]);
  cek("tasks --full: JSON mentah 40 kunci", (r.json || []).length === 5 && r.json.every((x) => JSON.stringify(kunci(x)) === JSON.stringify(urut(TASK40))),
    (r.json || []).map(kunci)[0]);
  sama("tasks --full: urutan sama dengan brief", (r.json || []).map((x) => x.id), urutanBrief);
  r = await tugas(cfg, st.tok.baca, ["folder-tasks", st.F]);
  sama("folder-tasks: list A + B (terbuka)", urut((r.json || []).map((x) => x.id)), urut([T1, T2, T8, T9, T5]));
  r = await tugas(cfg, st.tok.baca, ["folder-tasks", st.F, "--closed"]);
  sama("folder-tasks --closed: + T3, tanpa list lepas", urut((r.json || []).map((x) => x.id)), urut([T1, T2, T3, T8, T9, T5]));
  cek("folder-tasks tidak memuat T6", !(r.json || []).some((x) => x.id === T6));

  r = await tugas(cfg, st.tok.baca, ["task", "z8r3uj0005"]);
  cek("task seed ClickUp exit 0", r.code === 0, r.stderr);
  const a = r.json?.attachments?.[0];
  sama("lampiran tautan_saja: kunci ClickUp, url = clickup_url, tanpa storage_path", [kunci(a), a?.url],
    [urut(ATT_KEYS), "https://contoh.test/lampiran/rekap-uji.csv"]);
  r = await tugas(cfg, st.tok.baca, ["comments", "z8r3uj0001", "--replies"]);
  cek("comments seed --replies", r.code === 0 && (r.json || []).some((c) => c.reply_count > 0 && Array.isArray(c.replies)), r.stderr);
  r = await tugas(cfg, st.tok.baca, ["task", "rt-tidak-ada"]);
  sama("task tak ada → pesan galat gaya ClickUp", galatCli(r),
    "tugas: GAGAL -> GET /task/rt-tidak-ada?include_markdown_description=true -> HTTP 404: Tugas tidak ditemukan");
}

async function ujiAgenda() {
  bagian("CLI agenda (--hours, --all-comments, --desc)");
  const { T1, T2, T3, T5, T8, T9 } = st.T;
  let r = await tugas(cfg, st.tok.baca, ["agenda", st.F, "--hours", "26"]);
  cek("agenda exit 0", r.code === 0, r.stderr);
  const j = r.json || {};
  sama("agenda: kunci atas", Object.keys(j), ["tanggal_wib", "sejak", "folder", "ringkas", "tasks"]);
  sama("agenda: kunci ringkas", Object.keys(j.ringkas || {}),
    ["terbuka", "due_hari_ini", "telat", "berubah_baru", "ditutup_baru", "kartu_dengan_komentar_baru"]);
  sama("agenda: tanggal & folder", [j.tanggal_wib, j.folder], [HARI_INI, st.F]);
  const kat = Object.fromEntries((j.tasks || []).map((t) => [t.id, t.kategori]));
  sama("agenda: ringkas", j.ringkas, { terbuka: 5, due_hari_ini: 1, telat: 1, berubah_baru: 5, ditutup_baru: 1, kartu_dengan_komentar_baru: 1 });
  cek("agenda: T2 telat, T8 due_hari_ini, T3 ditutup_baru", kat[T2]?.includes("telat") && kat[T8]?.includes("due_hari_ini") && kat[T3]?.includes("ditutup_baru"), kat);
  sama("agenda: 6 kartu (5 terbuka berubah + 1 ditutup)", urut(Object.keys(kat)), urut([T1, T2, T3, T5, T8, T9]));
  const b1 = (j.tasks || []).find((t) => t.id === T1) || {};
  sama("agenda: kunci baris", Object.keys(b1), [...BRIEF, "kategori", "closed", "comments", "komentar_baru"]);
  sama("agenda: komentar T1 + balasan", [b1.komentar_baru, b1.comments?.length, b1.comments?.[1]?.replies?.length], [2, 2, 1]);
  const b3 = (j.tasks || []).find((t) => t.id === T3) || {};
  cek("agenda: T3 closed ISO", /Z$/.test(b3.closed || ""), b3.closed);

  r = await tugas(cfg, st.tok.baca, ["agenda", st.F, "--hours", "26", "--all-comments"]);
  const terbuka = (r.json?.tasks || []).filter((t) => t.status !== "complete");
  cek("agenda --all-comments: semua kartu terbuka berkategori 'terbuka'", terbuka.length === 5 && terbuka.every((t) => t.kategori.includes("terbuka")));
  r = await tugas(cfg, st.tok.baca, ["agenda", st.F, "--desc"]);
  const d = Object.fromEntries((r.json?.tasks || []).map((t) => [t.id, t.description]));
  sama("agenda --desc: deskripsi / '(isi deskripsi tak terbaca)'", [d[T1], d[T2]], ["Deskripsi baru T1", "(isi deskripsi tak terbaca)"]);
  cek("agenda --desc: kunci description setelah closed", Object.keys((r.json?.tasks || [])[0] || {}).join() ===
    [...BRIEF, "kategori", "closed", "description", "comments", "komentar_baru"].join());
  r = await tugas(cfg, st.tok.baca, ["agenda", st.F, "--hours", "0.0001"]);
  sama("agenda --hours kecil: tidak ada berubah_baru", r.json?.ringkas?.berubah_baru, 0);
}

async function ujiTambahan() {
  bagian("CLI tambahan: activity, resolve, search, tenggat, verify");
  const { T1, T2, T3, T4, T8 } = st.T;
  let r = await tugas(cfg, st.tok.baca, ["activity", T1]);
  cek("activity exit 0 (array)", r.code === 0 && Array.isArray(r.json), r.stderr);
  const jenis = new Set((r.json || []).map((x) => x.jenis));
  const perlu = ["dibuat", "nama", "deskripsi", "status", "due", "prioritas", "assignee_tambah", "assignee_hapus", "komentar"];
  cek(`activity T1 memuat ${perlu.join(",")}`, perlu.every((x) => jenis.has(x)), [...jenis]);
  cek("activity: sumber api, aktor bot", (r.json || []).every((x) => x.sumber === "api" && x.aktor?.id === ID.bot), (r.json || []).map((x) => [x.jenis, x.sumber, x.aktor?.id]));
  kunciSama("activity: kunci entri", r.json?.[0], ["id", "at", "at_awal", "jenis", "dari", "ke", "aktor", "aktor_assignee", "sumber", "lengkap", "catatan", "snapshot"]);
  r = await tugas(cfg, st.tok.baca, ["activity", T3]);
  const tutup = (r.json || []).filter((x) => x.jenis === "status" && x.snapshot);
  cek("activity T3: snapshot saat ditutup", tutup.length >= 1 && "komentar" in tutup.at(-1).snapshot, (r.json || []).map((x) => x.jenis));
  cek("activity T3: buka_ulang tercatat", (r.json || []).some((x) => x.jenis === "buka_ulang"), (r.json || []).map((x) => x.jenis));
  r = await tugas(cfg, st.tok.baca, ["activity", T4]);
  cek("activity tugas terhapus: 'hapus' oleh owner", (r.json || []).some((x) => x.jenis === "hapus" && x.aktor?.id === ID.budi));
  const act = await pilihWeb(cfg, st.jwt.budi, "activity", `select=token_id,jenis&task_id=eq.${T1}&jenis=eq.dibuat`);
  sama("activity.token_id = token pemanggil (header x-token-id)", act[0]?.token_id, st.tokId.tulis);
  r = await tugas(cfg, st.tok.baca, ["activity", "rt-tidak-ada"]);
  cek("activity tak ada → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);

  r = await tugas(cfg, st.tok.baca, ["resolve", T1]);
  sama("resolve ID", [r.json?.type, r.json?.id, String(r.json?.url).endsWith(`/t/${T1}`)], ["task", T1, true]);
  r = await tugas(cfg, st.tok.baca, ["resolve", `https://app.clickup.com/t/${T1}`]);
  sama("resolve URL ClickUp", [r.json?.type, r.json?.id], ["task", T1]);
  r = await tugas(cfg, st.tok.baca, ["resolve", `https://app.clickup.com/t/${WS}/z8r3uj0005`]);
  sama("resolve URL ClickUp /t/<team>/<id> (seed)", [r.json?.type, r.json?.id], ["task", "z8r3uj0005"]);
  r = await tugas(cfg, st.tok.baca, ["resolve", `https://tugas.palletmeshindonesia.com/t/${T1}`]);
  sama("resolve URL app", r.json?.id, T1);
  r = await tugas(cfg, st.tok.baca, ["resolve", st.L.A]);
  sama("resolve list", [r.json?.type, r.json?.id], ["list", st.L.A]);
  r = await tugas(cfg, st.tok.baca, ["resolve", "uji-b1-tidak-ada"]);
  cek("resolve tak dikenal → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);
  // (P6) URL tampilan ClickUp list/board/folder/space
  const CU = `https://app.clickup.com/${WS}`;
  for (const [ref, harap, label] of [
    [`${CU}/v/l/6-${st.L.A}-1?pr=${st.S}`, ["list", st.L.A], "tampilan List /v/l/6-<list>-1"],
    [`${CU}/v/b/6-${st.L.A}-2`, ["list", st.L.A], "tampilan Board /v/b/6-<list>-2"],
    [`${CU}/v/li/${st.L.A}`, ["list", st.L.A], "/v/li/<list>"],
    [`${CU}/v/f/${st.F}`, ["folder", st.F], "/v/f/<folder>"],
    [`${CU}/v/s/${st.S}`, ["space", st.S], "/v/s/<space>"],
  ]) {
    r = await tugas(cfg, st.tok.baca, ["resolve", ref]);
    sama(`P6 resolve URL ClickUp ${label}`, [r.json?.type, r.json?.id], harap);
  }
  r = await tugas(cfg, st.tok.baca, ["resolve", `${CU}/v/l/6-${st.L.A}-1`]);
  cek("P6 resolve tampilan list: url /l/<list>", String(r.json?.url).endsWith(`/l/${st.L.A}`), r.json);
  r = await tugas(cfg, st.tok.baca, ["resolve", `${CU}/v/l/6-99999999999-1`]);
  cek("P6 resolve tampilan list ID tak ada → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);

  r = await tugas(cfg, st.tok.baca, ["search", `revisi ${RUN}`]);
  sama("search nama → T1", (r.json || []).map((x) => x.id), [T1]);
  kunciSama("search: kunci hasil", r.json?.[0], ["id", "name", "status", "status_type", "list", "space_id", "assignees", "due_wib", "updated", "url"]);
  r = await tugas(cfg, st.tok.baca, ["search", "uji-b1", "T3", "selesai", RUN]);
  sama("search kartu selesai tanpa --closed → kosong", r.json, []);
  r = await tugas(cfg, st.tok.baca, ["search", `uji-b1 T3 selesai ${RUN}`, "--closed"]);
  sama("search --closed → T3", (r.json || []).map((x) => x.id), [T3]);
  r = await tugas(cfg, st.tok.baca, ["search", `https://app.clickup.com/t/${T1}`]);
  sama("search URL → T1", (r.json || []).map((x) => x.id), [T1]);
  r = await tugas(cfg, st.tok.baca, ["search", `https://app.clickup.com/${WS}/v/l/6-${st.L.A}-1`]);
  cek("P6 search URL tampilan list → kartu list itu saja", (r.json || []).length >= 1 && r.json.every((x) => x.list?.id === st.L.A),
    (r.json || []).map((x) => [x.id, x.list?.id]));
  r = await tugas(cfg, st.tok.baca, ["search", RUN, "--space", st.S]);
  cek("search --space: hanya space uji", (r.json || []).length >= 4 && r.json.every((x) => x.space_id === st.S), r.json);
  r = await tugas(cfg, st.tok.baca, ["search", RUN, "--space", "1100340000900001"]);
  sama("search --space lain → kosong", r.json, []);
  r = await tugas(cfg, st.tok.baca, ["search"]);
  sama("search tanpa kata kunci", galatCli(r), 'tugas: GAGAL -> search: "<kata kunci>" wajib');

  r = await tugas(cfg, st.tok.baca, ["tenggat", "--folder", st.F]);
  cek("tenggat exit 0", r.code === 0, r.stderr);
  const tg = r.json || {};
  cek("tenggat: kunci", ["tanggal", "h1_sampai", "per_anggota", "beban", "ringkas"].every((k) => k in tg), kunci(tg));
  sama("tenggat: tanggal hari ini WIB", tg.tanggal, HARI_INI);
  const pa = (id) => (tg.per_anggota || []).find((x) => x.member?.id === id) || {};
  sama("tenggat: Citra telat T2 (1 hari)", (pa(ID.citra).telat || []).map((x) => [x.id, x.lewat_hari]), [[T2, 1]]);
  sama("tenggat: Dodi hari_ini T8", (pa(ID.dodi).hari_ini || []).map((x) => x.id), [T8]);
  r = await tugas(cfg, st.tok.baca, ["tenggat", "--folder", st.F, "--tanggal", BESOK]);
  const pa2 = (id) => (r.json?.per_anggota || []).find((x) => x.member?.id === id) || {};
  sama("tenggat --tanggal besok: T2 telat 2 hari, T8 telat 1", [(pa2(ID.citra).telat || []).map((x) => x.lewat_hari), (pa2(ID.dodi).telat || []).map((x) => [x.id, x.lewat_hari])],
    [[2], [[T8, 1]]]);
  r = await tugas(cfg, st.tok.baca, ["tenggat", "--tanggal", "kemarin"]);
  sama("tenggat --tanggal salah format (CLI)", galatCli(r), "tugas: GAGAL -> tenggat: --tanggal harus YYYY-MM-DD");
  r = await tugas(cfg, st.tok.baca, ["tenggat", "--tanggal", "2026-13-45"]);
  cek("tenggat tanggal mustahil → 400", r.code === 1 && r.stderr.includes("HTTP 400"), r.stderr);

  r = await tugas(cfg, st.tok.baca, ["verify", "--list", st.L.A]);
  sama("verify --list A: 5 tugas (tanpa terhapus), 1 terhapus, 1 selesai",
    [r.json?.total?.lists, r.json?.total?.tasks_total, r.json?.total?.deleted, r.json?.total?.closed, r.json?.total?.comments_top, r.json?.total?.replies],
    [1, 5, 1, 1, 2, 1]);
  r = await tugas(cfg, st.tok.baca, ["verify", "--folder", st.F]);
  sama("verify --folder: 2 list, 6 tugas", [r.json?.total?.lists, r.json?.total?.tasks_total], [2, 6]);
  r = await tugas(cfg, st.tok.baca, ["verify"]);
  cek("verify tanpa filter = x_sensus penuh (ada sha)", /^[0-9a-f]{64}$/.test(r.json?.total?.sha_ids_tasks || ""), kunci(r.json?.total));
  r = await tugas(cfg, st.tok.baca, ["verify", "--list", "rl-tidak-ada"]);
  cek("verify list tak ada → 404", r.code === 1 && r.stderr.includes("HTTP 404"), r.stderr);
}

async function ujiToken() {
  bagian("Aturan token & scope");
  const T1 = st.T.T1;
  for (const [nama, args] of [
    ["create", ["create", st.L.A, "--name", "uji-b1 x"]], ["update", ["update", T1, "--name", "x"]],
    ["comment", ["comment", T1, "--text", "x"]], ["move", ["move", T1, st.L.B]],
  ]) {
    const r = await tugas(cfg, st.tok.baca, args);
    cek(`scope baca tidak bisa ${nama} (403)`, r.code === 1 && /HTTP 403: Scope token "baca" tidak cukup \(perlu "tulis"\)/.test(r.stderr), r.stderr);
  }
  const api0 = apiEdge(cfg, null);
  let x = await api0("GET", "/v2/user");
  sama("tanpa Authorization → 401 OAUTH_017", [x.status, x.json?.ECODE], [401, "OAUTH_017"]);
  x = await apiEdge(cfg, "rtk_salahsalahsalahsalahsalahsalahsalahsala")("GET", "/v2/user");
  sama("token asing → 401 OAUTH_019", [x.status, x.json], [401, { err: "Token tidak sah", ECODE: "OAUTH_019" }]);
  x = await apiEdge(cfg, `Bearer ${st.tok.baca}`)("GET", "/v2/user");
  sama("awalan Bearer diterima", [x.status, x.json?.user?.id], [200, ID.bot]);
  let r = await tugas(cfg, "rtk_salah", ["whoami"]);
  sama("CLI token salah → 401", galatCli(r), "tugas: GAGAL -> GET /user -> HTTP 401: Token tidak sah");

  r = await tugas(cfg, st.tok.cabut, ["whoami"]);
  cek("token sebelum dicabut: OK", r.code === 0, r.stderr);
  await rpcWeb(cfg, st.jwt.budi, "web_admin_token_cabut", { p_id: st.tokId.cabut });
  st.dicabut.add("cabut");
  r = await tugas(cfg, st.tok.cabut, ["whoami"]);
  sama("token dicabut → 401", [r.code, galatCli(r)], [1, "tugas: GAGAL -> GET /user -> HTTP 401: Token tidak sah"]);

  x = await apiEdge(cfg, st.tok.tulis)("POST", "/x/impor/batch", { body: { jenis: "workspace", rows: [] } });
  sama("scope tulis tidak bisa /x/impor/* (403)", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
  x = await apiEdge(cfg, st.tok.baca)("GET", "/x/export");
  sama("scope baca tidak bisa /x/export (403)", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
  const cek1 = await pilihWeb(cfg, st.jwt.budi, "api_tokens", `select=last_used_at&id=eq.${st.tokId.baca}`);
  cek("last_used_at token terisi", !!cek1[0]?.last_used_at, cek1);
}

async function ujiImporLampiran() {
  bagian("Endpoint /x: impor, export, sensus, lampiran (signed URL)");
  const imp = apiEdge(cfg, st.tok.impor);
  const ws = await pilihWeb(cfg, st.jwt.budi, "workspace", "select=id,name");
  let x = await imp("POST", "/x/impor/batch", { body: { jenis: "workspace", rows: [{ id: ws[0].id, name: ws[0].name }] } });
  sama("impor/batch workspace sama → unchanged (tanpa efek)", [x.status, x.json?.inserted, x.json?.updated, x.json?.unchanged], [200, 0, 0, 1]);
  x = await imp("POST", "/x/impor/batch", { body: { jenis: "ngawur", rows: [] } });
  sama("impor/batch jenis tak dikenal → 400", [x.status, x.json?.ECODE], [400, "INPUT_001"]);
  x = await imp("POST", "/x/impor/batch", { body: { jenis: "tasks" } });
  sama("impor/batch tanpa rows → 400", x.status, 400);
  x = await imp("POST", "/x/impor/batch", { body: "bukan json", raw: true });
  sama("body bukan JSON → 400", [x.status, x.json?.ECODE], [400, "INPUT_001"]);
  x = await imp("POST", "/x/impor/hilang", { body: { jenis: "tasks", ids_ada: [], lingkup: { task_ids: ["uji-b1-tidak-ada"] } } });
  sama("impor/hilang lingkup kosong → 0 ditandai", [x.status, x.json?.ditandai], [200, 0]);
  x = await imp("POST", "/x/impor/hilang", { body: { jenis: "tasks", ids_ada: [] } });
  sama("impor/hilang tanpa lingkup & ids kosong → 400 (pengaman)", x.status, 400);
  x = await imp("POST", "/x/impor/run", { body: { aksi: "ngawur" } });
  sama("impor/run aksi salah → 400", x.status, 400);
  x = await imp("POST", "/x/impor/run/selesai", { body: { id: -1 } });
  sama("impor/run/selesai run tak ada → 404", [x.status, x.json?.ECODE], [404, "ITEM_013"]);
  x = await imp("GET", "/x/export");
  cek("export: kunci utama & tanpa token_hash", x.status === 200 && ["meta", "tasks", "api_tokens", "comments"].every((k) => k in (x.json || {})) && !x.text.includes("token_hash"),
    [x.status, kunci(x.json)]);
  x = await apiEdge(cfg, st.tok.baca)("GET", "/x/sensus?sumber=app");
  cek("sensus sumber=app: lists + total", x.status === 200 && Array.isArray(x.json?.lists) && x.json?.total, x.text.slice(0, 200));
  x = await apiEdge(cfg, st.tok.baca)("GET", "/x/sensus?sumber=ngawur");
  sama("sensus sumber salah → 400", x.status, 400);

  // Lampiran kartu app: diunggah anggota lewat Storage (RLS, seperti aplikasi web) → web_lampiran_catat →
  // task.attachments[].url (signed 24 jam) → /x/file. Token impor TIDAK boleh menulis ke folder kartu app.
  const T1 = st.T.T1;
  const nama = `uji-b1-bukti-${RUN}.png`, pApp = `t/${T1}/${nama}`;
  st.storage.add(pApp);
  const upApp = await unggahSesi(st.jwt.budi, pApp, PNG, "image/png");
  cek("unggah lampiran kartu app lewat Storage (sesi Budi, RLS) → 200", upApp.status === 200, upApp.text);
  const lp = await rpcWeb(cfg, st.jwt.budi, "web_lampiran_catat", {
    p_task: T1, p_comment: null, p_path: pApp, p_title: nama, p_mime: "image/png", p_size: PNG.length,
  });
  cek("web_lampiran_catat (Budi) → id lampiran", !!lp?.id, lp);
  const r = await tugas(cfg, st.tok.baca, ["task", T1]);
  const a = (r.json?.attachments || []).find((z) => z.id === lp?.id);
  sama("task: lampiran berkunci ClickUp (tanpa storage_path/clickup_url)", kunci(a), urut(ATT_KEYS));
  cek("task: url lampiran = signed URL Storage", /\/storage\/v1\/object\/sign\/lampiran\/t\//.test(a?.url || ""), a?.url);
  sama("task: mimetype/size/extension", [a?.mimetype, a?.size, a?.extension], ["image/png", PNG.length, "png"]);
  const dl = a?.url ? await http("GET", a.url) : { status: 0, buf: Buffer.alloc(0) };
  cek("unduh signed URL tanpa auth → berkas identik", dl.status === 200 && dl.buf.equals(PNG), dl.status);
  const f = await apiEdge(cfg, st.tok.baca)("GET", `/x/file/${lp?.id}`, { redirect: "manual" });
  cek("/x/file/<id> → 302 ke signed URL", f.status === 302 && /\/object\/sign\//.test(f.headers.get("location") || ""), f.status);
  const dl2 = f.headers.get("location") ? await http("GET", f.headers.get("location")) : { status: 0, buf: Buffer.alloc(0) };
  cek("/x/file: berkas identik", dl2.status === 200 && dl2.buf.equals(PNG));

  // (P3) allowlist bucket: CSV dari Windows (application/vnd.ms-excel), tsv, doc, pptx, heic, heif diterima; zip ditolak.
  const CSV_WIN = Buffer.from("tanggal;klik\r\n2026-09-21;12\r\n");
  const pCsv = `t/${T1}/uji-b1-win-${RUN}.csv`;
  st.storage.add(pCsv);
  const upCsv = await unggahSesi(st.jwt.budi, pCsv, CSV_WIN, "application/vnd.ms-excel");
  cek("P3 unggah CSV Windows (application/vnd.ms-excel) lewat Storage → 200", upCsv.status === 200, upCsv.text);
  const lpCsv = await rpcWeb(cfg, st.jwt.budi, "web_lampiran_catat", { p_task: T1, p_comment: null, p_path: pCsv, p_title: "ekspor.csv", p_mime: null, p_size: null });
  sama("P3 web_lampiran_catat CSV Windows: mimetype dari Storage", [lpCsv?.mimetype, lpCsv?.extension, lpCsv?.status_salin], ["application/vnd.ms-excel", "csv", "ok"]);
  for (const [ext, mime] of [["tsv", "text/tab-separated-values"], ["doc", "application/msword"], ["heic", "image/heic"], ["heif", "image/heif"],
    ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]]) {
    const pX = `t/${T1}/uji-b1-${RUN}.${ext}`;
    st.storage.add(pX);
    const up = await unggahSesi(st.jwt.budi, pX, Buffer.from(`uji-b1 ${ext}`), mime);
    cek(`P3 unggah ${ext} (${mime}) → 200`, up.status === 200, up.text);
  }
  const pZip = `t/${T1}/uji-b1-${RUN}.zip`;
  st.storage.add(pZip);
  const upZip = await unggahSesi(st.jwt.budi, pZip, Buffer.from("PK uji"), "application/zip");
  cek("P3 zip tetap ditolak bucket", upZip.status >= 400, upZip.status);

  // Review: token impor sempat bisa menimpa berkas kartu app lewat upload-url + upsert:true (tanpa activity).
  x = await imp("POST", "/x/impor/upload-url", { body: { task_id: T1, nama: `uji-b1-baru-${RUN}.png` } });
  sama("upload-url ke kartu app → 403 ACCESS_001", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
  x = await imp("POST", "/x/impor/upload-url", { body: { path: pApp, upsert: true } });
  sama("upload-url + upsert ke berkas lampiran kartu app → 403 ACCESS_001", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
  const isiApp = await http("GET", `${cfg.url}/storage/v1/object/authenticated/lampiran/${pApp}`, { headers: svcHeaders(cfg) });
  cek("berkas lampiran kartu app tetap asli", isiApp.status === 200 && isiApp.buf.equals(PNG), isiApp.status);
  x = await imp("POST", "/x/impor/upload-url", { body: { path: "lain/../x.png" } });
  sama("upload-url path tak sah → 400", x.status, 400);
  x = await imp("POST", "/x/impor/upload-url", { body: { task_id: "rt-tidak-ada", nama: "a.png" } });
  sama("upload-url tugas tak ada → 404", x.status, 404);
  x = await apiEdge(cfg, st.tok.tulis)("POST", "/x/impor/upload-url", { body: { task_id: "z8r3uj0002", nama: "a.png" } });
  sama("upload-url scope tulis → 403", x.status, 403);
  await ujiLampiranClickup(imp);
  x = await apiEdge(cfg, st.tok.tulis)("POST", `/v2/task/${T1}/attachment`, { body: {} });
  sama("POST attachment (Fase 1 ditunda) → 501", [x.status, x.json?.ECODE], [501, "APP_501"]);
}

// Salinan lampiran importer di kartu asal ClickUp (kartu sementara dibuat lewat /x/impor/batch, seperti importer).
async function ujiLampiranClickup(imp) {
  const id = `uji-b1-cu-${RUN}`, sekarang = String(Date.now());
  const tags = [{ name: "uji-b1", tag_fg: "#ffffff", tag_bg: "#000000", creator: ID.bot }];
  let x = await imp("POST", "/x/impor/batch", { body: { jenis: "tasks", rows: [{
    id, name: `uji-b1 kartu impor ${RUN}`, list: { id: LIST_CU }, status: { status: "to do" }, creator: { id: ID.bot },
    date_created: sekarang, date_updated: sekarang, assignees: [], tags,
    checklists: [{ id: `uji-b1-cl-${RUN}`, name: "Cek", orderindex: 0, items: [{ id: `uji-b1-it-${RUN}`, name: "satu", resolved: false }] }],
  }] } });
  if (x.json?.inserted === 1) st.cu = id;
  sama("impor/batch: kartu ClickUp sementara dibuat", [x.status, x.json?.inserted, x.json?.gagal], [200, 1, []]);
  try {
    const nama = `uji-b1-salin-${RUN}.png`, p = `t/${id}/${nama}`;
    st.storage.add(p);
    x = await imp("POST", "/x/impor/upload-url", { body: { task_id: id, nama } });
    cek("upload-url kartu ClickUp: signed URL", x.status === 200 && x.json?.path === p && /\/storage\/v1\/object\/upload\/sign\//.test(x.json?.url || ""), x.text);
    let up = x.json?.url ? await http("PUT", x.json.url, { body: PNG, raw: true, headers: { "content-type": "image/png" } }) : { status: 0 };
    cek("PUT berkas ke signed upload URL → 200", up.status === 200, up.text);
    x = await imp("POST", "/x/impor/upload-url", { body: { task_id: id, nama } });
    sama("upload-url path sudah ada → 409 (tanpa upsert)", [x.status, x.json?.ECODE], [409, "KONFLIK_001"]);
    x = await imp("POST", "/x/impor/upload-url", { body: { path: p, upsert: true } });
    sama("upsert path yang belum tercatat sebagai lampiran ClickUp → 409 (tidak ditimpa)", [x.status, x.json?.ECODE], [409, "KONFLIK_001"]);

    // Setelah tercatat sebagai lampiran sumber=clickup (seperti importer), upsert boleh menimpa salinan itu.
    const attId = `uji-b1-att-${RUN}`;
    x = await imp("POST", "/x/impor/batch", { body: { jenis: "attachments", rows: [{
      id: attId, task_id: id, title: nama, extension: "png", mimetype: "image/png", size: PNG.length, storage_path: p,
      status_salin: "ok", date: sekarang, user: { id: ID.bot },
    }] } });
    sama("impor/batch: lampiran ClickUp tercatat", [x.status, x.json?.inserted, x.json?.gagal], [200, 1, []]);
    x = await imp("POST", "/x/impor/upload-url", { body: { path: p, upsert: true } });
    cek("upsert salinan lampiran ClickUp yang tercatat → signed URL", x.status === 200 && x.json?.path === p, x.text);
    const PNG2 = Buffer.concat([PNG, Buffer.from(`uji-b1 ${RUN}`)]);
    up = x.json?.url ? await http("PUT", x.json.url, { body: PNG2, raw: true, headers: { "content-type": "image/png" } }) : { status: 0 };
    cek("PUT upsert → 200", up.status === 200, up.text);
    const r = await tugas(cfg, st.tok.baca, ["task", id]);
    const a = (r.json?.attachments || []).find((z) => z.id === attId);
    const dl = a?.url ? await http("GET", a.url) : { status: 0, buf: Buffer.alloc(0) };
    cek("task kartu ClickUp: berkas lampiran = hasil upsert", dl.status === 200 && dl.buf.equals(PNG2), [dl.status, a?.url]);
    // PR-1 (perbaikan P1): tags/checklists kartu impor = isi payload ClickUp (tasks.extra), bentuk sama.
    sama("P1 task kartu impor: tags verbatim dari payload ClickUp", r.json?.tags, tags);
    sama("P1 task kartu impor: checklists verbatim", [r.json?.checklists?.length, r.json?.checklists?.[0]?.items?.[0]?.name], [1, "satu"]);
    const rl = await tugas(cfg, st.tok.baca, ["tasks", LIST_CU, "--full"]);
    sama("P1 tasks --full: tags kartu impor sama", (rl.json || []).find((z) => z.id === id)?.tags, tags);

    // Lampiran app di kartu ClickUp (keadaan sah di mode utama; mode cermin menolaknya, jadi dibuat lewat psql).
    const pAppCu = `t/${id}/uji-b1-app-${RUN}.png`;
    const s = psql(`begin; select set_config('app.sumber', 'sinkron', true); insert into public.attachments (task_id, title, storage_path, sumber) values ('${id}', 'uji-b1 app.png', '${pAppCu}', 'app'); commit;`);
    if (s.error) console.log(`  LEWATI upsert ke path lampiran app di kartu ClickUp: psql tidak ada (${s.error.code})`);
    else {
      cek("psql: lampiran app di kartu ClickUp dibuat", s.status === 0, s.stderr);
      x = await imp("POST", "/x/impor/upload-url", { body: { path: pAppCu, upsert: true } });
      sama("upsert path yang dirujuk lampiran app → 403 ACCESS_001", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
    }

    const pSvg = `t/${id}/uji-b1-${RUN}.svg`;
    x = await imp("POST", "/x/impor/upload-url", { body: { path: pSvg } });
    st.storage.add(pSvg);
    const svg = x.json?.url ? await http("PUT", x.json.url, { body: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), raw: true, headers: { "content-type": "image/svg+xml" } }) : { status: 0 };
    cek("SVG ditolak bucket (mime allowlist)", svg.status >= 400, svg.status);
  } finally {
    await hapusKartuCu();
  }
}

async function ujiHttp() {
  bagian("HTTP: burst limit, CORS, route, parameter");
  const burst = apiEdge(cfg, st.tok.burst);
  const rs = await Promise.all(Array.from({ length: 90 }, () => burst("GET", "/v2/user")));
  const n429 = rs.filter((x) => x.status === 429), n200 = rs.filter((x) => x.status === 200);
  cek(`burst 90 paralel → ada 429 (${n429.length}) dan 200 (${n200.length})`, n429.length > 0 && n200.length >= 20 && n429.length + n200.length === 90);
  sama("429: body {err:'Rate limit', ECODE:'APP_002'}", n429[0]?.json, { err: "Rate limit", ECODE: "APP_002" });
  cek("429: header retry-after & x-ratelimit-reset", !!n429[0]?.headers.get("retry-after") && /^\d+$/.test(n429[0]?.headers.get("x-ratelimit-reset") || ""));
  await sleep(2500);
  const pulih = await burst("GET", "/v2/user");
  sama("setelah jeda → 200 lagi", pulih.status, 200);

  await ujiCors();
  await ujiRute();
}

async function ujiCors() {
  // Uji CORS milik fungsi: langsung ke edge runtime (Kong lokal menimpa CORS dengan "*"; di cloud tidak).
  const base = cfg.edgeLangsung;
  if (!base) {
    console.log("  LEWATI uji CORS: alamat edge runtime langsung tak ditemukan (set UJI_EDGE_LANGSUNG=http://<ip>:8081/api)");
    return;
  }
  const origin = "https://tugas.palletmeshindonesia.com";
  const g = await http("OPTIONS", `${cfg.fnBase}/v2/user`, { headers: { origin, "access-control-request-method": "GET" } });
  console.log(`  (catatan: gateway lokal menjawab preflight sendiri: HTTP ${g.status}, server=${g.headers.get("server")}, ACAO=${g.headers.get("access-control-allow-origin")}; uji CORS fungsi → ${base})`);
  let x = await http("OPTIONS", `${base}/v2/user`, { headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
  cek("CORS preflight origin app → 204 + ACAO", x.status === 204 && x.headers.get("access-control-allow-origin") === origin &&
    /authorization/.test(x.headers.get("access-control-allow-headers") || "") && /x-sesi/.test(x.headers.get("access-control-allow-headers") || ""), [x.status, [...x.headers]]);
  sama("preflight: satu Vary Origin", x.headers.get("vary")?.split(/,\s*/).filter((v) => v === "Origin").length, 1);
  x = await http("OPTIONS", `${base}/x/admin/akun`, { headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" } });
  sama("CORS preflight localhost dev → 204", [x.status, x.headers.get("access-control-allow-origin")], [204, "http://localhost:5173"]);
  x = await http("OPTIONS", `${base}/v2/user`, { headers: { origin: "https://jahat.contoh.test", "access-control-request-method": "GET" } });
  sama("CORS preflight origin asing → 403 tanpa ACAO", [x.status, x.headers.get("access-control-allow-origin")], [403, null]);
  x = await http("GET", `${base}/v2/user`, { headers: { origin, Authorization: st.tok.baca } });
  sama("GET origin app → 200 + ACAO", [x.status, x.headers.get("access-control-allow-origin")], [200, origin]);
  x = await http("GET", `${base}/v2/user`, { headers: { origin: "https://jahat.contoh.test", Authorization: st.tok.baca } });
  sama("GET origin asing → tanpa ACAO", x.headers.get("access-control-allow-origin"), null);
  x = await http("GET", `${base}/v2/user`, { headers: { Authorization: st.tok.baca } });
  sama("GET tanpa Origin (CLI) → tanpa header CORS", [x.status, x.headers.get("access-control-allow-origin")], [200, null]);
}

async function ujiRute() {
  const api = apiEdge(cfg, st.tok.baca);
  let x = await api("GET", "/v2/tidak/ada");
  sama("route tak dikenal → 404 APP_001", [x.status, x.json], [404, { err: "Route not found", ECODE: "APP_001" }]);
  x = await api("PATCH", `/v2/task/${st.T.T1}`);
  sama("method salah → 405", x.status, 405);
  x = await api("GET", `/v2/list/${st.L.A}/task?statuses[]=to%20do`);
  sama("filter ClickUp yang tak didukung → 400 (bukan diam-diam diabaikan)", [x.status, x.json?.err], [400, "Parameter tidak didukung: statuses[]"]);
  x = await api("GET", `/v2/list/${st.L.A}/task?page=-1`);
  sama("page negatif → 400", x.status, 400);
  x = await api("GET", `/v2/list/${st.L.A}/task?page=abc`);
  sama("page bukan angka → 400", x.status, 400);
  x = await api("GET", `/v2/list/${st.L.A}/task?include_closed=mungkin`);
  sama("boolean tak sah → 400", x.status, 400);
  x = await api("GET", `/v2/list/${st.L.A}/task?include_closed=true&subtasks=true&page=1`);
  sama("halaman 1 (kosong) → last_page", [x.status, x.json?.tasks, x.json?.last_page], [200, [], true]);
  x = await api("GET", `/v2/list/${st.L.A}/task?date_updated_gt=${Date.now() + 3600e3}`);
  sama("date_updated_gt masa depan → kosong", x.json?.tasks, []);
  x = await api("GET", `/v2/list/${st.L.A}/task?include_markdown_description=true`);
  cek("include_markdown_description → kunci markdown_description", (x.json?.tasks || []).every((t) => "markdown_description" in t) && x.json.tasks.length > 0);
  x = await api("GET", `/api/v2/user`);
  sama("awalan ganda /api/api/v2 juga diterima", [x.status, x.json?.user?.id], [200, ID.bot]);
  x = await api("GET", `/v2/team/${WS}/space`);
  cek("GET team/space: space uji ada", x.status === 200 && (x.json?.spaces || []).some((s) => s.id === st.S));
  x = await api("GET", `/v2/team/999/space`);
  sama("team id salah → 404", x.status, 404);
  x = await api("GET", `/v2/space/${st.S}/folder`);
  cek("GET space/folder: folder uji + 2 list", x.status === 200 && (x.json?.folders || []).find((f) => f.id === st.F)?.lists?.length === 2);
  x = await api("GET", `/v2/space/${st.S}/list`);
  sama("GET space/list (tanpa folder)", (x.json?.lists || []).map((l) => l.id), [st.L.C]);
  x = await api("GET", `/v2/list/${st.L.A}`);
  sama("GET list: status default app", (x.json?.statuses || []).map((s) => [s.status, s.type]), [["to do", "open"], ["in progress", "custom"], ["complete", "closed"]]);
}

async function bersihAkun() {
  if (!st.akun) return;
  const { member, uid } = st.akun;
  if (uid) {
    const d = await http("DELETE", `${cfg.url}/auth/v1/admin/users/${uid}`, { headers: svcHeaders(cfg) });
    cek("akun Auth uji dihapus", d.status === 200 || d.status === 404, d.text);
  }
  await rpcWeb(cfg, st.jwt.budi, "web_admin_anggota_simpan", { p: { id: member, aktif: false, email: "" } });
  const m = await pilihWeb(cfg, st.jwt.budi, "members", `select=aktif,auth_user_id&id=eq.${member}`);
  sama("anggota uji nonaktif & tanpa akun", m[0], { aktif: false, auth_user_id: null });
  st.akun = null;
}

async function ujiAdmin() {
  bagian("Admin akun & reset (header x-sesi, owner)");
  const ada = await pilihWeb(cfg, st.jwt.budi, "members", `select=id,aktif&username=eq.${encodeURIComponent(NAMA.akun)}`);
  let member = ada[0]?.id;
  if (!member) {
    member = (await rpcWeb(cfg, st.jwt.budi, "web_admin_anggota_simpan", { p: { username: NAMA.akun, nama: "Akun Uji B1 (sintetis)", role: "member", aktif: true } })).id;
  } else {
    await rpcWeb(cfg, st.jwt.budi, "web_admin_anggota_simpan", { p: { id: member, aktif: true } });
  }
  st.akun = { member, uid: null };
  const email = `uji-b1-akun@contoh.test`;
  const pw = [`uji-b1-${RUN}-satu`, `uji-b1-${RUN}-dua`, `uji-b1-${RUN}-tiga`];
  const admin = (p, jwt, body) => http("POST", `${cfg.fnBase}${p}`, { headers: jwt ? { "x-sesi": jwt } : {}, body });

  let x = await admin("/x/admin/akun", null, { member_id: member, email, password_sementara: pw[0] });
  sama("tanpa x-sesi → 401", [x.status, x.json?.ECODE], [401, "OAUTH_019"]);
  x = await admin("/x/admin/akun", "eyJ.palsu.jwt", { member_id: member, email, password_sementara: pw[0] });
  sama("JWT palsu → 401", x.status, 401);
  x = await admin("/x/admin/akun", st.jwt.citra, { member_id: member, email, password_sementara: pw[0] });
  sama("sesi member (bukan owner) → 403", [x.status, x.json?.ECODE], [403, "ACCESS_001"]);
  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: member, email, password_sementara: "pendek" });
  sama("password < 8 → 400", x.status, 400);
  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: ID.bot, email: "bot@contoh.test", password_sementara: pw[0] });
  sama("anggota bot → 400", x.status, 400);
  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: 1, email: "x@contoh.test", password_sementara: pw[0] });
  sama("anggota tak ada → 404", x.status, 404);

  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: member, email, password_sementara: pw[0] });
  cek("buat akun → 200, akun_baru, harus_ganti_password", x.status === 200 && x.json?.akun_baru === true && x.json?.harus_ganti_password === true && /^[0-9a-f-]{36}$/.test(x.json?.auth_user_id || ""), x.text);
  st.akun.uid = x.json?.auth_user_id;
  let jwt = await login(cfg, email, pw[0]).catch(() => null);
  cek("login dengan password sementara", !!jwt);
  const saya = jwt ? await rpcWeb(cfg, jwt, "web_saya") : null;
  sama("web_saya: anggota tertaut + harus ganti password", [saya?.member?.id, saya?.member?.harus_ganti_password], [member, true]);

  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: member, email, password_sementara: pw[1] });
  sama("akun ulang → update (akun_baru false, uid sama)", [x.status, x.json?.akun_baru, x.json?.auth_user_id], [200, false, st.akun.uid]);
  cek("password lama ditolak, baru diterima", !(await login(cfg, email, pw[0]).catch(() => null)) && !!(await login(cfg, email, pw[1]).catch(() => null)));
  x = await admin("/x/admin/reset", st.jwt.budi, { member_id: member, password_sementara: pw[2] });
  sama("reset → 200", [x.status, x.json?.harus_ganti_password], [200, true]);
  cek("reset: password baru diterima, lama ditolak", !!(await login(cfg, email, pw[2]).catch(() => null)) && !(await login(cfg, email, pw[1]).catch(() => null)));
  x = await admin("/x/admin/akun", st.jwt.budi, { member_id: member, email: EMAIL.citra, password_sementara: pw[2] });
  sama("email milik anggota lain (members) → 409", [x.status, x.json?.ECODE], [409, "KONFLIK_001"]);
  // Email dipakai akun Auth yang tak tertaut anggota → GoTrue menolak (HTTP 500/23505) → dipetakan 409.
  const emailLiar = `uji-b1-liar-${RUN}@contoh.test`;
  const liar = await http("POST", `${cfg.url}/auth/v1/admin/users`, {
    headers: svcHeaders(cfg), body: { email: emailLiar, password: `uji-b1-${RUN}-liar`, email_confirm: true },
  });
  try {
    x = await admin("/x/admin/akun", st.jwt.budi, { member_id: member, email: emailLiar, password_sementara: `${pw[2]}-x` });
    sama("email milik akun Auth lain → 409", [liar.status, x.status, x.json?.ECODE], [200, 409, "KONFLIK_001"]);
    cek("penolakan tidak mengubah password akun", !!(await login(cfg, email, pw[2]).catch(() => null)));
  } finally {
    if (liar.json?.id) await http("DELETE", `${cfg.url}/auth/v1/admin/users/${liar.json.id}`, { headers: svcHeaders(cfg) });
  }
  x = await admin("/x/admin/reset", st.jwt.budi, { member_id: ID.dodi + 0, password_sementara: "x" });
  sama("reset password pendek → 400", x.status, 400);
  await bersihAkun();
}

async function ujiAdminPurge() {
  bagian("Admin purge (x-sesi owner): web_purge + hapus objek Storage");
  const r0 = await buat("T10", [st.L.A, "--name", `uji-b1 T10 purge ${RUN}`]);
  const T10 = st.T.T10;
  cek("buat T10", r0.code === 0 && !!T10, r0.stderr);
  const nama = `uji-b1-purge-${RUN}.png`, p = `t/${T10}/${nama}`;
  st.storage.add(p);
  const up = await unggahSesi(st.jwt.budi, p, PNG, "image/png"); // kartu app: unggah seperti web (upload-url hanya kartu ClickUp)
  await rpcWeb(cfg, st.jwt.budi, "web_lampiran_catat", { p_task: T10, p_comment: null, p_path: p, p_title: nama, p_mime: "image/png", p_size: PNG.length });
  cek("lampiran T10 terunggah", up.status === 200, up.status);
  const purge = (jwt, body) => http("POST", `${cfg.fnBase}/x/admin/purge`, { headers: jwt ? { "x-sesi": jwt } : {}, body });

  let x = await purge(null, { task_id: T10 });
  sama("purge tanpa sesi → 401", x.status, 401);
  x = await purge(st.jwt.citra, { task_id: T10 });
  sama("purge sesi member → 403", x.status, 403);
  x = await purge(st.jwt.budi, {});
  sama("purge tanpa task_id → 400", x.status, 400);
  x = await purge(st.jwt.budi, { task_id: T10 });
  sama("purge tugas yang belum di Sampah → 400 (dari web_purge)", [x.status, x.json?.ECODE], [400, "INPUT_001"]);
  await rpcWeb(cfg, st.jwt.budi, "web_hapus", { p_task: T10 });
  x = await purge(st.jwt.budi, { task_id: T10 });
  sama("purge owner → purged + objek Storage terhapus",
    [x.status, x.json?.purged, x.json?.storage_paths, x.json?.storage_dihapus, x.json?.storage_sisa, x.json?.storage_gagal],
    [200, [T10], [p], [p], [], false]);
  const o = await http("GET", `${cfg.url}/storage/v1/object/lampiran/${p}`, { headers: svcHeaders(cfg) });
  cek("objek Storage sudah tidak ada", o.status === 400 || o.status === 404, o.status);
  const t = await tugas(cfg, st.tok.baca, ["task", T10]);
  cek("tugas ter-purge → 404", t.code === 1 && t.stderr.includes("HTTP 404"), t.stderr);
  const a = await tugas(cfg, st.tok.baca, ["activity", T10]);
  cek("activity tugas ter-purge tetap ada (append-only)", a.code === 0 && (a.json || []).some((z) => z.jenis === "hapus"), a.stderr);
  x = await purge(st.jwt.budi, { task_id: T10 });
  cek("purge ulang → 4xx", x.status === 404 || x.status === 400, [x.status, x.json]);
}

async function ujiBanding() {
  bagian("Banding perilaku: clickup.mjs asli vs tugas.mjs (mode tugas & mode clickup)");
  const { T1, T5 } = st.T;
  await bandingPerilaku(cfg, st.tok.baca, [
    ["whoami"],
    ["tasks", st.L.A], ["tasks", st.L.A, "--closed"], ["tasks", st.L.A, "--closed", "--full"],
    ["folder-tasks", st.F], ["folder-tasks", st.F, "--closed"],
    ["task", T1], ["task", "z8r3uj0005"],
    ["comments", T1, "--replies"], ["comments", T1], ["comments", "z8r3uj0001", "--replies"],
    ["agenda", st.F, "--hours", "26"], ["agenda", st.F, "--hours", "26", "--all-comments"], ["agenda", st.F, "--desc"],
    ["fields", st.L.A],
    ["update", T1, "--name", "x", "--due", "none", "--priority", "2", "--add-assignee", "1,2", "--rem-assignee", "3", "--dry-run"],
    ["update", T1, "--due", BESOK, "--status", "to do", "--desc", "d", "--dry-run"],
    ["comment", T1, "--text", "halo — uji", "--dry-run"],
    ["move", T5, st.L.A, "--dry-run"],
    ["create", st.L.A], ["update", T1], ["comment", T1], ["move", T1], ["delete", T1], ["xyz"], [],
    ["task", "rt-tidak-ada"], ["update", T1, "--name", "x"], ["tasks", "rl-tidak-ada"],
  ]);
}

async function ujiRetry429() {
  bagian("CLI mode tugas: 429 → tunggu Retry-After lalu ulang (server tiruan)");
  let n = 0;
  const srv = http_.createServer((req, res) => {
    n++;
    if (n === 1) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
      return res.end(JSON.stringify({ err: "Rate limit", ECODE: "APP_002" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url.endsWith("/user")) return res.end(JSON.stringify({ user: { id: 1, username: "tiruan", email: null } }));
    return res.end(JSON.stringify({ teams: [{ id: "1", name: "Tiruan", members: [] }] }));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const t0 = Date.now();
  const r = await jalankan(CLI, ["whoami"], { TUGAS_API_URL: `http://127.0.0.1:${port}/functions/v1/api/v2`, TUGAS_API_TOKEN: "rtk_tiruan" });
  const dt = Date.now() - t0;
  srv.close();
  cek(`429 sekali lalu sukses (3 request, ${dt} ms ≥ 1000)`, r.code === 0 && n === 3 && dt >= 1000 && r.json?.user?.username === "tiruan", [r.code, n, r.stderr]);
}

// ---------------------------------------------------------------- utama
async function utama() {
  console.log(`Uji kontrak B1 — API ${cfg.api} — hari ini WIB ${HARI_INI}`);
  const cekEdge = await http("GET", `${cfg.fnBase}/x/tidak-ada`).catch((e) => ({ status: 0, text: e.message }));
  if (cekEdge.status !== 404 || cekEdge.json?.ECODE !== "APP_001") {
    console.error(`Edge API tidak terjangkau di ${cfg.fnBase} (HTTP ${cekEdge.status}). Jalankan dulu: supabase functions serve`);
    process.exit(2);
  }
  bagian("banding statis: potongan kode tugas.mjs = clickup.mjs asli");
  bandingStatis(cfg.asli);
  try {
    await siapkan();
    for (const f of [ujiModeDanPesan, ujiWhoami, ujiCreate, ujiUpdate, ujiComment, ujiMove, ujiDelete, ujiBaca, ujiAgenda,
      ujiTambahan, ujiToken, ujiImporLampiran, ujiHttp, ujiAdmin, ujiAdminPurge, ujiBanding, ujiRetry429]) {
      try {
        await f();
      } catch (e) {
        cek(`${f.name} berjalan tanpa crash`, false, e.stack);
      }
    }
  } catch (e) {
    cek("persiapan", false, e.stack);
  } finally {
    await bersihkan();
  }
  console.log(`\nHASIL: ${hasil.lulus} cek lulus, ${hasil.gagal.length} gagal`);
  for (const g of hasil.gagal) console.log(`  - ${g}`);
  process.exit(hasil.gagal.length ? 1 : 0);
}

utama();
