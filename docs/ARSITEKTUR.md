# Kontrak Arsitektur rhj-tugas (Fase 1)

Dokumen ini = pegangan WAJIB semua kode. Kalau kode dan dokumen ini berbeda, perbaiki salah satunya secara sadar (catat di `docs/STATUS.md`). Rincian pemetaan field ClickUp: `docs/riset/rancang-kompatibilitas.md` §2–§6 (dipakai kecuali disebut lain di sini). Keputusan Hannes (29 Sep): ACC semua rekomendasi `docs/RENCANA-FASE1.md` K1–K5; project Supabase BARU khusus aplikasi ini (bukan ERP).

## 0. Prinsip
- Project Supabase khusus → semua objek di schema `public`.
- UI Bahasa Indonesia; nama teknis tabel/kolom bahasa Inggris (peta 1:1 ke field ClickUp).
- Tidak ada secret di repo. Kunci publik (URL project + publishable/anon key) boleh di konfigurasi web (`NEXT_PUBLIC_*`).
- Semua tulis data lewat fungsi SQL `SECURITY DEFINER` (`set search_path = ''`, nama objek full-qualified). Tabel tidak punya policy INSERT/UPDATE/DELETE untuk `authenticated`/`anon`.
- Riwayat (`activity`) & notifikasi diisi TRIGGER, bukan klien.
- Waktu: simpan `timestamptz`; tanggal WIB = `Asia/Jakarta`. Keluaran API kompatibel ClickUp: string ms epoch.
- Sign-up publik mati (`enable_signup=false`). Akun dibuat owner.

## 1. ID
Sesuai riset §2.1:
- workspace/space/folder/list: `text`. Impor = ID ClickUp verbatim. Baru = `rs`/`rf`/`rl` + 8 base36.
- task: `text`. Impor = ID ClickUp (mis. `z8r3fdjvwd`). Baru = `rt` + 8 base36.
- comment: `text`. Impor = ID ClickUp. Baru = `rc` + 10 base36.
- member: `bigint`. Impor = ID user ClickUp. Baru = sequence mulai 900000000000.
- attachment: `text`. Impor = ID ClickUp. Baru = uuid text.
- Workspace tunggal: id `1100340000004525`, nama "Roda Hammerindo Workspace" (bisa ditimpa impor).
- Fungsi `public.id_baru(prefix text, len int)` membuat ID acak base36 (pakai `gen_random_bytes`).

