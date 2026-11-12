
# Proposal arsitektur rhj-tugas Fase 1: kesetaraan API dan migrasi

Tanggal 29 Sep 2026. Sudut pandang: kesetaraan API dan migrasi. Tidak ada file yang diubah. Fakta yang saya cek sendiri ada di bagian terakhir. Selebihnya berasal dari 4 laporan pembaca.

## Verdict

- **API baru meniru sebagian ClickUp API v2.** Path dan bentuk JSON-nya sama, ditambah beberapa endpoint `/api/x/`. `tugas.mjs` memakai kode `clickup.mjs` yang sama. Yang diganti hanya BASE URL, token, dan throttle. Karena `brief()`, `getComments()` dan logika `agenda` dipakai apa adanya, output CLI otomatis identik. Yang masih harus diuji hanya JSON mentah dari server.
- **ID ClickUp menjadi primary key untuk semua data impor.** Ini berlaku untuk task, komentar, list, folder, space, workspace dan user. Perintah `task z8r3fdjvwd`, `folder-tasks 1100340000026652`, `tasks 1100340000065694` dan `--add-assignee 312823267` langsung jalan tanpa tabel alias. Data yang dibuat di aplikasi dapat ID berprefiks (`rt…`) yang tidak bisa bentrok dengan ID ClickUp.
- **Cutover routine lewat shim.** `tools/clickup.mjs` di rhj-brain diganti file dua-mode. Backend dipilih lewat env `TUGAS_BACKEND=tugas`. Enam prompt UI dan izin `.claude/settings.json` L30 tidak perlu disentuh. Rollback cukup dengan menghapus satu env var.
- **Migrasi berupa sapuan penuh yang idempoten** (upsert per ID ClickUp). Sapuan diulang selama masa paralel dalam mode cermin satu arah, lalu sekali lagi sebagai sinkron akhir. Lulus bila himpunan ID dan hitungan per list (tugas, komentar top-level, balasan, lampiran) sama persis.
- **Riwayat status lama tidak bisa diimpor utuh.** ClickUp tidak punya endpoint riwayat, dan `time_in_status` hanya berisi total menit. Yang bisa diimpor: event "dibuat" (beserta pembuat) dan "ditutup" (aktor tidak diketahui). Tiap sinkron selama paralel merekam perubahan yang terdeteksi, jadi riwayat sudah mulai terisi sebelum cutover.
- **Biaya opsi yang saya rekomendasikan: Rp0/bulan.** Isinya schema `tugas` di project Supabase ERP produksi (Free) ditambah subdomain Hostinger yang sudah dibayar. Alternatif dengan isolasi penuh: org Pro terpisah, $25 ≈ Rp449.619/bulan (kurs dari laporan platform).

---

## 1. Stack, hosting, biaya

| Lapisan | Pilihan | Alasan |
|---|---|---|
| DB, Auth, Storage | Supabase Postgres 17, schema `tugas` (staging di dev ERP, produksi di ERP prod; lihat K1) | Pola sama dengan ERP; RLS; Rp0 |
| API untuk agent | Edge Function `tugas-api` (TypeScript), `verify_jwt=false`, token sendiri | Edge hanya mengubah respons HTML, JSON aman. Kuota 500.000 invocation/bulan |
| UI | SPA statis tanpa build: `index.html` + ES modules, supabase-js v2, marked + DOMPurify (markdown), SortableJS (drag sentuh). Versi dipin dari cdn.jsdelivr.net | Pola ERP (single-file). Deploy cukup menyalin file, cocok untuk Git deploy Hostinger yang tidak punya tahap build |
| Impor, sinkron, backup | Skrip Node 22 di `rhj-tugas/impor/`, dijalankan lewat GitHub Actions cron (atau manual dari sesi) | Sapuan penuh butuh waktu lebih dari 150 detik (batas wall clock Edge) dan token ClickUp |
| CLI | `tugas.mjs`, satu file tanpa dependensi | Setara `clickup.mjs` |

**Biaya per bulan**

| Komponen | Opsi rekomendasi | Biaya |
|---|---|---|
| Supabase | Schema `tugas` di project ERP produksi (Free) | Rp0 |
| Supabase, alternatif | Org Pro terpisah, 1 project | $25 ≈ Rp449.619 |
| Frontend | Subdomain Hostinger (paket sudah dibayar) | Rp0 tambahan. Masih dugaan: kuota subdomain di paket belum terverifikasi |
| Frontend, alternatif | Cloudflare Workers static / Netlify Free | Rp0. Vercel Hobby tidak boleh dipakai komersial |
| Sinkron dan backup | GitHub Actions di rhj-tugas | Rp0 kalau masih dalam kuota. Kuota menit repo private belum diverifikasi. Perkiraan pemakaian ±900 menit/bulan, dari asumsi 3 sinkron/hari × ±10 menit × 30 hari |
| Edge invocation | Termasuk Free | Asumsi ≤2.000 panggilan/hari (UI 9 orang + routine) = ≤60.000/bulan = 12% dari 500.000 |
| Storage | Kuota org 1 GB | ERP prod 65 MB + lampiran task ClickUp 16,1 MB = 81,1 MB (±8%). Lampiran di komentar dan pemakaian project dev belum dihitung |

**Tindakan yang harus Hannes kerjakan sendiri (urut)**

1. Putuskan K1–K6 (bagian 8).
2. **Supabase** (opsi b):
   - ACC pembuatan schema `tugas` di dev dan prod lewat SQL. Agent bisa menjalankannya lewat `execute_sql`.
   - Dashboard → Project Settings → Data API → Exposed schemas: tambahkan `tugas` (dev dan prod).
   - Auth → URL Configuration: tambahkan URL aplikasi ke Redirect URLs.
   - Deploy Edge Function. Caranya: buat Personal Access Token (Account → Access Tokens), lalu simpan sebagai env `SUPABASE_ACCESS_TOKEN` di environment sesi build, bukan di repo. Alternatifnya, agent menyiapkan kode dan Hannes menempelnya di Dashboard → Edge Functions.
   - Alasannya: di sesi ini tool Supabase MCP tidak punya `create_project`, `deploy_edge_function` maupun `apply_migration`.
   - Kalau opsi c: buat org baru plan Pro dengan project `rhj-tugas` di ap-southeast-1 (perlu kartu kredit).
