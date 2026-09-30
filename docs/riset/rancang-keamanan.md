
# Proposal arsitektur rhj-tugas Fase 1 (sudut keamanan dan keandalan)

## Ringkasan
- **Stack:** Supabase (Postgres + Auth + Storage) di **project terpisah dari ERP**, ditambah frontend statis di subdomain Hostinger yang sudah dibayar. Biaya Rp0/bulan kalau `rhj-tacker.dev` di-pause. Kalau pakai org Pro terpisah, $25 ≈ Rp449.619/bulan (kurs dan harga dari laporan platform). Saya tidak menyarankan numpang di ERP produksi.
- **Satu jalur tulis:** semua perubahan data lewat fungsi Postgres `api_*` (SECURITY DEFINER). UI dan agent memakai fungsi yang sama. Klien tidak punya hak INSERT/UPDATE/DELETE langsung ke tabel.
- **Riwayat aktivitas:** ditulis oleh trigger DB. Pelaku diambil dari JWT yang sudah diverifikasi atau dari token yang sudah dicek. Tabelnya append-only dan diberi rantai hash. Pelaku tidak pernah diambil dari body request.
- **Token agent:** acak 256-bit, disimpan hanya sebagai hash SHA-256. Tiap token terikat ke satu anggota, punya scope `baca`/`tulis`/`hapus`, bisa dicabut, dan setiap tulisan mencatat `token_id`. Enam routine aktif semuanya READ-ONLY (laporan routine), jadi token routine cukup scope `baca`.
- **Masa paralel = mode cermin:** kartu hasil impor dikunci di aplikasi, dan ClickUp tetap tempat kerja. Dengan begitu tidak ada tulisan di aplikasi yang hilang saat sinkron akhir.

### Fakta tambahan yang saya cek di sesi ini (baca saja)
- ERP login pakai **Google OAuth** (`/auth/v1/authorize?provider=google` di `RHJ-Website/index.html`). Lampirannya lewat signed URL (`object/sign/dokumen/`). CSP-nya ketat: `default-src 'none'`, `connect-src https://*.supabase.co`, dan `frame-ancestors` lewat `.htaccess`. Pola ini dipakai ulang.
- Pola pengerasan ERP: `revoke execute ... from public, anon` (berkas 75, 84) dan `set search_path` (linter 0011/0028). Pola ini juga dipakai ulang.
- Mesin sesi punya `pg_dump`/`psql` **16** dan server `initdb`/`postgres` 16. ERP prod memakai Postgres **17.6** (laporan platform). pg_dump tidak mau men-dump server dengan versi mayor yang lebih baru, jadi **backup wajib pakai pg_dump 17** (image `postgres:17`). PG16 lokal cukup untuk tes skema dan RLS.
- Supabase MCP di sesi ini **tidak punya** tool create/pause project maupun deploy Edge Function (dicek dari daftar tool). Tiga hal itu harus dikerjakan Hannes, atau lewat token akses Supabase dari Hannes.
- `tools/clickup.mjs` `getComments` tidak melakukan paginasi, jadi hanya mengambil 25 komentar. Folder dan list diambil dengan `archived=false` saja. Skrip impor harus menangani keduanya (sudah ditemukan juga di laporan platform).

---

## 1. Stack, hosting, biaya, tindakan Hannes

| Komponen | Pilihan | Biaya | Catatan keamanan/keandalan |
|---|---|---|---|
| DB + Auth + Storage | Supabase project `rhj-tugas`, region ap-southeast-1 | Rp0 (opsi a) / $25 ≈ Rp449.619 (opsi c) | Auth dan config terpisah dari ERP. RLS di semua tabel. |
| API agent | Fungsi RPC PostgREST `POST /rest/v1/rpc/api_*` | Rp0 | Tidak ada kuota panggilan harian di batas Free yang dikutip. Yang dibatasi egress 5 GB/org, dipakai bersama ERP kalau satu org. |
| Unduh lampiran agent | 1 Edge Function `unduh` (tautan HMAC berumur ≤1 jam) | Rp0 (kuota 500.000 invocation/bulan) | Satu-satunya tempat service key dipakai saat runtime. Deploy-nya perlu Hannes. |
| Frontend | Statis tanpa build step: ES modules + Preact/htm + supabase-js + markdown-it + DOMPurify + SortableJS, semua di-vendor ke repo dengan versi terkunci | Rp0 | CSP `script-src 'self'`, tanpa CDN saat runtime. Tanpa service worker, supaya data tidak tersimpan di HP. |
| Hosting | Subdomain Hostinger + Git auto-deploy (deploy key) | Rp0 tambahan (dugaan; kuota subdomain belum terverifikasi) | Header lewat `.htaccess`, sama seperti ERP. Alternatif: Cloudflare Workers static (Rp0, status komersial = dugaan kuat) atau Netlify Free (komersial boleh, sekitar 20 production deploy/bulan). Vercel Hobby dan GitHub Pages tidak legal atau tidak cocok. |
| Backup | GitHub Actions harian di repo private: pg_dump 17 + unduh Storage → dienkripsi `age` → artifact | Rp0 (kuota menit dan storage artifact GitHub Free belum diverifikasi) | Supabase Free tidak menyertakan backup (docs pricing). |
| Login | Google OAuth (seperti ERP). Cadangannya email+password yang dibuat owner. | Rp0 | Tidak perlu SMTP. Magic link tidak layak: SMTP bawaan 2 email/jam dan hanya ke anggota org Supabase. |

