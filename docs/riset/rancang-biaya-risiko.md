# Proposal arsitektur rhj-tugas Fase 1: biaya nol, risiko operasional rendah

Tidak ada file yang saya ubah. Sumber fakta adalah 4 laporan pembaca dan beberapa cek hanya-baca yang saya jalankan sendiri pada 29/9 (ditandai **[cek 29/9]**).

**Cek sendiri 29/9 yang mengubah timbangan:**
- **ERP dev sedang aktif dikembangkan, jadi tidak bisa di-pause tanpa menghentikan pekerjaan ERP.** Isinya 44 migrasi, dan yang terakhir berversi `20260929012839`, yaitu 29/9 pukul 08:28 WIB. Public berisi 58 tabel (prod 13), auth berisi 14 user, DB 33.918.099 byte. File `db/84-*.sql` ditulis "Diterapkan ke DEV … Belum ke produksi".
- **ERP prod dipakai tiap hari.** Login terakhir 28/9 pukul 08:29 UTC, dengan 4 user. Prod tidak punya schema `supabase_migrations`, artinya migrasi diterapkan manual. Config teks `indonesian` sudah tersedia. `pg_trgm` dan `pg_cron` tersedia tapi belum dipasang.
- **Kemampuan Supabase MCP di sesi ini:** `execute_sql` jalan sebagai `postgres` dengan `transaction_read_only=off`, jadi DDL bisa dari sesi agent (tetap dengan ACC). Tool `apply_migration`, `deploy_edge_function`, `create_project`, dan `pause_project` **tidak ada** di daftar tool. Membuat atau mem-pause project harus Hannes lakukan di dashboard, dan Edge Function tidak bisa di-deploy dari sini.
- **Jaringan dari sesi ini:** `*.supabase.co` menjawab 401, `api.clickup.com` 400, `admin.palletmeshindonesia.com` 200, jadi ketiganya terjangkau. Environment cloud "Marketing" **belum terverifikasi**.

---

## 0. Verdict

- **Stack:** 1 Supabase (menumpang di project ERP **prod**, dalam 2 schema terisolasi), 1 file HTML statis di subdomain Hostinger, dan CLI Node tanpa dependensi. **Rp0/bulan.** Tidak ada server, Edge Function, atau build step.
- **API REST = PostgREST RPC.** Fungsi SQL mengembalikan JSON yang bentuknya sama dengan `clickup.mjs`. Web dan CLI memakai fungsi yang sama.
- **Saat cutover, `tools/clickup.mjs` dijadikan shim ke `tugas.mjs`.** Hasilnya 0 edit pada 6 prompt UI, dan izin `settings.json` tetap berlaku.
- **ID ClickUp lama tetap menjadi ID** untuk tugas, list, folder, dan space. User lama bisa dipanggil lewat `clickup_id`. Routine dan memori tidak putus.

---

## 1. Stack, hosting, biaya, tindakan Hannes

### 1a. Batas 2 project Supabase gratis: timbangan opsi

| Opsi | Biaya/bln | Risiko ke ERP prod | Risiko ke ERP dev | Risiko ke data tugas | Tindakan Hannes |
|---|---|---|---|---|---|
| **P. Schema `tugas` di ERP prod (rekomendasi)** | Rp0 | rendah–sedang: dibatasi role, lihat 1b | nol | rendah (prod stabil, tak ter-pause) | expose schema, buat akun, ACC bootstrap |
| D. Schema `tugas` di ERP dev | Rp0 | nol | rendah | **tinggi**: dev dimigrasi setiap hari [cek 29/9] | sama dengan P |
| A. Pause dev, lalu buat project baru | Rp0 | naik secara tidak langsung, karena uji ERP pindah ke prod | **tinggi**: dev mati, padahal masih aktif. Restore butuh slot kosong (dugaan) | rendah | pause, buat project, salin kunci |
| Pro, org baru (1 project) | $25 ≈ **Rp449.619** (≈Rp5.395.431/thn) | nol | nol | terendah: backup 7 hari, tanpa pause | kartu, org, project |
| Upgrade org sekarang (3 project) | $45 ≈ **Rp809.314** | nol, dan ERP ikut dapat backup | nol | terendah | kartu |
| Cloudflare D1 + Workers | Rp0 (dugaan) | nol | nol | sedang: auth dan storage harus dibangun sendiri, CPU 10 ms/request, batas D1 belum diverifikasi | akun baru + token |
| Project atas nama orang lain | Rp0 | – | – | data dimiliki orang lain, AUP abu-abu | **tidak disarankan** |

Kurs Rp17.984,77/USD (open.er-api.com, 29/9, laporan platform). Angka tahunan saya hitung: 449.619,25 × 12.

**Alasan memilih P.** Dari tiga opsi Rp0, hanya P yang tidak mengorbankan sesuatu yang sedang dipakai. A mematikan dev yang masih aktif. D menaruh data produksi tugas di sandbox yang dimigrasi setiap hari. Kerugian P adalah blast radius ke ERP, dan itu bisa dipagari (1b).

**Jalan keluar:** schema terisolasi bisa dipindah utuh ke project sendiri (ekspor JSON lalu impor) kalau Hannes kelak memilih Pro.

### 1b. Pagar wajib kalau P dipilih