3. **ClickUp:** tambahkan `CLICKUP_API_TOKEN` ke env sesi build, lalu buka sesi baru. Token ini hanya dipakai membaca, dan migrator menolak method selain GET.
4. **Hostinger:**
   - hPanel → Subdomains: buat `tugas.<domain>`, lalu aktifkan SSL.
   - hPanel → Git: repo `hanneslowan-max/rhj-tugas`, branch `situs` (hanya berisi file statis). Generate SSH key, tempel di GitHub → Settings → Deploy keys (read-only).
   - Aktifkan Auto Deployment, lalu tempel webhook-nya di GitHub → Settings → Webhooks.
5. **GitHub rhj-tugas** → Settings → Secrets → Actions: isi `CLICKUP_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE`. Cek sisa menit di Settings → Billing.
6. **Anggota:** pastikan email login Michael dan Rengga (K12). Bagikan password awal secara langsung, jangan lewat repo atau email.
7. **Saat cutover:** tambahkan `TUGAS_API_URL`, `TUGAS_API_TOKEN` dan `TUGAS_BACKEND=tugas` ke env cloud "Marketing". Env baru hanya terbaca di sesi baru.

**Alternatif kalau Hannes tidak mau memberi access token Supabase:** API dibuat sebagai fungsi RPC PostgREST `tugas.api(method, path, body, token)` lewat `execute_sql`. `tugas.mjs` memetakan path ClickUp ke RPC itu. Output tetap identik karena pemformatan terjadi di CLI. Kekurangannya: perlu header `apikey` publishable, dan routing ditulis di plpgsql.

---

## 2. Skema data (schema `tugas`)

Nama teknis tabel dan kolom memakai bahasa Inggris supaya bisa dipetakan 1:1 ke field ClickUp. UI tetap berbahasa Indonesia.

### 2.1 Strategi ID

| Entitas | PK | Data impor | Data baru di aplikasi |
|---|---|---|---|
| workspace, space, folder, list | `text` | ID numerik ClickUp verbatim (`1100340000026652`) | `rs`/`rf`/`rl` + 8 base36 |
| task | `text` | ID ClickUp verbatim (`z8r3fdjvwd`) | `rt` + 8 base36 (36^8 ≈ 2,8 triliun kombinasi) |
| comment (termasuk balasan) | `text` | ID ClickUp | `rc` + 10 base36 |
| member (user) | `bigint` | ID user ClickUp (`312823267`, Rengga `246027506`) | Sequence mulai 900000000000 |
| attachment | `text` | ID ClickUp | uuid |
| status | `(list_id, status)` | Nama verbatim | — |

- Semua baris punya kolom `clickup_id` (terisi untuk data impor, null untuk data baru) dan `sumber` (`clickup` atau `app`).
- Constraint untuk baris `sumber='app'`: id tidak boleh cocok dengan `^z8r3` atau `^\d+$`. Tabrakan saat impor jadi error PK yang terlihat, tidak diam-diam.
- **Kenapa PK dan bukan alias:**
  - Repo merujuk 129 ID tugas unik, 13 ID space/folder/list/workspace, dan 9 ID user (sapuan). Dengan PK = ID lama, tidak ada lookup, dan tidak ada risiko satu endpoint lupa memetakan alias.
  - Kunci `id` di JSON mentah `task` tetap sama dengan yang tercatat di memori.
  - `clickup.mjs:212,228-229` melakukan `Number()` pada assignee, jadi ID user harus numerik. Karena itu `members.id` bertipe bigint.
  - Kenapa tidak uuid + alias: setiap endpoint butuh resolver, `id` di output jadi harus dipilih salah satu, dan ada risiko pencocokan routine ke memori putus. Biaya PK bertipe text di tabel sekecil ini tidak berarti.
- **Resolver:**
  - Rute UI `/t/<id>`.
  - `GET /api/x/resolve?ref=` menerima `z8r3…`, `rt…`, URL `https://app.clickup.com/t/<id>`, URL aplikasi, ID numerik space/folder/list, dan ID user.
  - Kolom pencarian UI juga menerima tempelan URL ClickUp.

### 2.2 Tabel dan kolom kunci

- `workspace(id, name)`: satu baris, `1100340000004525` "Roda Hammerindo Workspace".
- `members(id bigint PK, auth_user_id uuid UNIQUE NULL, username text UNIQUE, email, clickup_email, nama, initials, color, role ∈ owner|member|bot, aktif, created_at)`. Username impor diambil verbatim, misalnya "hannes lowan", dan tidak boleh diubah member.
- `spaces(id, name, private, archived, orderindex)`.
- `folders(id, space_id, name, hidden, archived, orderindex)`. Folder tersembunyi `1100340000063830` tetap didukung.
- `lists(id, space_id, folder_id NULL, name, archived, orderindex)`. `folder_id` null berarti list tanpa folder.
- `list_statuses(list_id, status, type ∈ open|custom|done|closed, orderindex, color, clickup_status_id)`, PK `(list_id, status)`.
- `tasks`:
  - Identitas: `id, clickup_id, list_id (home list), parent_id NULL, name`.
  - Deskripsi: `markdown, description_plain, desc_unreadable bool`.
  - Status: `status, status_type` (didenormalisasi oleh trigger), `priority smallint 1–4 NULL`.
  - Tanggal: `due_at timestamptz, due_has_time, due_wib date, start_at, start_has_time`.
  - Jejak: `creator_id, created_at, updated_at, closed_at, done_at, first_closed_at, archived, archived_at, deleted_at, deleted_by`.
  - Tampilan: `orderindex numeric` (urutan board), `last_comment_at`, `comment_count`.
  - Opsional sesuai keputusan: `bobot smallint NULL 1–3` (K10), `status_durasi jsonb` (bila `time_in_status` tersedia), `extra jsonb` (checklist, tag dan custom field lama bila ada, hanya dibaca).
  - Sinkron: `clickup_url, sumber, synced_at, clickup_hash`.
- `task_assignees(task_id, member_id, added_at, added_by)`, PK `(task_id, member_id)`.
- `comments(id, task_id, parent_id NULL, author_id, text, body_json jsonb, created_at, edited_at, deleted_at, clickup_id, sumber)`. Thread satu tingkat seperti ClickUp; `parent_id` harus menunjuk komentar top-level.
- `comment_mentions(comment_id, member_id)`.
- `attachments(id, task_id, comment_id NULL, title, extension, mimetype, size, storage_path, clickup_url, uploaded_by, created_at, deleted_at)`. Bucket `lampiran` private, maksimal 25 MB per file (sama dengan ERP).
- `activity`: append-only. Kolom `id bigserial, task_id, at, actor_id NULL, sumber ∈ ui|api|impor|sinkron|sistem, token_id NULL, jenis, dari jsonb, ke jsonb, aktor_assignee bool, snapshot jsonb, catatan`.
- `notifications(id, member_id, task_id, comment_id, jenis ∈ assign|mention|komentar, actor_id, created_at, read_at)`.
- `api_tokens(id uuid, member_id, nama, prefix, token_hash sha256, scope ∈ baca|tulis, created_at, last_used_at, revoked_at)`.
- `hari_libur(tanggal PK, nama)`: kosong secara default.
- `app_settings(key, value)`: antara lain `mode` (`cermin` atau `utama`) dan `app_base_url`.
- `sync_runs(id, mode ∈ penuh|akhir|uji, started_at, finished_at, counts jsonb, diffs jsonb, errors jsonb)`.
- `sync_raw(entity, id, fetched_at, hash, payload jsonb)`: payload ClickUp terakhir, untuk uji golden dan forensik. Data rahasia hanya disimpan di DB, tidak pernah di repo.

