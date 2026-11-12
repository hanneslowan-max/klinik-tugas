
# Audit pemakaian ClickUp oleh routine dan agent RHJ (untuk migrasi ke rhj-tugas)

Sumber: semua file yang diminta sudah dibaca penuh. Untuk definisi aturan, saya juga membaca beberapa file pendukung: `knowledge/rhj-clickup-workspace.md`, `knowledge/rhj-pagar-inti.md`, `memori/LOG-PAGAR.md` (B5 dan B10), `memori/AGENDA-STATUS.md`, `tools/README.md`, `.claude/settings.json`, `deliverables/PROMPT-ROUTINE-UI-24Sep.md` dan `memori/PELAJARAN-PIC.md`. Tidak ada file yang diubah. Env sesi ini tidak punya `CLICKUP_API_TOKEN`, jadi semua bentuk output di bawah diturunkan dari kode `tools/clickup.mjs`, bukan dari panggilan langsung.

## Verdict
- **Routine cloud aktif yang benar-benar memanggil ClickUp: 4 dari 6.** Agen Data, Digest MM dan Arahan Pipeline memanggilnya sekarang. Analisa Ads baru mulai Senin 5 Okt. Analisa Pipeline dan SEO GEO hanya memuat larangan "jangan ubah ClickUp".
- **Operasi tulis di routine aktif: 0.** Semua READ-ONLY. Perintah yang dipakai ada 5: `agenda`, `folder-tasks`, `tasks`, `task`, `comments --replies`.
- **Operasi tulis hanya ada di file legacy yang nonaktif**, yaitu supervisi-pipeline (create task, comment, kirim chat), dan di skill agen-data lama yang mengizinkan menandai complete. Sesi interaktif juga punya akses tulis lewat `create/update/comment/move/delete`, tapi di memori tidak tercatat satu pun perintah tulis REST (grep). Pemakaiannya belum terverifikasi.
- **Risiko terbesar: prompt ke-6 routine aktif ada di UI claude.ai, dan agent tidak bisa mengubahnya** (`routines/cloud/README.md` L6). Aturan C di keenam prompt itu berbunyi "ClickUp HANYA lewat `node tools/clickup.mjs`" (`deliverables/PROMPT-ROUTINE-UI-24Sep.md` L33, 78, 174, 220, 267, 315), dan prompt menang atas file repo soal pagar. Ada dua jalan saat cutover. Pertama, Hannes mengedit 6 prompt UI. Kedua, nama `tools/clickup.mjs` dipertahankan sebagai shim ke backend baru, sehingga prompt UI dan izin `.claude/settings.json` L30 `Bash(node tools/clickup.mjs:*)` tetap berlaku.

---

## A. Routine cloud AKTIF
Keenamnya dijalankan trigger UI sejak 24 Sep. File-file ini dibaca lewat aturan H prompt UI.

### A1. `routines/cloud/_UMUM.md` (aturan bersama)
1. Tidak punya jadwal sendiri. Aktif di cloud, dibaca oleh semua routine.
2. Operasi: generik, `node tools/clickup.mjs ...` (L18). Tool MCP ClickUp DILARANG. Tidak ada operasi tulis.
3. Field: tidak ada.
4. ID hardcode: tidak ada.
5. Aturan: tidak ada. L18 mengatur penanganan error: token kosong atau error dicatat "ClickUp tak terbaca: <error>", lalu routine lanjut.
6. Yang diubah saat pindah:
   - L18 dari "ClickUp = REST saja: `node tools/clickup.mjs` ... token env `CLICKUP_API_TOKEN` ... Tool MCP ClickUp DILARANG" menjadi "Tugas = `node tools/tugas.mjs` (env `TUGAS_API_URL` + `TUGAS_API_TOKEN`)", dengan pesan error "Aplikasi Tugas tak terbaca: <error>".
   - L25 dari "komentar/ubah ClickUp" menjadi "komentar/ubah kartu di aplikasi Tugas".

### A2. `routines/cloud/README.md`
1. Daftar trigger UI (L10-15). Menurut cek 24/9 (L17), cron UI untuk Arahan, SEO GEO dan Ads jalan HARIAN, berbeda dari kolom "seharusnya".
2-5. Tidak ada operasi atau ID ClickUp. Yang tercantum hanya ID trigger.
6. Yang diubah:
   - L22 dari env "Marketing" = "token ClickUp + Telegram" menjadi "token API Tugas + URL + Telegram". Env var baru hanya terbaca di sesi baru (`tools/README.md` L37).
   - L41 dari "ClickUp hanya REST" menjadi "Tugas via tools/tugas.mjs".
   - Tambahkan catatan bahwa prompt UI juga harus diedit Hannes, kecuali shim dipakai.

