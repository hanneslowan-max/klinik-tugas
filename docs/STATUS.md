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
- **Perawatan lampiran (hemat Storage)**: `POST /x/rawat/lampiran` + `x_rawat_lampiran` (scope `impor`, owner/bot) menghapus BERKAS lampiran app pada kartu selesai > N hari (setelan `app_settings.rawat_lampiran` `{aktif,hari}`, default 7; hanya `sumber=app`, salinan ClickUp dibiarkan). Baris di-soft-delete (jejak activity `lampiran_hapus`); berkas dihapus service role. Job terjadwal `rawat.yml` (harian 02:30 WIB, gerbang `RAWAT_AKTIF=1`), skrip `impor/rawat.mjs`.
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

## Modul Pipeline (12 Okt 2026)

- **Live:** PR #8 (11–12 Okt) — tabel `pelanggan`/`kontak`/`lead`/`lead_item`/`lead_aktivitas`/`lead_riwayat_tahap`/`pipeline_akses` + RLS, layar Lead saya / Detail / Ringkasan / Admin Akses, API `/x/pipeline/*`, CLI `pipeline list|get|summary|fu-set`. Spesifikasi: rhj-brain `deliverables/pipeline-anvil/RANCANGAN-MODUL-PIPELINE.md`.
- **Perbaikan hasil cek (PR #9):** migrasi `20261012120000_pipeline_ringkas_v2` (win rate kohort umur ≥ 90 hari; omzet per rep via kode SP bila pemilik kosong; siklus tanpa tanggal SP tebakan) **sudah diterapkan ke produksi 12 Okt**; alat impor: SP + nilai → ORDER, `diam_sejak` lead impor = tanggal lead 12:00 WIB.
- **Data:** 2.008 lead dari sheet s/d 12 Okt diimpor; per bulan Okt 2025–Okt 2026 lead & omzet (dasar tanggal lead) = sheet, selisih 0. 600 lead bertanda PERIKSA (data sheet tak lengkap).
- **Akses:** Riksa (rep, RSG), Michael Eppy (rep, MCE), Yosie (baca; telepon & PIC disembunyikan). Owner implisit admin.
- **Revisi #1 (13 Okt, branch `claude/trusting-bell-zz7ocs`): Papan kategori pribadi.** Layar Pipeline punya tombol
  Daftar | Papan (`?v=papan`). Papan = kolom "Tanpa kategori" + kategori buatan pengguna SENDIRI (tambah, ganti nama,
  geser kiri/kanan, hapus lewat menu ⋯; maks 30); lead diseret antar kolom seperti Papan Tugas Saya. Pribadi per
  pengguna (keputusan Hannes): orang lain tidak melihat kategori/penempatan, dan tahap/pemilik/ringkasan lead TIDAK
  berubah. Papan memuat semua lead sesuai saringan (keputusan Hannes), 30 kartu per kolom + "Tampilkan lagi". Tampilan
  Daftar menampilkan chip nama kategori. Migrasi `20261013120000_pipeline_kategori` (tabel `pipeline_kategori` +
  `pipeline_kategori_lead`, fungsi `web_pipeline_kategori` / `_simpan` / `_pindah`). **Terapkan migrasi ke produksi
  (`bash alat/sql-proyek.sh --migrasi`) SEBELUM merge**: Hostinger langsung men-deploy `main`, dan tanpa migrasi
  tampilan Papan galat (Daftar tetap jalan, hanya tanpa chip). Tes: `uji/db/19_pipeline_kategori.sql` (50 cek),
  `web/tests/e2e/pipeline-papan.spec.ts`.
- **Revisi #3–#7 (13 Okt): tab Order.** Chip "Order" di layar Pipeline (`?tab=order`): rekap (jumlah, nominal,
  terbayar, sisa tagihan), order dikelompokkan per bulan SP (terbaru dulu, subtotal per bulan), tabel di desktop / kartu di HP,
  tombol pensil → dialog **Data order** (nominal, nomor urut SP → No SP dibangun ulang dari tanggal SP, **No PO customer**
  — kolom terpisah dari No SP, keputusan Hannes —, pembayaran **Belum bayar / DP / Lunas** dengan nominal DP & sisa tagihan,
  tanggal DP/lunas, jejak siapa/kapan), **Unduh CSV** (pemisah `;` + BOM untuk Excel Indonesia). Hak ubah: rep pemilik +
  admin (= `pipeline_boleh_ubah`); 'baca' melihat saja. Order yang sudah ada sebelum migrasi = status bayar **"Belum dicatat"**
  (tidak diketahui; tidak dihitung sebagai piutang, bisa disaring & diisi bertahap); lead yang menjadi ORDER sesudahnya otomatis
  "Belum bayar" (trigger). **Filter** (semua tab, di URL `st`/`dari`/`sampai`): status = status bayar di tab Order / tahap di tab
  lain; tanggal = tanggal SP di tab Order / tanggal masuk di tab lain, dengan pintasan bulan. **Cari** (server) kini juga
  mencocokkan PIC (bukan untuk peran 'baca'), produk & spesifikasi, No SP & No PO sebagian. Detail lead ORDER menampilkan No SP,
  No PO, nominal, pembayaran + tombol Data order; order yang dibatalkan (BATAL "Order dibatalkan", lihat Batal order di bawah)
  tetap menampilkannya, hanya-baca. Migrasi `20261013150000_pipeline_order` (kolom lead baru, trigger, redefinisi
  `j_pipeline_lead` / `j_pipeline_lead_ringkas` / `inti_pipeline_daftar` — field hanya bertambah —, `web_pipeline_order_ubah`).
  Tes: `uji/db/22_pipeline_order.sql` (52 cek), `web/src/features/pipeline/order.test.ts`, `web/tests/e2e/pipeline-order.spec.ts`.
  **Terapkan ke produksi bersama migrasi lain, SEBELUM merge.**
