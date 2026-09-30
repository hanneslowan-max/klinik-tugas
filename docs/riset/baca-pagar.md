# Aturan kartu dari rhj-brain untuk aplikasi tugas: definisi yang bisa dihitung, anggota tim, dan kebutuhan verifikator

Semua temuan dari rhj-brain, dibaca saja; tidak ada file yang diubah. Format sumber: `path:baris`.

Ada tiga hal yang belum ada di data:
- **Libur nasional** tidak didefinisikan di rhj-brain.
- **Bobot** tidak punya field di ClickUp, jadi batas 4 poin bobot/hari belum bisa dihitung dari data.
- **Riwayat status ClickUp** tidak bisa diimpor karena ditolak oleh paket ClickUp.

## 0. Definisi dasar yang dipakai semua rumus

- **Zona waktu:** WIB = Asia/Jakarta (UTC+7, tanpa DST).
  - `today` adalah tanggal WIB saat dihitung. Sumber: `routines/cloud/_UMUM.md:10` ("TZ=Asia/Jakarta date").
  - Kode sekarang mengonversi due ke WIB dengan `wibDate = ms + 7 jam` (`tools/clickup.mjs:85,89`).
  - Saat membuat atau mengubah due, tanggal disimpan jam 12:00 WIB dengan `due_date_time=false` (`clickup.mjs:83,213,225`). Artinya due = DATE tanpa jam.
- **Selesai:** status bertipe `closed` atau `done`, dengan nama status `complete` (`clickup.mjs:175`, `.claude/skills/rhj-manajer-marketing/SKILL.md:53`: "status hanya to do/in progress/complete").
- **Hari kerja = Senin–Jumat.** Ini disimpulkan dari tiga sumber, tidak ada definisi eksplisit:
  - "Jumat: H-1 mencakup due Sabtu, Minggu, Senin" (`memori/LOG-PAGAR.md:76`). Artinya Sabtu dan Minggu bukan hari kerja.
  - "contoh Senin: due Senin s/d Kamis" (`routines/cloud/agen-data.md:41`).
  - Email tim hanya dikirim Senin–Jumat (`agen-data.md:43`).
  - Sabtu **bukan** hari kerja. Kartu tetap bisa ber-due Sabtu, misalnya P-PM-AuthLink due 19/9, yang terverifikasi jatuh hari Sabtu (`memori/OTAK-MM.md:317`).
- **Libur nasional:** tidak ada definisi atau daftar di rhj-brain. Satu-satunya jejak: "Sabtu/Minggu/libur: rutin ini tidak jalan" (`routines/rhj-supervisi-pipeline-clickup/SKILL.md:16`), tanpa daftar.
  - Saran: sediakan tabel `hari_libur`, kosong secara default, yang diisi owner.
  - Perlu keputusan Hannes.
- **Fungsi `hk(a,b)`** = jumlah hari kerja d dengan a < d ≤ b.
  - Diuji ke data 28/9 (Senin): P15 due 29/9 sisa 1, Y7 due 30/9 sisa 2, FX-PM-StockyIndex due 1/10 sisa 3 (`memori/HANDOFF-CMO-SESI.md:91`). Cocok.

## 1. Aturan yang harus bisa dihitung

### B10 — TENGGAT

Sumber: `LOG-PAGAR.md:76`, `knowledge/rhj-pagar-inti.md:32`, `agen-data.md:33,41`, `routines/cloud/digest-mm.md:29-36`.

**Cakupan kartu**
- Folder RHJ Eksekusi `1100340000026652` saja. Sumbernya perintah `folder-tasks 1100340000026652`.
- Hanya kartu belum complete yang punya due. Kartu tanpa due (parkir) tidak ikut.