**Opsi project** (detail di bagian 8, keputusan K1):
- (a) Pause `rhj-tacker.dev`: Rp0. ERP dev berhenti, dan restore-nya kemungkinan terblokir batas 2 project aktif (dugaan).
- (b) Schema di ERP prod: Rp0. **Tidak disarankan.** Auth ikut terbagi: trigger `buat_profil_baru` akan memasukkan 9 anggota ke `profiles` ERP, 4 user ERP bisa login ke aplikasi tugas, dan bug atau migrasi tugas bisa berdampak ke ERP.
- (c) Org Pro terpisah: $25 ≈ Rp449.619/bulan. Dapat backup 7 hari dan tidak ada pause.
- (d) Upgrade org yang ada: $45 ≈ Rp809.314/bulan.

**Tindakan Hannes (tidak bisa dari sesi ini):**
1. **Project:** pause `rhj-tacker.dev` lalu buat project `rhj-tugas`, atau buat org Pro baru. Simpan password DB di pengelola sandi, bukan di chat. Alternatif: tidak ada, karena MCP sesi ini tidak bisa create/pause project.
2. **Google OAuth:** tambahkan redirect `https://<ref-baru>.supabase.co/auth/v1/callback` di OAuth client Google Cloud. Client ERP bisa dipakai ulang, atau buat client baru (lebih bersih). Isi client ID dan secret di Supabase Auth > Google, dan matikan "Allow new users to sign up". Alternatif: login password saja, dengan akun yang saya buat lewat admin API dan password yang dikirim Hannes sendiri lewat WA.
3. **Hostinger:** buat subdomain (misalnya `tugas.<domain>`). Di hPanel Git, generate SSH key, tempel sebagai deploy key read-only di repo `rhj-tugas`, lalu aktifkan auto-deploy. Alternatif: Cloudflare (daftar, lalu install GitHub App hanya untuk `rhj-tugas`) atau Netlify.
4. **Secrets GitHub** repo `rhj-tugas`: `SUPABASE_DB_URL_BACKUP` (role backup, bukan postgres), `SUPABASE_SECRET_KEY` (untuk unduh Storage saat backup), dan `CLICKUP_API_TOKEN` (hanya selama impor dan paralel). Hannes juga menjalankan `age-keygen` di laptopnya dan hanya menempel **kunci publik**. Kunci privat disimpan offline.
5. **Env sesi build ini:** `CLICKUP_API_TOKEN` (untuk sensus dan impor) dan `SUPABASE_DB_URL` untuk migrasi. Alternatif untuk migrasi: MCP `execute_sql`.
6. **Deploy Edge Function `unduh`:** tempel kodenya lewat editor fungsi di dashboard, atau beri `SUPABASE_ACCESS_TOKEN` sementara lalu cabut sesudahnya.
7. **Saat cutover:** tambahkan `TUGAS_API_URL`, `TUGAS_API_KEY` (publishable, tidak rahasia) dan `TUGAS_API_TOKEN` ke env cloud "Marketing". Cek juga apakah kebijakan jaringan env meloloskan `*.supabase.co` (belum terverifikasi).

---

## 2. Skema data

Tabel ada di `public` dengan RLS aktif. Helper ada di schema `priv`, yang tidak di-expose dan EXECUTE-nya dicabut dari `public`/`anon`/`authenticated`. Semua fungsi memakai `set search_path=''`.

**Keputusan ID:** kolom `id` bertipe **text**. Isinya ID ClickUp untuk data impor (`z8r3fdjvwd`, `1100340000026652`), dan ID baru (`rt` + 8 karakter base36) untuk data baru. Hasilnya, `folder-tasks 1100340000026652`, `comments z8r3fdd1wp` dan sekitar 130 ID di memori tetap jalan tanpa tabel alias. User memakai uuid, ditambah `clickup_user_id` sebagai alias.

