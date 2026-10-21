# Edge Function `api`

REST untuk agent, CLI, dan importer. Meniru ClickUp v2 dan menambah endpoint `/x`. Kontraknya ada di `docs/ARSITEKTUR.md` §8 dan `docs/KONTRAK-DB.md`. Fungsi ini tanpa dependensi: semua panggilan memakai `fetch` ke PostgREST, Storage, dan GoTrue dengan `SUPABASE_SERVICE_ROLE_KEY`.

## Base URL
- Cloud: `https://<ref>.supabase.co/functions/v1/api`. Lokal: `http://127.0.0.1:54321/functions/v1/api`.
- Runtime meneruskan path lengkap, jadi fungsi melihat `/api/v2/...`. Awalan ganda `/api/api/v2` juga diterima.
- **`TUGAS_API_URL` untuk CLI = `<base>/v2`**. Nilai lokal yang sudah diuji: `http://127.0.0.1:54321/functions/v1/api/v2`.
- `config.toml` berisi `[functions.api] verify_jwt = false`, karena fungsi memakai token sendiri, bukan JWT Supabase. Saat deploy: `supabase functions deploy api --no-verify-jwt`.

## Auth
- **Token:** header `Authorization: rtk_…`; `Bearer rtk_…` juga diterima.
  - Token di-hash sha256, lalu dicek dengan `api_token_cek`.
  - `token_id` diteruskan ke DB lewat header `x-token-id`. Hasilnya: `activity.token_id` terisi, dan DB mengecek scope lagi sebagai lapis kedua.
- **Scope:**
  - `baca`: semua GET.
  - `tulis`: ditambah POST/PUT.
  - `impor`: ditambah `/x/impor/*` dan `/x/export`.
  - DELETE hanya untuk token dengan role owner.
- **Admin:** hanya `/x/admin/*`, memakai header `x-sesi: <access_token user>`. JWT dicek lewat GoTrue, dan pemiliknya wajib owner aktif.
- **Burst:** ember per token (hash) per isolate, kapasitas `TUGAS_API_BURST` (40), isi ulang `TUGAS_API_LAJU` (20/detik). Bila habis: `429 {err:"Rate limit", ECODE:"APP_002"}` dengan header `Retry-After` dan `x-ratelimit-reset`. Batas ini tidak global lintas instance.

## Galat
Bentuk galat `{err, ECODE}` dengan status HTTP:
- `PT4xx` dari DB diteruskan apa adanya (`ITEM_013`, `ACCESS_001`, `HAPUS_OWNER`, `CERMIN_001`, `KONFLIK_001`, `INPUT_001`, `OAUTH_019`).
- Tanpa token → `401 OAUTH_017`.
- Rute tak dikenal → `404 APP_001`. Method salah → `405`.
- `42501`/`PGRST*` → `500 APP_500`, dengan detail hanya di log.