- **Hak Pipeline dirapikan (13 Okt, migrasi `20261013121000_pipeline_hak_ketat`).** Sejak PR #8 tes DB 01/09/16 merah
  (CI tidak menjalankan `uji/db`, jadi tak terlihat di PR): hak bawaan Supabase memberi service_role hak tulis langsung ke
  7 tabel + 4 sequence Pipeline, `web_pipeline_*` bisa dipanggil service_role, dan pembantu `pipeline_wr` /
  `pipeline_akses_saya` bisa dipanggil role API. Sekarang fail-closed: tabel SELECT saja, sequence tertutup,
  `web_pipeline_*` → authenticated, `x_pipeline_*` → service_role, `boleh_pipeline*` → authenticated (dipakai policy RLS),
  pembantu lain internal. Tidak ada pemanggil yang bergantung pada hak yang dicabut (web/Edge/CLI hanya lewat fungsi; impor
  berjalan sebagai postgres). Tes: 01 (+cek sequence service_role), 09 (jumlah `web_*` 47 → 48 sesudah tab Order, `api_/x_/impor_` 35), 16
  (allowlist + 2 pembantu RLS Pipeline), baru `21_pipeline_hak.sql` (18 cek: hak + semua jalur aplikasi tetap jalan).
  **Terapkan ke produksi bersama migrasi kategori, SEBELUM merge.** Semua `uji/db` hijau. Catatan: `11_x` merah bila dijalankan
  sesudah e2e `papan-saya.spec.ts` di DB yang sama (kartu uji yang di-soft-delete menambah hitungan list "Latihan Uji");
  jalankan `uji/db` sebelum e2e atau sesudah `supabase db reset`.
- **Performa daftar Pipeline (13 Okt, revisi "loading terasa lambat", migrasi `20261013170000_pipeline_daftar_cepat`).**
  `inti_pipeline_daftar` kini membangun semua baris dalam satu kueri set-based (`j_pipeline_lead_ringkas_banyak`), bukan
  `j_pipeline_lead_ringkas` per lead: lokal 2.053 lead 324–378 → 103–138 ms per muat/refetch. Kontrak JSON TIDAK berubah
  (keluaran lama vs baru identik), jadi bisa dipasang ke produksi sebelum/sesudah deploy web (manual oleh Hannes).
  **Perawatan: field ringkas lead kini ada di DUA tempat** — `j_pipeline_lead_ringkas` (per lead) dan
  `j_pipeline_lead_ringkas_banyak` (daftar); menambah/mengubah field = ubah KEDUANYA. Tes `uji/db/23_pipeline_daftar_cepat.sql`
  (23 cek: bentuk sama untuk setiap lead, keluaran identik admin/rep/baca × tab/cari/pemilik pada ±2.000 lead, hak fungsi).
  Sisi web (render bertahap 50 baris, kotak cari terpisah) tidak bergantung pada migrasi ini.
- **Nilai penawaran wajib (14 Okt, keputusan Hannes, kartu rtz1tqi1vh, migrasi `20261014120000_pipeline_nilai_penawaran_wajib`).**
  "Kirim penawaran" kini menolak nilai kosong/0 (server `inti_pipeline_tahap` + dialog web). Penawaran ulang tanpa angka
  baru memakai nilai lama bila > 0. Sumber, qty > 0 per produk, dan alasan Batal sudah wajib sejak modul dibuat; nilai
  penawaran satu-satunya yang belum (L-01986 tersimpan 0). Tes `uji/db/24_pipeline_nilai_penawaran.sql` (8 cek; juga dijalankan
  di produksi dalam transaksi yang di-rollback: semua lulus, tanpa sisa). **Terapkan migrasi ke produksi SEBELUM/bersamaan merge.**
  `uji/db/21_pipeline_hak.sql` ikut disesuaikan (jalur "Kirim penawaran" di tes hak kini mengirim nilai).