| Tabel | Kolom kunci | Indeks/constraint |
|---|---|---|
| `anggota` | id uuid (= auth.users), email citext uniq, nama, **username** (verbatim ClickUp, misalnya "hannes lowan"), peran `owner/member/bot`, aktif, clickup_user_id bigint uniq | uniq email, username |
| `akses_space` | space_id, anggota_id (kalau K6 = per-space) | PK gabungan |
| `space` / `folder` / `daftar` | id text, nama (verbatim, termasuk em-dash), urutan, diarsip_pada; folder: `tersembunyi`; daftar: `folder_id` nullable (list tanpa folder) | FK, uniq nama per induk |
| `status_daftar` | id, daftar_id, nama (huruf kecil), **tipe** `open/custom/done/closed`, warna, urutan | uniq (daftar_id, lower(nama)); cek: tiap daftar minimal 1 status bertipe closed |
| `tugas` | id text, daftar_id, parent_id, nama, deskripsi_md, deskripsi_tak_terbaca bool, status_id, prioritas 1–4, **due date** (tanggal WIB), mulai date, bobot 1–3 (K9), menunggu_keputusan bool (K9), dibuat_oleh, dibuat_pada, **diubah_pada** (trigger), **aktivitas_terakhir_pada** (naik juga saat ada komentar), ditutup_pada, ditutup_pertama_pada, diarsip_pada/oleh, **dihapus_pada/oleh** (soft), versi int, sumber `clickup/app`, clickup_url, impor_meta jsonb, `cari` tsvector (simple) | (daftar_id) where dihapus is null; (due) where terbuka; (ditutup_pada); (diubah_pada); GIN(cari); GIN trgm(nama) untuk kode "Y7" |
| `tugas_assignee` | tugas_id, anggota_id, ditambah_oleh, ditambah_pada | PK gabungan; idx anggota_id |
| `komentar` | id text, tugas_id, induk_id (balasan 1 level), penulis_id, isi_md, isi_teks (polos untuk API `text`), dibuat_pada, diedit_pada, dihapus_pada | (tugas_id, dibuat_pada desc); (induk_id) |
| `mention` | komentar_id, anggota_id (diparse server dari token `@[nama](uuid)`) | PK |
| `lampiran` | id uuid, tugas_id, komentar_id null, nama_file, mime, ukuran, sha256, storage_path, diunggah_oleh/pada, sumber, clickup_url, status_salin `ok/gagal` | (tugas_id), (komentar_id) |
| `aktivitas` | id bigint identity, tugas_id (tanpa FK cascade), **waktu** (now() server), dicatat_pada, aktor_id, token_id, sumber `ui/api/impor/sistem`, jenis, dari jsonb, ke jsonb, aktor_adalah_assignee, snapshot jsonb, diimpor bool, hash_prev, hash | (tugas_id, id); (waktu) |
| `notifikasi` | penerima_id, jenis `assign/mention/komentar`, tugas_id, komentar_id, aktor_id, dibuat_pada, dibaca_pada | (penerima_id, dibaca_pada) |
| `api_token` | id, anggota_id, label, prefix (8 karakter awal), **hash bytea uniq**, scope text[], dibuat_oleh/pada, kedaluwarsa, dicabut_pada/oleh, terakhir_dipakai | uniq hash; kolom hash tidak diberi SELECT ke siapa pun |
| `api_idem` | kunci, token_id, hasil jsonb, dibuat_pada (24 jam) | mencegah `create` ganda saat retry |
| `hari_libur` | tanggal, keterangan (kosong secara default, diisi owner) | PK tanggal |
| `pengaturan` | mode `cermin/utama`, zona `Asia/Jakarta` | 1 baris |
| `impor_run` | mulai, selesai, hitungan per list, galat | |

**Trigger riwayat** (AFTER INSERT/UPDATE di `tugas`, `tugas_assignee`, `komentar`, `lampiran`):
- **Yang dicatat:** status, buka-ulang, due, prioritas, nama, deskripsi (teks lama dan baru), pindah daftar, arsip/pulih, hapus/pulih, assignee +/−, komentar baru/edit (teks lama)/hapus, dan lampiran +/−.
- **Saat status masuk tipe closed/done:**
  - BEFORE trigger mengisi `ditutup_pada` (dan `ditutup_pertama_pada` kalau masih kosong).
  - AFTER trigger menyimpan **snapshot**: jumlah komentar, jumlah lampiran, ada/tidaknya URL, dan komentar atau balasan terakhir (penulis, waktu, 200 karakter). Ini bahan verifikator untuk "complete palsu".
- **Buka-ulang:** `ditutup_pada=null` dan tercatat jenis `buka_ulang`.
- **Pelaku:** `priv.aktor()` = `auth.uid()` (JWT). Kalau kosong, `rhj.aktor_id`, yang hanya di-set oleh `priv.masuk_token()` sesudah hash token cocok (GUC lokal transaksi). PostgREST tidak bisa men-set GUC ini dari klien. Sumber `impor` hanya diterima kalau `session_user = 'rhj_importir'`, dan role itu dibuat NOLOGIN sesudah cutover. Aksi tanpa pelaku ditolak.
- **Append-only:**
  - `revoke insert,update,delete,truncate on aktivitas from anon, authenticated, service_role`
  - trigger BEFORE UPDATE/DELETE/TRUNCATE yang selalu `raise`
  - rantai hash per tugas: `hash = sha256(hash_prev || baris)`
  - hash terakhir global disalin ke log backup harian, supaya ada jangkar di luar DB
  - Batasnya: role `postgres` (dashboard SQL, MCP) secara teknis masih bisa menonaktifkan trigger. Itu **terdeteksi** lewat rantai hash dan jangkar backup, tapi tidak bisa **dicegah**.

**Inti kode yang menentukan keamanan:**
```sql
create function priv.masuk_token(p_scope text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if auth.uid() is not null then return priv.wajib_aktif(auth.uid()); end if;          -- jalur UI
  select * into t from public.api_token
   where hash = extensions.digest(coalesce(current_setting('request.headers',true)::json->>'x-rhj-token',''),'sha256')
     and dicabut_pada is null and (kedaluwarsa is null or kedaluwarsa > now());
  if not found or not p_scope = any(t.scope) then raise sqlstate 'PT401' using message = 'token tidak sah'; end if;
  perform set_config('rhj.aktor_id', t.anggota_id::text, true);
  perform set_config('rhj.token_id', t.id::text, true);
  update public.api_token set terakhir_dipakai = now()
   where id = t.id and (terakhir_dipakai is null or terakhir_dipakai < now() - interval '5 minutes');
  return priv.wajib_aktif(t.anggota_id);                                                -- anggota nonaktif = ditolak
end $$;
```

