# Bot WA 0878 luar jam kerja (AI)

Keputusan Hannes 10 Nov 2026 (pop-up B24, LOG-PAGAR rhj-brain): bot membalas chat WA 0878 **di luar jam kerja**, AI
(model `claude-sonnet-5-5`) menyusun balasan dengan pagar, langsung kirim (tanpa mode bayangan), di Supabase Anvil skema
`wa`. Brief rhj-brain `deliverables/anvil/BRIEF-WA-BOT-AI.md`; rancangan `deliverables/growth/RANCANGAN-BOT-WA-0878-8Nov.md`;
acuan nada `deliverables/growth/BEBAN-WA-NASKAH-FASE2-21Okt.md` §3 Jalur B.

Migrasi `supabase/migrations/20261110180000_wa_bot.sql`, logika Edge `supabase/functions/api/wa.ts` (rute di `index.ts`),
kontrak `docs/KONTRAK-DB.md` §15, tes `uji/db/39_wa_bot.sql`, `uji/wa/jalankan.mjs`, `uji/wa/kontrak.mjs`.

**Mode uji (saklar `uji`, migrasi `20261111130000_wa_mode_uji.sql`, keputusan Hannes 11 Nov):** bot HANYA membalas nomor di
`wa.uji`, kapan saja (termasuk jam kerja; [HARI] tetap dihitung dari waktu kirim); nomor lain → batal `saklar_uji`. Jalur sama
dengan produksi (webhook, AI, validator, kirim Kapso), pemutus & jaga aktif. CLI: `wa uji --nomor 0812… [--catatan]`,
`wa uji` (lihat, nomor disamarkan), `wa uji --nomor … --hapus` (daftar kosong → saklar mati), `wa saklar uji`. Catatan: nomor uji
yang dichat sales < 24 jam terakhir tetap batal `chat_berjalan` (aturan sama).

**Saklar default `mati`.** Selama mati, semua logika jalan (antrean tercatat, lalu batal `saklar_mati`), tidak ada AI
dan tidak ada kiriman.

## Alur

```
Pelanggan → 0878 (HP sales + Kapso coexistence) → webhook Kapso (whatsapp.message.received / .sent)
  → POST /x/wa/webhook: X-Webhook-Signature (HMAC-SHA256 hex body mentah, KAPSO_WEBHOOK_SECRET) → 401 bila salah;
    X-Idempotency-Key + id pesan → tolak dobel; x_wa_webhook mencatat metadata (wa.log) + wa.antrean; 200 cepat.
    Isi pesan TIDAK ke DB: Edge hanya mengirim tanda pola (stop / tes / teks otomatis aplikasi HP).
  → pg_cron tiap menit: wa.picu('proses') → pg_net POST /x/wa/proses (Bearer TOKEN_WA_PROSES dari Vault),
    hanya bila ada antrean jatuh tempo
      x_wa_ambil (aturan DB) → per antrean: API pesan Kapso (≤ 20 pesan) → nilaiChat → Claude → validator → kirim Kapso
      → x_wa_hasil
  → pg_cron tiap 15 menit: wa.picu('jaga') → POST /x/wa/jaga → Telegram
  → pg_cron harian 02.41 WIB: wa.rawat() (retensi, langsung di DB)
```

## Aturan (dicek ulang saat jatuh tempo)