## 2. Tabel (semua RLS ON)
Kolom minimal (boleh tambah kolom teknis):
- `workspace(id text pk, name text)`
- `members(id bigint pk, auth_user_id uuid unique null, username text unique not null, email citext unique null, clickup_email text, nama text, initials text, color text, role text check in ('owner','member','bot'), aktif bool default true, harus_ganti_password bool default false, created_at timestamptz)`
- `spaces(id, name, private bool, archived bool, orderindex int, sumber text default 'app', created_at)`
- `folders(id, space_id fk, name, hidden bool, archived bool, orderindex int, sumber)`
- `lists(id, space_id fk, folder_id fk null, name, archived bool, orderindex int, sumber, tidak_ditagih bool default false)`
- `list_statuses(list_id fk, status text, type text check in ('open','custom','done','closed'), orderindex int, color text, clickup_status_id text, pk(list_id,status))` — tiap list wajib ≥1 status `open` dan ≥1 `closed` (dicek fungsi admin; list baru otomatis diberi `to do`(open) / `in progress`(custom) / `complete`(closed)).
- `tasks(id text pk, clickup_id text unique null, list_id fk, parent_id text null, name text not null, markdown text, description_plain text, desc_unreadable bool default false, status text, status_type text, priority smallint null check 1..4, due_at timestamptz null, due_has_time bool default false, due_wib date null (trigger), start_at timestamptz null, start_has_time bool default false, creator_id bigint null, created_at, updated_at, closed_at, done_at, first_closed_at, reopen_count int default 0, archived bool default false, archived_at, deleted_at, deleted_by, orderindex numeric, last_comment_at, comment_count int default 0, extra jsonb default '{}', clickup_url text, sumber text default 'app' check in ('app','clickup'), synced_at, clickup_hash text, versi int default 1, cari tsvector)`
- `task_assignees(task_id, member_id, added_at, added_by, pk(task_id,member_id))`
- `comments(id text pk, task_id fk, parent_id text null (hanya ke komentar top-level), author_id bigint, text text, body_json jsonb, created_at, edited_at, deleted_at, clickup_id, sumber)`
- `comment_mentions(comment_id, member_id, pk)`
- `attachments(id text pk, task_id fk, comment_id null, title, extension, mimetype, size bigint, storage_path text null, clickup_url text null, status_salin text check in ('ok','gagal','tautan_saja'), uploaded_by bigint null, created_at, deleted_at)`
- `activity(id bigint identity pk, task_id text, at timestamptz default now(), at_awal timestamptz null (jendela sinkron), actor_id bigint null, sumber text check in ('ui','api','impor','sinkron','sistem'), token_id uuid null, jenis text, dari jsonb, ke jsonb, aktor_assignee bool null, snapshot jsonb null, lengkap bool default true, catatan text)` — append-only: REVOKE update/delete + trigger `BEFORE UPDATE OR DELETE` RAISE.
- `notifications(id bigint identity, member_id, task_id, comment_id null, jenis check in ('assign','mention','komentar'), actor_id, created_at, read_at)`
- `api_tokens(id uuid pk, member_id fk, nama text, prefix text, token_hash text unique (sha256 hex), scope text check in ('baca','tulis','impor'), created_at, last_used_at, revoked_at)`
- `hari_libur(tanggal date pk, nama text)`
- `app_settings(key text pk, value jsonb)` — `mode` = "cermin"|"utama" (default "cermin"), `app_base_url` = "https://tugas.palletmeshindonesia.com".
- `sync_runs(id bigint identity, mode text, started_at, finished_at, counts jsonb, census jsonb, diffs jsonb, errors jsonb)`
- `sync_raw(entity text, id text, fetched_at, hash text, payload jsonb, pk(entity,id))` — owner saja.
- `idem(key text pk, hasil jsonb, created_at)` — idempotensi POST.

## 3. Semantik
- **Due**: `due_at` = ms ClickUp verbatim. Trigger isi `due_wib = ((due_at at time zone 'UTC') + interval '7 hours')::date` (sama `wibDate`). Input `YYYY-MM-DD` dari API = ms jam 12:00 WIB, `due_has_time=false`. `null` = kartu parkir.
- **Status**: selesai = `status_type in ('closed','done')`. Pindah ke selesai → isi `closed_at`/`done_at` (+`first_closed_at` bila null). Buka ulang → kosongkan keduanya, `reopen_count+1`. `status_type` didenormalisasi trigger dari `list_statuses`.
- **updated_at**: trigger = now() saat field tugas berubah, KECUALI `app.sumber in ('impor','sinkron')` (nilai ClickUp dipertahankan). Komentar baru TIDAK menaikkan `updated_at` (sementara; dicek ulang dengan data asli di probe).
- **Prioritas**: 1 urgent, 2 high, 3 normal, 4 low. JSON: `{"id":"1","priority":"urgent","color":"#f50000","orderindex":"1"}` (2 high `#ffcc00`, 3 normal `#6fddff`, 4 low `#d8d8d8`).
- **Hari kerja**: `hari_kerja(a date, b date)` = jumlah d Senin–Jumat, a < d ≤ b, tidak di `hari_libur`. Negatif bila b < a (hitung mundur, tanda minus).
- **Mode cermin**: saat `app_settings.mode='cermin'`, baris `sumber='clickup'` (tasks/comments/attachments) hanya bisa diubah fungsi impor. Fungsi web/api menolak dengan pesan "Mode cermin: data ClickUp hanya-baca sampai cutover" (HTTP 409). Data `sumber='app'` bebas.
- **Aktor**: `public.aktor()` = `current_setting('app.actor_id', true)::bigint` bila di-set (hanya diset oleh fungsi SECURITY DEFINER), else member dari `auth.uid()`. `public.sumber_aktif()` = `current_setting('app.sumber', true)` default `'ui'`.
- **Hapus**: soft delete (`deleted_at/by`). Hanya `role='owner'`. Purge permanen hanya owner (fungsi `web_purge`). Bot tak pernah boleh hapus.
- **Notifikasi** (trigger, hanya sumber `ui`/`api`, tak ke aktor sendiri): di-assign → yang di-assign; @mention → yang disebut; komentar/balasan → assignee + pembuat + pengomentar sebelumnya di kartu itu.
- **Snapshot saat ditutup** (activity jenis `status` ke tipe selesai): `{komentar, balasan, lampiran, ada_url, komentar_terakhir:{user, date, teks200}}`.
- **Jenis activity**: `dibuat, status, buka_ulang, due, mulai, assignee_tambah, assignee_hapus, nama, deskripsi (dari/ke teks lama/baru), pindah_list, prioritas, arsip, pulih_arsip, hapus, pulih, komentar, komentar_edit, komentar_hapus, lampiran_tambah, lampiran_hapus, hilang_di_clickup, ditutup_impor`.

