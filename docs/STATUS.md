# STATUS rhj-tugas (Fase 1)

Diperbarui 29 Sep 2026 (verifikasi akhir sesi build). Kontrak: `docs/ARSITEKTUR.md` + rincian DB `docs/KONTRAK-DB.md`.

## Verdict
- Kode Fase 1 (F1–F4 + kode F5: sinkron, backup, workflow) **jadi dan lulus semua suite lokal** dari `supabase db reset`: DB 942 cek, kontrak Edge+CLI 450 cek, importer 102 cek, web 48 tes Playwright. Banding `clickup.mjs` ↔ `tugas.mjs`: kode keluar identik di 340/340 (awal) dan 344/344 (ubah) perintah; sisa beda hanya PR-1 (tags/checklists).
- **Belum ada di cloud.** Belum ada project Supabase, belum deploy, belum probe/impor ClickUp asli, belum ada akun anggota. Semua angka di bawah = stack lokal + data sintetis.

## Yang sudah jadi
| Bagian | Lokasi | Isi |
|---|---|---|
| Database | `supabase/migrations/` (13 berkas) | Tabel §2 + `space_anggota`, trigger (activity append-only, status/due/updated_at, notifikasi, snapshot tutup), RLS, bucket `lampiran` + policy, fungsi `api_*`/`x_*`/`impor_*`/`web_*`. Rincian & deviasi: `docs/KONTRAK-DB.md` |
| Seed dev | `supabase/seed.sql` | Data SINTETIS lokal saja (JANGAN dimuat ke cloud) |
| Edge API | `supabase/functions/api/` | REST tiruan ClickUp v2/v3 + `/x/*` + admin akun/reset/purge; `verify_jwt=false` (`config.toml`) |
| CLI | `cli/tugas.mjs` | Salinan `clickup.mjs` dua-mode (tugas/clickup) + `activity`, `resolve`, `search`, `verify`, `tenggat`, `backend`, balasan komentar. Panduan cutover: `cli/README.md` |
| Importer/sinkron | `impor/sinkron.mjs` | ClickUp (GET saja) → `/x/impor/*`, sensus selisih 0, tandai hilang dengan pengaman, salin lampiran. `impor/README.md` |
| Backup | `impor/cadangan.mjs` | `/x/export` + salin lampiran, dienkripsi `age` di workflow |
| Workflow | `.github/workflows/sinkron.yml`, `backup.yml` | Sinkron 05:45 WIB, backup 03:15 WIB (+ lampiran mingguan). Hanya jalan bila variable `SINKRON_AKTIF`/`BACKUP_AKTIF` = `1` |
| Web | `web/` | Statis tanpa build, PWA. Layar: masuk, ganti password, Tugas Saya, Jelajah, List/Board, Detail (komentar, @mention, lampiran, riwayat, B5), Cari, Notifikasi, Admin (anggota, status, struktur, libur, token, mode, sinkron), Sampah. `.htaccess` untuk Hostinger |
| Tes | `uji/db`, `uji/kontrak`, `impor/uji`, `uji/banding.mjs`, `uji/web` | Lihat hasil di bawah |

## Menjalankan lokal
Prasyarat: Docker, Node 22, Deno 2, psql, Supabase CLI (`/tmp/sbcli/node_modules/.bin/supabase` di sesi ini; atau `npx supabase`).
```
cd rhj-tugas
npm ci                                   # playwright + pustaka vendor (untuk tes & salin-vendor)
supabase start                           # stack lokal: API 127.0.0.1:54321, DB 54322
supabase db reset                        # 13 migrasi + seed sintetis
supabase functions serve                 # Edge api (biarkan jalan di terminal lain)
npm run web:serve                        # web di http://127.0.0.1:4173 (config.js otomatis pakai stack lokal)
```
- Login lokal: `budi.uji@contoh.test` (owner), `citra.uji@contoh.test` / `dodi.uji@contoh.test` / `eka.uji@contoh.test` (member), password `rahasia-dev-123` (seed, dev saja).
- CLI lokal: `TUGAS_API_URL=http://127.0.0.1:54321/functions/v1/api/v2 TUGAS_API_TOKEN=rtk_… node cli/tugas.mjs whoami` (token dari Admin → Token API).
- **Nilai final `TUGAS_API_URL` = `<SUPABASE_URL>/functions/v1/api/v2`** (diuji lokal; awalan ganda `/api/api/v2` juga diterima). Menjawab catatan terbuka ARSITEKTUR §8.