1. **Role `tugas_pemilik` (NOLOGIN)** memiliki schema `tugas` (tabel) dan `tugas_api` (fungsi). Role ini tidak punya hak apa pun di `public`, `auth`, atau `storage`. Setiap migrasi dibuka dengan:
   ```sql
   begin; set local role tugas_pemilik;  -- DDL yang salah sasaran ke tabel ERP gagal "permission denied"
   ... ; commit;
   ```
   Fungsi SECURITY DEFINER dimiliki `tugas_pemilik`, sehingga ikut terkurung.
2. **Hanya `tugas_api` yang di-expose ke Data API.** Ini satu setelan dashboard, bersifat aditif, dan ERP `public` tidak tersentuh. Tabel `tugas` tidak bisa diakses lewat REST.
3. **Auth dipakai bersama.** Trigger ERP `buat_profil_baru` membuat profil `pending` untuk setiap akun baru, dan ERP punya UI ubah peran (`PERAN_UBAH` memuat pending dan nonaktif). Supaya tidak ada yang keliru di-approve, profil ERP untuk anggota khusus-tugas diset `nonaktif` (8–9 baris, butuh ACC). Sebaliknya, 4 user ERP memang bisa login ke tugas, tapi tidak melihat data apa pun tanpa baris `tugas.anggota`.
4. **Login pakai email + password**, tanpa magic link. SMTP bawaan Supabase hanya 2 email/jam dan hanya ke anggota org Supabase, sedangkan login password tidak memerlukan Site URL atau redirect. Artinya config Auth ERP tidak diubah.
5. **Menghapus tugas dari prod** cukup dengan `drop schema tugas_api, tugas cascade`, hapus bucket, lalu nonaktifkan akun. Bisa dibalik dalam hitungan menit.
6. **Catatan untuk sesi ERP:** migrasi atau hardening ERP jangan menyentuh `tugas*`. Catatan ini ditulis di README rhj-tugas, dan di `RHJ-Website/infodb.md` kalau Hannes ACC.

### 1c. Frontend

| Opsi | Biaya | Status legal/limit | Tindakan Hannes |
|---|---|---|---|
| **Subdomain Hostinger (rekomendasi)** | Rp0 tambahan (dugaan) | ERP sudah jalan di sana (`platform: hostinger`). Kuota subdomain, SSL, dan `.htaccess` di paket ini **belum terverifikasi** | buat subdomain, pasang deploy key + webhook (±10 langkah) |
| Netlify Free (cadangan) | Rp0 | komersial boleh (terverifikasi), maks ±20 production deploy/bln | akun baru + GitHub App |
| Cloudflare Workers static | Rp0 | komersial: dugaan kuat | akun baru + GitHub App/token |
| Vercel Hobby, GitHub Pages | – | tidak legal/tidak cocok | – |

- **Mekanisme deploy:** agent melakukan `git subtree push --prefix web origin web`, lalu hPanel menarik branch `web` lewat webhook. Hostinger yang menarik dari GitHub, jadi agent tidak perlu FTP/SSH keluar.
- **Isi branch `web`:** hanya `index.html`, `vendor/`, `.htaccess` (rewrite `/t/*` ke `index.html` + `X-Robots-Tag: noindex`), dan `robots.txt`. SQL dan tools tidak ikut ter-publish.
- **Shell HTML memang publik, tapi tanpa data.** Semua data hanya keluar lewat RPC yang mensyaratkan JWT anggota aktif.

### 1d. Biaya

| Komponen | Biaya |
|---|---|
| Supabase (numpang ERP prod, org FREE terverifikasi) | Rp0 |
| Hostinger subdomain | Rp0 tambahan (dugaan) |
| GitHub private repo + Actions (backup harian, ±1 menit/run) | Rp0. Kuota menit Actions untuk repo private **belum diverifikasi** |
| **Total** | **Rp0/bulan** |

Penghematan dari berhenti memakai ClickUp: **belum dihitung**. Tier ClickUp per 23/9 tercatat "Unlimited (berbayar/trial)".

### 1e. Tindakan Hannes sendiri

**Sekali di awal** (perkiraan kasar 45–90 menit, belum diukur):

1. Menjawab keputusan K1–K12 (bagian 8).
2. Supabase → project `rhj-tracker` → Settings → Data API → Exposed schemas: tambah `tugas_api`.
3. Memberi ACC bootstrap SQL. Agent menjalankannya lewat MCP: role, schema, grant, bucket `tugas-lampiran` (private, 25 MB), dan policy storage.
4. Authentication → Users → Add user (auto-confirm) untuk 8 anggota ditambah 1 bot (`hanneslowan+tugasbot@gmail.com`). Akun Hannes sudah ada. Password sementara dibagikan ke tiap orang secara pribadi.
   - *Alternatif:* agent membuat akun lewat SQL ke `auth.users` (ACC). Kliknya lebih sedikit, tapi menyentuh schema auth prod secara langsung, jadi tidak saya sarankan.
5. hPanel: buat subdomain (K2), aktifkan SSL, lalu Git → Generate SSH key. Tempel key itu di GitHub `hanneslowan-max/rhj-tugas` → Settings → Deploy keys (read-only). Branch `web`, Auto Deployment ON, dan salin webhook-nya ke GitHub → Webhooks. Pastikan juga repo ini **private** (belum dicek).
6. Env cloud:
   - Di environment "Marketing", tambah `TUGAS_API_TOKEN` (password bot) dan pastikan `*.supabase.co` lolos kebijakan jaringan (belum terverifikasi).
   - Untuk sesi build/migrasi: jalankan di env "Marketing" (sudah ada `CLICKUP_API_TOKEN`), atau tambahkan kedua token ke env sesi ini.
