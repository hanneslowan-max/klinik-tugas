
**Sapuan referensi ClickUp di /home/user/rhj-brain (baca saja, 29 Sep 2026)**

Ringkasnya: 102 file cocok, dengan 671 baris cocok gabungan. 100 file menyebut "clickup"; 2 lainnya hanya berisi ID tugas. Ada 129 ID tugas ClickUp unik yang dirujuk di 26 file. Hasil `audit-free` nyata ditemukan (23/9): 198 task, 65 lampiran 16,1 MB, custom field 0. Tidak ada file yang saya ubah.

## 1. Daftar file

**Cara hitung:** skrip `/tmp/claude-0/-home-user/168ff345-78cf-558b-8fbd-6c6e11832fa5/scratchpad/scan.sh`, yang menjalankan `grep -cP` per pola untuk tiap file (tanpa `.git`). Hasil mentahnya ada di `scan.tsv` di folder yang sama.

**Arti label** (angka pertama = baris cocok gabungan; angka di belakang label = jumlah baris untuk jenis itu):
- `CLI`: baris yang memuat `clickup.mjs`
- `MCP`: baris dengan nama tool `clickup_*` atau `mcp__ClickUp`
- `URL`: `app.clickup.com` atau `api.clickup.com`
- `IDlist`: ID `110034` + 10 digit (workspace/space/folder/list)
- `IDuser`: 9 ID user ClickUp
- `IDtask`: pola `z8r3` + 6 karakter
- `IDchat`: pola `z8r3…-NNN`
- `TOKEN`: `CLICKUP_API_TOKEN`
- `teks`: hanya kata "ClickUp"

**Ringkasan per grup (file / baris):** routines/cloud 8/27 · routines legacy 5/30 · .claude/agents 7/15 · .claude/skills 9/16 · knowledge 15/59 · tools 2/43 · memori 13/233 · deliverables 40/239 · lainnya 3/9.

**Folder tanpa referensi atau tidak ada:**
- `docs/` dan `perusahaan/`: 0 referensi (`grep -il clickup docs/* perusahaan/*` keluar dengan exit 1).
- `agents/` dan `skills/` di root tidak ada, padahal CLAUDE.md menyebutnya.

**routines/cloud (aktif)**
- README.md 2: teks
- _UMUM.md 2: CLI1 TOKEN1
- agen-data.md 7: CLI3 IDlist2 IDtask1 TOKEN1
- analisa-ads.md 2: CLI1 IDtask1
- analisa-pipeline.md 1: teks
- arahan-pipeline.md 8: CLI3 IDlist1
- digest-mm.md 4: CLI2 IDlist1 IDtask1
- seo-geo.md 1: teks

**routines legacy (routines/rhj-*)**
- rhj-agen-data-harian/SKILL.md 7: MCP2 IDlist1 IDuser1 IDtask1
- rhj-mm-eksekusi-sore/SKILL.md 8: MCP2 IDlist2 IDuser3
- rhj-pipeline-harian/SKILL.md 2: teks
- rhj-supervisi-pipeline-clickup/SKILL.md 9: MCP2 IDlist1 IDuser1 IDchat2
- rhj-verif-konektor/SKILL.md 4: MCP1 IDlist1

**.claude/agents**
- chief-marketing-officer 2: teks
- marketing-manager 2: teks
- pemindai-kreatif 1: teks
- pic-data 1: teks
- pic-pipeline 2: teks
- pic-web 2: IDuser1
- verifikator-task 5: MCP1 IDlist1

**.claude/skills**
- rhj-manajer-marketing 5: MCP1 IDlist1 IDuser1
- rhj-strategi-seo-sem 2: IDlist1
- rhj-cmo-strategi 2: teks
- rhj-pic-pipeline 2: teks
- rhj-pic-data 1: teks
- rhj-pic-kreatif 1: teks
- rhj-pic-seo 1: teks
- rhj-pic-web 1: teks
- competitors/references/content-architecture.md 1: teks (false positive, "vs Clickup")