## 4. RLS & hak
- `is_member()` = ada `members` aktif role owner/member dengan `auth_user_id=auth.uid()`. `is_owner()`.
- SELECT untuk `authenticated` bila `is_member()`: semua tabel data. Kecuali `api_tokens` (owner, tanpa `token_hash` → pakai view/fungsi), `notifications` (milik sendiri), `sync_raw` (owner), `idem` (tak ada).
- `anon`: tidak ada grant apa pun.
- Fungsi `api_*`, `x_*`, `impor_*`: EXECUTE hanya `service_role` (REVOKE dari public/anon/authenticated). Parameter pertama `p_aktor bigint`; fungsi set `app.actor_id`, `app.sumber` ('api' / 'impor' / 'sinkron') via `set_config(..., true)`.
- Fungsi `web_*`: EXECUTE `authenticated`; cek `is_member()` (admin: `is_owner()`); sumber 'ui'.
- Storage bucket `lampiran` (private, 25 MB, mime allowlist: image/png, image/jpeg, image/webp, image/gif, application/pdf, docx, xlsx, text/csv, text/plain; SVG/HTML ditolak). Policy: member aktif boleh select & insert objek dengan path `t/<task_id>/...`.

## 5. Error
Fungsi SQL melempar `RAISE EXCEPTION USING ERRCODE = 'PT4xx', MESSAGE = '<pesan>', HINT = '<ECODE>'` (PostgREST memetakan `PTxyz` → HTTP xyz). Edge memetakan ke body ClickUp `{"err": pesan, "ECODE": hint}` + status sama. Kode: 400 input salah (`INPUT_001`), 401 token (`OAUTH_019`), 403 izin (`ACCESS_001`; hapus non-owner: `HAPUS_OWNER`), 404 tak ada (`ITEM_013`), 409 konflik/mode cermin (`KONFLIK_001` / `CERMIN_001`).

## 6. Fungsi API (service_role) — bentuk respons meniru ClickUp v2
Bentuk JSON (ringkas; lengkapi netral sesuai riset §4.4):
- **member json** `{id:int, username, email, color, initials, profilePicture:null}`
- **task json** `{id, custom_id:null, custom_item_id:0, name, text_content, description, [markdown_description bila p_md], status:{id, status, color, orderindex:int, type}, orderindex:"<num>", date_created:"ms", date_updated:"ms", date_closed:"ms"|null, date_done:"ms"|null, archived, creator:{id,username,color,email,profilePicture:null}, assignees:[member], group_assignees:[], watchers:[], checklists:[], tags:[], parent:null|"id", top_level_parent:null|"id", priority:null|{...}, due_date:"ms"|null, due_date_time:bool, start_date:"ms"|null, start_date_time:bool, points:null, time_estimate:null, custom_fields:[], dependencies:[], linked_tasks:[], locations:[], team_id:"1100340000004525", url:"<app_base_url>/t/<id>", sharing:{public:false}, permission_level:"create", list:{id,name,access:true}, project:{id,name,hidden,access:true}, folder:{id,name,hidden,access:true}, space:{id}}` + khusus `api_task`: `attachments:[{id, date:"ms", title, type:1, source:1, version:0, extension, thumbnail_small:null, thumbnail_large:null, is_folder:null, mimetype, hidden:false, parent_id:<task_id>, size:int, total_comments:0, resolved_comments:0, user:member, deleted:false, orientation:null, url:null, storage_path, clickup_url}]` (Edge mengganti `url` dengan signed URL 24 jam, lalu membuang `storage_path`/`clickup_url`). List yang folder-less: `folder:{id:"<list_id>-hidden", name:"hidden", hidden:true, access:true}`.
- **comment json** `{id, comment:[parts], comment_text, user:member, assignee:null, group_assignee:null, reactions:[], date:"ms", reply_count:<int>}` (balasan tanpa `reply_count`). `parts`: `{text}` atau `{type:"tag", user:{id,username,email,color,initials}}` untuk mention.