### A3. `routines/cloud/agen-data.md`: Agen Data Harian
1. **08:30 WIB tiap hari** (cron `30 1 * * *`, `trig_013p89xUBTz5rVhfLhwyxshi`). Email tim hanya Senin-Jumat. Aktif di cloud.
2. Operasi (semuanya BACA):
   - `node tools/clickup.mjs agenda 1100340000026652 --hours 26 > /tmp/agenda.json` (L32)
   - opsional `... agenda ... --all-comments` (L32)
   - `node tools/clickup.mjs task <id>` untuk deskripsi kartu tertentu (L32). PELAJARAN 25/9 juga meminta `task <id>` diulang untuk kartu yang `date_updated`-nya sangat baru, dan unduh `attachments[].url`.
   - `node tools/clickup.mjs folder-tasks 1100340000026652 > /tmp/tasks.json` (L33)
   - Tulis: TIDAK ADA (L47: READ-ONLY).
3. Field yang dibaca:
   - Dari `agenda`:
     - `tanggal_wib`, `sejak`
     - `ringkas.{terbuka, due_hari_ini, telat, berubah_baru, ditutup_baru, kartu_dengan_komentar_baru}`. Angka-angka ini dikutip langsung ke AGENDA-STATUS L8, misalnya "84 kartu terbuka, 0 due hari ini, 1 telat, 0 ditutup dalam 26 jam, 1 kartu berkomentar baru".
     - `tasks[].{id, name (kode kartu = prefix nama), status, assignees (username), due, updated, list, url, kategori[], closed, komentar_baru}`
     - `tasks[].comments[].{id, user, date, text, reply_count, replies[].{user,date,text}}`
     - `description` bila `--desc` dipakai.
   - Dari `folder-tasks`: `{id, name, status, assignees, due, list}`. `list` (nama) dipakai untuk mengecualikan "Di luar periode" dan "Kontrak SEO Agus".
   - Dari `task` (JSON mentah): `markdown_description`, `status.status`, `date_updated`, `date_closed`, `attachments[].url` / `.title` (CSV UTF-16), `assignees[]`.
4. ID hardcode:
   - folder `1100340000026652` (L32, L33)
   - task `z8r3fdd1wn` (Y7), `z8r3fdj507` (Y7-Bid), `z8r3fdj505` (ADS-Diag) (L22, blok 6 Okt)
   - Nama anggota tim (L41) dipetakan lewat username assignee.
5. Aturan yang dihitung:
   - **Kategori agenda:** lihat definisi di bagian C.
   - **TENGGAT B10, email tim, per orang:**
     - (i) due dalam 0-3 hari kerja ke depan: rentangnya hari ini sampai 3 hari kerja Senin-Jumat berikutnya. Contoh di file: Senin berarti due Senin s/d Kamis. Ditulis dengan "sisa N hari kerja".
     - (ii) telat: due < hari ini WIB dan belum complete. "Lewat N hari" dihitung hari **kalender** (contoh Digest 28/9: W2 due 21/9 = telat 7 hari).
     - Pengecualian: nama kartu memuat BERSYARAT, CADANGAN atau DITUNDA, atau kartu ada di list "Di luar periode", tidak dihitung telat. List Kontrak SEO Agus tidak ditagih sebelum 1 Okt (B7).
     - Kartu bersama menyebut semua assignee.
     - Sabtu dan Minggu: versi tim tidak dikirim.
   - **HEADLINE WATCH:** kartu belum `complete` jadi headline, disertai berapa hari lewat due.
   - **B5 (AGENDA-STATUS):**
     - Maks 7 kartu due per orang per hari.
     - Maks 4 poin bobot per hari dan maks 2 kartu berat per minggu. Bobot BUKAN field ClickUp, disimpan di tabel AGENDA-STATUS.
   - **Tangga eskalasi (AGENDA-STATUS):** dihitung dari lewat target: 0 = NORMAL, 1-2 = TERLAMBAT, 3-4 = MACET, 5+ = angkat ke Hannes dan berhenti tagih di email tim. Aturan ini bertabrakan dengan B10, yang meminta semua kartu telat masuk email tim.
   - **Watermark "KOMENTAR TERBACA S/D" (AGENDA-STATUS L160):** komentar dengan `date` di atas watermark dianggap baru. Watermark hanya maju bila papan terbaca.
6. Yang diubah:
   - L6 dari "agenda ClickUp" menjadi "agenda Tugas".
   - L32-33 dari `node tools/clickup.mjs agenda|folder-tasks|task` menjadi `node tools/tugas.mjs ...`. Buang "(BUKAN konektor MCP)". Folder ID tetap `1100340000026652` bila ID lama diterima; kalau tidak, ganti dengan ID baru.
   - L22: ID `z8r3...` tetap bisa dipakai kalau lookup ID lama tersedia.
   - L41: penutup versi tim "(tandai kartu + tulis kendala di komentar)", ditambah skill lama L60 "tandai kartu di ClickUp", menjadi "di aplikasi Tugas RHJ (<URL>)".
   - L47 PAGAR: "kartu ClickUp", "CLICKUP HANYA via clickup.mjs ... CLICKUP_API_TOKEN ... JANGAN panggil tool MCP", "token ClickUp REST tak ada di environment routine", "ClickUp tak terbaca" diganti ke nama baru.
   - Prompt UI (agent tidak bisa ubah): L286 dan L300 untuk isi yang sama, L267 untuk aturan C.