**knowledge**
- rhj-clickup-workspace 17: IDlist9 IDuser6 IDchat1
- rhj-mandat-pipeline-sales 12: MCP1 IDlist1 IDuser1 IDtask2 IDchat2
- rhj-webdev-palletmesh 8: IDuser3 IDtask2
- rhj-meta-ads-strategi 4: URL1 IDtask3
- rhj-agent-team 3: IDuser1
- rhj-pagar-inti 2: CLI1 MCP1
- teks saja (1–2 baris): gaya-komunikasi-ringkas, migrasi-desktop-baru, rhj-rutin-harian, rhj-telegram-bot, _INDEX-digitalmarketing, _INDEX-marketing, cloud-state-git-repo, rhj-claude-code-role, rhj-dua-domain-pallet-mesh

**tools**
- README.md 16: CLI11 MCP1 IDlist1 TOKEN2
- clickup.mjs 27: CLI15 URL2 IDlist1 TOKEN3

**memori (state)**
- PELAJARAN-PIC 47: CLI3 URL1 IDlist1 IDuser1 IDtask1 TOKEN2
- OTAK-MM 43: CLI1 MCP1 URL3 IDlist1 IDuser4 IDtask21 IDchat1 TOKEN1
- MM-EKSEKUSI-MEMORI 31: MCP2 IDlist1 IDuser4 IDtask9
- HANDOFF-CMO-SESI 29: CLI5 URL3 IDlist3 IDuser2 IDtask13 TOKEN1
- AGENDA-STATUS 24: MCP1 IDlist8 IDuser3 IDtask6
- LOG-PAGAR 23: CLI4 IDlist1 IDtask16
- ARAHAN-PIPELINE-MEMORI 16: IDtask6 IDchat1
- AGEN-HARIAN-MEMORI 10: IDuser1
- PIPELINE-MEMORI 4: IDlist1 IDuser1 IDtask1 IDchat1
- DIGEST-MM 3: teks
- ANALISA-ADS-MENDALAM 1: IDtask1
- ANALISA-SEO-MENDALAM 1: teks
- DRAF-TERTAHAN-agen-data-2026-09-24 1: teks

**deliverables**
- CHECKLIST-GOLIVE-PALLETMESH-26Okt.md 28: CLI1 IDtask18
- REPORT-GOLIVE-ADS-PALLETMESH-26Okt.pdf 26: URL26 IDtask26 (biner; rg melewatinya, grep ikut menghitung)
- PROMPT-ROUTINE-UI-24Sep.md 25: CLI10 IDlist1 IDtask1 TOKEN7
- PERTANYAAN-UNTUK-HANNES-15Sep.md 20: IDlist1 IDuser2 IDtask17
- GROUNDWORK-ADS-PALLETMESH-SEO.md 18: IDtask10
- REPORT-GOLIVE-ADS-PALLETMESH-26Okt.html 15: URL13 IDtask13
- PROMPT-CLOUD-PIC-SEO.md 12: IDlist2 IDuser1 IDtask5
- PROMPT-SESI-BARU-APP-TUGAS-29Sep.md 12: CLI2 IDtask1 TOKEN1
- PROMPT-AgenData-REST-23Sep.md 6: CLI3 IDlist1 TOKEN1
- ANALISA-YOSIE-PM-KEYWORD-16Sep.md 6: MCP1 IDtask2
- DRAFT-KARTU-KONTEN-KREATIF-22Sep.md 6: IDlist2
- GROUNDWORK-ADS-PALLETMESH-ADS.md 6: teks
- DRAFT-AKUN-SOSIAL-LASTRI-24Sep.md 5: IDlist1 IDuser1
- PENGUMUMAN-SALES-CLICKUP-23Sep.md 5: teks
- ANTREAN-FC-H1-H10-23Sep.md 4: IDlist1 IDtask3
- JD-WEB-MARKETING-TECH-26Sep.html 3: teks (JD: tiket dan KPI via ClickUp)
- BRIEF-KREATIF-META-PUTARAN1-27Sep 3: teks
- teks 1–2 baris: 20 file lain, yaitu BANK-KONTEN, BRIEF-TES-VIDEO, DAFTAR-UPSELL, INSIGHT-ADS, INSTRUKSI-AKUN-SOSMED-LASTRI, LAPORAN-MM-14Sep, MEMO-CMO-Meta-Posture, MEMO-CMO-Stop-List, ONBOARDING-EDITOR-LASTRI, ORPHAN-PM-BAGI, PAKET-PRODUKSI-IKLAN, PIPELINE-PERMINTAAN-TROLI, PLAN-ADS-CUSTOM-TROLLEY, PLAN-LAUNCH-LASTRI, REVIEW-PICADS, RINCIAN-INDEXING, RUNBOOK-MIGRASI-CLOUD, RUNBOOK-migrasi-desktop-baru, SHOTLIST-PABRIK, UPDATE-KREATIF-INTEL, cowork-sync/2026-09-12
- false positive (akun TikTok @clickup): riset-sosial/RISET-BIO-AKUN-SERUPA-28Sep.md 4 dan riset-sosial/bio-akun-28Sep.json 3