### 2.3 Tanggal, status, prioritas

- **Due:**
  - `due_at` menyimpan ms ClickUp verbatim.
  - `due_wib` diisi trigger dengan `(due_at UTC + 7 jam)::date`. Ini rumus yang sama dengan `wibDate` di `clickup.mjs:85`, sehingga due 00:00 WIB tidak mundur sehari.
  - Input `YYYY-MM-DD` disimpan sebagai 12:00 WIB dengan `due_has_time=false`, sama seperti `clickup.mjs:83,213`. `--due none` menjadi null (kartu parkir).
- **Format tanggal:**
  - Semua `date_*`, `due_date` dan `start_date` di API kompatibel dikeluarkan sebagai **string ms epoch** (`"1759201200000"`), dibulatkan ke ms.
  - `/api/x/*` memakai ISO UTC.
  - Output CLI tetap sama seperti sekarang (`due` berupa tanggal WIB; `updated`, `closed` dan `comments[].date` berupa ISO UTC `…Z`) karena dihitung oleh kode CLI yang sama.
- **Status:**
  - Kondisi closed = `type ∈ {closed, done}` (`clickup.mjs:175`).
  - "complete" wajib bertipe `closed`. "to do" = `open`, "in progress" = `custom`. Status tambahan per list harus punya type.
  - Pindah ke closed mengisi `closed_at`/`done_at` (dan `first_closed_at` bila masih kosong). Buka ulang mengosongkan keduanya, meniru ClickUp; perilakunya dicek di Tahap 2.
- **Prioritas:** disimpan sebagai angka, dengan 1 = urgent dan 4 = low. Di JSON mentah berbentuk objek `{id:"1", priority:"urgent", color, orderindex}`.
- **`updated_at`:**
  - Trigger mengisi `now()` saat field tugas berubah, kecuali `sumber ∈ impor|sinkron` (nilai ClickUp dipertahankan).
  - Apakah komentar baru ikut menaikkan `updated_at` mengikuti perilaku ClickUp yang diukur di Tahap 2. Ujinya: cari task yang tanggal komentar terbarunya lebih besar dari `date_updated`.

### 2.4 Trigger riwayat (bahan verifikator "complete palsu")

- Aktor = `coalesce(current_setting('app.actor_id', true), member dari auth.uid())`. Sumber dan token diambil dari `app.sumber` dan `app.token_id`, yang di-set lokal oleh RPC API dalam transaksi yang sama.
- `tasks AFTER UPDATE` mencatat perubahan status, due, start, nama, deskripsi, prioritas, list (pindah), arsip, hapus dan bobot. Isinya dari → ke, ditambah `aktor_assignee` (apakah aktor saat itu termasuk assignee).
- **Status pindah ke closed** menyimpan `snapshot`: jumlah komentar, jumlah balasan, jumlah lampiran, ada tidaknya URL di komentar, serta komentar atau balasan terakhir (user, date, 200 karakter pertama teks). Buka ulang tercatat sebagai `jenis=status` dengan dari closed ke open.
- `task_assignees` INSERT/DELETE mencatat tambah/hapus assignee. `comments` UPDATE/soft-delete mencatat edit/hapus komentar (teks lama disimpan di `dari`). `attachments` INSERT/soft-delete mencatat lampiran.
- **Append-only:** REVOKE INSERT/UPDATE/DELETE dari `authenticated`. Trigger `BEFORE UPDATE OR DELETE` melempar exception. Insert hanya lewat fungsi trigger `SECURITY DEFINER` dengan `search_path` terkunci (pola ERP migrasi 75/84).
- Notifikasi dibuat trigger yang sama, hanya untuk `sumber ∈ ui|api`, tanpa notifikasi ke aktor sendiri. Aturannya: di-assign → yang di-assign; di-mention → yang disebut; komentar → assignee dan pembuat.

### 2.5 RLS ringkas

- Helper `tugas.saya()` mengembalikan member aktif (role owner/member) untuk `auth.uid()`; `tugas.owner()` untuk cek owner. Kalau schema ini numpang di ERP, 4 user ERP bisa login ke Auth tapi tidak punya baris `members`, sehingga tidak melihat apa pun.
- **SELECT:** semua tabel boleh dibaca member, kecuali tiga hal: `api_tokens` (owner saja, `token_hash` tidak pernah diekspos), `notifications` (milik sendiri), dan `sync_raw` (owner).
- **INSERT/UPDATE tasks, comments, attachments:** harus member, dan (`mode='utama'` ATAU `sumber='app'`). Artinya saat mode cermin, data impor hanya bisa dibaca.
- **Komentar:** edit hanya oleh penulis. Hapus lunak oleh penulis atau owner.
- **Hapus tugas:** tidak ada DELETE langsung. Lewat RPC `hapus_tugas` (soft-delete) yang mensyaratkan owner, atau bot untuk kartu buatannya sendiri yang berumur ≤60 menit (K8). Purge permanen hanya owner, dari layar Sampah.
- **Storage `lampiran`:** member boleh select dan insert. Path `t/<task_id>/<uuid>-<nama>`.

### 2.6 Indeks

- `tasks(list_id, status_type) WHERE deleted_at IS NULL AND NOT archived`
- `tasks(due_wib) WHERE status_type NOT IN ('closed','done')`
- `tasks(updated_at)`, `tasks(clickup_id)` unik
- `task_assignees(member_id)`
- `comments(task_id, parent_id, created_at DESC)`
- `activity(task_id, at)`
- `notifications(member_id, read_at)`
- GIN `to_tsvector('simple', name || ' ' || markdown)` untuk pencarian. Pencarian kode pendek (Y7, P15) memakai `name ILIKE 'Y7 %'`. Dengan ratusan baris, sequential scan cukup.
- Fungsi SQL:
  - `hari_kerja(a,b)` = jumlah hari Senin–Jumat dengan a < d ≤ b yang tidak ada di `hari_libur`. Sudah dicocokkan dengan data 28/9 di laporan pagar.
  - `beban(member, tanggal)` untuk peringatan B5.

