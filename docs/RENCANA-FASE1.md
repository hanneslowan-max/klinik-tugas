# Rencana Fase 1: Aplikasi Tugas RHJ (pengganti ClickUp)

Status: **menunggu ACC Hannes** · disusun 29 Sep 2026 · dasar: bacaan rhj-brain (baca-saja) + riset platform, rincian riset di `docs/riset/` (catatan: `kritik.md` masih mengusulkan numpang di ERP; itu sudah digugurkan keputusan Hannes 29/9 untuk akun Supabase baru).

## Verdict
- Bisa dibangun dengan biaya **Rp0/bulan**: Supabase Free (akun + email baru), web statis di subdomain Hostinger yang sudah dibayar, dan GitHub Actions gratis.
- API agent meniru jalur REST ClickUp yang dipakai `tools/clickup.mjs`. Akibatnya `tugas.mjs` cukup berupa salinan `clickup.mjs` yang alamat dan tokennya diganti. Kode pembentuk output tidak disentuh, jadi perintah dan format output sama.
- ID ClickUp lama dipakai langsung sebagai ID di aplikasi: tugas, list, folder, space, dan user. `…/t/z8r3fdd1wn` langsung terbuka. Ini penting karena rhj-brain merujuk 130 ID unik `z8r3…` (hitungan grep 29/9).
- Ada satu batasan: **riwayat status lama tidak bisa diimpor.** API ClickUp tidak punya endpoint riwayat, dan `time_in_status` ditolak untuk paket RHJ ("not available on your plan", `memori/OTAK-MM.md` L132).
  - Yang bisa diimpor: kapan dan oleh siapa kartu dibuat, kapan ditutup, dan kapan terakhir diubah.
  - Riwayat lengkap (siapa mengubah apa dan kapan) tercatat mulai saat impor.
- Supabase lama (ERP) tidak disentuh sama sekali, hanya dibaca.

## 1. Stack, hosting, biaya
| Lapisan | Pilihan | Biaya |
|---|---|---|
| Database, login, file | Supabase Free di akun dan org baru, 1 project `rhj-tugas` (region Singapura): Postgres + RLS, login email+password, Storage privat untuk lampiran | Rp0. Batas: DB 500 MB, file 1 GB, egress 5 GB/bulan |
| API agent | Supabase Edge Function `api`: REST + token Bearer, tanpa kuota harian | Rp0. Batas 500 ribu panggilan/bulan. Pemakaian belum dihitung, diukur selama paralel. Web tidak lewat fungsi ini |
| Web | HTML + JavaScript tanpa build, meniru pola ERP. Pustaka disimpan lokal: supabase-js, markdown-it, DOMPurify, SortableJS. Bisa dipasang di layar HP (PWA) | Rp0 |
| Hosting web | Subdomain di Hostinger yang sama dengan ERP (`admin.palletmeshindonesia.com` berjalan di Hostinger, dicek 29/9). Deploy otomatis dari branch `web` | Rp0 tambahan (dugaan; kuota subdomain paket belum dicek). Cadangan: Netlify Free |
| Sinkron dan backup | GitHub Actions di repo rhj-tugas (private) | Rp0 (kuota 2.000 menit/bulan) |

- **Tidak dipakai:**
  - Vercel Hobby, karena ToS-nya membatasi untuk non-komersial.
  - GitHub Pages, karena situsnya publik.
- **Pembanding berbayar:** Supabase Pro $25 ≈ Rp449.619/bulan (kurs 29/9).
- **Catatan akun baru:**
  - Batas 2 project gratis Supabase dihitung per akun, lintas org (docs billing Supabase).
  - AUP Supabase melarang "jumlah akun berlebihan" per orang. Dua akun menurut saya belum berlebihan, tapi statusnya abu-abu.
  - Jangan jadikan akun lama Owner/Admin di org baru, karena slot gratisnya ikut terhitung.

## 2. Skema data
Schema `tugas`, RLS aktif di semua tabel, sign-up publik dimatikan.
- **anggota**
  - `id` bigint = ID user ClickUp. Anggota baru mulai dari 900000000000.
  - `username` verbatim (mis. "hannes lowan"), `email`, `nama`.
  - `peran`: owner / member / bot. `aktif`.