**Lainnya**
- CLAUDE.md 4: CLI1 MCP1
- .claude/settings.json 1: CLI1 (izin `Bash(node tools/clickup.mjs:*)`)
- probe/HASIL.md 4: CLI1 TOKEN1

**Catatan MCP:** kolom MCP di atas hanya menghitung nama tool persis. Kalau frasa "konektor/MCP ClickUp" dan nama tool tanpa prefix (filter_tasks, get_task_comments, dst.) ikut dihitung, hasilnya 29 file.

**ID ClickUp non-tugas yang ditemukan (jumlah kemunculan, rg -o):**
- Workspace `1100340000004525` (2)
- Space "RHJ Space" / "Team Space" `1100340000021644` (4)
- Folder RHJ Eksekusi `1100340000026652` (21)
- List Fase 1 `…27379` (6), Fase 2 `…27380` (9), Fase 3 `…27381` (6), Fase 4 `…27382` (6)
- List Di luar periode `…27388` (6), Kontrak SEO Agus `…33913` (8)
- Space RHJ Online Sales `…50704` (5), folder tersembunyi `…63830` (1)
- List "List" `…65694` (5), Follow-up Pallet Mesh `…65696` (7)
- Total: 13 ID unik.

**User ID (file/baris):**
- Yosie 240024679: 8/8
- Peter 240032050: 9/9
- Agus 113661628: 7/7
- Darwis 312824551: 5/5
- Hannes 312823267: 8/8
- Felix 240149728: 11/15
- Riksa 240260558: 5/5
- Michael 240260567: 6/6
- Rengga 246027506: 1/1 (ID tambahan; hanya ada di `memori/OTAK-MM.md:87`, belum ada di `knowledge/rhj-clickup-workspace.md`)
- Angka 9 digit lain di repo bukan ID ClickUp: chat Telegram 948838172 dan viewCount TikTok.

**Chat ID (4):** `z8r3fda6dd-1398` (grup sales, 7x), `-1318` (DM Riksa), `-1198` (DM Michael), `-878` (DM Peter).

## 2. ID tugas ClickUp

Pola yang dipakai adalah `z8r3fd` + 4 karakter (10 karakter). Semua 301 token z8r3 di file teks panjangnya 10 karakter. Tidak ada custom task ID atau ID berbentuk 86xxxxx; satu-satunya `86900000` adalah angka follower di JSON.

- Unik: `grep -rhoaP --exclude-dir=.git '\bz8r3[a-z0-9]{6}\b(?!-)' . | sort -u | wc -l` menghasilkan **129**.
- Kemunculan: perintah yang sama tanpa `sort -u`, lalu `wc -l`, menghasilkan **317** (291 tanpa PDF biner).
- File: `grep -rlaP … | wc -l` menghasilkan **26** (25 teks + 1 PDF).
- Bentuk URL: `grep -rhoaP 'app\.clickup\.com/t/[A-Za-z0-9]+' . | sort -u | wc -l` menghasilkan **24** unik di 5 file: REPORT-GOLIVE html+pdf, memori/OTAK-MM.md, memori/HANDOFF-CMO-SESI.md, knowledge/rhj-meta-ads-strategi.md. ID di PDF semuanya juga ada di HTML (selisih 0).
- Sebaran ID unik per folder: memori 121, deliverables 44, knowledge 11, routines/cloud 4, routines legacy 1, .claude 0.
- ID yang paling sering muncul: `z8r3fdeqk2` 13x, `z8r3fdd1wp` 10x, `z8r3fdhq9k` 8x, `z8r3fddu2k` 7x.
- ID di file instruksi aktif (routines/cloud, knowledge, .claude) ada 15: z8r3fdd1wn, fdd1wp, fddu2k, fdet5x, fdet60, fdhcxd, fdhcxe, fdhf2v, fdhf31, fdhqt9, fdhqtb, fdj505, fdj507, fdj638, fdjvwd.