7. GitHub → Secrets → Actions: `TUGAS_API_TOKEN` untuk backup harian.

**Saat cutover:**

8. ACC pengumuman ke tim (draf dari agent) dan ACC commit shim di rhj-brain.
9. Lepas konektor MCP ClickUp. Tanpa itu, agent bisa terbaca data basi (prompt memang sudah melarangnya). Keputusan langganan ClickUp dibuat setelah masa rollback (K11).

---

## 2. Skema data (schema `tugas`, semua tabel RLS ON)

**Tabel**

| Tabel | Kolom kunci |
|---|---|
| `anggota` | `id uuid pk` · `user_id uuid unique` (auth, tanpa FK lintas schema) · `email unique` · `username unique` (verbatim ClickUp, mis. "hannes lowan") · `nama_tampil` · `peran` ∈ owner/member/bot · `aktif` · `clickup_id bigint unique` |
| `ruang` (space) | `id text pk` (ID lama `1100340000…` atau baru `rs…`) · `nama` · `privat` · `urutan` · + `ruang_anggota(ruang_id, anggota_id)` |
| `folder` | `id text pk` · `ruang_id` · `nama` · `tersembunyi` (folder `…63830`) · `diarsip` · `urutan` |
| `list` | `id text pk` · `ruang_id` · `folder_id null` (list tanpa folder) · `nama` (verbatim, termasuk em-dash) · `diarsip` · `tidak_ditagih bool` · `tagih_mulai date null` (tampilan saja: Di luar periode, Kontrak mulai 1 Okt) |
| `status_list` | pk `(list_id, nama)` · `tipe` ∈ open/custom/done/closed · `urutan` · `warna` |
| `tugas` | `id text pk` (ID ClickUp lama, atau baru `rt`+8 base36) · `list_id` · `parent_id null` · `nama` · `deskripsi_md` · `deskripsi_catatan` ("isi deskripsi tak terbaca") · `status` · `prioritas smallint 1–4` (1 = urgent) · `due date` (WIB) · `due_waktu timestamptz null` · `mulai date null` · `bobot smallint 1–3 null` (K7) · `pembuat_id` · `dibuat_pada` · `diubah_pada` · `aktivitas_pada` (termasuk komentar) · `ditutup_pada` · `pertama_ditutup_pada` · `jumlah_buka_ulang` · `diarsip` · `dihapus_pada/oleh` (soft delete) · `clickup_url` · `clickup_meta jsonb` (time_in_status, checklist mentah) · `cari tsvector` GENERATED (`simple`, dari id + nama + deskripsi) |
| `tugas_assignee` | pk `(tugas_id, anggota_id)` · `ditambah_pada/oleh` |
| `komentar` | `id text pk` · `tugas_id` · `induk_id null` (balasan 1 tingkat) · `penulis_id` · `teks` (polos) · `mention uuid[]` · `dibuat_pada` · `diubah_pada` · `dihapus_pada` |
| `lampiran` | `id text pk` · `tugas_id` · `komentar_id null` · `nama_file` · `mime` · `ukuran` · `path_storage` · `url_asal` · `status_impor` ∈ ok/gagal/tautan_saja · `pengunggah_id` · `dibuat_pada` · `dihapus_pada` |
| `aktivitas` (append-only) | `id bigint identity` · `tugas_id` · `jenis` · `dari jsonb` · `ke jsonb` · `aktor_id null` · `aktor_assignee bool` · `sumber` ∈ ui/api/impor/sinkron · `lengkap bool` · `waktu` · `waktu_awal null` (jendela untuk hasil diff sinkron) |
| `notifikasi` | `penerima_id` · `jenis` ∈ assign/mention/komentar · `tugas_id` · `komentar_id` · `aktor_id` · `dibuat_pada` · `dibaca_pada` |
| `hari_libur` | `tanggal pk` · `nama` (kosong secara default) |
| `impor_log` | `mulai` · `selesai` · `mode` ∈ penuh/delta · `ringkas jsonb` (hitungan) |

Nilai `aktivitas.jenis`: dibuat, status, due, assignee_tambah, assignee_hapus, nama, deskripsi, pindah_list, prioritas, bobot, mulai, arsip, hapus, pulih, komentar_baru, komentar_ubah, komentar_hapus, lampiran_tambah, lampiran_hapus, impor.

**Indeks:**
- `tugas(list_id, status) WHERE dihapus_pada IS NULL AND NOT diarsip`
- `tugas(due) WHERE ditutup_pada IS NULL`
- `tugas(parent_id)`, `tugas(aktivitas_pada)`, GIN `tugas(cari)`
- `tugas_assignee(anggota_id)`
- `komentar(tugas_id, dibuat_pada DESC)`, `komentar(induk_id)`
- `aktivitas(tugas_id, waktu)`
- `notifikasi(penerima_id) WHERE dibaca_pada IS NULL`
- `lampiran(tugas_id)`

**Fungsi bantu:**
- `hari_ini_wib()` = `(now() AT TIME ZONE 'Asia/Jakarta')::date`
- `hk(a,b)` = jumlah hari Senin–Jumat dengan a < d ≤ b yang bukan `hari_libur`
- `aktor()` = anggota milik `auth.uid()`
- `id_baru(prefix)` memakai pgcrypto, yang sudah terpasang di prod

