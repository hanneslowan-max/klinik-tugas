# STATUS rhj-tugas (Fase 1)

Diperbarui 1 Okt 2026 (real-time + deploy Hostinger lewat Git, perbaikan build glibc 2.28; lihat "Sesi 1 Okt"). Sebelumnya 30 Sep (deploy ke project Supabase baru + impor ClickUp asli selesai, sensus selisih 0; web Next.js dibangun). Sebelumnya: 29 Sep (poles DB P1–P6 + web W1–W8). Kontrak: `docs/ARSITEKTUR.md` + rincian DB `docs/KONTRAK-DB.md`.

## Sesi deploy 30 Sep 2026 (branch `claude/rhj-task-management-deploy-gwc6t5`)
Keputusan Hannes (30/9): region project = **Sydney** (bukan Singapore seperti prasyarat lama); web diganti **Next.js + Tailwind** (App Router, TypeScript) di **Hostinger Business, Node.js Web Apps** sebagai tahap tersendiri SESUDAH langkah 0–6. Langkah 7 lama (web statis + `.htaccess`) tidak dipakai lagi. Backend (DB, Edge, importer, CLI) tidak berubah.

| Langkah | Hasil |
|---|---|
| 0 Pagar | Terpasang di container sesi ini: `~/.claude/hooks/supabase-readonly.sh` + `~/.claude/settings.json` (deny 10 tool MCP Supabase penulis + 34 tool MCP ClickUp penulis). Uji: `select 1 -- drop table uji` lewat `mcp__Supabase__execute_sql` ditolak hook. Container baru = pasang ulang |
| 1 Target | PAT hanya melihat 1 project: "RHJ ClickUp" `admhlyurfvodfyedgaio`, `ap-southeast-2` (Sydney), Postgres 17.6, ACTIVE_HEALTHY = `SUPABASE_PROJECT_REF`. DB kosong: 0 tabel `public`, 0 bucket, tanpa riwayat migrasi, **0 user Auth** |
| 2 Skema | Selesai. `db push` tidak bisa dari sesi cloud (TCP 5432 tidak lewat proxy), jadi 13 migrasi dikirim lewat Management API dengan `alat/sql-proyek.sh --migrasi` (dikunci ke ref `admhlyurfvodfyedgaio`; tiap berkas satu transaksi + dicatat di `supabase_migrations.schema_migrations`; seed tidak dikirim). Dijalankan Hannes di mode izin "bertanya" (mode Auto menolaknya). Cek: 13 migrasi, 20 tabel semua RLS, 33 fungsi `web_*` + 29 `api_/x_/impor_*`, bucket `lampiran` privat 25 MB tanpa SVG/HTML, `anon` tanpa grant/eksekusi, mode `cermin`. Auth: `disable_signup=true` (signup → 422), `password_min_length=8`, `site_url`/`uri_allow_list` = tugas.palletmeshindonesia.com. Edge `api` ter-deploy (tanpa token → 401 `OAUTH_017`) |
| 3 Bootstrap | Selesai. Hannes = owner ID 312823267 terhubung ke user Auth buatannya sendiri (`harus_ganti_password=false`); bot `claude (agent)` = 900000000000. Token dibuat dengan klaim JWT Hannes dalam SATU pernyataan (`with sesi as (select set_config(...)) select web_admin_token_buat(...)`). Hanya token **importer** (scope `impor`, nama "importer (sesi deploy 30 Sep)") — nilainya hanya di berkas 600 di container sesi ini (hilang bersama container; cabut lewat Admin → Token bila perlu). Token backup/routine/sesi interaktif dibuat saat dipasang ke GitHub Secrets (langkah 8) |
| 4 Impor | Selesai. Dry-run ke DB kosong exit 2 = selisih 11 list semuanya `db: null` (wajar). `--mode penuh` exit 0 (968 dtk, 541 permintaan GET, 0×429): 239 tugas, 272 komentar, 87 lampiran (86 tersalin ke Storage, 1 `tautan_saja`), 11 list, 33 status, 3 space, 1 folder, 8 anggota baru (owner dilindungi, `unchanged`), anggota space privat RHJ Online Sales = 3. Jalankan ulang: exit 0, tugas/komentar `unchanged` 239/272, lampiran `sudah_ada` 86 → idempoten |
| 5 Sensus | **Selisih 0 di 11 list** (tabel di bawah; sha ID tugas & komentar juga sama). Laporan `impor/laporan/2026-09-30-114115-penuh.json` & `…115724-penuh.json` (gitignored) |
| 6 Akun | Selesai. 8 anggota diberi akun Auth (email dari `/team` ClickUp, terkonfirmasi) lewat `alat/sql-proyek.sh --akun`: password ACAK yang tidak pernah ditampilkan/disimpan + `harus_ganti_password=true`. Anggota bisa masuk setelah Hannes menekan Admin → Anggota → **Setel ulang password** (password sementara tampil sekali) saat web online. Total user Auth 9, semua terkonfirmasi |