**Kebutuhan tambahan untuk aplikasi baru (terbukti dari repo):**
- ID folder dan list lama dipakai sebagai argumen CLI di prompt yang sedang jalan, misalnya `agenda 1100340000026652` dan `tasks 1100340000065694/65696`.
- User ID lama dipakai di `--add-assignee`, contohnya HANDOFF §12.
- Jadi alias ID lama perlu berlaku untuk space/folder/list/user juga, tidak hanya tugas.
- Rute `/t/<id_lama>` memungkinkan URL lama cukup diganti domainnya.
- Pencarian pakai kode nama (Y7, P15, …) juga dipakai luas; jumlahnya belum dihitung.

## 3. Angka workspace yang pernah tercatat

**Audit REST 23/9** (`memori/PELAJARAN-PIC.md:680-691`, entri 2026-09-23 ~21:50 WIB):
- `whoami`: workspace "Roda Hammerindo Workspace" 1100340000004525, **8 anggota**.
- `audit-free`: 2m28s, **3 space, 11 list, 198 task (146 open, 52 closed)**, sekitar 215 request REST.
- Lampiran task: **65 file, 16,1 MB**. Terhadap batas Free 60–100 MB itu 27%/16%. File terbesar mockup PNG 1,4–1,6 MB.
- Custom field terisi: **0** dari batas Free 60 use (batas bawah).
- Lampiran di komentar dan Docs tidak ikut terhitung.

**memori/HANDOFF-CMO-SESI.md:11-14 (23/9):**
- Paket saat itu: tier Unlimited (berbayar/trial). Kuota MCP 300/24 jam.
- 3 space: "Space kosong", RHJ Space, RHJ Online Sales.
- "Lampiran di seluruh workspace (search 23/9): 7 file (5 gambar, 1 PDF, 1 docx, 1 CSV)". Ini bertentangan dengan audit (65 file). Audit malam itu lebih lengkap karena membaca detail per task; pencarian siang kemungkinan tidak lengkap.

**Angka per space dan folder:**
- RHJ Online Sales 23/9: 66 kartu (28 "List" + 38 "Follow-up PM"), 0 complete (`memori/ARAHAN-PIPELINE-MEMORI.md:135`). "Belum ada custom field & tag" (`knowledge/rhj-clickup-workspace.md:30`).
- Folder RHJ Eksekusi:
  - 16/9: 115 kartu, 36 complete / 79 terbuka (`memori/AGENDA-STATUS.md:482`)
  - 24/9: 74 terbuka, termasuk Kontrak 34 dan Di luar 9 (`AGENDA-STATUS.md:171`)
  - 28/9 08:50: **84 terbuka** (`AGENDA-STATUS.md:8`, `memori/DIGEST-MM.md:37`)
- Anggota: Rengga diundang 28/9, belum menerima (`memori/OTAK-MM.md:87`). Jadi 8 + 1 = 9, sesuai kebutuhan.
- Dari 11 list, 8 ID-nya tercatat di repo; 3 list lainnya tidak teridentifikasi.

**Tidak ditemukan:** jumlah total komentar, jumlah task per list selain di atas, dan total task sesudah 23/9.

## 4. Fitur ClickUp lain di kartu RHJ

- **Custom field:** tidak dipakai. Terisi 0 (PELAJARAN-PIC:686). Skill MM baris 53 mencatat "Tak ada tool buat custom field/tag". "Bobot 1–3" hanya konvensi di `AGENDA-STATUS.md:58`, tidak ada bukti disimpan di field ClickUp.
- **Tag:** tidak ada bukti tag native.
  - "[Claude]" adalah prefix di nama dan komentar (knowledge:32, PENGUMUMAN-SALES:23).
  - "MENUNGGU H8" adalah teks deskripsi (OTAK-MM:250).
  - "tag @hannes lowan" adalah @mention di komentar (OTAK-MM:142).