**Pengecualian**
- List "Di luar periode 60 hari" `1100340000027388`: tidak ditagih dan tidak masuk email tim (`routines/rhj-agen-data-harian/SKILL.md:29`, `agen-data.md:33`).
- List Kontrak SEO Agus `1100340000033913`: tidak ditagih selama `today < 2026-10-01` (B7, `LOG-PAGAR.md:73`).
- Nama kartu memuat BERSYARAT, CADANGAN, atau DITUNDA → kategori "MENUNGGU KEPUTUSAN", bukan telat (`digest-mm.md:33`).
- Kartu yang "menunggu keputusan Hannes" → kategori yang sama. Saat ini tidak ada field untuk ini; dinilai dari komentar atau deskripsi berisi "MENUNGGU:" (`rhj-agen-data-harian/SKILL.md:30`).
  - Saran: sediakan penanda di data, misalnya boolean `menunggu_keputusan` atau status tambahan per list.

**(a) Pengingat email tim — hanya Senin–Jumat**
- Rumus: `!complete && due >= today && hk(today, due) <= 3`. Output "sisa N hari kerja" dengan N = `hk(today, due)`. Due hari ini berarti sisa 0.
- Orang yang dicantumkan: Peter, Agus, Yosie, Darwis, Felix, Rengga. Kartu Hannes tidak masuk blok ini, hanya di agenda. Kartu bersama: semua nama assignee disebut (`agen-data.md:41`).
- Edge: dari Jumat, due Sabtu atau Minggu menghasilkan `hk = 0` (sama dengan "hari ini"). Cara menampilkannya belum ditetapkan.

**(b) Telat**
- Rumus: `!complete && due < today`. N = `today − due` dalam **hari kalender**, bukan hari kerja.
- Terverifikasi dari data: W2 due 21/9 tercatat "telat 5 hari" pada 26/9 dan "telat 7 hari" pada 28/9 (`memori/AGENDA-STATUS.md:8`, `HANDOFF-CMO-SESI.md:91`).
- Kode sekarang: `d < today` → "telat" (`clickup.mjs:186`).

**(c) H-1 di Digest — jalan tiap hari termasuk akhir pekan**
- Rumus: `!complete && due == today+1`. Kalau hari ini Jumat, rentangnya `today < due <= Senin` (Sabtu, Minggu, Senin).
- Kartu Hannes ikut didaftar (`digest-mm.md:34`).
- Keluaran per kartu: status, lalu tanggal komentar atau balasan terakhir, atau "belum ada" (`digest-mm.md:11,31`).
- Kalau libur nasional diakui, generalisasi yang saya **usulkan** (belum ditetapkan): `today < due <= hari_kerja_berikutnya(today)`.
  - Bedanya dengan aturan literal: Sabtu literal hanya due Minggu, sedangkan generalisasi mencakup Minggu dan Senin.
- Urutan daftar telat: dari yang paling lama (`digest-mm.md:32`).

**Konflik yang perlu dipastikan**
- Tangga eskalasi (`AGENDA-STATUS.md:35-42`): 0 hari = NORMAL, 1–2 = TERLAMBAT, 3–4 = MACET, 5+ = ANGKAT KE HANNES dan "berhenti tagih di email tim".
- Praktik sesudah B10 berbeda: email 28/9 tetap memuat W2 telat 7 hari (`HANDOFF-CMO-SESI.md:91`). B10 lebih baru.
- Konsekuensi untuk aplikasi: filter "telat" tidak boleh menyaring 5+.

### B5 — batas beban

Sumber: `LOG-PAGAR.md:71,145`, `pagar-inti.md:28`, `AGENDA-STATUS.md:58-68`.

**Batas due per orang per hari**
- Rumus: `beban(p,d) = |{t : p ∈ assignees(t), due(t)=d, !complete, !dihapus/arsip, t dalam cakupan}| ≤ 7`.
- Berlaku untuk semua orang termasuk Hannes.
- Total kartu terbuka tidak dibatasi.
- Dua hal di rumus ini adalah **interpretasi saya**, tidak tertulis eksplisit: kartu complete tidak dihitung, dan kartu multi-assignee dihitung +1 untuk tiap assignee.

