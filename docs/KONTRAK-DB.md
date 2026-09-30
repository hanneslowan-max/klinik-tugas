# Kontrak DB rhj-tugas: fungsi SQL API & web (A2)

Pegangan untuk agen Edge Function (`supabase/functions/api`), web (`web/`), dan importer (`impor/`). Turunan dari `docs/ARSITEKTUR.md` §3–§7; bila ada beda, bagian **Deviasi** di bawah yang berlaku sampai ARSITEKTUR diperbarui.

- Migrasi: `supabase/migrations/20260929110000_a2_*.sql` s.d. `…110500_a2_hak.sql` (setelah A1).
- Perbaikan review (R1–R5, 29 Sep) dan perbaikan poles (P1–P6, 29 Sep) diterapkan **di tempat** pada migrasi A1/A2 yang ada (belum ada produksi); tiap blok ditandai komentar `(review Rn)` / `(perbaikan Pn)`. Ringkasan di §9 dan §10.
- Tes: `uji/db/09_api_baca.sql` … `16_poles.sql` (+ pembantu `uji/db/_bantu_a2.sql`). Jalankan `supabase db reset` lalu `bash uji/db/jalankan.sh`. Suite juga lulus di DB bersama yang sudah berisi data uji area lain (hitungan dibatasi ke ID seed).
- Contoh JSON di dokumen ini diambil dari `supabase/seed.sql` (sintetis). Tanggal seed relatif terhadap hari reset, jadi angka ms berubah tiap reset.

## 1. Aturan umum

**Pemanggilan**
- Semua fungsi dipanggil lewat PostgREST `POST /rest/v1/rpc/<nama>` dengan body JSON berisi argumen bernama (`{"p_aktor":…, "p_task":…}`).
- Selalu pakai **POST**, termasuk untuk fungsi baca. `GET` RPC berjalan read-only, padahal `api_token_cek` mengisi `last_used_at` dan fungsi tulis butuh transaksi tulis.
- Fungsi `api_*`, `x_*`, `impor_*` hanya bisa dipanggil **service_role** (Edge memakai `SUPABASE_SERVICE_ROLE_KEY`).
- Fungsi `web_*` hanya bisa dipanggil **authenticated** (JWT sesi user). anon tidak punya hak apa pun.
- Pembantu internal (`mulai_api`, `j_task`, `inti_*`, `muat_*`, …) tidak bisa dipanggil role API mana pun.

**Aktor, token, dan scope (jalur API)**
- `p_aktor` = `member_id` hasil `api_token_cek`. Anggota wajib ada dan `aktif`. Selain itu galat `PT401 OAUTH_019`.
- Edge **sebaiknya** mengirim header `x-token-id: <token_id dari api_token_cek>` pada setiap RPC. Efeknya:
  - `activity.token_id` terisi (jejak token untuk verifikator).
  - DB ikut mengecek scope sebagai lapis kedua. Urutan scope: `baca` < `tulis` < `impor`.
  - Fungsi baca butuh `baca`. Fungsi tulis (`api_create/update/delete/move/…`, `x_admin_akun`) butuh `tulis`. `impor_*` dan `x_export` butuh `impor`.
  - Scope kurang → `PT403 ACCESS_001`. Token id tidak dikenal, dicabut, atau milik anggota lain → `PT401 OAUTH_019`.
- Tanpa header, scope tidak dicek di DB (Edge tetap wajib menegakkan §8 ARSITEKTUR).
- Aturan hapus berlaku di DB apa pun scope-nya: hanya **owner aktif** yang boleh hapus. Bot dan member ditolak `PT403 HAPUS_OWNER`.

**Galat**
- Bentuk: `RAISE … ERRCODE 'PTxyz', MESSAGE <pesan Indonesia>, HINT <ECODE>`.
- PostgREST menjawab HTTP `xyz` dengan body `{"code":"PTxyz","message":…,"hint":"<ECODE>","details":null}` (sudah dicek lewat HTTP lokal).
- Edge memetakan ke `{"err": message, "ECODE": hint}`.

| Kode | ECODE | Arti |
|---|---|---|
| PT400 | INPUT_001 | input salah (status/assignee tak dikenal, body tak valid, dll.) |
| PT401 | OAUTH_019 | aktor/token tidak sah, sesi web tidak ada |
| PT403 | ACCESS_001 / HAPUS_OWNER | izin/scope kurang; hapus/pulihkan/purge oleh non-owner |
| PT404 | ITEM_013 | tugas/list/komentar/… tidak ditemukan (termasuk tugas terhapus untuk jalur API) |
| PT409 | CERMIN_001 / KONFLIK_001 | mode cermin (data ClickUp hanya-baca) / versi basi, status masih dipakai, ID bentrok |

- Hak EXECUTE yang tidak ada → `42501` (HTTP 401 untuk anon, 403 untuk authenticated).

**Format**
- JSON gaya ClickUp (`api_*`): tanggal = **string ms epoch** (`"1790482864861"`), `id` anggota = angka, `orderindex` tugas = string, `status.orderindex` = angka.
- `x_*` dan `web_*`: tanggal ISO UTC `YYYY-MM-DDTHH:MM:SS.mmmZ`, tanggal WIB `YYYY-MM-DD`.
- Semua fungsi mengembalikan `jsonb`. Urutan kunci objek **tidak** dijamin sama dengan ClickUp (jsonb mengurutkan ulang), jadi `uji/banding.mjs` wajib membandingkan secara struktural.
- `url` tugas = `app_settings.app_base_url` + `/t/<id>`.

**Idempotensi**
- `p_idem` (opsional) pada `api_create_task`, `api_create_comment`, `api_create_reply`.
- Kunci disimpan per `<fungsi>:<p_aktor>:<p_idem>` selama 24 jam. Panggilan ulang dengan kunci sama mengembalikan hasil pertama tanpa menulis lagi.
- Edge meneruskan header idempotensi klien (mis. `x-rhj-idem`) ke `p_idem`.

**Privasi space (review R2)**
- Mengikuti setelan privat ClickUp (riset K8). Anggota melihat **semua** bila role `owner`/`bot` aktif, atau `app_settings.privasi_space = "abaikan"` (default `"tegakkan"`).
- Selain itu space `private=true` hanya terlihat oleh anggotanya (`space_anggota`). Kartu di space privat juga terlihat oleh **assignee** kartu itu (beserta komentar, lampiran, riwayatnya), tetapi space/list-nya tidak.
- Berlaku di semua jalur: RLS select langsung dan Storage (anggota sesi JWT; `app.actor_id` diabaikan bila ada JWT), `web_*` (anggota sesi), `api_*`/`x_*` (per `p_aktor`). Yang tertutup diperlakukan seperti tidak ada (`PT404`); daftar/pencarian/tenggat/sensus menyaringnya.
- `space_anggota(space_id, member_id, sumber 'clickup'|'app', added_at)`: `clickup` dikelola impor (jenis `space_anggota`, atau kunci `members` di baris `spaces`, §5), `app` diberi owner lewat `web_admin_struktur_simpan` (§6). Impor tidak pernah menghapus baris `app`.
- (P2) Importer mengirim anggota space privat lewat jenis `space_anggota`: gabungan `GET /list/{id}/member` semua list di space itu + owner/admin workspace (role 1/2 `/team`). ClickUp v2 tidak punya endpoint anggota space; asumsi ini wajib diprobe di data asli (`impor/README.md`). Bot routine tetap melihat semua.

**Activity & notifikasi**
- Selalu dibuat trigger A1, bukan fungsi A2.
- Sumber: `api` untuk `api_*`, `ui` untuk `web_*`, `impor`/`sinkron` untuk `impor_*`.
- Notifikasi hanya untuk `ui`/`api`.

## 2. Pembentuk JSON gaya ClickUp v2

**member json**
```json
{"id":100000001,"username":"budi santoso","email":"budi.uji@contoh.test","color":"#7b68ee","initials":"BS","profilePicture":null}
```
`email` = `clickup_email` bila ada, selain itu `email` login.

