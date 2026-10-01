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

## Deploy (Hostinger Business, Node.js Web Apps)

Alur otomatis (`.github/workflows/web.yml`):

```
PR ke main ──► GitHub Actions: typecheck · lint · tes unit · build · tes end-to-end (Supabase lokal di runner)
merge/push ke main ──► cek yang sama ──► lolos? ──► isi web/ diterbitkan ke branch `hostinger`
branch `hostinger` berubah ──► Hostinger otomatis build (npm run build) & menjalankan versi baru
```

Tidak perlu build harian: halaman dirender di server dan data selalu dibaca langsung dari Supabase. Pekerjaan harian
yang ada adalah sinkron ClickUp & backup (`.github/workflows/sinkron.yml`, `backup.yml`), bukan build web.

### Pemasangan pertama di hPanel (sekali saja)
1. Pastikan branch `hostinger` sudah ada (dibuat otomatis oleh workflow Web setelah perubahan web masuk `main`; atau
   jalankan manual: GitHub → Actions → Web → Run workflow di `main`).
2. hPanel → **Websites → Add Website → Deploy Web App → Import Git Repository** → izinkan akses GitHub →
   pilih repo `rhj-tugas`, **branch `hostinger`**.
3. **Configure build settings**: framework **Next.js** (application type `next`), Node **22.x**, build script
   `build`, output directory `.next`. Hostinger menerapkan `output: "standalone"` sendiri.
4. **Environment Variables** (isi SEBELUM deploy pertama; nilainya dipakai saat build):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://admhlyurfvodfyedgaio.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = kunci *publishable* (Supabase → Project Settings → API Keys)
   - `NEXT_PUBLIC_APP_BASE_URL` = `https://tugas.palletmeshindonesia.com`
5. Deploy, lalu sambungkan domain **`tugas.palletmeshindonesia.com`** + SSL. Domain harus sama dengan
   `app_settings.app_base_url`: Edge hanya menerima tombol admin (aktifkan login, setel ulang password, hapus permanen)
   dari domain itu (dan localhost).
6. Uji: `/masuk` tampil (bukan "Konfigurasi aplikasi belum diisi" — kalau muncul, environment belum terbaca saat build:
   isi lalu **Settings & Redeploy**), login owner, buka `/t/<id ClickUp>`, header `X-Robots-Tag: noindex`, buka dua
   browser dan ubah status satu kartu → browser lain ikut berubah.

### Sesudahnya
Cukup merge PR ke `main`. Kalau tes gagal, branch `hostinger` tidak berubah dan situs tetap versi terakhir yang lolos.
Riwayat deploy & log build ada di hPanel (**Last deployment details**); riwayat cek ada di GitHub Actions.
