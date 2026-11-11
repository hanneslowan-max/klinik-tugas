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
- **Admin:** hanya `/x/admin/*` (akun, reset, purge, berita-tarik, wa-pengetahuan), memakai header `x-sesi: <access_token user>`. JWT dicek lewat GoTrue, dan pemiliknya wajib owner aktif.
- **Tanpa token app (klik iklan, `iklan.ts`, migrasi `20261108120000_iklan_klik`):**
  - `POST /x/iklan/klik` publik untuk dua situs. Wajib header `Origin` salah satu dari `https://rodahammerindo.com`,
    `https://www.rodahammerindo.com`, `https://palletmeshindonesia.com`, `https://www.palletmeshindonesia.com` (lainnya 403).
    Batas laju per isolate per origin (kapasitas 30, isi ulang 30/menit) → 429 + `Retry-After`. IP tidak dibaca/disimpan.
  - `GET /x/iklan/unggah.csv` (alias `/x/iklan/unggah`): env `TOKEN_UNGGAH_IKLAN` (≥ 24 karakter) lewat
    `Authorization: Bearer <token>` ATAU Basic auth (username bebas, password = token; untuk unggah terjadwal HTTPS Google
    Ads). Dibandingkan waktu-konstan (hash sha256 + XOR). Token salah / tidak ada / env kosong → `401 OAUTH_019` +
    `WWW-Authenticate: Basic` (jawaban sama, tanpa isi data); percobaan salah dibatasi 10 sekaligus, isi 10/menit.
- **Bot WA 0878 (`wa.ts`, migrasi `20261110180000_wa_bot`, `docs/WA-BOT.md`):**
  - `POST /x/wa/webhook` publik untuk webhook Kapso. Wajib `X-Webhook-Signature` = HMAC-SHA256 hex atas body mentah dengan env
    `KAPSO_WEBHOOK_SECRET` (≥ 16 karakter; kosong = semua ditolak), dibandingkan waktu-konstan; salah → `401 OAUTH_019`
    (percobaan salah dibatasi 20 sekaligus, isi 20/menit). Body ≤ 256 KB.
  - `POST /x/wa/proses`, `POST /x/wa/jaga`: `Authorization: Bearer <TOKEN_WA_PROSES>` (env ≥ 24 karakter), dipanggil pg_cron
    lewat pg_net (token dari Vault). Salah → `401`.
  - Header `x-wa-sekarang` (waktu tiruan) HANYA dihormati bila env `WA_IZINKAN_JAM_UJI=1` (uji lokal; jangan di produksi).
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