Daftar fungsi:
| Fungsi | Hasil |
|---|---|
| `api_token_cek(p_hash text)` | `{member_id, scope, token_id, role}` atau null; update `last_used_at` |
| `api_user(p_aktor)` | `{user: member}` |
| `api_team(p_aktor)` | `{teams:[{id, name, color:"#7b68ee", avatar:null, members:[{user: member+role}]}]}` (bot tidak masuk) |
| `api_spaces(p_aktor, p_archived bool)` | `{spaces:[{id,name,private,statuses:[],multiple_assignees:true,features:{},archived}]}` |
| `api_space_folders(p_aktor, p_space, p_archived)` | `{folders:[{id,name,orderindex,override_statuses:false,hidden,space:{id,name},task_count:"n",archived,statuses:[],lists:[list]}]}` |
| `api_space_lists(p_aktor, p_space, p_archived)` | `{lists:[list]}` (folder-less) |
| `api_folder_lists(p_aktor, p_folder, p_archived)` | `{lists:[list]}` — list json `{id,name,orderindex,content:"",status:null,priority:null,assignee:null,task_count:int,due_date:null,start_date:null,folder:{id,name,hidden,access:true},space:{id,name,access:true},archived,override_statuses:true,permission_level:"create"}` |
| `api_list(p_aktor, p_list)` | list json + `statuses:[{id,status,orderindex,color,type}]` |
| `api_list_tasks(p_aktor, p_list, p_page int, p_include_closed bool, p_subtasks bool, p_archived bool, p_md bool, p_date_updated_gt bigint)` | `{tasks:[task], last_page:bool}`; 100/halaman; urut `created_at desc, id` (tetapkan & uji); `include_closed=false` buang status_type closed/done; `subtasks=false` buang yang ber-parent; `archived` = filter persis; `deleted_at` selalu dibuang |
| `api_task(p_aktor, p_task, p_md bool)` | task json + attachments |
| `api_task_comments(p_aktor, p_task)` | `{comments:[comment]}` SEMUA top-level, terbaru dulu |
| `api_comment_replies(p_aktor, p_comment)` | `{comments:[comment]}` terlama dulu (sementara; uji dgn probe) |
| `api_create_task(p_aktor, p_list, p_body jsonb, p_idem text)` | task json. Body: `name, markdown_description, description, assignees[int], due_date(ms), due_date_time, start_date, priority, status, parent` |
| `api_update_task(p_aktor, p_task, p_body jsonb)` | task json. Body: `name, markdown_description, status, due_date(ms\|null), due_date_time, priority(int\|null), assignees:{add:[],rem:[]}, archived, parent` |
| `api_delete_task(p_aktor, p_task)` | `{}`; non-owner → PT403 `HAPUS_OWNER` |
| `api_create_comment(p_aktor, p_task, p_body jsonb, p_idem text)` | `{id, hist_id:id, date:ms int}`. Body `comment_text`, `notify_all` (diabaikan); mention `@username` persis di teks → comment_mentions |
| `api_create_reply(p_aktor, p_comment, p_body jsonb, p_idem text)` | sama |
| `api_move_task(p_aktor, p_task, p_list)` | task json; status dipetakan: nama sama → type sama → status open pertama |
| `x_activity(p_aktor, p_task)` | `[{at, jenis, dari, ke, aktor:{id,username}\|null, sumber, lengkap, catatan, snapshot}]` urut waktu |
| `x_search(p_aktor, p_q, p_space, p_include_closed)` | array task json ringkas (id,name,status,list,assignees,due_wib,url) — cocok nama/kode/isi/ID/URL ClickUp |
| `x_resolve(p_aktor, p_ref)` | `{type, id, url}` — terima ID, URL app, URL `app.clickup.com/t/<id>` |
| `x_tenggat(p_aktor, p_tanggal date)` | `{tanggal, h1_sampai, per_anggota:[{member, telat:[{id,name,due_wib,lewat_hari}], hari_ini:[], tiga_hk:[{..., sisa_hk}], h1:[]}], beban:[{member, due_wib, jumlah}] (jumlah>7)}` — cakupan & pengecualian B10 (riset `baca-pagar.md` §1): folder RHJ Eksekusi, kecuali list `tidak_ditagih`, nama berisi BERSYARAT/CADANGAN/DITUNDA → kategori `menunggu_keputusan`; Jumat → h1 = Sab–Sen |
| `x_sensus(p_aktor)` | per list: `{list_id, name, tasks_total, open, closed, archived, deleted, subtasks, comments_top, replies, reply_count_sum, attachments_task, attachments_comment, assignee_links, sha_ids_tasks, sha_ids_comments}` + total |
| `x_export(p_aktor)` | seluruh data (tanpa token_hash) sebagai jsonb, untuk backup |
| `impor_batch(p_aktor, p_jenis text, p_rows jsonb)` | upsert idempoten per jenis: `workspace, members, spaces, folders, lists, list_statuses, tasks, task_assignees, comments, attachments, sync_raw`; sumber `impor`/`sinkron` (param `p_mode`); hitung `{inserted, updated, unchanged}`; buat activity `dibuat` (aktor = creator, `lengkap=false`) & `ditutup_impor` sekali; bila perubahan terdeteksi saat sinkron → activity per field dgn `sumber='sinkron'`, `at_awal` = sinkron sebelumnya, `lengkap=false` |
| `impor_tandai_hilang(p_aktor, p_jenis, p_ids_ada text[])` | soft-delete baris `sumber='clickup'` yang tak ada lagi + activity `hilang_di_clickup` |
| `impor_run_mulai / impor_run_selesai` | kelola `sync_runs` |

