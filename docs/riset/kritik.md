
# rhj-tugas Fase 1: kritik 3 proposal dan rekomendasi final (29 Sep 2026)

## Verdict
- **DB: menumpang di project ERP produksi `rhj-tracker`,** di schema `tugas` dan `tugas_api` yang terisolasi. Biayanya Rp0. Opsi pause ERP dev tidak bisa dipakai karena dev dimigrasi hari ini: `list_migrations` dev berisi 46 migrasi, yang terakhir `20260929020015` (09:00 WIB). Kalau Hannes menolak ERP prod ikut terkena, alternatifnya org Pro terpisah, $25 ≈ Rp449.619/bulan.
- **API tanpa Edge Function:** fungsi RPC PostgREST `cu_*` mengembalikan JSON mentah berbentuk ClickUp v2. `tugas.mjs` adalah `clickup.mjs` yang sama, hanya lapisan `api()` yang diganti. `brief()`, `getComments()`, `agenda` dan `--dry-run` tidak diubah sama sekali, jadi format output CLI identik dengan sendirinya. Yang perlu diuji tinggal JSON mentah dari server.
- **Identitas API memakai akun bot Supabase Auth** (email + password = token, lalu JWT). Dengan JWT, RLS, Storage signed URL dan RPC bisa jalan tanpa service key dan tanpa Edge Function.
- **ID ClickUp lama jadi primary key** untuk tugas, komentar, list, folder, space dan user. Cutover routine lewat `clickup.mjs` dua-mode (flag env), sehingga 6 prompt UI tidak perlu diedit.
- **Masa paralel pakai mode cermin:** data impor hanya bisa dibaca di aplikasi, ClickUp tetap sumber utama. Sesudah itu 1× sinkron akhir penuh. Lulus kalau selisih hitungan per list 0 dan himpunan ID sama persis.

---

## A. Cek fakta klaim di proposal

| Klaim | Proposal | Status | Bukti |
|---|---|---|---|
| ERP dev aktif, tidak boleh di-pause | biaya-risiko (44 migrasi) | **Benar, angkanya sudah basi.** Sekarang 46, terakhir 20260929020015 | `list_migrations` dev, dicek 29/9 |
| Pilih (a) pause dev kalau dev boleh berhenti | keamanan | **Tidak layak**, dev sedang dipakai hari ini | sama |
| Batas 2 project Free dihitung per user lintas org | platform, semua proposal | Diterima (docs billing Supabase dikutip pembaca) | laporan platform |
| Login password tanpa ubah config Auth ERP | biaya-risiko | **Benar.** Auth prod: `email:true`, `google:true`, `disable_signup:false`, `mailer_autoconfirm:false` | `GET /auth/v1/settings` prod (key publishable) |
| Email bot `hanneslowan+...@gmail.com` aman dari trigger ERP | biaya-risiko | **Benar.** Trigger `buat_profil_baru` membandingkan `lower(email) = 'hanneslowan@gmail.com'` persis, jadi bot mendapat `pending`, bukan owner | `pg_get_functiondef` (katalog prod) |
| Header dan `.htaccess` Hostinger "belum terverifikasi" | biaya-risiko, kompatibilitas | **Terverifikasi untuk header.** admin.palletmeshindonesia.com mengirim CSP `frame-ancestors 'none'`, XFO, HSTS, `nosniff`, `referrer-policy`. Rewrite `/t/*` belum diuji | `curl -I` 29/9 |
| Repo rhj-tugas private "belum dicek" | biaya-risiko | **Private: ya** | GitHub API |
| Kuota GitHub Actions "belum diverifikasi" | biaya-risiko, kompatibilitas | Free: **2.000 menit/bulan** untuk repo private (docs.github.com). Artifact **500 MB**, dipakai bersama Packages (sumber sekunder, halaman docs tidak dibuka penuh). **Retensi backup wajib dibatasi** | WebSearch |
| `SUPABASE_SERVICE_ROLE_KEY` di GitHub Secrets | kompatibilitas | **Bertentangan dengan opsi (b)-nya sendiri.** Kalau menumpang di prod, itu kunci penuh ERP produksi | — |
| Deploy Edge lewat `SUPABASE_ACCESS_TOKEN` | kompatibilitas, keamanan | Risikonya diremehkan. PAT memberi akses Management API ke semua project di org Hannes, termasuk ERP prod | — |
| Bot boleh hapus kartu sendiri ≤60 menit | kompatibilitas | **Melanggar kebutuhan** "hapus hanya owner" | kebutuhan Hannes |
| Prefix `rhjt_` supaya ketahuan GitHub secret scanning | keamanan | **Belum terverifikasi.** Custom pattern di repo private kemungkinan butuh fitur berbayar (dugaan). Jangan diandalkan | — |
| Token hash di header cukup untuk API | keamanan | **Tidak cukup untuk lampiran.** Storage signed URL butuh JWT, jadi tetap perlu Edge `unduh` (deploy oleh Hannes) | desain Supabase Storage |
| Admin UI bisa "tambah anggota / reset password" | semua | **Tak berdasar tanpa service key.** Membuat user Auth dan reset password butuh admin API; browser tidak boleh memegang service key | — |
| Vercel Hobby tidak boleh komersial; Netlify Free boleh; Cloudflare komersial = dugaan kuat | platform | Diterima (kutipan docs) | laporan platform |
| ClickUp tidak punya endpoint riwayat; `time_in_status` hanya total menit | platform, semua | Diterima. Tanpa endpoint = dugaan kuat (feedback board + laporan 404), bukan pernyataan resmi | laporan platform |
| Komentar ClickUp 25 terbaru, paginasi `start`+`start_id` | semua | Diterima. `getComments` di `/home/user/rhj-brain/tools/clickup.mjs` memang tanpa paginasi | dibaca 29/9 |
| Storage ≈85 MB dari 1 GB | keamanan, kompatibilitas | Aritmetika benar: 68,58 MB (ERP prod) + 16,1 MB (lampiran tugas 23/9) = 84,7 MB. Lampiran komentar dan storage dev belum dihitung | platform, audit 23/9 |
| Dugaan batas login Auth per IP | biaya-risiko | Docs: batas login per IP per 5 menit bisa diatur. **Angka default belum terverifikasi** | supabase.com/docs/guides/auth/rate-limits |
| User `pending` tidak bisa akses data ERP | semua | Diterima dari katalog policy. **Belum diuji dengan JWT nyata**, masuk tes F2 | laporan platform |