---

## 3. Daftar layar (mobile-first)

1. **Login:** email + password. Akun dibuat owner, tanpa email.
2. **Tugas Saya (beranda):**
   - Kelompok: Telat (hari kalender, paling lama di atas), Hari ini, ≤3 hari kerja (dengan label "sisa N hari kerja"), Nanti, Tanpa due.
   - Tiap baris: kode + nama, chip due, avatar assignee, prioritas, jumlah komentar, dan **tanggal komentar terakhir**.
3. **Navigasi (drawer):** Space > Folder > List, termasuk folder tersembunyi. List "Di luar periode" ditandai "tidak ditagih".
4. **Tampilan List:**
   - Dikelompokkan per status (bisa dilipat). Toggle "tampilkan complete".
   - Filter: assignee, status, due (telat / hari ini / ≤3 hari kerja / tanpa due). Tambah cepat di tiap grup.
   - Filter "telat" tidak menyaring kartu yang telat 5+ hari (B10).
5. **Board:**
   - Kolom sesuai status list, di HP digeser ke samping. Drag dengan tekan lama (SortableJS).
   - Drop ke complete memunculkan pengingat "cek komentar terakhir" (pagar M5, 9 Sep).
6. **Detail tugas** (layar penuh di HP, panel samping di desktop):
   - Isi: nama, status, assignee (multi), due dan start, prioritas, bobot (bila K10), pindah list, deskripsi markdown (lihat/edit dengan pratinjau), lampiran, dan thread komentar (balas, autocomplete @mention, unggah gambar/PDF/docx/CSV).
   - Tab **Riwayat** berisi timeline activity. Event impor diberi label "sebagian, aktor tak diketahui".
   - Ditampilkan juga: ID (lama = baru untuk data impor), tombol salin link `/t/<id>`, Arsip, dan Hapus (owner).
   - Peringatan saat set due: jatuh di Sabtu, Minggu atau hari libur; beban assignee lebih dari 7 kartu due di hari itu (B5).
7. **Pencarian:** nama, kode, deskripsi, ID lama/baru, tempel URL ClickUp. Cakupan per space tersedia untuk cek duplikat (M6).
8. **Notifikasi (lonceng):** polling 60 detik. Realtime opsional.
9. **Admin (owner):**
   - Anggota: tambah, nonaktifkan, reset password.
   - Status per list: tambah, urutkan, set type.
   - Token API: buat (ditampilkan sekali), cabut, lihat terakhir dipakai.
   - Hari libur. Mode (cermin/utama). Status sinkron: waktu terakhir, tabel hitungan, selisih.
10. **Arsip dan Sampah:** pulihkan; purge oleh owner.

Pengaturan situs: SPA dengan rewrite `.htaccess` supaya `/t/*` diarahkan ke `index.html` (perlu diuji di Hostinger), `robots.txt Disallow: /`, `X-Robots-Tag: noindex`, dan CSP ketat. Tidak ada data yang tampil sebelum login.

---

## 4. REST API

### 4.1 Prinsip

- Path `/api/v2/...` dan `/api/v3/...` meniru ClickUp untuk operasi yang dipakai `clickup.mjs`. Bentuk respons sama dengan ClickUp: key, tipe, dan string ms. `/api/x/...` berisi endpoint tambahan.
- Base URL: `https://<ref>.supabase.co/functions/v1/tugas-api`.
- Semua `{id}` menerima ID lama maupun ID baru. Karena ID lama adalah PK, tidak ada langkah tambahan.

### 4.2 Auth

- Header `Authorization: <token>` mentah, seperti yang dikirim `clickup.mjs:58`. `Bearer <token>` juga diterima.
- Format token `rtk_` + 40 karakter base62. Disimpan sebagai SHA-256 dan ditampilkan sekali saat dibuat.
- Tiap token terikat ke satu member (bot atau Hannes), dan member itu menjadi aktor di riwayat.
- Scope `baca` hanya boleh GET. Scope `tulis` boleh create/update/comment/move/attach. `DELETE` mengikuti aturan hapus di 2.5.
- Tidak ada kuota harian.
- UI tidak memakai token ini. UI memakai sesi Supabase + PostgREST/RLS. Kedua jalur melewati trigger yang sama, jadi riwayat tetap konsisten.

### 4.3 Endpoint

| Method | Path | Fungsi | Padanan clickup.mjs |
|---|---|---|---|
| GET | `/api/v2/user` | `{user:{id,username,email,color,initials,profilePicture}}` | whoami |
| GET | `/api/v2/team` | `{teams:[{id:"1100340000004525",name,members:[{user}]}]}`. Bot tidak dihitung sebagai member | whoami, teamId |
| GET | `/api/v2/team/{tid}/space?archived=` | `{spaces:[…]}` | audit-free |
| GET | `/api/v2/space/{id}/folder?archived=` | `{folders:[{…,hidden,lists:[…]}]}` | audit-free |
| GET | `/api/v2/space/{id}/list?archived=` | List tanpa folder | audit-free |
| GET | `/api/v2/folder/{id}/list?archived=` | `{lists:[…]}` | folder-tasks, agenda |
| GET | `/api/v2/list/{id}` | List + `statuses[]` | (baru; sinkron, UI) |
| GET | `/api/v2/list/{id}/task?page&include_closed&subtasks&archived&include_markdown_description&date_updated_gt` | `{tasks:[mentah], last_page}`, 100 per halaman | tasks, folder-tasks, agenda |
| GET | `/api/v2/task/{id}?include_markdown_description=true` | JSON mentah | task, move, agenda --desc |
| POST | `/api/v2/list/{id}/task` | Body `{name, markdown_description, assignees[], due_date, due_date_time, priority, status}` → mentah | create |
| PUT | `/api/v2/task/{id}` | Body `{name, markdown_description, status, due_date\|null, due_date_time, priority, assignees:{add,rem}}` → mentah | update |
| DELETE | `/api/v2/task/{id}` | Soft-delete → `{}` | delete |
| GET | `/api/v2/task/{id}/comment?start&start_id` | `{comments:[{id, comment:[parts], comment_text, user:{id,username,email,…}, date:"ms", reply_count:"n", resolved:false, reactions:[]}]}`. **Semua** komentar top-level, terbaru dulu | comments, agenda |
| GET | `/api/v2/comment/{id}/reply` | `{comments:[…]}`, urutan disamakan dengan hasil uji Tahap 2 | comments --replies |
| POST | `/api/v2/task/{id}/comment` | `{comment_text, notify_all}` → `{id, hist_id, date}` | comment |
| POST | `/api/v2/comment/{id}/reply` | Balasan thread | comment --reply-to (baru) |
| POST | `/api/v2/task/{id}/attachment` | Multipart → objek lampiran | attach (baru) |
| GET | `/api/v2/list/{id}/field` | `{fields:[]}` | fields |
| PUT | `/api/v3/workspaces/{tid}/tasks/{id}/home_list/{list_id}` | Pindah list. Status dipetakan: nama sama → type sama → status pertama | move |
| GET | `/api/x/task/{id}/activity` | `[{at, jenis, dari, ke, aktor, sumber, catatan}]` | activity (baru) |
| GET | `/api/x/resolve?ref=` | `{type, id, url}` | resolve (baru) |
| GET | `/api/x/search?q=&space=&include_closed=` | `brief[]` | search (baru, M6) |
| GET | `/api/x/count?list=\|folder=\|space=` | Hitungan untuk verifikasi | verify (baru) |
| GET | `/api/x/file/{attachment_id}` | 302 ke signed URL | Unduh lampiran |