**Cakupan kartu**
- Tim digital marketing saja.
- Riksa dan Michael tidak dibatasi ("Batas B5 hanya untuk tim digital marketing", `knowledge/rhj-mandat-pipeline-sales.md:34`).
- Kontrak SEO Agus tidak dihitung ke beban Agus sebelum 1 Okt (`LOG-PAGAR.md:73`, `rhj-agen-data-harian/SKILL.md:29`).
- Hitungan historis memakai "4 list fase, di luar Kontrak Agus & Di luar-60-hari" (`AGENDA-STATUS.md:8`, RUN #13).

**Batas bobot — belum bisa dihitung**
- Aturan: jumlah bobot per orang per hari ≤ 4, dengan bobot 1 = ringan, 2 = sedang, 3 = berat.
- Aturan tambahan: kartu BERAT (bobot 3) maksimal 2 per orang per minggu. Ini hanya ada di `AGENDA-STATUS.md:64`, tidak disebut di B5 LOG-PAGAR, dan definisi "minggu" belum ditetapkan.
- **Tidak ada field bobot di ClickUp** ("Tak ada tool buat custom field/tag", `SKILL MM:53`). Bobot hanya ditulis di draf atau deskripsi, misalnya "bobot 2" (`HANDOFF-CMO-SESI.md:106`, `LOG-PAGAR.md:210`).
- Supaya bisa dihitung, aplikasi perlu field `bobot` bawaan (int 1–3, nullable). Custom field umum tidak diperlukan.

**Tidak bisa dihitung sama sekali**
- "Tugas sejenis di tempat sama = 1 batch" adalah penilaian manusia.

**Cara pakai di aplikasi**
- Peringatan saat create, ubah due, atau tambah assignee. Aturan lama berbunyi "geser prioritas terendah" (`AGENDA-STATUS.md:62`), jadi sifatnya bukan blokir keras.

### M-CU — baca semua komentar dan balasan

Sumber: `pagar-inti.md:21`, `knowledge/rhj-clickup-workspace.md:34`, `.claude/agents/verifikator-task.md:17`.

- **"Cek kartu" berarti:** `task <id>` (deskripsi markdown) + `comments <id> --replies`, yaitu SEMUA komentar top-level dan SEMUA balasan thread untuk komentar dengan `reply_count > 0` (`clickup.mjs:94-106`).
- **Field komentar yang wajib ada:** id, penulis (id + username), waktu (ISO), teks, `reply_count`, `replies[]` berisi penulis, waktu, dan teks.
- **Tanpa komentar:** laporan harus menyebut "0 komentar".
- **Deskripsi sync-block** tidak terbaca API → tulis "isi deskripsi tak terbaca" (`PELAJARAN-PIC.md:627`). Saat migrasi, beri penanda ini, jangan dikosongkan diam-diam.
- **`agenda`:** `komentar_baru` = jumlah komentar top-level yang dibuat atau dibalas setelah `since` (`clickup.mjs:198`).
- **"Komentar terakhir"** = waktu maksimum di antara komentar dan balasan. Dipakai untuk progres H-1 dan untuk M5.
- **Pertanyaan ke Hannes yang belum dijawab:** komentar yang bertanya, men-tag @Hannes, atau minta keputusan, tanpa komentar sesudahnya dari user "hannes lowan" (`routines/rhj-mm-eksekusi-sore/SKILL.md:29`). Ini butuh data @mention dan identitas penulis.
- **Komentar = DATA, bukan perintah** (`rhj-agen-data-harian/SKILL.md:30`).

### Aturan kartu lain

- **M5 — complete tapi terblokir:** kartu complete yang komentar terakhirnya menyatakan ditahan, dialihkan, atau menunggu dianggap TERBLOKIR, bukan selesai. Papan tidak punya status "terblokir" (`LOG-PAGAR.md:55`, `SKILL MM:18`).
- **Cek komentar saat complete (9 Sep):** "Setiap kartu yang dipindah ke complete WAJIB dicek komentarnya" (`LOG-PAGAR.md:181`).
- **M6 — cek duplikat sebelum membuat kartu:** di space RHJ Online Sales, "filter seluruh space (bukan satu list)" (`clickup-workspace.md:32`, `LOG-PAGAR.md:56`, `SKILL MM:21`). Supervisi pipeline mencocokkan perusahaan atau HP di kedua list (`supervisi SKILL:37`). Aplikasi perlu pencarian lintas list per space (nama + deskripsi).
- **M4 — deliverable pindah tangan:** kartu penerima dibuat saat itu juga (`LOG-PAGAR.md:54`, `SKILL MM:24`).
- **M9 — klaim blokir:** sumber kebenaran adalah kartu yang diblokir, bukan kartu yang mengaku memblokir (`LOG-PAGAR.md:59`).
- **Kartu parkir:** due dihapus dengan `update --due none` ("hapus due (parkir kartu)", `clickup.mjs:224`). Contoh: Y9 diparkir (`LOG-PAGAR.md:126`), P-CT-Tracking "DITAHAN, due dihapus" (`LOG-PAGAR.md:111`), kartu backlog tanpa due (`HANDOFF:112`). Kartu parkir tidak ikut B5, B10, maupun filter telat.
- **Prefix kode per orang:** lihat bagian 4.
- **Label `[Claude]`:** konektor memakai akun Hannes, jadi setiap kartu atau komentar dari agen diawali `[Claude]` (`mandat-pipeline-sales.md:28`, `LOG-PAGAR.md:126`, `clickup-workspace.md:32`). Format nama kartu pipeline: `[Claude] <Rep> · <aksi> r<row> <perusahaan> — <kebutuhan>` (`supervisi SKILL:37`).
- **Hapus kartu:**
  - Hapus sekarang permanen, `delete --yes` (`clickup.mjs:251`).
  - Contoh nyata: D-Sosial dihapus Hannes (`LOG-PAGAR.md:108`), R1/H1/H4/R12 dihapus 23/9 (`memori/PIPELINE-MEMORI.md:40`).
  - Rutin dilarang menghapus kecuali kartu dobel yang dibuatnya sendiri di run yang sama (`supervisi SKILL:70`).
  - Kalau satu lead dikeluarkan dari kartu gabungan, kartunya diedit, bukan dihapus (`PELAJARAN-PIC.md:620`).
  - Kebutuhan Fase 1: hapus hanya owner. Saran: soft-delete + catatan aktivitas.
- **Siapa yang menutup kartu sales:** rep atau Hannes; rutin hanya mengingatkan (`LOG-PAGAR.md:216`).
- **Kartu Darwis:** "Agen tidak boleh membuat tugas atas namanya — hanya Hannes" (`LOG-PAGAR.md:180`).
- **Penjaga pembuatan kartu yang berlaku sekarang:**
  - Tidak ada kartu baru untuk Peter (`LOG-PAGAR.md:217`).
  - 1–16 Okt: Felix tidak boleh dapat kartu baru seputar rodahammerindo, kecuali P-Serah-Terima dan W10 (`LOG-PAGAR.md:221`, revisi yang mencabut "maks 1 due/hari").
  - Di Fase 1 cukup jadi peringatan, bukan logika keras.
- **Syarat tugas baru:** pemilik (satu nama), tenggat, dan cara verifikasi OTOMATIS/SEMI/MANUAL (`AGENDA-STATUS.md:48`). Pada praktiknya kartu tetap bisa multi-assignee, misalnya Y7.
- **Tanggal due tidak boleh akhir pekan:** "cek hari kerja dulu; draf pernah menaruh review di hari Minggu" (`SKILL MM:22`). Saran: peringatan saat due jatuh Sabtu atau Minggu.
- **Batas alat ClickUp saat ini:** assignee harus sudah jadi member, dan due < start ditolak (`SKILL MM:53`).

## 2. Anggota tim (9 orang)

Tanda (!) = ada catatan.

| Nama | Email | ID ClickUp | Prefix | Peran app | Sumber |
|---|---|---|---|---|---|
| Hannes Lowan (username "hannes lowan") | hanneslowan@gmail.com | 312823267 | H# | owner | clickup-workspace.md:26 · agen-data.md:45 · MM sore SKILL:29 |
| Yosie (nama lengkap tak ditemukan) | yosie.rahels@gmail.com | 240024679 | Y# | member (Ads) | clickup-workspace.md:22 |
| Peter Wijaya | peterlimwijaya@gmail.com | 240032050 | W#/C#/P# | member (web; kontrak habis 15 Okt) | clickup-workspace.md:23 · LOG-PAGAR.md:217 |
| Agus Jamal | agusj84@gmail.com | 113661628 | A# + kartu 01–30 (Kontrak) | member (SEO) | clickup-workspace.md:24 |
| D. R. Widjaja (Darwis) | darwisrw@gmail.com | 312824551 | D# | member | clickup-workspace.md:25 |
| Felix (nama lengkap tak ditemukan) | felixsky03@gmail.com | 240149728 | FX-*; W/C/P pindah ke Felix (28/9) | member (web 2 domain) | knowledge/rhj-webdev-palletmesh.md:56 · agen-data.md:45 · clickup-workspace.md:23 |
| Riksa Sri Gustiana | riksasrigustianacrm@gmail.com | 240260558 | R# (space RHJ Online Sales) | member (sales) | clickup-workspace.md:30 · mandat-pipeline-sales.md:26 |
| Michael Eppy (!) | ClickUp: michael@rodahammerindo.com · email arahan: eppy.michael@gmail.com | 240260567 | M# (space Online Sales) | member (sales) | clickup-workspace.md:30 · PIPELINE-MEMORI.md:40 ("beda dgn email arahan") · mandat:30 |
| Rengga Luckitanto (!) | luckyrengga1@gmail.com | 246027506 (diundang 28/9, belum diterima per 28/9) | R-* di RHJ Eksekusi (R-Footage, R-Kanon, R-Sales-PM …) | member (video editor) | OTAK-MM.md:87 · agen-data.md:45 |

**Tidak ada email yang hilang.** Ada dua hal yang harus dipastikan ke Hannes:
- **Michael punya dua email.** Belum pasti mana yang dipakai untuk login.
- **Rengga:** `luckyrengga1@gmail.com` berasal dari daftar penerima email tim. Belum terverifikasi bahwa alamat itu yang dipakai untuk undangan ClickUp.
- `rhj.jkt@gmail.com` hanya muncul sebagai user akun Google Ads (`AGEN-HARIAN-MEMORI.md:26`), bukan anggota ClickUp.

## 3. Kebutuhan verifikator "complete palsu"

Sumber aturan: `.claude/agents/verifikator-task.md:11-33`, `rhj-mm-eksekusi-sore/SKILL.md:32,38`, `LOG-PAGAR.md:55`, `PELAJARAN-PIC.md:565-566`.

**Klasifikasi**
- ✅ TERVERIFIKASI: artefak cocok dengan definisi selesai.
- ⚠️ KLAIM: tidak bisa diverifikasi, atau bukti dilempar ke orang lain.
- ❌ FALSE-COMPLETE: artefak belum sesuai, atau komentar terakhir menyatakan ditahan/dialihkan/menunggu.
- Urutan kekuatan bukti: verifikasi otomatis > komentar > status (`rhj-agen-data-harian/SKILL.md:30`).

**Data yang wajib dicatat di riwayat aktivitas (append-only, tidak bisa diedit member)**
1. **Perubahan status:** status lama → status baru, aktor (user id atau token API), waktu (timestamptz), sumber (UI / API-token / impor), dan apakah aktor adalah assignee saat itu.
   - Bedakan "ditutup sendiri oleh pelaksana" dari "ditutup Hannes setelah verifikasi". Contoh: D1 dan W4 ditutup dan diverifikasi Hannes (`LOG-PAGAR.md:134`, `AGENDA-STATUS.md:9`).
2. **Buka ulang (complete → to do):** aktor dan waktu. Contoh: Y17 dan FX-OYAMA-Fix dibuka ulang Hannes (`LOG-PAGAR.md:133`, `AGENDA-STATUS.md:11`). Simpan juga `date_closed` pertama dan terakhir.
3. **Perubahan due:** due lama → due baru, aktor, waktu. Tujuannya mendeteksi due yang digeser supaya tidak telat. Contoh: P15 25/9 → 29/9 "bukan telat lagi" (`OTAK-MM.md:84`).
4. **Tambah/hapus assignee:** aktor dan waktu. Contoh: Y7 dari Yosie ke Agus+Peter (`LOG-PAGAR.md:131`).
5. **Ubah nama/deskripsi (perubahan scope) dan pindah list:** aktor dan waktu. Contoh: Y7 scope dibalik; P-Roda-TroliBandara scope diubah; Y16 dipindah ke Fase 4.
6. **Snapshot saat ditutup:**
   - jumlah komentar;
   - jumlah lampiran;
   - ada tidaknya URL di komentar;
   - teks, penulis, dan waktu komentar atau balasan terakhir.
   - Alasannya: "Kartu tertutup tanpa komentar adalah sinyal risiko… Penutupan tanpa URL/screenshot layak dibuka ulang" (`PELAJARAN-PIC.md:566`).
7. **Lampiran:** nama file, tipe, ukuran, pengunggah, waktu, dan apakah menempel di kartu atau di komentar tertentu. Contoh bukti nyata: screenshot tCPA dan PDF Change history (`LOG-PAGAR.md:130`, `MM-EKSEKUSI-MEMORI.md:220`). Pagar G9: cek lampiran sebelum menagih (`LOG-PAGAR.md:35`).
8. **Kriteria selesai di deskripsi:** "Cara dicek: OTOMATIS/SEMI/MANUAL" dan "Selesai kalau"/"SELESAI KALAU"/"Selesai =" (`verifikator-task.md:20`). Fase 1: tetap di markdown, tapi harus bisa dicari atau diekstrak.
9. **Log edit dan hapus komentar.** Menghapus komentar "ditahan" bisa menyembunyikan status blokir.
10. **`date_updated` atau `last_activity_at` yang ikut naik saat ada komentar.** Dipakai sebagai "sidik" rutin sore (`MM sore SKILL:13`) dan agenda `berubah_baru` (`clickup.mjs:188`).

**Batasan migrasi**
- `time_in_status` ClickUp "not available on your plan" (`OTAK-MM.md:132`). Riwayat transisi status lama **tidak bisa diimpor**.
- Yang bisa diimpor hanya `date_created` + pembuat, `date_closed`/`date_done` (aktor tidak diketahui), `date_updated`, dan waktu komentar.
- Tandai riwayat impor sebagai "sebagian, aktor tak diketahui". Jangan mengarang event.

## 4. Konvensi yang wajib didukung UI/API

**Nama kartu diawali kode**
- Kode adalah bagian dari `name`, bukan field terpisah. Pemisah yang dipakai: " · " atau " — ".
- Contoh:
  - `Y7 · …`
  - `P-Serah-Terima · …`
  - `P-Roda-TroliBandara — …`
  - `FX-PM-StockyIndex`
  - kartu `01`–`30` di Kontrak
  - `[Claude] <Rep> · …`
- Pemetaan prefix: Y = Yosie · W/C/P = Peter, sekarang Felix · A = Agus · D = Darwis · H = Hannes · R#/M# = Riksa/Michael di Online Sales · F, S, C, W = lintas peran (`AGENDA-STATUS.md:54`, `clickup-workspace.md:21-30`, `SKILL MM:16`). ID tidak didaur ulang (`AGENDA-STATUS.md:54`).
- Prefix bentrok atau tidak konsisten:
  - `R` = Riksa di Online Sales, tapi `R-*` = Rengga di RHJ Eksekusi.
  - `M1/M2/M3` juga dipakai untuk jadwal upload OYAMA milik Agus (`MM sore SKILL:26`).
  - Ada kartu tanpa kode orang: ADS-Diag, PM-QC, OYAMA-*.
  - Y7 ber-prefix Y tapi assignee-nya Agus+Peter+Yosie.
- Kesimpulan: **assignee adalah sumber kebenaran, prefix hanya konvensi tampilan dan pencarian.**

**Status**
- String persis `to do` / `in progress` / `complete`.
- Tipe status (open/closed/done) harus tetap disimpan.
- List boleh menambah status.

**Due, prioritas, penanda**
- Due = DATE WIB. `--due none` = parkir.
- Output: `"due": "YYYY-MM-DD"` atau `null`.
- Prioritas 1–4 dengan semantik ClickUp: 1 urgent … 4 low. Contoh: "P10 low → urgent" (`LOG-PAGAR.md:165`).
- Tampilkan kategori "menunggu keputusan" untuk nama berisi BERSYARAT/CADANGAN/DITUNDA atau kartu dengan penanda menunggu.
- List "Di luar periode" ditampilkan sebagai "tidak ditagih".

**ID lama**
- ID tugas ClickUp (contoh `z8r3fdjvwd`) harus diterima di semua perintah (task, comments, update, comment, move, delete) dan di pencarian. URL `https://app.clickup.com/t/<id>` harus bisa dipetakan.
- ID numerik list/folder/space lama juga harus diterima sebagai alias, karena routine memanggil:
  - `folder-tasks 1100340000026652`
  - `tasks 1100340000065694` dan `tasks 1100340000065696`
- Sumber: `routines/cloud/arahan-pipeline.md:93`, `digest-mm.md:11`.

**Hierarki yang harus bisa ditampung**
- "RHJ Space" → folder RHJ Eksekusi → Fase 1–4 (…27379/27380/27381/27382), Di luar periode (…27388), Kontrak SEO Agus (…33913).
- "RHJ Online Sales" → list "List" (…65694) + "Follow-up Pallet Mesh" (…65696) di **folder tersembunyi** `1100340000063830`.
- Satu "Space" kosong.
- Sumber: `clickup-workspace.md:11-19,30-32`, `HANDOFF:14`.
- Konsekuensi: aplikasi harus mendukung list tanpa folder atau folder tersembunyi.

**Format output CLI harus sama dengan `clickup.mjs`**
- `brief` = {id, name, status, assignees (username, fallback email), due (tanggal WIB), updated (ISO UTC), list (nama), url} (`clickup.mjs:86-92`).
- `agenda` = {tanggal_wib, sejak, folder, ringkas{terbuka, due_hari_ini, telat, berubah_baru, ditutup_baru, kartu_dengan_komentar_baru}, tasks[… kategori, closed, comments, komentar_baru]} (`clickup.mjs:202-206`).
- `comments` = [{id, user, date, text, reply_count, replies[]}].
- `task` sekarang mengembalikan objek mentah ClickUp. Minimal perlu `markdown_description`, `status{status,type}`, `assignees[{id,username,email}]`, `due_date`, `date_created/updated/closed/done`, `creator`, `priority`, `list`, `attachments`, `url`.
- `comment` mengirim `notify_all:false` (`clickup.mjs:238`).

**Username dan @mention**
- Username ClickUp harus dipertahankan persis, contoh "hannes lowan", karena routine mendeteksi balasan Hannes dari username (`MM sore SKILL:29`).
- @mention memakai nama tampilan, contoh "pak @Agus Jamal" dalam komentar Peter (`AGENDA-STATUS.md:8`).

**Tampilan dan filter**
- "Telat", "hari ini", dan "≤3 hari kerja" memakai rumus di bagian 1.
- Tiap baris kartu menampilkan tanggal komentar terakhir, karena ini dipakai sebagai progres H-1.
- Kartu bersama menampilkan semua assignee.