---

## B. Yang hilang

**Terhadap 9 kebutuhan Hannes dan batasannya**
1. **Membuat akun dan reset password tidak bisa dari UI** tanpa service key. Fase 1: Hannes membuat user di dashboard Supabase. UI hanya mengelola baris `anggota` (peran, aktif), lalu `auth_user_id` ditautkan otomatis lewat email terverifikasi saat login pertama. Menonaktifkan anggota cukup `aktif=false`, RLS langsung menolak.
2. **Push notifikasi di HP hilang.** Aplikasi ClickUp di HP punya push; Fase 1 hanya notifikasi in-app (polling). Mitigasinya email pagi Agen Data plus PWA bisa dipasang di layar utama. Web push masuk Fase 2. Ini risiko adopsi dan belum ada di proposal mana pun.
3. **"1× sinkron akhir" vs sinkron berulang.** Proposal menambah sinkron harian selama paralel. Boleh, asal sifatnya uji dan cermin. Sinkron akhir tetap 1×, penuh, sesudah freeze.
4. **Peter selesai kontrak 15 Okt**, kemungkinan di tengah masa paralel. Perlu prosedur offboarding (aktif=false) dan serah terima kartu, kalau tidak akunnya tetap hidup.
5. **Rengga belum menerima undangan ClickUp** (per 28/9). Dia bisa tidak muncul di `/team`, jadi importer harus bisa membuatnya dari ID `246027506` + email.
6. **Profil ERP bertambah.** 8 anggota + 3 bot otomatis masuk `profiles` ERP sebagai `pending`. Tanpa penanda, owner ERP bisa keliru meng-approve.
7. **Chat grup sales** `z8r3fda6dd-1398` di luar Fase 1. Langganan ClickUp tidak bisa diputus sebelum ada pengganti.
8. **Urutan kartu di Board** (`orderindex`) dan drag di dalam satu kolom hanya ada di satu proposal.

**Terhadap pemakaian routine nyata**

9. **Keenam prompt UI menyebut "token env CLICKUP_API_TOKEN"**, dan prompt agen-data L300 berbunyi "Token kosong → 'token ClickUp REST tak ada'". Karena itu `CLICKUP_API_TOKEN` jangan dicabut dari env "Marketing" sebelum prompt diedit. Agent bisa mengecek env itu sendiri, dan token itu juga tuas rollback.
10. **Teks yang dibaca tim dan sales masih mengarah ke ClickUp:**
    - agen-data L41 dan skill `rhj-agen-data-harian` L60 ("tandai kartu di ClickUp")
    - arahan-pipeline L90–95 ("KARTU CLICKUP SIAP DITUTUP… klik complete")

    Kalimat ini sampai ke tim dan sales. Wajib diganti di hari cutover, tidak bisa ditunda.
11. **Output yang sengaja berbeda harus dicatat di tes kontrak:** domain `url`, kartu dengan >25 komentar, `whoami.members` (8 → 9, bot tidak dihitung), dan `comment.hist_id` (ClickUp-spesifik; diisi = id).
12. **`attachments[].url` harus bisa di-curl tanpa auth.** Routine mengunduh CSV UTF-16 dari URL ini.
13. **Konektor MCP ClickUp** harus dilepas Hannes saat cutover. Kalau tidak, agent interaktif (verifikator-task, MM) bisa membaca data basi.
14. **Env "Marketing" menjangkau `*.supabase.co` atau tidak: belum terverifikasi.** Wajib dicek sebelum paralel.
15. **Komentar agent lama tercatat sebagai "hannes lowan"** dengan prefix `[Claude]`. Setelah impor tetap begitu. Verifikator harus menganggap komentar `[Claude]` sebelum cutover sebagai komentar agent.

---

## C. Rekomendasi final

### C1. Stack, biaya, tindakan Hannes