- **Checklist:** "checklist 6 butir" di Y-Meta-2 `z8r3fdet60` (rhj-meta-ads-strategi:44, LOG-PAGAR:118). Belum terverifikasi apakah checklist native atau teks deskripsi. Pola umum kartu RHJ adalah teks "Cara dicek" / "Selesai kalau" di deskripsi.
- **Subtask:** tidak ada catatan pemakaian. `clickup.mjs:111` mengambil `subtasks=true`, jadi kalau ada, ikut terbaca datar. Belum terverifikasi.
- **Time estimate dan watchers:** tidak ditemukan. Komentar lewat skrip dikirim dengan `notify_all:false`.
- **Dependency:** hanya berupa teks. Contoh: kartu `z8r3fdeqk2` "dependensi tertulis di kartu: 'Y5 selesai dulu.'" (GROUNDWORK-ADS-PALLETMESH-SEO:15). "Ketergantungan P9 dilepas" untuk W10 (LOG-PAGAR:219) belum terverifikasi native atau teks.
- **Start date: DIPAKAI**, dan ini celah di kebutuhan Fase 1.
  - `z8r3fdeqk2` punya start 1 Okt → due 6 Okt (GROUNDWORK-ADS-PALLETMESH-SEO:15).
  - Skill MM baris 53 mencatat "due < start ditolak".
  - Saran: impor dan simpan start_date.
- **Pola yang terbukti dipakai (sudah masuk Fase 1):**
  - Prioritas high/urgent (MM-EKSEKUSI:67, AGENDA-STATUS:241).
  - Multi-assignee Peter+Felix (LOG-PAGAR:219).
  - Due dihapus untuk "parkir" Y8/Y9 (OTAK-MM:219; `--due none`).
  - Kartu dibuka ulang: kartu 05, Y17 (OTAK-MM:214, 206). Riwayat aktivitas harus mencatat ini.
  - Kartu tanpa assignee: R-Footage (DIGEST-MM:38).
  - Folder tersembunyi `1100340000063830`.
- **Lampiran: celah di kebutuhan Fase 1.**
  - Ada lampiran di balasan thread: docx naskah A6 v3 (MM-EKSEKUSI:726). Juga "3 attachment gambar" (ANALISA-YOSIE:132).
  - Tipe file mencakup docx dan CSV, tidak hanya gambar/PDF (HANDOFF:14).
  - Saran: migrasi harus mencakup lampiran komentar dan balasan, plus docx/CSV.
- **Email login:** email ClickUp Michael `michael@rodahammerindo.com` berbeda dari email arahan `eppy.michael@gmail.com` (PIPELINE-MEMORI:40). Perlu diputuskan email mana yang dipakai untuk login.

## 5. DRAF perubahan rhj-brain (tidak ada yang diubah)

**Keputusan arsitektur dulu.** Ini menentukan seberapa besar perubahannya.

- **Opsi A (disarankan): `tools/clickup.mjs` dijadikan shim ke API baru.** Perintah, format output, dan alias ID lama tetap sama.
  - Alasannya: 6 prompt routine UI yang aktif (sumbernya `deliverables/PROMPT-ROUTINE-UI-24Sep.md`, blok "C. DATA" di tiap routine, plus `agenda 1100340000026652`) menulis `node tools/clickup.mjs` dan `CLICKUP_API_TOKEN` secara tetap.
  - Prompt UI "MENANG" atas file repo, dan agent tidak bisa mengubah routine UI (routines/cloud/README).
- **Opsi B: ganti ke `tools/tugas.mjs` di semua file.** Konsekuensinya Hannes harus menempel ulang 6 prompt UI, dan izin `.claude/settings.json` harus ditambah.
- **Dua opsi sama-sama butuh:** Hannes menambah env baru (URL + token API) di environment cloud "Marketing". Selama masa paralel, `CLICKUP_API_TOKEN` disimpan dulu untuk sinkron akhir.