Kunci body tambahan (bukan ClickUp) di POST `/v2/list/{id}/task` & PUT `/v2/task/{id}`: `kategori` = nama kategori pekerjaan
(tanpa beda huruf besar/kecil, mis. `"Ads"`, `"konten"`) atau id-nya (`kk…`); `null`/`""` = tanpa kategori; kunci tidak
dikirim = kategori tidak berubah. Nama tak dikenal → 400 `INPUT_001` (pesan menyebut pilihan yang ada). Kategori tampil di
Jelajah web; daftar kategori diatur owner di Admin → Kategori.

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
| POST | `/x/pipeline/biaya-iklan` (scope tulis; aktor owner/bot/admin Pipeline) `{items:[{tanggal, platform google\|meta, campaign, biaya, klik?, tayang?, konversi?}]}` maks 1000 | `x_pipeline_biaya_iklan_set`: biaya iklan harian per campaign untuk dasbor Pipeline bagian 5. Per (tanggal, platform) = keadaan lengkap hari itu (campaign yang tidak dikirim dihapus); semua-atau-tidak, idempoten; balas `{diproses, baru, diubah, sama, dihapus, dari, sampai}`. Rincian `docs/KONTRAK-DB.md` §12 |
| POST | `/x/pipeline/order-erp` (scope tulis; aktor owner/bot/admin Pipeline) satu SP `{erp_so_id, no_sp, tanggal_sp, nilai, batal?, no_po?, sales?, pelanggan?, hp?, kota?, items?:[{deskripsi?, qty?, jenis?, produk?}], produk?}` atau `{items:[SP…]}` maks 100 | `x_pipeline_order_erp`: SP ERP-dev → ORDER, idempoten per `erp-sp:<erp_so_id>` (sidik no_sp/tanggal/nilai/no_po/batal). Cocok lead ber-No SP sama → lead TERBUKA ber-HP sama (utamakan milik sales SP) → lead baru (Repeat order / Lainnya). SP batal → order batal. Hanya SP tim online (kode SP RSG/MCE di `pipeline_akses`). Balas `{status: dibuat\|diperbarui\|tidak_berubah\|dilewati_bukan_online\|dilewati_batal, lead_id, kode, cara?}`; batch → `{diproses, ok, gagal, per_status, items:[{i, ok, …} \| {i, ok:false, status_http, err, ECODE}]}`. Rincian `docs/KONTRAK-DB.md` §14 |
| POST | `/x/pipeline/lead-otomatis` (scope tulis; aktor owner/bot/admin Pipeline) satu chat `{kunci_luar "wa:K-xxxxxx:YYYY-MM-DD", hp, sumber, pelanggan?, kontak_nama?, kota?, produk?:[{produk, qty?, satuan?, spesifikasi?}], kebutuhan?, catatan?, sumber_bukti?, sumber_bukti_kode?, chat_pada?, pemilik?, alasan_pemilik? balasan\|giliran\|pelanggan_lama}` atau `{items:[…]}` maks 100 | `x_pipeline_lead_otomatis`: chat WA 0878 calon pembeli → lead. Kunci sudah ada → `sudah_ada` (tidak menulis); HP punya lead terbuka → `lead_terbuka_ada` + aktivitas "Chat WA baru <tgl>" sekali per tanggal; selain itu `dibuat`. Balas `{status, lead_id, kode, pemilik, aktivitas_baru?}`; batch sama dengan order-erp. Rincian `docs/KONTRAK-DB.md` §14 |
| GET | `/x/pipeline/tautan?jenis=erp_sp\|wa&sejak=YYYY-MM-DD&batas=` (scope baca; aktor owner/bot/admin Pipeline) | `x_pipeline_tautan`: audit sinkron `{total, sejak, items:[{kunci_luar, jenis, lead_id, kode, tahap, no_sp, pemilik, pemilik_nama, cara, hasil_akhir, dibuat_pada, diubah_pada}]}` (default 7 hari, 200 baris; tanpa nomor HP) |
| GET | `/x/pipeline/asal-situs?produk=&sejak=YYYY-MM-DD&sampai=YYYY-MM-DD` (scope baca; admin/baca Pipeline semua lead, rep miliknya) | `x_pipeline_asal_situs`: lead masuk di rentang per asal (`sumber_bukti`): `{cakupan, produk, sejak, sampai, bukti_sejak, hari_ini, total:{lead, order, nilai}, kelompok:[{kelompok: situs_rh\|situs_oy\|meta\|lain\|tanpa_kode\|belum, lead, order, nilai, kelas:[…], jalur?:[organik, google_ads]}]}`. `produk` kosong/`Semua` = semua; bawaan `sejak` 2026-10-21, `sampai` hari ini; rentang ≤ 400 hari. Sama dengan kartu "Asal lead per situs" di dasbor. Rincian `docs/KONTRAK-DB.md` §16 |
| POST | `/x/berita/tarik` (scope tulis; aktor owner/bot) | Modul Berita: Edge mengunduh semua feed aktif `berita_sumber` (RSS 2.0/1.0/Atom, paralel, 12 dtk/feed, ≤50 item & ≤4 hari per feed; parser `berita.ts`), lalu `x_berita_simpan` menyimpan item baru (dobel URL / judul sama 3 hari dilewati; item > 14 hari dihapus). Balas `{sumber, sumber_ok, sumber_galat, item, baru, dobel, dilewati, dihapus, per_sumber:[{sumber_id, ok, item, galat?}]}`; tarikan < 90 dtk sejak yang terakhir → `{ditunda:true, terakhir_tarik}` |
| GET | `/x/berita/kandidat?jam=&batas=` (aktor owner/bot) | `x_berita_kandidat`: item sejak edisi terakhir (− 30 mnt, maks 48 jam; `jam` 1–48 menimpa), tanpa yang sudah dipilih 48 jam, maks `batas` (400) + `edisi_terakhir`, `umpan_balik` owner (disimpan/kurang relevan), `sumber_galat` |
| POST | `/x/berita/edisi` (scope tulis; aktor owner/bot) `{garis_besar, pantau?, kandidat?, catatan?, pilihan:[1–30]}` | `x_berita_edisi_simpan`: satu edisi kurasi (semua-atau-tidak; galat menyebut `pilihan[i]`). Kontrak item di komentar fungsi & `docs/BERITA.md`. Balas `{id, dibuat_at, pilihan}` |
| POST | `/x/admin/berita-tarik` (sesi owner, `x-sesi`) | Tombol "Tarik terbaru" di /berita: sama dengan `/x/berita/tarik` dengan aktor = owner |
| POST | `/x/admin/wa-pengetahuan` (sesi owner, `x-sesi`) `{id?, jenis, situasi?, teks?, aktif?, urutan?}` | Halaman Bot WA: simpan fakta/contoh bot; validator bot (400 bila melanggar) → `x_wa_pengetahuan_simpan` aktor = owner |
| POST | `/x/iklan/klik` (publik, Origin dua situs; body JSON ≤ 2 KB, `content-type` bebas: `application/json` atau `text/plain` ala `sendBeacon`) `{kode, id_klik, jenis_id, domain, waktu_klik?, halaman?}` | Catat pasangan kode Ref ↔ ID klik: `x_iklan_klik_catat`. Validasi `kode` `^GA-(RH\|OY)-[A-Z0-9]{4}$` (awalan sesuai `domain`, `domain` sesuai `Origin`), `id_klik` `[A-Za-z0-9_.~-]{8,200}`, `jenis_id` gclid/gbraid/wbraid, `waktu_klik` ISO dengan zona ≤ 3 hari lalu (kosong = waktu server), `halaman` path saja (query/fragmen dibuang, ≤ 300). Balas **204 tanpa isi**; kirim ulang kode + id sama → 204 (idempoten); kode sama dengan id beda → `409 KONFLIK_001` (situs buat kode baru); tidak sah → `400 INPUT_001`; > 1000 klik baru/jam (rem DB) → `429` |
| GET / HEAD | `/x/iklan/unggah.csv` (token `TOKEN_UNGGAH_IKLAN`, lihat Auth) | `x_iklan_unggah` → `text/csv` impor konversi offline Google Ads: `Parameters:TimeZone=Asia/Jakarta`, header `Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency`, satu baris per lead ORDER ber-kode cocok (gclid saja; "Order SP RH"/"Order SP OY", tanggal SP 12:00:00 WIB, nilai_transaksi, IDR). Header respons `x-baris`, `x-dilewati-braid`, `x-ditunda`. Rincian `docs/KONTRAK-DB.md` §13 |
| GET | `/x/iklan/ringkas` (scope baca; aktor admin/baca Pipeline) | `x_iklan_ringkas`: klik 7/30 hari per domain, kode di lead, lead, order + nilai, gbraid/wbraid, lead ber-kode tanpa klik, isi CSV saat ini |
| POST | `/x/rawat/iklan-klik` (scope impor, owner/bot; body opsional `{dry?:bool}`) | `x_rawat_iklan_klik`: hapus baris `iklan_klik` > 90 hari. Balas `{hari:90, dihapus, dry}`. Dipanggil job terjadwal `rawat.yml` (`node impor/rawat.mjs --iklan-klik`) |
| POST | `/x/rawat/lampiran` (scope impor, owner/bot; body opsional `{hari?:int, dry?:bool}`) | Perawatan: `x_rawat_lampiran` men-soft-delete lampiran app pada kartu selesai > N hari (setelan `app_settings.rawat_lampiran` `{aktif,hari}`, default 7; hanya `sumber=app`, salinan ClickUp dibiarkan), lalu service role menghapus BERKAS-nya. `dry` → hanya hitung. Balas `{hari, dihapus, berkas_dihapus, berkas_sisa, berkas_gagal}` (atau `{dilewati:true}` bila setelan `aktif=false`). Dipanggil job terjadwal `rawat.yml` |
| POST | `/x/wa/webhook` (publik, tanda tangan Kapso, lihat Auth; header `X-Webhook-Event`, `X-Idempotency-Key`) | Payload Kapso v2 (`whatsapp.message.received` / `.sent`, tunggal atau batch buffering) → `uraiWebhook` (metadata + tanda stop/tes/otomatis; isi pesan TIDAK ke DB) → `x_wa_webhook`. Balas `200 {ok, dobel, diproses, antrean, dilewati}`; DB gagal → 500 (Kapso mengulang, kunci idem menolak dobel) |
| POST | `/x/wa/proses` (Bearer `TOKEN_WA_PROSES`) | `x_wa_ambil` → per antrean: API pesan Kapso (`GET /meta/whatsapp/v24.0/{pnid}/messages?conversation_id=…&limit=20&fields=kapso()`) → cek ulang → Claude → validator → `POST /meta/whatsapp/v24.0/{pnid}/messages` (maks 3 percobaan) → `x_wa_hasil`. Balas `{saklar, diambil, batal, hasil:[{antrean_id, keputusan, alasan}]}` |
| POST | `/x/wa/jaga` (Bearer `TOKEN_WA_PROSES`) | `x_wa_jaga` + cek webhook Kapso (`GET /platform/v1/whatsapp/phone_numbers/{pnid}/webhooks`) + chat baru tanpa webhook > 3 jam → Telegram (`x_wa_peringatan`, 3 jam per masalah). Balas `{saklar, masalah:[kunci], dikirim:[kunci]}` |
| GET | `/x/wa/ringkas?hari=` (scope baca; aktor owner/bot) | `x_wa_ringkas`: masuk/antre/kirim/tolak/gagal, per alasan, token & biaya AI, 5 contoh teks bot, detak. Tanpa nomor/isi chat |
| POST | `/x/wa/saklar` (scope tulis; owner/bot) `{status: mati\|kirim, catatan?}` | `x_wa_saklar` |
| POST | `/x/wa/diam` (scope tulis; owner/bot) `{nomor, alasan: internal\|pemasok\|ekspedisi\|minta_berhenti\|lain, catatan?, hapus?}` | `x_wa_diam` (nomor → 62…) |
| GET | `/x/wa/pengetahuan` (scope baca; owner/bot) | `x_wa_pengetahuan_daftar` (fakta + contoh balasan bot, aktif & nonaktif) |
| POST | `/x/wa/pengetahuan` (scope tulis; owner/bot) `{id?, jenis: fakta\|contoh, situasi?, teks?, aktif?, urutan?}` | teks/situasi dicek validator bot (`periksaPengetahuan`, 400 bila melanggar) → `x_wa_pengetahuan_simpan` |
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
- Pengecualian satu-satunya: `/x/iklan/klik` memakai allow-list dua situs (4 origin di atas, `POST, OPTIONS`, header
  `content-type`) dan TIDAK menerima origin app/localhost. Rute lain tidak menerima origin situs.
