// Uji importer B2: impor/sinkron.mjs terhadap server ClickUp tiruan + Edge `api` lokal + DB lokal bersama.
//   node impor/uji/jalankan.mjs            (UJI_VERBOSE=1 → cetak semua cek)
// Syarat: stack Supabase lokal jalan + `supabase functions serve` (Edge api). Exit 0 = lulus, 1 = ada gagal, 2 = prasyarat.
// Tidak pernah `db reset`. Data uji: ID fixture 86b2…/9018220000…/882000… (sintetis). Token uji "uji-b2 …" dibersihkan.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulaiMock } from "./mock-clickup.mjs";
import {
  BOT_ID, MOCK_PORT, SINKRON, Token, bagian, cek, edgeSiap, hasil, jalankanNode, konfigurasi, login, psql, psqlJson, rpcWeb,
} from "./_bantu.mjs";
import {
  KlienClickUp, MIME_IZIN, alasanTautanSaja, bacaArgumen, hanyaGet, namaObjek, shaIds, urutId, urutKedalaman,
} from "../sinkron.mjs";

const cfg = konfigurasi();
const LAPORAN = process.env.UJI_LAPORAN_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "rhj-impor-uji-"));
const RUN = crypto.randomBytes(3).toString("hex").slice(0, 4); // pasangan induk/anak lintas list selalu baru
const FIXTURE = JSON.parse(fs.readFileSync(new URL("./fixture/awal.json", import.meta.url), "utf8"));
const NAMA_KARTU = FIXTURE.tasks.map((t) => t.name);

const jumlahActivity = () => Number(psql("select count(*) from public.activity where task_id like '86b2%'"));
const maksActivity = () => Number(psql("select coalesce(max(id),0) from public.activity"));
const activitySejak = (id) => psqlJson(`select task_id, jenis, sumber, lengkap, actor_id, at_awal is not null as ada_at_awal
  from public.activity where id > ${Number(id)} and task_id like '86b2%' order by id`);

async function sinkron(args, envTambah = {}, { harapGagal = false } = {}) {
  const r = await jalankanNode([SINKRON, ...args], {
    CLICKUP_API_TOKEN: mock.token, CLICKUP_API_BASE: mock.base, TUGAS_API_URL: cfg.api, TUGAS_IMPORT_TOKEN: tokImpor,
    SINKRON_RPM: "6000", SINKRON_LAPORAN_DIR: LAPORAN, ...envTambah,
  });
  if (!r.json && !harapGagal) console.log(`  (stdout bukan JSON; kode ${r.code})\n${r.stderr.slice(-2000)}`);
  return r;
}
const semuaBatch = (j, k) => Object.values(j?.tulis || {}).reduce((n, v) => n + (v[k] || 0), 0);
// (P2) space privat fixture: anggota = /list/{id}/member list-nya (88200002, 88200003) + owner/admin /team (88200001, 88200004)
const SPACE_PRIVAT = "901822000002";
const anggotaSpace = () => psqlJson(`select member_id, sumber from public.space_anggota where space_id = '${SPACE_PRIVAT}' order by member_id`)
  .map((x) => `${x.member_id}:${x.sumber}`);
const APP_ANGGOTA = 100000002; // anggota seed (citra) yang ditambah owner lewat Admin (sumber app) → tak boleh dihapus impor

let mock, tok, tokImpor;