- **ruang → folder → daftar** (Space → Folder → List)
  - `id` text = ID lama.
  - `nama` verbatim (termasuk em-dash).
  - `tersembunyi`, `diarsip`, `urutan`.
- **status_daftar**
  - Isi: nama, tipe (open / custom / closed), urutan, warna.
  - Bisa ditambah per list. "complete" bertipe closed.
- **tugas**
  - Identitas: `id` text (ID lama; kartu baru = `rt` + acak), `daftar_id`, `parent_id`, `nama`.
  - Isi dan status: `deskripsi_md`, `status`, `prioritas` 1–4.
  - Due: `due_at` (ms asli) dan `due_wib` (tanggal, rumus +7 jam yang sama dengan clickup.mjs).
  - Jejak: `pembuat_id`, dibuat / diubah / ditutup / selesai pada.
  - Lain-lain: `diarsip`, `dihapus_pada` (Sampah), `urutan` board, `clickup_url`.
- **tugas_assignee**: banyak assignee per kartu, dicatat kapan dan oleh siapa.
- **komentar**
  - `induk_id` untuk balasan berutas.
  - Teks polos (sama dengan `comment_text`) + isi kaya.
  - Tabel **komentar_mention** untuk @mention.
- **lampiran**
  - Menempel ke tugas atau komentar.
  - Tipe file: gambar, PDF, dan dokumen. SVG/HTML ditolak.
  - File disimpan di Storage privat. Link ClickUp asal ikut disimpan.
- **aktivitas** (append-only)
  - Diisi trigger database, jadi member tidak bisa mengubah atau menghapusnya.
  - Isi tiap baris: aktor, sumber (ui / api / impor / sinkron), dan nilai dari → ke.
  - Jenis yang dicatat: status, buka-ulang, due, assignee ±, nama/deskripsi, pindah list, prioritas, arsip, hapus, komentar, lampiran.
  - Saat kartu ditutup, snapshot jumlah komentar/lampiran + komentar terakhir ikut disimpan. Ini bahan verifikator "complete palsu".
- **notifikasi**: assign, mention, komentar; ada status sudah/belum dibaca.
- **Tabel pendukung**
  - **token_api**: hash token, per anggota/bot, izin baca / tulis / impor, bisa dicabut.
  - **hari_libur**, **pengaturan** (mode cermin/utama), **sinkron_run**.
- **Fungsi hitung**
  - `hk(a,b)`: hari kerja Senin–Jumat, dikurangi hari libur.
  - `beban(anggota, tanggal)`: aturan B5, maksimal 7 kartu due per orang per hari.
  - `tenggat()`: aturan B10, yaitu telat, due hari ini, ≤3 hari kerja, dan H-1 (hari Jumat = due Sabtu–Senin).

## 3. Layar (mobile-first, Bahasa Indonesia)
1. **Masuk:** email + password. Semua halaman lain wajib login. Tautan `/t/<id>` tanpa sesi diarahkan ke Masuk, lalu kembali ke kartunya.
2. **Tugas Saya:** Telat · Hari ini · ≤3 hari kerja · Nanti · Tanpa due.
3. **Jelajah:** Space → Folder → List.
4. **List:** dikelompokkan per status. Filter: assignee, status, due (telat / hari ini / ≤3 hari kerja).
5. **Board:** kanban, kartu digeser antar status (tekan-tahan di HP).
6. **Detail tugas:**
   - Field: status, assignee, due, prioritas, pindah list, arsip.
   - Deskripsi markdown, lampiran, komentar + balasan + @mention.
   - Tab Riwayat.
   - Peringatan B5.
   - Tombol Hapus hanya untuk owner (kartu masuk Sampah).
7. **Cari:** nama, kode (Y7, FX-PM-…), isi, ID lama, atau tempel URL `app.clickup.com/t/…`.
8. **Lonceng notifikasi.**
9. **Admin (owner):** anggota + reset password, token API agent, status per list, hari libur, laporan sinkron, Sampah.

## 4. Endpoint API
Semua endpoint memakai header `Authorization: Bearer <token>`. Jalurnya meniru ClickUp v2.