Suite (urutan yang dipakai verifikasi ini):
```
bash uji/db/jalankan.sh                  # psql, 15 berkas
node uji/kontrak/jalankan.mjs            # Edge + CLI, butuh functions serve
node impor/uji/jalankan.mjs              # importer vs mock ClickUp (port 54399)
node uji/banding.mjs                     # varian awal; juga --varian ubah; --izinkan-diketahui untuk mengabaikan PR-1
npx playwright test -c uji/web/playwright.config.mjs
node uji/web/salin-vendor.mjs --cek      # integritas pustaka vendor
```

## Hasil tes (29 Sep 2026, dijalankan 2 putaran, masing-masing dari `supabase db reset`)
| Suite | Putaran 1 | Putaran 2 |
|---|---|---|
| `uji/db/jalankan.sh` | 15 berkas, 942 cek lulus, 0 gagal | 15 berkas, 942 cek lulus, 0 gagal |
| `uji/kontrak/jalankan.mjs` | 450 lulus, 0 gagal | 450 lulus, 0 gagal |
| `impor/uji/jalankan.mjs` | 102 lulus, 0 gagal | 102 lulus, 0 gagal |
| `uji/banding.mjs` (awal) | sebelum perbaikan: exit 1, 7 perintah beda kode keluar (space privat, lihat bawah) + PR-1. Sesudah: kode keluar sama 340/340, lampiran 6/6 ok, sisa 4 entri di 2 perintah = PR-1 saja (exit 1; `--izinkan-diketahui` → exit 0) | kode keluar sama 340/340, lampiran 6/6 ok, sisa = PR-1 saja (exit 1); `--lewati-impor --izinkan-diketahui` → exit 0 |
| `uji/banding.mjs --varian ubah` | kode keluar sama 344/344, lampiran 5/5 ok, sisa = PR-1 saja; DB dipulihkan ke varian awal | kode keluar sama 344/344, lampiran 5/5 ok, sisa = PR-1 saja; DB dipulihkan ke awal (impor kode 0, selisih 0) |
| Playwright `uji/web` | 48 lulus, 0 gagal (1,3 menit) | 48 lulus, 0 gagal (1,4 menit) |
| `uji/db` diulang di DB kotor (sesudah semua suite) | 942 lulus, 0 gagal | 942 lulus, 0 gagal |
| `salin-vendor.mjs --cek` | 4 pustaka cocok | — |

**Perbaikan saat verifikasi (1 baris kode + 1 baris komentar):** `uji/banding.mjs` sebelum membuat token baca. Token baca banding milik pemilik token ClickUp tiruan (role ClickUp 1), yang diimpor sebagai `member` (review R1). Space privat fixture tidak punya `space_anggota` karena importer belum mengirim `members` (review R2), jadi app menjawab 404 sementara ClickUp tiruan menyajikannya. Perbaikan: beri pemilik token keanggotaan space privat fixture (`sumber app`, `on conflict do nothing`). Bukan perubahan perilaku app.

**Pemindaian secret** (137 berkas yang akan di-commit sebelum STATUS.md ditambahkan, `git ls-files -co --exclude-standard`): pola JWT, `sb_secret_`/`sb_publishable_`, `sbp_`, `pk_<angka>_`, `rtk_`, `ghp_`/`github_pat_`, `sk-ant-`, token Telegram, `AGE-SECRET-KEY`, kunci privat PEM, `AKIA`, serta nilai kunci lokal dari `supabase status` (service role, secret, JWT secret, S3). Hasil: tidak ada secret. Temuan yang aman: anon key DEMO bawaan Supabase CLI di `web/config.js` (blok LOKAL, `iss: supabase-demo`, kunci publik), token palsu `rtk_salah…`/`rtk_tiruan`/`pk_salah` di tes. Email asli hanya ada di `docs/riset/*` dan `docs/RENCANA-FASE1.md` (sudah ter-commit sebelumnya; repo private). Folder yang di-ignore: `uji/web/hasil/`, `impor/laporan/`, `uji/banding/hasil/`, `node_modules/`.