| Lapisan | Pilihan | Biaya |
|---|---|---|
| DB, Auth, Storage | Project ERP prod `hyjiuefqnsrofpebaydt`: schema `tugas` (tabel, tidak di-expose) + `tugas_api` (fungsi, di-expose) + bucket private `tugas-lampiran` (25 MB/file) | Rp0 |
| API | RPC PostgREST `tugas_api.cu_*` / `x_*` / `web_*`, JWT bot | Rp0 |
| Web | `index.html` + ES modules vanilla (pola ERP), vendor lokal: supabase-js, markdown-it (`html:false`), DOMPurify, SortableJS. CSP `script-src 'self'`, tanpa CDN saat runtime | Rp0 |
| Hosting | Subdomain Hostinger (paket ERP), hPanel Git menarik branch `web` (statis saja) | Rp0 tambahan (dugaan; kuota subdomain belum terverifikasi) |
| Sinkron dan backup | GitHub Actions di rhj-tugas | Rp0. Pemakaian ≤±10 menit/hari, jauh di bawah 2.000 menit |
| **Total** | | **Rp0/bulan**. Alternatif Pro terpisah: Rp449.619/bulan |

Cadangan hosting: Netlify Free (komersial boleh, sekitar 20 production deploy/bulan).

**Tindakan Hannes**
1. Jawab K1–K5 (C9).
2. Tambah `CLICKUP_API_TOKEN` ke env sesi build. Klien importer hanya mengizinkan GET.
3. ACC SQL bootstrap prod (dijalankan agent lewat MCP). Lalu Dashboard → Data API → Exposed schemas: tambah `tugas_api`.
4. Authentication → Add user (auto-confirm): 3 bot, yaitu `hanneslowan+tugas-baca@`, `+tugas-tulis@`, `+tugas-impor@`, dengan password acak 40+ karakter. Tambah akun password untuk anggota yang tidak bisa login Google. Untuk Google: Redirect URLs tambah `https://<subdomain>/**`.
5. hPanel:
   - buat subdomain dan aktifkan SSL;
   - Git: branch `web`, deploy key read-only;
   - aktifkan auto-deploy dan pasang webhook di GitHub.
6. GitHub Secrets rhj-tugas: `CLICKUP_API_TOKEN` (dicabut sesudah jendela rollback), password bot impor dan bot baca, kunci **publik** `age`.
7. Saat cutover:
   - env "Marketing": tambah `TUGAS_EMAIL`, `TUGAS_API_TOKEN` (bot baca) dan `TUGAS_BACKEND=tugas`;
   - `CLICKUP_API_TOKEN` tetap dibiarkan;
   - lepas konektor MCP ClickUp.

### C2. Pagar karena menumpang di ERP prod (syarat K1)
1. **Role terpisah.** Role `tugas_pemilik` (NOLOGIN) memiliki `tugas` dan `tugas_api`, tanpa hak apa pun di `public`. Setiap migrasi dibungkus `begin; set local role tugas_pemilik; …; commit;`, jadi DDL yang salah sasaran ke tabel ERP gagal. Pengecualian: bootstrap bucket dan policy `storage.objects` (additive, `bucket_id='tugas-lampiran'`) dijalankan sebagai postgres dengan ACC terpisah.
2. **Hak akses minimal.** `anon` tidak mendapat grant apa pun. Yang di-expose hanya `tugas_api`. Tidak ada FK ke tabel ERP.
3. **Tes isolasi di F2:**
   - JWT bot/anggota ke setiap tabel dan RPC `public` ERP harus kosong atau ditolak;
   - JWT user ERP tanpa baris `anggota` ke `tugas_api` harus kosong;
   - `get_advisors` bersih.
4. **Profil ERP.** Profil ERP untuk 8 anggota + 3 bot diset `nonaktif` (peran itu ada: `PERAN_UBAH` di ERP `index.html` L3232). Ini perubahan data ERP, jadi perlu ACC.
5. **Tidak ada kredensial DB di luar.** Tidak ada service key atau URL DB di GitHub maupun env. Semua akses lewat API memakai bot.
6. **Catatan untuk sesi ERP:** jangan sentuh `tugas*`. Ditulis di README rhj-tugas, dan di `RHJ-Website/infodb.md` kalau Hannes ACC.
7. **Cara mundur:** `drop schema tugas_api, tugas cascade`, hapus bucket, nonaktifkan user. Sebelumnya ekspor JSON untuk pindah ke project sendiri.

### C3. Skema final (schema `tugas`, semua tabel RLS ON)

