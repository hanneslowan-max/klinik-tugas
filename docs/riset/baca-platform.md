Untuk kebutuhan bisnis, kombinasi gratis yang legal: **frontend di subdomain hosting Hostinger yang sudah dibayar** (atau Cloudflare Workers Free) **+ Supabase Free**. Kendalanya, slot project Supabase gratis Hannes sudah habis. Pilihannya: pause project dev ERP, numpang schema di ERP produksi, atau bayar Pro. Detail per bagian di bawah. Kurs untuk konversi Rp: 1 USD = Rp17.984,77 (open.er-api.com, 29 Sep 2026 00:02 UTC).

---

## A. Supabase Free (terverifikasi dari docs resmi, diakses 29/9)

- **Batas project dihitung per USER, bukan per org.** "The project limit applies across all organizations where you are an Owner or Administrator." Dalam satu org, kuota semua Owner/Admin ikut dihitung. Project yang di-pause tidak dihitung. Hannes sudah 2 aktif, jadi project gratis ke-3 tidak bisa dibuat di org mana pun selama ia Owner/Admin di sana. Sumber: https://supabase.com/docs/guides/platform/billing-on-supabase dan https://supabase.com/docs/guides/platform/billing-faq
- **Kuota dipakai bersama satu org** ("The quota is applied to your entire organization"). Yang per project hanya ukuran DB. Artinya project baru di org yang sama tidak menambah egress atau storage. Sumber sama.
  - DB 500 MB per project (shared CPU, RAM 500 MB)
  - Storage 1 GB per org
  - Ukuran file maksimal 50 MB (https://supabase.com/docs/guides/storage/uploads/file-limits)
  - Egress 5 GB + cached egress 5 GB
  - Edge Function 500.000 invocation/bulan, maksimal 100 fungsi per project, wall clock 150 detik, CPU 2 detik (https://supabase.com/docs/guides/functions/limits)
  - MAU 50.000
  - Realtime 200 koneksi dan 2 juta pesan
  - Log 1 hari, audit auth 1 jam (https://supabase.com/pricing)
- **SMTP bawaan: 2 email/jam, hanya ke alamat anggota tim org Supabase**, tanpa SLA dan "not meant for production". Dengan SMTP sendiri, batas awalnya 30/jam dan bisa diubah (https://supabase.com/docs/guides/auth/auth-smtp). Untuk 9 anggota, pilih salah satu:
  - owner membuat akun dengan password lewat admin API, jadi tidak perlu email;
  - pakai SMTP sendiri.
- **Pause:** project Free di-pause kalau aktivitas rendah selama 7 hari, dengan email peringatan sekitar seminggu sebelumnya. Project bisa di-restore sampai 90 hari; lewat dari itu backup dan objek Storage hanya bisa diunduh (https://supabase.com/docs/guides/platform/free-project-pausing).
- **Backup:** tidak termasuk di Free ("Not included", halaman pricing). Docs menyarankan project Free rutin `supabase db dump` dan menyimpan backup di luar (https://supabase.com/docs/guides/platform/backups). Dugaan: backup harian internal hanya bisa diakses setelah upgrade, dan halaman troubleshooting menyebut ini bisa dihentikan.
- **HTML tidak bisa dilayani Supabase:**
  - Edge Function: GET yang mengembalikan `text/html` diubah jadi `text/plain`, kecuali pakai custom domain (add-on berbayar). Terverifikasi dari docs functions/limits dan functions/http-methods.
  - Storage: HTML dikirim sebagai `text/plain`. Sumbernya jawaban kolaborator Supabase (bukan docs resmi): https://github.com/orgs/supabase/discussions/39110 (Sep 2025).
  - Jadi frontend wajib di-host di tempat lain.
- **Pemakaian komersial:** docs billing, halaman pricing, dan ToS (https://supabase.com/terms) tidak memuat larangan komersial untuk Free. Izin eksplisit baru dari jawaban komunitas, jadi statusnya **dugaan kuat boleh**.
- **Akun tambahan untuk mengakali kuota:** AUP (update 1 Jun 2026) melarang "maintaining an excessive number of accounts as a single user" (https://supabase.com/aup). Membuat akun orang lain supaya dapat slot gratis = **area abu-abu, tidak disarankan**.
- **Harga Pro:** $25/org/bulan, sudah termasuk kredit compute $10 yang menutup 1 project Micro. Tiap project tambahan sekitar $10. Contoh resmi: 3 project = $45 (billing-faq).
  - Org Pro baru khusus tugas (1 project) = $25 ≈ **Rp449.619/bulan**
  - Upgrade org sekarang (3 project) = $45 ≈ **Rp809.314/bulan**

## B. Hosting frontend

- **Vercel Hobby: tidak legal untuk RHJ.** Kutipan: "Hobby teams are restricted to non-commercial personal use only… Commercial usage is defined as any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee…" (https://vercel.com/docs/limits/fair-use-guidelines, update 14 Sep 2026). Tool internal perusahaan yang dipakai karyawan bergaji masuk definisi ini (interpretasi saya). Pro $20/bulan ≈ **Rp359.695/bulan** (https://vercel.com/pricing).
- **Cloudflare Workers/Pages Free:**
  - Request ke aset statis "free and unlimited" (terverifikasi, https://developers.cloudflare.com/pages/functions/pricing/ dan https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
  - Functions/Worker: 100.000 request/hari, CPU 10 ms per request; lewat batas dapat 429 (https://developers.cloudflare.com/workers/platform/limits/, update 5 Sep 2026).
  - Pages: 500 build/bulan, 20.000 file, maksimal 25 MiB per file, 100 project (https://developers.cloudflare.com/pages/platform/limits/).
  - Komersial boleh: **dugaan kuat**. Sumbernya forum komunitas Cloudflare; saya tidak menemukan larangan di docs.
  - Tanpa kartu kredit: dugaan, belum ada pernyataan resmi yang ditemukan.
- **Netlify Free:** "On the Free plan, you can deploy commercial projects…" dan "no credit card required" (https://www.netlify.com/blog/introducing-netlify-free-plan/; tanggal post belum terverifikasi).
  - 300 kredit/bulan, batas keras (https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/, update 1 Sep 2026).
  - Tarif kredit: production deploy 15, bandwidth 20/GB, request 2 per 10 ribu. Deploy preview dan branch deploy gratis.
  - Hitungan saya: maksimal 20 production deploy/bulan (300 ÷ 15) kalau tidak ada pemakaian lain.
  - Kalau kredit habis, situs disuspend sampai akhir bulan. Personal $9 ≈ Rp161.863.
- **GitHub Pages: tidak cocok.**
  - Repo private butuh paket berbayar Pro/Team/Enterprise (docs.github.com, lewat hasil pencarian).
  - Situsnya tetap publik, kecuali Enterprise Cloud.
  - Dilarang "to run your online business… or SaaS" (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- **Temuan tambahan: ERP produksi (admin.palletmeshindonesia.com) jalan di Hostinger.** Header respon `platform: hostinger`, `panel: hpanel` (dicek 29/9). Hosting ini sudah dibayar, jadi subdomain baru kemungkinan **Rp0 tambahan** (kuota subdomain per paket belum terverifikasi). hPanel Git mendukung repo private lewat SSH deploy key dan auto-deploy webhook (https://docs.hostinger.com/websites/git, update 22 Jul 2026).

**Yang harus Hannes kerjakan sendiri:**
- **Cloudflare:**
  1. Daftar di dash.cloudflare.com.
  2. Buka Workers & Pages → Create → Import repository → GitHub.
  3. Install GitHub App "Cloudflare Workers and Pages", pilih "Only select repositories" → rhj-tugas. Kalau repo milik org GitHub, perlu Owner atau peran GitHub Apps Manager.
  4. Alternatif tanpa menyambung Git: buat API token Cloudflare dan berikan account ID, lalu deploy lewat wrangler.
  5. Opsional gerbang login tambahan: Cloudflare Zero Trust Free (maksimal 50 user). Menurut komunitas perlu metode pembayaran terdaftar (dugaan).
- **Vercel:** daftar dengan GitHub → Import Git Repository. Untuk repo akun pribadi harus Owner repo (https://vercel.com/docs/git/vercel-for-github). Wajib Pro, yang perlu kartu.
- **Netlify:** daftar tanpa kartu → Import from Git → otorisasi GitHub App → pilih repo.
- **Hostinger:**
  1. Buat subdomain.
  2. Buka Git → Generate SSH Key, tempel sebagai Deploy key di repo GitHub.
  3. Aktifkan Auto Deployment.

## C. ClickUp REST (baca saja)

- **Hierarki:**
  - `GET /team` → workspace dan anggota
  - `GET /team/{id}/space?archived=`
  - `GET /space/{id}/folder?archived=`
  - `GET /space/{id}/list?archived=` (list tanpa folder)
  - `GET /folder/{id}/list?archived=`
  - Parameter `archived` berupa filter (https://developer.clickup.com/reference/getfolders), jadi migrasi perlu dipanggil dua kali: false dan true.
  - Folder punya field `hidden` di skema. Bagaimana perlakuannya belum didokumentasikan (dugaan).
- **Task per list:** `GET /list/{id}/task`, maksimal **100 per halaman**, `page` mulai 0, respon memuat `last_page`. Parameter yang tersedia (https://developer.clickup.com/reference/gettasks):
  - `include_closed` dan `subtasks` (default keduanya dikecualikan)
  - `archived`, `include_markdown_description`, `include_timl`
  - `order_by`, `date_updated_gt` (berguna untuk sinkron akhir)
- **Status per list:** `GET /list/{id}` → `statuses[]` (status, orderindex, color, type) dan `override_statuses` (terverifikasi).
- **Detail task:** `GET /task/{id}` dengan `include_markdown_description`, `include_subtasks`, `custom_task_ids` + `team_id`. Field yang tersedia: creator, date_created, date_updated, date_closed, date_done, archived, assignees, priority, due_date, parent, attachments[] (id, date, title, type, extension, mimetype, size, url), url. Docs yang terlampir tidak ikut (https://developer.clickup.com/reference/gettask).
- **Komentar:** `GET /task/{id}/comment` mengembalikan **25 terbaru**, urutan terbaru ke terlama. Halaman berikutnya pakai `start` (date ms) + `start_id` dari komentar terakhir, keduanya wajib. Tersedia `reply_count` (https://developer.clickup.com/reference/gettaskcomments).
  - Temuan: `getComments` di `/home/user/rhj-brain/tools/clickup.mjs` tidak melakukan paginasi, jadi hanya 25 komentar terbaru. Selain itu hierarki hanya diambil dengan `archived=false`. Skrip migrasi harus menangani keduanya.
- **Balasan thread:** `GET /comment/{id}/reply`, komentar induk tidak ikut. Paginasi dan urutan tidak didokumentasikan (https://developer.clickup.com/reference/getthreadedcomments).
- **Rich text komentar:** `comment[]` berisi text + attributes. Mention berbentuk `type:"tag"` dengan objek user, emoji berbentuk `type:"emoticon"` (https://developer.clickup.com/docs/comment-formatting, update 26 Nov 2025). Bentuk lampiran di dalam komentar tidak didokumentasikan (dugaan: perlu dicek dari data nyata).
- **Anggota:** skema `GET /team` di docs tidak mencantumkan email (dugaan: respon nyata mungkin memuatnya). `GET /list/{id}/member` memuat email (terverifikasi di docs).
- **Riwayat:**
  - Tidak ada endpoint aktivitas/riwayat task yang publik. Ada permintaan fitur yang masih terbuka, dan komunitas melaporkan `/task/{id}/history` = 404 (https://feedback.clickup.com/public-api/p/api-20-get-task-activity-history).
  - Audit log v3 hanya untuk paket Enterprise.
  - `GET /task/{id}/time_in_status` dan bulk `GET /task/bulk_time_in_status/task_ids` (maksimal 100 id) mensyaratkan ClickApp "Total time in Status" diaktifkan owner/admin. Isinya hanya total menit per status + `since`, **tanpa timestamp tiap transisi**. Apakah ClickApp ini aktif di workspace RHJ: belum terverifikasi.
- **Lampiran:**
  - Setting "Private Attachment Links" default **OFF**. Dalam kondisi OFF, URL berupa string acak yang sulit ditebak dan bisa dibuka tanpa login. Kalau ON, harus login ke workspace (help.clickup.com artikel 29573846451991, lewat cuplikan pencarian; halamannya 403).
  - Perilaku unduh lewat token API saat setting ON: belum terverifikasi. Sebelum migrasi, uji 1 URL dengan curl tanpa auth.
  - Endpoint v3: `GET /api/v3/workspaces/{id}/{entity_type}/{entity_id}/attachments`.
- **Rate limit:** 100 request/menit per token untuk Free Forever, Unlimited, dan Business; 1.000 untuk Business Plus; 10.000 untuk Enterprise. Tanpa batas harian. Saat lewat batas dapat 429 dengan header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (https://developer.clickup.com/docs/rate-limits, update 17 Sep 2026).
- **Volume data** (dari `memori/PELAJARAN-PIC.md` entri 23/9, hasil `audit-free`):
  - 3 space, 11 list, 198 task (146 open, 52 closed)
  - 65 lampiran task, total 16,1 MB; lampiran di komentar tidak dihitung
  - 8 anggota
  - Sekitar 215 request selesai dalam 2 menit 28 detik tanpa 429

## D. Inspeksi ERP produksi hyjiuefqnsrofpebaydt (hanya SELECT katalog)

1. **Schema:** auth, extensions, graphql, graphql_public, public, realtime, storage, vault. Postgres 17.6.1.155, dibuat 21 Agu 2026.
2. **Trigger `auth.users`:** `on_auth_user_created AFTER INSERT … EXECUTE FUNCTION buat_profil_baru()`. Fungsi ini memasukkan setiap user baru ke `public.profiles` dengan peran `'pending'`, kecuali hanneslowan@gmail.com yang langsung jadi `'owner'`.
3. **Ukuran DB:** 16 MB (16.313.491 byte), sekitar 3% dari 500 MB.
4. **User auth:** 4. Peran di profiles: owner 1, gm 2, staff 1.
5. **Storage:** bucket `dokumen` (private, batas 25 MB per file) berisi 74 objek, 65 MB (68.583.444 byte), sekitar 6,4% dari 1 GB org. Pemakaian project dev belum dihitung.

Catatan tambahan:
- public berisi 13 tabel, semuanya RLS aktif.
- Semua policy SELECT dan INSERT memeriksa peran lewat `peran_saya()`. Peran `pending` tidak mendapat akses data ERP.
- Ekstensi terpasang: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp. pg_cron tidak terpasang.
- Tabel quotes/customers yang dirujuk migrasi dev 59–85 di repo RHJ-Website belum ada di produksi. Dugaan: dev lebih maju dan migrasinya akan dipromosikan ke produksi.

**Risiko kalau tugas numpang di ERP produksi:**
- 9 anggota tugas otomatis masuk ke profiles ERP sebagai `pending`, dan 4 user ERP otomatis bisa login ke app tugas. Konsekuensinya app tugas wajib punya tabel keanggotaan sendiri dan RLS-nya harus mengecek tabel itu.
- Konfigurasi Auth dipakai bersama: Site URL, daftar redirect, template email, SMTP.
- Schema `tugas` perlu ditambahkan ke Exposed schemas API. Ini perubahan konfigurasi di produksi, jadi perlu ACC.
- Kalau ada bug atau migrasi tugas yang salah, ERP ikut terdampak.
- Keuntungannya: DB masih longgar, dan pemakaian harian ERP ikut menjaga project tetap aktif.

---

## Opsi yang legal untuk bisnis

Frontend (pilih satu):
1. **Subdomain Hostinger yang sudah ada:** Rp0 tambahan (dugaan, tergantung paket). Hannes membuat subdomain dan menambahkan deploy key.
2. **Cloudflare Workers static assets:** Rp0. Hannes daftar dan meng-install GitHub App atau memberi API token. Status komersial boleh = dugaan kuat.
3. **Netlify Free:** Rp0, komersial boleh (terverifikasi). Batasnya sekitar 20 production deploy/bulan.

**Tidak legal gratis:** Vercel Hobby (Pro Rp359.695/bulan) dan GitHub Pages.

DB dan Auth (perlu ACC Hannes):
- **(a) Pause project `rhj-tacker.dev`, lalu buat project `rhj-tugas` Free di org yang sama:** Rp0. Kuota org tetap dibagi (egress 5 GB, storage 1 GB). ERP dev mati selama di-pause dan bisa di-restore sampai 90 hari; apakah restore nanti terblokir oleh batas 2 project masih dugaan.
- **(b) Schema `tugas` di ERP produksi:** Rp0, dengan risiko di bagian D.
- **(c) Org Pro terpisah:** $25 ≈ **Rp449.619/bulan**, tanpa pause dan dapat backup 7 hari.
- **(d) Upgrade org sekarang ke Pro dengan 3 project:** $45 ≈ **Rp809.314/bulan**.

Semua opsi Free tidak punya backup, jadi perlu `pg_dump` terjadwal sendiri. Login untuk 9 anggota: akun dibuat owner lewat admin API (tanpa email) atau pakai SMTP sendiri.