### A4. `routines/cloud/digest-mm.md`: Digest MM (Telegram)
1. **09:15 WIB tiap hari** (`15 2 * * *`, `trig_01TWnqSHaUs12tqnZF5VX96M`). Aktif di cloud.
2. Operasi (BACA):
   - `node tools/clickup.mjs folder-tasks 1100340000026652 > /tmp/tasks.json` (L11)
   - `node tools/clickup.mjs comments <id> --replies` untuk kartu H-1 dan telat (L11)
   - Tulis: tidak ada (L42 "JANGAN ubah ClickUp").
3. Field:
   - Dari `folder-tasks`: `id, name (kode), status (to do / in progress), assignees, due, list`.
   - Dari `comments`: `date` dan `user` komentar TERAKHIR, termasuk `replies[].date`, untuk "komentar terakhir <tgl>/belum ada", serta jumlah komentar.
   - Tidak membaca JSON mentah `task`.
4. ID hardcode: folder `1100340000026652` (L11), task `z8r3fdj507` (L26).
5. Aturan (L29-35):
   - **H-1:** due == BESOK (WIB) dan belum complete. Hari Jumat: due Sabtu, Minggu, Senin.
   - **TELAT:** due < hari ini dan belum complete, diurutkan dari yang paling lama. "Telat N hari" dihitung hari kalender.
   - Pengecualian: nama memuat BERSYARAT, CADANGAN atau DITUNDA, atau kartu menunggu keputusan Hannes, masuk "MENUNGGU KEPUTUSAN ANDA". Kontrak SEO Agus mengikuti B7.
   - Kartu milik Hannes ikut dicantumkan.
   - Kosong: tulis "TENGGAT: aman".
   - Wajib memakai data `folder-tasks` hari ini, bukan memori.
   - Tidak ada daftar libur nasional di mana pun (grep), jadi "hari kerja" = Senin-Jumat saja.
6. Yang diubah:
   - L11 menjadi `tugas.mjs folder-tasks` dan `tugas.mjs comments <id> --replies`.
   - L35 dari "clickup.mjs gagal -> 'TENGGAT: ClickUp tak terbaca (<error>)'" menjadi nama baru.
   - L42 menjadi "JANGAN ubah kartu".
   - Prompt UI L315 (aturan C) dan L339.

### A5. `routines/cloud/arahan-pipeline.md`: Arahan Pipeline (email Riksa & Michael)
1. **07:30 WIB Senin-Jumat** menurut file (UI per 24/9: `30 0 * * *` harian, `trig_01Rj6qkfJk8ANZy2QsWwATfv`). Aktif di cloud.
2. Operasi (BACA, blok 26 Sep L90-101):
   - `node tools/clickup.mjs tasks 1100340000065694` dan `node tools/clickup.mjs tasks 1100340000065696` (L92)
   - `node tools/clickup.mjs task <id>` untuk bagian "Selesai kalau" (L93)
   - Tulis: DILARANG (L78, L100: jangan ubah status, komentar atau due; chat ditunda).