**Trigger:**
- `BEFORE INSERT/UPDATE tugas`:
  - validasi status terhadap `status_list`
  - saat pindah list, status dipetakan dengan nama yang sama, atau status pertama bertipe sama
  - menjaga `ditutup_pada`, `pertama_ditutup_pada`, dan `jumlah_buka_ulang`
  - menyetel `diubah_pada` dan `aktivitas_pada`
- `AFTER UPDATE tugas`: menulis satu baris `aktivitas` per field yang berubah (nama dan deskripsi menyimpan teks lama). Saat tipe status berpindah ke closed/done, ditambah **snapshot** berisi jumlah komentar, jumlah lampiran, ada/tidaknya URL, dan komentar terakhir (teks, penulis, waktu), untuk verifikator "complete palsu".
- `tugas_assignee` INSERT/DELETE: menulis aktivitas dan notifikasi `assign`.
- `komentar` INSERT/UPDATE: menulis aktivitas (teks lama disimpan saat edit atau hapus), menaikkan `aktivitas_pada`, lalu membuat notifikasi `mention` (dari `mention[]` plus parse `@username` untuk komentar lewat API) dan `komentar` (ke assignee, pembuat, dan pengomentar sebelumnya, kecuali penulis).
- `aktivitas`: trigger `BEFORE UPDATE/DELETE` selalu RAISE, jadi owner pun tidak bisa mengubahnya.
- Semua trigger melewati notifikasi bila `current_setting('tugas.impor')='on'`.

**RLS dan akses:**
- **Baca:** fungsi `tugas_api` baca = SECURITY INVOKER, sehingga RLS berlaku. Policy SELECT: anggota aktif, dan (ruang tidak privat, atau dia anggota ruang, atau perannya owner/bot).
- **Tulis:** tidak ada grant INSERT/UPDATE/DELETE di tabel. Semua penulisan lewat fungsi SECURITY DEFINER (milik `tugas_pemilik`) yang mengecek `aktor()` dan peran. Hapus dan pulihkan: owner saja. Struktur, status list, anggota, dan libur: owner. Anggota lain boleh membuat, mengubah, memindah, dan berkomentar.
- **`anon`:** tidak punya grant apa pun.
- **Storage `tugas-lampiran`:** path `<tugas_id>/<lampiran_id>-<nama>`. SELECT/INSERT hanya untuk anggota aktif yang bisa melihat tugas itu. DELETE: pengunggah atau owner.

---

## 3. Layar (mobile-first, Bahasa Indonesia)

**Stack UI:** `index.html` tunggal, pola yang sama dengan ERP. Vanilla JS dengan salinan lokal supabase-js, marked, DOMPurify, dan SortableJS di `vendor/`, jadi tidak ada CDN pihak ketiga saat runtime. Navigasi bawah: **Saya · Jelajah · Cari · Notif · Menu**.

1. **Masuk:** email + password. "Lupa sandi" diarahkan ke "hubungi Hannes" (reset lewat SQL dengan ACC; SMTP masuk Fase 2).
2. **Tugas Saya:** grup Telat (hari kalender, terlama di atas) / Hari ini / ≤3 hari kerja ("sisa N hk") / Mendatang / Tanpa due (parkir), masing-masing dengan jumlahnya.
3. **Jelajah:** pohon Space > Folder > List. Folder tersembunyi masuk "Lainnya", list arsip disembunyikan.
4. **Tampilan List:**
   - Dikelompokkan per status, bisa dilipat.
   - Isi baris: nama berkode, avatar semua assignee, chip due (merah telat, oranye hari ini, kuning ≤3 hk), prioritas, jumlah komentar, dan **tanggal komentar terakhir**.
   - Badge "tidak ditagih" untuk list berflag. Badge "menunggu keputusan" untuk nama berisi BERSYARAT, CADANGAN, atau DITUNDA.
5. **Board kanban:**
   - Kolom = status list, di-swipe horizontal dengan scroll-snap.
   - Drag memakai SortableJS (long-press di layar sentuh), dengan fallback tap ke "Ubah status".
   - Perubahan optimistis dan dibatalkan otomatis kalau RPC gagal.
6. **Detail tugas** (layar penuh di HP):
   - Field: nama, status, assignee multi, due (peringatan kalau jatuh Sabtu/Minggu, dan peringatan B5 kalau orang itu sudah punya lebih dari 7 due di hari itu, sifatnya lunak), prioritas, bobot/mulai (K7), pindah list, arsip.
   - Deskripsi markdown dengan mode lihat/edit/pratinjau, disanitasi DOMPurify.
   - Lampiran: gambar, PDF, docx, xlsx, csv, maks 25 MB.
   - Komentar dengan balasan thread dan pemilih @mention.
   - Tab **Riwayat**: event hasil impor diberi label "impor — aktor tak diketahui".
   - Saat ditandai complete tanpa komentar dan tanpa lampiran, muncul peringatan lunak "tanpa bukti".
   - Owner: tombol Hapus (soft) dan Pulihkan.
7. **Filter dan Cari:**
   - Filter: assignee, status, due (telat / hari ini / ≤3 hk / tanpa due), space/list, termasuk selesai.
   - Pencarian: nama, kode, deskripsi, dan ID lama. Tempel URL `app.clickup.com/t/<id>` langsung membuka tugas itu.
   - Pencarian lintas list per space untuk cek duplikat M6.