| Tabel | Kolom kunci |
|---|---|
| `anggota` | `id bigint` PK (= ID user ClickUp; user baru dari sequence 900000000000). Alasannya: `clickup.mjs` melakukan `Number()` pada assignee, dan skill me-hardcode ID user · `auth_user_id uuid` uniq null · `email` citext uniq · `clickup_email` · `username` uniq (verbatim, mis. "hannes lowan", dikunci) · `nama_tampil`, `inisial`, `warna` · `peran` owner/member/bot · `izin_bot text[]` (baca/tulis/impor/ekspor) · `aktif` |
| `ruang`, `ruang_anggota` | `id text` (ID lama / `rs…`), `nama`, `privat`, `diarsip`, `urutan` |
| `folder` | `id text`, `ruang_id`, `nama`, `tersembunyi` (…63830), `diarsip`, `urutan` |
| `daftar` | `id text`, `ruang_id`, `folder_id` null (list tanpa folder), `nama` (verbatim + em-dash), `diarsip`, `urutan`, `tidak_ditagih`, `tagih_mulai` |
| `status_daftar` | PK `(daftar_id, nama)`, `tipe` open/custom/done/closed, `urutan`, `warna`. CHECK: minimal 1 bertipe closed; "complete" = closed |
| `tugas` | lihat rincian di bawah tabel |
| `tugas_assignee` | PK `(tugas_id, anggota_id)`, `ditambah_pada/oleh` |
| `komentar` | `id text`, `tugas_id`, `induk_id` (balasan 1 tingkat), `penulis_id`, `teks` (polos = `comment_text`), `isi_json` (parts ClickUp), `dibuat_pada`, `diubah_pada`, `dihapus_pada`, `sumber` · `komentar_mention(komentar_id, anggota_id)` |
| `lampiran` | `id text`, `tugas_id`, `komentar_id` null, `nama_file`, `ekstensi`, `mime` (allowlist gambar raster/PDF/docx/xlsx/csv; SVG/HTML ditolak), `ukuran`, `sha256`, `path_storage`, `clickup_url`, `status_salin` ok/gagal/tautan_saja, `pengunggah_id`, `dihapus_pada` |
| `aktivitas` (append-only) | `id identity`, `tugas_id`, `waktu`, `waktu_awal` (jendela sinkron), `aktor_id` null, `aktor_assignee`, `sumber` ui/api/impor/sinkron/sistem, `jenis`, `dari`/`ke` jsonb, `snapshot`, `lengkap`, `catatan` |
| `notifikasi` | `penerima_id`, `jenis` assign/mention/komentar, `tugas_id`, `komentar_id`, `aktor_id`, `dibuat_pada`, `dibaca_pada` |
| `idem`, `hari_libur` (kosong secara default), `pengaturan` (`mode` cermin/utama, `app_url`), `sinkron_run` (hitungan/selisih/galat), `sinkron_mentah` (payload ClickUp terakhir, owner saja) | — |

Kolom `tugas`:
- Identitas: `id text` PK (ID lama / `rt`+8 base36), `daftar_id`, `parent_id`, `nama`.
- Deskripsi: `deskripsi_md`, `deskripsi_polos`, `deskripsi_tak_terbaca`.
- Status dan prioritas: `status`, `status_tipe`, `prioritas` 1–4 null.
- Due: `due_at` (ms verbatim), `due_ada_jam`, `due_wib date` (trigger: +7 jam, rumus `wibDate`).
- Tanggal dan bobot: `mulai_at`, `mulai_ada_jam`, `bobot` 1–3 null.
- Tampilan board: `urutan`.
- Jejak waktu: `pembuat_id`, `dibuat_pada`, `diubah_pada`, `aktivitas_pada`, `ditutup_pada`, `selesai_pada`, `pertama_ditutup_pada`, `jumlah_buka_ulang`.
- Arsip, hapus, konflik: `diarsip`, `dihapus_pada/oleh`, `versi`.
- Sinkron: `sumber`, `clickup_url`, `clickup_meta` (checklist/tag/time_in_status), `disinkron_pada`, `clickup_hash`, `cari` tsvector (`simple`).

**Fungsi:**
- `hari_ini_wib()`
- `wib_date(ms)`
- `hk(a,b)`: Senin–Jumat, a<d≤b, dikurangi `hari_libur`; cocok dengan data 28/9 di laporan pagar
- `aktor()`
- `boleh_lihat(daftar)`
- `beban(anggota, tgl)`

**Trigger:**
- Satu baris aktivitas per field yang berubah: status, buka_ulang, due, mulai, assignee ±, nama/deskripsi (teks lama ikut disimpan), pindah list, prioritas, bobot, arsip, hapus/pulih, komentar baru/edit/hapus, lampiran ±.
- **Snapshot saat status berpindah ke closed/done:** jumlah komentar, balasan dan lampiran, ada/tidaknya URL, komentar terakhir (penulis, waktu, 200 karakter).
- `aktivitas` di-REVOKE dan diberi trigger RAISE untuk UPDATE/DELETE.
- Mode cermin: menolak perubahan baris `sumber='clickup'` kecuali dari impor.
- Notifikasi dibuat hanya untuk `sumber` ui/api, tidak ke aktor sendiri. Penerima komentar: assignee, pembuat, pengomentar sebelumnya.

**Akses:**
- Baca: fungsi SECURITY INVOKER + RLS.
- Tulis: hanya fungsi SECURITY DEFINER milik `tugas_pemilik` dengan `search_path=''`.
- Hapus dan pulihkan: owner saja (soft delete). Bot tidak punya hak hapus.

**Indeks:** seperti proposal biaya-risiko, ditambah trigram `nama` untuk kode pendek (Y7, P15).

### C4. Layar (mobile-first, Bahasa Indonesia)

1. **Masuk:** Google, atau email + password. `/t/<id>` tanpa sesi dibawa ke Masuk lalu kembali ke tugas itu.
2. **Tugas Saya:** grup Telat (hari kalender, terlama di atas) / Hari ini / ≤3 hari kerja ("sisa N hk") / Nanti / Tanpa due.
3. **Jelajah:** Space > Folder > List. Folder tersembunyi masuk "Lainnya", list arsip dilipat.
4. **List:**
   - Grup per status.
   - Baris kartu: kode + nama, semua avatar assignee, chip due, prioritas, jumlah komentar, **tanggal komentar terakhir**.
   - Badge "tidak ditagih" dan "menunggu keputusan" (BERSYARAT/CADANGAN/DITUNDA).
   - Filter "telat" tidak menyaring kartu 5+ hari.