**task json**: 40 kunci tetap. Tambahan `markdown_description` bila `p_md`, dan `attachments` khusus `api_task`.
```json
{"id":"z8r3uj0005","custom_id":null,"custom_item_id":0,"name":"D2 · Uji rekap data mingguan",
 "text_content":"Rekap uji.","description":"Rekap uji.","markdown_description":"Rekap uji.",
 "status":{"id":"sc1100340000900101_9","status":"complete","color":"#6bc950","orderindex":9,"type":"closed"},
 "orderindex":"0","date_created":"1789618864861","date_updated":"1790482864861",
 "date_closed":"1790482864861","date_done":"1790482864861","archived":false,
 "creator":{"id":100000001,"username":"budi santoso","color":"#7b68ee","email":"budi.uji@contoh.test","profilePicture":null},
 "assignees":[{"id":100000002,"username":"citra lestari","email":"citra.uji@contoh.test","color":"#e5484d","initials":"CL","profilePicture":null}],
 "group_assignees":[],"watchers":[],"checklists":[],"tags":[],"parent":null,"top_level_parent":null,
 "priority":{"id":"3","priority":"normal","color":"#6fddff","orderindex":"3"},
 "due_date":"1790571600000","due_date_time":false,"start_date":null,"start_date_time":false,
 "points":null,"time_estimate":null,"custom_fields":[],"dependencies":[],"linked_tasks":[],"locations":[],
 "team_id":"1100340000004525","url":"https://tugas.palletmeshindonesia.com/t/z8r3uj0005",
 "sharing":{"public":false},"permission_level":"create",
 "list":{"id":"1100340000900101","name":"Fase Uji 1","access":true},
 "project":{"id":"1100340000900011","name":"Eksekusi Uji","hidden":false,"access":true},
 "folder":{"id":"1100340000900011","name":"Eksekusi Uji","hidden":false,"access":true},
 "space":{"id":"1100340000900001"},
 "attachments":[{"id":"cu-lampiran-uji-0001","date":"1790482864861","title":"rekap-uji.csv","type":1,"source":1,"version":0,
   "extension":"csv","thumbnail_small":null,"thumbnail_large":null,"is_folder":null,"mimetype":"text/csv","hidden":false,
   "parent_id":"z8r3uj0005","size":2048,"total_comments":0,"resolved_comments":0,"user":{…member json…},"deleted":false,
   "orientation":null,"url":null,"storage_path":null,"clickup_url":"https://contoh.test/lampiran/rekap-uji.csv"}]}
```

Rincian nilai:
- `text_content` dan `description` = `description_plain` (teks ClickUp) bila ada, selain itu markdown. Isinya `""` bila keduanya kosong.
- `markdown_description` = markdown. Nilainya `""` untuk kartu `desc_unreadable`, meniru ClickUp; CLI lalu mencetak "(isi deskripsi tak terbaca)".
- (P1, PR-1) `tags`, `checklists`, `custom_fields` kartu **impor** = isi payload ClickUp yang tersimpan di `tasks.extra`, verbatim (termasuk kunci bernilai null di item checklist). Tidak tersimpan (kosong; `custom_fields` tanpa satu pun nilai) → `[]`. Kartu **app** selalu `[]`.
- `status.id` = `clickup_status_id`. Untuk status buatan app: `sc<list_id>_<md5(status) 8 hex>`.
- `top_level_parent` = akar rantai induk. Bernilai `null` bila bukan sub-tugas.
- List tanpa folder memakai `folder` dan `project` semu `{"id":"<list_id>-hidden","name":"hidden","hidden":true,"access":true}`.
- `attachments` = semua lampiran tidak terhapus di tugas itu, **termasuk lampiran komentar**, urut `created_at`. Edge mengganti `url` dengan signed URL 24 jam lalu membuang `storage_path` dan `clickup_url`. Untuk `status_salin='tautan_saja'|'gagal'` (tanpa `storage_path`), Edge bisa memakai `clickup_url`.

**list json**
```json
{"id":"1100340000900101","name":"Fase Uji 1","orderindex":0,"content":"","status":null,"priority":null,"assignee":null,
 "task_count":9,"due_date":null,"start_date":null,
 "folder":{"id":"1100340000900011","name":"Eksekusi Uji","hidden":false,"access":true},
 "space":{"id":"1100340000900001","name":"Ruang Uji A","access":true},
 "archived":false,"override_statuses":true,"permission_level":"create"}
```
`task_count` = tugas tidak terhapus dan tidak diarsip, semua status.

**comment json**. Balasan tidak punya `reply_count`.
```json
{"id":"90180000000001","comment":[{"text":"Draf pertama sudah ada di https://contoh.test/draf-uji"}],
 "comment_text":"Draf pertama sudah ada di https://contoh.test/draf-uji","user":{…member json…},
 "assignee":null,"group_assignee":null,"reactions":[],"date":"1790482864861","resolved":false,"reply_count":1}
```
Part mention: `{"type":"tag","user":{"id":100000002,"username":"citra lestari","email":"citra.uji@contoh.test","color":"#e5484d","initials":"CL"}}`.

## 3. Fungsi API (service_role)

Semua mengembalikan `jsonb`.

| Signature | Hasil / aturan |
|---|---|
| `api_token_cek(p_hash text)` | `{"member_id":900000000002,"scope":"baca","token_id":"<uuid>","role":"bot"}` atau `null` (hash tak dikenal, token dicabut, anggota nonaktif, format bukan 64 hex). Mengisi `last_used_at`. Edge: `p_hash` = sha256 hex dari token mentah. |
| `api_user(p_aktor bigint)` | `{"user": member json}` |
| `api_team(p_aktor bigint)` | `{"teams":[{"id":"1100340000004525","name":…,"color":"#7b68ee","avatar":null,"members":[{"user":{…member json…,"role":1}}]}]}`. Hanya anggota aktif owner/member; bot tidak masuk. `role` 1 = owner, 3 = member. |
| `api_spaces(p_aktor bigint, p_archived boolean default false)` | `{"spaces":[{"id","name","private","statuses":[],"multiple_assignees":true,"features":{},"archived"}]}`. Filter `archived` persis. |
| `api_space_folders(p_aktor bigint, p_space text, p_archived boolean default false)` | `{"folders":[{"id","name","orderindex","override_statuses":false,"hidden","space":{"id","name"},"task_count":"3","archived","statuses":[],"lists":[list json]}]}`. Folder hidden ikut. `lists` berisi list tidak diarsip, kecuali bila `p_archived=true`. 404 bila space tak ada. |
| `api_space_lists(p_aktor bigint, p_space text, p_archived boolean default false)` | `{"lists":[list json]}`, hanya list tanpa folder. |
| `api_folder_lists(p_aktor bigint, p_folder text, p_archived boolean default false)` | `{"lists":[list json]}`. 404 bila folder tak ada. |
| `api_list(p_aktor bigint, p_list text)` | list json + `"statuses":[{"id","status","orderindex","color","type"}]`, urut `orderindex`. |
| `api_list_tasks(p_aktor bigint, p_list text, p_page integer default 0, p_include_closed boolean default false, p_subtasks boolean default false, p_archived boolean default false, p_md boolean default false, p_date_updated_gt bigint default null)` | `{"tasks":[task json],"last_page":true}`. Lihat catatan filter di bawah tabel. |
| `api_task(p_aktor bigint, p_task text, p_md boolean default false)` | task json + `attachments`. Tugas terhapus → 404. Tugas arsip tetap dikembalikan. |
| `api_task_comments(p_aktor bigint, p_task text)` | `{"comments":[comment json]}` berisi SEMUA komentar top-level tanpa batas 25, terbaru dulu (`created_at desc, id desc`). Komentar terhapus dibuang. |
| `api_comment_replies(p_aktor bigint, p_comment text)` | `{"comments":[comment json tanpa reply_count]}`, terlama dulu. Urutan ini sementara, dicek dengan probe ClickUp. |
| `api_create_task(p_aktor bigint, p_list text, p_body jsonb, p_idem text default null)` | task json (tanpa md). Lihat catatan body di bawah tabel. |
| `api_update_task(p_aktor bigint, p_task text, p_body jsonb)` | task json. Lihat catatan body di bawah tabel. |
| `api_delete_task(p_aktor bigint, p_task text)` | `{}`. Hapus lunak (Sampah): `deleted_at`, `deleted_by`, activity `hapus`. **Sub-tugas ikut ke Sampah** (review R3, §9). Non-owner → `PT403 HAPUS_OWNER`. Tak ada atau sudah terhapus → 404. Kartu ClickUp saat cermin → 409. |
| `api_create_comment(p_aktor bigint, p_task text, p_body jsonb, p_idem text default null)` | `{"id":"rcxuewt57hb5","hist_id":"rcxuewt57hb5","date":1790655676687}`. `date` berupa **angka**. Lihat catatan komentar di bawah tabel. |
| `api_create_reply(p_aktor bigint, p_comment text, p_body jsonb, p_idem text default null)` | Sama dengan `api_create_comment`. Bila `p_comment` sendiri balasan, balasan dipasang ke komentar top-level-nya. |
| `api_move_task(p_aktor bigint, p_task text, p_list text)` | task json. Lihat catatan pemetaan status di bawah tabel. |