## Deviasi dari ARSITEKTUR (sadar, tercatat)
Daftar lengkap 15 butir di `docs/KONTRAK-DB.md` §8 dan tabel review R1–R5 §9. Yang paling berdampak:
- **Privasi space (R2)** menggantikan §4 "member lihat semua": space privat hanya untuk `space_anggota` + owner/bot + assignee per kartu. Setelan `app_settings.privasi_space` = `tegakkan` (default) / `abaikan`.
- **Komentar menaikkan `updated_at` (R4)**, kebalikan catatan "sementara" §3, supaya `agenda --hours` menangkap kartu yang hanya dapat komentar.
- **Impor tidak pernah membuat owner (R1)**: anggota impor selalu `member`; baris owner/bot dilindungi dari impor.
- `/x/export` butuh token scope `impor` dan hanya owner/bot. `POST /v2/task/{id}/attachment` → 501 (ditunda Fase 1, boleh menurut §8).
- Burst limit per isolate Edge (40 kapasitas, 20/detik), bukan global.

## Masalah terbuka
1. **PR-1**: `tags` dan `checklists` kartu impor selalu `[]` di API app, padahal isinya tersimpan di `tasks.extra`. Terlihat di `task <id>` dan `tasks --full`. Perlu keputusan: isi dari `extra` (perubahan `j_task`) atau terima sebagai beda. Belum dicek apakah routine rhj-brain membaca tags/checklists.
2. **Space privat ClickUp**: importer belum mengirim `members` space, jadi space privat asli hanya terlihat owner/bot + assignee kartunya. Riset K8 menyebut Online Sales kemungkinan privat, artinya Riksa/Michael bisa kehilangan tampilan list itu. Tindakan setelah impor: cek `spaces.private`, lalu isi anggota lewat Admin → Struktur, atau set `privasi_space` = `abaikan`, atau tambahkan pengiriman `members` di importer bila probe menunjukkan ClickUp menyediakannya.
3. **Asumsi yang belum diprobe ke ClickUp asli** (mock mengikuti asumsi; `uji/banding/README.md`): urutan default `GET /list/{id}/task`, `include_closed=false` ikut membuang `done`, urutan balasan, lampiran komentar ikut di `task.attachments`, urutan assignees, `text_content` kosong = `""`, `reply_count` string, `date` lampiran string, `date_updated` naik saat komentar (R4), paginasi komentar 25, lampiran bisa diunduh tanpa login, email anggota tersedia.
4. **Rengga** (ClickUp 246027506) belum menerima undangan per 28/9. Kalau tidak ada di `/team`, impor hanya membuatnya anggota nonaktif (bila muncul sebagai assignee/penulis) atau tidak sama sekali.
5. **Bootstrap owner & bot belum ada skripnya**: migrasi tidak membuat anggota. Langkah SQL manual ada di bawah; sudah diuji lokal dengan identitas sintetis dalam transaksi yang di-rollback: bot mendapat ID ≥ 900000000000, 3 token `rtk_…` terbentuk, `impor_batch members` berikutnya melaporkan owner `dilindungi` dan tidak mengubah role/username.
6. `app_settings.tenggat_folder_ids` default `["1100340000026652"]` (folder RHJ Eksekusi menurut riset). Cocokkan dengan ID folder hasil impor.
7. Banding harian `clickup.mjs` ↔ `tugas.mjs` di data asli selama paralel (RENCANA §5.5) belum punya workflow; baru ada banding fixture.
8. Pemakaian Edge per bulan (batas Free 500 ribu) dan kuota subdomain Hostinger: belum dihitung/dicek.
9. `web/config.js` blok PRODUKSI dan `web/.htaccess` (CSP) masih berisi `GANTI_REF` / `GANTI_DENGAN_PUBLISHABLE_KEY`.