5. **Board:**
   - Drag dengan long-press, cadangan tap "Ubah status".
   - Konflik `versi` memunculkan toast lalu memuat ulang.
   - Drop ke complete memunculkan pengingat "cek komentar terakhir" (M5).
6. **Detail tugas:**
   - Field: status, assignee (multi), due, mulai, prioritas, bobot, pindah list, arsip.
   - Markdown lihat/edit/pratinjau. Lampiran. Komentar dengan balasan dan @mention.
   - Tab **Riwayat** (impor diberi label "sebagian, aktor tak diketahui").
   - Peringatan lunak: due di akhir pekan/libur, beban >7 due/hari (B5), complete tanpa bukti.
   - Owner: tombol Hapus.
7. **Cari:** nama, kode, deskripsi, ID lama, tempel URL `app.clickup.com/t/…`. Cakupan per space untuk cek duplikat (M6).
8. **Notifikasi:** polling 60 detik.
9. **Admin (owner):** anggota (peran, aktif), status per list, struktur, hari libur, mode cermin/utama, laporan sinkron.
10. **Sampah:** pulihkan.

### C5. Endpoint

Transport: `POST https://hyjiuefqnsrofpebaydt.supabase.co/rest/v1/rpc/<fn>`. Header: `apikey` (publishable), `Authorization: Bearer <JWT bot>`, `Content-Profile: tugas_api`.

| Perintah | Path ClickUp yang dipetakan adapter | RPC |
|---|---|---|
| whoami | `GET /user`, `GET /team` | `cu_user`, `cu_team` (workspace `1100340000004525`) |
| tasks / folder-tasks / agenda | `GET /folder/{id}/list?archived=` · `GET /list/{id}/task?page&subtasks&include_closed` | `cu_folder_lists`, `cu_list_tasks` → `{tasks, last_page}`, 100 per halaman |
| task, agenda --desc, move | `GET /task/{id}[?include_markdown_description]` | `cu_task` (key ClickUp lengkap + key aditif `bobot`, `clickup_id`) |
| comments, agenda | `GET /task/{id}/comment` · `GET /comment/{id}/reply` | `cu_task_comments` (**semua**, terbaru dulu) · `cu_comment_replies` |
| create / update | `POST /list/{id}/task` · `PUT /task/{id}` | `cu_create_task(list, body, idem)` · `cu_update_task(id, body)` |
| comment | `POST /task/{id}/comment` | `cu_create_comment(id, body, induk, idem)` → `{id, hist_id, date}` |
| move | `PUT v3 …/home_list/{list}` | `cu_move` (status dipetakan: nama sama → tipe sama → status pertama) |
| delete | `DELETE /task/{id}` | `cu_delete`: owner saja, bot mendapat 403 "hapus hanya owner, lewat UI" |
| fields | `GET /list/{id}/field` | `{fields:[]}` |
| baru | — | `x_activity(id, since)`, `x_cari(q, ruang, closed)`, `x_resolve(ref)`, `x_hitung(scope)`, `x_ekspor()`, `x_impor_batch(jenis, rows)` |

Web memakai `web_*` (saya, detail lengkap dalam 1 panggilan, notif, simpan struktur/status/anggota/libur).

**Lampiran:** `cu_task` mengembalikan `path_storage`. CLI (dan web) menukarnya menjadi signed URL lewat `POST /storage/v1/object/sign/tugas-lampiran`, berlaku 1 jam, sehingga `attachments[].url` tetap bisa di-curl oleh routine.

### C6. `tugas.mjs`
- **Salin `clickup.mjs`.** Hanya `api(method, url, body)` yang diganti menjadi tabel rute regex ke RPC. `brief`, `getComments`, `agenda`, parser argumen, `--dry-run`, `{deleted}` dan `toMs`/`wibDate` tidak diubah. Throttle 670 ms dimatikan di mode tugas. `audit-free` → pesan "tidak berlaku".
- **Dua mode dalam satu file.** Default ditentukan nama file: `tools/tugas.mjs` = backend tugas, `tools/clickup.mjs` = ClickUp. `TUGAS_BACKEND=tugas|clickup` menimpa default. Mode ClickUp dibiarkan persis seperti sekarang, tanpa perbaikan paginasi, supaya output routine tidak berubah selama paralel.
- **Env:**
  - `TUGAS_URL` dan `TUGAS_KEY` (publik, default hardcode);
  - `TUGAS_EMAIL`;
  - `TUGAS_API_TOKEN` (password bot, satu-satunya rahasia; juga dibaca dari `tools/.env`).