3. Field:
   - Dari `tasks`: `id, name` (prefix R#/M#/H#/Follow-up; H# diabaikan), `status`, `assignees`, `due` (untuk menentukan kartu lewat due).
   - Dari `task`: `markdown_description` (teks "Selesai kalau"), `status.status`.
4. ID hardcode:
   - list `1100340000065694` ("List") dan `1100340000065696` ("Follow-up Pallet Mesh", di folder hidden `1100340000063830` menurut `knowledge/rhj-clickup-workspace.md` L32) (L92)
   - kode kartu M5, M6, R2, R3, R5-R8 (L101, lewat nama, bukan ID)
5. Aturan:
   - SIAP DITUTUP = kartu terbuka R#/M#/Follow-up yang syarat "Selesai kalau"-nya jelas terpenuhi di sheet. Kalau ragu, kartu tidak dimasukkan.
   - Kartu lewat due yang belum beres masuk daftar telepon, tanpa blok tagihan terpisah.
6. Yang diubah:
   - L92-93 menjadi `tugas.mjs tasks <list>` dan `tugas.mjs task <id>`.
   - L90 dan L95 dari "KARTU CLICKUP SIAP DITUTUP ... tinggal klik complete" menjadi "... di aplikasi Tugas".
   - L78 KANAL dari "fitur chat ClickUp di tools/clickup.mjs" menjadi "fitur chat aplikasi Tugas (bukan Fase 1)". Email tetap jadi kanal.
   - L76 wording.
   - Prompt UI L78, L157, L159.

### A6. `routines/cloud/analisa-ads.md`: Analisa Ads
1. **08:15 WIB Senin** (mulai 6 Okt: Senin + Kamis). UI per 24/9: `15 1 * * *` harian, `trig_019pkjtJJL7VgCwLZuxaekyb`. Aktif di cloud.
2. Operasi (BACA, mulai run Senin 5 Okt): `node tools/clickup.mjs comments z8r3fdd1wp --replies` (L18). Tulis: dilarang (L18, L29).
3. Field: `comments[].text` dan `replies[].text` (daftar kandidat "kalah lelang" beserta usulan bid), `user`, `date`.
4. ID hardcode: task `z8r3fdd1wp` (Y8) (L18).
5. Aturan: ada daftar kandidat, maka diverifikasi terhadap ADS_KEYWORD. Tidak ada daftar, maka dicatat "Y8 Tahap 1 belum masuk (due 2 Okt)".
6. Yang diubah:
   - L18 menjadi `tugas.mjs comments z8r3fdd1wp --replies`. ID tetap bisa dipakai kalau lookup ID lama tersedia.
   - L29 menjadi "JANGAN ubah kartu".
   - Prompt UI L220 dan L241.

### A7. `routines/cloud/analisa-pipeline.md` dan A8. `routines/cloud/seo-geo.md`
1. Analisa Pipeline: 07:00 WIB harian (`trig_018zgfK52b6ETvR5PE66i3AK`). SEO GEO: 08:00 WIB Senin + Kamis (UI per 24/9: harian, `trig_01Mk3oZQxaJkxvK2XPUq6RMr`). Keduanya aktif.
2-5. Tidak ada operasi, field, ID atau aturan ClickUp.
6. Hanya wording: analisa-pipeline L27 ("ClickUp jangan diubah") dan seo-geo L28 ("JANGAN ubah ClickUp"). Prompt UI: aturan C di L33 dan L174, serta L63 dan L205.

---

## B. Legacy, desktop, nonaktif dan agent

### B1. `routines/rhj-agen-data-harian/SKILL.md`
1. Jadwal desktop lama ~07:18-07:33. **Legacy**, tapi masih dipakai: cloud agen-data L25 mewajibkan LANGKAH 7 skill ini sebagai FORMAT EMAIL.
2. Operasi (nama MCP):
   - `clickup_filter_tasks folder_ids ["1100340000026652"]` dengan `has_more` dan `next_page` (L29)
   - `clickup_get_task_comments` ditambah threaded bila `reply_count>0` (L30)
   - TULIS: menandai complete (L29: "(a) tugas OTOMATIS yang kamu verifikasi, (b) MANUAL yang komentarnya jelas menjawab"), setara `update --status complete`. Izin ini bertabrakan dengan cloud yang READ-ONLY; cloud menang.
3. Field: `status`, `date_closed` (dibanding "KOMENTAR TERBACA S/D"), `due`, deskripsi "MENUNGGU:", komentar dan balasan, `reply_count`.
4. ID hardcode:
   - folder `1100340000026652`
   - list: Fase1 `1100340000027379`, Fase2 `...27380`, Fase3 `...27381`, Fase4 `...27382`, Di luar `...27388`, Kontrak `1100340000033913`
   - user: Yosie `240024679`, Agus `113661628`, Hannes `312823267`, Peter `240032050`, Darwis `312824551`, Felix `240149728` (L29)
   - task `z8r3fdfqut` (P-PM-AuthLink) (L43)
5. Aturan (L30): baca komentar untuk kartu yang (1) complete dengan `date_closed` > watermark, (2) in progress, (3) due hari ini atau lewat, (4) due dalam 3 hari, (5) deskripsinya memuat "MENUNGGU:". Juga batas beban 7 due/org/hari, dan "HEADLINE WATCH" yang mengecek status complete.
6. Yang diubah:
   - L29-30 dari nama MCP menjadi `tugas.mjs folder-tasks` / `agenda` / `comments --replies`.
   - L29: hapus izin menandai complete, atau jadikan eksplisit `tugas.mjs update --status complete` dengan ACC.
   - L60 dari "tandai kartu di ClickUp" menjadi aplikasi Tugas.
   - L10, L17-19, L74: path `C:\...`.

### B2. `routines/rhj-mm-eksekusi-sore/SKILL.md`
1. 4x sehari (~10, 12, 15 RINGKAS; ~17 PENUH). **Legacy desktop, nonaktif.** Run terakhir yang tercatat di OTAK-MM adalah RUN #19 tanggal 21 Sep, dan routine ini tidak ada di daftar cloud.
2. Operasi (MCP):
   - `clickup_filter_tasks` folder `1100340000026652` dengan `include_closed=false` dan `next_page` (L23)
   - `clickup_filter_tasks include_closed=true` untuk kartu dengan `date_closed` > run terakhir (L29)
   - `clickup_get_task_comments` (L23)
   - subagent verifikator-task (L32)
   - Tulis ClickUp: DILARANG (L67).
3. Field:
   - `status`, `date_closed`, `date_updated` (sidik per kartu), `due`, `assignees`, prefix nama.
   - Komentar: `user` (dicek apakah ada komentar dari "**hannes lowan**" sesudahnya), `date`, teks.
   - Pembukaan ulang kartu (complete ke to do) juga dilacak, lihat OTAK-MM RUN #18 dan #10.
4. ID hardcode: folder `1100340000026652`, user Yosie `240024679` / Peter `240032050` / Agus `113661628`, list `1100340000033913` (L23-26). `948838172` di L60 adalah chat Telegram, bukan ClickUp.
5. Aturan:
   - BERGERAK / MACET (due lewat / tidak ada update ≥2 hari / blocked) / TERLEWAT (tidak tersentuh dan mendekati due).
   - Pertanyaan untuk Hannes dianggap terbuka selama belum ada komentar "hannes lowan" sesudahnya atau kartu belum ditutup dengan resolusi.
   - complete + komentar terakhir berbunyi ditahan/dialihkan/menunggu = TERBLOKIR.
   - B5 maks 7 due/org/hari.
6. Kalau dihidupkan di cloud:
   - L23/L29 menjadi `tugas.mjs folder-tasks <folder>` dan `tugas.mjs agenda <folder> --hours <sejak run terakhir>` (yang terakhir memberi `closed` beserta komentar).
   - Tambahkan `tugas.mjs activity <id>` untuk mendeteksi pembukaan ulang dan pelaku.
   - Semua path `C:\`.
   - `notify.mjs` desktop (L59) menjadi `node tools/notify.mjs`.

### B3. `routines/rhj-pic-ads-analisa-pagi/SKILL.md`, `rhj-pic-seo-analisa-pagi/SKILL.md`, `rhj-pipeline-harian/SKILL.md`
1. Semuanya legacy desktop, digantikan cloud analisa-ads, seo-geo dan arahan-pipeline.
2-5. Tidak ada operasi ClickUp. Kartu hanya disebut lewat kode: pic-seo L16 menyebut P-PM-AuthLink dan A-PM-ReqIndex. pipeline-harian L6 melarang membuat atau mengomentari kartu.
6. Tidak perlu diubah untuk migrasi. Cukup ditandai sebagai arsip.

### B4. `routines/rhj-supervisi-pipeline-clickup/SKILL.md`
1. Senin-Jumat 07:30. **NONAKTIF sejak 23 Sep** (L6).
2. Operasi (MCP):
   - BACA: `clickup_filter_tasks` space `include_closed:true` (L21), `clickup_get_task`, `clickup_get_task_comments`, `clickup_get_threaded_comments` (L21), `clickup_get_chat_channel_messages` ditambah replies (L22).
   - TULIS: komentar `[Claude] ...` (L28, L32-33), membuat kartu baru di list Follow-up (L37), pesan ke grup chat (L46).
3. Field: `status` complete, `date_closed` (sejak run terakhir), deskripsi "Selesai kalau", komentar dan balasan, `due` (lewat due), assignee per rep.
4. ID hardcode:
   - space `1100340000050704`, list `1100340000065696` dan `1100340000065694` (L21)
   - chat `z8r3fda6dd-1398` (L22, L46)
   - user Riksa `240260558`, Michael `240260567`, Hannes `312823267` (L23)
5. Aturan:
   - diam ≥2 hari kerja (sheet)
   - maks 1 komentar per kartu per run
   - kartu bandel = ≥3 tagihan tanpa gerak
   - throughput = kartu terverifikasi per rep per hari kerja, rata-rata 5 hari kerja
   - kartu terbuka dan lewat due per rep
6. Kalau dihidupkan lagi: `create`, `comment` dan `tasks`/`task`/`comments` versi `tugas.mjs`. Chat bukan Fase 1, jadi L22/L46 tidak bisa jalan. L67 memakai pola git lama (push hanya ke claude/state) dan harus diganti `routine-git.sh`.

### B5. `routines/rhj-verif-konektor/SKILL.md`
1. Uji sekali jalan. Sudah selesai (probe), legacy.
2. `clickup_filter_tasks space_ids ["1100340000021644"]` (L11), BACA.
3. Field: `status` (bukan complete), `due` (hari ini atau lewat).
4. ID: space `1100340000021644`.
5. Menghitung kartu terbuka dan kartu due hari ini atau lewat.
6. Arsipkan. Tidak perlu dimigrasi.

### B6. `.claude/agents/verifikator-task.md`
1. On-demand, atau dipanggil MM sore (legacy). File agent aktif di `.claude/agents/`.
2. Operasi (MCP, BACA):
   - `clickup_filter_tasks` folder `1100340000026652` dengan `include_closed:true`, disaring ke status complete (L17)
   - `clickup_get_task` (include description)
   - `clickup_get_task_comments` (SEMUA)
   - `clickup_get_threaded_comments` (`reply_count>0`)
   - Tulis: DILARANG (L41).
3. Field: `status.status == complete`, `date_closed` (hari ini / sejak audit terakhir / 7 hari), `markdown_description` (baris "Cara dicek: OTOMATIS/MANUAL" dan kriteria), `comments[]` beserta replies (komentar terakhir menentukan blokir), `attachments` (bukti, tersirat).
4. ID hardcode: folder `1100340000026652` (L17).
5. Klasifikasi:
   - TERVERIFIKASI: artefak cocok
   - KLAIM: BUTA atau bukti dilempar ke orang lain
   - FALSE-COMPLETE: artefak belum sesuai, ATAU komentar terakhir berbunyi ditahan/dialihkan/menunggu/pending
   - Komentar yang berisi pertanyaan dan belum dijawab di komentar sesudahnya dicatat sebagai "pertanyaan terbuka".
6. Yang diubah:
   - L17 menjadi `tugas.mjs agenda 1100340000026652 --hours <N>`, karena di antara perintah daftar hanya itu yang memberi `closed`. Alternatifnya `folder-tasks --closed` ditambah field `closed` baru.
   - `tugas.mjs task <id>`, `tugas.mjs comments <id> --replies`, dan tambahan `tugas.mjs activity <id>` untuk riwayat (tujuan utama fitur riwayat).
   - L14: path `C:\` diganti `knowledge/`.

### B7. `.claude/agents/marketing-manager.md`
1. On-demand. Agent aktif.
2. Operasi eksplisit tidak ada. Operasinya lewat skill `rhj-manajer-marketing`, yang memakai `clickup_filter_tasks` folder `1100340000026652` (skill L13). Tulis (create/update/comment/move) hanya berupa draf dan butuh ACC Hannes (L23).
3. Field: `due`, `assignees`, `status`, prefix nama, komentar (untuk menentukan blokir).
4. ID: tidak ada di file agent. Skill L13 memuat folder, list Fase1-4 / Di luar / Kontrak, dan user Yosie / Agus / Hannes / Peter / Darwis.
5. Aturan:
   - B5: maks 7 kartu due/org/hari dan 4 poin bobot/hari (L11)
   - B10 (L32): H-1 (Jumat = Sabtu s/d Senin), ≤3 hari kerja, telat
   - complete + komentar ditahan = TERBLOKIR (L14)
6. Yang diubah:
   - L3 dan L17 dari "board ClickUp / RHJ Space" menjadi aplikasi Tugas.
   - L13 dari "sapu board dengan filter" menjadi `tugas.mjs folder-tasks`.
   - Skill `rhj-manajer-marketing` L13 dari MCP menjadi `tugas.mjs`.
   - Skill L52 "Batas alat ClickUp" ditulis ulang sesuai kemampuan aplikasi baru (status bisa ditambah, dan seterusnya).

### B8. `tools/clickup.mjs`: kontrak yang harus disalin
- ID hardcode: folder default `1100340000026652` di `agenda` (L168). BASE v2 (L32). URL v3 untuk `move` (L244).
- Output yang harus identik:
  - `brief` (L86-92): `{id, name, status:<nama status>, assignees:[username||email], due:"YYYY-MM-DD" WIB|null, updated: ISO UTC|null, list:<nama list>, url}`
  - `comments` (L94-106): `[{id, user, date: ISO UTC, text, reply_count:number, replies?:[{user,date,text}]}]`. Key `replies` HANYA muncul bila `--replies` dan `reply_count>0`.
  - `agenda` (L202-206): `{tanggal_wib, sejak, folder, ringkas:{...6 angka}, tasks:[brief + kategori[], closed, description?, comments[], komentar_baru]}`
  - `task`: JSON mentah ClickUp
  - `create` / `update` / `move`: `brief`
  - `comment`: mentah `{id, hist_id, date}`
  - `delete`: `{deleted:id}`
  - `whoami`: `{user:{id,username,email}, workspaces:[{id,name,members:<jumlah>}]}`
  - `--dry-run` mencetak `{dry_run:true, method, task, body}` (untuk move: `{dry_run, method, url}`).
- Yang diubah: file baru `tools/tugas.mjs` dengan perintah dan output yang sama, atau `clickup.mjs` dijadikan shim (lihat Verdict). `tools/README.md` L19-43. `.claude/settings.json` L30: tambah `Bash(node tools/tugas.mjs:*)`, kalau tidak, mode auto bisa menahan perintah seperti yang terjadi pada Gmail/Telegram 24/9.

---

## C. Definisi persis dari `clickup.mjs` (dipakai ulang oleh routine)
- `today` = tanggal WIB saat ini (UTC+7). `wibDate(ms)` = `new Date(ms + 7h).toISOString().slice(0,10)`.
- `since` = sekarang − `hours`×1 jam (default 26).
- **closed** = `status.type` ∈ {`closed`, `done`}.
- **ditutup_baru** = closed dan (`date_closed` || `date_done`) ≥ since.
- Untuk kartu open:
  - **due_hari_ini**: `wibDate(due_date) == today`
  - **telat**: `wibDate(due_date) < today` (perbandingan string)
  - **berubah_baru**: `date_updated ≥ since`
  - **terbuka**: semua kartu open, hanya bila `--all-comments`
- **ringkas.terbuka** = semua kartu open di semua list non-arsip dalam folder, termasuk subtask (`subtasks=true`), Kontrak dan Di luar periode.
- **komentar_baru** = jumlah komentar top-level dengan `date ≥ since` ATAU yang punya balasan dengan `date ≥ since`.
- **kartu_dengan_komentar_baru** hanya dihitung dari kartu yang lolos kategori.
- `create` / `update --due YYYY-MM-DD` menyimpan `due_date` = 12:00 WIB, `due_date_time:false`. `--due none` = null.
- `priority` 1-4. `assignees` diubah dengan `Number()`. `update` assignee memakai `{add:[], rem:[]}`. `comment` memakai `notify_all:false`.

---

## (a) Kebutuhan API minimum (dari pemakaian nyata)

**Wajib, dipakai routine aktif sekarang (semua BACA):**
1. **Tugas per folder** (semua list non-arsip, termasuk subtask, open saja atau `--closed`). Output bentuk `brief`. Sebaiknya ditambah field aditif `closed`, `list_id`, `priority`, `created`.
2. **Tugas per list** (open / closed). Output `brief`, atau lengkap (`--full` = bentuk mentah).
3. **Detail tugas, JSON mentah kompatibel ClickUp:**
   - `id`, `name`, `markdown_description`, `description`/`text_content`
   - `status{status,type,color}`, `date_created`, `date_updated`, `date_closed`, `date_done` (string ms)
   - `due_date` (string ms) dan `due_date_time`
   - `assignees[{id,username,email}]`, `creator`, `priority{id,priority}`
   - `list{id,name}`, `folder{id,name}`, `space{id}`, `url`, `parent`
   - `attachments[{id,title,url,size,extension,date}]`
   - `custom_fields:[]`
4. **Komentar per tugas beserta balasan:** SEMUA komentar (tanpa batas 25), field `id, user, date, text, reply_count, replies[]`.
5. **Agenda agregat di server** (bentuk identik, parameter `hours`, `all_comments`, `desc`), supaya tidak ada N+1 panggilan. Throttle 670 ms di CLI tidak perlu disalin.
6. **Lookup ID lama** untuk task (`z8r3...`), dan juga folder, list dan space (`1100340000...`) serta user numerik (`240024679`). Semua dipakai hardcode di routine dan skill.
7. **Unduh lampiran oleh agent** (signed URL atau auth token). Routine sudah mengunduh CSV dari `attachments[].url`.

**Wajib karena ada di `clickup.mjs` (dipakai sesi interaktif, bukan routine aktif):**
8. `whoami`
9. `create` (name, markdown desc, assignees, due WIB, priority 1=urgent … 4=low, status)
10. `update` (name, desc, status, due|none, priority, assignees add/rem)
11. `comment` (teks/file, flag notify)
12. `move` (pindah home list, ID tetap)
13. `delete` (owner saja)
14. `--dry-run` di CLI

**Baru, untuk tujuan verifikator:**
15. `activity <id>`: riwayat status, assignee dan due, termasuk buka-ulang, lengkap dengan pelaku dan waktu.

**Opsional:**
- `fields <list>` mengembalikan `[]`.
- `audit-free` boleh dihapus, tidak dipakai routine.
- Chat: tidak di Fase 1. Akibatnya arahan pipeline tetap lewat email.

## (b) Kejutan dan risiko kompatibilitas
1. **Prompt UI tidak bisa diubah agent.** 6 prompt menyebut `clickup.mjs` di aturan C, dan izin `settings.json` hanya untuk `clickup.mjs`. Paling murah: shim bernama sama, atau Hannes mengedit 6 prompt. Env "Marketing" juga perlu var baru, sesi baru, dan host baru yang lolos kebijakan jaringan cloud (belum terverifikasi).
2. **Status closed vs done.** `agenda` menganggap closed = type `closed` ATAU `done`. `folder-tasks` mengandalkan filter `include_closed` di server. Output `status` = NAMA (huruf kecil: "to do" / "in progress" / "complete"). Status tambahan di list baru harus punya type, dan "complete" harus tetap bertipe closed.
3. **`due_date` = ms epoch berbentuk STRING**, dan tanggal WIB diturunkan dengan +7 jam. Saat impor, konversi harus memakai `wibDate` yang sama, bukan tanggal UTC. Kalau tidak, due yang disimpan 00:00 WIB (17:00 UTC hari sebelumnya) mundur satu hari. `date_*` lain juga string ms, dan `agenda` memakai `Number()`.
4. **Zona waktu output campur.** `due` = tanggal WIB, sedangkan `updated`, `closed` dan `comments[].date` = ISO **UTC** (`...Z`). Format ini harus dipertahankan persis. Mengubahnya ke WIB akan menggeser semua perbandingan "sejak" di routine.
5. **Komentar: 25 per panggilan dan urutan.** ClickUp mengembalikan 25 komentar TERBARU tanpa `start/start_id`, dan `clickup.mjs` tidak melakukan paginasi. Akibatnya kartu dengan lebih dari 25 komentar hari ini terpotong diam-diam, dan pagar M-CU "baca SEMUA" sebenarnya bocor. Urutan terbaru-dulu dan urutan balasan (`/comment/{id}/reply`) belum terverifikasi dengan data RHJ (tidak ada token). Routine membaca "komentar terakhir", jadi urutan harus ditetapkan dan diuji lewat diff output lama vs baru pada kartu yang sama.
6. **`replies` absen, bukan `[]`,** bila `reply_count` = 0 atau tanpa `--replies`. `reply_count` dinormalisasi ke angka.
7. **`comment_text` polos.** @mention dan lampiran dalam komentar tidak terlihat di output CLI. Screenshot bukti di komentar tidak terbaca routine hari ini. Model data baru boleh lebih kaya, tapi `text` harus tetap polos.
8. **Identitas assignee = username string** (misalnya "hannes lowan"). Routine memetakannya ke nama orang, dan MM sore mendeteksi "sudah dijawab Hannes" dari username. Username impor harus sama persis. Username anggota lain belum terverifikasi di sesi ini.
9. **Token agent = token pribadi Hannes.** Komentar agent tercatat sebagai "hannes lowan" dengan prefix `[Claude]`, sehingga bisa dianggap "Hannes sudah menjawab". Di aplikasi baru sebaiknya dibuat user bot terpisah. Konsekuensinya `user` pada komentar agent berubah, dan itu disengaja.
10. **ID numerik di-`Number()`.** `--assignee` / `--add-assignee` dengan UUID akan menjadi NaN. CLI baru harus menerima ID user lama, atau tidak melakukan casting.
11. **Format `id` di output.** Memori dan routine merujuk ±130 string unik berpola `z8r3xxxxxx` (grep `-o | sort -u` di memori/, routines/, knowledge/, deliverables/, termasuk ID chat `z8r3fda6dd`). Perlu keputusan: `id` di output = ID lama bila ada (plus field `uid`), atau selalu ID baru plus `clickup_id`. Kalau `id` berubah, pencocokan routine ke memori putus.
12. **Pengecualian berbasis NAMA list** ("Di luar periode 60 hari", "Kontrak SEO Agus — 1 Okt–31 Des 2026" dengan em-dash) dan NAMA kartu (BERSYARAT/CADANGAN/DITUNDA, prefix Y/P/W/C/A/D/H/R/M/FX). Nama harus diimpor verbatim.
13. **Folder hidden** `1100340000063830` (list Follow-up PM) harus ikut diimpor.
14. **Subtask ikut terhitung** (`subtasks=true`, field `parent`). Fase 1 tidak menyebut subtask. Jumlah subtask di ClickUp belum dihitung.
15. **Arsip:** list dan tugas yang diarsipkan dikecualikan (`archived=false`). Arsip di aplikasi baru juga harus keluar dari `folder-tasks` dan `agenda`.
16. **Semantik `date_updated` belum terverifikasi,** yaitu apakah menambah komentar menaikkan `date_updated` di ClickUp. `berubah_baru` bergantung padanya, begitu juga apakah komentar baru di kartu yang tidak lolos kategori tertangkap. Ini harus disamakan dan diuji saat masa paralel.
17. **Riwayat status mungkin tidak bisa dimigrasi.** OTAK-MM L132 mencatat `time_in_status` ditolak "not available on your plan". Yang tersedia kemungkinan hanya `date_created`, `date_closed` dan `date_done`. `date_closed` terhapus saat kartu dibuka ulang.
18. **Prioritas terbalik bila salah map.** Konvensi ClickUp 1 = urgent, 4 = low. Di output mentah prioritas berbentuk objek, sedangkan input berupa angka.
19. **Deskripsi sync-block tidak terbaca API** (placeholder "(isi deskripsi tak terbaca)"). Isinya juga tidak akan terimpor.
20. **Kartu tanpa assignee** (R-Footage) dan anggota yang belum ada di ClickUp (Rengga) harus didukung. Tim jadi 9 orang.
21. **`url` berubah domain.** Tautan `app.clickup.com` di memori: OTAK-MM 3 baris, HANDOFF-CMO-SESI 3 baris (`grep -c`). Tidak kritis bagi routine.
22. **Aturan yang saling bertabrakan** perlu diputuskan sebelum logika filter dipindah ke server:
    - Tangga eskalasi AGENDA-STATUS (5+ hari berhenti tagih di email tim) vs B10 (semua telat masuk email tim).
    - Izin "tandai complete" di skill lama vs cloud yang READ-ONLY.
    - Hari kerja belum memperhitungkan libur nasional.
23. **Waktu migrasi.** Selama paralel, ClickUp tetap sumber utama. Semua perubahan file di atas hanya berlaku saat cutover. Perubahan dikerjakan di sesi CMO, bukan dari repo rhj-tugas.

Dari luar daftar file yang diminta, ini juga perlu diubah saat cutover:
- `CLAUDE.md` L28
- `knowledge/rhj-pagar-inti.md` L21 (M-CU)
- `knowledge/rhj-clickup-workspace.md`
- `knowledge/rhj-mandat-pipeline-sales.md` L16, L25-31
- `.claude/skills/rhj-manajer-marketing/SKILL.md` L13, L52
- `tools/README.md`
- `.claude/settings.json` L30
- `deliverables/PROMPT-ROUTINE-UI-24Sep.md`

Pola nomor 11 (`id` lama vs baru) dan nomor 5 (paginasi dan urutan komentar) sebaiknya dijadikan tes diff otomatis `clickup.mjs` vs `tugas.mjs` sebelum masa paralel dimulai.