**`api_list_tasks`: filter dan urutan**
- 100 tugas per halaman. `p_page` mulai 0.
- Urut `created_at desc, id asc` (stabil lintas halaman; sudah diuji dengan 205 tugas).
- Tugas terhapus selalu dibuang.
- `p_include_closed=false` membuang status bertipe `closed`/`done`.
- `p_subtasks=false` membuang tugas yang punya induk.
- `p_archived` = filter persis (`true` = hanya arsip).
- `p_date_updated_gt` = ms; syaratnya `updated_at` > nilai itu.
- `p_page` < 0 → 400. List tak ada → 404.

**`api_create_task`: body**
- Body persis `clickup.mjs create`: `{name, markdown_description?, assignees?[int], due_date?(ms), due_date_time?:false, priority?(1-4), status?}`.
- Kunci tambahan yang diterima: `description`, `start_date`, `start_date_time`, `parent`.
- `due_date` boleh berupa angka ms, string ms, ISO, atau `'YYYY-MM-DD'` (= 12:00 WIB, `due_has_time=false`).
- Status dicocokkan persis dulu, lalu tanpa beda huruf besar. Tanpa status → status open pertama.
- Galat 400 untuk: status tak dikenal (`Status "x" tidak ada di list <id>`), assignee tak dikenal atau bot/nonaktif (`Assignee tidak dikenal: <id>`), nama kosong, prioritas di luar 1–4, tanggal tak valid, induk di list lain, body bukan objek.
- List tak ada → 404.
- Tugas app di list ClickUp tetap boleh saat mode cermin.

**`api_update_task`: body**
- Hanya kunci yang ada di body yang diubah. Body persis `clickup.mjs update`: `{name, markdown_description, status, due_date|null, due_date_time, priority, assignees:{add:[],rem:[]}}`.
- Kunci tambahan: `archived`, `parent`, `start_date`, `start_date_time`, `description`.
- `due_date:null` = parkir. `priority:null` mengosongkan prioritas.
- Mengubah deskripsi menghapus `description_plain` dan `desc_unreadable`.
- Galat 400 untuk: status tak dikenal, `add` berisi anggota tak dikenal, induk melingkar.
- Tugas tak ada atau terhapus → 404. Kartu ClickUp saat cermin → `409 CERMIN_001`.
- Body kosong `{}` tidak mengubah apa pun (versi tetap).

**`api_create_comment`: body dan mention**
- Body `{comment_text, notify_all}`; `notify_all` diabaikan.
- Mention = `@username` **persis**: peka huruf besar, tidak boleh langsung diikuti huruf/angka/`_`. Hanya anggota aktif. Hasilnya masuk `comment_mentions` dan `body_json` (parts), lalu notifikasi mention dikirim oleh trigger.
- Teks kosong → 400. Tugas tak ada → 404. Kartu ClickUp saat cermin → 409.

**`api_move_task`: pemetaan status**
Status dipetakan per tugas, dan **sub-tugas ikut pindah**. Urutan pencocokan:
1. nama sama (tanpa beda huruf besar);
2. type sama (orderindex terkecil);
3. untuk closed/done: status closed/done mana pun;
4. status open pertama.

List sama → no-op. List tak ada → 404.

## 4. Fungsi /api/x (service_role)

| Signature | Hasil / aturan |
|---|---|
| `x_activity(p_aktor bigint, p_task text)` | Array urut `at, id`: `[{"id","at","at_awal","jenis","dari","ke","aktor":{"id","username"}\|null,"aktor_assignee","sumber","lengkap","catatan","snapshot"}]`. Tugas terhapus atau di-purge tetap bisa selama activity-nya ada. Tak ada sama sekali → 404. |
| `x_search(p_aktor bigint, p_q text, p_space text default null, p_include_closed boolean default false)` | Array maks 50: `[{"id","name","status","status_type","list":{"id","name"},"space_id","assignees":["username"],"due_wib","updated":"ISO","url"}]`. Lihat catatan di bawah tabel. |
| `x_resolve(p_aktor bigint, p_ref text)` | `{"type","id","url"}`. `type` ∈ `task` (url `/t/<id>`), `list` (`/l/<id>`), `folder`, `space`, `member` (url null), `comment` (`/t/<task>#c-<id>`), `attachment`. Tidak dikenali → 404. Lihat catatan di bawah tabel. |
| `x_tenggat(p_aktor bigint, p_tanggal date default null, p_folder text default null)` | TENGGAT B10 + beban B5. Rincian di §4.1. |
| `x_sensus(p_aktor bigint, p_sumber text default null)` | `{"dibuat","sumber","lists":[…],"total":{…}}`. Rincian di §4.2. |
| `x_export(p_aktor bigint)` | Seluruh data untuk backup. **Hanya owner/bot** (atau `privasi_space` "abaikan"); selain itu `PT403 ACCESS_001` (review R2). Rincian di bawah tabel. |
| `x_admin_akun(p_aktor bigint, p_member bigint, p_auth_user uuid, p_email text, p_harus_ganti boolean default true)` | **Tambahan** untuk Edge `/api/x/admin/akun` & `/reset`: menautkan `members.auth_user_id`, `email`, dan `harus_ganti_password`. Hasil `{"id","username","email","auth_user_id","harus_ganti_password"}`. Email/akun sudah dipakai anggota lain → `PT409 KONFLIK_001`. |

**`x_search`: pencocokan dan urutan**
- Cocok dengan ID atau `clickup_id`, URL (`app.clickup.com/t/<id>`, `/t/<team>/<id>`, `<app>/t/<id>`), kode di awal nama (`Y7`, `FX-PM`, `[Claude]`), `name ILIKE`, markdown/teks, atau full-text.
- (P6) URL wadah (bentuk yang sama dengan `x_resolve`: list/folder/space ClickUp termasuk tampilan `/v/l/6-<list>-1`, `/v/b/6-<list>-2`, atau `<app>/l/<id>`) yang ada dan terlihat aktor → kartu di wadah itu (tidak diarsip; selesai hanya dengan `p_include_closed`) berperingkat sama dengan ID persis.
- Urut: ID persis / isi wadah URL → kode awal → nama → isi, lalu `updated_at desc`.
- ID/URL persis selalu tampil walau kartunya selesai. Selain itu kartu selesai hanya tampil dengan `p_include_closed`.
- Tugas terhapus tidak tampil. Wildcard `%`/`_` di-escape. `q` kosong → 400.

**`x_resolve`: bentuk rujukan yang diterima**
- ID tugas, list, folder, space, komentar, lampiran, atau anggota.
- URL app `/t/<id>` dan `/l/<id>`.
- URL ClickUp: `/t/<id>`, `/t/<team>/<id>`, `/<team>/v/li/<list>`, `/v/f/<folder>`, `/v/s/<space>`.
- (P6) URL tampilan ClickUp: `/v/<kode>/<induk>-<id>-<n>` dengan induk `6` = list (`/v/l/6-<list>-1` List, `/v/b/6-<list>-2` Board), `5` = folder, `4` = space; `7` (workspace) → 404. Juga bentuk bersarang `/v/l/li/<list>`, `/v/o/f/<folder>`, `/v/o/s/<space>` dan `/v/l/<list>`. Query `?pr=…` dan fragmen dibuang. Tipe dari URL dihormati: `/v/f/<id list>` → 404. ID yang tidak ada / tertutup privasi → 404. Pola = asumsi dari URL umum ClickUp, dicek dengan URL asli saat probe.

**`x_export`: isi dan syarat**
- Kunci: `meta`, `workspace`, `members`, `spaces`, `space_anggota`, `folders`, `lists`, `list_statuses`, `tasks`, `task_assignees`, `comments`, `comment_mentions`, `attachments`, `activity`, `notifications`, `api_tokens`, `hari_libur`, `app_settings`, `sync_runs`, `sync_raw`.
- Yang dibuang: `token_hash`, tabel `idem`, dan kolom turunan `tasks.cari`.
- Butuh scope `impor` bila dipanggil dengan `x-token-id`.

**`x_admin_akun`: syarat**
- Hanya owner. Bot → 400. Anggota tak ada → 404.
- Edge membuat atau mengubah user Auth lebih dulu (admin API), lalu memanggil fungsi ini dengan `p_aktor` = member owner pemilik JWT.