## LANGKAH SESI BERIKUTNYA (deploy F5 → mulai paralel)
Prasyarat dari Hannes: project Supabase baru `rhj-tugas` (akun/org baru, Singapore, Free); env cloud `SUPABASE_ACCESS_TOKEN` (PAT akun baru) + `SUPABASE_PROJECT_REF`; `CLICKUP_API_TOKEN` (sudah ada); sesi baru supaya env terbaca. Semua langkah ke ClickUp **GET saja**. Tidak memakai MCP Supabase (itu ERP).

### 0. Pagar & alat (PALING AWAL, sebelum apa pun)
1. **Supabase lama (akun/org palletmeshindonesia: ERP `rhj-tracker` + `rhj-tacker.dev`) = BACA-SAJA, perintah Hannes 29/9.** Pengaman di sesi build tinggal di container lama, jadi pasang ulang di `~/.claude/`:
   - `~/.claude/hooks/supabase-readonly.sh`: PreToolUse untuk `mcp__Supabase__execute_sql`. Tolak query yang cocok dengan `\b(insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|vacuum|reindex|cluster|copy|call|refresh|lock|comment\s+on|security\s+label|set\s+role|reset\s+role|nextval|setval|set_config|pg_terminate_backend|pg_cancel_backend|lo_import|lo_unlink|dblink)\b|\bdo\s*\$`. Keluarannya `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}`.
   - `~/.claude/settings.json`: `permissions.deny` untuk semua tool MCP Supabase yang bisa menulis (`apply_migration`, `create_project`, `pause_project`, `restore_project`, `deploy_edge_function`, `create_branch`, `delete_branch`, `merge_branch`, `reset_branch`, `rebase_branch`) + hook di atas.
   - Uji dengan query SELECT yang berisi kata `drop` di komentar: harus ditolak.
   - Project baru `rhj-tugas` dikerjakan lewat Supabase CLI/Management API dengan `SUPABASE_ACCESS_TOKEN` (PAT akun baru), **tidak** lewat MCP Supabase.
2. Alat:
   - Supabase CLI: `mkdir -p /tmp/sbcli && cd /tmp/sbcli && npm i supabase` → `/tmp/sbcli/node_modules/.bin/supabase`.
   - Deno: `npm i -g deno@2`.
   - Docker (untuk stack lokal/tes): `dockerd &` bila daemon belum jalan, lalu `supabase start -x studio,imgproxy,vector,logflare,supavisor,mailpit,realtime`.
   - `npm ci` di repo.
3. Mode multi-agent: Hannes membuka sesi dengan kata `ultracode`.

### 1. Cek target (wajib sebelum menulis apa pun)
```
supabase projects list                       # PAT harus hanya melihat project akun baru
echo "$SUPABASE_PROJECT_REF"                 # harus ref rhj-tugas, BUKAN ref ERP
```

### 2. Skema, fungsi, konfigurasi
```
supabase link --project-ref "$SUPABASE_PROJECT_REF"      # tanpa password: CLI pakai login role sementara; gagal → minta SUPABASE_DB_PASSWORD
supabase db push --linked --dry-run                     # harus 13 migrasi, TANPA --include-seed (seed sintetis tidak boleh ke cloud)
supabase db push --linked
supabase migration list --linked                         # lokal = remote, 13 baris
supabase functions deploy api --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
curl -s https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/api/v2/user     # harus 401 {"ECODE":"OAUTH_017"}
```
Auth (Management API; jangan `supabase config push` karena akan mengirim `site_url` lokal):
```
curl -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "content-type: application/json" \
  -d '{"disable_signup":true,"external_email_enabled":true,"site_url":"https://tugas.palletmeshindonesia.com","uri_allow_list":"https://tugas.palletmeshindonesia.com/**","password_min_length":8}'
```
Lalu GET endpoint yang sama dan pastikan `disable_signup=true`. Uji: `POST /auth/v1/signup` dengan publishable key harus ditolak.

Periksa bucket (dibuat migrasi `…100400_storage_lampiran.sql`), lewat `POST /v1/projects/$REF/database/query` (PAT):
`select id, public, file_size_limit, allowed_mime_types from storage.buckets;` → `lampiran`, `false`, `26214400`, allowlist tanpa SVG/HTML.