8. **Notifikasi:** daftar dan badge belum dibaca. Polling tiap 60 detik saat tab aktif, tanpa Realtime (komponen lebih sedikit). Tap membuka tugas dan menandai sudah dibaca.
9. **Pengaturan owner:** anggota (peran, aktif, username), status per list (tambah, urut, tipe), struktur space/folder/list, hari libur.
10. **Profil:** ganti password (tanpa email) dan nama tampil. Username hasil migrasi dikunci.

**Deep link:** `/t/<id>`. Tanggal selalu WIB, format "Sen, 29 Sep".

---

## 4. REST API

**Base dan autentikasi:**
- Base: `https://<ref>.supabase.co/rest/v1/rpc/<fungsi>`.
- Header: `apikey: <anon>` (publik), `Authorization: Bearer <JWT>`, dan `Accept-Profile: tugas_api` untuk GET (STABLE) atau `Content-Profile: tugas_api` untuk POST.
- **Token:** CLI login sebagai akun **bot** lewat `POST /auth/v1/token?grant_type=password`. JWT berlaku default 1 jam (setelan Auth, perlu dicek) dan di-cache.
- Tidak ada kuota harian. Batas yang ada: egress 5 GB/bln bersama org, dan rate limit login Auth per IP (angka **belum diverifikasi**, karena itu 1 login per run plus cache).

| Perintah clickup.mjs | Fungsi `tugas_api.` | Method | Catatan |
|---|---|---|---|
| `whoami` | `api_whoami()` | GET | workspace id `1100340000004525` dipertahankan |
| `tasks <list> [--closed] [--full]` | `api_tasks(p_list,p_closed,p_full)` | GET | brief[] / mentah[] |
| `folder-tasks <folder> [--closed]` | `api_folder_tasks(p_folder,p_closed)` | GET | list non-arsip, termasuk subtask |
| `task <id>` | `api_task(p_id)` | GET | objek kompatibel ClickUp |
| `comments <id> [--replies]` | `api_comments(p_id,p_replies)` | GET | **semua** komentar, terbaru dulu |
| `agenda [folder] [--hours] [--all-comments] [--desc]` | `api_agenda(p_folder,p_hours,p_all_comments,p_desc)` | GET | agregat server, 1 panggilan (tanpa N+1) |
| `create <list> …` | `api_create(p_list,p_name,p_desc,p_assignees,p_due,p_priority,p_status)` | POST | brief |
| `update <id> …` | `api_update(p_id,p_name,p_desc,p_status,p_due,p_priority,p_add,p_rem)` | POST | `p_due='none'` untuk parkir |
| `comment <id> --text/--file` | `api_comment(p_id,p_text,p_parent)` | POST | `{id,hist_id,date}` |
| `move <id> <list>` | `api_move(p_id,p_list)` | POST | ID tetap, status dipetakan |
| `delete <id> --yes` | `api_delete(p_id)` | POST | **owner saja**, soft. Bot mendapat 403 (K9) |
| `fields <list>` | – | – | CLI menjawab `[]` |
| baru: `activity <id> [--since]` | `api_activity(p_id,p_since)` | GET | riwayat |
| baru: `cari "<q>"` | `api_cari(p_q,p_ruang,p_closed)` | GET | brief[] |
| baru: `lampiran <id> [--out]` | `api_task` + Storage `object/sign` (batch) | GET/POST | unduh file |
| baru: `ekspor` | `api_ekspor()` | GET | owner/bot, untuk backup |
| impor | `impor_batch(p_jenis,p_rows)` | POST | owner/bot, upsert idempoten |
| web saja | `web_saya`, `web_detail` (tugas + komentar + riwayat + lampiran dalam 1 panggilan), `notif_daftar/baca`, `status_simpan`, `struktur_simpan`, `anggota_simpan`, `libur_simpan`, `lampiran_catat`, `komentar_ubah/hapus`, `tugas_arsip/pulihkan`, `kesehatan` | – | – |

**Format respons:**
- **Urutan key:** dibangun dengan `json_build_object`, bukan jsonb, supaya urutan key sama persis.
- **brief:** `{id,name,status,assignees:[username],due:"YYYY-MM-DD"|null,updated:ISO-UTC-ms,list,url}`
- **comments:** `[{id,user,date,text,reply_count,replies?}]`. Key `replies` hanya muncul kalau `--replies` dan `reply_count>0`.
- **agenda:** `{tanggal_wib,sejak,folder,ringkas{terbuka,due_hari_ini,telat,berubah_baru,ditutup_baru,kartu_dengan_komentar_baru},tasks[brief+kategori,closed,description?,comments,komentar_baru]}` dengan definisi `closed`/`telat`/`berubah_baru` yang identik dengan `clickup.mjs`.
- **task mentah:** `id`, `name`, `markdown_description`, `text_content`, `status{status,type,color,orderindex}`, `date_created/updated/closed/done` (string ms), `due_date` (string ms 12:00 WIB, atau `due_waktu` asli), `due_date_time`, `start_date`, `assignees[{id: clickup_id atau uuid, username, email}]`, `creator`, `priority{id,priority,color}`, `parent`, `list{id,name}`, `folder{id,name,hidden}`, `space{id}`, `url`, `attachments[{id,date,title,extension,mimetype,size,url}]`, `custom_fields:[]`, `checklists`, `tags:[]`.
- **Error:** PostgREST `{code,message}` dengan pesan berbahasa Indonesia, mis. `TIDAK_DITEMUKAN: tugas z8r3…`.

