# impor/ — importer & sinkron ClickUp → aplikasi Tugas

Kontrak: `docs/ARSITEKTUR.md` §10, riset `docs/riset/rancang-kompatibilitas.md` §6, fungsi DB `docs/KONTRAK-DB.md` §5. Node ≥ 20, tanpa dependensi.

| Berkas | Isi |
|---|---|
| `sinkron.mjs` | importer/sinkron (baca ClickUp → tulis lewat Edge `/api/x/impor/*`) |
| `cadangan.mjs` | backup: `/api/x/export` + salin berkas lampiran (dipakai `.github/workflows/backup.yml`) |
| `uji/mock-clickup.mjs` | server ClickUp API v2 tiruan (GET saja) |
| `uji/fixture/` | fixture SINTETIS: `awal.json`, `ubah.json` (perubahan untuk uji sinkron), `berkas/` (lampiran kecil) |
| `uji/jalankan.mjs` | uji importer end-to-end (mock + Edge lokal + DB lokal) |
| `laporan/` | laporan angka per list (gitignored, jangan di-commit) |

## Menjalankan

```
CLICKUP_API_TOKEN=pk_… TUGAS_API_URL=https://<ref>.supabase.co/functions/v1/api/v2 TUGAS_IMPORT_TOKEN=rtk_… \
  node impor/sinkron.mjs --mode penuh
```

| Flag | Arti |
|---|---|
| `--mode penuh` | sapuan penuh idempoten + tandai hilang + sensus (default) |
| `--mode akhir` | sama dengan penuh, tetapi wajib tanpa `--only`/`--tanpa-lampiran` (sinkron akhir sebelum cutover) |
| `--mode uji` | sama dengan penuh TANPA tandai hilang |
| `--only list=<id>[,<id>]` | batasi tugas/komentar/lampiran ke list tertentu (struktur, anggota, status tetap semua). Tandai hilang memakai lingkup list/tugas itu. Induk sub-tugas yang ada di list lain diambil dan diimpor lebih dulu |
| `--dry-run` | hanya baca ClickUp; bila token app ada, sensus dibandingkan dengan app (baca saja) |
| `--muat impor\|sinkron` | paksa `p_mode` impor_batch. Default otomatis: `impor` bila list cakupan belum punya data ClickUp di app, selain itu `sinkron` |
| `--tanpa-lampiran` | jangan salin berkas (baris lampiran tetap diimpor, `storage_path` lama dipertahankan) |
| `--paksa-hilang` | lewati pengaman tandai hilang (lihat bawah) |
| `--laporan <dir>` | folder laporan (default `impor/laporan/`, atau env `SINKRON_LAPORAN_DIR`) |

Env: `CLICKUP_API_TOKEN`, `TUGAS_API_URL`, `TUGAS_IMPORT_TOKEN` (scope `impor`), opsional `CLICKUP_API_BASE` (server tiruan), `CLICKUP_TEAM_ID`, `SINKRON_RPM` (default 60; ke `api.clickup.com` dipatok maks 60).

Kode keluar: `0` sukses dan sensus selisih 0; `2` selesai tetapi ada selisih sensus / baris gagal / tertunda / galat baca; `1` galat fatal (token, jaringan, argumen). Lampiran yang gagal disalin tidak memicu kode 2: barisnya tetap tercatat `status_salin='gagal'` + `clickup_url` dan dicoba lagi tiap run.

## Alur (riset §6.1)