| Tahap | Aturan | Alasan di log |
|---|---|---|
| webhook | pesan jam kerja (Sen–Jum 08.00–17.00 WIB, bukan `hari_libur`) → tidak diantrekan | `jam_kerja` |
| webhook | nomor di `wa.diam` → diam | `daftar_diam:<alasan>` |
| webhook | pesan = stop / berhenti / unsubscribe / "jangan balas otomatis" → masuk `wa.diam` | `minta_berhenti` |
| webhook | hanya reaksi / stiker / pesan "tes" → diam (antrean lain tidak disentuh) | `reaksi` `stiker` `tes` |
| webhook | jatuh tempo = pesan pertama + 10 mnt (sudah ada pesan bot di periode: + 2 mnt); pesan beruntun dikumpulkan, jatuh tempo ≥ pesan terakhir + 2 mnt; pesan lebih tua datang terlambat → ikut | — |
| webhook | pesan keluar dari HP (`origin business_app`) sesudah pesan pertama → batal | `sales_membalas` |
| ambil | saklar `mati` | `saklar_mati` |
| ambil | sudah jam kerja (mis. 07.55 → 08.05) | `jam_kerja` |
| ambil | sales mengirim ≥ pesan pertama / < 24 jam sebelumnya (log webhook) | `sales_membalas` / `chat_berjalan` |
| ambil | > 24 jam sejak pesan pelanggan terakhir (aturan Meta) | `jendela_24jam` |
| ambil | ≥ 100 pesan bot dalam 24 jam (dan ≥ 100 per periode), dihitung sejak pesan sales terakhir (revisi Hannes 10 Nov malam; dulu 3/periode & 4/24 jam, migrasi `20261110220000_wa_batas_100.sql`) | `batas_periode` / `batas_24jam` |
| cek ulang API | pesan keluar manusia di API pesan Kapso (bukan id bot, bukan pesan lama berakhiran "(pesan otomatis)", bukan teks otomatis aplikasi "Terima kasih telah/sudah menghubungi…") | `sales_membalas` / `chat_berjalan` |
| cek ulang API | pesan pelanggan periode ini cocok `wa.kata_manusia` (regex, tanpa beda huruf) | diam `manusia_saja` |
| cek ulang API | lawan tampak balasan otomatis: ≥ 3 pesan masuk ber-teks identik dalam 24 jam, atau ≥ 3 kali pesan masuk < 5 detik sesudah pesan bot → masuk `wa.diam` (alasan `lain`) | diam `auto_reply` |
| cek ulang API | API belum memuat pesan pelanggan (coexistence terlambat) → coba lagi 2 mnt, maks 3 kali | `tunda` → `tunda_habis` |
| AI | `kirim=false`, refusal, terpotong, JSON tidak sah → diam; 429/5xx → tunda; 4xx → gagal | `ai_*` |
| validator | lihat di bawah → TIDAK dikirim, teks bot disimpan untuk QA, peringatan | `validator: <aturan>` |
| kirim | Kapso 429/5xx/jaringan → ulang (maks 3 percobaan, jeda Retry-After ≤ 5 dtk / 1–2 dtk) → gagal | `kapso_<status>_<kode> (3x)` |

Periode luar jam = sampai jam buka hari kerja berikutnya (kunci `periode` = tanggal hari kerja itu).
`[HARI]` diisi server (`wa.label_hari`): sebelum 08.00 hari kerja → "pagi ini mulai jam 08.00"; hari kerja sesudah 17.00 dan
besok hari kerja → "besok pagi"; selain itu (Jumat malam s/d Minggu, malam sebelum libur, hari libur) → "<Hari> pagi";
hari kerja berikutnya ≥ 7 hari lagi → "<Hari> <tgl> <Bulan> pagi".

**Pemutus otomatis:** validator menolak ≥ 3 kali per hari WIB atau kirim gagal ≥ 5 kali per jam → saklar `mati`
(alasan `pemutus`) + peringatan. Menyalakan lagi hanya manual (`wa saklar kirim`).

## Claude

`POST /v1/messages` (`anthropic-version: 2026-10-21`, `x-api-key` = `ANTHROPIC_API_KEY_WA`), `model` dari
`wa.pengaturan` (default `claude-sonnet-5-5`), `max_tokens` 400, `thinking: {type: "between_tools"}` (thinking mati supaya
400 token cukup), `output_config: {effort: "low", format: {type: "json_schema", schema: {kirim, teks, alasan}}}`. Tanpa alat,
tanpa data lain. Prompt sistem: `promptSistem()` di `wa.ts` = aturan tetap di kode (peran, tujuan, larangan, bentuk) +
FAKTA TERKUNCI dan CONTOH BALASAN dari tabel `wa.pengetahuan` (keputusan Hannes 11 Nov: bisa diubah tanpa deploy; tabel
kosong/gagal dibaca → `FAKTA_BAKU` di kode). Ubah lewat CLI rhj-brain: `node tools/tugas.mjs wa pengetahuan`,
`wa fakta --teks "…" [--id n] [--nonaktif|--aktif] [--urutan n]`, `wa contoh --situasi "…" --teks "…" [--id n] [--nonaktif]`;
teks dicek validator bot (harga, janji, tautan, nomor, dst.) sebelum disimpan. Berlaku di panggilan AI berikutnya. Transkrip
≤ 20 pesan terakhir (teks; foto/voice/video/dokumen → label; referral iklan Meta → "[datang dari iklan: …]") dibungkus
`<data_chat>` sebagai data; tag penutup palsu di isi chat dinetralkan.