---

## 5. Desain `tugas.mjs`

- **Node 22, tanpa dependensi.** Parser argumen disalin dari `clickup.mjs`, jadi flag identik: `--closed --full --replies --hours --all-comments --desc --name --desc --assignee --due --priority --status --add-assignee --rem-assignee --text --file --dry-run --yes`. Flag tambahan: `--parent` (balas komentar) dan `--out`.
- **Konfigurasi:**
  - `TUGAS_URL`, `TUGAS_ANON_KEY`, dan `TUGAS_BOT_EMAIL` punya default hardcode (nilainya publik) dan bisa di-override lewat env.
  - Hanya **`TUGAS_API_TOKEN`** (password bot) yang rahasia.
  - Kalau token kosong, CLI mencetak `tugas: TUGAS_API_TOKEN kosong (set di environment cloud, lalu buka sesi baru)` dan keluar dengan exit 1.
- **JWT:** di-cache di `os.tmpdir()/tugas-jwt.json` (mode 0600), diperbarui kalau sisa masa berlakunya di bawah 5 menit. Saat 401, login ulang 1x. Error 5xx atau jaringan dicoba ulang 3x dengan backoff. Throttle 670 ms tidak disalin.
- **Output:** `JSON.stringify(x,null,2)` dari RPC apa adanya. Error ke stderr dengan format `tugas: GAGAL -> HTTP <kode>: <pesan>`, lalu exit 1.
- **ID yang diterima:**
  - ID lama atau baru, dan URL `app.clickup.com/t/<id>` atau URL baru.
  - Assignee: `clickup_id` numerik, uuid, username, atau email. Tidak ada `Number()`, dan resolusinya di server.
- **`--dry-run`:** bentuknya sama dengan versi lama.
  - `{dry_run:true,method,task,body}`, dengan body bergaya ClickUp (`markdown_description`, `due_date` ms, `due_date_time:false`, `assignees:{add,rem}`).
  - Untuk move: `{dry_run,method:"PUT",url}`.
- **Shim saat cutover:** isi `tools/clickup.mjs` diganti menjadi `import "./tugas.mjs";`. Nama perintah, izin, dan teks prompt UI tetap berlaku.
- **`tools/uji-kontrak.mjs`:** menjalankan `clickup.mjs` dan `tugas.mjs` dengan argumen yang sama, lalu diff setelah normalisasi (domain url, url lampiran, komentar lebih dari 25). Kasus uji:
  - `folder-tasks 1100340000026652`
  - `tasks 1100340000065694` dan `tasks 1100340000065696`
  - `agenda 1100340000026652 --hours 26`
  - `comments z8r3fdd1wp --replies`
  - `task` untuk 15 ID yang ada di file instruksi aktif (daftar di laporan sapuan).

---

## 6. Rencana migrasi

**Urutan:**
1. **Ekstrak (GET saja).** Helper HTTP di `impor-clickup.mjs` melempar error untuk method selain GET, sehingga ClickUp tidak mungkin berubah. Data mentah disimpan di scratch, bukan di repo, karena ada nama pelanggan. Yang diambil:
   - `/team` dan `/list/{id}/member` (email)
   - space, folder, dan list masing-masing dengan `archived=false` **dan** `true`, termasuk list tanpa folder
   - `GET /list/{id}` untuk status
   - task per list dengan `include_closed&subtasks&archived`, paging 100
   - `GET /task/{id}?include_markdown_description` (lampiran dan checklist)
   - komentar **dengan paginasi** `start`+`start_id` sampai habis, dan `/comment/{id}/reply`
   - `bulk_time_in_status` (dicoba; kalau ditolak, dicatat)
   - Throttle ≤90 req/menit.
   - Perkiraan beban: minimal ±400 request (198 detail + 198 komentar, data 23/9) ditambah balasan yang belum dihitung, jadi **minimal ±4,5 menit**.
2. **Anggota:** akun auth dibuat lebih dulu (1e), lalu dicocokkan lewat email ke `anggota(clickup_id, username verbatim)`. Rengga dan bot dibuat langsung di aplikasi.
3. **Muat:** `impor_batch` dengan `tugas.impor=on`, `ON CONFLICT (id) DO UPDATE` untuk semua entitas. Menjalankan ulang aman.
4. **Lampiran:**
   - Uji 1 URL lampiran ClickUp dengan curl **tanpa auth** dulu. Setelan "Private Attachment Links" belum terverifikasi.
   - Unduh, lalu upload ke Storage. Lampiran yang sudah ada dengan ukuran sama dilewati.
   - Kalau gagal: `status_impor='tautan_saja'` dan `url_asal` disimpan.

**Pemetaan field:**