### 4.1 x_tenggat

**Cakupan**
- List di folder cakupan: `app_settings.tenggat_folder_ids` (default `["1100340000026652"]` = RHJ Eksekusi; `[]` berarti semua folder). `p_folder` menimpa setelan ini.
- List tidak diarsip **efektif** (list, folder-nya, dan space-nya tidak diarsip; P5) dan `tidak_ditagih=false`.
- Tugas belum selesai, tidak diarsip, tidak dihapus, dan punya due.

**Kategori** (`p_tanggal` default hari ini WIB)
- `telat`: due < hari ini. `lewat_hari` dihitung dalam hari **kalender**. Urut paling lama dulu.
- `hari_ini`: due = hari ini.
- `tiga_hk`: due > hari ini dan `hari_kerja(hari ini, due) ≤ 3`. `sisa_hk` = jumlah hari kerja; hari libur ikut dikurangi. Dari Jumat, due Sabtu/Minggu → `sisa_hk` 0.
- `h1`: hari ini < due ≤ `h1_sampai`. `h1_sampai` = besok, atau Senin bila hari ini Jumat.
- `menunggu_keputusan`: nama memuat BERSYARAT, CADANGAN, atau DITUNDA (tanpa beda huruf besar; pembantu `menunggu_keputusan()` yang sama dengan web). Kartu ini tidak masuk kategori lain. `lewat_hari` null bila belum lewat due.
- Kartu yang tidak terlihat aktor (privasi space, R2) tidak ikut. Bot routine melihat semua.

**Aturan tambahan**
- Kartu bersama muncul di tiap assignee. Kartu tanpa assignee → entri `member:null`.
- Anggota tanpa isi di kategori mana pun tidak didaftar.
- `beban`: B5 dalam cakupan yang sama, due ≥ hari ini, **jumlah > 7** per (anggota, tanggal).
- Contoh (seed, folder Eksekusi Uji; dipotong):

```json
{"tanggal":"2026-09-29","h1_sampai":"2026-09-30","folder_ids":["1100340000900011"],
 "ringkas":{"telat":2,"hari_ini":2,"tiga_hk":5,"h1":2,"menunggu_keputusan":2},
 "per_anggota":[{"member":{"id":100000003,"username":"dodi pratama","nama":"Dodi Pratama (uji)"},
   "telat":[{"id":"z8r3uj0010","name":"C3 · Uji telat lama","status":"in progress","due_wib":"2026-09-21","lewat_hari":8,
             "list":{"id":"1100340000900101","name":"Fase Uji 1"},"komentar_terakhir":"2026-09-20T04:21:04.861Z",
             "url":"https://tugas.palletmeshindonesia.com/t/z8r3uj0010"}],
   "hari_ini":[…],"tiga_hk":[{…,"sisa_hk":1}],"h1":[…],"menunggu_keputusan":[{…,"lewat_hari":null}]}],
 "beban":[]}
```
`komentar_terakhir` = waktu komentar atau balasan terakhir (ISO), atau null.

### 4.2 x_sensus

Satu objek per list:
```json
{"list_id":"1100340000900101","name":"Fase Uji 1","space_id":"1100340000900001","folder_id":"1100340000900011","archived_list":false,
 "tasks_total":10,"open":8,"closed":2,"archived":1,"deleted":0,"subtasks":1,"comments_top":4,"replies":1,"reply_count_sum":1,
 "attachments_task":1,"attachments_comment":1,"assignee_links":11,
 "sha_ids_tasks":"<sha256 hex dari 'id1,id2,…' terurut>","sha_ids_comments":"<idem untuk komentar+balasan>"}
```

Definisi kolom:
- `tasks_total` = tugas tidak terhapus (termasuk arsip, selesai, dan sub-tugas). `deleted` dihitung terpisah.
- Komentar dan lampiran hanya dari tugas yang tidak terhapus, dan hanya yang tidak terhapus.
- `total` = jumlah semua kolom + sha semua ID.
- `p_sumber='clickup'` hanya menghitung baris asal ClickUp; dipakai untuk bukti hitungan impor. `'app'` hanya baris buatan app. Nilai lain → 400.
- List di space privat yang tidak terlihat aktor tidak ikut (termasuk di `total`). Pakai token bot untuk bukti hitungan impor.

## 5. Fungsi impor (service_role, scope `impor`)

**`impor_batch(p_aktor bigint, p_jenis text, p_rows jsonb, p_mode text default 'impor', p_at_awal timestamptz default null)`**
- Hasil: `{"jenis","mode","inserted","updated","unchanged","gagal":[{"id","err"}]}`. `tasks`/`comments` menambah `tertunda:[{"id","parent_id"}]`. `list_statuses` menambah `dihapus` dan `dipertahankan`. `task_assignees` menambah `dihapus`. `space_anggota` menambah `ditambah`, `dibuang`, `dilewati`.
- `p_mode`:
  - `impor` = muat awal. Assignee bukan kejadian, jadi tidak dicatat.
  - `sinkron` = sinkron berikutnya. Perubahan dicatat per field dengan `sumber='sinkron'`, `lengkap=false`, aktor null.
- `p_at_awal` = `started_at` sinkron sebelumnya (dari `impor_run_mulai().at_awal`), masuk ke `activity.at_awal`. Bila null, dipakai `synced_at` lama baris itu (diperbarui tiap sinkron, termasuk untuk baris unchanged).
- **Per baris**: galat satu baris masuk `gagal` dan baris lain tetap diproses. Importer WAJIB membaca `gagal` dan `tertunda`.
- **Tidak menyentuh data buatan app (review R1)**: impor hanya menulis baris `sumber='clickup'` dan tidak menempel ke data app. Ditolak per baris (`gagal`, `PT409 KONFLIK_001`): status list app, assignee/mention/komentar/lampiran di tugas atau komentar app, kartu ClickUp di list app atau di bawah induk app, folder/list ClickUp di space/folder app, anggota ber-id rentang app (≥ 900000000000). Berlaku juga saat mode cermin.
- **Idempoten**:
  - `tasks` dan `comments` dibandingkan lewat hash sha256 baris ternormalisasi (`clickup_hash`). Hash `tasks` termasuk assignee.
  - Jenis lain dibandingkan nilainya langsung.
  - Baris sama → `unchanged`: hanya `synced_at` yang diperbarui, tanpa activity. Impor ulang batch yang sama menghasilkan 0 activity baru (diuji).
- **Activity sintetis**:
  - INSERT tugas → `dibuat` (aktor = creator, `at` = date_created, `lengkap=false`).
  - INSERT tugas yang sudah selesai → tambah `ditutup_impor` (aktor null, `at` = date_closed).
  - Tidak ada transisi karangan: parent yang tertunda tidak menghasilkan activity `induk`.
- Urutan jenis: `workspace → members → spaces → folders → lists → space_anggota → list_statuses → tasks → task_assignees → comments → comment_mentions → attachments → sync_raw`.

Format baris per `p_jenis`. Kolom tabel atau payload ClickUp mentah sama-sama diterima.

| Jenis | Baris |
|---|---|
| `workspace` | `{id, name}` |
| `members` | Objek member ClickUp `{"user":{id, username, email, color, initials}}` atau `{id, username, email, …}`. Rincian di bawah tabel. |
| `spaces` | `{id, name, private, archived, orderindex, color}` |
| `space_anggota` | (P2) `{space_id \| space:{id}, member_ids:[…]}` atau `members:[{user:{id}} \| {id} \| id]`. Himpunan penuh sumber `clickup` per space. Rincian di bawah tabel. |
| `folders` | `{id, space_id \| space:{id}, name, hidden, archived, orderindex}` |
| `lists` | `{id, space_id \| space:{id}, folder_id (null = tanpa folder) \| folder:{id}, name, content, archived, orderindex}`. Rincian di bawah tabel. |
| `list_statuses` | `{list_id, status, type, orderindex, color, clickup_status_id \| id}` atau `{list_id, statuses:[…]}`. Rincian di bawah tabel. |
| `tasks` | Payload task ClickUp **lengkap** (`list:{id}`, `parent`, `status:{status}`, …) atau kolom tabel. Rincian di bawah tabel. |
| `task_assignees` | `{task_id, member_ids:[…]}` atau `{task_id, member_id}`. Himpunan penuh per tugas (yang tidak dikirim dihapus). Lebih praktis lewat `assignees` di baris `tasks`. |
| `comments` | `{id, task_id, parent_id (balasan), comment_text \| text, comment \| body_json (parts), user:{id} \| author_id, date \| created_at}`. Rincian di bawah tabel. |
| `comment_mentions` | `{comment_id, member_ids:[…]}`. Himpunan penuh. Biasanya tidak perlu karena diturunkan dari parts. |
| `attachments` | Objek lampiran ClickUp (`parent_id` = task, `url`, `date`, `user:{id}`) + `task_id`, `comment_id` bila di komentar, `storage_path`, `status_salin`. Rincian di bawah tabel. |
| `sync_raw` | `{entity, id, payload, hash?, fetched_at?}`. Tanpa `hash` → sha256 payload. |