- **JWT:** login sekali per run, cache di `os.tmpdir()` (mode 0600), login ulang saat 401. Retry 3× untuk GET/5xx. POST tulis membawa `idem` uuid.
- **Pesan error:** `clickup:`/`tugas: GAGAL -> …`, exit 1. Token kosong memakai pesan sejajar dengan pesan lama. Token tidak pernah dicetak.
- **Assignee:** ID numerik lama tetap lewat `Number()`. Selain angka (username/email) di-resolve di server.
- **Perintah tambahan:** `activity`, `cari`, `resolve`, `lampiran <id> --out`, `comment --reply-to`.
- **`uji/banding.mjs`:** diff mode clickup vs tugas. Normalisasi hanya untuk `url`, `attachments[].url`, `sejak`, `whoami.members`, dan kartu >25 komentar (daftarnya dicatat).

### C7. Migrasi dan bukti hitungan
**F1, probe hanya-GET di awal.** Hasilnya mengunci kontrak API:
- urutan dan paginasi komentar, urutan balasan;
- apakah komentar menaikkan `date_updated`;
- `include_closed` vs status bertipe done;
- `date_closed` saat kartu dibuka ulang;
- Private Attachment Links (curl tanpa auth);
- `time_in_status`;
- checklist `z8r3fdet60`;
- lampiran di dalam komentar;
- email di `/team`;
- jumlah subtask.

**Crawl** (`impor/sinkron.mjs`, klien GET-only, ≤60 request/menit, jalan 05:45 WIB supaya tidak bentrok jendela routine 07:00–09:15):
1. Hierarki dengan `archived` false dan true (termasuk folder tersembunyi dan list tanpa folder).
2. Status per list.
3. Anggota (+`/list/{id}/member` untuk email).
4. Tugas: `include_closed`, `subtasks`, `archived` true/false.
5. Detail tugas.
6. Komentar dengan `start/start_id` sampai habis, lalu balasannya.
7. Lampiran tugas, komentar dan balasan.

Perkiraan: ≥±460 request + balasan (belum dihitung), jadi ≥±8 menit. Dasarnya 198 task per 23/9.

**Muat:** `x_impor_batch` sebagai bot impor, upsert per ID, idempoten. Selama paralel, perubahan tercatat otomatis sebagai aktivitas `sinkron` dengan jendela waktu. Yang hilang di ClickUp di-soft-delete.

**Riwayat:**
- Yang dibuat: event `dibuat` + pembuat, dan `ditutup` (aktor null, `lengkap=false`). `time_in_status` (kalau ada) disimpan di `clickup_meta`.
- Yang tidak dibuat: transisi lama. Tidak ada event yang dikarang.

**Bukti hitungan sama:**
1. Crawler menulis **sensus** dari payload yang sama dengan yang dimuat. Sensus tidak memanggil ClickUp lagi, karena tim masih bekerja di sana.
2. Per list: tugas total, open, closed (closed+done), arsip, subtask, komentar top-level, balasan, Σ`reply_count`, lampiran tugas, lampiran komentar, byte, relasi assignee.
3. SHA-256 dari daftar ID terurut untuk tugas, komentar dan lampiran.
4. Checksum per tugas atas (nama, status, `due_wib`, prioritas, assignee terurut, list, parent, arsip, hash markdown).
5. `x_hitung()` di DB harus menghasilkan struktur yang sama. **Syarat: selisih 0.**
6. Golden diff `cu_task` vs payload ClickUp untuk semua tugas. Yang boleh beda hanya `url`, `attachments[].url` dan key aditif.
7. `banding.mjs`:
   - `folder-tasks 1100340000026652` (±`--closed`)
   - `tasks 1100340000065694` dan `tasks 1100340000065696`
   - `agenda --hours 26`
   - `comments --replies` untuk semua kartu terbuka dan 15 ID di file instruksi aktif
8. Hannes mengecek 10 kartu acak.
9. Cek silang: `ringkas.telat` hasil CLI harus sama dengan filter "telat" SQL untuk folder yang sama.

**Go/no-go masuk cutover:**
- 3 sinkron berturut-turut dengan selisih 0;
- diff CLI bersih selama 5 hari kerja;
- 9 akun sudah berhasil login;
- env "Marketing" terbukti menjangkau Supabase.

**Cutover:**
1. H-1: umumkan freeze.
2. Sinkron akhir **penuh**. Delta tidak dipakai karena semantik `date_updated` belum terverifikasi.
3. Verifikasi 100%.
4. URL gambar tersemat ditulis ulang ke Storage.
5. `mode=utama`, bot impor dinonaktifkan.
6. Env dibalik.
7. Commit P0 rhj-brain (ACC).
8. Run pertama Agen Data dan Digest dicek manual.
9. H+1: sapuan baca-saja ke ClickUp untuk menangkap perubahan yang masih masuk.

**Rollback (≥2 minggu, ClickUp tidak diubah dan tidak diturunkan paketnya):**
- hapus `TUGAS_BACKEND` dari env;
- ekspor aktivitas dan komentar dengan sumber ≠ impor sejak cutover, untuk dimasukkan ulang secara manual.

**Backup:** Actions harian menjalankan `x_ekspor` (JSON), dienkripsi `age`, disimpan sebagai artifact dengan retensi 30 hari. Lampiran di-backup penuh **mingguan** dengan retensi 28 hari (4 × ≥16,1 MB ≈ ≥64 MB), karena batas artifact 500 MB. Ukuran JSON belum dihitung. Uji restore sekali ke PG16 lokal memakai loader yang sama.

### C8. Tahapan (perkiraan, 1 sesi = 2–4 jam kerja agent)