Sensus per list sesudah impor (ClickUp = aplikasi di setiap kolom):
| List | Tugas | Open | Closed | Komentar | Balasan | Lampiran | Penugasan |
|---|---|---|---|---|---|---|---|
| Project 1 / Project 2 / Get Started with ClickUp | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| List (RHJ Online Sales) | 29 | 20 | 9 | 8 | 0 | 0 | 30 |
| Follow-up Pallet Mesh | 40 | 39 | 1 | 0 | 0 | 0 | 40 |
| Fase 1 — Sumbat & perbaiki | 51 | 3 | 48 | 153 | 8 | 66 | 54 |
| Fase 2 — Ukur | 27 | 13 | 14 | 39 | 2 | 13 | 31 |
| Fase 3 — Tekan lelang | 20 | 17 | 3 | 7 | 0 | 1 | 20 |
| Fase 4 — Nyalakan & baca hasil | 14 | 13 | 1 | 9 | 0 | 0 | 15 |
| Di luar periode 60 hari | 16 | 9 | 7 | 12 | 0 | 0 | 17 |
| Kontrak SEO Agus | 42 | 38 | 4 | 33 | 1 | 7 | 41 |
| **Total** | **239** | **152** | **87** | **261** | **11** | **87** | **248** |

Temuan impor: lampiran `.docx` di tugas `z8r3fde8gh` dilaporkan ClickUp sebagai `application/octet-stream` (di luar allowlist) → hanya tautan ClickUp. Perbaikan yang disarankan: importer menebak MIME dari ekstensi bila ClickUp memberi `octet-stream` (seperti `mimeBerkas` di web).

Web Next.js (tahap berikutnya, sudah dibangun di `web/`, belum di-deploy): lihat `web/README.md`. Semua layar web lama sudah dipindah (Masuk, Ganti password, Tugas Saya, Jelajah, List/Papan, Detail, Cari, Notifikasi, Admin 7 bagian, Sampah); Vitest 48 lolos, Playwright e2e 33 lolos di HP + desktop (1 khusus sentuh dilewati di desktop). Web statis lama ada di `web-lama/` sampai paritas tes penuh (69 skenario lama) dipindah.

Langkah berikutnya: (a) pindahkan sisa skenario tes lama ke `web/tests/e2e`; (b) deploy web ke Hostinger Business (Node.js Web Apps, env `NEXT_PUBLIC_*` project ini); (c) Hannes: reset password 8 anggota lewat Admin dan kirim lewat jalur pribadi; (d) GitHub Actions sinkron + backup (langkah 8 lama).