**RLS ringkas:**
- `anon`: tidak punya grant ke tabel mana pun. Hanya EXECUTE `api_*`, yang tetap menuntut token sah.
- `authenticated`: hanya SELECT, dengan `priv.boleh_lihat_daftar(daftar_id)` (anggota aktif, akses space). Tugas yang terhapus hanya terlihat oleh owner (tempat sampah).
- Tulis: tidak ada policy insert/update/delete. Semuanya lewat `api_*`, yang memanggil helper izin yang sama.
- `notifikasi`: hanya milik sendiri. `api_token`: metadata milik sendiri, owner melihat semua, kolom hash tidak pernah terbaca.
- Storage bucket `lampiran`: **private**, batas 25 MB/file (sama dengan ERP), allowlist MIME: gambar raster, PDF, docx, xlsx, csv. SVG dan HTML ditolak. Policy select/insert memakai helper yang sama lewat `tugas_id` di path.
- Sesudah tiap migrasi: `get_advisors` (security linter), lalu tes matriks peran (lihat risiko R2).

---

## 3. Layar (mobile-first, Bahasa Indonesia)

1. **Masuk:** tombol Google, atau email+password. Halaman ini tidak memuat data apa pun, termasuk daftar anggota. `/t/<id>` tanpa sesi diarahkan ke Masuk, lalu kembali ke tugas itu.
2. **Tugas Saya (beranda):** grup Telat (hari kalender) / Hari ini / ≤3 hari kerja (`hk()` Sen–Jum dikurangi `hari_libur`) / Nanti / Tanpa due. Lonceng notifikasi di header.
3. **Navigasi (drawer):** Space > Folder > List. Folder tersembunyi diberi ikon. List arsip ada di bawah lipatan.
4. **Tampilan List:**
   - Dikelompokkan per status dan bisa dilipat.
   - Baris kartu: nama berkode, avatar assignee, chip due (merah kalau telat), prioritas, jumlah komentar, dan tanggal komentar terakhir (dipakai sebagai progres H-1).
   - Label "menunggu keputusan" untuk BERSYARAT/CADANGAN/DITUNDA atau kartu yang diberi flag. Label "tidak ditagih" untuk list Di luar periode.
5. **Board:**
   - Kolom per status dengan scroll horizontal. Drag memakai long-press (SortableJS).
   - Saat kartu dijatuhkan, `api_update` dikirim beserta `versi`. Kalau terjadi konflik, muncul toast "Kartu sudah diubah orang lain" lalu kolom dimuat ulang.
6. **Detail tugas (sheet layar penuh):**
   - Status, assignee, due, mulai, prioritas, bobot, menunggu keputusan, deskripsi markdown (edit/pratinjau, disanitasi), lampiran, komentar + balas + @mention.
   - Tab **Riwayat** (aktivitas, termasuk penanda "impor: aktor tak diketahui").
   - ID lama + salin tautan.
   - Aksi: pindah list, arsip, buka ulang. **Hapus** hanya tampil untuk owner, dengan konfirmasi.
   - Peringatan non-blokir: due di akhir pekan, beban assignee >7 due di hari itu (B5), dan jumlah bobot >4 (kalau bobot dipakai).
7. **Filter:** assignee, status, due (telat / hari ini / ≤3 hari kerja / tanpa due), prioritas, list. State filter disimpan di URL.
8. **Cari:** nama, kode, deskripsi, ID lama. URL `app.clickup.com/t/<id>` yang ditempel langsung dibuka ke tugasnya.
9. **Notifikasi:** daftar, tandai dibaca. Realtime lewat RLS, penerima = diri sendiri.
10. **Admin (owner):**
    - Anggota: tambah, nonaktifkan, peran, reset password, keluarkan semua sesi.
    - **Token API**: buat (plaintext tampil sekali), cabut, terakhir dipakai, scope.
    - Status per list, hari libur, **tempat sampah** (pulihkan), status impor/cermin (hitungan per list dibanding ClickUp).