| Fase | Isi | Sesi |
|---|---|---|
| F0 | Keputusan K1–K5, token ClickUp di env build | Hannes |
| F1 | Probe ClickUp (GET) + fixture sintetis | 1 |
| F2 | Skema/trigger/RLS di PG16 lokal (stub `auth`, tes matriks peran), lalu bootstrap prod (ACC) + tes isolasi ERP | 1–2 |
| F3 | RPC `cu_*`/`x_*` + `tugas.mjs` + tes kontrak | 2 |
| F4 | Importer + sensus + impor pertama + bukti hitungan | 1–2 |
| F5 | UI | 3–5 |
| F6 | Deploy Hostinger, akun, backup + uji restore | 1 |
| F7 | Paralel 1–2 minggu, sinkron harian, perbaikan | 1–2 |
| F8 | Freeze, sinkron akhir, cutover, P0 rhj-brain | 1 |
| **Total** | | **11–16 sesi + masa paralel** (dugaan) |

### C9. Keputusan untuk Hannes (5)

| # | Keputusan | Rekomendasi |
|---|---|---|
| K1 | Lokasi DB | **Schema di ERP prod, Rp0**, dengan pagar C2 (termasuk ACC profil ERP → `nonaktif`). Alternatif org Pro terpisah Rp449.619/bulan kalau ERP tidak boleh tersentuh sama sekali. Pause dev: tidak mungkin, dev aktif hari ini |
| K2 | Domain/hosting | `tugas.palletmeshindonesia.com` di Hostinger yang sama dengan ERP, noindex. Cadangan Netlify Free |
| K3 | Identitas agent dan cutover routine | 3 akun bot: baca (routine), tulis (sesi interaktif), impor (sementara). **Bot tidak bisa hapus.** Komentar agent tidak lagi tercatat "hannes lowan" (disengaja). `clickup.mjs` dua-mode, jadi 6 prompt UI tidak diedit; `CLICKUP_API_TOKEN` tetap di env sampai prompt diperbarui |
| K4 | Paralel dan akhir ClickUp | Mode cermin + sinkron harian 05:45 WIB lewat Actions (butuh secret `CLICKUP_API_TOKEN`) + space "Uji Coba" untuk latihan tulis. 1× sinkron akhir sesudah freeze. Rollback ≥2 minggu. Langganan ClickUp dipertahankan sampai pengganti chat grup sales diputuskan. Peter (kontrak habis 15 Okt): nonaktif dan serah terima di masa paralel |
| K5 | Login | Google (provider ERP sudah aktif, cukup 1 Redirect URL) + password cadangan buatan Hannes. Tentukan email Michael (`michael@rodahammerindo.com` vs `eppy.michael@gmail.com`) dan konfirmasi email Rengga |

Default tanpa keputusan: `bobot` dan `mulai` disediakan (nullable), `hari_libur` kosong, soft delete, semua komentar dikembalikan (>25), "menunggu keputusan" tetap lewat konvensi nama.

### C10. Risiko utama

| Risiko | Mitigasi |
|---|---|
| Migrasi tugas merusak ERP prod (MCP jalan sebagai postgres) | `set local role tugas_pemilik`, ACC per migrasi, uji lokal dulu, tes isolasi |
| Output CLI berbeda sehingga 4 routine aktif salah baca | Kode format tidak diubah, golden diff, go/no-go 5 hari kerja, rollback lewat env |
| Due mundur sehari | `due_at` ms verbatim + `due_wib` dengan rumus `wibDate`, uji due 00:00 WIB |
| Riwayat lama tidak lengkap | Label "sebagian", event sinkron selama paralel, snapshot saat ditutup |
| Free tanpa backup | JSON harian + lampiran mingguan terenkripsi, uji restore |
| Kuota org dipakai bersama ERP (storage 1 GB, egress 5 GB) | ±84,7 MB terpakai (≈8%). Egress diukur saat paralel |
| Password bot bocor | Izin bot baca = baca saja, tanpa hapus. Rotasi = ganti password |
| XSS dari markdown/komentar | `html:false` + DOMPurify, CSP `'self'`, SVG/HTML ditolak |
| Tim tidak mendapat push | Email pagi tetap jalan, PWA, web push di Fase 2 |
| Env "Marketing" memblokir Supabase | Cek sebelum paralel. Hannes tambah allowlist bila perlu |

### C11. Ide yang ditolak

| Ide (proposal) | Alasan ditolak |
|---|---|
| Edge API (kompatibilitas) | Butuh PAT ke semua project atau tempel manual tiap deploy |
| Token-hash header (keamanan) | Lampiran butuh JWT; bisa ditambah di Fase 2 |
| Formatter brief/agenda di SQL (biaya-risiko) | Menduplikasi logika JS; bentuk mentah tetap dibutuhkan untuk `task` |
| Service key atau URL DB di GitHub (kompatibilitas, keamanan) | Sama dengan kunci penuh ERP prod |
| Rantai hash aktivitas | Ancamannya member, dan itu sudah ditutup revoke + trigger + backup |
| pg_dump | Butuh pg17 + password DB |
| Staging di ERP dev | Dev dimigrasi setiap hari |
| Sinkron 3×/hari | 1×/hari + manual cukup |
| Preact/htm | Vanilla sepola dengan ERP |

