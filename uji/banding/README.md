# Uji banding clickup.mjs ↔ tugas.mjs

`node uji/banding.mjs [--varian awal|ubah] [--lewati-impor] [--saring <regex>] [--izinkan-diketahui] [--simpan]`

1. Server ClickUp tiruan (`impor/uji/mock-clickup.mjs`, fixture sintetis) dijalankan di port 54399.
2. Fixture diimpor ke app lokal lewat `impor/sinkron.mjs --mode penuh` (wajib kode 0 dan sensus selisih 0).
3. `clickup.mjs` ASLI (`/home/user/rhj-brain/tools/clickup.mjs`, cadangan `uji/kontrak/asli/clickup.mjs`) disalin ke folder temp. Yang diganti HANYA 2 baris: konstanta `BASE` dan URL v3. Skrip memeriksa tepat 2 baris berubah dan tidak ada sisa `api.clickup.com`.
4. Perintah baca dijalankan di kedua sisi dengan jam dibekukan di `sekarang` fixture (`beku-waktu.mjs`, preload `node --import`; file CLI tidak diubah): `whoami`; `tasks <list>` / `--closed` / `--closed --full` untuk 9 list (termasuk list arsip, list tanpa folder, list 110 tugas = 2 halaman); `folder-tasks` ±`--closed` untuk 5 folder (termasuk hidden & arsip); `task` dan `comments --replies` untuk SEMUA tugas; `comments` untuk tugas berkomentar; 5 varian `agenda`; `fields`; 1 kasus galat (`task` tak ada).
5. Output dibandingkan secara struktural (urutan kunci objek diabaikan, urutan array dan tipe nilai dibandingkan) setelah normalisasi di bawah. Tugas dengan lampiran: signed URL app diunduh tanpa auth dan harus sama byte dengan berkas fixture.
6. Hasil lengkap: `uji/banding/hasil/<waktu>-<varian>.json` (gitignored). Exit 0 hanya bila sisa beda 0 (atau semua sisa ada di daftar `DIKETAHUI` dan `--izinkan-diketahui`).

## Normalisasi (semua tercatat di `normalisasi.mjs`)

| ID | Kategori | Apa | Alasan |
|---|---|---|---|
| N1 | izin tugas | `url` kartu: `https://app.clickup.com/t/<id>` ↔ `<app_base_url>/t/<id>` | satu-satunya beda disengaja (riset §4.4); ID tetap dibandingkan |
| N2 | izin tugas | `attachments[].url` | CDN ClickUp ↔ signed URL Storage 24 jam; isi berkas dicek terpisah |
| N3 | izin tugas | kartu > 25 komentar | clickup.mjs asli hanya menerima 25 komentar terbaru; app mengembalikan semua (K9). Sisi app dipotong ke 25 terbaru bila sisi ClickUp tepat 25; 25 pertama harus identik. Di `agenda`, `komentar_baru` kartu itu dan `ringkas.kartu_dengan_komentar_baru` dihitung ulang dari daftar terpotong dengan rumus clickup.mjs |
| N4 | kontrak | urutan kunci objek | jsonb mengurutkan ulang kunci (KONTRAK-DB §1); perbandingan struktural |
| N5 | ditemukan | `whoami.workspaces[].members` | DB lokal bersama berisi anggota aktif di luar fixture (seed, anggota uji agen lain, anggota yang sudah keluar dari `/team` tetapi tetap aktif di app). Jumlah app dikurangi anggota aktif yang tidak ada di `/team` tiruan |
| N6 | ditemukan | `profilePicture` | tabel `members` tidak menyimpan avatar; kontrak §6 `profilePicture:null`. Tidak dibaca konsumen routine |
| N7 | ditemukan | `attachments[].thumbnail_small/large` | app tidak membuat thumbnail (kontrak: null); URL turunan berkas yang sama |
| N8 | ditemukan | `watchers` | app tidak melacak watcher (kontrak `watchers:[]`); tidak dibaca konsumen |
| N9 | ditemukan | `sharing` selain `public` | kontrak `sharing:{public:false}`; kunci share publik ClickUp tidak ada di app. `public` tetap dibandingkan |
| N10 | ditemukan | `folder.id`/`project.id` kartu di list tanpa folder | ClickUp memakai ID folder tersembunyi nyata; app `<list>-hidden` (tidak menyimpan ID itu). name/hidden/access tetap dibandingkan |
| N11 | ditemukan | teks pesan galat server pada kasus galat | "Task not found, deleted" ↔ "Tugas tidak ditemukan". Kode keluar dan format `<cli>: GAGAL -> GET <path> -> HTTP 404: ` tetap dibandingkan (prefix `clickup:`/`tugas:` sesuai kontrak CLI) |

## Beda yang TIDAK dinormalisasi (temuan)

Tidak ada (daftar `DIKETAHUI` di `normalisasi.mjs` kosong; `--izinkan-diketahui` tidak lagi dibutuhkan).

| ID | Temuan | Status |
|---|---|---|
| PR-1 | `tags` dan `checklists` kartu impor selalu `[]` di API app | **Selesai 29 Sep (P1)**: `j_task` mengisi dari `tasks.extra` (verbatim, termasuk kunci null di item checklist). Kartu app tetap `[]` |

Space privat fixture (`Ruang Arsip B2`) terlihat oleh pemilik token tiruan karena importer kini mengirim anggota space privat (jenis `space_anggota`, P2): gabungan `/list/{id}/member` + owner/admin `/team`. Bantuan psql (insert `space_anggota`) di skrip banding sudah dihapus.

## Asumsi mock yang WAJIB dicek dengan probe ClickUp asli

Mock sengaja mengikuti asumsi kontrak A2 untuk perilaku yang belum diprobe (kalau ClickUp ternyata beda, mock + app perlu disesuaikan):
urutan default `GET /list/{id}/task` (created desc, id); `GET /list/{id}/member` space privat = orang yang punya akses ke list itu (owner/admin tidak otomatis tercantum; impor/README.md); `include_closed=false` ikut membuang status bertipe `done`; urutan balasan (terlama dulu); lampiran komentar ikut muncul di `task.attachments`; urutan `assignees` (fixture memakai urut id / urut penugasan); `text_content`/`description` = `""` saat kosong; `reply_count` berupa string; `date` lampiran berupa string ms.
