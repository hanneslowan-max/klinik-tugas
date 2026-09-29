# Daftar perubahan rhj-brain untuk pindah dari ClickUp (DRAF)

Status: draf 29 Sep 2026. Difinalkan setelah impor asli + probe ClickUp (STATUS langkah 4–5). **Daftar saja. Perubahan dikerjakan di sesi CMO dengan ACC Hannes, lalu di-push ke main + claude/state.** Sumber: `docs/riset/baca-sapuan.md` §5, `docs/riset/baca-routine.md`, `docs/riset/kritik.md` §D, `cli/README.md`.

## Pendekatan (sesuai K3 ACC)
`tools/clickup.mjs` diganti file dua-mode, yaitu `cli/tugas.mjs` dari repo ini. Satu file yang sama dipasang dua kali:
- sebagai `tools/clickup.mjs`, default ke ClickUp;
- sebagai `tools/tugas.mjs`, default ke aplikasi.

Saat cutover cukup set `TUGAS_BACKEND=tugas`. Dengan cara ini 6 prompt routine di UI claude.ai (semuanya menyebut `node tools/clickup.mjs`) tidak perlu diedit, dan izin `.claude/settings.json` untuk `Bash(node tools/clickup.mjs:*)` tetap berlaku. Rollback = hapus `TUGAS_BACKEND`.

## P0: wajib saat cutover (tanpa ini routine putus atau tim diarahkan ke ClickUp)
| # | File | Perubahan |
|---|---|---|
| 1 | `tools/clickup.mjs` + `tools/tugas.mjs` (baru) | Isi dengan `cli/tugas.mjs` rhj-tugas. Boleh dipasang lebih awal saat paralel, karena default ClickUp tidak berubah |
| 2 | `tools/README.md` | Env `TUGAS_API_URL`, `TUGAS_API_TOKEN`, `TUGAS_BACKEND`; perintah baru `activity`, `resolve`, `search`, `tenggat`, `backend`, `comment --reply-to`; `delete` hanya owner; hapus catatan kuota MCP |
| 3 | `routines/cloud/agen-data.md` L41 + `routines/rhj-agen-data-harian/SKILL.md` L60 | Ubah penutup email tim "tandai kartu di ClickUp" menjadi "di aplikasi Tugas RHJ (https://tugas.palletmeshindonesia.com)". Ubah juga pesan galat di L47 |
| 4 | `routines/cloud/arahan-pipeline.md` L78, L90–100 | Ubah blok "KARTU CLICKUP SIAP DITUTUP … klik complete" ke aplikasi Tugas. Catatan chat ClickUp menunggu keputusan pengganti chat |
| 5 | `.claude/agents/verifikator-task.md` L3–17 | Ganti tool MCP dengan `clickup.mjs agenda/task/comments --replies` + `activity <id>`, yaitu riwayat status/due/assignee lengkap dengan aktor dan snapshot saat ditutup |
| 6 | `.claude/skills/rhj-manajer-marketing/SKILL.md` L13, L52–53 | Ganti `clickup_filter_tasks` dengan `folder-tasks`. Bagian "Batas alat ClickUp" tidak berlaku lagi |
| 7 | `CLAUDE.md` L25/L28 + `knowledge/rhj-pagar-inti.md` L21 (M-CU) | Ubah "ClickUp = REST" menjadi "Tugas lewat `tools/clickup.mjs` (backend aplikasi Tugas)". M-CU tetap berlaku (baca semua komentar + balasan); sekarang komentar tidak lagi terpotong di 25 |
| 8 | Env "Marketing" (tindakan Hannes) | Tambah `TUGAS_API_URL`, `TUGAS_API_TOKEN` (token bot scope baca), dan `TUGAS_BACKEND=tugas`. `CLICKUP_API_TOKEN` dibiarkan dulu sebagai jalur rollback. Lepas konektor MCP ClickUp |
| 9 | `deliverables/PENGUMUMAN-APP-TUGAS-<tgl>.md` (baru) | Pengumuman untuk tim dan sales: URL, cara login, ganti password, cara lapor di kartu |
| 10 | `memori/LOG-PAGAR.md` + `memori/PELAJARAN-PIC.md` | Tambah satu entri cutover (append-only) |

## P1: minggu pertama sesudah cutover (shim menutup kebutuhan sementara)
- `routines/cloud/_UMUM.md` L18, L25 · `README.md` L22, L41 · `digest-mm.md` L11, L35, L42 · `analisa-ads.md` L18, L29 · `analisa-pipeline.md` L27 · `seo-geo.md` L28: ganti kata "ClickUp" dan nama token.
- `knowledge/rhj-clickup-workspace.md`: tulis ulang isinya (hierarki, URL aplikasi, 9 anggota + bot, "ID lama = ID"). Nama file tetap, karena wikilink dirujuk dari 29 file.
- `deliverables/PROMPT-ROUTINE-UI-24Sep.md`: siapkan 6 prompt baru untuk ditempel Hannes. Sesudah ditempel, `CLICKUP_API_TOKEN` boleh dicabut.
- `knowledge/rhj-mandat-pipeline-sales.md` L16, L25–31: dikerjakan setelah ada keputusan pengganti chat grup sales.
- `memori/AGENDA-STATUS.md` seksi "PAPAN TUGAS DI CLICKUP" (L432+) dan `memori/OTAK-MM.md` L33, L220: perbarui sekali.
- `.claude/settings.json`: tambah `Bash(node tools/tugas.mjs:*)` (opsional).

## P2: sebelum ClickUp ditutup / dokumen dipublikasikan
- `deliverables/REPORT-GOLIVE-ADS-PALLETMESH-26Okt.html/.pdf` + `CHECKLIST-GOLIVE-PALLETMESH-26Okt.md`: cukup ganti domain `app.clickup.com/t/` menjadi `tugas.palletmeshindonesia.com/t/`. ID tetap sama.
- `deliverables/JD-WEB-MARKETING-TECH-26Sep.html`.
- Teks "ClickUp" di knowledge lain, 5 agent, dan 5 skill PIC.
- Header "ARSIP – ClickUp" di `routines/rhj-*` legacy.

## Tidak perlu diubah
Memori historis (append-only), deliverables lama, dan `probe/`. ID lama tetap bisa dibuka (`/t/<id>`) dan dicari, termasuk tempelan URL `app.clickup.com/t/…`.