**`members`**
- `username` verbatim. Bila null, dipakai email, lalu `user <id>`.
- `email` ClickUp → `clickup_email`, bukan email login.
- Insert: `role` **selalu** `member` (kunci `role` di baris diabaikan, review R1). `aktif` diambil dari baris (default true); kirim `aktif:false` untuk user yang muncul di payload tapi sudah tidak di tim.
- Update tidak menyentuh `role`, `aktif`, email login, maupun `auth_user_id`.
- Anggota ber-role `owner`/`bot` **tidak disentuh sama sekali**: dihitung `unchanged` dan dilaporkan di kunci hasil `dilindungi:[id]` (bukan `gagal`, supaya sinkron rutin tidak berkode 2).
- ID ≥ 900000000000 (rentang anggota buatan app) → `gagal` `PT409`.
- Username bentrok dengan anggota lain → `gagal`.

**`spaces`** (review R2)
- Kunci opsional `members` (payload ClickUp `[{user:{id}}]`, atau `[{id}]`/`[id]`) → `space_anggota` sumber `clickup`, himpunan penuh per space. ID yang belum diimpor dilewati. Baris sumber `app` (dari owner) tidak disentuh. Tanpa kunci `members` = anggota tidak disentuh.
- Perubahan anggota saja dihitung `updated`.

**`space_anggota`** (perbaikan P2)
- Baris = himpunan penuh anggota **sumber `clickup`** satu space. Anggota `clickup` yang tidak dikirim dihapus; baris sumber `app` (ditambah owner di Admin) **tidak pernah** dihapus atau diubah. `member_ids: []` = kosongkan anggota `clickup`.
- Space wajib sudah diimpor dan bersumber `clickup` (space belum ada → `gagal` 404; space app → `gagal` PT409). `member_ids`/`members` bukan array → `gagal` PT400.
- ID yang belum diimpor sebagai anggota, atau di rentang app (≥ 900000000000), dilewati dan dilaporkan di `dilewati:[{space_id, ids:[…]}]`.
- Hasil per space: `inserted` (space belum punya anggota `clickup` lalu mendapat ≥1), `updated` (himpunan berubah), `unchanged` (sama; idempoten). Tambahan kunci hasil: `ditambah`, `dibuang` (jumlah baris), `dilewati`.
- Importer menurunkan himpunan untuk space `private=true` saja: gabungan `GET /list/{id}/member` semua list (aktif + arsip) di space itu + anggota `/team` ber-role 1/2 (owner/admin ClickUp; di app mereka `member`, R1). Satu list gagal dibaca → space itu tidak dikirim (anggota lama tidak disentuh) + galat baca.

**`folders` / `lists`**
- Space (dan folder untuk list) wajib sudah diimpor dan bersumber `clickup` (R1).
- `tidak_ditagih` tidak disentuh, kecuali dikirim eksplisit.
- List ClickUp tidak diberi status default.

**`list_statuses`**
- Hanya list ClickUp. List app → `gagal` per baris tanpa perubahan apa pun (R1); list belum diimpor → `gagal` 404.
- Himpunan per list: status yang tidak dikirim dihapus bila tidak dipakai tugas; yang masih dipakai masuk `dipertahankan`.
- Ganti nama dideteksi lewat `clickup_status_id` yang sama. Tugas ikut berganti nama tanpa activity.

**`tasks`**
- Payload dianggap LENGKAP: kunci yang tidak ada dianggap null. Pengecualian: `assignees` yang tidak ada = assignee tidak disentuh, dan `status` yang tidak ada = status tetap.
- Tanggal diterima sebagai ms, string ms, atau ISO dan disimpan verbatim.
- `tags`/`checklists`/`custom_fields` yang berisi → `extra`, **verbatim** (kunci bernilai null di dalamnya dipertahankan, P1). `custom_fields` hanya disimpan bila ≥1 field punya nilai. Isi ini yang disajikan task json (§2).
- `markdown_description` kosong tetapi `text_content` berisi → `desc_unreadable=true` dan markdown = teks polos.
- Induk: induk di batch yang sama diproses lebih dulu. Induk yang belum ada di DB → baris **tertunda**. Kirim ulang setelah induk masuk. Bila induk memang hilang, kirim dengan `parent:null`.
- Anggota (creator/assignee) atau list yang belum diimpor → `gagal`. Assignee kartu ClickUp wajib anggota impor (id < 900000000000) dan bukan bot; eks-anggota nonaktif tetap sah (R1).
- List tujuan dan induk wajib bersumber `clickup` (R1).
- Baris yang dihapus sinkron lalu muncul lagi → dipulihkan (activity `pulih`). Sub-tugas **buatan app** di bawah kartu ClickUp ikut hilang/pulih bersama induknya (R3); sub-tugas ClickUp mengikuti data ClickUp sendiri.

**`task_assignees`** / **`comment_mentions`**
- Hanya kartu/komentar ClickUp; tugas/komentar app → `gagal` (R1). Anggota assignee divalidasi seperti `tasks`.

**`comments`**
- Hanya di kartu ClickUp dan (untuk balasan) di bawah komentar ClickUp (R1).
- Top-level diproses sebelum balasan. Balasan yang induknya belum ada → tertunda.
- Mention diturunkan dari parts `{type:"tag", user:{id}}` sebagai himpunan penuh.
- Penghitung `comment_count` dan `last_comment_at` di tugas diperbarui trigger.
- Tanpa activity `komentar` dan tanpa notifikasi. Teks berubah saat sinkron → `komentar_edit`.

**`attachments`**
- Hanya di kartu/komentar ClickUp (R1); tugas belum diimpor → `gagal` 404.
- Tanpa `storage_path` → `status_salin='tautan_saja'` (atau nilai lama). `url` payload → `clickup_url` (lampiran tautan_saja tetap bisa dibuka lewat URL ClickUp).
- (P3) Importer menyalin berkas hanya bila MIME ada di allowlist bucket (`MIME_IZIN` di `impor/sinkron.mjs` = `allowed_mime_types` bucket, diuji), ≤ 25 MB, dan ada URL; selain itu `tautan_saja` dan alasannya dicatat di laporan run (`lampiran_tautan`).
- Setelah file disalin, kirim ulang dengan `storage_path` = `t/<task_id>/<nama>` dan `status_salin:'ok'`. Unggah via signed upload URL dari Edge.

**`impor_tandai_hilang(p_aktor bigint, p_jenis text, p_ids_ada text[], p_mode text default 'sinkron', p_lingkup jsonb default null)`**
- `p_jenis` ∈ `tasks|comments|attachments`.
- Baris `sumber='clickup'` yang tidak ada di `p_ids_ada` di-soft-delete. Activity oleh trigger: `hilang_di_clickup`, `komentar_hapus` (catatan "hilang di ClickUp"), atau `lampiran_hapus`.
- `p_lingkup` `{"list_ids":[…]}` / `{"task_ids":[…]}` / `{"space_ids":[…]}` **wajib** dipakai saat sinkron sebagian (`--only list=`).
- `p_ids_ada` kosong tanpa lingkup → 400 (pengaman supaya tidak menandai semua data).
- Hasil: `{"jenis","ditandai","ids":[…]}`.

**Run sinkron**
- `impor_run_mulai(p_aktor bigint, p_mode text)`: `p_mode` ∈ `penuh|akhir|uji`. Hasil `{"id","mode","started_at","at_awal"}`; `at_awal` = `started_at` run selesai terakhir.
- `impor_run_selesai(p_aktor bigint, p_id bigint, p_counts jsonb default null, p_census jsonb default null, p_diffs jsonb default null, p_errors jsonb default null)`: hasil = baris run. Run tak ada → 404.

## 6. Fungsi web (authenticated)