### 4.4 Format respons

- **JSON mentah `task`** memuat key yang dibaca konsumen:
  - `id, custom_id:null, name, text_content, description, markdown_description` (bila diminta)
  - `status{id,status,color,type,orderindex}`
  - `date_created, date_updated, date_closed, date_done` (string ms)
  - `archived, creator{id,username,email,color}, assignees[{id,username,email,color,initials,profilePicture}]`
  - `priority, due_date, due_date_time, start_date, parent`
  - `list{id,name,access}, folder{id,name,hidden,access}, space{id}, team_id, url`
  - `attachments[{id,date,title,type,extension,mimetype,size,url}]`
  - Key yang tidak didukung di Fase 1 tetap dikirim dengan nilai netral: `tags:[], checklists:[], custom_fields:[], dependencies:[], linked_tasks:[], watchers:[], time_estimate:null, points:null`. Tujuannya supaya himpunan key sama dengan golden.
- **`url`** = `https://<domain-app>/t/<id>`. Ini satu-satunya perbedaan yang disengaja.
- **`attachments[].url`** = signed URL Storage yang berlaku 24 jam. Routine yang mengunduh CSV dengan curl tetap jalan tanpa header auth.
- **Error:** HTTP 400/401/403/404/409/429 dengan body `{err, ECODE}`, sama dengan pola ClickUp yang di-parse di `clickup.mjs:68`.

---

## 5. Desain `tugas.mjs`

- **Sumber:** `rhj-tugas/cli/tugas.mjs`. Satu file, Node ≥18, tanpa dependensi. Disalin ke rhj-brain oleh sesi CMO.
- **Dua mode dalam satu file:**
  - `TUGAS_BACKEND=tugas` memakai `TUGAS_API_URL` dan `TUGAS_API_TOKEN` (fallback ke `tools/.env`).
  - Selain itu memakai ClickUp dengan `CLICKUP_API_TOKEN`, sama seperti sekarang.
  - File yang sama dipasang sebagai `tools/clickup.mjs` (default ClickUp) dan `tools/tugas.mjs` (default tugas).
- **Perintah dan flag identik:**
  - `whoami`
  - `tasks <list> [--closed] [--full]`
  - `folder-tasks <folder> [--closed]`
  - `task <id>`
  - `comments <id> [--replies]`
  - `agenda [folder=1100340000026652] [--hours 26] [--all-comments] [--desc]`
  - `create <list> --name --desc --assignee --due --priority --status`
  - `update <id> --name --desc --status --due YYYY-MM-DD|none --priority --add-assignee --rem-assignee [--dry-run]`
  - `comment <id> --text|--file [--dry-run]`
  - `move <id> <list> [--dry-run]`
  - `delete <id> --yes`
  - `fields <list>`
  - `audit-free`
- **Perintah tambahan:**
  - `activity <id>`
  - `resolve <id|url>`
  - `search "<q>" [--space id] [--closed]`
  - `verify [--list|--folder id]`
  - `comment <id> --reply-to <comment_id>`
  - `attach <id> --file <path>`
- **Supaya output identik:**
  - `brief()`, `getComments()`, logika `agenda`, parser argumen, bentuk `--dry-run`, `{deleted:id}` dan pesan error `…: GAGAL ->` disalin byte-per-byte dari `clickup.mjs:74-106,166-254`.
  - Yang berbeda hanya: `BASE`, throttle 670 ms (dimatikan di mode tugas), URL `move`, dan satu tambahan di `getComments`, yaitu paginasi `start/start_id` selama halaman berisi 25. Tambahan itu memperbaiki kebocoran pagar M-CU di mode ClickUp juga (keputusan K9).
- **Uji:**
  - `uji/banding.mjs` menjalankan setiap perintah baca di kedua backend, lalu membuat diff setelah dua normalisasi: domain `url` dan urutan array (diurutkan per id). Hasilnya ditulis ke `sync_runs.diffs`.
  - Perintah tulis diuji dua cara: kesamaan body `--dry-run` terhadap `clickup.mjs`, dan eksekusi nyata hanya ke API baru di list "Uji Coba". Tidak ada tulis ke ClickUp.
  - Fixture CI memakai data sintetis. Data asli tidak pernah masuk repo.
- **Dampak ke rhj-brain** (dikerjakan sesi CMO): yang wajib sebelum cutover hanya `tools/clickup.mjs` (file dua-mode), `tools/tugas.mjs`, `tools/README.md`, dan env "Marketing". Perubahan teks "ClickUp" di routine dan skill bisa menyusul.

---

## 6. Rencana migrasi

### 6.1 Urutan (skrip `impor/sinkron.mjs`, hanya GET ke ClickUp)

1. `GET /team`: members, dilengkapi email dari `/list/{id}/member`.
2. Spaces, dengan `archived` false dan true.
3. Folders (false/true, termasuk hidden), lalu lists (di folder maupun tanpa folder, false/true).
4. `GET /list/{id}` → `list_statuses`.
5. Tasks per list (`include_closed=true&subtasks=true&include_markdown_description=true`, `archived` false/true, semua halaman).
6. `GET /task/{id}` untuk lampiran dan creator.
7. Parent diisi di pass kedua.
8. Assignees.
9. Komentar top-level dengan paginasi `start/start_id`, lalu `/comment/{id}/reply` untuk komentar dengan `reply_count>0`, lalu mentions dari parts `type:"tag"`.
10. Lampiran task dan komentar: unduh, unggah ke Storage.
11. `bulk_time_in_status` (kalau ditolak, dicatat).
12. Event riwayat sintetis.
13. Verifikasi hitungan dan diff golden.
14. Tulis `sync_runs`.