## Rute
| Method | Path | RPC / aksi |
|---|---|---|
| GET | `/v2/user`, `/v2/team` | `api_user`, `api_team` |
| GET | `/v2/team/{tid}/space?archived=` | `api_spaces` (`tid` harus id workspace) |
| GET | `/v2/space/{id}/folder`, `/v2/space/{id}/list`, `/v2/folder/{id}/list` (`?archived=`) | `api_space_folders`, `api_space_lists`, `api_folder_lists` |
| GET | `/v2/list/{id}` | `api_list` |
| GET | `/v2/list/{id}/task?page&include_closed&subtasks&archived&include_markdown_description&date_updated_gt` | `api_list_tasks`. Parameter filter lain (`statuses[]`, `order_by`, …) → 400, tidak diabaikan diam-diam |
| POST | `/v2/list/{id}/task` (header `x-rhj-idem` / `Idempotency-Key` opsional) | `api_create_task` |
| GET | `/v2/list/{id}/field` | `{fields:[]}` (404 bila list tak ada) |
| GET / PUT / DELETE | `/v2/task/{id}` (`?include_markdown_description=true`) | `api_task` (lampiran → signed URL 24 jam) / `api_update_task` / `api_delete_task` |
| GET / POST | `/v2/task/{id}/comment` (`?start&start_id`) | `api_task_comments` (semua komentar; `start` menyaring yang lebih tua) / `api_create_comment` |
| GET / POST | `/v2/comment/{id}/reply` | `api_comment_replies` / `api_create_reply` |
| POST | `/v2/task/{id}/attachment` (scope `tulis`, `multipart/form-data`: `file` wajib, `title`/`comment_id` opsional) | Unggah SATU berkas: service role menaruh ke Storage `t/<task>/<rand>-<nama>` lalu `x_lampiran_catat`. Allowlist MIME + 25 MB (bucket); kartu ClickUp saat mode cermin → ditolak trigger (`CERMIN_001`); tugas tak terlihat → 404. Balas objek lampiran + `url` (signed 24 jam). Kirim `Content-Type` berkas yang benar (tanpa itu jadi `application/octet-stream` → ditolak allowlist) |
| PUT | `/v3/workspaces/{tid}/tasks/{id}/home_list/{list}` | `api_move_task` |
| GET | `/x/task/{id}/activity` (alias `/x/activity/{id}`) | `x_activity` |
| GET | `/x/resolve?ref=` · `/x/search?q=&space=&include_closed=` | `x_resolve` · `x_search` |
| GET | `/x/tenggat?tanggal=&folder=` · `/x/sensus?sumber=` | `x_tenggat` · `x_sensus` |
| GET | `/x/count?list=&folder=&space=&sumber=` | `x_sensus` disaring; `total` dijumlah ulang, tanpa sha |
| GET | `/x/export` (scope impor) | `x_export` |
| GET | `/x/pipeline/leads?tab=&pemilik=&q=` · `/x/pipeline/lead/{id}` · `/x/pipeline/ringkas?dasar=&bulan=` | `x_pipeline_daftar` · `x_pipeline_lead` · `x_pipeline_ringkas` (baris & detail lead memuat `sumber_bukti*`) |
| POST | `/x/pipeline/fu` (scope tulis) `{items:[{lead_id, tanggal?}]}` | `x_pipeline_fu_set`: rencana FU lead (tab "Follow up hari ini") |
| POST | `/x/pipeline/sumber-bukti` (scope tulis; aktor owner/bot/admin Pipeline) `{items:[{lead_id, bukti, kode?, chat_pada?}]}` maks 200 | `x_pipeline_sumber_bukti_set`: bukti asal lead dari chat WA (kelas pola tetap, mis. `situs-rh`, `ga-oy` + kode `GA-OY-7K3F`). Tidak menyentuh `sumber` isian sales. Semua-atau-tidak, idempoten; balas `{diproses, diubah, sama, items:[{lead_id, ok, diubah}]}`. Rincian `docs/KONTRAK-DB.md` §11 |
| POST | `/x/rawat/lampiran` (scope impor, owner/bot; body opsional `{hari?:int, dry?:bool}`) | Perawatan: `x_rawat_lampiran` men-soft-delete lampiran app pada kartu selesai > N hari (setelan `app_settings.rawat_lampiran` `{aktif,hari}`, default 7; hanya `sumber=app`, salinan ClickUp dibiarkan), lalu service role menghapus BERKAS-nya. `dry` → hanya hitung. Balas `{hari, dihapus, berkas_dihapus, berkas_sisa, berkas_gagal}` (atau `{dilewati:true}` bila setelan `aktif=false`). Dipanggil job terjadwal `rawat.yml` |
| GET | `/x/file/{attachment_id}` | 302 ke signed URL (atau `clickup_url`) |
| POST | `/x/impor/batch` `{jenis, rows, mode?, at_awal?}` | `impor_batch` |
| POST | `/x/impor/hilang` `{jenis, ids_ada, mode?, lingkup?}` | `impor_tandai_hilang` |
| POST | `/x/impor/run` `{aksi:"mulai", mode}` / `{aksi:"selesai", id, counts?, census?, diffs?, errors?}` (atau `/x/impor/run/mulai`, `/x/impor/run/selesai`) | `impor_run_mulai` / `impor_run_selesai` |
| POST | `/x/impor/upload-url` `{path:"t/<task>/<nama>"}` atau `{task_id, nama}`, `upsert?` | Signed upload URL Storage (PUT berkas ke `url`, berlaku 2 jam), KHUSUS salinan lampiran kartu asal ClickUp. Kartu buatan app → 403 `ACCESS_001` (lampiran app diunggah anggota lewat web). Path sudah ada → 409. `upsert:true` hanya menimpa path yang sudah tercatat sebagai lampiran `sumber=clickup`; path yang dirujuk lampiran app → 403; path lain diperlakukan tanpa upsert (sudah ada → 409) |
| POST | `/x/admin/akun` `{member_id, email, password_sementara}` (x-sesi owner) | GoTrue admin create/update, lalu `x_admin_akun` (`harus_ganti_password=true`). Hasil + `akun_baru` |
| POST | `/x/admin/reset` `{member_id, password_sementara}` (x-sesi owner) | GoTrue admin update password, lalu `x_admin_akun` |
| POST | `/x/admin/purge` `{task_id}` (x-sesi owner) | `web_purge` dijalankan sebagai user (JWT sesi), lalu objek `storage_paths` dihapus dengan service role. Hasil `web_purge` + `storage_dihapus`, `storage_sisa`, `storage_gagal`. UI Sampah sebaiknya memanggil ini, bukan `web_purge` langsung, supaya berkas tidak yatim |

## CORS
- Origin yang diizinkan: origin `app_settings.app_base_url` (cache 5 menit) serta `http://localhost:*` dan `http://127.0.0.1:*`.
- Preflight dari origin lain → 403.
- **Di lokal**, Kong menjawab preflight sendiri dan memasang `access-control-allow-origin: *` di semua respons `/functions/v1/*`. Jadi CORS milik fungsi hanya terlihat di cloud, atau bila runtime diakses langsung (`http://<ip kontainer edge>:8081/api/...`, dipakai `uji/kontrak`).

## Env opsional
| Env | Default | Fungsi |
|---|---|---|
| `TUGAS_API_BURST` | 40 | Kapasitas ember burst per token |
| `TUGAS_API_LAJU` | 20 | Isi ulang ember, per detik |
| `TUGAS_PUBLIC_SUPABASE_URL` | lihat keterangan | URL publik untuk signed URL. Default: `SUPABASE_URL`; di lokal `http://127.0.0.1:<port>` |
