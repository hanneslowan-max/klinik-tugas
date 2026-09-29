# cli/tugas.mjs

Satu file Node (>= 18, tanpa dependensi) dengan dua backend. Isinya salinan `rhj-brain/tools/clickup.mjs` plus mode aplikasi Tugas RHJ.

- `brief()`, `getComments()`, logika `agenda`, parser argumen, `--dry-run`, `{deleted}` dan pesan galat sama byte-per-byte dengan `clickup.mjs`. Di mode tugas, prefix pesan `clickup:` menjadi `tugas:`.
- Buktinya ada di `uji/kontrak/banding.mjs`, yang dijalankan otomatis oleh runner uji.

## Mode

| Mode | Kapan aktif | Backend |
|---|---|---|
| `tugas` | nama file `tugas*.mjs`, atau `TUGAS_BACKEND=tugas` | Edge Function `api` aplikasi Tugas |
| `clickup` | nama file lain (mis. `clickup.mjs`), atau `TUGAS_BACKEND=clickup` | ClickUp REST v2, persis `clickup.mjs` lama (throttle 670 ms) |

`TUGAS_BACKEND` dibaca dari env proses, lalu dari file `.env` di folder skrip (di rhj-brain: `tools/.env`), sama seperti `TUGAS_API_URL`/`TUGAS_API_TOKEN`. Env proses menang atas `.env`. Nilai selain `tugas`/`clickup` (termasuk yang berkutip, mis. `"tugas"`) ditolak dengan exit 1, tidak diam-diam jatuh ke ClickUp.

Cek backend yang aktif (kedua mode, tanpa request jaringan, token tidak dicetak):

```
node tools/clickup.mjs backend
{ "backend": "tugas", "dipilih_dari": ".env TUGAS_BACKEND", "api": "https://<ref>.supabase.co/functions/v1/api/v2", "token": "ada" }
```

`dipilih_dari` bernilai `env TUGAS_BACKEND`, `.env TUGAS_BACKEND`, atau `nama file`. Prefix pesan galat juga menunjukkan backend (`tugas:` / `clickup:`).

### Pasang dan cutover di rhj-brain (sesi CMO)

1. Salin file ini sebagai `tools/tugas.mjs` DAN `tools/clickup.mjs`.
2. Selama paralel (mode cermin): JANGAN isi `TUGAS_BACKEND` di env maupun `tools/.env`. `tools/clickup.mjs` tetap ke ClickUp, `tools/tugas.mjs` ke aplikasi (`TUGAS_API_URL` + `TUGAS_API_TOKEN` di env atau `tools/.env`).
3. Saat cutover: set `TUGAS_BACKEND=tugas` di SEMUA tempat skrip dijalankan, yaitu env cloud (environment "Marketing") DAN `tools/.env` di desktop. Lalu jalankan `node tools/clickup.mjs backend` di tiap tempat; harus `"backend": "tugas"`.
4. Setelah cutover stabil: hapus `CLICKUP_API_TOKEN` dari `tools/.env` dan env cloud. Dengan begitu salah konfigurasi berakhir dengan galat `CLICKUP_API_TOKEN kosong`, bukan data ClickUp yang tampil tanpa tanda.

Rollback: hapus `TUGAS_BACKEND` dari env cloud DAN `tools/.env` (dan kembalikan `CLICKUP_API_TOKEN` bila sudah dihapus). Cek lagi dengan `backend`.

## Env (mode tugas)

Isi dari environment. Kalau kosong, skrip membaca file `.env` di folder skrip (di rhj-brain: `tools/.env`). Berlaku juga untuk `TUGAS_BACKEND`. Jangan commit token.