11. **Header keamanan (`.htaccess`):**
    - CSP: `default-src 'none'; script-src 'self'; connect-src https://<ref>.supabase.co wss://<ref>.supabase.co; img-src 'self' blob: data: https://<ref>.supabase.co; frame-ancestors 'none'`
    - `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (supaya signed URL tidak bocor lewat referer), HSTS, `nosniff`.
    - Markdown dirender dengan `html:false` + DOMPurify.

---

## 4. Endpoint API

**Transport:** `POST {TUGAS_API_URL}/rest/v1/rpc/<fungsi>`. Header: `apikey: <publishable>`, `x-rhj-token: rhjt_<43 karakter base64url>`, dan opsional `x-rhj-idem: <uuid>`. Semua request POST, karena GET RPC di PostgREST berjalan read-only dan tidak bisa mencatat `terakhir_dipakai`. Error dikirim lewat `raise sqlstate 'PT4xx'`, sehingga status HTTP-nya 401/403/404/409 dengan body `{code,message}`.

| Path logis | Fungsi RPC | Scope | Padanan clickup.mjs | Respons |
|---|---|---|---|---|
| GET /whoami | `api_whoami()` | baca | `whoami` | `{user:{id,username,email}, workspaces:[{id:"1100340000004525",name,members}]}` |
| GET /lists/{id}/tasks | `api_tasks(list, closed, full)` | baca | `tasks <list> [--closed] [--full]` | `brief[]` / bentuk mentah |
| GET /folders/{id}/tasks | `api_folder_tasks(folder, closed)` | baca | `folder-tasks` | `brief[]` |
| GET /tasks/{id} | `api_task(id)` | baca | `task` | JSON kompatibel ClickUp (lihat di bawah) |
| GET /tasks/{id}/comments | `api_comments(id, replies)` | baca | `comments [--replies]` | `[{id,user,date,text,reply_count,replies?}]`, **semua** komentar, terbaru dulu |
| GET /agenda | `api_agenda(folder='1100340000026652', hours=26, all_comments, desc)` | baca | `agenda` | identik L202-206 |
| POST /lists/{id}/tasks | `api_create(list, body)` | tulis | `create` | `brief` |
| PATCH /tasks/{id} | `api_update(id, body)` | tulis | `update` | `brief` |
| POST /tasks/{id}/comments | `api_comment(id, text, induk, notify)` | tulis | `comment` | `{id, hist_id, date}` |
| PUT /tasks/{id}/list/{list} | `api_move(id, list)` | tulis | `move` | `brief` |
| DELETE /tasks/{id} | `api_delete(id)` | **hapus + peran owner** | `delete --yes` | `{deleted:id}` (soft delete) |
| GET /tasks/{id}/activity | `api_activity(id)` | baca | baru | `[{waktu,aktor,sumber,token,jenis,dari,ke,diimpor}]` |
| GET /search | `api_search(q, space?)` | baca | baru (M6 cek duplikat) | `brief[]` |
| GET /resolve/{x} | `api_resolve(x)` | baca | baru | `{jenis,id}` dari ID lama/URL |
| GET /lists/{id}/fields | `api_fields(list)` | baca | `fields` | `[]` |
| GET unduh | Edge `unduh?id&exp&sig` | tanpa token (HMAC berumur) | `attachments[].url` | stream file, `Content-Disposition: attachment`, `no-store` |

**Aturan format (disalin dari `clickup.mjs`):**
- `due` = `YYYY-MM-DD` WIB. `updated`, `closed` dan `comments[].date` = ISO UTC dengan milidetik dan `Z`, sama seperti `toISOString()`.
- `status` = nama status (huruf kecil). `assignees` = username (fallback email). `list` = nama list. `url` = `https://<app>/t/<id>`.
- `replies` **tidak muncul** (bukan `[]`) kalau `reply_count=0` atau tanpa `--replies`.
- `api_task` menghasilkan key ClickUp:
  - `id, name, text_content, description, markdown_description`
  - `status{status,type,color,orderindex}`
  - `date_created/updated/closed/done` (string ms)
  - `due_date` (string ms, 12:00 WIB), `due_date_time:false`, `start_date`
  - `creator`, `assignees[{id,username,email}]` (id = ID ClickUp lama kalau ada)
  - `priority{id,priority:"urgent|high|normal|low"}`
  - `list`, `folder{hidden}`, `space`, `parent`, `archived`, `url`
  - `attachments[{id,title,url,size,extension,mimetype,date}]`, dengan `url` = tautan `unduh` yang ditandatangani HMAC dan berlaku 1 jam, sehingga routine bisa mengunduh dengan curl biasa
  - `custom_fields:[]`
  - Tambahan aditif: `bobot`, `menunggu_keputusan`, `clickup_id`.
- `api_update` menerima body ber-key ClickUp (`name, markdown_description, status, due_date|null, priority, assignees{add,rem}`). Assignee boleh berupa ID lama numerik, uuid, email, atau username. Peringatan B5 dikirim di field `_peringatan` dan dicetak CLI ke stderr, sehingga stdout tetap identik.

---

## 5. Desain `tugas.mjs`

