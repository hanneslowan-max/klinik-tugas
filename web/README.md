# Web Tugas RHJ (Next.js)

Antarmuka web aplikasi tugas internal PT RHJ (pengganti ClickUp). Seluruh logika bisnis & hak akses ada di
database Supabase (RLS + fungsi `web_*` SECURITY DEFINER, lihat `../docs/ARSITEKTUR.md`); web ini hanya
menampilkan data dan memanggil fungsi tersebut dengan sesi pengguna. Web statis lama ada di `../web-lama/`
sampai web ini lulus paritas tes.

## Stack

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Tampilan | Tailwind CSS 4 + komponen shadcn/ui (Radix) di `src/components/ui`, ikon lucide |
| Data | `@supabase/ssr` (sesi di cookie) + `@supabase/supabase-js`, TanStack Query 5 |
| Form | react-hook-form + zod |
| Papan (Board) | dnd-kit (seret kartu; tekan-tahan di layar sentuh) |
| Markdown | markdown-it (`html:false`) + DOMPurify |
| Tes | Vitest (fungsi murni), Playwright (end-to-end, `tests/e2e`) |

## Struktur folder

```
src/
├─ app/                      # HANYA routing & susunan halaman (server components tipis)
│  ├─ (auth)/masuk, ganti-password
│  ├─ (app)/layout.tsx       # penjaga login + profil + kerangka (sidebar desktop / nav bawah HP)
│  │  ├─ saya/ jelajah/ cari/ notif/ sampah/
│  │  ├─ l/[listId]/         # List & Papan (Board)
│  │  ├─ t/[taskId]/         # Detail tugas
│  │  └─ admin/<tab>/        # anggota, status, struktur, libur, token, mode, sinkron (owner)
│  ├─ layout.tsx, globals.css, manifest.ts, icon.svg
├─ features/<domain>/        # logika + komponen per domain: tugas, detail, list, komentar, lampiran,
│                            # anggota, struktur, profil, auth, cari, notif, sampah, admin, …
├─ components/
│  ├─ ui/                    # shadcn (dibuat CLI, boleh diubah)
│  ├─ umum/                  # komponen domain bersama: Chip, StatusPil, Lembar, KotakPesan, Markdown, …
│  └─ layout/                # kerangka, header halaman, navigasi
├─ lib/                      # supabase (client/server/proxy), api (rpc bertipe, galat, edge), tanggal WIB,
│                            # konstanta, teks, markdown, kunci-query
├─ types/database.ts         # HASIL `supabase gen types` (jangan diedit manual)
├─ types/domain.ts           # bentuk JSON hasil fungsi web_*
└─ proxy.ts                  # CSP ber-nonce, penyegaran sesi, pengalihan tamu ke /masuk
```

Aturan:
- `app/` tidak berisi logika; halaman memanggil komponen `features/*`.
- Semua akses data lewat `rpc(klien, "web_…")` (bertipe) atau select tabel yang diizinkan RLS. Tidak ada tulis
  langsung ke tabel dan tidak ada service/secret key di web.
- Satu-satunya HTML mentah: komponen `Markdown` (disaring DOMPurify).
- Teks antarmuka Bahasa Indonesia; nama teknis field mengikuti ClickUp.

## Menjalankan lokal

Prasyarat: stack Supabase lokal (`supabase start` di akar repo, lihat `../docs/STATUS.md`).

```
cp .env.example .env.local      # isi dengan URL & publishable key stack lokal (supabase status)
npm ci
npm run dev                     # http://127.0.0.1:3000
npm run cek                     # typecheck + lint + tes unit
npm run uji:e2e                 # Playwright (butuh stack lokal + seed)
```

Setelah skema berubah: `supabase gen types typescript --local --schema public > src/types/database.ts`.

## Real-time

Perubahan dari anggota lain langsung tampil tanpa muat ulang (status pindah kolom di Papan, komentar baru, assignee,
lampiran, judul, lonceng notifikasi). Mekanisme: Supabase Realtime `postgres_changes` (migrasi
`supabase/migrations/20261001090000_realtime.sql`) + satu kanal per tab di `src/features/realtime/penyimak-realtime.tsx`
yang menandai data TanStack Query basi (dikumpulkan 400 ms). RLS diperiksa per pelanggan, jadi space privat tetap
aman. Selama pengguna sedang mengedit kartu atau menyeret kartu di Papan, perubahan orang lain ditahan lalu dimuat
begitu selesai (`src/features/realtime/tahanan.ts`), supaya cek versi (409 "sudah diubah orang lain") tetap bekerja.
Tes: `tests/e2e/realtime.spec.ts`.