Periksa env Edge: `SUPABASE_SERVICE_ROLE_KEY` terisi (JWT lama atau `sb_secret_`; `index.ts` menangani keduanya). Ambil kunci: `supabase projects api-keys --project-ref $REF` (jangan cetak ke log/commit). Bila project baru tidak punya kunci lama (anon/service_role), status & sakelarnya ada di `GET/PUT /v1/projects/$REF/api-keys/legacy`; web cukup memakai publishable key (`sb_publishable_…`) di `config.js`.
Endpoint Management API di atas (`/database/query` body `{query}`, `/config/auth` field `disable_signup`/`site_url`/`uri_allow_list`/`password_min_length`/`external_email_enabled`, `/cli/login-role`) sudah dicocokkan dengan spesifikasi OpenAPI `api.supabase.com/api/v1-json` per 29 Sep.

### 3. Bootstrap owner (Hannes) + bot
a. User Auth Hannes **dibuat Hannes sendiri** di dashboard project baru (Authentication → Users → Add user, email `hanneslowan@gmail.com`, password pilihannya, Auto Confirm), sesuai instruksi 29/9. Ambil UUID-nya lewat GoTrue admin (service/secret key, jangan disimpan di repo): `GET https://$REF.supabase.co/auth/v1/admin/users` → cari email itu. Password sudah dipilih Hannes sendiri, jadi set `harus_ganti_password=false` di SQL b. Bila user belum ada, jangan membuat password untuk Hannes; minta dia menambahkannya dulu di dashboard.
b. SQL (Management API query; satu transaksi):
```sql
begin;
insert into public.members (id, username, email, clickup_email, nama, initials, role, aktif, auth_user_id, harus_ganti_password)
values (312823267, 'hannes lowan', 'hanneslowan@gmail.com', 'hanneslowan@gmail.com', 'Hannes Lowan', 'HL', 'owner', true,
        '<UUID_AUTH_HANNES>', false);
insert into public.members (username, nama, initials, role) values ('claude (agent)', 'Claude (agent)', 'CA', 'bot') returning id;  -- 900000000000
commit;
```
ID Hannes = ID ClickUp, jadi impor mengenali barisnya dan tidak menyentuhnya (owner dilindungi, R1).
c. Token (tampil SEKALI; langsung ke secret, jangan ke log/commit). Satu transaksi sebagai Hannes:
```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<UUID_AUTH_HANNES>","role":"authenticated"}', true);
set local role authenticated;
select public.web_admin_token_buat(<BOT_ID>, 'importer', 'impor');         -- TUGAS_IMPORT_TOKEN (GitHub secret + env sesi impor)
select public.web_admin_token_buat(<BOT_ID>, 'backup', 'impor');           -- TUGAS_EXPORT_TOKEN (GitHub secret)
select public.web_admin_token_buat(<BOT_ID>, 'routine', 'baca');           -- TUGAS_API_TOKEN routine (dipakai saat paralel/cutover)
select public.web_admin_token_buat(<BOT_ID>, 'sesi interaktif', 'tulis');  -- TUGAS_API_TOKEN sesi interaktif (tanpa hapus)
commit;
```
Alternatif: Hannes membuatnya sendiri di Admin → Token API setelah login.

### 4. Probe + impor asli
1. Probe GET ClickUp untuk asumsi di Masalah terbuka #3 (pakai `rhj-brain/tools/clickup.mjs` baca-saja atau `curl` GET). Termasuk: apakah `GET /team/{id}/space` memberi `members` untuk space privat.
2. `node impor/sinkron.mjs --mode penuh --dry-run` dengan `CLICKUP_API_TOKEN`, `TUGAS_API_URL=https://$REF.supabase.co/functions/v1/api/v2`, `TUGAS_IMPORT_TOKEN` → hanya baca.
3. `node impor/sinkron.mjs --mode penuh` → wajib exit 0, `sensus.selisih = 0`. Laporan di `impor/laporan/` (gitignored, JANGAN commit).
4. Jalankan ulang `--mode penuh` → idempoten (`inserted 0`, `updated 0`).