**Validator** (`periksaTeks`, sesudah `[HARI]` diisi): `Rp`/IDR/rupiah, angka berformat harga (1.250.000, 900 ribu, 2 jt;
angka bertitik yang menempel satuan ukur mm/cm/m/kg/ton/inch/" atau "x" = ukuran, lolos: "1.200 x 1.000 mm", "1.000 kg"),
diskon/potongan/promo/cashback/nego, `http`/`www`/domain, "distributor", "galvanis", "custom" dekat "lemari" (kecuali
"tidak (bisa) custom" di kalimat itu), teflon /
scaffolding / pintu geser / pagar dalam kalimat tanpa penolakan (tidak/belum/bukan), nomor telepon, email, rekening/bank,
janji stok (ready, stok ada, "tersedia" tanpa "tidak/tdk/tak"; "belum tersedia" ditolak), janji kirim/tanggal (dicek
SESUDAH label `[HARI]` dibuang, jadi "membalas besok pagi, … kota pengiriman?" / "Senin 17 November pagi" lolos), > 700 karakter,
sisa placeholder `[…]`.

**Tanpa penanda, perkenalan di balasan pertama (Hannes 11 Nov):** baris "(pesan otomatis)" DIHAPUS (bila AI masih menulisnya,
server membuangnya). Balasan bot PERTAMA per chat (belum ada pesan bot di riwayat Kapso dan tidak ada id bot di `wa.log` 30 hari)
wajib memperkenalkan diri sebagai asisten RHJ di luar jam kerja; AI lupa → server menambah baris "Saya asisten RHJ di luar jam
kerja." di depan (tidak ditolak, supaya pemutus tidak terpicu). Balasan berikutnya tanpa perkenalan. Pesan bot dikenali dari id
pesan yang tercatat (penanda lama tetap dikenali untuk pesan lama).

## Data (skema `wa`, RLS ON, tanpa hak tabel/skema untuk role API)

- `wa.pengaturan` (satu baris): saklar, model, batas, jam kerja, ambang pemutus, harga token, `kunci_hash` (acak, untuk
  HMAC nomor; tidak pernah dikembalikan).
- `wa.antrean`: nomor (untuk membalas), id percakapan Kapso, waktu, jatuh tempo, status. Dihapus > 7 hari.
- `wa.log`: metadata (id pesan, waktu, nomor_hash HMAC, arah, jenis, keputusan + alasan, periode, panjang teks, token,
  biaya USD, model) + teks balasan BOT. Tanpa isi chat pelanggan. Dihapus > 90 hari.
- `wa.diam` (nomor, alasan internal|pemasok|ekspedisi|minta_berhenti|lain), `wa.kata_manusia` (pola, aktif; **isi awal
  kosong**, diisi lewat migrasi data sesudah ACC Hannes), `wa.kejadian` (kunci idem, 7 hari), `wa.peringatan`
  (3 jam per masalah), `wa.detak` (webhook/proses/jaga terakhir).

## Jaga → Telegram

Aktif bila saklar `kirim` atau mati karena pemutus (dimatikan manual = diam). Masalah: chat luar jam > 20 menit tanpa
balasan (`macet`), kirim gagal / validator menolak (15 menit terakhir), webhook Kapso ke `/x/wa/webhook` tidak ada / tidak
aktif (`GET /platform/v1/whatsapp/phone_numbers/{id}/webhooks`), tidak ada webhook masuk > 3 jam padahal API pesan mencatat
pesan masuk baru, pemutus. Ke Hannes (`TELEGRAM_CHAT_HANNES`). Mati karena pemutus ≥ 1 jam di Sabtu/Minggu → juga grup
marketing (`TELEGRAM_CHAT_MARKETING`) format URGENT B22 (baris 1 `URGENT · Bot WA`, ≤ 6 baris, tanpa nomor/nama
pelanggan). Satu masalah = satu pesan per 3 jam.

## Halaman web Bot WA (owner)

Menu **Bot WA** (`/bot-wa`, khusus owner; keputusan Hannes 11 Nov 2026), tiga tab:
- **Ringkasan**: saklar (nyalakan/matikan dengan konfirmasi yang mengingatkan A2 di HP), chat masuk / terkirim / ditolak /
  gagal, biaya AI, antrean, daftar diam, detak webhook/proses/jaga, alasan bot tidak membalas terbanyak.
- **Keputusan**: daftar keputusan terbaru (saringan keputusan, muat lagi) dengan teks balasan bot lengkap, alasan, token/biaya,
  8 karakter hash nomor untuk mengelompokkan satu chat, tombol salin id percakapan Kapso.
- **Pengetahuan**: fakta terkunci & contoh balasan (tambah, ubah, aktifkan/nonaktifkan), disimpan lewat Edge
  `/x/admin/wa-pengetahuan` (validator bot; ditolak → pesan alasan).

Halaman TIDAK menampilkan isi chat pelanggan atau nomor telepon (memang tidak disimpan). Isi chat lengkap: HP 0878 atau
inbox Kapso (tombol "Inbox Kapso" → `https://inbox.kapso.ai`; dokumentasi Kapso tidak memuat format tautan per percakapan,
jadi id percakapan disalin lalu dicari di inbox). Data: `web_wa_ringkas`, `web_wa_log`, `web_wa_saklar`,
`web_wa_pengetahuan_daftar` (migrasi `20261111120000_wa_web.sql`, KONTRAK-DB §15).

## Deploy (sesi rhj-brain, sesudah ACC Hannes)

1. Merge PR. Migrasi `20261110180000_wa_bot.sql` lewat `alat/sql-proyek.sh --migrasi` (memasang `pg_net`, `pg_cron`, skema
   `wa`, 3 job cron). Cek: `select jobname, schedule from cron.job` → `wa-proses`, `wa-jaga`, `wa-rawat`;
   `select saklar from wa.pengaturan` → `mati`.
2. Secret Edge (`supabase secrets set …`, nilai tidak ke log/commit): `KAPSO_API_KEY`, `KAPSO_WEBHOOK_SECRET` (acak ≥ 32
   karakter, dibuat sendiri), `ANTHROPIC_API_KEY_WA` (kunci khusus bot dengan batas belanja bulanan), `TOKEN_WA_PROSES`
   (acak ≥ 32 karakter), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_HANNES`, `TELEGRAM_CHAT_MARKETING`. Opsional:
   `KAPSO_PHONE_NUMBER_ID` (default `1286905201167228`). JANGAN memasang `WA_IZINKAN_JAM_UJI` /
   `KAPSO_API_URL` / `ANTHROPIC_API_URL` / `TELEGRAM_API_URL` di produksi (hanya untuk uji lokal).
3. Deploy Edge `api` (`supabase functions deploy api --use-api --no-verify-jwt`). Cek tanpa menulis data:
   `POST /x/wa/webhook` tanpa tanda tangan → 401; `POST /x/wa/proses` tanpa token → 401; `GET /x/wa/ringkas` (token baca
   bot) → 200 `saklar: mati`; regresi `/v2/user` 401, `/x/iklan/ringkas` 200.
4. Vault (SQL editor / Management API, nilai tidak ke log):
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/api', 'wa_api_url');`
   `select vault.create_secret('<TOKEN_WA_PROSES>', 'wa_token_proses');`
   Cek: `select wa.picu('jaga')` → id request; `select status_code from net._http_response order by id desc limit 1` → 200.
5. Daftar webhook Kapso (ACC Hannes, mengubah pengaturan Kapso):
   `POST https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/1286905201167228/webhooks`, header `X-API-Key`, body
   `{"whatsapp_webhook": {"url": "https://<ref>.supabase.co/functions/v1/api/x/wa/webhook", "secret_key": "<KAPSO_WEBHOOK_SECRET>",
   "events": ["whatsapp.message.received", "whatsapp.message.sent"], "buffer_enabled": false, "active": true}}`.
   Cek: `GET …/webhooks` → `active: true`; kirim satu pesan uji dari HP lain → `wa ringkas` menunjukkan `masuk` bertambah.
6. Isi `wa.kata_manusia` lewat migrasi data sesudah ACC Hannes, dan nomor internal/pemasok/ekspedisi lewat
   `wa diam --nomor … --alasan …`.
7. Menyalakan: Riksa/Michael mematikan pesan luar jam (A2) di aplikasi WA Business HP 0878 (supaya tidak dobel), lalu
   `node tools/tugas.mjs wa saklar kirim`. Mematikan: `wa saklar mati` + A2 dinyalakan lagi di HP.

## Pembagian seketika chat baru jam kerja (20261111170000, keputusan Hannes 11 Nov 2026)

Bukan bagian bot (bot tetap luar jam). Chat WA baru yang masuk di jam kerja langsung ditunjuk ke satu sales bergiliran
dan diumumkan ke grup Telegram RHJ Online Sales dalam ±1–2 menit; lead Anvil tetap dibuat routine Pantau WA Jam
(rhj-brain `tools/lead-wa-otomatis.py`) sesudah chat dinilai calon pembeli, dengan pemilik dari tabel ini.

- Webhook: sesudah `x_wa_webhook`, Edge memanggil `x_wa_bagi_calon` (gagal tidak menggagalkan webhook). Calon = pesan masuk
  jam kerja (hari kerja, `hari_libur` dihormati), ≤ 1 jam, bukan stiker/reaksi/tes/stop, nomor bukan `wa.diam`/`wa.uji`,
  belum ada baris penugasan ≤ `hari_baru` (7) hari. Dicatat batal (tidak dicek ulang): `percakapan_berjalan` (jejak
  `wa.log` ≤ 7 hari) dan `lead_ada` (kontak bernomor sama dengan lead BARU/PENAWARAN, atau lead apa pun ≤ 7 hari).
- `wa-bagi` (pg_cron tiap menit) → `wa.picu_bagi()` → POST `/x/wa/bagi` (token `TOKEN_WA_PROSES`, Vault sama dengan
  `wa.picu`) hanya bila saklar aktif dan ada calon lewat `jeda_detik` (60) atau pengumuman yang perlu diulang. Edge membaca
  ≤ 20 pesan percakapan lewat API Kapso: ada pesan > 1 menit sebelum pesan pertama (≤ 7 hari) → batal
  `percakapan_berjalan`; sales sudah membalas menyebut satu nama sales → ditunjuk ke dia (`sudah_membalas`), membalas tanpa
  nama → batal `sudah_dibalas`; belum dibalas → giliran (penugasan 7 hari paling sedikit; seri → yang paling lama tidak
  dapat → urutan setelan). Kapso gagal → tetap calon, > 15 menit → batal `kapso_gagal`.
- Pengumuman: satu pesan Telegram ke `TELEGRAM_CHAT_SALES` ("Chat baru masuk, mohon langsung dibalas oleh:" + baris
  `08xx… → Nama`). Nomor chat boleh di grup sales (keputusan Hannes 29 Okt); isi chat dan nama pelanggan tidak ikut. Gagal
  → diulang ≤ 4x dalam 30 menit.
- Luar jam (20261111180000, Hannes 11 Nov ±17:20): `wa bagi --luar-jam ya` → chat malam/akhir pekan/libur juga ditunjuk
  seketika (baris pengumuman bertanda "(luar jam)"); balasan bot (origin `cloud_api`) tidak dihitung balasan sales.
- Lead langsung (20261111190000, Hannes 11 Nov: "AI nilai dulu, lalu langsung buat"): sesudah ditugaskan, Edge menilai chat
  dengan Claude (`ANTHROPIC_API_KEY_WA`, Sonnet 5.5, json_schema; prompt pemilah sama dengan PROMPT KLASIFIKASI routine).
  calon_pembeli → `inti_pipeline_lead_otomatis` sebagai `lead_aktor` (hp & pemilik dari penugasan, kunci tautan sama dengan
  routine per jam, sumber dari pola Ref/iklan/template) → kode lead ikut di pesan grup; lain (sapaan) → `tunggu`, dinilai ulang
  saat pelanggan menulis lagi (≤ 6x, ≤ 24 jam); jenis lain → `bukan`; galat AI sementara → ulang 5 menit (≤ 4x). Routine per jam
  tetap cadangan. Setelan `wa bagi --lead ya|tidak --aktor-lead <id agent>`. Kapso dibaca dengan field
  `kapso(direction,origin,contact_name,content)` (field `kapso()` kosong tidak memuat arah/asal).
- Saklar & setelan: `wa.bagi_setel` (bawaan MATI). CLI `wa bagi [--aktif|--mati] [--sales id,id] [--jeda detik]`, lihat
  `wa bagi`; daftar `wa penugasan [--hari 3]` (MEMUAT nomor, owner/bot; jangan disalin ke repo/memori). Retensi 30 hari.
- Deploy: migrasi `20261111170000_wa_bagi_seketika`, secret Edge `TELEGRAM_CHAT_SALES` (id grup RHJ Online Sales), deploy
  Edge `api`, lalu `wa bagi --sales <Riksa>,<Michael> --aktif` (ACC Hannes).

## Tes lokal

`supabase start` + `supabase db reset` + `supabase functions serve --env-file uji/wa/serve.env`, lalu:
`bash uji/db/jalankan.sh` · `node uji/wa/jalankan.mjs` (murni Node, tiruan Kapso/Claude/Telegram/DB) · `node uji/wa/bagi.mjs` (pembagian seketika) ·
`node uji/wa/kontrak.mjs` (Edge + DB lokal, server tiruan 0.0.0.0:54398 lewat `host.docker.internal`, termasuk
pg_net → Edge lewat Vault lokal). Tidak ada panggilan ke Kapso, Anthropic, atau Telegram sungguhan.