- **Perintah:** sama persis dengan `clickup.mjs`: `whoami`, `tasks`, `folder-tasks`, `task`, `comments`, `agenda`, `create`, `update`, `comment`, `move`, `delete --yes`, `fields`. Ditambah `activity <id>`, `search "<q>"`, `resolve <id|url>`, `download <lampiran_id> --out <file>`. `audit-free` dihapus.
- **Parser argumen:** fungsi parser disalin verbatim (L73-80), sehingga perilaku flag tanpa nilai dan `--due none` sama.
- **Assignee:** **tanpa** `Number()`, karena string diteruskan apa adanya ke server.
- **Output:** `console.log(JSON.stringify(x,null,2))`. Dry-run: `{dry_run:true, method, task, body}`; untuk move: `{dry_run, method:"PUT", url}`.
- **Env:** `TUGAS_API_URL`, `TUGAS_API_KEY` (publishable), `TUGAS_API_TOKEN`. File `tools/.env` juga dibaca, seperti clickup.mjs (sudah di-gitignore).
- **Error:** `tugas: GAGAL -> <fungsi> -> HTTP 401: token tidak sah` ke stderr dengan exit 1. Token **tidak pernah** dicetak. Token kosong menghasilkan pesan yang sejajar dengan pesan lama, supaya penanganan "tak terbaca" di routine tetap jalan.
- **Retry:** 3 kali untuk 5xx atau error jaringan, dengan backoff. `create`/`comment` mengirim `x-rhj-idem` (uuid per invocation), sehingga retry tidak membuat kartu atau komentar ganda.
- **Cutover tanpa mengedit 6 prompt UI:** isi `tools/clickup.mjs` diganti shim satu baris ke `tugas.mjs`. Nama file, izin `Bash(node tools/clickup.mjs:*)` di `.claude/settings.json` dan aturan C di prompt UI tetap berlaku. Rollback cukup dengan mengembalikan file itu. Perubahannya dikerjakan di sesi CMO, bukan dari repo ini.
- **Tes kontrak:** `test/diff.mjs` menjalankan `clickup.mjs` dan `tugas.mjs` bersamaan pada kartu yang sama (folder-tasks, tasks 65694/65696, task, comments --replies, agenda). Yang dinormalisasi hanya `url`, `attachments[].url`, dan key aditif. Selisih lain menghalangi cutover. Kartu dengan lebih dari 25 komentar ditandai sebagai "selisih disengaja", karena ClickUp terpotong di 25.

---

## 6. Rencana migrasi

**Aturan umum:**
- Klien HTTP importer **hanya mengizinkan GET**. Ini penjamin kode bahwa ClickUp tidak diubah.
- Throttle 670 ms (≈90/menit, di bawah batas 100/menit).
- Log hanya berisi hitungan, tanpa nama pelanggan. Dump mentah tidak pernah masuk repo.

**Urutan:**
0. **Sensus (baca saja):**
   - hierarki `archived=false` dan `true`
   - status per list
   - anggota dan email (`/list/{id}/member`)
   - task open+closed+subtask+arsip
   - komentar dengan paginasi `start`+`start_id` sampai habis, dan balasannya
   - lampiran task dan komentar (bentuk lampiran di rich `comment[]` dicek dari data nyata)
   - probe 1× `time_in_status`
   - uji 1 URL lampiran dengan curl tanpa auth (setting Private Attachment Links)

   Hasilnya: tabel hitungan per list. Perkiraan beban: ≥ ~430 request (198 detail task + 198 halaman komentar pertama + halaman list dan hierarki, dengan dasar 198 task per 23/9), jadi ≥ ~5 menit. Balasan dan halaman komentar lanjutan belum dihitung.
1. **Anggota:** 9 akun dibuat owner lewat admin API (email dikonfirmasi, tanpa email keluar). `username` diambil verbatim dari ClickUp. Akun bot "Claude" dibuat dengan peran `bot` dan tidak bisa login UI (K5).
2. **Hierarki:** space, folder (termasuk hidden `1100340000063830`), list (arsip diberi flag), status beserta tipenya. "complete" wajib bertipe closed.
3. **Tugas:** upsert berdasarkan `id`.

   | Field ClickUp | Field baru |
   |---|---|
   | `markdown_description` | `deskripsi_md` (kosong atau sync-block diberi flag `deskripsi_tak_terbaca`) |
   | `due_date` | `wibDate()` (+7 jam) |
   | `start_date` | `mulai` |
   | `priority.id` | 1–4 |
   | `creator` | `dibuat_oleh` |
   | `date_*` | timestamptz |
   | `parent` | `parent_id` |
   | objek mentah | `impor_meta` |

   Teruji: due yang tersimpan 00:00 WIB tidak mundur sehari.
4. **Komentar + balasan:** upsert berdasarkan id ClickUp. `comment_text` masuk ke `isi_teks`, rich text ke `isi_md`, dan `type:"tag"` ke `mention`.
5. **Lampiran (task, komentar, balasan; termasuk docx/csv):**
   - Diunduh, di-sha256, lalu diunggah ke bucket private. `clickup_url` tetap disimpan.
   - Kalau gagal, diberi `status_salin='gagal'` dan tautannya dipertahankan.
   - Volume yang diketahui: 65 file, 16,1 MB (audit 23/9, lampiran task saja). Ditambah Storage ERP 68,6 MB, jumlahnya ≈85 MB dari kuota org 1 GB. Lampiran komentar belum dihitung.
6. **Riwayat:**
   - Yang **bisa** dibuat: `dibuat` (waktu + pembuat) dan `ditutup` (waktu `date_closed`/`date_done`, aktor tak diketahui). Keduanya `diimpor=true`.
   - Yang **tidak bisa:** transisi status lama, buka-ulang lama, perubahan due atau assignee lama. Tidak ada endpoint riwayat publik. `time_in_status` hanya berisi total menit dan ditolak paket (OTAK-MM L132). Kalau ternyata tersedia, totalnya disimpan di `impor_meta`, tanpa mengarang event.
7. **Verifikasi (syarat lulus 100%):** per list, jumlah tugas open/closed, komentar, balasan, lampiran dan byte harus **sama** dengan sensus. Ditambah tes diff CLI (bagian 5) dan cek acak 10 kartu secara manual oleh Hannes.