Perkiraan volume: `≈59 (hierarki) + 198 (detail) + ≥198 (halaman komentar) + 2 (time_in_status) + R (balasan) ≈ 457 + R request`. Pada throttle 60 req/menit itu ±8 menit ditambah R/60. Angka 198 berasal dari audit 23/9. Jumlah task sekarang dan R belum dihitung.

### 6.2 Idempotensi

- Upsert `ON CONFLICT (id)`. Baris hanya diubah bila `clickup_hash` payload berubah.
- Lampiran diberi kunci `clickup_id`. Unggah dilewati bila objek dengan ukuran sama sudah ada.
- Event impor diberi kunci unik `(task_id, jenis, sumber='impor', at)`.
- Entitas yang tidak lagi dikembalikan ClickUp di-soft-delete dengan activity "hilang di ClickUp", tidak dihapus.
- Skrip aman dijalankan ulang kapan saja. Flag: `--mode penuh|akhir|uji`, `--only list=<id>`, `--dry-run`.

### 6.3 Pemetaan field

| ClickUp | Baru |
|---|---|
| `user.id / username / email` | `members.id / username` (verbatim) / `clickup_email`. Email login mengikuti K12 |
| `space`, `folder` (+`hidden`), `list` (+`folder` null) | `spaces`, `folders`, `lists` (id verbatim) |
| `list.statuses[]{status,type,orderindex,color,id}` | `list_statuses` |
| `task.id` | `id` dan `clickup_id` |
| `name` | verbatim, termasuk em-dash dan prefix `[Claude]` |
| `markdown_description` / `description` / `text_content` | `markdown` / `description_plain`. Markdown kosong tapi teks ada → `desc_unreadable=true`, markdown diisi teks polos. Keduanya kosong → markdown null, dan CLI mencetak "(isi deskripsi tak terbaca)" seperti sekarang |
| `status.status / type` | `status / status_type` |
| `priority.id` | `priority` (1–4) |
| `due_date` + `due_date_time` | `due_at` (ms verbatim) + `due_has_time`. `due_wib` lewat trigger |
| `start_date` | `start_at` (dipakai, mis. `z8r3fdeqk2`) |
| `date_created / creator.id` | `created_at / creator_id` |
| `date_updated / date_closed / date_done` | `updated_at / closed_at / done_at` verbatim (trigger dilewati) |
| `archived`, `parent`, `list.id` (home) | `archived`, `parent_id`, `list_id` |
| `url` | `clickup_url` |
| `assignees[].id` | `task_assignees` |
| `comment.id / comment_text / comment[] / user.id / date` | `comments.id / text / body_json / author_id / created_at` |
| reply | `comments.parent_id` = id induk |
| `attachments[]` (task dan komentar) | `attachments` + objek Storage + `clickup_url` |
| `tags / checklists / custom_fields` | `tasks.extra`, hanya dibaca (K14). Menurut audit, custom field kosong |

### 6.4 Riwayat status

| Bisa diambil | Tidak bisa |
|---|---|
| `date_created` + creator → event "dibuat" (aktor diketahui) | Transisi status beserta waktu dan aktornya (tidak ada endpoint; audit log v3 hanya untuk Enterprise) |
| `date_closed`/`date_done` saat ini → event "ditutup", aktor null | Penutupan sebelum buka ulang, karena `date_closed` terhapus saat dibuka ulang |
| Total menit per status (`time_in_status`), bila ClickApp aktif. OTAK-MM L132 mencatat "not available on your plan", jadi kemungkinan tidak ada | Perubahan due dan assignee di masa lalu |
| Waktu semua komentar dan balasan | — |

Aturannya: jangan mengarang event. Riwayat impor diberi label "sebagian, aktor tak diketahui". Selama paralel, tiap sinkron membandingkan snapshot lama dan baru, lalu mencatat event `sumber='sinkron'` dengan catatan "terjadi antara <sinkron-1> dan <sinkron>". Kalau `date_closed` baru tersedia, waktunya dipakai. Aktor dibiarkan null.

### 6.5 Lampiran

- File disalin ke Storage (K11), dan URL asli disimpan.
- Sebelum migrasi, uji satu URL dengan curl tanpa auth. Setting "Private Attachment Links" default OFF, tapi kondisinya di RHJ belum terverifikasi.
- Lampiran di komentar dan balasan ikut disalin (contoh: docx A6 v3), termasuk tipe docx dan CSV.
- Gambar yang tersemat di `markdown_description` atau teks komentar menunjuk ke CDN ClickUp. Selama paralel dibiarkan verbatim supaya diff tetap bersih. Saat sinkron akhir, URL-nya ditulis ulang ke `/api/x/file/<id>`, dengan event riwayat "sistem". Jumlah kartu yang terdampak belum dihitung.

### 6.6 Verifikasi hitungan (syarat lulus: semua sama)

- **Per list, dibandingkan dengan crawl ClickUp berpaginasi** (bukan output `clickup.mjs`, yang terpotong di 25 komentar):
  - tugas total, open, closed, arsip, subtask
  - komentar top-level
  - balasan (dan `reply_count` = jumlah balasan yang terimpor)
  - lampiran task dan lampiran komentar
  - relasi assignee
- **Himpunan ID** tugas dan komentar harus sama persis, bukan hanya jumlahnya.
- **Checksum per tugas** dari `(name, status, due_wib, priority, assignee ids terurut, list_id, parent_id, archived)`.
- **Golden diff:** JSON mentah `task` baru vs payload ClickUp di `sync_raw` untuk semua key yang dibaca konsumen. Satu-satunya perbedaan yang boleh adalah `url`.
- Laporan per list ditampilkan di layar Admin dan menjadi bahan serah-terima ke Hannes.

### 6.7 Masa paralel (1–2 minggu)

- **Mode cermin (K3):**
  - Tim tetap bekerja di ClickUp.
  - Aplikasi hanya bisa dibaca untuk data impor, dengan banner "salinan per <waktu sinkron>; ubah di ClickUp".
  - List "Uji Coba" boleh ditulis untuk latihan.
- **Sinkron:**
  - 3×/hari pada 05:45, 12:45 dan 18:45 WIB, di luar jendela routine 07:00–09:15 WIB, ditambah pemicu manual.
  - Throttle ≤60 req/menit, karena jatah 100 req/menit per token dipakai bersama routine yang memakai token yang sama.