1. `GET /team` → workspace + anggota. Email yang kosong dilengkapi dari `GET /list/{id}/member` (maks 5 list, berhenti begitu lengkap).
2. Space (`archived` false dan true) → folder (termasuk hidden, false/true) + list tanpa folder (false/true) → list per folder (false/true).
3. `GET /list/{id}` untuk semua list → `list_statuses` (id status ClickUp ikut, jadi ganti nama status terdeteksi).
4. Tugas per list: `include_closed=true&subtasks=true&include_markdown_description=true`, `archived` false dan true, semua halaman (100/halaman).
5. `GET /task/{id}?include_markdown_description=true` per tugas (lampiran, creator, markdown). 404 di tahap ini = tugas dihapus saat sapuan (dicatat info).
6. Komentar: `GET /task/{id}/comment`, lanjut `start=<date terakhir>&start_id=<id terakhir>` selama halaman berisi 25 dan masih ada ID baru. Balasan: `GET /comment/{id}/reply` untuk `reply_count > 0`.
7. Lampiran: `task.attachments` + part komentar `attachment`/`image`. Lampiran yang muncul di keduanya dicatat sebagai lampiran komentar (`comment_id` terisi).
8. User di payload yang bukan anggota `/team` (creator/assignee/penulis/mention/pengunggah yang sudah keluar) → anggota `aktif:false`.
9. `bulk_time_in_status` per 100 tugas. Ditolak → dicatat sebagai info (bukan galat). Diterima → `sync_raw` entity `time_in_status`.
10. Tulis lewat Edge (`/x/impor/batch`, urutan kontrak §5): workspace → members → spaces → folders → lists → list_statuses → tasks (induk sebelum anak di seluruh payload; baris `tertunda` diulang; induk di luar cakupan diambil `GET /task/{id}`; induk yang benar-benar 404 → anak dikirim `parent:null` + peringatan) → comments (top-level lalu balasan) → attachments → sync_raw (payload mentah: team, list, task, komentar per tugas, time_in_status).
11. Lampiran disalin: `POST /x/impor/upload-url {path:"t/<task>/<id>-<nama>"}` → unduh URL ClickUp (tanpa auth; token ClickUp hanya dicoba bila CDN ClickUp menjawab 401/403) → `PUT` signed URL. `409` dari upload-url = sudah disalin run sebelumnya (tidak diunduh ulang). MIME di luar allowlist bucket / > 25 MB / tanpa URL → `tautan_saja`. Galat unduh/unggah → `gagal`.
12. Tandai hilang (`/x/impor/hilang`), hanya dalam lingkup yang benar-benar tersapu: tugas → `list_ids` list yang daftar tugasnya sukses; komentar → `task_ids` yang komentarnya sukses; lampiran → `task_ids` yang detail + komentarnya sukses.
    - Verifikasi tugas dulu: ID tugas app per list cakupan (`GET /v2/list/{id}/task` app, semua status/arsip) yang tidak muncul di daftar ClickUp dicek `GET /task/{id}` ke ClickUp. 404 → benar hilang. 200 → kartu pindah ke list di luar cakupan (mis. `--only`) → diimpor ulang (list ikut pindah), tidak ditandai hilang. Galat lain → tidak ditandai. Kandidat > 200 → tandai hilang tugas dilewati (pakai `--paksa-hilang`).
    - Pengaman jumlah: bila app punya > 25% (dan > 10) tugas lebih banyak dari ClickUp di lingkup itu, tandai hilang tugas DILEWATI + peringatan.
13. Sensus dari payload yang sama (tanpa panggil ClickUp lagi) vs `GET /x/sensus?sumber=clickup` per list: `tasks_total, open, closed, archived, subtasks, comments_top, replies, reply_count_sum` (jumlah `reply_count` ClickUp), `attachments_task, attachments_comment, assignee_links, sha_ids_tasks, sha_ids_comments`. `deleted` app tidak dibandingkan (konsep app saja; ditampilkan di laporan). Bila sha beda → rincian ID lewat `/x/export`.
14. `sync_runs` ditutup (`impor_run_selesai`: counts, census, diffs, errors) — juga saat run gagal di tengah.

Keamanan: klien ClickUp hanya punya satu jalur request (`KlienClickUp.minta`) yang melempar galat untuk method selain GET sebelum menyentuh jaringan (diuji). Token ClickUp tidak pernah dikirim ke app/Storage; token app tidak pernah dikirim ke ClickUp. stdout/log hanya angka dan ID.

## Uji

Butuh Supabase lokal + `supabase functions serve`.

```
node impor/uji/jalankan.mjs          # UJI_VERBOSE=1 untuk semua cek; exit 0 lulus
node impor/uji/mock-clickup.mjs --port 54399 --varian awal   # jalankan mock saja
```

Mock memakai port tetap 54399 (env `MOCK_PORT`) supaya URL lampiran yang tersimpan di DB stabil antar-run. Data fixture memakai ID unik (`86b2…`, `9018220000…`, `882000…`) dan tetap tinggal di DB lokal (tugas yang hilang di varian lain ter-soft-delete). Token uji bernama `uji-b2 …` dicabut lalu barisnya dihapus di akhir.