**Idempotensi:**
- Semua langkah memakai upsert berdasarkan ID lama, dicatat di `impor_run`, dan bisa diulang.
- Importer **tidak pernah menghapus**. Kartu yang hilang dari ClickUp diberi `hilang_di_sumber_pada`.
- Komentar yang berubah di ClickUp diperbarui dan dicatat sebagai `komentar_edit` dengan sumber impor.

**Masa paralel 1–2 minggu (mode cermin):**
- `pengaturan.mode='cermin'`: trigger menolak perubahan pada baris `sumber='clickup'` kecuali dari `rhj_importir`. Banner di UI berbunyi "Mode cermin, ubah di ClickUp".
- Uji tulis dilakukan di Space "Uji Coba" (sumber app).
- Impor ulang penuh tiap malam (GitHub Actions, manual atau terjadwal).
- Tim memakai aplikasi untuk membaca dan mencoba. Routine diuji di sesi manual dengan env TUGAS_*.

**Sinkron akhir dan cutover (ACC Hannes):**
1. Pengumuman freeze ClickUp (misalnya 30–60 menit).
2. Impor ulang **penuh**, bukan delta. Delta tidak aman karena belum terverifikasi apakah komentar menaikkan `date_updated`.
3. Verifikasi 100%.
4. `mode='utama'`, token routine diterbitkan, `rhj_importir` dibuat NOLOGIN.
5. Shim clickup.mjs dipasang di sesi CMO.
6. `CLICKUP_API_TOKEN` dicabut dari GitHub Secrets.

**Rollback:**
- ClickUp tidak diubah dan akunnya tidak ditutup selama ≥30 hari.
- Kalau harus mundur: shim dikembalikan (satu file). Perubahan di aplikasi sejak cutover diekspor dari `aktivitas` dan `komentar` (sumber ≠ impor) sebagai daftar untuk dimasukkan ulang manual ke ClickUp.

---

## 7. Tahapan dan perkiraan

Dasarnya dugaan dari ukuran lingkup, bukan data kecepatan historis. Asumsi: 1 sesi = satu sesi kerja agent terfokus, keputusan Hannes datang tepat waktu, dan lingkup tidak bertambah.

| Tahap | Isi | Perkiraan |
|---|---|---|
| T0 | Keputusan K1–K12, akun dan secrets (Hannes) | bergantung Hannes; agent 0,5 sesi |
| T1 | Migrasi SQL bernomor (`db/NN-*.sql`), RLS, trigger, tes matriks peran di PG16 lokal (stub `auth`), lalu project, lalu `get_advisors` | 1–2 sesi |
| T2 | Fungsi `api_*`, `tugas.mjs`, harness diff | 1–2 sesi |
| T3 | Sensus, importer, impor pertama, verifikasi hitungan (perlu `CLICKUP_API_TOKEN`) | 1–2 sesi |
| T4 | UI: Masuk, Tugas Saya, List, Board, Detail, filter, cari, notifikasi, Admin | 3–5 sesi |
| T5 | Edge `unduh`, backup + uji restore, header, deploy | 1 sesi |
| T6 | Paralel 1–2 minggu kalender, perbaikan | 1–2 sesi agent |
| T7 | Cutover, serah terima, daftar perubahan rhj-brain | 1 sesi |
| **Total agent** | | **≈9–15 sesi** |

Data nyata baru masuk (T3) sesudah RLS teruji (T1). Tanpa project dev untuk tugas, setiap migrasi didahului pg_dump, diuji di PG16 lokal, lalu dijalankan dalam `BEGIN…COMMIT`.

---

## 8. Keputusan yang wajib ditanyakan ke Hannes