## Deploy (Hostinger Business, Node.js Web Apps, lewat API)

Integrasi Git di hPanel terkunci untuk akun hosting yang dikelola sebagai klien, jadi deploy memakai **API resmi
Hostinger** dari GitHub Actions (`../alat/hostinger.mjs`, workflow `../.github/workflows/web.yml`):

```
PR ke main ──► GitHub Actions: typecheck · lint · tes unit · build · tes end-to-end (Supabase lokal di runner)
merge/push ke main ──► cek yang sama ──► lolos? ──► sumber web/ (commit itu) diunggah ke Hostinger
                   ──► Hostinger build (npm run build, Node 22) ──► workflow menunggu situs menyajikan commit itu
```

- Kode yang gagal tes tidak pernah dikirim. Build Hostinger yang gagal tidak mengganti situs (tetap versi terakhir
  yang sukses); workflow merah + analisis Hostinger di log.
- Nilai `NEXT_PUBLIC_*` disisipkan sebagai `.env.production` ke arsip (URL Supabase & URL aplikasi dikunci ke
  produksi; kunci harus *publishable*, secret key ditolak). `NEXT_PUBLIC_VERSI` = commit → `<meta name="rhj-versi">`.
- Pengaman: domain dikunci ke `tugas.palletmeshindonesia.com` (situs lain di akun, termasuk ERP, tidak tersentuh);
  situs yang belum app Node.js tidak pernah ditimpa tanpa centang manual `timpa_situs_lama`; arsip sumber di server
  dikosongkan setelah build dan workflow gagal bila berkas sumber bisa diunduh dari situs.
- Tidak perlu build harian: halaman dirender di server dan data selalu dibaca langsung dari Supabase (real-time).
  Pekerjaan harian yang ada adalah sinkron ClickUp & backup (`sinkron.yml`, `backup.yml`), bukan build web.
- Tes alat deploy (server tiruan, tanpa jaringan): `node --test ../alat/hostinger.test.mjs` (juga jalan di CI).

### Pemasangan pertama (sekali saja)
1. **Token API**: hPanel (akun Anda sendiri) → ikon profil → **API** → buat token (beri masa berlaku, mis. 1 tahun).
   Token mewarisi akses Anda ke akun hosting klien. Simpan langsung ke GitHub → repo → Settings → Secrets and
   variables → Actions → **Secrets**: `HOSTINGER_API_TOKEN`. Jangan ditempel di chat/berkas.
2. Di halaman yang sama, tab **Variables**: `SUPABASE_PUBLISHABLE_KEY` = publishable key (Supabase → Project Settings
   → API Keys, diawali `sb_publishable_`).
3. **Cek baca-saja**: Actions → **Hostinger (cek)** → Run workflow. Ringkasan run menampilkan situs yang terlihat
   token, jenis situs `tugas.`, isi document root, SSL, riwayat build. Tidak mengubah apa pun.
4. **Deploy pertama** (menimpa situs `tugas.` lama — saat ini halaman default Hostinger — secara permanen): variabel
   `HOSTINGER_AKTIF` = `1`, lalu Actions → **Web** → Run workflow (branch `main`) dengan centang **timpa_situs_lama**.
5. Uji: `/masuk` tampil, login owner, buka `/t/<id ClickUp>`, header `X-Robots-Tag: noindex`, buka dua browser dan
   ubah status satu kartu → browser lain ikut berubah. Domain harus sama dengan `app_settings.app_base_url` (Edge
   hanya menerima tombol admin dari domain itu dan localhost).

### Sesudahnya
Cukup merge PR ke `main`. Riwayat & log deploy ada di GitHub Actions (ringkasan run: commit, build, durasi, SSL);
log build/runtime juga di hPanel. Deploy ulang tanpa perubahan kode: Actions → Web → Run workflow (tanpa centang).
Mematikan deploy otomatis: hapus/kosongkan variabel `HOSTINGER_AKTIF`.