- **Batal order (14 Okt, revisi Hannes, migrasi `20261014130000_pipeline_batal_order`).** "Customer bisa membatalkan
  setelah terjadi order": detail lead **ORDER** kini punya tombol **Batalkan order** → dialog dengan alasan **tertulis**
  wajib (teks bebas 5–500 karakter sesudah dirapikan; form & server sama). Hak: admin/owner + rep **pemilik** lead (lebih
  ketat dari Data order); order tanpa pemilik → hanya admin (rep Klaim dulu); 'baca' tanpa tombol (server PT403). Efek
  (keputusan Hannes): lead pindah ke **BATAL** dengan `alasan_batal` **"Order dibatalkan"** (kategori baru, hanya lewat
  tombol ini; CHECK `lead_alasan_batal_check` diganti superset) + teks alasan di `alasan_batal_lain`. Data order (No SP,
  tanggal SP, nominal, No PO, pembayaran) **tidak dihapus**: tetap tampil di detail lead sebagai riwayat (hanya-baca;
  pembayaran ditampilkan netral, pengembalian dana diurus di luar Anvil) dan **No SP tetap terpakai** (unik, tidak bisa
  dipakai lead lain). Lead keluar dari tab Order dan dari order/omzet Ringkasan, masuk hitungan batal (`per_alasan_batal`
  "Order dibatalkan", kolom batal per bulan) dan dihitung kalah di win-rate kohort (menang = tahap ORDER) — Ringkasan
  tidak perlu diubah. Jejak: `lead_riwayat_tahap` ORDER→BATAL (trigger: siapa + kapan) + aktivitas **Catatan** "Order
  dibatalkan. Alasan: …" atas nama pelaku; rencana FU (`fu_berikutnya`) dikosongkan. Jalur: `web_pipeline_tahap` `{lead_id, aksi: 'batal_order', alasan}` (tanpa
  fungsi/endpoint baru; baris dikunci `FOR UPDATE`, jadi tidak bisa saling menyalip dengan Data order).
  **Penjaga server baru:** lead ORDER tidak bisa lagi dipindah lewat aksi penawaran/order/batal/alihkan (PT409 — dulu bisa
  lewat RPC tanpa alasan walau UI tak punya tombolnya); alasan "Order dibatalkan" ditolak di aksi Batal biasa (PT400);
  **order yang dibatalkan final** (aksi tahap apa pun → PT409, sesuai dialog "tidak bisa diurungkan"; customer order lagi
  = lead baru), jadi status bayar/No PO lama tak terbawa dan alasan tertulis tak terhapus; aksi `order` pada lead BATAL
  biasa (lewat API) mengosongkan alasan batal lama; `web_pipeline_order_ubah` pada order yang dibatalkan → PT409. **Alat impor:** impor ulang (hari pindah) melewati utuh lead yang ordernya
  dibatalkan di Anvil (penjaga di tiap blok SQL, konstanta `ALASAN_BATAL_ORDER` di `alat/impor-pipeline.mjs`), supaya
  tidak kembali ORDER karena sheet masih menulis "Order"; diuji `uji/pipeline/jalankan.mjs` (108 cek) + sekali di DB lokal
  dalam transaksi yang di-rollback. Tes: `uji/db/25_pipeline_batal_order.sql` (78 cek),
  `web/tests/e2e/pipeline-batal-order.spec.ts` (6 tes × HP/desktop), unit `web/src/features/pipeline/batal-order.test.ts` +
  `order.test.ts` (24 tes). Verifikasi 14 Okt dari `supabase db reset`: `uji/db` **25/25 berkas, 1.322 cek**; vitest 15
  berkas/99 tes; typecheck, lint, build produksi hijau; e2e penuh `next start` + Supabase lokal: **112 lulus, 14 dilewati
  sengaja**. **Terapkan ke produksi `20261014120000` (PR #12) LALU `20261014130000`, SEBELUM merge**
  (Hostinger langsung men-deploy `main`; web baru di DB lama → galat "Aksi tahap tidak dikenal: batal_order"). Bila
  `20261014120000` suatu saat diterapkan (ulang) sesudahnya, **terapkan ulang `20261014130000`** (keduanya
  `create or replace inti_pipeline_tahap`; yang terakhir menang).
- **Papan bisa digeser saat kategorinya banyak (14 Okt, laporan Hannes "kalau buat banyak board ga bisa digeser").** Dulu
  wadah gulir horizontal setinggi kolom terpanjang ("Tanpa kategori" ±2.000 lead), jadi scrollbar-nya ribuan px di bawah
  layar dan mouse biasa tidak bisa menggeser papan. Kini di desktop (lg) papan setinggi sisa layar (`--atas-papan`
  diukur `useGeserPapan`), tiap kolom menggulir sendiri, dan ada tombol geser ◀ ▶ di tepi papan (Shift + roda juga
  bisa). HP tidak berubah (usap). Tes e2e di `pipeline-papan.spec.ts` (9 kolom). Tanpa migrasi.
- **Peringatan lead dobel per nomor WA (15 Okt, IMP-CMO-261015-1, ACC Hannes, branch `claude/anvil-cek-duplikat-wa`,
  migrasi `20261015120000_pipeline_cek_duplikat_wa`).** 50 dari 170 lead Okt bernama pelanggan "-", jadi kunci dobel =
  nomor. Form Lead baru memanggil `web_pipeline_cek_duplikat(p_telepon)` (inti `inti_pipeline_cek_duplikat`; normalisasi
  `pipeline_telp_norm`, nomor < 8 digit diabaikan; maks 5 lead terbaru + total) saat kolom Telepon / WA ditinggalkan dan
  sebelum simpan → peringatan "Nomor ini sudah ada di lead: <kode> (<tahap>, PIC <sales>) — cek dulu, jangan dobel".
  BUKAN blokir: bila baru ketahuan saat Simpan, ditahan sekali; tekan lagi tersimpan. Hak = `web_pipeline_pelanggan_cari`
  (admin/owner/bot + rep; 'baca' & tanpa akses PT403). Nomor tidak bisa diubah sesudah lead dibuat (dialog Ubah tanpa
  kolom telepon), jadi tidak ada cek di sana. Ikut di PR yang sama: **teks bantu di bawah Sumber** (Lead baru & Ubah):
  "Tanya pelanggan: dapat kontak kami dari mana? …" — data 15 Okt: 46 dari 48 lead sejak 13/10 "WA langsung", 0 "Google
  Ads"; daftar nilai Sumber, CHECK DB, dan data lama TIDAK diubah. Tes: `uji/db/27_pipeline_cek_duplikat.sql` (36 cek;
  dinomori ulang dari 26 karena 26 dipakai database pelanggan; 09: `web_*` 56 sesudah digabung dengan PR #15),
  `web/src/features/pipeline/duplikat.test.ts`, `web/tests/e2e/pipeline-cek-duplikat.spec.ts`.
  **Migrasi diterapkan ke produksi 17 Okt** (sebelum merge, bersama `20261017140000`). Temuan sampingan peran NULL
  (`inti_pipeline_lead_buat` / `pipeline_boleh_ubah` / `inti_pipeline_fu_set` memakai `peran not in ('admin','rep')`, jadi
  anggota tanpa akses Pipeline bisa membuat lead, mencatat FU / pindah tahap / ubah lead tanpa pemilik, dan mengatur
  rencana FU lewat RPC langsung) **sudah diperbaiki**: migrasi `20261017140000_pipeline_hak_peran_null` (coalesce →
  PT403; tes `uji/db/28_pipeline_hak_peran_null.sql` 16 cek, gagal tanpa perbaikan, lulus dengan). `inti_pipeline_pelanggan_cari`
  sudah diperbaiki di `20261017130000` (PR #15). Diterapkan ke produksi 17 Okt.
  Digabung dengan PR #15 17 Okt (form Lead baru memuat keduanya: saran pelanggan lama + jumlah order, dan peringatan
  nomor dobel). Verifikasi dari `supabase db reset`: `uji/db` **28/28 berkas, 1.509 cek**; vitest 112 tes; typecheck, lint,
  build hijau; e2e penuh `next start`: **136 lulus, 14 dilewati sengaja**.
- **Database pelanggan & log repeat order (17 Okt, permintaan Hannes, migrasi `20261017120000_pipeline_pelanggan`).**
  "Lead yang diinput dijadikan database, jadi customer yang sama repeat order ketahuan log-nya." Tabel `pelanggan`
  sudah ada sejak PR #8, tetapi data impor sheet terpecah (17 Okt produksi: 1.856 pelanggan / 2.062 lead; 48–49 nama
  dobel beda ejaan, 56 nomor HP di >1 pelanggan, 458 nama pengisi "-"/"Perorangan"/"Pribadi"). Yang dibangun:
  - **Layar Pelanggan** (`/pipeline/pelanggan`, tombol "Pelanggan" di layar Pipeline, semua peran): daftar pelanggan +
    jumlah lead/order, nilai order, order terakhir, chip **Repeat** (≥2 order); saringan Semua / Repeat order / Pernah
    order / Ada lead aktif; urutan aktivitas terakhir / order terbanyak / nilai / nama; cari nama (juga ejaan lain:
    "berkah nidatama" = "PT. BERKAH NIDATAMA"), kota, PIC & nomor HP (PIC/HP bukan untuk peran baca).
  - **Detail pelanggan** (`/pipeline/pelanggan/[id]`): data & kontak (baca: disembunyikan), ringkasan (order, nilai,
    order pertama/terakhir, **jeda rata-rata antar order**), **log semua lead & order** terbaru dulu dengan chip
    **"Order ke-N"** (urut tanggal SP), riwayat gabung, tombol Ubah data pelanggan (admin & rep). Tautan lama ke
    pelanggan yang sudah digabung dialihkan ke tujuannya.
  - **Detail lead**: nama perusahaan menautkan ke halaman pelanggan + bagian **"Order & lead lain pelanggan ini"**
    (sudah order berapa kali, total, order terakhir, lead ini order ke berapa, 5 lead lain terbaru).
  - **Label Repeat** di daftar lead, tab Order, dan Papan: field ringkas baru `order_sebelumnya` (order lain pelanggan
    yang sama sebelum lead ini; tanggal order = tanggal SP) + `pelanggan_id`, di `j_pipeline_lead_ringkas` DAN `_banyak`.
  - **Form Lead baru**: saran pelanggan lama kini cocok lewat kunci nama & nomor HP, menampilkan "N order · terakhir …",
    nama pengisi tidak disarankan lewat nama (hanya lewat nomor HP, tampil sebagai nama PIC), dan batas 15 hasil kini
    benar-benar berlaku (dulu `limit` jatuh pada hasil agregat, jadi semua kecocokan dikirim).
  - **Gabung pelanggan dobel (admin)**: saran di detail pelanggan ("Mungkin pelanggan yang sama": nama sama / nomor HP
    sama / nama mirip ≥0,6 trigram) dan layar **Saran gabung** (`/pipeline/pelanggan/dobel`: pilih tujuan, ganti nama,
    Gabungkan, atau "Bukan dobel"). Lead & kontak dipindah, pelanggan sumber dihapus; **setiap gabung tercatat**
    (`pelanggan_gabung`: salinan baris sumber + id lead/kontak) dan **bisa dibatalkan** (juga untuk rantai A→B→C; lead baru
    milik tujuan tidak tersentuh). Data lead selain `pelanggan_id` tidak berubah.
  - **Sumber lead TIDAK diubah otomatis** jadi "Repeat order": sumber = kanal yang dicocokkan Agen Data Harian dengan
    konversi Google Ads; status repeat dihitung dari riwayat.
  - **Gabung otomatis data lama** (keputusan Hannes: "otomatis + alat"): `pipeline_pelanggan_gabung_otomatis(aktor,
    jalankan)` — hanya yang pasti sama: kunci nama sama persis (bukan nama pengisi) dan pelanggan bernama pengisi dengan
    nomor HP sama. Tujuan = lead terbanyak, lalu order terbanyak, lalu lead tertua. `false` = uji kering (dijalankan lalu
    di-rollback, laporan sama persis). Uji kering produksi 17 Okt (kueri baca setara): **49 kelompok nama + 5 kelompok
    nomor HP → 61 pelanggan digabung, 66 lead dipindah**, tanpa lead hilang. Sisanya (nomor sama tapi nama beda, nama
    mirip/salah ketik) lewat layar Saran gabung.
  - **Alat impor** (`alat/impor-pipeline.mjs`) kini menghormati gabung/ubah nama di Anvil (lihat `docs/IMPOR-PIPELINE.md`);
    tanpa ini impor ulang hari pindah membatalkan penggabungan (dibuktikan di DB lokal: alat lama 3 pelanggan dibuat ulang
    + 3 lead pindah kembali, alat baru 0 + 0). **Butuh migrasi `20261017120000` sudah terpasang.**
  - Skema: kolom terhitung `pelanggan.kunci` / `pelanggan.semu` (STORED, indeks btree), tabel `pelanggan_gabung` (log) &
    `pelanggan_dobel_abaikan`, 7 fungsi `web_pipeline_pelanggan*`. Saran "nama mirip" membandingkan pasangan yang 2 huruf
    awal / 3 huruf akhir kuncinya sama (produksi: 30 dari 30 pasangan perbandingan penuh). Kinerja lokal (1.900 pelanggan,
    2.060 lead): daftar ±110–120 ms, detail ±16 ms, cari ±4 ms, saran gabung (admin) ±0,5 dtk, daftar lead tetap ±90 ms.
  - **Perbaikan hak (migrasi `20261017130000_pipeline_pelanggan_hak`):** `inti_pipeline_pelanggan_cari` & `_ubah` memakai
    `peran not in ('admin','rep')`, sehingga anggota TANPA akses Pipeline (peran NULL) lolos: lewat RPC langsung bisa
    mencari pelanggan + kontak (nama PIC, nomor HP). `_ubah` kebetulan tetap gagal (detail di akhir fungsi menolak →
    rollback). Kini `coalesce(peran, '')` → PT403. Ditemukan sesudah `20261017120000` diterapkan; perbaikan diterapkan ke
    produksi 17 Okt. Pola yang sama di fungsi lama (`inti_pipeline_lead_buat`, `pipeline_boleh_ubah`; dicatat PR #14)
    belum diubah.
  - Tes: `uji/db/26_pipeline_pelanggan.sql` (134 cek, termasuk 9 cek anggota tanpa akses), 09 (jumlah `web_*` 48 → 55), `uji/pipeline/jalankan.mjs` (111 cek),
    unit `web/src/features/pipeline/pelanggan.test.ts`, e2e `web/tests/e2e/pipeline-pelanggan.spec.ts` (8 tes × HP/desktop).
    Verifikasi 17 Okt dari `supabase db reset`: `uji/db` **26/26 berkas, 1.457 cek**; vitest 104 tes; typecheck, lint, build
    produksi hijau; e2e penuh `next start` + Supabase lokal: **130 lulus, 14 dilewati sengaja**.
  - **Urutan produksi:** terapkan migrasi `20261017120000` **SEBELUM merge** (web baru di DB lama → layar Pelanggan galat
    "fungsi tidak ditemukan"); lalu, dengan izin Hannes, jalankan gabung otomatis:
    `select public.pipeline_pelanggan_gabung_otomatis(312823267, false);` (uji kering) lalu `…(312823267, true)`.
  - **Sudah diterapkan di produksi 17 Okt (izin Hannes):** migrasi `20261017120000` (lewat `alat/sql-proyek.sh --migrasi`)
    lalu gabung otomatis — uji kering & jalankan identik: **54 kelompok, 61 pelanggan digabung, 66 lead dipindah**;
    pelanggan 1.856 → 1.795; lead 2.062 (sidik md5 id/tahap/SP/nilai/pemilik/tanggal sama sebelum & sesudah), item 2.062,
    aktivitas 587, kontak 1.900 tetap; 0 lead/kontak yatim; 0 nama dobel tersisa; 61 catatan gabung (bisa dibatalkan per
    pelanggan). Pelanggan dengan ≥2 order 43 → 46; 102 order kini tercatat sebagai repeat (Order ke-2 dst.).
- **Baris alat daftar Pipeline dirapikan (19 Okt, permintaan Hannes "kelola akses sampai lead baru agak berantakan"):**
  di HP tombol Kelola akses / Pelanggan / Ringkasan / Lead baru dulu pecah jadi 2–3 baris di bawah sakelar Daftar|Papan.
  Kini Pelanggan, Ringkasan (admin/baca), Kelola akses (owner) pindah ke kepala halaman (`AksiPipeline`): desktop (`lg`)
  tombol berlabel, HP/tablet satu tombol ⋯ (`menu-pipeline`). Lead baru: desktop tetap tombol di baris alat, HP/tablet
  tombol melayang di atas navigasi bawah (pola "+ Tugas"). Rep: ikon Daftar|Papan disembunyikan di bawah `sm` supaya
  "Lead saya|Semua" + "Daftar|Papan" tetap satu baris di HP 360 px. Tanpa perubahan DB.
- **Saringan Produk menggantikan tab "Pallet Mesh" (19 Okt, permintaan Hannes "lihat semua produk, termasuk roda,
  lemari arsip"):** tombol **Produk** di sebelah Filter berisi Semua produk + 8 produk (`PRODUK`) dengan jumlah lead
  masing-masing (saringan lain tetap berlaku). Berlaku di semua tab (termasuk Order & Papan), disimpan di URL
  `?produk=`, ikut Reset. Lead dengan beberapa produk muncul di setiap produknya. Disaring di web dari daftar yang sudah
  dimuat (tanpa permintaan baru, tanpa perubahan DB); `tab=pm` di `web_pipeline_daftar` dibiarkan (tidak dipakai web).
  Bedanya dengan tab lama: tab "Pallet Mesh" hanya lead terbuka (BARU/PENAWARAN); kini Semua + Pallet Mesh = semua tahap
  (pakai tab Penawaran atau Filter → Tahap untuk mempersempit). Produksi 19 Okt (lead per produk): Roda 1.417,
  Lainnya 218, Pallet Mesh 202, Airport Trolley 92, Shopping Cart 74, Lemari Arsip 59; Material Handling & Locker 0.
- **Urutkan daftar Pipeline (19 Okt, permintaan Hannes "opsi untuk sort"):** tombol Urutkan (`PilihUrut`, `?urut=`;
  semula di kanan baris "N lead", lihat di bawah). Tab lead: Paling lama diam (bawaan = urutan server), Terbaru masuk, Terlama masuk, Follow up
  terdekat (tanpa jadwal di akhir), Nama pelanggan A–Z. Tab Order: Tanggal SP terbaru (bawaan), Tanggal SP terlama
  (bulan juga dibalik; "Tanpa tanggal SP" tetap terakhir), Nilai terbesar & Nama A–Z (dalam bulan; rekap per bulan
  tetap). Berlaku juga di Papan dan unduhan CSV. Urutan dibuang saat masuk/keluar tab Order (pilihannya beda); bukan
  saringan, jadi Reset tidak mengubahnya. Diurutkan di web (urutan stabil: yang setara tetap urutan server); tanpa
  perubahan DB.
- **Filter tanggal dipadatkan + tombol Urutkan dipindah (19 Okt, permintaan Hannes):** pintasan tanggal (Tanggal SP di tab
  Order, Tanggal masuk di tab lain) kini Hari ini / Minggu ini (Senin–Minggu) / Bulan ini / Bulan lalu / Tahun ini /
  **Custom**; daftar per bulan ("Oktober 2025" dst., `bulanTersedia`) dihapus. Kolom Dari–Sampai hanya muncul saat Custom
  (juga otomatis bila rentang di URL bukan salah satu pintasan); Custom lagi = tutup & hapus tanggal. Tombol Urutkan
  pindah dari baris "N order" (di HP tertutup tombol melayang "Lead baru", laporan Hannes) ke baris Filter · Produk ·
  Urutkan; teks tombol "Urutkan" atau nama pendek urutan terpilih. Tombol Produk kini berlabel "Produk" saat belum dipilih.
- **Saringan Sales (19 Okt, permintaan Hannes "filter lead berdasarkan sales"):** grup **Sales** di panel Filter: Semua,
  tiap pemilik lead (nama dari `pemilik_nama`), dan Tanpa pemilik, masing-masing dengan jumlah lead (saringan lain tetap
  berlaku). `?sales=<id>|tanpa`, dihitung di lencana Filter, ikut Reset, berlaku di semua tab & Papan. Hanya tampil saat
  daftar memuat semua pemilik (admin/baca, atau rep di "Semua"); rep di "Lead saya" sudah disaring server (`?m=`), dan
  pindah ke "Lead saya" membuang `sales`. Disaring di web; tanpa perubahan DB. Produksi 19 Okt: Michael Eppy 705 lead,
  Riksa Sri Gustiana 528, tanpa pemilik 842.
- **Kuota GitHub Actions habis (19 Okt):** 2.000 menit/bulan akun `hanneslowan-max` terpakai 100% (email GitHub 11:19
  WIB; budget $0 → job tidak diberi runner, gagal ±4 dtk tanpa log). Reset 1 Nov 2026. Keputusan Hannes: sampai reset,
  **gerbang merge = verifikasi lokal** di sesi (lint, typecheck, vitest, build produksi, e2e lengkap HP+desktop terhadap
  `next start` + Supabase lokal, dan build tiruan Hostinger di container `almalinux:8`); CI merah karena kuota tidak
  menahan merge. Deploy Hostinger (Git) tidak terpengaruh. Hemat kuota (`web.yml`): build-hostinger & e2e hanya di PR /
  manual (tidak diulang saat push ke main), perubahan `.md` saja tidak memicu workflow. Satu run PR penuh ±13 menit.
- **Belum:** hari pindah (sheet dikunci, routine rhj-brain beralih lewat `routines/cloud/PIPELINE-SUMBER.md`). Urutan: rhj-brain `deliverables/pipeline-anvil/HARI-PINDAH.md`. Impor ulang di hari pindah: `docs/IMPOR-PIPELINE.md` — **wajib pakai alat impor versi berpenjaga (14 Okt, sesudah Batal order)**; versi lama mengembalikan order yang dibatalkan di Anvil ke ORDER.
- **Bukti sumber lead dari chat WA (21 Okt, Kapso Fase 1, ACC Hannes, branch `claude/fase-1-kapso-sg6o0q`, migrasi
  `20261021120000_pipeline_sumber_bukti`).** Chat WA 0878 kini terbaca lewat Kapso (baca saja); routine agent mencari bukti
  asal lead dengan pola tetap tanpa AI (template form situs, Ref WEB/GA-RH/OY, Ref PM/RD, XS-PM/TIDUR, "Halo Bu Lastri",
  katalog WA). Label `sumber` sales tidak bisa dipegang (contoh: 28 lead form situs berlabel "WA langsung"), tetapi agent
  TIDAK menimpanya: bukti ditulis ke 4 kolom baru `lead.sumber_bukti` (kelas, allowlist `pipeline_sumber_bukti_kelas()`),
  `_kode` (mis. `GA-OY-7K3F`), `_chat_pada`, `_diisi_pada`, satu-satunya lewat `x_pipeline_sumber_bukti_set` (Edge
  `POST /x/pipeline/sumber-bukti`, scope tulis, aktor owner/bot/admin Pipeline; CLI `pipeline bukti-set --file <items.json>
  [--dry-run]`, juga di salinan `tools/tugas.mjs` rhj-brain). Maks 200 item, semua-atau-tidak, idempoten; tidak dicatat ke
  riwayat lead (`lead_aktivitas` menggeser diam & menimpa rencana FU). Jalur web/sales tidak bisa mengubah kolom bukti
  (payload diabaikan, tabel SELECT saja, penjaga trigger `pipeline_lead_sumber_bukti` → PT403). Detail & daftar lead
  (web dan `/x`) memuat 4 field; detail web menampilkan baris hanya-baca "Bukti sumber (agent): Form situs RH · chat …" di
  bawah Sumber. Kontrak: `docs/KONTRAK-DB.md` §11. Tes: `uji/db/30_pipeline_sumber_bukti.sql` (100 cek; dinomori 30 karena
  29 dipakai PR #22), 09 (`api_/x_/impor_` 35 → 36), unit `web/src/features/pipeline/bukti-sumber.test.ts`, e2e
  `web/tests/e2e/pipeline-bukti-sumber.spec.ts`. Verifikasi lokal 21 Okt dari `supabase db reset` (CLI 2.120.0): `uji/db`
  **29/29 berkas, 1.609 cek**; kontrak API lokal 492 lulus, 1 gagal (snapshot `clickup.mjs` rhj-brain sudah bergeser, tidak
  terkait); vitest 124; typecheck, lint, build hijau; e2e penuh `next start`: **148 lulus, 14 dilewati sengaja**; gabungan
  uji dengan PR #22: lihat catatan PR.
  **Hannes: terapkan migrasi ke produksi lalu merge** (web baru di DB lama: baris bukti tidak tampil, tanpa galat; route &
  CLI `bukti-set` galat sampai migrasi terpasang). Tidak bergantung pada PR #22 (`20261020120000_pipeline_fu_otomatis`);
  urutan merge bebas.

## Notifikasi "Dari tim" / "Dari agent" (revisi #2, 13 Okt 2026, branch `rev2-notif`)

- **Permintaan Hannes:** pisahkan notifikasi dari claude agent dan dari user. Layar `/notif` punya 2 tab: **Dari tim**
  (bawaan) dan **Dari agent** (`/notif?dari=agent`). Tiap tab menampilkan angka belum dibaca dan memuat datanya sendiri
  (100 terbaru per tab), jadi tab tim tidak terdesak oleh notifikasi agent. "Tandai semua dibaca" pindah ke bawah tab
  dan hanya berlaku untuk tab aktif (judul "Notifikasi" di HP kini tidak lagi terdesak tombol). Lonceng dan badge menu
  tetap TOTAL semua tab (tidak berubah).
- **Aturan agent** (satu pintu SQL `notif_dari_agent`): aktor ber-role `bot` ("claude (agent)") ATAU tindakan pemicunya
  lewat token API (`notifications.sumber = 'api'`: Edge `/api`, CLI, routine, importer) walau tokennya milik anggota
  manusia. Kasus kedua diberi chip "lewat API". Selain itu masuk tab tim.
- **Migrasi `20261013160000_notif_pisah_agent` (aditif):** kolom `notifications.sumber` + trigger pengisi + isi mundur dari
  `activity`; `web_notif(p_limit, p_dari)` dan `web_notif_baca(p_ids, p_dari)`. Parameter baru opsional, JSON hanya
  bertambah, jadi web lama, `web-lama/` dan uji lama tetap jalan. **Terapkan ke produksi (`bash alat/sql-proyek.sh
  --migrasi`) SEBELUM merge**: web baru di atas DB lama membuat `/notif` galat (PGRST202); web lama di atas DB baru aman.
  Sesudah terap, pastikan tepat satu `web_notif(integer,text)` dan satu `web_notif_baca(bigint[],text)`:
  `select oid::regprocedure from pg_proc where proname in ('web_notif', 'web_notif_baca');`
- **Konfirmasi data produksi** (baca-saja, SQL editor). Menurut catatan bootstrap (tabel sesi deploy & langkah 8), semua
  token dibuat untuk bot. Bila ada token aktif milik anggota manusia yang dipakai orangnya sendiri, notifikasinya ikut
  tab agent; aturan bisa diubah di `notif_dari_agent` tanpa migrasi data.
  ```sql
  select m.username, m.role, k.nama, k.scope, k.revoked_at is null as aktif, k.last_used_at
    from api_tokens k join members m on m.id = k.member_id order by m.role, k.created_at;
  select a.sumber, m.role, count(*) from activity a left join members m on m.id = a.actor_id
   where a.sumber in ('ui', 'api') group by 1, 2 order by 1, 2;
  ```
- **Tes:** `uji/db/20_notif_pisah.sql` (47 cek), `web/src/features/notif/dari.test.ts`, e2e
  `web/tests/e2e/notif-pisah.spec.ts` (HP + desktop; penerima uji Dodi supaya tidak mengganggu tes owner/Citra).

## Revisi #2 gabungan (13 Okt 2026, `rev2-notif` + `rev-performa`, sudah di branch `claude/trusting-bell-zz7ocs`)

- **Isi:** notifikasi dipisah "Dari tim" / "Dari agent" (bagian di atas) + **muat halaman lebih cepat** (permintaan
  Hannes: "loading page di seluruh halaman agak slow"). `rev-performa` berbasis `claude/trusting-bell-zz7ocs`
  (`2fabbcf`), jadi tab Order + hak Pipeline ketat ikut masuk. Penyebab utama lambat: tiap layar baru menampilkan data
  sesudah JS selesai dimuat lalu menunggu beberapa putaran klien ke Supabase (Sydney; pengguna di Indonesia).
- **Perubahan performa (web):** Tugas Saya (`/saya`) dan detail tugas (`/t`) dibaca di server saat muat dokumen penuh
  (data ikut di HTML); layout `(app)` membaca profil, hari libur, dan akses Pipeline bersamaan; preconnect ke Supabase;
  umpan balik instan saat tautan diketuk (`useLinkStatus`); tab/filter yang hanya mengubah `?query` tanpa round-trip
  server (`lib/url-dangkal.ts`, kini juga dipakai tab notifikasi); cache router 30 dtk (`staleTimes.dynamic`) +
  `gcTime` TanStack 30 mnt; refetch ganda sesudah mutasi dihapus; impor subpath `radix-ui` (barrel dilarang eslint);
  form buat tugas, papan dnd-kit, dan markdown dimuat saat perlu + pramuat saat idle; gagal muat potongan JS → pesan
  lokal + "Coba lagi" (`lib/muat-komponen.tsx`), bukan layar galat; daftar Pipeline dirender bertahap 50 baris. Hasil
  review: cache TanStack dibuang di layar masuk dan bila akun berganti (data akun lama tidak tampil sesudah sesi habis).
- **Migrasi yang WAJIB diterapkan ke produksi SEBELUM merge ke `main`** (Hostinger langsung men-deploy `main`), urut,
  lewati yang sudah terpasang: `20261013120000_pipeline_kategori`, `20261013121000_pipeline_hak_ketat`,
  `20261013150000_pipeline_order`, `20261013160000_notif_pisah_agent` (tanpa ini `/notif` galat PGRST202),
  `20261013170000_pipeline_daftar_cepat` (kontrak tidak berubah, urutan bebas, tapi ikutkan). Semuanya aditif; web lama
  tetap jalan di atas DB baru. Cek sesudah terap: kueri `web_notif` / `web_notif_baca` di bagian notifikasi di atas.
- **Hasil ukur** (lab lokal, BUKAN produksi: proxy latensi 60 ms per arah ke Supabase + 20 ms ke web, RTT 120/40 ms;
  HP = CPU 4× lebih lambat, unduh 10 Mbps; median 3×; sebelum = `2fabbcf` (basis cabang), sesudah = `rev-performa`
  P1–P14 sebelum perbaikan review, yang tidak mengubah JS awal rute). Konten nyata tampil, muat penuh cache dingin:

  | halaman | HP sebelum → sesudah | desktop sebelum → sesudah |
  |---|---|---|
  | `/saya` | 2.374 → 468 ms | 1.141 → 298 ms |
  | `/t/<id>` | 2.958 → 1.111 ms | 1.194 → 400 ms |
  | `/l/<id>` | 2.968 → 2.190 ms | 1.245 → 960 ms |
  | `/jelajah` | 2.587 → 1.782 ms | 1.043 → 838 ms |
  | `/pipeline` | 2.747 → 2.354 ms | 1.399 → 944 ms |
  | `/notif` | 2.263 → 1.848 ms | 1.059 → 849 ms |

  TTFB ±335 → ±210 ms. Navigasi klien di HP: umpan balik sesudah ketuk ±160–460 → 5–14 ms (menu langsung aktif); cari
  `q=uji` 765 → 345 ms. JS per rute (brotli) turun 37–109 KB (`/t` 399 → 290 KB). DB daftar Pipeline (2.053 lead)
  324–378 → 103–138 ms. Belum diukur di produksi: bandingkan rasa muat di HP sesudah deploy.
- **Tes gabungan** (gabung tanpa konflik teks; satu penyesuaian: tab notifikasi memakai `gantiUrl`). Verifikasi akhir
  sesudah tinjauan (seperti CI): `supabase db reset` (semua migrasi dari nol + seed sintetis) → `uji/db` **23/23 berkas
  hijau, 1.237 cek** (termasuk 11_x); typecheck, lint, vitest (14 berkas, 89 tes), build produksi hijau; e2e terhadap
  `next start` + Supabase lokal, HP + desktop: **90 lulus, 10 dilewati sengaja** (khusus HP/desktop); `realtime.spec.ts`
  lulus 6/6 sesudah stack lokal dijalankan ulang DENGAN Realtime (`supabase start` tanpa `-x realtime`).
- **Tinjauan akhir (3 peninjau: keamanan, regresi, deploy) → diperbaiki:** (1) cadangan teks-polos markdown
  (`lib/teks.ts`, kini jalan di server saat muat penuh `/t`) kuadratik — deskripsi ratusan KB bisa membekukan proses Node
  Hostinger untuk semua pengguna → pola dibuat linear + baris > 2.000 karakter tidak diolah inline (tes waktu di
  `teks.test.ts`); (2) login sesudah sesi hilang bisa sekilas menampilkan halaman akun lama dari cache router Next
  (`staleTimes` 30 dtk) → `router.refresh()` saat layar masuk tampil; (3) dua tes `performa.spec.ts` bergantung pada lead
  sisa di DB lokal (gagal di CI) → kini membuat lead ujinya sendiri; (4) kata cari Pipeline lama bisa "hidup lagi" sesudah
  menu Pipeline diketuk → hanya ketikan pengguna yang ditulis ke URL (+ tes e2e); (5) header Pipeline owner melebar di HP
  390 px → tombol membungkus; (6) migrasi `20261014090000_pipeline_daftar_cepat` bertanggal besok → diganti nama
  `20261013170000_pipeline_daftar_cepat` (belum pernah diterapkan ke produksi). Tidak dikerjakan (catatan): batas panjang
  deskripsi tugas di fungsi tulis DB (pertahanan berlapis untuk temuan 1).

## Sidebar desktop bisa disembunyikan (14 Okt 2026, sesudah deploy `main` b522a1a)

- **Isi:** permintaan Hannes "sidebar bisa di-hide di tampilan desktop". Tombol di kepala sidebar (sembunyikan), tombol
  di header halaman saat tersembunyi (tampilkan), atau `Ctrl/⌘ + \`. Konten melebar/terpusat ulang. Pilihan disimpan di
  cookie `anvil_sidebar` (1 tahun, per perangkat/peramban) dan dibaca layout `(app)` di server → HTML pertama sudah benar,
  tanpa kedip. Tersembunyi = lebar 0 + `inert` + isi `invisible` sesudah animasi. HP tidak berubah (navigasi bawah).
  Halaman galat `(app)` kini ikut punya header (tombol tampilkan + lonceng tetap ada). Tanpa migrasi DB.
- **Berkas:** `web/src/components/layout/sidebar.tsx` (konteks + pintasan + cookie), `sidebar-kuki.ts` (konstanta untuk
  server), `kerangka-app.tsx`, `kepala-halaman.tsx`, `app/(app)/layout.tsx`, `app/(app)/error.tsx`.
- **Tinjauan PR (3 peninjau + verifikasi skeptis) → diperbaiki:** (1) Kembali / Batal (< 30 dtk) dari Ganti password
  memasang ulang penyedia dengan payload layout lama dari cache router → sidebar berbalik dan cookie tertimpa → kini
  cookie = sumber kebenaran di klien (`useSyncExternalStore`, `awal` hanya untuk hidrasi) dan cookie hanya ditulis saat
  pengguna mengalihkan; (2) pintasan menjatuhkan fokus ke `<body>` bila fokus di sidebar / tombol tampilkan → dipindah ke
  tombol pasangan; (3) pintasan di bawah lg diam-diam mengubah pilihan → diabaikan; (4) cincin fokus tombol baru
  disamakan dengan tombol header lain (outline bawaan).
- **Tes:** `web/tests/e2e/sidebar.spec.ts` (desktop: sembunyikan/tampilkan, fokus pindah, cookie, HTML server, muat
  ulang, pintasan + fokus + layar < lg, Kembali/Batal dari Ganti password; HP: tidak ada tombol). Dua tes baru terbukti
  GAGAL terhadap kode sebelum perbaikan. Typecheck, lint, vitest 89, build produksi hijau; e2e penuh terhadap
  `next start` + Supabase lokal: **100 lulus, 14 dilewati sengaja**.

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