| Perintah CLI | Endpoint |
|---|---|
| `whoami` | `GET /user`, `GET /team` |
| `folder-tasks <folder> [--closed]` | `GET /folder/{id}/list` → `GET /list/{id}/task?page&include_closed&subtasks` |
| `tasks <list> [--closed] [--full]` | `GET /list/{id}/task` |
| `task <id>` | `GET /task/{id}?include_markdown_description=true`. JSON berbentuk ClickUp; lampiran pakai URL bertanda tangan yang berlaku 1 jam |
| `comments <id> --replies` | `GET /task/{id}/comment` (SEMUA komentar, terbaru dulu) · `GET /comment/{id}/reply` |
| `agenda [folder] [--hours] [--all-comments] [--desc]` | Gabungan endpoint di atas; logika tetap di CLI seperti sekarang |
| `create <list> --name …` | `POST /list/{id}/task` |
| `update <id> …` | `PUT /task/{id}`: nama, desc, status, due / none, prioritas, assignees add/rem |
| `comment <id> --text/--file` | `POST /task/{id}/comment` (balasan: `POST /comment/{id}/reply`) |
| `move <id> <list>` | `PUT /v3/workspaces/{tid}/tasks/{id}/home_list/{list}` |
| `delete <id> --yes` | `DELETE /task/{id}`. Hanya token owner; token bot ditolak 403 |

Endpoint tambahan:
- `GET /x/activity/{id}`: riwayat kartu.
- `GET /x/search?q=`: pencarian.
- `GET /x/tenggat`: angka B5/B10.
- `GET /x/sensus`: hitungan per list.
- `POST /x/import`: khusus token impor.
- `GET /x/export`: untuk backup.

**`tugas.mjs`:**
- Isinya salinan `clickup.mjs`. Yang diganti hanya alamat (`TUGAS_API_URL`), token (`TUGAS_API_TOKEN`), dan throttle.
- Diuji dengan diff otomatis antara output `clickup.mjs` dan `tugas.mjs` pada data yang sama.
- Pengecualian yang boleh beda: domain `url`, dan kartu dengan lebih dari 25 komentar. Di kartu seperti itu `clickup.mjs` sekarang memotong komentar, sedangkan `tugas.mjs` mengembalikan semua.

## 5. Migrasi
1. **Probe ClickUp (GET saja).** Tujuannya mengunci perilaku API sebelum crawl:
   - urutan dan paginasi komentar (ClickUp memberi 25 per halaman);
   - apakah lampiran bisa diunduh tanpa login;
   - apakah email anggota tersedia.
2. **Crawl penuh.** Yang diambil:
   - semua space, folder (termasuk yang tersembunyi dan diarsip), dan list;
   - status per list dan anggota;
   - semua tugas: open, closed, arsip, dan subtask, beserta detailnya;
   - semua komentar sampai habis, plus balasannya;
   - lampiran: file disalin ke Storage, link aslinya disimpan.

   Volume per 23/9: 3 space, 11 list, 198 tugas (146 open, 52 closed), 65 lampiran tugas 16,1 MB. Jumlah komentar belum dihitung.
3. **Muat idempoten.** Upsert per ID, jadi impor bisa diulang tanpa data dobel.
4. **Bukti hitungan.**
   - Crawler menulis sensus per list dari payload yang sama dengan yang dimuat: tugas open/closed/arsip, komentar, balasan, lampiran.
   - Database harus menghasilkan angka identik (selisih 0) dan himpunan ID yang identik.
   - Hasilnya diserahkan dalam tabel per list, berdampingan dengan angka ClickUp.
5. **Paralel 1–2 minggu.** ClickUp tetap sumber utama.
   - Aplikasi berjalan dalam mode cermin: data dari ClickUp hanya bisa dibaca.
   - Sinkron otomatis 1× sehari pukul 05:45 WIB (sebelum routine jalan), dan bisa dipicu manual.
   - Tersedia space "Uji Coba" untuk latihan menulis.
   - Routine tetap memakai ClickUp. Output `clickup.mjs` dan `tugas.mjs` dibandingkan setiap hari.
6. **Cutover (setelah ACC).**
   1. Umumkan freeze.
   2. 1× sinkron akhir penuh.
   3. Cek hitungan, harus selisih 0.
   4. Pindahkan aplikasi ke mode utama.
   5. Alihkan env routine.
   6. Terapkan perubahan rhj-brain di sesi CMO.

   Rollback tersedia 2 minggu: ClickUp tidak diubah, cukup kembalikan env.