**WAJIB sebelum cutover**
1. `tools/clickup.mjs`:
   - Jadikan shim, atau ganti dengan `tugas.mjs`.
   - Default folder `1100340000026652` (baris 168) perlu dipetakan.
   - `brief.url` (baris 91) diarahkan ke URL aplikasi baru.
   - `move` saat ini lewat API v3 (baris 244); `audit-free`/`fields` hanya relevan untuk ClickUp.
   - Tambah perintah `history <id>` untuk riwayat aktivitas.
   - `task` saat ini mengeluarkan JSON mentah ClickUp, dan routine membaca `markdown_description`. Kunci itu harus tetap ada.
2. `tools/README.md`: dokumentasi CLI dan env baru, perbarui tabel padanan, hapus catatan kuota MCP.
3. `.claude/settings.json`: izin `Bash(node tools/tugas.mjs:*)` (hanya untuk Opsi B; routine berjalan di mode "auto").
4. `routines/cloud/_UMUM.md` §3: ganti "ClickUp = REST saja", nama token, dan pesan gagal "ClickUp tak terbaca".
5. `routines/cloud/agen-data.md` (L22, L26, L32–33, L41, L47):
   - Perintah agenda, folder-tasks, dan task.
   - Folder ID dan ID Y7/Y7-Bid/ADS-Diag.
   - Pagar READ-ONLY.
   - Format email tim `<ID>` ditambah link aplikasi baru.
6. `routines/rhj-agen-data-harian/SKILL.md` L60: penutup email tim "tandai kartu di ClickUp". Masuk wajib karena agen-data.md menyuruh "ikuti PERSIS LANGKAH 7" skill ini. Alternatifnya, override di agen-data.md.
7. `routines/cloud/digest-mm.md` (L11, L35, L42): folder-tasks, comments, folder ID, teks "⏰ TENGGAT: ClickUp tak terbaca".
8. `routines/cloud/arahan-pipeline.md` (L78, L90–100):
   - `tasks 1100340000065694/65696`, `task <id>`.
   - Judul blok "KARTU CLICKUP SIAP DITUTUP".
   - Catatan "fitur chat ClickUp".
9. `routines/cloud/analisa-ads.md` L18: `comments z8r3fdd1wp` (Y8, jalan mulai Senin 5 Okt). ID harus bisa di-resolve di aplikasi baru.
10. `routines/cloud/README.md`: env "Marketing = token ClickUp", keputusan "ClickUp hanya REST", dan kanal chat.
11. `deliverables/PROMPT-ROUTINE-UI-24Sep.md`: siapkan versi baru untuk ditempel Hannes (Opsi B), atau cukup catat bahwa shim menangani (Opsi A).
12. `CLAUDE.md`:
    - L28: aturan "ClickUp = REST" dan padanan MCP.
    - L25: ACC "posting/ubah ClickUp".
    - L8/L16: rujukan clickup-workspace.
13. `knowledge/rhj-clickup-workspace.md`:
    - Tulis ulang isinya: hierarki, URL aplikasi, pemetaan ID lama ke ID baru, 9 anggota (tambah Rengga), status per list, aturan M-CU.
    - Nama filenya disarankan tetap, karena wikilink `[[rhj-clickup-workspace]]` dirujuk dari 29 file.
14. `knowledge/rhj-pagar-inti.md` L21 (M-CU): perintah `clickup.mjs task/comments` dan nama MCP.
15. `.claude/skills/rhj-manajer-marketing/SKILL.md` (L13, L52–53):
    - `clickup_filter_tasks` dan ID list.
    - Bagian "Batas alat ClickUp (teruji)" tidak berlaku lagi di aplikasi baru.
    - Skill ini dibaca routine agen-data.
16. `.claude/agents/verifikator-task.md` (L3–17):
    - LANGKAH 1 memakai tool MCP dan folder ID.
    - Ganti ke CLI baru dan riwayat aktivitas (ini alasan fitur riwayat dibangun).
    - Wajib kalau verifikator masih dipakai sesudah cutover.
17. BARU: pengumuman untuk tim dan sales (login, cara lapor di kartu). Padanan dari `deliverables/PENGUMUMAN-SALES-CLICKUP-23Sep.md`.