Semua memanggil `mulai_web()`: wajib anggota aktif (`PT403 ACCESS_001` bila bukan), sumber `ui`, aktor = anggota sesi. Fungsi admin wajib owner (`PT403 ACCESS_001`). Tulis ke kartu ClickUp saat mode cermin → `409 CERMIN_001` (trigger). Tugas/list/space yang tertutup privasi (R2) → 404 seperti tidak ada.

**Baris web** (`j_baris`) dipakai berbagai daftar:
```json
{"id","name","status","status_type","status_color","selesai","list":{"id","name","tidak_ditagih"},"space_id","folder_id",
 "parent_id","assignees":[{"id","username","nama","initials","color"}],"due_wib","due_at","due_has_time","start_at","priority",
 "comment_count","last_comment_at","created_at","updated_at","closed_at","archived","deleted_at","sumber","versi","orderindex",
 "menunggu_keputusan","kategori_due","url"}
```
`kategori_due` (review R5) = sumber tunggal kategori due pagar B10 untuk UI: `null` (selesai) · `tidak_ditagih` (list tidak ditagih) · `menunggu_keputusan` (nama BERSYARAT/CADANGAN/DITUNDA) · `tanpa_due` · `telat` · `hari_ini` · `tiga_hk` · `nanti`. Urutan pengecualian sama dengan `x_tenggat`: list tidak ditagih dulu, lalu menunggu keputusan. Kartu `tidak_ditagih`/`menunggu_keputusan` **tidak pernah** berkategori `telat`.

**Baca**

| Signature | Hasil |
|---|---|
| `web_saya()` | `{"member":{id,username,nama,email,initials,color,role,aktif,harus_ganti_password}\|null,"anggota_aktif","owner","mode","app_base_url","hari_ini","notif_belum"}`. Non-anggota **tidak** error (`member:null`). |
| `web_struktur()` | `{"hari_ini","spaces":[{id,name,private,archived,sumber,orderindex,anggota:[member_id],"folders":[{id,name,hidden,archived,sumber,orderindex,"lists":[L]}],"lists":[L tanpa folder]}]}`. `L` = `{id,name,archived,tidak_ditagih,sumber,orderindex,folder_id,"statuses":[{status,type,color,orderindex}],"hitungan":{terbuka,selesai,telat,menunggu,arsip}}`. `telat` tanpa kartu menunggu keputusan dan selalu 0 untuk list tidak ditagih; `menunggu` = kartu terbuka BERSYARAT/CADANGAN/DITUNDA (R5). Termasuk yang diarsip. Hanya space yang terlihat (R2). |
| `web_tugas_saya(p_member bigint default null)` | `{"member","tanggal","telat":[baris+lewat_hari],"hari_ini":[…],"tiga_hk":[baris+sisa_hk],"nanti":[…],"tanpa_due":[…],"menunggu_keputusan":[baris+lewat_hari],"tidak_ditagih":[baris+lewat_hari]}`. Kartu terbuka milik anggota (default diri sendiri), tidak diarsip/dihapus, dan tidak berada di list/folder/space yang diarsip (P5; sama untuk `x_tenggat`/`web_tenggat` dan beban B5). Grup = `kategori_due`; di dua grup terakhir `lewat_hari` hanya diisi bila due sudah lewat (info), selain itu null (R5). Hanya kartu yang terlihat oleh **pemanggil** (R2). |
| `web_daftar(p_list text, p_include_closed boolean default false)` | `{"list":{id,name,space_id,folder_id,archived,tidak_ditagih,sumber,boleh_ubah,statuses},"tasks":[baris]}`. Tanpa terhapus dan arsip. Urut status → orderindex → terbaru. |
| `web_detail(p_task text)` | Satu panggilan untuk layar detail. Rincian di bawah tabel. |
| `web_cari(p_q text, p_space text default null)` | `{"hasil":[baris],"rujukan":{type,id,url}\|null}`, maks 50, termasuk kartu selesai. Pencocokan sama dengan `x_search`. (P6) `rujukan` terisi bila `q` = URL list/folder/space (bentuk §4 `x_resolve`) yang ada dan terlihat; `url` list = `<app>/l/<id>`, folder/space `null`. Layar Cari bisa langsung membuka wadahnya. |
| `web_notif(p_limit integer default 50)` | `{"belum":6,"items":[{id,jenis,created_at,read_at,comment_id,"task":{id,name,deleted},"actor":{id,username,initials,color},"cuplikan":"120 huruf"}]}`, milik sendiri saja, terbaru dulu, maks 500. Kartu yang tertutup privasi: `task` = `{id,name:"(kartu di space privat)",deleted,tertutup:true}` dan `cuplikan` null (R2). |
| `web_notif_baca(p_ids bigint[] default null)` | `{"dibaca":n}`. `null` = semua milik sendiri. |
| `web_anggota()` | `[{id,username,nama,email,clickup_email,initials,color,role,aktif,punya_akun,harus_ganti_password,impor_clickup}]` |
| `web_tenggat(p_tanggal date default null)` | Sama dengan `x_tenggat` (cakupan dari `app_settings`). |

**`web_detail`: isi**
- `task` = baris + `markdown`, `description_plain`, `desc_unreadable`, `start_has_time`, `first_closed_at`, `done_at`, `reopen_count`, `archived_at`, `clickup_url`, `clickup_id`, `synced_at`, `extra`, `creator`, `deleted_by`, `space`, `folder`, dan `statuses` list.
- `parent` = `{id,name,status,deleted,archived}` atau null (juga null bila induk tertutup privasi).
- `subtasks` = daftar baris (tidak terhapus, terlihat aktor).
- `assignees` = `[{id,username,nama,initials,color,aktif,added_at,beban,beban_lebih}]`. `beban` = B5 pada due tugas; `beban_lebih` true bila > 7.
- `komentar` = `[{id,task_id,parent_id,sumber,author,text,body_json,created_at,edited_at,dihapus,deleted_at,mentions:[id],lampiran:[L],balasan:[…]}]`, terlama dulu. Komentar/balasan terhapus tampil dengan `dihapus:true` dan `text`/`body_json` null. Komentar top-level yang terhapus hanya ditampilkan bila masih punya balasan yang tidak terhapus.
- `lampiran` = semua lampiran tugas (termasuk lampiran komentar) `[{id,task_id,comment_id,title,extension,mimetype,size,storage_path,clickup_url,status_salin,sumber,uploaded_by,created_at,deleted_at}]`.
- `activity` = sama dengan `x_activity`.
- `peringatan` = `{due_akhir_pekan, due_libur, beban_lebih:[username]}`.
- `boleh` = `{ubah, hapus (owner), cermin}`.
- Tugas di Sampah tetap bisa dibuka.

**Tulis**

| Signature | Aturan |
|---|---|
| `web_buat_tugas(p_list text, p_body jsonb)` | Body = kunci ClickUp (§3) atau alias web: `markdown`, `due:'YYYY-MM-DD'\|null`, `parent_id`, `assignees:[id]`. Hasil = baris. |
| `web_ubah_tugas(p_task text, p_body jsonb, p_versi integer)` | `p_versi` wajib; bila ≠ `tasks.versi` → `PT409 KONFLIK_001` "Tugas sudah diubah orang lain… Muat ulang." Body seperti `api_update_task` + alias web. `assignees:[…]` (array) = himpunan penuh; `{add,rem}` juga boleh. Hasil = baris (dengan `versi` baru). Perubahan assignee ikut menaikkan versi. |
| `web_urut(p_task text, p_status text default null, p_orderindex numeric default null)` | Board: status (null = tetap) dan/atau `orderindex`. Mengubah orderindex tidak menaikkan versi. |
| `web_pindah(p_task text, p_list text)` | Sama dengan `api_move_task`. Hasil = baris. |
| `web_arsip(p_task text, p_arsip boolean)` | Hasil = baris. Sub-tugas ikut diarsip / dibuka arsipnya (R3). Buka arsip sub-tugas saat induknya masih diarsip → `PT409 KONFLIK_001`. |
| `web_hapus(p_task text)` | Owner saja (`PT403 HAPUS_OWNER`). Tugas masuk Sampah **bersama sub-tugasnya** (R3). Hasil = baris. |
| `web_pulihkan(p_task text)` | Owner saja. Tugas harus di Sampah (404 bila tidak). Sub-tugas yang ikut terhapus bersamanya ikut pulih; sub-tugas yang dihapus sendiri sebelumnya tetap di Sampah. Memulihkan sub-tugas saat induknya masih di Sampah → `PT409 KONFLIK_001` (R3). |
| `web_purge(p_task text)` | Owner saja. Tugas harus sudah di Sampah (400 bila belum). Menghapus permanen tugas + sub-tugas (komentar, lampiran, dan assignee ikut cascade; activity tetap). Ditolak `PT409 KONFLIK_001` bila masih ada turunan yang **aktif** (R3). Hasil `{"purged":[ids],"storage_paths":[…]}`. |
| `web_komentar(p_task text, p_teks text, p_parent text default null, p_mentions bigint[] default null)` | `p_mentions` dari autocomplete; bila null, mention dideteksi dari `@username` persis. Balasan ke balasan dipasang ke top-level. Hasil = komentar web (tanpa `balasan`). |
| `web_komentar_edit(p_comment text, p_teks text)` | Penulis saja (`PT403 ACCESS_001`). Mention baru ikut dicatat dan mendapat notifikasi. |
| `web_komentar_hapus(p_comment text)` | Penulis atau owner. Hasil = komentar web dengan `dihapus:true`. |
| `web_lampiran_catat(p_task text, p_comment text, p_path text, p_title text, p_mime text, p_size bigint)` | Rincian di bawah tabel. |
| `web_lampiran_hapus(p_id text)` | Pengunggah atau owner (`PT403 ACCESS_001`). Hapus lunak. |
| `web_sudah_ganti_password()` | `{"harus_ganti_password":false}` |