## 7. Fungsi web (authenticated)
Baca boleh langsung `select` tabel lewat supabase-js (RLS), plus fungsi agregat:
`web_saya()`, `web_struktur()` (space→folder→list + status + hitungan), `web_tugas_saya(p_member bigint default aktor)`, `web_daftar(p_list, p_include_closed bool)`, `web_detail(p_task)` (task + assignees + komentar + balasan + mention + lampiran + activity + beban assignee pada due), `web_cari(p_q, p_space)`, `web_notif(p_limit)`, `web_notif_baca(p_ids bigint[])` (null = semua), `web_anggota()`, `web_tenggat()`.
Tulis: `web_buat_tugas(p_list, p_body)`, `web_ubah_tugas(p_task, p_body, p_versi int)` (409 bila versi beda), `web_urut(p_task, p_status, p_orderindex)`, `web_pindah(p_task, p_list)`, `web_arsip(p_task, p_arsip bool)`, `web_hapus(p_task)` (owner), `web_pulihkan(p_task)` (owner), `web_purge(p_task)` (owner), `web_komentar(p_task, p_teks, p_parent text, p_mentions bigint[])`, `web_komentar_edit(p_comment, p_teks)` (penulis), `web_komentar_hapus(p_comment)` (penulis/owner), `web_lampiran_catat(p_task, p_comment, p_path, p_title, p_mime, p_size)`, `web_lampiran_hapus(p_id)`, `web_sudah_ganti_password()`.
Admin (owner): `web_admin_anggota_simpan(p jsonb)`, `web_admin_status_simpan(p_list, p_statuses jsonb)`, `web_admin_struktur_simpan(p jsonb)` (buat/ubah space/folder/list), `web_admin_libur_simpan(p jsonb)`, `web_admin_mode(p_mode)`, `web_admin_token_buat(p_member, p_nama, p_scope)` → token mentah SEKALI (`rtk_` + 40 base62), `web_admin_token_cabut(p_id)`, `web_admin_tokens()`, `web_admin_sinkron()`.