---

## D. Perubahan rhj-brain saat cutover (lewat sesi CMO, ACC Hannes, push ke main + state)

**P0: saat cutover.** Tanpa ini routine putus, atau tim dan sales diarahkan ke ClickUp.
1. `tools/clickup.mjs` diganti file dua-mode, ditambah `tools/tugas.mjs` baru. Boleh di-commit lebih awal selama paralel karena default ClickUp tidak berubah.
2. `tools/README.md`: env `TUGAS_*`, perintah baru, delete hanya owner lewat UI, hapus catatan kuota MCP.
3. `routines/cloud/agen-data.md` L41 + `routines/rhj-agen-data-harian/SKILL.md` L60: penutup email tim → "di aplikasi Tugas RHJ (<URL>)". L47: pesan error.
4. `routines/cloud/arahan-pipeline.md` L90–95: "KARTU CLICKUP SIAP DITUTUP … klik complete" → aplikasi Tugas. L78: kanal chat.
5. `.claude/agents/verifikator-task.md` L14–17: tool MCP → `clickup.mjs agenda/task/comments --replies` + `activity`.
6. `.claude/skills/rhj-manajer-marketing/SKILL.md` L13 (`clickup_filter_tasks` → `folder-tasks`) dan L52–53 (batas alat).
7. `CLAUDE.md` L25/L28 + `knowledge/rhj-pagar-inti.md` L21 (M-CU): "ClickUp = REST" → "Tugas lewat `tools/clickup.mjs` (backend aplikasi Tugas)".
8. Tindakan Hannes: env "Marketing" (C1 #7) dan lepas konektor MCP ClickUp.
9. Baru: `deliverables/PENGUMUMAN-APP-TUGAS-<tgl>.md` untuk tim dan sales (login, cara lapor di kartu).
10. Append: `memori/LOG-PAGAR.md` dan `memori/PELAJARAN-PIC.md`.

**P1: minggu pertama.** Shim menutup dulu.
- `routines/cloud/_UMUM.md` L18, L25 · `README.md` L22, L41 · `digest-mm.md` L11, L35, L42 · `analisa-ads.md` L18, L29 · `analisa-pipeline.md` L27 · `seo-geo.md` L28 (wording).
- `knowledge/rhj-clickup-workspace.md`: tulis ulang. Nama file tetap karena wikilink dari 29 file. Isi: hierarki, URL, 9 anggota + bot, "ID lama = ID".
- `deliverables/PROMPT-ROUTINE-UI-24Sep.md`: siapkan 6 prompt baru untuk ditempel Hannes (C. DATA, L286/L300, L157/L159). Sesudah itu baru `CLICKUP_API_TOKEN` boleh dicabut.
- `knowledge/rhj-mandat-pipeline-sales.md` L16, L25–31: sesudah ada keputusan chat.
- `.claude/settings.json` L30: tambah `Bash(node tools/tugas.mjs:*)` (opsional).
- `memori/AGENDA-STATUS.md` seksi "PAPAN TUGAS DI CLICKUP" (L432+), `memori/OTAK-MM.md` L33, L220: perbarui 1×.

**P2: sebelum ClickUp ditutup atau dokumen dipublikasikan.**
- `deliverables/REPORT-GOLIVE-ADS-PALLETMESH-26Okt.html/.pdf` + `CHECKLIST-GOLIVE-PALLETMESH-26Okt.md`: cukup ganti domain, rute `/t/<id>` yang menangani.
- `deliverables/JD-WEB-MARKETING-TECH-26Sep.html`.
- Teks "ClickUp" di knowledge lain, 5 agent dan 5 skill PIC.
- Header "ARSIP – ClickUp" di `routines/rhj-*` legacy.

**Tidak perlu diubah:** memori historis (append-only), deliverables lama, `probe/`. ID lama tetap bisa dicari.

---

## Verifikasi yang dijalankan di sesi ini (29/9, baca saja)
- `list_migrations` ERP dev: 46 migrasi, terakhir `20260929020015`.
- `GET /auth/v1/settings` prod dengan key publishable: email ON, Google ON, signup ON, autoconfirm OFF.
- Definisi `public.buat_profil_baru` di prod: perbandingan email owner persis.
- Header `admin.palletmeshindonesia.com`: header keamanan kustom aktif di Hostinger.
- GitHub: `hanneslowan-max/rhj-tugas` private.
- `/home/user/rhj-brain/tools/clickup.mjs`: path API yang dipakai (tabel C5) dan `getComments` tanpa paginasi.
- `/home/user/rhj-brain/deliverables/PROMPT-ROUTINE-UI-24Sep.md` L33, 78, 174, 220, 267, 300, 315: menyebut `CLICKUP_API_TOKEN`.
- `/home/user/RHJ-Website/index.html` L2471 (`provider=google`) dan L3232 (peran `nonaktif`).
- Kuota GitHub Free: [docs.github.com Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions), [cicdcalculator.com](https://cicdcalculator.com/github-actions-free-tier).
- Rate limit Auth: [supabase.com/docs/guides/auth/rate-limits](https://supabase.com/docs/guides/auth/rate-limits).

Tidak ada file yang diubah di rhj-brain, RHJ-Website, rhj-tugas, maupun ClickUp.