| Env | Isi |
|---|---|
| `TUGAS_API_URL` | Wajib, berakhiran `/v2`. Cloud: `https://<ref>.supabase.co/functions/v1/api/v2`. Lokal: `http://127.0.0.1:54321/functions/v1/api/v2` |
| `TUGAS_API_TOKEN` | Wajib. Token `rtk_…` buatan owner (Admin → Token API, atau `web_admin_token_buat`). Scope `baca` untuk routine, `tulis` untuk sesi interaktif |
| `TUGAS_TEAM_ID` | Opsional. Tanpa ini, ID workspace diambil dari `GET /team`. Hanya dari env proses (tidak dari `.env`), sama seperti `CLICKUP_TEAM_ID` |
| `TUGAS_BACKEND` | Opsional, `tugas` atau `clickup`. Menimpa pilihan berdasarkan nama file (lihat Mode) |

URL v3 (`move`) dan `/x` diturunkan dari `TUGAS_API_URL` dengan mengganti `/v2`.

## Perintah

Perintah lama, sama dengan `clickup.mjs`:

```
node cli/tugas.mjs whoami
node cli/tugas.mjs tasks <list_id> [--closed] [--full]
node cli/tugas.mjs folder-tasks <folder_id> [--closed]
node cli/tugas.mjs task <task_id>
node cli/tugas.mjs comments <task_id> [--replies]
node cli/tugas.mjs agenda [folder_id] [--hours 26] [--all-comments] [--desc]
node cli/tugas.mjs create <list_id> --name "..." [--desc] [--assignee id,id] [--due YYYY-MM-DD] [--priority 1-4] [--status "to do"]
node cli/tugas.mjs update <task_id> [--name] [--desc] [--status] [--due YYYY-MM-DD|none] [--priority 1-4] [--add-assignee id] [--rem-assignee id] [--dry-run]
node cli/tugas.mjs comment <task_id> --text "..." | --file <path> [--dry-run]
node cli/tugas.mjs move <task_id> <list_id> [--dry-run]
node cli/tugas.mjs delete <task_id> --yes
node cli/tugas.mjs fields <list_id>
```

Tambahan, khusus mode tugas:

```
node cli/tugas.mjs activity <task_id>                      riwayat kartu (x_activity)
node cli/tugas.mjs resolve <id|url>                        ID/URL app atau app.clickup.com/t/… → {type,id,url}
node cli/tugas.mjs search "<q>" [--space id] [--closed]    nama/kode/isi/ID/URL, maks 50
node cli/tugas.mjs verify [--list id] [--folder id] [--space id] [--sumber clickup|app]   hitungan sensus
node cli/tugas.mjs tenggat [--tanggal YYYY-MM-DD] [--folder id]   B10/B5
node cli/tugas.mjs comment <task_id> --reply-to <comment_id> --text "..." [--dry-run]   balasan thread
```

Tambahan di KEDUA mode: `node cli/tugas.mjs backend` (lihat Mode).

## Beda perilaku di mode tugas

Ini perbedaan di server; kode format CLI tetap sama.

- **Throttle dan 429:** tanpa throttle. Server membatasi burst per token (default 40, isi ulang 20/detik). Kalau kena 429, CLI menunggu sesuai `Retry-After` lalu mengulang, maksimal 4 kali.
- **Komentar:** `comments` mengembalikan semua komentar top-level, tidak dipotong 25 seperti ClickUp.
- **`url` kartu:** berisi domain app, `https://tugas.palletmeshindonesia.com/t/<id>`.
- **`delete`:** hapus lunak, kartu masuk Sampah. Hanya token milik owner; token bot atau member mendapat 403 `HAPUS_OWNER`. Pesan `--yes` tetap berbunyi "hapus permanen" supaya sama dengan aslinya.
- **Mode cermin:** kartu asal ClickUp hanya-baca, jadi menulis ke kartu itu mendapat 409 `CERMIN_001`.
- **`--reply-to`:** di mode clickup flag ini ditolak, supaya tidak diam-diam menjadi komentar top-level.
- **`audit-free`:** tidak berlaku di mode tugas (exit 1).

## Uji

Butuh stack lokal: `supabase start`, lalu `supabase functions serve`.

```
node uji/kontrak/jalankan.mjs        # UJI_VERBOSE=1 untuk mencetak semua cek; exit 0 lulus, 1 gagal, 2 Edge tak jalan
```