| # | Keputusan | Opsi | Rekomendasi |
|---|---|---|---|
| K1 | Project Supabase | (a) pause ERP dev Rp0 · (b) numpang ERP prod Rp0 · (c) org Pro baru Rp449.619/bulan · (d) upgrade org Rp809.314/bulan | **(c)** kalau ERP dev masih aktif dikembangkan (berkas 75/84 "belum ke produksi"; quotes/customers belum ada di prod). **(a)** kalau ERP dev boleh berhenti. **Jangan (b).** |
| K2 | Hosting dan domain | Hostinger subdomain · Cloudflare · Netlify | Hostinger (pola ERP, header lewat `.htaccess`). Domain/subdomain dipilih Hannes. |
| K3 | Login | Google OAuth · password dibuat owner · magic link + SMTP sendiri | Google + cadangan password. Signup dimatikan. |
| K4 | Email login Michael (`michael@rodahammerindo.com` vs `eppy.michael@gmail.com`) dan Rengga (`luckyrengga1@gmail.com`, belum terverifikasi) | — | Konfirmasi sebelum T3. |
| K5 | Identitas agent | Token milik Hannes · user bot "Claude" | **Bot.** Konsekuensinya komentar agent tidak lagi tercatat sebagai "hannes lowan". Ini memperbaiki salah-baca "Hannes sudah menjawab" (laporan routine #9). |
| K6 | Visibilitas | Semua anggota lihat semua space · per-space | Per-space (tabel sudah ada). Nilai awal disamakan dengan akses ClickUp sekarang, yang diverifikasi saat sensus. |
| K7 | Masa paralel | Cermin baca · input ganda | **Cermin.** Input ganda berarti tulisan di aplikasi hilang saat sinkron akhir. |
| K8 | Hapus | Permanen · soft + tempat sampah | Soft delete, dan hapus permanen hanya owner lewat tempat sampah. |
| K9 | Field tambahan | `bobot` 1–3 (B5), `menunggu_keputusan`, `mulai`, `hari_libur` | Semuanya dipakai (kecil, dan membuat aturan B5/B10 bisa dihitung). |
| K10 | Skema token | 1 token routine (baca) + 1 token sesi CMO (tulis, bot) · token per routine | 2 token dulu. Kedaluwarsa 180 hari, rotasi oleh owner. |
| K11 | Tujuan backup | Artifact GitHub terenkripsi · repo backup private · Google Drive | Artifact GitHub + `age`. Retensi ditetapkan sesudah ukuran dump run pertama diketahui. |
| K12 | Routine saat cutover | Shim `clickup.mjs` · ganti ke `tugas.mjs` + edit 6 prompt UI | **Shim.** Nol edit prompt, rollback cukup satu file. |

---

## 9. Risiko utama dan mitigasi

| # | Risiko | Mitigasi |
|---|---|---|
| R1 | XSS dari markdown/komentar (termasuk isi impor) mencuri sesi di localStorage | `html:false` + DOMPurify, CSP `script-src 'self'`, tanpa CDN runtime, lampiran SVG/HTML ditolak, unduh selalu `attachment` |
| R2 | RLS atau grant salah sehingga data bocor ke anon | Tidak ada grant tabel ke anon. Tes matriks otomatis (anon, bukan anggota, nonaktif, member, owner, token baca/tulis/dicabut/kedaluwarsa) di tiap migrasi. `get_advisors`. Curl publik ke tiap tabel harus kosong/401. |
| R3 | Token bocor (log, commit, chat) | Hanya hash tersimpan, plaintext tampil sekali, prefix `rhjt_` untuk secret scanning GitHub, scope minimal (routine = baca), cabut instan tanpa cache, CLI tidak pernah mencetak token |
| R4 | Tulisan hilang di masa paralel | Mode cermin mengunci baris impor. Importer tidak menghapus. Sinkron akhir = impor penuh + verifikasi 100%. |
| R5 | Impor tidak lengkap (25 komentar, arsip, subtask, folder hidden, lampiran komentar) | Sensus dulu, paginasi `start`/`start_id`, `archived` true+false, hitungan per list harus sama, tes diff CLI |
| R6 | Due bergeser sehari atau format waktu berubah | `wibDate` yang sama dengan clickup.mjs, tes tepi 00:00 WIB, output `updated`/`date` tetap ISO UTC |
| R7 | Free tanpa backup, project bisa di-pause | pg_dump **17** harian + Storage, dienkripsi, uji restore bulanan ke PG lokal. Routine harian dan job backup menjaga project tetap aktif (pause terjadi sesudah 7 hari sepi). |
| R8 | Riwayat dipalsukan | Hanya trigger yang menulis. Pelaku dari JWT/token, bukan body. Append-only + revoke + rantai hash + jangkar di backup. Sisa risiko: superuser `postgres` (dashboard/MCP) bisa mengubah, tapi terdeteksi. |
| R9 | Routine putus saat cutover (prompt UI, izin, env, jaringan) | Shim nama sama, tes routine manual dengan env TUGAS_* selama paralel, cek allowlist jaringan `*.supabase.co` di env "Marketing" |
| R10 | Akses orang keluar tetap hidup (Peter kontrak habis 15 Okt menurut laporan pagar) | Prosedur offboarding: `aktif=false` (RLS langsung menolak), cabut token, keluarkan semua sesi |
| R11 | Signup Google terbuka untuk siapa saja | Signup dimatikan dan akun dibuat owner. RLS tetap mensyaratkan baris `anggota` aktif. Uji penautan identitas Google ke akun yang sudah dibuat di T1. |
| R12 | Kuota org dipakai bersama ERP (opsi a: Storage 1 GB, egress 5 GB) | Pantau pemakaian di Admin. Batas 25 MB/file. Egress per `agenda` belum diukur, jadi diukur saat paralel. |
| R13 | Lampiran ClickUp saat ini bisa dibuka tanpa login (default Private Attachment Links OFF; perlu dicek saat sensus) | Salin semua lampiran ke bucket private. Sesudah cutover, usulkan Hannes menyalakan setting itu. Itu perubahan di ClickUp, jadi perlu ACC dan baru dilakukan sesudah pindah. |
| R14 | Service key di Edge `unduh` | Fungsi hanya membaca `lampiran/` sesudah HMAC dan `exp` valid serta lampiran tidak terhapus. Kunci HMAC ada di Vault + secret fungsi dan bisa dirotasi. |

Tidak ada file yang saya ubah. Yang saya baca di luar laporan pembaca: `/home/user/rhj-tugas/{README,BACKLOG}.md`, `/home/user/rhj-brain/tools/clickup.mjs`, `/home/user/rhj-brain/deliverables/PROMPT-SESI-BARU-APP-TUGAS-29Sep.md`, `/home/user/RHJ-Website/index.html` (pola auth, storage, CSP), `/home/user/RHJ-Website/db/75-*.sql`, `84-*.sql`, dan `infodb.md`.