Probe ClickUp asli (30 Sep):
- `/team`: 9 anggota, semua email = tabel langkah 6. **Rengga sudah bergabung** (Masalah #4 gugur). Email Michael = `michael@rodahammerindo.com` (asumsi terbukti).
- Space: 3 aktif (`Space`, `RHJ Space`, `RHJ Online Sales`), 0 diarsip. Hanya `RHJ Online Sales` (`1100340000050704`) privat. `GET /team/{id}/space` **memuat `members`** untuk space privat (3: Riksa, Michael, Hannes), sama persis dengan gabungan `GET /list/{id}/member` kedua list-nya. Asumsi P2 terbukti; importer tidak perlu diubah.
- Folder `RHJ Eksekusi` = `1100340000026652` (6 list) = default `tenggat_folder_ids` (Masalah #6 selesai).
- Sensus ClickUp: 11 list, 239 tugas (152 open, 87 closed, 0 diarsip, 0 subtugas), 261 komentar + 11 balasan, 87 lampiran (14 di tugas, 73 di komentar), 248 tautan assignee.

## Sesi 1 Okt 2026: real-time + deploy otomatis
- **Real-time**: migrasi `20261001090000_realtime.sql` terpasang di project RHJ ClickUp (14 migrasi; publikasi `supabase_realtime` = 9 tabel). Web berlangganan perubahan (status, komentar, assignee, lampiran, struktur, notifikasi) dan menyegarkan layar terdampak; ditahan selama mengedit/menyeret. Tes `web/tests/e2e/realtime.spec.ts` (6/6 HP+desktop); suite e2e penuh 39 lolos, Vitest 51 lolos.
- **Deploy**: Hostinger Node.js Web App lewat **Git** (hPanel → Import Git Repository: `rhj-tugas`, branch `main`, preset Next.js, root `web`, Node 22, env `NEXT_PUBLIC_*` di hPanel). Sempat terhalang "Deployment Git dinonaktifkan saat mengelola klien" dan akun GitHub collaborator (`lixcoded`, write) yang tidak bisa memasang GitHub App Hostinger untuk repo milik `hanneslowan-max`; impor akhirnya berhasil 1 Okt (app dibuat di domain `tugas.palletmeshindonesia.com`, terlihat dari path build `domains/tugas.palletmeshindonesia.com/hbuilds`). Jalur cadangan lewat API Hostinger (unggah arsip + build) pernah dibuat di commit `2f1e590` lalu dibuang karena Git sudah jalan.
- **Build pertama di Hostinger gagal** (main `4d76705`): server build Hostinger memakai **glibc 2.28**, SWC native Next.js 16 butuh `GLIBC_2.29` → Next memakai SWC WASM, `next.config.ts` gagal ditranspilasi, dan Turbopack tidak tersedia. Diperbaiki & dibuktikan di AlmaLinux 8 (glibc 2.28) + Node 22 dengan struktur repo utuh (npm install → build → `next start` dan `server.js` standalone menyajikan `/masuk`, CSS/JS 200): `npm run build` = `next build --webpack`, `next.config.mjs`, `outputFileTracingRoot`/`turbopack.root` = `web/` (tanpa ini standalone pindah ke `.next/standalone/web/` karena ada `package-lock.json` di akar repo). Riset: Hostinger membungkus `next.config.ts` dengan config TypeScript buatannya (dokumen Hostinger Next.js), dan di SWC WASM bungkus itu keluar sebagai ESM dengan import tanpa ekstensi → ERR_MODULE_NOT_FOUND; regresi glibc berasal dari vercel/next.js PR #91799 (16.3.0+, issue #96960 masih terbuka); turun ke 16.2.12 ditolak (advisori kritis). `postbuild` menyalin `public/` + `.next/static` ke standalone (tidak terdokumentasi apakah Hostinger melakukannya). Job CI build-hostinger juga menolak `next.config.ts` dan build tanpa `--webpack`. Job CI baru **build-hostinger** meniru server itu. Lokal: Vitest 51, e2e 39 lolos (1 khusus sentuh dilewati) terhadap build webpack.
- `.github/workflows/web.yml` = gerbang PR (cek, build-hostinger, e2e); Hostinger tidak menunggu Actions, jadi merge hanya bila hijau.
- Belum: merge branch ini ke `main` lalu deploy ulang di Hostinger; cek SSL & uji pasca-deploy (`web/README.md`); Hannes reset password 8 anggota; secrets GitHub untuk sinkron/backup harian.

## Verdict
- Kode Fase 1 (F1–F4 + kode F5: sinkron, backup, workflow) **jadi dan lulus semua suite lokal** dari `supabase db reset` (verifikasi akhir 29 Sep): DB 1016 cek (16 berkas), kontrak Edge+CLI 469 cek, importer 119 cek, web 69 tes Playwright, vendor cocok. Banding `clickup.mjs` ↔ `tugas.mjs`: kode keluar identik di 340/340 (awal) dan 344/344 (ubah) perintah, **sisa beda 0** (exit 0 tanpa `--izinkan-diketahui`; PR-1 selesai).
- Putaran perbaikan poles DB (P1–P6) selesai: tags/checklists kartu impor (PR-1), anggota space privat dari impor, allowlist lampiran (CSV Windows dll.), normalisasi nama status Admin, wadah diarsip keluar dari Tugas Saya/TENGGAT/beban, URL tampilan ClickUp di resolve/cari. Rincian `docs/KONTRAK-DB.md` §10.
- Putaran poles web (W1–W8) selesai: input ≥16px (tidak zoom di iOS), sisa bahasa Inggris diganti, angka lonceng langsung turun, Admin › Sinkron jadi tabel berbahasa Indonesia, dialog "Tugas baru" di HP dengan tombol aksi selalu terlihat (juga saat keyboard virtual), target sentuh ≥44px, board desktop memakai lebar layar, dan layar mengikuti P1/P3/P5/P6 (chip tag + checklist hanya-baca, wadah diarsip hilang dari Tugas Saya, Cari membuka list dari URL ClickUp, allowlist lampiran web = bucket).
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
| Web | `web/` | Statis tanpa build, PWA (cache service worker `v3`). Layar: masuk, ganti password, Tugas Saya, Jelajah, List/Board, Detail (komentar, @mention, lampiran, riwayat, B5, tag + checklist impor hanya-baca), Cari (URL list ClickUp/aplikasi langsung membuka list), Notifikasi, Admin (anggota, status, struktur, libur, token, mode, sinkron), Sampah. `.htaccess` untuk Hostinger |
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
bash uji/db/jalankan.sh                  # psql, 16 berkas
node uji/kontrak/jalankan.mjs            # Edge + CLI, butuh functions serve
node impor/uji/jalankan.mjs              # importer vs mock ClickUp (port 54399)
node uji/banding.mjs                     # varian awal; juga --varian ubah (target sisa beda 0, exit 0)
npx playwright test -c uji/web/playwright.config.mjs
node uji/web/salin-vendor.mjs --cek      # integritas pustaka vendor
```

## Hasil verifikasi akhir (29 Sep 2026, ±10.57–11.07 UTC, kode akhir poles DB + web, 1 putaran dari `supabase db reset`)
`supabase db reset` menerapkan 13 migrasi + seed; `supabase functions serve` tetap jalan dan menjawab `401 OAUTH_017` sebelum suite kontrak. Urutan = urutan suite di atas.
| Suite | Hasil |
|---|---|
| `uji/db/jalankan.sh` | 16 berkas, 1016 cek lulus, 0 berkas gagal. Diulang di DB kotor sesudah semua suite: 1016 lulus, 0 gagal |
| `uji/kontrak/jalankan.mjs` | 469 cek lulus, 0 gagal (exit 0) |
| `impor/uji/jalankan.mjs` | 119 lulus, 0 gagal (exit 0) |
| `uji/banding.mjs` (awal, tanpa `--izinkan-diketahui`) | kode keluar sama 340/340, kasus galat 1, isi lampiran 7 ok / 0 gagal, **sisa beda 0 entri di 0 perintah**, exit 0 (56 dtk) |
| `uji/banding.mjs --varian ubah` (tanpa `--izinkan-diketahui`) | 344/344, kasus galat 1, lampiran 6 ok / 0 gagal, **sisa beda 0**, exit 0 (59 dtk); pulihkan ke awal: impor kode 0, sensus selisih 0 |
| Playwright `uji/web` | 69 lulus, 0 gagal (2,6 menit), exit 0 |
| `uji/web/salin-vendor.mjs --cek` | 4 berkas ok, "vendor cocok", exit 0 |
| Sisa data sesudah suite | tugas/list/space `uji-b3` = 0/0/0; notifikasi Dodi belum dibaca = 3 (sama dengan seed) |

Perubahan kode di verifikasi ini: tidak ada (hanya dokumen ini).

## Hasil putaran poles web W1–W8 (29 Sep 2026, tanpa db reset, di atas DB hasil putaran DB)
| Suite | Hasil |
|---|---|
| Playwright `uji/web` (69 tes = 48 lama + 21 baru di `13-poles.spec.mjs`) | Putaran 1: 68 lulus, 1 gagal (`12-tinjau` board 360: remah setinggi 44px mendorong kolom ke bawah nav; diperbaiki dengan mencadangkan tinggi remah). Putaran 2–5: 69 lulus, 0 gagal (±2,7 menit) |
| `uji/db/jalankan.sh`, `uji/kontrak/jalankan.mjs` (cek efek samping) | 1016 / 0 dan 469 / 0 |
| `salin-vendor --cek` | vendor cocok |

Catatan putaran web:
- Tes web kini juga **menulis ke DB lokal** lewat pembantu baru `sqlUbahLokal` (`uji/web/bantu.mjs`; psql, `app.sumber = sistem`): mengisi `tasks.extra` tag/checklist kartu uji dan memulihkan `read_at` notifikasi seed Dodi di blok `finally`. Butuh psql + DB lokal 54322, sama seperti suite DB.
- Screenshot `uji/web/hasil/poles-*.png` (17 berkas; folder di-ignore).
- Label yang diubah memaksa penyesuaian `06-admin`, `08-lanjutan`; `11-sentuh` tidak lagi mengecualikan `.remah`.

## Hasil tes putaran poles DB P1–P6 (29 Sep 2026 sore, 3 putaran, masing-masing dari `supabase db reset`)
| Suite | Putaran 1 | Putaran 2 | Putaran 3 (akhir) |
|---|---|---|---|
| `uji/db/jalankan.sh` | 16 berkas, 1016 cek lulus, 0 gagal (baru: `16_poles.sql` 74 cek) | 1016 lulus, 0 gagal; diulang di DB kotor: 1016 | 1016 lulus, 0 gagal; diulang di DB kotor sesudah semua suite: 1016 |
| `uji/kontrak/jalankan.mjs` | 469 lulus, 0 gagal | 469 / 0 | 469 / 0 |
| `impor/uji/jalankan.mjs` | 118 lulus, 0 gagal | 118 / 0 | 119 / 0 (+1 cek jalur gagal `/list/{id}/member`) |
| `uji/banding.mjs` (awal) | kode keluar sama 340/340, lampiran 7/7 ok, **sisa beda 0**, exit 0 | 340/340, 7/7, sisa 0, exit 0; juga di DB segar (banding langsung sesudah reset): 340/340, sisa 0, exit 0 | 340/340, 7/7, sisa 0, exit 0 |
| `uji/banding.mjs --varian ubah` | 344/344, lampiran 6/6 ok, sisa 0, exit 0; DB dipulihkan ke awal (impor kode 0, selisih 0) | 344/344, 6/6, sisa 0, exit 0 | 344/344, 6/6, sisa 0, exit 0 |
| Playwright `uji/web` (tambahan, sebelum poles web) | — | 48 lulus, 0 gagal (1,3 menit) | — |

Catatan putaran ini:
- Banding putaran 1 pertama kali menemukan 12 entri beda di 2 perintah (`task 86b2a0009`, `tasks 901822000101 --closed --full`): kunci bernilai null di item checklist (`assignee`, `group_assignee`, `parent`) hilang karena `norm_impor_tugas` memakai `jsonb_strip_nulls`. Diperbaiki (simpan verbatim) + tes `16_poles.sql`; sesudahnya sisa beda 0.
- Bantuan psql di `uji/banding.mjs` (insert `space_anggota` untuk pemilik token tiruan) **dihapus**: importer kini mengirim anggota space privat (P2), dan banding lulus tanpa itu.
- Fixture importer bertambah 1 lampiran CSV dari Windows (`application/vnd.ms-excel`) dan anggota list di space privat (asumsi `/list/{id}/member`); varian `ubah` mencabut 1 anggota list privat.

## Hasil tes sebelumnya (29 Sep pagi, sebelum poles)
DB 942 cek (15 berkas), kontrak 450, importer 102, banding 340/340 dan 344/344 dengan sisa beda PR-1 saja, Playwright 48. Saat itu `uji/banding.mjs` memberi pemilik token ClickUp tiruan keanggotaan space privat lewat psql karena importer belum mengirim anggota space; bantuan itu sudah dihapus (lihat di atas).

**Pemindaian secret** (137 berkas yang akan di-commit sebelum STATUS.md ditambahkan, `git ls-files -co --exclude-standard`): pola JWT, `sb_secret_`/`sb_publishable_`, `sbp_`, `pk_<angka>_`, `rtk_`, `ghp_`/`github_pat_`, `sk-ant-`, token Telegram, `AGE-SECRET-KEY`, kunci privat PEM, `AKIA`, serta nilai kunci lokal dari `supabase status` (service role, secret, JWT secret, S3). Hasil: tidak ada secret. Temuan yang aman: anon key DEMO bawaan Supabase CLI di `web/config.js` (blok LOKAL, `iss: supabase-demo`, kunci publik), token palsu `rtk_salah…`/`rtk_tiruan`/`pk_salah` di tes. Email asli hanya ada di `docs/riset/*` dan `docs/RENCANA-FASE1.md` (sudah ter-commit sebelumnya; repo private). Folder yang di-ignore: `uji/web/hasil/`, `impor/laporan/`, `uji/banding/hasil/`, `node_modules/`. Putaran poles (29 Sep sore): 20 berkas yang berubah/baru dipindai ulang dengan pola yang sama + 6 nilai kunci lokal `supabase status`: tidak ada secret (yang cocok hanya nama pola di dokumen ini). Data uji baru sintetis (`@contoh.test`, ID 882…/9018…, token palsu `rtk_p1`).
Verifikasi akhir (29 Sep, sesudah poles DB + web): **141 berkas** `git ls-files -co --exclude-standard` (termasuk 3 berkas baru: `uji/db/16_poles.sql`, `uji/web/13-poles.spec.mjs`, `impor/uji/fixture/berkas/ekspor-windows.csv`) dipindai dengan pola yang sama + 7 nilai kunci/secret lokal dari `supabase status -o env`. Hasil: **tidak ada secret**. Yang cocok pola hanya: anon key DEMO di `web/config.js` (satu-satunya nilai `supabase status` yang muncul; publik, `iss: supabase-demo`), token palsu tes (`rtk_rahasia_uji_*`, `rtk_rahasia_baca/cabut` di `uji/db`, `rtk_salah…` di kontrak) dan `pk_88200001_TIRUANB2UJI` di mock ClickUp. Email asli juga ada di dokumen ini (langkah 3 dan tabel langkah 6), sudah ter-commit sejak `b0e207f`; berkas yang diubah putaran poles tidak menambah email asli.

## Deviasi dari ARSITEKTUR (sadar, tercatat)
Daftar lengkap 17 butir di `docs/KONTRAK-DB.md` §8, tabel review R1–R5 §9, dan perbaikan poles P1–P6 §10. Yang paling berdampak:
- **Privasi space (R2)** menggantikan §4 "member lihat semua": space privat hanya untuk `space_anggota` + owner/bot + assignee per kartu. Setelan `app_settings.privasi_space` = `tegakkan` (default) / `abaikan`.
- **Komentar menaikkan `updated_at` (R4)**, kebalikan catatan "sementara" §3, supaya `agenda --hours` menangkap kartu yang hanya dapat komentar.
- **Impor tidak pernah membuat owner (R1)**: anggota impor selalu `member`; baris owner/bot dilindungi dari impor.
- `/x/export` butuh token scope `impor` dan hanya owner/bot. `POST /v2/task/{id}/attachment` kini aktif (scope `tulis`, `multipart/form-data`): service role unggah ke Storage lalu `x_lampiran_catat`; allowlist MIME + 25 MB; kartu ClickUp saat cermin ditolak trigger.
- Burst limit per isolate Edge (40 kapasitas, 20/detik), bukan global.

## Masalah terbuka
1. ~~PR-1~~ **selesai (P1)**: `tags`/`checklists` (dan `custom_fields` bila tersimpan) kartu impor kini tampil persis bentuk ClickUp di `task`/`tasks --full`; kartu app tetap `[]`. `clickup.mjs` rhj-brain hanya membaca `custom_fields` (perintah `fields` memakai `/list/{id}/field`), tidak membaca tags/checklists.
2. **Space privat ClickUp (P2): kode selesai, tinggal probe data asli.** Dulu importer tidak mengirim anggota space privat (banding memakai bantuan psql); sekarang importer mengirim jenis `space_anggota` = gabungan `GET /list/{id}/member` semua list di space itu + owner/admin workspace (role 1/2 dari `/team`), jawaban mentah di `sync_raw` entity `list_member`. Bila satu list gagal dibaca atau struktur tidak tersapu lengkap, anggota space itu tidak disentuh dan run keluar kode 2; baris anggota sumber `app` tidak pernah dihapus impor. Sisa masalahnya hanya asumsi: ClickUp v2 tidak punya endpoint anggota space, jadi wajib dicek di data asli (langkah 4 dan `impor/README.md` "Asumsi yang WAJIB diprobe"). Riset K8: Online Sales kemungkinan privat (Riksa/Michael). Bila hasil probe meleset: tambahkan anggota lewat Admin → Struktur (sumber `app`, tidak dihapus impor) atau set `privasi_space` = `abaikan`.
3. **Asumsi yang belum diprobe ke ClickUp asli** (mock mengikuti asumsi; `uji/banding/README.md`, `impor/README.md`): `/list/{id}/member` di space privat (P2), pola URL tampilan `/v/l/6-<list>-1` / `/v/b/6-<list>-2` (P6), MIME CSV Windows = `application/vnd.ms-excel` (P3), urutan default `GET /list/{id}/task`, `include_closed=false` ikut membuang `done`, urutan balasan, lampiran komentar ikut di `task.attachments`, urutan assignees, `text_content` kosong = `""`, `reply_count` string, `date` lampiran string, `date_updated` naik saat komentar (R4), paginasi komentar 25, lampiran bisa diunduh tanpa login, email anggota tersedia.
4. **Rengga** (ClickUp 246027506) belum menerima undangan per 28/9. Kalau tidak ada di `/team`, impor hanya membuatnya anggota nonaktif (bila muncul sebagai assignee/penulis) atau tidak sama sekali.
5. **Bootstrap owner & bot belum ada skripnya**: migrasi tidak membuat anggota. Langkah SQL manual ada di bawah; sudah diuji lokal dengan identitas sintetis dalam transaksi yang di-rollback: bot mendapat ID ≥ 900000000000, 3 token `rtk_…` terbentuk, `impor_batch members` berikutnya melaporkan owner `dilindungi` dan tidak mengubah role/username.
6. `app_settings.tenggat_folder_ids` default `["1100340000026652"]` (folder RHJ Eksekusi menurut riset). Cocokkan dengan ID folder hasil impor.
7. Banding harian `clickup.mjs` ↔ `tugas.mjs` di data asli selama paralel (RENCANA §5.5) belum punya workflow; baru ada banding fixture.
8. Pemakaian Edge per bulan (batas Free 500 ribu) dan kuota subdomain Hostinger: belum dihitung/dicek.
9. `web/config.js` blok PRODUKSI dan `web/.htaccess` (CSP) masih berisi `GANTI_REF` / `GANTI_DENGAN_PUBLISHABLE_KEY`.
10. ~~Cari belum memakai `web_cari.rujukan`~~ **selesai (poles web W8)**: tautan `/l/<id>` atau URL tampilan ClickUp `/v/l/6-<list>-1` di Cari langsung membuka list itu; URL folder/space menampilkan info + tautan ke Jelajah. Diuji `13-poles.spec.mjs` tes 8.
11. **Keyboard virtual di HP asli belum dicek.** Dialog "Tugas baru" (tombol aksi tetap terlihat saat keyboard terbuka, lewat `visualViewport`) baru diuji dengan emulasi di Chromium headless (visualViewport palsu 480px dan viewport 420px). Cek manual di iPhone Safari dan Chrome Android: buka dialog, ketik di Nama lalu Due, tombol "Buat tugas" harus tetap di atas keyboard.
12. **Istilah yang sengaja dipertahankan** (keputusan Hannes bila ingin diganti): Due, Assignee, Filter, Space/Folder/List, owner, password/login, Token API, routine/agent, nama status (data ClickUp), padanan ClickUp dalam kurung ("Papan (Board)", "Awal (open)"). Ganti ke "Tenggat"/"Penanggung jawab" menyentuh banyak label dan tes web.
13. Font input 16px berlaku di semua ukuran layar (bukan hanya layar sentuh), supaya iPad ikut aman; kontrol di desktop sedikit lebih besar dari sebelumnya.
14. **Git**: commit `c8b3d6b` "WIP: putaran perbaikan (sedang berjalan)" (09:28 UTC, patch migrasi setengah jadi dari run yang terputus, sesi yang sama) sudah ada di branch `claude/rhj-task-management-app-cc50bk` dan origin. Semua hasil putaran poles DB + web + dokumen ini belum di-commit (33 berkas diubah + 3 baru). Commit/push menunggu keputusan Hannes; commit berikutnya di atas `c8b3d6b` sudah memuat versi final migrasi, jadi WIP itu tidak perlu di-revert.

## LANGKAH SESI BERIKUTNYA (deploy F5 → mulai paralel)
Prasyarat dari Hannes: project Supabase baru `rhj-tugas` (akun/org baru, Sydney `ap-southeast-2` per keputusan 30/9, Free); env cloud `SUPABASE_ACCESS_TOKEN` (PAT akun baru) + `SUPABASE_PROJECT_REF`; `CLICKUP_API_TOKEN` (sudah ada); sesi baru supaya env terbaca. Semua langkah ke ClickUp **GET saja**. Tidak memakai MCP Supabase (itu ERP).

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
Lalu GET endpoint yang sama dan pastikan `disable_signup=true` dan `password_min_length=8`. Uji: `POST /auth/v1/signup` dengan publishable key harus ditolak.
- **Password (catatan 29 Sep):** `password_min_length` = **8** (sama dengan batas web `ganti-password.js` dan Edge `password_sementara` ≥ 8; `supabase/config.toml` lokal masih 6, hanya dev). Spesifikasi Management API (`api.supabase.com/api/v1-json`, dicek 29 Sep) punya field `security_update_password_require_reauthentication` (padanan `secure_password_change` di config.toml) dan `security_update_password_require_current_password`. Keduanya **biarkan `false`** untuk sekarang dan pastikan lewat GET: layar ganti password web hanya mengirim password baru (`updateUser({password})`, tanpa nonce/password lama), dan reauth mengirim kode OTP lewat email yang butuh SMTP sendiri (email bawaan Supabase dibatasi). Dengan reauth aktif, ganti password dari sesi berumur > 24 jam akan ditolak. Menyalakannya = pekerjaan web (field password lama / alur nonce) + SMTP, di luar Fase 1.

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
1. Probe GET ClickUp untuk asumsi di Masalah terbuka #3 (pakai `rhj-brain/tools/clickup.mjs` baca-saja atau `curl` GET). Termasuk: apakah `GET /team/{id}/space` memberi `members` untuk space privat, dan apakah `GET /list/{id}/member` tiap list di space privat cocok dengan orang yang punya akses (tabel di `impor/README.md`). Salin 2–3 URL list/board/folder dari address bar ClickUp lalu `node cli/tugas.mjs resolve "<url>"` (setelah impor).
2. `node impor/sinkron.mjs --mode penuh --dry-run` dengan `CLICKUP_API_TOKEN`, `TUGAS_API_URL=https://$REF.supabase.co/functions/v1/api/v2`, `TUGAS_IMPORT_TOKEN` → hanya baca.
3. `node impor/sinkron.mjs --mode penuh` → wajib exit 0, `sensus.selisih = 0`. Laporan di `impor/laporan/` (gitignored, JANGAN commit).
4. Jalankan ulang `--mode penuh` → idempoten (`inserted 0`, `updated 0`).

### 5. Verifikasi sensus
- `GET /x/sensus?sumber=clickup` (token bot) vs sensus crawler: per list `tasks_total, open, closed, archived, subtasks, comments_top, replies, attachments_*, assignee_links, sha_ids_*` selisih 0. Serahkan tabel angka per list ke Hannes (tanpa nama kartu). Pembanding lama (23/9): 3 space, 11 list, 198 tugas (146 open, 52 closed), 65 lampiran 16,1 MB; angka sekarang belum dihitung.
- Lampiran: hitung `status_salin` ok/gagal/tautan_saja.
- Cek `spaces.private` (Masalah #2) dan `tenggat_folder_ids` (Masalah #6).
- Banding manual data asli: `node rhj-brain/tools/clickup.mjs agenda` vs `node cli/tugas.mjs agenda` (dan `task`/`comments --replies` beberapa kartu) → beda hanya N1–N11.
- Space privat: laporan run menulis "Space privat: <id> <n> anggota dari <m> list"; cocokkan dengan Hannes. Lampiran `tautan_saja` beserta alasannya ada di catatan laporan (`lampiran tautan_saja …`).

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
4. Uji: `/masuk` tampil tanpa galat CSP, login Hannes → wajib ganti password, `/t/<id ClickUp>` langsung membuka kartu, header `X-Robots-Tag: noindex`. Di iPhone Safari dan Chrome Android: dialog "Tugas baru" dengan keyboard terbuka, tombol "Buat tugas" tetap terlihat (Masalah terbuka #11).

### 8. GitHub Actions
- Secrets: `CLICKUP_API_TOKEN`, `TUGAS_API_URL`, `TUGAS_IMPORT_TOKEN`, `TUGAS_EXPORT_TOKEN`, `BACKUP_AGE_PUBKEY` (Hannes buat `age-keygen` di perangkatnya; kunci privat TIDAK ke GitHub).
- Variables: `SINKRON_AKTIF=1`, `BACKUP_AKTIF=1`.
- Uji `workflow_dispatch`: sinkron `dry_run` dulu, lalu penuh; backup + uji buka dengan kunci privat (uji restore).

### 9. Tutup sesi
Laporan ke Hannes: angka sensus per list, status lampiran, jawaban probe (termasuk anggota space privat hasil `/list/{id}/member`), keputusan privasi space. Mode tetap `cermin`; routine tetap memakai ClickUp sampai cutover (F7).