async function utama() {
  if (!(await edgeSiap(cfg))) {
    console.error(`Edge api tidak jalan di ${cfg.api} (jalankan: supabase functions serve)`);
    process.exit(2);
  }
  mock = await mulaiMock({ port: MOCK_PORT, varian: "awal", run: RUN });
  tok = new Token(cfg, "importer");
  console.log(`mock ${mock.base} · edge ${cfg.api} · run ${RUN} · laporan ${LAPORAN}`);

  // ------------------------------------------------------------ unit
  bagian("Unit: guard GET, argumen, urutan ID, nama objek");
  for (const m of ["POST", "PUT", "DELETE", "PATCH", "post"]) {
    let dilempar = false;
    try { hanyaGet(m); } catch { dilempar = true; }
    cek(`hanyaGet menolak ${m}`, dilempar);
  }
  cek("hanyaGet menerima GET", (() => { try { hanyaGet("GET"); return true; } catch { return false; } })());
  {
    const cu = new KlienClickUp({ base: mock.base, token: mock.token, rpm: 6000 });
    const sebelum = mock.stat.total;
    let pesan = "";
    for (const m of ["POST", "PUT", "DELETE"]) {
      try { await cu.minta(m, "/task/86b2a0001", {}); } catch (e) { pesan = e.message; }
    }
    cek("KlienClickUp.minta(POST/PUT/DELETE) dilempar SEBELUM ada request ke server", mock.stat.total === sebelum && /HANYA boleh GET/.test(pesan), pesan);
    const cuResmi = new KlienClickUp({ base: "https://api.clickup.com/api/v2", token: "pk_x", rpm: 500 });
    cek("rpm ke api.clickup.com dipatok maks 60 (SINKRON_RPM=500 diabaikan)", cuResmi.rpm === 60 && cuResmi.jedaMs === 1000, cuResmi.rpm);
    cek("rpm default 60", new KlienClickUp({ base: "https://api.clickup.com/api/v2", token: "pk_x" }).rpm === 60);
    const src = fs.readFileSync(SINKRON, "utf8");
    const fetchPanggil = [...src.matchAll(/fetch\(/g)].length;
    cek("sinkron.mjs: hanya 5 titik fetch (2 ClickUp GET-only, 1 unduh lampiran ulang auth, 2 app/Storage)", fetchPanggil === 5, fetchPanggil);
    cek("setiap fetch ke ClickUp memakai method GET literal",
      [...src.matchAll(/fetch\(u, \{ method: "([A-Z]+)"/g)].every((m) => m[1] === "GET") && [...src.matchAll(/fetch\(u, \{ method: "([A-Z]+)"/g)].length === 3);
  }
  {
    const o = bacaArgumen(["--mode", "uji", "--only", "list=1,2", "--dry-run"]);
    cek("argumen: --mode uji --only list=1,2 --dry-run", o.mode === "uji" && o.only.size === 2 && o.dryRun);
    const salah = (a) => { try { bacaArgumen(a); return false; } catch { return true; } };
    cek("argumen salah ditolak (mode x, only tanpa list=, akhir+only, flag asing, muat x)",
      salah(["--mode", "x"]) && salah(["--only", "123"]) && salah(["--mode", "akhir", "--only", "list=1"]) && salah(["--apa"]) && salah(["--muat", "x"]));
  }
  {
    const ids = ["86b2a0010", "86b2a0002", "Zeta", "alpha", "9018", "10", "9", "a-b", "a_b", "AB", "ab", "86B2A0001"];
    const pg = psql(`select encode(extensions.digest(string_agg(x, ',' order by x), 'sha256'), 'hex') from unnest(array[${ids.map((x) => `'${x}'`).join(",")}]) x`);
    cek("sha ID JS = ORDER BY text Postgres (collation DB)", pg === shaIds(ids), { js: urutId(ids), pg });
    const t = urutKedalaman([{ id: "c", parent: "b" }, { id: "b", parent: "a" }, { id: "a" }, { id: "x", parent: "luar" }]).map((x) => x.id);
    cek("urutKedalaman: induk sebelum anak", t.indexOf("a") < t.indexOf("b") && t.indexOf("b") < t.indexOf("c"), t);
    const n = namaObjek("b2a00301-0000-4000-8000-000000000001.png", "Grafik rekap (final) é/..\\x.png");
    cek("namaObjek aman untuk path Storage", /^[A-Za-z0-9_-]+-[A-Za-z0-9._-]+$/.test(n) && !n.includes("/") && !n.includes(".."), n);
  }

  bagian("Unit: allowlist MIME lampiran (P3)");
  {
    const bucket = JSON.parse(psql("select coalesce(json_agg(x order by x), '[]') from storage.buckets b, unnest(b.allowed_mime_types) x where b.id = 'lampiran'"));
    const js = [...MIME_IZIN].sort();
    cek("MIME_IZIN importer = allowed_mime_types bucket 'lampiran' (sama persis)", JSON.stringify(js) === JSON.stringify(bucket), { js, bucket });
    cek("CSV Windows, tsv, doc, pptx, heic, heif diizinkan; SVG/HTML/zip tidak",
      ["application/vnd.ms-excel", "text/tab-separated-values", "application/msword", "image/heic", "image/heif",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"].every((m) => MIME_IZIN.has(m))
      && !["image/svg+xml", "text/html", "application/zip"].some((m) => MIME_IZIN.has(m)));
    const a = (o) => alasanTautanSaja({ url: "https://x/y", size: 10, ...o });
    cek("alasanTautanSaja: allowlist → null; di luar allowlist/tanpa MIME/tanpa URL/> 25 MB → alasan tertulis",
      a({ mimetype: "application/vnd.ms-excel" }) === null && a({ mimetype: "Text/CSV; charset=utf-8" }) === null
      && /allowlist \(image\/svg\+xml\)/.test(a({ mimetype: "image/svg+xml" })) && a({ mimetype: null }) === "MIME tidak diketahui"
      && a({ mimetype: "text/csv", url: null }) === "tanpa URL" && /25 MB/.test(a({ mimetype: "text/csv", size: 26214401 })));
  }

  bagian("Unit: throttle & 429 (klien ClickUp)");
  {
    const cu = new KlienClickUp({ base: mock.base, token: mock.token, rpm: 120 });
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await cu.get("/user");
    const dt = Date.now() - t0;
    cek("rpm 120: 5 permintaan ≥ 2000 ms (jeda 500 ms)", dt >= 1950, dt);
    mock.setel({ tolak429Setiap: 3 });
    const cu2 = new KlienClickUp({ base: mock.base, token: mock.token, rpm: 6000 });
    const t1 = Date.now();
    for (let i = 0; i < 6; i++) await cu2.get("/user");
    mock.setel({ tolak429Setiap: 0 });
    cek("429 → tunggu x-ratelimit-reset lalu ulang (6 permintaan sukses)", cu2.stat.r429 >= 1 && cu2.stat.permintaan >= 7 && Date.now() - t1 >= 900,
      { ...cu2.stat, ms: Date.now() - t1 });
  }

  tokImpor = await tok.buat(BOT_ID, "impor", "importer");

  // ------------------------------------------------------------ impor awal
  bagian("Impor penuh fixture awal");
  mock.reset();
  const a0 = maksActivity();
  const r1 = await sinkron(["--mode", "penuh"]);
  const j1 = r1.json;
  cek("kode 0", r1.code === 0, { code: r1.code, err: r1.stderr.slice(-600) });
  cek("sensus: 9 list, selisih 0", j1?.sensus?.list === 9 && j1?.sensus?.selisih === 0, j1?.sensus);
  cek("gagal 0, tertunda 0, galat 0", j1?.gagal === 0 && j1?.tertunda === 0 && j1?.galat === 0, j1);
  cek("jumlah payload: 143 tugas, 46 komentar, 7 lampiran, 6 anggota (1 nonaktif)",
    j1?.jumlah?.tugas === 143 && j1?.jumlah?.komentar === 46 && j1?.jumlah?.lampiran === 7 && j1?.jumlah?.anggota === 6 && j1?.jumlah?.anggota_nonaktif === 1, j1?.jumlah);
  cek("lampiran: 5 tersalin (ok/sudah_ada, termasuk CSV Windows), 1 gagal (URL 404), 1 tautan_saja (SVG)",
    (j1?.lampiran?.ok ?? 0) + (j1?.lampiran?.sudah_ada ?? 0) === 5 && j1?.lampiran?.gagal === 1 && j1?.lampiran?.tautan_saja === 1, j1?.lampiran);
  cek("time_in_status ditolak → dicatat, run tetap sukses", /^ditolak/.test(j1?.time_in_status ?? ""), j1?.time_in_status);
  cek("mock: 0 permintaan non-GET", mock.stat.nonGet.length === 0, mock.stat.nonGet);
  cek("komentar kartu >25 dipaginasi (halaman start/start_id diminta)", mock.stat.komentarLanjut >= 1 && (mock.stat.perJalur["/task/:id/comment"] ?? 0) === 143 + mock.stat.komentarLanjut, mock.stat);
  {
    const baris = psqlJson(`select id, sumber, clickup_id, desc_unreadable, markdown, description_plain, parent_id, archived,
      to_char(due_wib,'YYYY-MM-DD') as due_wib from public.tasks where id in ('86b2a0007','86b2a0011','86b2a0010','86b2a0006','86b2f0004')`);
    const by = Object.fromEntries(baris.map((x) => [x.id, x]));
    cek("desc_unreadable: markdown kosong + teks → desc_unreadable=true, markdown=teks", by["86b2a0007"]?.desc_unreadable === true && by["86b2a0007"]?.markdown === "Isi polos saja, markdown kosong.", by["86b2a0007"]);
    cek("subtask bertingkat & subtask list tanpa folder punya parent", by["86b2a0011"]?.parent_id === "86b2a0005" && by["86b2f0004"]?.parent_id === "86b2f0001");
    cek("due 00:00 WIB (17:00Z) → due_wib hari berikutnya (2026-09-30)", by["86b2a0010"]?.due_wib === "2026-09-30", by["86b2a0010"]);
    cek("tugas arsip ikut (archived=true)", by["86b2a0006"]?.archived === true);
    const ang = psqlJson(`select id, username, clickup_email, aktif, role from public.members where id between 88200001 and 88200007 order by id`);
    const a = Object.fromEntries(ang.map((x) => [x.id, x]));
    cek("anggota eks-tim (hanya muncul sebagai creator/penulis) → aktif=false", a[88200006]?.aktif === false, a[88200006]);
    cek("email kosong di /team dilengkapi dari /list/{id}/member", a[88200003]?.clickup_email === "sari.uji@contoh.test", a[88200003]);
    cek("role impor = member (owner ClickUp TIDAK otomatis owner app)", a[88200001]?.role === "member", a[88200001]);
    const st = psqlJson(`select l.id, l.folder_id, l.archived, f.hidden from public.lists l left join public.folders f on f.id = l.folder_id
      where l.id in ('901822000104','901822000106','901822000103','901822000105','901822000201')`);
    const s = Object.fromEntries(st.map((x) => [x.id, x]));
    cek("struktur: folder hidden, list tanpa folder, list arsip, folder arsip, space arsip ikut",
      s["901822000104"]?.hidden === true && s["901822000106"]?.folder_id === null && s["901822000103"]?.archived === true
      && !!s["901822000105"] && !!s["901822000201"], s);
    const lp = psqlJson(`select id, comment_id, status_salin, storage_path, size from public.attachments where id like 'b2%' order by id`);
    const l = Object.fromEntries(lp.map((x) => [x.id, x]));
    cek("lampiran komentar (attachment & image) → comment_id terisi",
      l["b2a00303-0000-4000-8000-000000000003.pdf"]?.comment_id === "90182200000301" && l["b2b00601-0000-4000-8000-000000000004.png"]?.comment_id === "90182200000603", lp);
    const obj = psqlJson(`select name, metadata->>'size' as size, metadata->>'mimetype' as mime from storage.objects where bucket_id = 'lampiran' and name like 't/86b2%' order by name`);
    cek("objek Storage ada untuk 5 lampiran ok (ukuran = berkas)", obj.length === 5 && obj.every((o) => Number(o.size) > 0), obj);
    const win = l["b2a00304-0000-4000-8000-000000000007.csv"];
    cek("P3 CSV dari Windows (application/vnd.ms-excel) tersalin: status ok + objek Storage bertipe sama",
      win?.status_salin === "ok" && !!win?.storage_path && obj.some((o) => o.name === win.storage_path && o.mime === "application/vnd.ms-excel"
        && Number(o.size) === fs.statSync(new URL("./fixture/berkas/ekspor-windows.csv", import.meta.url)).size), { win, obj });
    const svg = psqlJson(`select status_salin, storage_path, clickup_url from public.attachments where id = 'b2f00202-0000-4000-8000-000000000006.svg'`)[0];
    cek("P3 lampiran di luar allowlist (SVG): tautan_saja + clickup_url tersimpan (bukan gagal diam-diam)",
      svg?.status_salin === "tautan_saja" && svg?.storage_path === null && String(svg?.clickup_url).startsWith(mock.base.replace(/\/api\/v2$/, "")), svg);
    const lapJ = JSON.parse(fs.readFileSync(j1.laporan_json, "utf8"));
    cek("P3 alasan tautan_saja dicatat di laporan (id + alasan)",
      lapJ.tulis?.lampiran_tautan?.some((x) => x.id === "b2f00202-0000-4000-8000-000000000006.svg" && /allowlist \(image\/svg\+xml\)/.test(x.alasan))
      && fs.readFileSync(j1.laporan, "utf8").includes("lampiran tautan_saja b2f00202"), lapJ.tulis?.lampiran_tautan);
    cek("P2 anggota space privat = gabungan /list/{id}/member + owner/admin /team (sumber clickup)",
      JSON.stringify(anggotaSpace()) === JSON.stringify(["88200001:clickup", "88200002:clickup", "88200003:clickup", "88200004:clickup"]), anggotaSpace());
    cek("P2 ringkasan space_privat: 1 space, 1 list, 4 anggota, terkirim",
      JSON.stringify(j1?.space_privat) === JSON.stringify([{ space_id: SPACE_PRIVAT, list: 1, anggota: 4, ok: true }]), j1?.space_privat);
    cek("P2 mock: GET /list/{id}/member diminta untuk list space privat", (mock.stat.perJalur["/list/:id/member"] ?? 0) >= 1, mock.stat.perJalur);
    cek("P2 batch space_anggota terkirim (1 space) tanpa gagal",
      (j1?.tulis?.space_anggota?.inserted ?? 0) + (j1?.tulis?.space_anggota?.updated ?? 0) + (j1?.tulis?.space_anggota?.unchanged ?? 0) === 1
      && (j1?.tulis?.space_anggota?.gagal ?? 0) === 0, j1?.tulis?.space_anggota);
    const men = psqlJson(`select comment_id, member_id from public.comment_mentions where comment_id in ('90182200000101','90182200000601') order by 1`);
    cek("mention dari part tag → comment_mentions", men.length === 2, men);
    const run = psqlJson(`select mode, finished_at is not null as selesai, census is not null as ada_census, jsonb_array_length(diffs->'selisih') as selisih
      from public.sync_runs where id = ${Number(j1?.run_id) || 0}`)[0];
    cek("sync_runs: run selesai + census + diffs (selisih 0)", run?.selesai && run?.ada_census && run?.selisih === 0, run);
    const muat = psqlJson(`select count(*) filter (where jenis='dibuat') as dibuat, count(*) filter (where jenis='ditutup_impor') as ditutup,
      count(*) filter (where lengkap) as lengkap from public.activity where id > ${a0} and task_id like '86b2%'`)[0];
    if (j1?.muat === "impor") {
      cek("muat awal: activity 'dibuat' 143 + 'ditutup_impor' (tugas selesai), semua lengkap=false", muat.dibuat === 143 && muat.ditutup > 0 && muat.lengkap === 0, muat);
    } else {
      console.log(`  (DB sudah berisi data fixture dari run sebelumnya → muat=${j1?.muat}; cek activity muat awal dilewati)`);
    }
  }
  {
    const md = fs.readFileSync(j1.laporan, "utf8");
    const js = fs.readFileSync(j1.laporan_json, "utf8");
    const bocor = NAMA_KARTU.filter((n) => md.includes(n) || js.includes(n));
    cek("laporan .md + .json tidak memuat nama kartu (hanya angka per list)", bocor.length === 0, bocor.slice(0, 5));
    cek("laporan berisi tabel sensus 9 list", (md.match(/^\| 9018220001|^\| 9018220002/gm) || []).length >= 9);
  }

  bagian("Sinkron ulang tanpa perubahan (idempoten)");
  const aktSebelum = jumlahActivity();
  const r2 = await sinkron(["--mode", "penuh"]);
  const j2 = r2.json;
  cek("kode 0, muat=sinkron", r2.code === 0 && j2?.muat === "sinkron", { code: r2.code, muat: j2?.muat });
  cek("semua jenis: inserted 0, updated 0", semuaBatch(j2, "inserted") === 0 && semuaBatch(j2, "updated") === 0, j2?.tulis);
  cek("activity baru = 0", jumlahActivity() === aktSebelum, { sebelum: aktSebelum, sesudah: jumlahActivity() });
  cek("lampiran tidak diunggah ulang (sudah_ada 5, ok 0)", j2?.lampiran?.sudah_ada === 5 && j2?.lampiran?.ok === 0, j2?.lampiran);
  cek("P2 space_anggota idempoten (unchanged 1)", j2?.tulis?.space_anggota?.unchanged === 1, j2?.tulis?.space_anggota);

  bagian("P2 space privat: akses lewat API + anggota tambahan Admin tidak dihapus impor");
  {
    const jwt = await login(cfg);
    const setAnggota = (ids) => rpcWeb(cfg, jwt, "web_admin_struktur_simpan", { p: { jenis: "space", id: SPACE_PRIVAT, anggota: ids } });
    await setAnggota([88200001, 88200002, 88200003, 88200004, APP_ANGGOTA]);
    cek("owner menambah anggota app (Admin → Struktur) di space privat impor",
      anggotaSpace().includes(`${APP_ANGGOTA}:app`) && anggotaSpace().length === 5, anggotaSpace());
    const r = await sinkron(["--mode", "penuh"]);
    cek("sinkron ulang: anggota app tetap, anggota clickup tetap, space_anggota unchanged",
      r.code === 0 && anggotaSpace().includes(`${APP_ANGGOTA}:app`) && anggotaSpace().length === 5 && r.json?.tulis?.space_anggota?.unchanged === 1,
      { code: r.code, a: anggotaSpace(), sa: r.json?.tulis?.space_anggota });
    const tAnggota = await tok.buat(88200002, "baca", "anggota-privat");
    const tLuar = await tok.buat(88200005, "baca", "bukan-anggota");
    const spaces = async (t) => ((await (await fetch(`${cfg.api}/team/1100340000004525/space?archived=true`, { headers: { Authorization: t } })).json()).spaces || [])
      .map((x) => x.id);
    const [sa, sl] = [await spaces(tAnggota), await spaces(tLuar)];
    cek("API app: anggota list privat (88200002) melihat space privat; anggota lain (88200005) tidak", sa.includes(SPACE_PRIVAT) && !sl.includes(SPACE_PRIVAT), { sa, sl });
    // list space privat gagal dibaca → anggota space TIDAK dikirim (tidak dikosongkan), run berkode 2 + galat tercatat
    const sebelum = anggotaSpace();
    mock.setel({ tolakJalur: /^\/list\/901822000201\/member$/ });
    const rg = await sinkron(["--mode", "uji"]);
    mock.setel({ tolakJalur: null });
    cek("P2 /list/{id}/member gagal (403) → space_anggota tidak dikirim, anggota tetap, kode 2",
      rg.code === 2 && rg.json?.space_privat?.[0]?.ok === false && !rg.json?.tulis?.space_anggota && JSON.stringify(anggotaSpace()) === JSON.stringify(sebelum)
      && rg.json?.galat >= 1, { code: rg.code, sp: rg.json?.space_privat, sa: rg.json?.tulis?.space_anggota, a: anggotaSpace() });
  }
  cek("hilang 0 dan sensus selisih 0", j2?.hilang?.tasks === 0 && j2?.hilang?.comments === 0 && j2?.sensus?.selisih === 0, j2?.hilang);

  bagian("--dry-run tidak menulis apa pun");
  {
    const runs = Number(psql("select count(*) from public.sync_runs"));
    const raw = psql("select max(fetched_at) from public.sync_raw where id like '86b2%'");
    const akt = maksActivity();
    const r = await sinkron(["--mode", "penuh", "--dry-run"]);
    cek("kode 0 + sensus dibandingkan (selisih 0)", r.code === 0 && r.json?.sensus?.selisih === 0 && r.json?.dry_run === true, r.json?.sensus);
    cek("sync_runs, sync_raw, activity tidak berubah",
      Number(psql("select count(*) from public.sync_runs")) === runs && psql("select max(fetched_at) from public.sync_raw where id like '86b2%'") === raw && maksActivity() === akt);
    cek("tanpa token app: dry-run tetap jalan (sensus hanya dari ClickUp)", (await sinkron(["--dry-run"], { TUGAS_IMPORT_TOKEN: "" })).code === 0);
  }

  bagian("--only list=<list tanpa folder> di varian ubah (induk di luar cakupan)");
  mock.ganti({ varian: "ubah", run: RUN });
  {
    const a = maksActivity();
    const r = await sinkron(["--mode", "penuh", "--only", "list=901822000106"]);
    const j = r.json;
    cek("kode 0, sensus 1 list selisih 0", r.code === 0 && j?.sensus?.list === 1 && j?.sensus?.selisih === 0, { code: r.code, s: j?.sensus, err: r.stderr.slice(-400) });
    cek("induk di luar cakupan diambil & diimpor lebih dulu (tertunda → 0)", j?.induk_luar === 1 && j?.tertunda === 0, { induk: j?.induk_luar, tertunda: j?.tertunda });
    const q = psqlJson(`select id, parent_id, list_id from public.tasks where id in ('86b2p${RUN}','86b2q${RUN}') order by id`);
    cek("anak lintas list tersimpan dengan induk", q.length === 2 && q[1]?.parent_id === `86b2p${RUN}`, q);
    const a12 = psql("select deleted_at is null from public.tasks where id = '86b2a0012'");
    cek("lingkup --only: tugas list lain (A12, hilang di ClickUp) TIDAK ditandai hilang", a12 === "t");
    cek("hilang hanya dihitung dalam lingkup list 106", j?.hilang?.tasks === 0, j?.hilang);
    const u1 = psqlJson(`select list_id, deleted_at is null as hidup from public.tasks where id = '86b2f0001'`)[0];
    cek("kartu yang pindah ke list di luar cakupan: diverifikasi GET /task (200) → diimpor pindah, TIDAK ditandai hilang",
      u1?.list_id === "901822000101" && u1?.hidup === true && j?.hilang_verifikasi?.pindah === 1 && j?.hilang_verifikasi?.hilang_404 === 0, { u1, v: j?.hilang_verifikasi });
    const aktOnly = activitySejak(a);
    cek("activity --only: hanya pasangan induk/anak baru + pindah_list kartu U1 (tanpa hilang_di_clickup)",
      aktOnly.every((x) => [`86b2p${RUN}`, `86b2q${RUN}`, "86b2f0001"].includes(x.task_id)) && !aktOnly.some((x) => x.jenis === "hilang_di_clickup")
      && aktOnly.some((x) => x.task_id === "86b2f0001" && x.jenis === "pindah_list"), aktOnly);
  }

  bagian("Sinkron varian ubah: perubahan → activity sinkron");
  {
    const a = maksActivity();
    const r = await sinkron(["--mode", "penuh"]);
    const j = r.json;
    cek("kode 0, muat=sinkron, sensus selisih 0", r.code === 0 && j?.muat === "sinkron" && j?.sensus?.selisih === 0, { code: r.code, s: j?.sensus });
    const akt = activitySejak(a);
    const ada = (t, jenis) => akt.some((x) => x.task_id === t && x.jenis === jenis);
    const harap = [
      ["86b2a0002", "status"], ["86b2a0004", "nama"], ["86b2a0007", "due"], ["86b2b0002", "assignee_tambah"], ["86b2b0002", "assignee_hapus"],
      ["86b2a0001", "prioritas"], ["86b2a0008", "pindah_list"], ["86b2a0008", "status"], ["86b2a0013", "arsip"], ["86b2a0009", "deskripsi"],
      ["86b2b0005", "assignee_tambah"], ["86b2a0012", "hilang_di_clickup"], ["86b2a0001", "komentar_edit"], ["86b2a0001", "komentar_hapus"],
      ["86b2a0003", "lampiran_hapus"],
    ];
    for (const [t, jenis] of harap) cek(`activity ${jenis} @ ${t}`, ada(t, jenis));
    // A16 baru di ClickUp: 'dibuat' bila belum pernah ada; 'pulih' bila pernah diimpor lalu ditandai hilang (DB bersama dipakai ulang)
    cek("activity dibuat/pulih @ 86b2a0016 (kartu baru)", ada("86b2a0016", "dibuat") || ada("86b2a0016", "pulih"), akt.filter((x) => x.task_id === "86b2a0016"));
    const selainDibuat = akt.filter((x) => x.jenis !== "dibuat");
    cek("semua activity sinkron: sumber=sinkron, lengkap=false, aktor null, at_awal terisi",
      akt.every((x) => x.sumber === "sinkron" && x.lengkap === false) && selainDibuat.every((x) => x.actor_id === null && x.ada_at_awal), akt.filter((x) => x.sumber !== "sinkron" || x.lengkap));
    cek("hilang: tugas ≥1, komentar 1, lampiran 1", j?.hilang?.tasks >= 1 && j?.hilang?.comments === 1 && j?.hilang?.attachments === 1, j?.hilang);
    cek("kandidat hilang diverifikasi ke ClickUp: A12 → 404 (hilang), tidak ada yang pindah", j?.hilang_verifikasi?.hilang_404 >= 1 && j?.hilang_verifikasi?.pindah === 0, j?.hilang_verifikasi);
    const st = psqlJson(`select id, status, list_id from public.tasks where id in ('86b2b0002','86b2a0008') order by id`);
    cek("ganti nama status ClickUp (id sama) → tugas ikut tanpa activity status",
      st.find((x) => x.id === "86b2b0002")?.status === "sedang dikerjakan" && !ada("86b2b0002", "status"), st);
    const z = psqlJson(`select aktif from public.members where id = 88200007`)[0];
    cek("anggota baru di /team → masuk aktif", z?.aktif === true, z);
    cek("P2 akses list privat dicabut di ClickUp (88200003) → dibuang dari space_anggota; anggota app tetap",
      JSON.stringify(anggotaSpace()) === JSON.stringify(["88200001:clickup", "88200002:clickup", "88200004:clickup", `${APP_ANGGOTA}:app`]), anggotaSpace());
    const a2 = maksActivity();
    const r2b = await sinkron(["--mode", "penuh"]);
    cek("idempoten di varian ubah: 0 activity baru, updated 0", r2b.code === 0 && maksActivity() === a2 && semuaBatch(r2b.json, "updated") === 0,
      { tambah: maksActivity() - a2, upd: r2b.json?.tulis });
  }

  bagian("Kembali ke varian awal + time_in_status aktif");
  mock.ganti({ varian: "awal" });
  mock.setel({ tis: true });
  {
    const a = maksActivity();
    const r = await sinkron(["--mode", "penuh"]);
    const j = r.json;
    cek("kode 0, sensus selisih 0", r.code === 0 && j?.sensus?.selisih === 0, { code: r.code, s: j?.sensus });
    const akt = activitySejak(a);
    const ada = (t, jenis) => akt.some((x) => x.task_id === t && x.jenis === jenis);
    cek("tugas yang muncul lagi → pulih; arsip dibuka → pulih_arsip; complete dibuka → buka_ulang; U1 kembali ke list 106",
      ada("86b2a0012", "pulih") && ada("86b2a0013", "pulih_arsip") && ada("86b2a0002", "buka_ulang") && ada("86b2f0001", "pindah_list"), akt.map((x) => `${x.task_id}:${x.jenis}`));
    cek("P2 kembali ke awal: 88200003 masuk lagi (sumber clickup), anggota app tetap",
      JSON.stringify(anggotaSpace()) === JSON.stringify(["88200001:clickup", "88200002:clickup", "88200003:clickup", "88200004:clickup", `${APP_ANGGOTA}:app`]), anggotaSpace());
    cek("tugas baru varian ubah + pasangan lintas list → hilang_di_clickup",
      ada("86b2a0016", "hilang_di_clickup") && ada(`86b2p${RUN}`, "hilang_di_clickup") && ada(`86b2q${RUN}`, "hilang_di_clickup"));
    cek("time_in_status aktif → tersimpan di sync_raw", /^ok/.test(j?.time_in_status ?? "") && Number(psql("select count(*) from public.sync_raw where entity='time_in_status' and id like '86b2%'")) >= 100, j?.time_in_status);
    const a2 = maksActivity();
    const rr = await sinkron(["--mode", "penuh"]);
    cek("idempoten setelah kembali: 0 activity baru, sensus 0", rr.code === 0 && maksActivity() === a2 && rr.json?.sensus?.selisih === 0 && semuaBatch(rr.json, "updated") === 0,
      { tambah: maksActivity() - a2, upd: rr.json?.tulis });
  }
  mock.setel({ tis: false });

  bagian("429 ClickUp saat sapuan penuh (dry-run)");
  mock.setel({ tolak429Setiap: 25 });
  mock.reset();
  {
    const r = await sinkron(["--mode", "penuh", "--dry-run"]);
    cek("sapuan selesai walau 429 berulang (kode 0, selisih 0)", r.code === 0 && r.json?.sensus?.selisih === 0, { code: r.code, s: r.json?.sensus });
    cek("429 benar-benar terjadi & diulang", (r.json?.clickup?.r429 ?? 0) >= 5 && mock.stat.r429 === r.json?.clickup?.r429, { klien: r.json?.clickup, mock: mock.stat.r429 });
  }
  mock.setel({ tolak429Setiap: 0 });

  bagian("Selisih terdeteksi: mode uji (tanpa tandai hilang) di varian ubah");
  mock.ganti({ varian: "ubah", run: `${RUN.slice(0, 3)}x` });
  {
    const r = await sinkron(["--mode", "uji"]);
    const j = r.json;
    cek("kode 2 (selesai dengan selisih) karena tugas/komentar/lampiran hilang tidak ditandai", r.code === 2 && j?.sensus?.selisih > 0, { code: r.code, s: j?.sensus });
    const lap = JSON.parse(fs.readFileSync(j.laporan_json, "utf8"));
    const s101 = lap.sensus.selisih.filter((x) => x.list_id === "901822000101").map((x) => x.kunci);
    cek("selisih list 101: tasks_total, sha_ids_tasks, sha_ids_comments", ["tasks_total", "sha_ids_tasks", "sha_ids_comments"].every((k) => s101.includes(k)), s101);
    const rinci = lap.sensus.rinci?.find((x) => x.list_id === "901822000101");
    cek("rincian ID via /x/export: A12 hanya di app, komentar 90182200000103 hanya di app",
      rinci?.tugas_hanya_db?.includes("86b2a0012") && rinci?.komentar_hanya_db?.includes("90182200000103") && rinci?.tugas_hanya_clickup?.length === 0, rinci);
    const md = fs.readFileSync(j.laporan, "utf8");
    cek("laporan .md menandai BEDA di baris list 101", /\| 901822000101 \|[^\n]*BEDA/.test(md));
  }
  mock.ganti({ varian: "awal" });
  {
    const r = await sinkron(["--mode", "penuh"]);
    cek("pulihkan ke awal setelah uji selisih: kode 0, selisih 0", r.code === 0 && r.json?.sensus?.selisih === 0, { code: r.code, s: r.json?.sensus });
  }

  bagian("Mode uji & akhir");
  {
    const r = await sinkron(["--mode", "uji"]);
    cek("mode uji: kode 0, tandai hilang dilewati", r.code === 0 && r.json?.hilang?.dilewati === "mode uji", r.json?.hilang);
    const ra = await sinkron(["--mode", "akhir", "--only", "list=901822000101"], {}, { harapGagal: true });
    cek("mode akhir menolak --only (kode 1)", ra.code === 1);
    const rb = await sinkron(["--mode", "penuh"], { TUGAS_IMPORT_TOKEN: "" });
    cek("tanpa TUGAS_IMPORT_TOKEN (bukan dry-run) → kode 1", rb.code === 1);
    const rc = await sinkron(["--mode", "penuh"], { CLICKUP_API_TOKEN: "pk_salah" });
    cek("token ClickUp salah → kode 1 (401), tidak menulis", rc.code === 1 && /401/.test(rc.stderr), rc.stderr.slice(-300));
  }

  bagian("Cadangan (impor/cadangan.mjs + age), logika backup.yml");
  {
    const CAD = path.join(path.dirname(SINKRON), "cadangan.mjs");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rhj-cadangan-uji-"));
    const tBaca = await tok.buat(BOT_ID, "baca", "ekspor-baca");
    const env = (t) => ({ TUGAS_API_URL: cfg.api, TUGAS_EXPORT_TOKEN: t });
    const rb = await jalankanNode([CAD, "ekspor", "--keluar", dir], env(tBaca));
    cek("token scope baca → /x/export ditolak 403 (kontrak: butuh scope impor)", rb.code === 1 && /HTTP 403/.test(rb.stderr), rb.stderr.slice(-200));
    const re = await jalankanNode([CAD, "ekspor", "--keluar", dir], env(tokImpor));
    const j = re.json;
    cek("ekspor (scope impor): kode 0, berkas + hitungan, tanpa token_hash", re.code === 0 && fs.existsSync(j?.berkas ?? "") && j?.hitungan?.tasks > 0
      && !fs.readFileSync(j.berkas, "utf8").includes('"token_hash"'), { code: re.code, err: re.stderr.slice(-200), h: j?.hitungan });
    cek("stdout ekspor hanya angka (tanpa nama kartu)", !NAMA_KARTU.some((n) => re.stdout.includes(n)));
    const rl = await jalankanNode([CAD, "lampiran", "--ekspor", j?.berkas ?? "-", "--keluar", path.join(dir, "lampiran")], env(tokImpor));
    const sumber = JSON.parse(fs.readFileSync(j.berkas, "utf8")).attachments.filter((a) => a.storage_path && !a.deleted_at && a.status_salin === "ok");
    const milikFixture = sumber.filter((a) => a.task_id.startsWith("86b2"));
    const f = path.join(dir, "lampiran", "t/86b2a0003/b2a00301-0000-4000-8000-000000000001-grafik-rekap.png");
    cek("lampiran fixture: semua tersalin lewat /x/file (302 → signed URL), isi = berkas fixture",
      [0, 2].includes(rl.code) && milikFixture.length === 5 && milikFixture.every((a) => fs.existsSync(path.join(dir, "lampiran", a.storage_path)))
      && fs.readFileSync(f).equals(fs.readFileSync(new URL("./fixture/berkas/grafik.png", import.meta.url))), { code: rl.code, j: rl.json, err: rl.stderr.slice(-200) });
    // DB bersama: baris lampiran seed/agen lain bisa punya storage_path tanpa objek → harus dilaporkan gagal (kode 2), bukan diam
    const tanpaObjek = (rl.json?.galat || []).map((g) => g.id);
    const benarTanpaObjek = tanpaObjek.every((id) => {
      const a = sumber.find((x) => x.id === id);
      return a && psql(`select count(*) from storage.objects where bucket_id = 'lampiran' and name = '${a.storage_path.replace(/'/g, "''")}'`) === "0";
    });
    cek("lampiran gagal hanya yang objek Storage-nya memang tidak ada, dan kode keluar 2 bila ada", benarTanpaObjek && (tanpaObjek.length ? rl.code === 2 : rl.code === 0),
      { gagal: rl.json?.galat, kode: rl.code });
    let ageAda = true;
    try { execFileSync("age", ["--version"], { stdio: "ignore" }); } catch { ageAda = false; }
    if (ageAda) {
      const kunci = path.join(dir, "kunci.txt");
      execFileSync("age-keygen", ["-o", kunci], { stdio: "ignore" });
      const pub = fs.readFileSync(kunci, "utf8").match(/public key: (age1[0-9a-z]+)/)[1];
      cek("recipient age cocok regex backup.yml", /^age1[0-9a-z]{58}$/.test(pub), pub);
      execFileSync("gzip", ["-9", "-k", j.berkas]);
      execFileSync("age", ["-r", pub, "-o", `${j.berkas}.gz.age`, `${j.berkas}.gz`]);
      const buka = execFileSync("sh", ["-c", `age -d -i "${kunci}" "${j.berkas}.gz.age" | gunzip`], { maxBuffer: 512 * 1024 * 1024 });
      const terenkripsi = fs.readFileSync(`${j.berkas}.gz.age`);
      cek("age: dekripsi = ekspor asli (sha256), berkas .age tidak memuat plaintext",
        crypto.createHash("sha256").update(buka).digest("hex") === j.sha256 && !terenkripsi.includes(Buffer.from("86b2a0001")));
    } else console.log("  (age tidak terpasang: uji enkripsi dilewati)");
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

try {
  await utama();
} catch (e) {
  cek("tanpa galat tak terduga", false, e.stack);
} finally {
  // (P2) kembalikan anggota space privat fixture ke himpunan ClickUp (buang anggota app uji)
  try {
    if (psql(`select count(*) from public.space_anggota where space_id = '${SPACE_PRIVAT}' and sumber = 'app'`) !== "0") {
      const ids = anggotaSpace().filter((x) => x.endsWith(":clickup")).map((x) => Number(x.split(":")[0]));
      await rpcWeb(cfg, await login(cfg), "web_admin_struktur_simpan", { p: { jenis: "space", id: SPACE_PRIVAT, anggota: ids } });
    }
  } catch (e) { console.log(`  (bersihkan anggota app gagal: ${e.message})`); }
  if (tok) {
    const n = await tok.bersihkan().catch((e) => { console.log(`  (bersihkan token gagal: ${e.message})`); return -1; });
    console.log(`\ntoken uji dibersihkan: ${n}`);
  }
  if (mock) await mock.tutup();
}
console.log(`\nLULUS ${hasil.lulus} · GAGAL ${hasil.gagal.length}`);
for (const g of hasil.gagal) console.log(`  - ${g}`);
process.exit(hasil.gagal.length ? 1 : 0);