## 8. Edge Function `api` (`supabase/functions/api/index.ts`, `verify_jwt = false`)
- Base publik: `https://<ref>.supabase.co/functions/v1/api` → route internal `/api/v2/...`, `/api/v3/...`, `/api/x/...`. (`TUGAS_API_URL` untuk CLI = `.../functions/v1/api/api/v2`? — TIDAK: fungsi menerima path `/api/<sisa>`; pastikan dengan tes lokal lalu tulis nilai final di STATUS.)
- Auth: header `Authorization: <token>` atau `Bearer <token>` → sha256 → `api_token_cek`. Scope `baca` = GET saja; `tulis` = + POST/PUT; `impor` = + `/x/impor/*`; DELETE hanya bila role owner.
- Tanpa kuota harian; batasi burst sederhana (mis. 20 req/detik per token) → 429 `{err:"Rate limit", ECODE:"APP_002"}`.
- Route = tabel riset §4.3 (tanpa `attachment` POST di Fase 1 boleh ditunda) + `/api/x/impor/batch`, `/api/x/impor/hilang`, `/api/x/impor/run`, `/api/x/impor/upload-url` (signed upload URL Storage), `/api/x/tenggat`, `/api/x/sensus`, `/api/x/export`.
- Admin akun (dipanggil UI dengan JWT user owner, header `x-sesi: <access_token>`): `POST /api/x/admin/akun` {member_id, email, password_sementara} → buat/ubah user Auth (admin API) + tautkan `members.auth_user_id` + `harus_ganti_password=true`. `POST /api/x/admin/reset` {member_id, password_sementara}. Verifikasi JWT via `auth.getUser`, wajib owner.
- DB: panggil RPC PostgREST dengan service role (env bawaan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Attachments: ganti `url` dengan signed URL 24 jam (`createSignedUrls`).
- CORS: hanya origin app (`app_base_url`) + localhost dev.

## 9. CLI `cli/tugas.mjs`
- Salin `rhj-brain/tools/clickup.mjs` (baca-saja dari `/home/user/rhj-brain/tools/clickup.mjs`). Dua mode: default ditentukan nama file (`tugas.mjs` → tugas; `clickup.mjs` → clickup), override `TUGAS_BACKEND=tugas|clickup`.
- Mode tugas: `BASE = process.env.TUGAS_API_URL` (fallback `tools/.env`), token `TUGAS_API_TOKEN`; throttle dimatikan; URL `move` = BASE v3; `audit-free` → pesan "tidak berlaku di aplikasi Tugas".
- Mode clickup: PERSIS seperti sekarang (tanpa perbaikan paginasi) supaya output routine tak berubah selama paralel.
- `brief()`, `getComments()`, agenda, parser argumen, `--dry-run`, `{deleted}`, pesan error: byte-identik dengan asal (pesan error mode tugas memakai prefix `tugas:`).
- Tambahan (mode tugas): `activity <id>`, `resolve <id|url>`, `search "<q>" [--space] [--closed]`, `verify`, `tenggat [--tanggal]`, `comment <id> --reply-to <comment_id>`.

## 10. Importer `impor/`
- `impor/sinkron.mjs --mode penuh|akhir|uji [--only list=<id>] [--dry-run]`. Klien ClickUp HANYA GET (guard keras: method selain GET → throw). Throttle ≤60 req/menit, tunggu-ulang 429.
- Urutan riset §6.1. Komentar dengan paginasi `start`+`start_id` sampai habis. Balasan per komentar `reply_count>0`.
- Tulis ke app lewat `POST /api/x/impor/*` dengan token scope `impor` (env `TUGAS_API_URL`, `TUGAS_IMPORT_TOKEN`, `CLICKUP_API_TOKEN`). Lampiran: unduh dari URL ClickUp → upload ke Storage via signed upload URL; gagal → `status_salin='gagal'` + simpan `clickup_url`.
- Sensus dihitung dari payload yang sama (tanpa panggil ClickUp lagi), dibandingkan `x_sensus` → tulis `sync_runs` + laporan `impor/laporan/<tanggal>.md` (JANGAN commit laporan berisi nama kartu; hanya angka per list boleh).
- Tes: server ClickUp tiruan `impor/uji/mock-clickup.mjs` + fixture sintetis (nama palsu).

## 11. Web `web/` (Next.js; keputusan Hannes 30 Sep)
- Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 + shadcn/ui, di-hosting Hostinger Business (Node.js Web Apps, output `standalone`). Rincian stack, struktur folder, dan cara deploy: `web/README.md`.
- Sesi Supabase di cookie (`@supabase/ssr`); `src/proxy.ts` menyegarkan sesi, mengalihkan tamu ke `/masuk?lanjut=<path>`, dan memasang CSP ber-nonce per permintaan (`script-src 'self' 'nonce-…' 'strict-dynamic'`). Header statis (noindex, no-referrer, nosniff, DENY frame) di `next.config.ts`; `robots.txt` Disallow: /.
- Routing path sama dengan web lama: `/`, `/saya`, `/jelajah`, `/l/<list>` (+`?v=board`), `/t/<id>`, `/cari`, `/notif`, `/admin/<tab>` (`/admin?tab=` lama dialihkan), `/sampah`, `/masuk`, `/ganti-password`.
- Semua data lewat `rpc(klien, "web_…")` bertipe (`src/types/database.ts` hasil `supabase gen types` + `src/types/domain.ts`) dengan sesi pengguna; tidak ada secret key di web. Admin akun/reset/purge lewat Edge `/x/admin/*` dengan JWT sesi.
- Markdown dirender markdown-it `html:false` + DOMPurify (satu-satunya HTML mentah). Service worker hanya cache aset statis `/_next/static`.
- Real-time: Supabase Realtime `postgres_changes` (publikasi `supabase_realtime`: tasks, task_assignees, comments, attachments, notifications, spaces, folders, lists, list_statuses; migrasi `20261001090000_realtime.sql`). Web berlangganan INSERT/UPDATE saja (RLS diperiksa per pelanggan; DELETE tidak). Perubahan orang lain ditahan selama pengguna mengedit/menyeret supaya cek versi tetap bekerja.
- Deploy: `.github/workflows/web.yml` (cek + e2e → `alat/hostinger.mjs deploy`: unggah sumber `web/` + `.env.production` publik lewat API Hostinger → build Node.js di Hostinger → tunggu `<meta name="rhj-versi">` = commit). Git hPanel tidak dipakai (terkunci untuk akun klien). Domain dikunci ke `tugas.palletmeshindonesia.com`; situs non-Node.js hanya ditimpa dengan centang manual.
- Mobile-first (lebar 360px, target sentuh ≥44px, input 16px di layar sentuh), Bahasa Indonesia, zona WIB.
- Web statis lama tetap di `web-lama/` sampai web baru lulus paritas tes; lalu dihapus.

## 12. Tes
- `uji/db/*.sql` (psql ke DB lokal `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), runner `uji/db/jalankan.sh`. Simulasi user: `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);`.
- `uji/kontrak/*.mjs`: jalankan CLI mode tugas terhadap `supabase functions serve` lokal.
- `uji/banding.mjs`: clickup.mjs (BASE diarahkan ke mock ClickUp) vs tugas.mjs (setelah impor fixture yang sama) → diff harus kosong kecuali normalisasi yang dicatat.
- `uji/web/*.spec` Playwright untuk `web-lama/` (chromium `/opt/pw-browsers`), viewport 390×844.
- `web/`: `npm run cek` (typecheck + lint + Vitest) dan `npm run uji:e2e` (Playwright `web/tests/e2e`, HP 390×844 + desktop).

## 13. Lingkungan lokal
- Supabase CLI: `/tmp/sbcli/node_modules/.bin/supabase` (atau `npx supabase`). Stack lokal: API `http://127.0.0.1:54321`, DB port 54322. Kunci lokal: `supabase status -o env`.
- Deno 2 terpasang (`deno`). Node 22.
- Migrasi: `supabase/migrations/<timestamp>_<nama>.sql`. Seed dev sintetis: `supabase/seed.sql` (nama palsu, BUKAN data RHJ).