| ClickUp | Aplikasi baru |
|---|---|
| `id` | `id` |
| `name` | `nama` (verbatim) |
| `markdown_description` | `deskripsi_md`. Kalau kosong atau sync-block: `deskripsi_catatan` |
| `status.status` / `.type` | `status` / `status_list.tipe` |
| `priority.priority` | urgent/high/normal/low = 1/2/3/4 |
| `due_date` | `due` = wibDate(ms). Kalau `due_date_time=true`: juga `due_waktu` |
| `start_date` | `mulai` |
| `creator`, `date_created` | `pembuat_id`, `dibuat_pada` |
| `date_updated` | `diubah_pada`, `aktivitas_pada` |
| `date_closed`/`date_done` | `ditutup_pada` |
| `archived` | `diarsip` |
| `parent` | `parent_id` |
| `list.id` (home) | `list_id` |
| `assignees[].id` | `tugas_assignee` lewat `clickup_id` |
| `checklists` | markdown `- [x]` di bawah heading "Checklist (impor ClickUp)" + `clickup_meta` |
| `url` | `clickup_url` |
| `custom_fields` | diabaikan (0 terisi per 23/9) |
| `comment_text` | `teks` |
| `comment[]` bertipe `tag` | `mention` |
| lampiran di dalam komentar | bentuknya belum didokumentasikan, diperiksa dari data nyata |

**Riwayat status:**
- **Bisa diambil:** `date_created` + pembuat (event `dibuat`), `date_closed` terakhir (event `ditutup` dengan aktor null dan `lengkap=false`), waktu komentar, dan total menit per status dari `time_in_status` (kalau diizinkan paket; per OTAK-MM sebelumnya ditolak).
- **Tidak bisa diambil:** transisi satu per satu, pelaku perubahan status, riwayat due dan assignee, serta penutupan yang terjadi sebelum kartu dibuka ulang.
- Setiap tugas diberi event `impor` berbunyi "riwayat sebelum <tgl> tidak tersedia dari API ClickUp". Tidak ada event yang dikarang.
- **Selama masa paralel:** setiap sinkron membandingkan snapshot dan mencatat perubahan status/due/assignee dengan `sumber='sinkron'`, `aktor=null`, dan jendela `waktu_awal..waktu`. Riwayat kasar mulai terisi sejak impor pertama.

**Verifikasi otomatis per run** (ditulis ke `impor_log`):
- Per list: jumlah open dan closed, ClickUp dibanding aplikasi baru.
- Total komentar dan balasan.
- Lampiran: jumlah, byte, dan yang gagal. Baseline 23/9 adalah 65 file / 16,1 MB, dan angka sekarang pasti sudah berbeda.
- Kesamaan per tugas untuk status, due (WIB), assignee, dan prioritas.
- Diff JSON penuh untuk 10 tugas acak.
- `uji-kontrak.mjs` harus lolos sebelum masa paralel dimulai.
- Perbedaan yang memang disengaja: domain url, dan komentar lebih dari 25 (versi lama terpotong). Urutan balasan juga harus diverifikasi lewat diff.

**Masa paralel (1–2 minggu):**
- ClickUp tetap sumber utama, dan tim bekerja di ClickUp. Aplikasi baru dipakai untuk mencoba dan melihat.
- Sinkron ulang dijalankan agent di env "Marketing" secara on-demand, 2–3x (K10).
- Untuk tugas hasil impor, ClickUp yang menang. Perubahan di aplikasi baru yang tertimpa dicatat di `aktivitas`. Tugas yang dibuat langsung di aplikasi baru tidak disentuh.

**Cutover:**
1. Umumkan jam beku ClickUp. Tidak bisa dipaksakan secara teknis karena ClickUp tidak boleh diubah.
2. Sinkron akhir **penuh**. `date_updated` tidak dipercaya untuk komentar, karena semantiknya belum terverifikasi.
3. Verifikasi hitungan.
4. Commit shim di rhj-brain (lewat sesi CMO, dengan ACC).
5. Run Agen Data dan Digest berikutnya dicek manual pada hari pertama.
6. Dokumen rhj-brain lain menyusul (daftar di laporan sapuan).

**Rollback:**
- ClickUp tidak pernah diubah. Rollback cukup `git revert` commit shim, lalu umumkan tim kembali ke ClickUp.
- Perubahan di aplikasi baru sejak cutover diekspor lewat `activity --since` untuk dimasukkan ulang secara manual. Menulis ke ClickUp butuh ACC.
- Membongkar aplikasi dari prod: lihat 1b poin 5.

**Backup:** GitHub Actions cron harian menjalankan `tugas.mjs ekspor` dan mengunduh lampiran, lalu menyimpannya sebagai artifact dengan `retention-days` eksplisit (default belum diverifikasi). Uji restore sekali ke schema `tugas_uji`, memakai loader yang sama dengan importer. Tidak perlu password DB di mana pun.

---

## 7. Tahapan dan perkiraan

**Asumsi:** 1 sesi = 1 sesi kerja agent (±2–4 jam). Keputusan K dijawab dalam ≤1 hari. Data ClickUp tidak punya kejutan besar. Ini perkiraan, bukan janji.

| Fase | Isi | Sesi |
|---|---|---|
| F0 | Keputusan + setup Hannes (1e) | – (Hannes 45–90 mnt, kasar) |
| F1 | Bootstrap, skema, trigger, RLS, tes SQL | 1–2 |
| F2 | RPC API + `tugas.mjs` + tes kontrak dengan fixture | 2–3 |
| F3 | Importer + impor uji + verifikasi (butuh `CLICKUP_API_TOKEN`) | 1–2 |
| F4 | Web: login, Saya, List, Board, Detail, komentar, lampiran, notif, filter/cari, owner | 3–5 |
| F5 | Uji kontrak live vs `clickup.mjs`, backup Actions, hardening (Supabase advisors) | 1–2 |
| F6 | Paralel 1–2 minggu kalender + perbaikan | 1–3 |
| F7 | Sinkron akhir, cutover, dokumen rhj-brain | 1 |
| **Total** | | **10–18 sesi** + 1–2 minggu paralel |