**`web_purge`: objek Storage**
Objek Storage **tidak** terhapus dari SQL karena trigger `storage.protect_objects_delete`. Klien/Edge wajib menghapus `storage_paths` lewat Storage API. Member tidak punya policy delete, jadi pekerjaan ini milik Edge dengan service role.

**`web_lampiran_catat`: alur dan syarat**
- Alur: unggah berkas ke bucket `lampiran` di path `t/<task_id>/<nama>` (policy A1), lalu panggil fungsi ini.
- Syarat:
  - Objek harus sudah ada di `storage.objects`.
  - MIME dan ukuran diambil dari metadata objek; `p_mime`/`p_size` hanya cadangan.
  - MIME harus ada di allowlist bucket dan ukuran ≤ 25 MB. Allowlist (P3): png, jpeg, webp, gif, heic, heif, pdf, docx, doc, xlsx, xls (`application/vnd.ms-excel`, juga CSV dari Windows), pptx, csv, tsv, txt. SVG/HTML/zip ditolak.
  - Path harus `t/<p_task>/…`.
  - `p_comment` (boleh null) harus komentar di tugas itu.
- Idempoten per path. Hasil = lampiran web.

**Admin (owner)**

| Signature | Aturan |
|---|---|
| `web_admin_anggota_simpan(p jsonb)` | Rincian di bawah tabel. |
| `web_admin_status_simpan(p_list text, p_statuses jsonb)` | Rincian di bawah tabel. |
| `web_admin_struktur_simpan(p jsonb)` | `{jenis:'space'\|'folder'\|'list', id?, name, space_id, folder_id, private, hidden, archived, orderindex, tidak_ditagih, content, anggota}`. Rincian di bawah tabel. |
| `web_admin_libur_simpan(p jsonb)` | `{tanggal, nama}`, `{tanggal, hapus:true}`, atau array-nya. Hasil = semua hari libur `[{tanggal,nama}]`. Langsung memengaruhi `hari_kerja`. |
| `web_admin_mode(p_mode text)` | `'cermin'\|'utama'` → `{"mode":…}` |
| `web_admin_token_buat(p_member bigint, p_nama text, p_scope text)` | Rincian di bawah tabel. |
| `web_admin_token_cabut(p_id uuid)` | `{id,prefix,nama,scope,revoked_at}`. Token langsung tidak dikenali `api_token_cek`. |
| `web_admin_tokens()` | `[{id,nama,prefix,scope,member:{id,username,role},created_at,created_by,last_used_at,revoked_at}]`, tanpa hash. |
| `web_admin_sinkron()` | `{"mode","runs":[20 run terakhir: {id,mode,started_at,finished_at,counts,census,diffs,errors}]}`. Pemicu sinkron manual ada di luar DB (Actions). |

**`web_admin_anggota_simpan`**
- `{id?, username, nama, email, clickup_email, initials, color, role, aktif}`. `id` kosong = anggota baru (id dari sequence ≥ 900000000000).
- Username anggota impor ClickUp (id < 900000000000) dikunci.
- Owner tidak bisa menurunkan atau menonaktifkan dirinya sendiri, dan minimal harus ada satu owner aktif.
- Username/email dobel → `PT409 KONFLIK_001`.
- Akun login dibuat lewat Edge (`x_admin_akun`), bukan di sini.

**`web_admin_status_simpan`**
- `[{status, type, color, orderindex?, nama_lama?}]` menggantikan seluruh status list.
- `nama_lama` = ganti nama; tugas ikut tanpa activity status palsu.
- Wajib ≥1 open dan ≥1 closed. Nama tidak boleh ganda (tanpa beda huruf besar).
- (P4) Nama status yang **dibuat** atau **diganti nama** lewat Admin dinormalkan: trim + huruf kecil (`"  Sedang Ditinjau "` → `sedang ditinjau`). Status yang sudah ada dan dikirim dengan nama persis sama (tanpa `nama_lama`, atau `nama_lama` = nama) tetap **verbatim**, jadi status impor ClickUp seperti `BACKLOG` tidak berubah walau warnanya diubah. Status impor sendiri selalu verbatim (paritas ClickUp). Status baru yang hanya beda kapital dari status lain di daftar (mis. `backlog` di samping `BACKLOG`) → PT400.
- Membuang status yang masih dipakai tugas → `PT409 KONFLIK_001`.
- List ClickUp saat cermin → 409.
- Hasil `{"list_id","statuses":[…]}`.

**`web_admin_struktur_simpan`**
- Tanpa `id` = buat baru. List baru mendapat status default `to do`/`in progress`/`complete`.
- Folder harus di space yang sama.
- Saat cermin, `tidak_ditagih` pada list ClickUp **boleh** diubah; field ClickUp lain → 409.
- Space: `anggota:[member_id]` = himpunan penuh anggota space (R2). Baris baru bersumber `app` (tidak ditimpa impor); anggota ClickUp yang dibuang akan dikembalikan impor berikutnya selama masih anggota space di ClickUp. Boleh saat cermin. Anggota tak dikenal → 400.
- Hasil = baris tabel + `jenis` (+ `statuses` untuk list, + `anggota:[{id,sumber}]` untuk space).

**`web_admin_token_buat`**
- Token = `rtk_` + 40 karakter base62 dari `gen_random_bytes`, tanpa bias modulo.
- DB menyimpan `sha256 hex` dan `prefix` (8 karakter pertama).
- Hasil `{"id","token","prefix","member_id","nama","scope","created_at"}`. **Token mentah hanya muncul sekali.**
- Scope ∈ `baca|tulis|impor`. Anggota harus aktif (bot boleh).

## 7. Pembantu internal (tidak bisa dipanggil klien)

`ms`, `ms_ke_ts`, `ts_dari`, `bool_dari`, `prioritas_dari`, `ids_dari`, `mulai_api`, `mulai_web`, `anggota_wajib`, `anggota_impor_wajib`, `set_space_anggota_impor`, `muat_space_anggota`, `list_diarsip`, `rujukan_urai`, `rujukan_wadah`, `penilai`, `akses_semua`, `list_terlihat`, `tugas_terlihat`, `menunggu_keputusan`, `kategori_due`, `wajib_owner_aktor`, `idem_ambil`, `idem_simpan`, `status_cari`, `status_petakan`, `status_id`, `app_url`, `team_id`, `j_member`, `j_prioritas`, `j_folder_list`, `j_list`, `j_list_statuses`, `j_lampiran`, `j_task`, `j_comment`, `komentar_parts`, `inti_buat_tugas`, `inti_assignee`, `inti_ubah_tugas`, `inti_pindah`, `inti_hapus`, `inti_komentar`, `cari_tugas`, `riwayat_tugas`, `j_baris`, `tenggat_hitung`, `norm_impor_tugas`, `norm_impor_komentar`, `sha256_hex`, `muat_*`, `set_mentions_impor`, `j_lampiran_web`, `j_komentar_web`, `body_web`.

Konvensi: setiap fungsi berawalan `api_`, `x_`, `impor_`, atau `web_` adalah endpoint publik. Tes 09 memeriksa jumlahnya (29 service_role + 33 authenticated) dan haknya.