- **Setelah tiap sinkron:** verifikasi 6.6, lalu `banding.mjs` untuk:
  - `folder-tasks 1100340000026652` (dengan dan tanpa `--closed`)
  - `tasks 1100340000065694` dan `tasks 1100340000065696`
  - `agenda --hours 26` (jam dan `sejak` dinormalisasi)
  - `task` + `comments --replies` untuk semua kartu terbuka
- **Uji routine tanpa mengubah env global:** di sesi uji, jalankan `TUGAS_BACKEND=tugas node tools/clickup.mjs …` dan bandingkan hasilnya dengan run biasa.
- **Go/no-go:**
  - Hitungan per list sama di 3 sinkron berturut-turut.
  - Tidak ada selisih diff yang tak terjelaskan selama 5 hari kerja.
  - 9 akun sudah berhasil login.
  - Host Supabase terjangkau dari env "Marketing".

### 6.8 Sinkron akhir dan cutover

1. H-1: Hannes mengumumkan jam beku.
2. Jam beku: tim berhenti mengubah ClickUp. ClickUp tidak diubah secara teknis.
3. `sinkron --mode akhir`, lalu verifikasi 6.6 (harus 100%), lalu rewrite URL gambar tersemat.
4. Set `mode='utama'`.
5. Hannes menambahkan `TUGAS_BACKEND=tugas` + URL + token ke env "Marketing".
6. Sesi uji menjalankan 5 perintah routine (agenda, folder-tasks, tasks ×2, comments z8r3fdd1wp) dan mencocokkannya dengan hasil sinkron akhir.
7. Pengumuman ke tim.
8. H+1: satu sapuan "deteksi" baca-saja ke ClickUp untuk menangkap perubahan yang masih masuk di ClickUp. Hasilnya berupa laporan untuk rekonsiliasi manual.

### 6.9 Rollback

- **Jendela 2 minggu setelah cutover (K15):** ClickUp tidak dihapus dan paketnya tidak diturunkan.
- **Tuas rollback:** hapus `TUGAS_BACKEND` dari env, sehingga routine kembali membaca ClickUp di sesi berikutnya.
- **Perubahan yang dibuat di aplikasi setelah cutover:** `sinkron.mjs --ekspor-sejak <cutover>` menghasilkan daftar dari activity, komentar baru dan tugas baru. Daftar ini dimasukkan ulang ke ClickUp secara manual, atau lewat skrip tulis dengan ACC Hannes.
- Sebelum cutover tidak ada yang perlu di-rollback.

---

## 7. Tahapan dan perkiraan

"Sesi" di sini berarti satu sesi kerja agent yang fokus selama beberapa jam.

| Tahap | Isi | Perkiraan | Butuh |
|---|---|---|---|
| 0 | Keputusan K1–K6, akses dan token | Tergantung Hannes | Hannes |
| 1 | Skema, RLS, trigger riwayat di dev ERP (staging), uji SQL (termasuk upaya ubah/hapus activity harus gagal) | 1–2 sesi | ACC K1 |
| 2 | Tarik data ClickUp (baca) + uji perilaku: urutan dan paginasi komentar, `date_updated` vs komentar, `include_closed` vs type done, `date_closed` saat buka ulang, lampiran private, `time_in_status`, checklist `z8r3fdet60`, email di `/team` | 1 sesi | `CLICKUP_API_TOKEN` |
| 3 | Edge API + `tugas.mjs` + golden diff | 2–3 sesi | Akses deploy function |
| 4 | Migrator idempoten, impor pertama, verifikasi hitungan | 1–2 sesi | — |
| 5 | UI (layar 1–10) | 3–5 sesi | — |
| 6 | Deploy Hostinger, 9 akun + bot, mode cermin, Actions sinkron dan backup | 1 sesi | Subdomain, deploy key, secrets |
| 7 | Paralel, banding harian, perbaikan | 1–3 sesi + 5–10 hari kerja kalender | — |
| 8 | Sinkron akhir, cutover, daftar perubahan rhj-brain | 1 sesi | ACC + env |

**Total 11–18 sesi agent ditambah masa paralel.** Asumsinya: volume data sekelas audit 23/9 (198 task), lingkup Fase 1 tidak bertambah, dan tiap keputusan dijawab Hannes dalam ≤1 hari kerja. Waktu tunggu Hannes belum dihitung. Tahap 2 sengaja ditaruh di depan karena hasilnya mengunci perilaku API.

---

## 8. Keputusan yang wajib ditanyakan ke Hannes

**Wajib sebelum mulai**

- **K1. Lokasi DB.**
  - Pilihan:
    - (a) Pause dev ERP lalu buat project Free baru (Rp0).
    - (b) Schema `tugas` di ERP produksi, dengan dev ERP sebagai staging (Rp0).
    - (c) Org Pro terpisah ($25 ≈ Rp449.619/bulan).
    - (d) Upgrade org ke Pro, 3 project ($45 ≈ Rp809.314/bulan).
  - **Rekomendasi: (b).** Dengan syarat: isolasi schema, tanpa FK ke tabel ERP, Edge Function terpisah, migrasi diuji di dev dulu, dan backup harian schema `tugas`.
  - (a) tidak disarankan: migrasi ERP 80–84 tercatat "Diterapkan ke DEV 15 Sep 2026. Belum ke produksi", jadi dev masih dipakai sebagai staging ERP.
  - Efek samping (b): 9 user tugas otomatis mendapat profil ERP `pending` lewat trigger `buat_profil_baru`. Mereka tidak bisa mengakses data ERP, tapi akan muncul di daftar user ERP.
  - Kalau ERP harus tidak tersentuh sama sekali, pilih (c).
- **K2. Frontend.** Subdomain Hostinger (rekomendasi, Rp0, pola sama dengan ERP), Cloudflare, atau Netlify. Nama subdomain juga perlu diputuskan. Rekomendasi: di domain yang sama dengan ERP, dengan noindex.
- **K3. Mode paralel.** Cermin satu arah (rekomendasi) atau isi ganda. Isi ganda menimbulkan konflik dan tidak cocok dengan "1× sinkron akhir".
- **K4. Tempat sinkron.** GitHub Actions 3×/hari (rekomendasi; Hannes mengisi secrets) atau manual dari sesi agent.
- **K5. Jalur cutover routine.**
  - Rekomendasi: shim dua-mode `clickup.mjs` + env flip. 6 prompt UI dan izin tidak berubah.
  - Alternatif: ganti nama ke `tugas.mjs` di semua file, lalu Hannes menempel ulang 6 prompt UI dan izin ditambah.