### 5. Verifikasi sensus
- `GET /x/sensus?sumber=clickup` (token bot) vs sensus crawler: per list `tasks_total, open, closed, archived, subtasks, comments_top, replies, attachments_*, assignee_links, sha_ids_*` selisih 0. Serahkan tabel angka per list ke Hannes (tanpa nama kartu). Pembanding lama (23/9): 3 space, 11 list, 198 tugas (146 open, 52 closed), 65 lampiran 16,1 MB; angka sekarang belum dihitung.
- Lampiran: hitung `status_salin` ok/gagal/tautan_saja.
- Cek `spaces.private` (Masalah #2) dan `tenggat_folder_ids` (Masalah #6).
- Banding manual data asli: `node rhj-brain/tools/clickup.mjs agenda` vs `node cli/tugas.mjs agenda` (dan `task`/`comments --replies` beberapa kartu) → beda hanya N1–N11 + PR-1.

### 6. Akun 9 anggota
Setelah impor, anggota sudah ada dengan ID ClickUp. Hannes (owner) → Admin → Anggota → **Aktifkan login** (Edge `/x/admin/akun`, password sementara tampil sekali, wajib ganti saat login pertama).
| Nama | Email login | ID ClickUp | Peran |
|---|---|---|---|
| Hannes Lowan | hanneslowan@gmail.com | 312823267 | owner (bootstrap langkah 3) |
| Yosie | yosie.rahels@gmail.com | 240024679 | member |
| Peter Wijaya | peterlimwijaya@gmail.com | 240032050 | member (kontrak habis 15 Okt) |
| Agus Jamal | agusj84@gmail.com | 113661628 | member |
| D. R. Widjaja (Darwis) | darwisrw@gmail.com | 312824551 | member |
| Felix | felixsky03@gmail.com | 240149728 | member |
| Riksa Sri Gustiana | riksasrigustianacrm@gmail.com | 240260558 | member |
| Michael Eppy | michael@rodahammerindo.com (asumsi; alternatif eppy.michael@gmail.com) | 240260567 | member |
| Rengga Luckitanto | luckyrengga1@gmail.com (asumsi) | 246027506 (undangan belum diterima per 28/9) | member |
Sumber: `docs/riset/baca-pagar.md` §2. Email Michael & Rengga = asumsi yang bisa dikoreksi Hannes. Kirim password sementara lewat jalur pribadi (bukan grup).

### 7. Web di Hostinger
1. Isi `web/config.js` blok PRODUKSI (`SUPABASE_URL=https://<ref>.supabase.co`, publishable/anon key) dan ganti `GANTI_REF` di `web/.htaccess` (CSP img-src, connect-src https + wss). Bila domain bukan `tugas.palletmeshindonesia.com`, ubah juga `app_settings.app_base_url` (dipakai CORS Edge & URL kartu).
2. Commit, lalu `git subtree split --prefix=web -b web` → `git push origin web` (akar branch `web` = isi `web/`). Pengulangan: split ulang ke branch yang sama.
3. hPanel: subdomain `tugas.palletmeshindonesia.com` + SSL; Git → repo rhj-tugas branch `web` ke folder subdomain; deploy key Hostinger dipasang read-only di GitHub; webhook auto-deploy.
4. Uji: `/masuk` tampil tanpa galat CSP, login Hannes → wajib ganti password, `/t/<id ClickUp>` langsung membuka kartu, header `X-Robots-Tag: noindex`.

### 8. GitHub Actions
- Secrets: `CLICKUP_API_TOKEN`, `TUGAS_API_URL`, `TUGAS_IMPORT_TOKEN`, `TUGAS_EXPORT_TOKEN`, `BACKUP_AGE_PUBKEY` (Hannes buat `age-keygen` di perangkatnya; kunci privat TIDAK ke GitHub).
- Variables: `SINKRON_AKTIF=1`, `BACKUP_AKTIF=1`.
- Uji `workflow_dispatch`: sinkron `dry_run` dulu, lalu penuh; backup + uji buka dengan kunci privat (uji restore).

### 9. Tutup sesi
Laporan ke Hannes: angka sensus per list, status lampiran, jawaban probe, keputusan PR-1 dan privasi space. Mode tetap `cermin`; routine tetap memakai ClickUp sampai cutover (F7).