Pembantu privasi yang dipakai policy RLS/Storage dan bisa dipanggil `authenticated`/`service_role`: `lihat_semua()`, `space_terlihat(p_space)`, `list_tertutup()`, `tugas_tertutup()`. Semuanya menilai `penilai()` (internal): anggota sesi JWT bila ada (RLS, Storage, `web_*`), selain itu `aktor()` (`api_*`/`x_*`). Tidak ada parameter anggota, jadi klien tidak bisa menanyakan hak anggota lain.

## 8. Deviasi dari ARSITEKTUR.md (perlu dicatat di STATUS)

1. **Parameter tambahan berdefault**; pemanggilan dengan argumen kontrak tetap sah:
   - `x_tenggat(…, p_tanggal default null, p_folder default null)`
   - `x_sensus(…, p_sumber default null)`
   - `impor_batch(…, p_mode default 'impor', p_at_awal default null)`
   - `impor_tandai_hilang(…, p_mode default 'sinkron', p_lingkup default null)`
   - `impor_run_selesai(…, p_counts, p_census, p_diffs, p_errors)`
   - `web_tenggat(p_tanggal default null)`
   - `web_urut(…, p_status default null, p_orderindex default null)`
2. **Fungsi tambahan** `x_admin_akun` untuk Edge admin akun.
3. **Setelan baru** `app_settings.tenggat_folder_ids` (default `["1100340000026652"]`). Di seed lokal folder itu tidak ada, jadi `web_tenggat()` kosong sampai setelan diubah ke `["1100340000900011"]`.
4. **Header `x-token-id`** membawa token_id ke DB (activity + cek scope). Signature tidak berubah.
5. **comment json** menambah `resolved:false` (kunci netral dari riset §4.3).
6. **Assignee** hanya boleh anggota aktif ber-role owner/member. Bot ditolak seperti non-member ClickUp.
7. **`api_move_task` dan `web_pindah`** ikut memindahkan sub-tugas. Pemetaan status punya langkah tambahan closed ↔ done.
8. **`api_task.attachments`** memuat juga lampiran komentar (sementara; dicek dengan probe).
9. **Perbaikan A1** `struktur_penjaga`: kolom `tidak_ditagih` dan `synced_at` pada space/folder/list ClickUp boleh berubah saat mode cermin.
10. **Tugas impor dengan induk yang belum ada** tidak ditulis (`tertunda`), bukan ditulis dengan parent null. Dengan begitu tidak ada activity `induk` karangan.
11. **Privasi space (review R2)**: ARSITEKTUR §4 ("member lihat semua") diganti aturan K8: space privat hanya untuk anggotanya (+ owner/bot, + assignee per kartu). Tabel baru `space_anggota`, setelan `app_settings.privasi_space` (`tegakkan` default / `abaikan`), `x_export` hanya owner/bot.
12. **Impor tidak menyentuh data app (review R1)**: `members` insert selalu role `member`; owner/bot tidak disentuh (`dilindungi`); id ≥ 900000000000 ditolak. Semua pemuat lain menolak menempel ke data app (lihat §5).
13. **Sub-tugas ikut induk (review R3)**: hapus lunak/pulihkan dan arsip/buka arsip menurun ke turunan (trigger `tasks_sesudah`, activity dengan `catatan` "ikut induk <id>"). Impor/sinkron hanya menurunkan ke anak buatan app. Sub-tugas tidak boleh dibuat/dipulihkan/dibuka arsip di bawah induk yang di Sampah/diarsip (`PT409`). `web_purge` menolak bila ada turunan aktif.
14. **Komentar menaikkan `updated_at` (review R4)**: komentar/balasan baru dari ui/api/sistem menaikkan `tasks.updated_at` (`date_updated`), tanpa menaikkan `versi`. Impor/sinkron tetap verbatim. ARSITEKTUR §3 menyebut sebaliknya "(sementara)"; alasannya pagar M-CU: `agenda … --hours N` tanpa `--all-comments` kini menangkap kartu terbuka yang hanya dapat komentar baru (masuk `berubah_baru`). Perilaku ClickUp asli tetap wajib diprobe; bila ClickUp tidak menaikkan `date_updated`, app tetap menaikkan (superset, lebih aman untuk routine).
15. **Kategori due pagar B10 di web (review R5)**: `web_tugas_saya` menambah grup `menunggu_keputusan` & `tidak_ditagih`; baris web menambah `kategori_due`; `web_struktur.hitungan` menambah `menunggu` dan `telat` tidak lagi menghitung kartu BERSYARAT/CADANGAN/DITUNDA maupun list tidak ditagih.
16. **Isi tags/checklists/custom_fields kartu impor (perbaikan P1)**: ARSITEKTUR §6 menyebut konstanta `[]`; kini kartu impor menyajikan isi payload ClickUp dari `tasks.extra` (paritas `clickup.mjs task`/`tasks --full`). Kartu app tetap `[]`.
17. **Jenis impor baru `space_anggota` (perbaikan P2)** dan kunci `rujukan` di `web_cari` (P6). Nama status dari Admin dinormalkan huruf kecil (P4); nama status impor tetap verbatim.

## 9. Perbaikan review 29 Sep (ringkas)

| # | Temuan | Perbaikan | Tes |
|---|---|---|---|
| R1 | `impor_batch` bisa mengubah data app (status list, assignee, mention, anggota; membuat owner) | Penjaga di tiap `muat_*` + `anggota_impor_wajib`; lihat §5 | `12_impor.sql` bagian R1 |
| R2 | `spaces.private` tidak ditegakkan | `space_anggota`, pembantu privasi, policy RLS/Storage, filter & 404 di `api_*`/`x_*`/`web_*`; lihat §1 | `14_privasi_space.sql` |
| R3 | Sub-tugas dari induk terhapus/diarsip tetap aktif lalu ikut di-purge | Kaskade di trigger + penjaga induk + tolak purge bila ada turunan aktif | `15_ikut_induk.sql` |
| R4 | Komentar baru tidak menaikkan `date_updated` | `comments_sesudah` → `app.sentuh_waktu` (updated_at saja) | `03_status_activity.sql` bagian D |
| R5 | BERSYARAT/CADANGAN & list tidak ditagih tampil sebagai telat | `kategori_due()` + grup baru `web_tugas_saya` + `hitungan` | `13_web.sql` bagian R5 |

## 10. Perbaikan poles 29 Sep (P1–P6, ringkas)

| # | Temuan | Perbaikan | Tes |
|---|---|---|---|
| P1 | PR-1: `tags`/`checklists` kartu impor selalu `[]`; `jsonb_strip_nulls` membuang kunci null di dalam checklist | `j_task` mengisi dari `tasks.extra` (kartu impor saja); `norm_impor_tugas` menyimpan verbatim | `16_poles.sql` P1, kontrak (kartu impor sementara), banding sisa beda 0 |
| P2 | Anggota space privat tidak pernah diimpor | Jenis impor `space_anggota` (`muat_space_anggota`); importer menurunkan dari `/list/{id}/member` + owner/admin | `16_poles.sql` P2, `impor/uji` (mock per list), banding tanpa bantuan psql |
| P3 | CSV dari Windows (`application/vnd.ms-excel`), tsv, doc, pptx, heic, heif ditolak bucket | Allowlist bucket + `MIME_IZIN` importer (sama persis, diuji); alasan `tautan_saja` dilaporkan | `16_poles.sql` P3, kontrak unggah Storage, `impor/uji` |
| P4 | Nama status Admin tidak dinormalkan; duplikat beda kapital | `web_admin_status_simpan`: baru/ganti nama → trim + huruf kecil, status lama verbatim | `16_poles.sql` P4 |
| P5 | Kartu di folder/space diarsip tetap di Tugas Saya/TENGGAT/beban | `list_diarsip()` dipakai `web_tugas_saya`, `tenggat_hitung`, `beban` | `16_poles.sql` P5 |
| P6 | URL tampilan ClickUp (`/v/l/6-<list>-1`, `/v/b/…`) tidak dikenali | `rujukan_urai` (pengurai bersama) + `rujukan_wadah`; `x_resolve`, `cari_tugas`, `web_cari.rujukan` | `16_poles.sql` P6, kontrak `resolve`/`search` |

Hak: `rujukan_urai`, `rujukan_wadah`, `muat_space_anggota`, `list_diarsip` internal (tanpa EXECUTE role API). Jumlah fungsi publik tetap 29 service_role + 33 authenticated.