- **K6. Identitas agent.**
  - Rekomendasi: user bot "claude" (role bot) dengan token sendiri.
  - Alternatif: token atas nama Hannes, seperti sekarang.
  - Konsekuensi rekomendasi: `user` di komentar agent tidak lagi "hannes lowan". Deteksi "sudah dijawab Hannes" jadi akurat. Prefix `[Claude]` boleh tetap dipakai.

**Bisa diputuskan sambil jalan**

- **K7. Token.** Rekomendasi: token env "Marketing" ber-scope `baca`, sesuai routine yang READ-ONLY. Token `tulis` terpisah hanya untuk sesi interaktif.
- **K8. Hapus.** Rekomendasi: soft-delete, purge hanya owner. Bot boleh menghapus kartu buatannya sendiri yang berumur ≤60 menit (pagar supervisi: kartu dobel di run yang sama). Alternatif: agent tidak boleh menghapus sama sekali.
- **K9. Komentar lebih dari 25.** Rekomendasi: API dan CLI mengembalikan semua komentar, juga di mode ClickUp. Akibatnya output berubah untuk kartu dengan lebih dari 25 komentar. Jumlah kartu seperti itu belum dihitung.
- **K10. Field di luar daftar Fase 1.**
  - `start_date`: rekomendasi ya, karena dipakai.
  - `bobot` 1–3: rekomendasi ya, supaya B5 bisa dihitung.
  - Penanda "menunggu keputusan": rekomendasi tunda, tetap pakai konvensi nama BERSYARAT/CADANGAN/DITUNDA. Kalau dijadikan status baru, nilai `status` di output yang dibaca routine ikut berubah.
- **K11. Lampiran.** Rekomendasi: disalin ke Storage, dan URL gambar tersemat ditulis ulang saat sinkron akhir. Alternatif: link saja, yang putus bila ClickUp ditutup atau link dibuat private.
- **K12. Login.**
  - Email Michael: `michael@rodahammerindo.com` (ClickUp) atau `eppy.michael@gmail.com`.
  - Email Rengga: `luckyrengga1@gmail.com` perlu dipastikan.
  - Rekomendasi: akun dibuat owner tanpa email. SMTP bawaan hanya 2 email/jam.
- **K13. Hari libur.** Rekomendasi: tabel kosong yang diisi owner. Default Senin–Jumat.
- **K14. Checklist/tag lama** (bila ada di data). Rekomendasi: disimpan di `extra` dan ditampilkan hanya-baca.
- **K15. Jendela rollback.** Rekomendasi: 2 minggu. ClickUp tidak diubah atau diturunkan paketnya selama itu.
- **K16. Backup.** Rekomendasi: `pg_dump -n tugas` harian, dienkripsi, disimpan sebagai artifact Actions. Alternatif: Google Drive.

---

## 9. Risiko utama dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Output `tugas.mjs` berbeda dari `clickup.mjs` | Kode pemformatan disalin, bukan ditulis ulang. Golden diff tiap sinkron. Go/no-go 5 hari kerja tanpa selisih |
| Due mundur sehari (UTC vs WIB) | Simpan ms verbatim; `due_wib` = +7 jam, rumus sama dengan `clickup.mjs:85`. Kasus uji: due 00:00 WIB dan 12:00 WIB |
| Semantik `date_updated` dan urutan komentar tidak sama | Diukur dari data nyata di Tahap 2 sebelum API dikunci. Hasilnya ditulis di dokumen kontrak API |
| Rujukan ID lama putus | PK = ID ClickUp untuk semua entitas. Resolver URL. Constraint anti-bentrok untuk ID baru |
| Routine env "Marketing" tidak bisa menjangkau `*.supabase.co` | Dari sesi ini host Supabase terjangkau. Env "Marketing" belum dicek, jadi diuji di sesi env itu sebelum go/no-go |
| Sinkron memakan rate limit ClickUp yang dipakai routine | Jadwal di luar 07:00–09:15 WIB dan throttle ≤60 req/menit |
| Numpang di ERP produksi mengganggu ERP | Schema terpisah, tanpa FK silang, migrasi diuji di dev dulu, ACC per migrasi, backup schema `tugas`, fungsi Edge terpisah |
| Free tier tanpa backup | `pg_dump` harian terenkripsi. Dump pertama sebelum cutover |
| Data rahasia bocor lewat repo, log atau fixture | Data asli hanya di DB dan scratch. Fixture repo sintetis. Log Actions hanya berisi hitungan. Token di-hash |
| Riwayat lama tidak lengkap sehingga verifikator salah menilai | Label "sebagian, aktor tak diketahui". Event sinkron selama paralel. Snapshot saat ditutup dicatat mulai cutover |
| Lampiran atau gambar tersemat putus setelah ClickUp ditinggal | Salin ke Storage, rewrite URL saat sinkron akhir, uji URL private di Tahap 2 |
| Username berubah sehingga deteksi routine rusak | Username impor dikunci. Bot memakai user terpisah |
| Signed URL kedaluwarsa di tengah run routine | Masa berlaku 24 jam. `/api/x/file/{id}` bisa membuat URL ulang |
| Tim bingung selama paralel dan mengisi di dua tempat | Mode cermin: data impor tidak bisa diubah di aplikasi, banner sumber utama |
| Prompt UI tidak bisa diubah agent | Shim dua-mode. Cutover dan rollback cukup lewat env |

---

## Fakta yang saya cek sendiri di sesi ini (29/9)

- `/home/user/rhj-brain/tools/clickup.mjs`:
  - `brief()` di L86-92
  - `getComments()` tanpa paginasi di L94-106
  - `allTasks` dengan `subtasks=true` dan 100 per halaman di L108-116
  - definisi closed di L175
  - `toMs` 12:00 WIB di L83
  - `Number()` pada assignee di L212 dan L228-229
  - `move` lewat URL v3 absolut di L244
  - header `Authorization` mentah di L58
- Tool Supabase MCP di sesi ini: ada `execute_sql`, `list_*` dan `get_*`. Tidak ada `create_project`, `deploy_edge_function`, `apply_migration`, maupun pause/restore.
- `curl https://hyjiuefqnsrofpebaydt.supabase.co/functions/v1/` dari sesi ini mengembalikan HTTP 404 (server terjangkau lewat proxy). `api.clickup.com` mengembalikan 400 tanpa token. Env "Marketing" belum dicek.
- `/home/user/RHJ-Website/db/80–84*.sql` memuat catatan "Diterapkan ke DEV (eesdtbcualkdawhykchj) 15 Sep 2026. Belum ke produksi."
- `/home/user/rhj-tugas` baru berisi `README.md` dan `BACKLOG.md` (daftar di luar Fase 1).