## 6. Tahapan
Perkiraan kasar, belum ada pembanding; 1 sesi = satu sesi kerja agent.

| Fase | Isi | Sesi |
|---|---|---|
| F0 | ACC + tindakan Hannes (bagian 7) | — |
| F1 | Skema, trigger, RLS, fungsi hitung + tes | 1–2 |
| F2 | API Edge + `tugas.mjs` + tes diff | 2 |
| F3 | Importer + impor pertama + bukti hitungan | 1–2 |
| F4 | UI web mobile | 3–4 |
| F5 | Deploy, akun 9 orang, backup harian terenkripsi | 1 |
| F6 | Paralel 1–2 minggu + perbaikan | — |
| F7 | Sinkron akhir, cutover, serah daftar perubahan rhj-brain | 1 |

Total: kira-kira 9–12 sesi kerja, ditambah masa paralel.

## 7. Tindakan Hannes (setelah ACC)
1. **Supabase:** buat akun baru dengan email baru → org baru → project `rhj-tugas`, region Southeast Asia (Singapore), plan Free.
2. **Token Supabase:**
   - Di akun baru, buat Personal Access Token (Account → Access Tokens).
   - Masukkan ke environment cloud sebagai `SUPABASE_ACCESS_TOKEN`, bersama `SUPABASE_PROJECT_REF`.
   - Buka sesi baru supaya terbaca.
   - Token ini hanya menjangkau akun baru, bukan ERP.
3. **ClickUp:** `CLICKUP_API_TOKEN` sudah Anda tambahkan. Saya cek di sesi baru dengan `whoami` (baca-saja).
4. **Hostinger:**
   - Buat subdomain (usul: `tugas.palletmeshindonesia.com`) dan aktifkan SSL.
   - Hubungkan Git ke repo rhj-tugas branch `web`. Deploy key saya siapkan.
5. **F5:** isi GitHub Secrets untuk sinkron dan backup. Daftarnya saya kirim di tahap itu.

## 8. Keputusan untuk Hannes (✔ = rekomendasi)
- **K1 Domain:** ✔ `tugas.palletmeshindonesia.com` di Hostinger / Netlify Free.
- **K2 Login:**
  - ✔ Email + password yang dibuat owner (tanpa email verifikasi; reset oleh owner) / Google login (perlu setup Google Cloud).
  - Email Michael yang dipakai: `michael@rodahammerindo.com` atau `eppy.michael@gmail.com`?
  - Email Rengga: `luckyrengga1@gmail.com` benar?
- **K3 Identitas agent:** ✔ token bot terpisah.
  - Routine: baca saja.
  - Sesi interaktif: baca + tulis, tanpa hapus.
  - Akibatnya komentar agent tampil sebagai "Claude (agent)", tidak lagi "hannes lowan".
- **K4 Hari libur nasional:** ✔ ikut dikurangi dari hari kerja. Daftarnya diisi owner.
- **K5 Masa paralel:** ✔ mode cermin (data ClickUp hanya-baca di aplikasi) + space Uji Coba.

## 9. Risiko utama
| Risiko | Mitigasi |
|---|---|
| Output CLI berbeda, routine salah baca | Kode format tidak diubah, diff harian selama paralel, rollback lewat env |
| Due bergeser sehari | Simpan ms asli, pakai rumus WIB yang sama dengan clickup.mjs, uji due 00:00 WIB |
| 6 prompt routine di UI claude.ai menyebut `clickup.mjs` dan `CLICKUP_API_TOKEN` | Opsi: `clickup.mjs` dijadikan dua-mode (flag env), jadi prompt tak perlu diedit. Masuk daftar perubahan rhj-brain |
| Supabase Free tanpa backup | Ekspor harian terenkripsi lewat Actions (retensi 30 hari) + uji restore |
| Belum ada push notifikasi HP (hanya lonceng) | Email agenda pagi tetap jalan; web push di Fase 2 |
| Project Free di-pause setelah 7 hari sepi | Routine dan sinkron harian menjaga project tetap aktif |
| Chat grup sales ClickUp tidak ikut pindah (di luar Fase 1) | ClickUp Free tetap bisa dipakai untuk chat sampai ada pengganti |