---

## 8. Keputusan WAJIB dari Hannes

| # | Keputusan | Opsi | Rekomendasi |
|---|---|---|---|
| K1 | Lokasi DB (batas 2 project) | P / D / A / Pro Rp449.619 / upgrade Rp809.314 / Cloudflare | **P** + pagar 1b. Pindah ke Pro kalau butuh backup resmi atau terjadi insiden |
| K2 | Domain | subdomain palletmeshindonesia.com (ERP ada di Hostinger yang sama) / rodahammerindo.com (hosting belum terverifikasi) | `tugas.palletmeshindonesia.com`, noindex |
| K3 | Kebijakan ID | ID lama tetap jadi `id` / ID baru + `clickup_id` | **ID lama tetap**. Tugas baru memakai prefix `rt` |
| K4 | Kompatibilitas routine | shim `clickup.mjs` / edit 6 prompt UI | **shim**. Prompt dirapikan belakangan |
| K5 | Identitas agent | akun bot terpisah / token Hannes | **bot**. Komentar agent tidak lagi terbaca sebagai "hannes lowan" (mengubah deteksi "sudah dijawab Hannes", dan itu disengaja) |
| K6 | Email login | Michael: michael@rodahammerindo.com vs eppy.michael@gmail.com. Rengga: luckyrengga1@gmail.com? | Hannes yang tentukan |
| K7 | Field bawaan tambahan | `bobot` 1–3, `mulai`, penanda "menunggu keputusan" | bobot + mulai: **ya** (3 kolom murah, sudah dipakai). Menunggu: status tambahan per list, bukan field |
| K8 | Visibilitas space | semua anggota lihat semua / Online Sales privat | ikuti setelan privat ClickUp yang terbaca saat impor |
| K9 | Hapus | soft (bisa dipulihkan owner) / permanen. Bot boleh hapus? | soft. **Bot tidak boleh hapus** |
| K10 | Masa paralel | sinkron akhir saja / 2–3x + akhir | 2–3x + akhir. Edit di aplikasi baru selama paralel dianggap uji |
| K11 | Setelah cutover | lama masa rollback, nasib langganan ClickUp, **ke mana chat grup sales** (`z8r3fda6dd-1398`, di luar Fase 1) | ClickUp dipertahankan ≥2 minggu. Jangan berhenti langganan sebelum pengganti chat diputuskan |
| K12 | Terkait ERP | profil ERP anggota tugas diset `nonaktif`? Promosi ERP dev→prod tetap di project prod yang sama? | nonaktif: **ya**. Rencana promosi perlu dikonfirmasi, karena P bergantung pada project prod yang tetap sama |

Aturan yang saling bertabrakan (tangga eskalasi 5+ lawan B10, hari libur) tetap diputuskan di routine. Aplikasi hanya menyediakan filter mentah: semua kartu telat, dan tabel libur yang kosong.

---

## 9. Risiko utama dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Migrasi tugas merusak ERP prod (MCP jalan sebagai `postgres`) | `set local role tugas_pemilik` di setiap migrasi, schema terpisah, hanya `tugas_api` yang di-expose, ACC per batch |
| Anggota tugas keliru di-approve di ERP | profil diset `nonaktif` (K12). User ERP tanpa baris `anggota` tidak melihat data |
| Free tanpa backup (ERP juga) | ekspor JSON harian + lampiran lewat Actions, uji restore sekali |
| Output berbeda, 4 routine aktif salah baca | `uji-kontrak.mjs` wajib lolos sebelum shim. Revert 1 commit |
| Due bergeser 1 hari (UTC vs WIB) | `due` bertipe DATE WIB, konversi `wibDate` yang sama, cek kesamaan due per tugas saat impor |
| Urutan dan paginasi komentar | ambil semua + diff urutan. Perbedaan lebih dari 25 memang disengaja dan didokumentasikan |
| Riwayat dan sebagian data tidak bisa diekspor | penanda "aktor tak diketahui" dan "isi deskripsi tak terbaca", tidak ada data yang dikarang |
| URL lampiran ClickUp butuh login | uji 1 URL dulu, fallback `tautan_saja` |
| Lupa password tanpa SMTP | reset lewat SQL (ACC). SMTP sendiri di Fase 2 |
| Batas Free: storage 1 GiB bersama org | ERP prod + dev = 68.708.748 B (±65,5 MiB). Ditambah 16,1 MiB lampiran task menjadi ±81,6 MiB (±8%). Lampiran komentar belum dihitung. Egress tugas belum dihitung, dipantau di dashboard |
| Hostinger: subdomain, SSL, atau `.htaccess` tidak tersedia | fallback Netlify Free (komersial boleh, ±20 deploy/bln) |
| Token bot bocor | izinnya sama dengan token ClickUp sekarang, tapi tanpa hak hapus. Rotasi = ganti password bot |
| Konektor MCP ClickUp masih terpasang setelah cutover, agent membaca data basi | lepas konektor saat cutover. Prompt memang sudah melarangnya |
| Sesi ERP menyentuh `tugas*` | catatan di README dan infodb, plus RPC `kesehatan()` di job backup yang gagal dengan jelas kalau ada yang rusak |
| Env "Marketing" memblokir `*.supabase.co` | cek sebelum paralel. Hannes menambah allowlist bila perlu |