**BOLEH SESUDAH cutover** (tidak memutus routine selama ID lama bisa dipakai)
- `knowledge/rhj-mandat-pipeline-sales.md`: kanal chat ClickUp `z8r3fda6dd-1398`, tool MCP chat, wewenang "kartu/komentar/chat ClickUp". Perlu keputusan Hannes: chat di luar Fase 1, lalu grup sales pindah ke mana.
- `knowledge/`:
  - rhj-webdev-palletmesh (user ID, "member ClickUp")
  - rhj-meta-ads-strategi (2 URL `/t/`)
  - rhj-agent-team, gaya-komunikasi-ringkas, _INDEX-digitalmarketing, rhj-claude-code-role, rhj-dua-domain (wikilink)
- `.claude/agents` (5 file):
  - marketing-manager: struktur board, path Windows
  - chief-marketing-officer, pic-pipeline, pic-web, pic-data, pemindai-kreatif: kata "ClickUp"
- `.claude/skills`:
  - rhj-cmo-strategi: daftar stack
  - rhj-strategi-seo-sem L61: list `1100340000033913`
  - rhj-pic-pipeline, rhj-pic-kreatif, rhj-pic-seo, rhj-pic-web, rhj-pic-data: wikilink/teks
- `memori/AGENDA-STATUS.md`: seksi tetap "PAPAN TUGAS DI CLICKUP" (L432+, ID list), dibaca routine. Diperbarui 1x.
- `memori/OTAK-MM.md` L33 dan L220: aturan berdiri "rutin yang membaca kartu ClickUp" dan kuota MCP.
- `deliverables/REPORT-GOLIVE-ADS-PALLETMESH-26Okt.html`/`.pdf` (13 dan 26 baris URL) serta CHECKLIST-GOLIVE (18 baris ID): masih aktif sampai 26 Okt. Cukup ganti domain kalau rute `/t/<id_lama>` ada. Harus beres sebelum akun ClickUp ditutup.
- `deliverables/JD-WEB-MARKETING-TECH-26Sep.html`: tiket dan KPI "ClickUp". Harus beres sebelum JD dipublikasikan.
- `routines/rhj-*` lain (supervisi-pipeline-clickup, verif-konektor, mm-eksekusi-sore, pipeline-harian): cukup tambah header "ARSIP – ClickUp".
- Satu entri append-only di `memori/LOG-PAGAR.md` + `PELAJARAN-PIC.md` saat cutover.

**TIDAK PERLU** (historis; aman selama ID lama bisa dicari)
- memori: AGEN-HARIAN-MEMORI, ANALISA-ADS/SEO-MENDALAM, ARAHAN-PIPELINE-MEMORI, DIGEST-MM, DRAF-TERTAHAN, HANDOFF-CMO-SESI, LOG-PAGAR, MM-EKSEKUSI-MEMORI, PELAJARAN-PIC, PIPELINE-MEMORI (isi lama jangan diubah; append-only).
- knowledge historis: rhj-rutin-harian, rhj-telegram-bot, cloud-state-git-repo, migrasi-desktop-baru.
- deliverables lain: 30+ dokumen dan prompt lama, termasuk PROMPT-AgenData-REST-23Sep, PROMPT-CLOUD-PIC-SEO, PERTANYAAN-UNTUK-HANNES-15Sep, ANTREAN-FC, GROUNDWORK-*, runbook.
- probe/HASIL.md.
- False positive: 3 file (competitors/content-architecture, riset-sosial ×2).

**Masukan untuk tim aplikasi (di luar rhj-brain):**
- Alias ID lama untuk space/folder/list/user, tidak hanya tugas.
- Rute `/t/<id_lama>`.
- start_date.
- Lampiran di komentar dan balasan, termasuk docx/CSV.
- Folder tersembunyi.
- Output `assignees` tetap username (mis. "hannes lowan").
- `status.type` open/closed per list.

Skrip dan hasil hitungan ada di `/tmp/claude-0/-home-user/168ff345-78cf-558b-8fbd-6c6e11832fa5/scratchpad/scan.sh` dan `scan.tsv`.