- **Di lokal**, Kong menjawab preflight sendiri dan memasang `access-control-allow-origin: *` di semua respons `/functions/v1/*`. Jadi CORS milik fungsi hanya terlihat di cloud, atau bila runtime diakses langsung (`http://<ip kontainer edge>:8081/api/...`, dipakai `uji/kontrak`).

## Env opsional
| Env | Default | Fungsi |
|---|---|---|
| `TUGAS_API_BURST` | 40 | Kapasitas ember burst per token |
| `TUGAS_API_LAJU` | 20 | Isi ulang ember, per detik |
| `TOKEN_UNGGAH_IKLAN` | (kosong = unggah CSV selalu 401) | Token GET `/x/iklan/unggah.csv` untuk unggah terjadwal Google Ads. Secret Edge, BUKAN di repo; ≥ 24 karakter acak. Lokal: `supabase functions serve --env-file uji/iklan/serve.env` (nilai tiruan) |
| `KAPSO_WEBHOOK_SECRET` | (kosong = webhook WA selalu 401) | Secret tanda tangan webhook Kapso (sama dengan `secret_key` saat mendaftar webhook) |
| `KAPSO_API_KEY` | (kosong = proses mencatat gagal) | Kunci API Kapso (baca pesan, kirim, cek webhook) |
| `KAPSO_PHONE_NUMBER_ID` | `1286905201167228` | Phone number id WA 0878 |
| `ANTHROPIC_API_KEY_WA` | (kosong = gagal `ai_kunci_kosong`) | Kunci Claude khusus bot (batas belanja bulanan) |
| `TOKEN_WA_PROSES` | (kosong = proses/jaga selalu 401) | Token pg_cron → `/x/wa/proses` & `/x/wa/jaga` (juga di Vault `wa_token_proses`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_HANNES`, `TELEGRAM_CHAT_MARKETING` | (kosong = tanpa peringatan) | Peringatan jaga |
| `KAPSO_API_URL`, `ANTHROPIC_API_URL`, `TELEGRAM_API_URL`, `WA_IZINKAN_JAM_UJI` | (kosong) | HANYA uji lokal (`uji/wa/serve.env`): arahkan ke server tiruan / izinkan waktu tiruan. Jangan disetel di produksi |
| `TUGAS_PUBLIC_SUPABASE_URL` | lihat keterangan | URL publik untuk signed URL. Default: `SUPABASE_URL`; di lokal `http://127.0.0.1:<port>` |
