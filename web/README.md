# Web Anvil, aplikasi tugas RHJ (Next.js)

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

## Deploy (Hostinger Business, Node.js Web App, Git)

Node.js Web App di hPanel terhubung ke repo ini lewat Git dan memantau branch `main`:

```
PR ke main ──► GitHub Actions (../.github/workflows/web.yml): typecheck · lint · tes unit · build ·
               build seperti server Hostinger (glibc 2.28) · tes end-to-end (Supabase lokal di runner)
merge ke main ──► Hostinger clone repo ──► npm install + npm run build di folder web/ ──► versi baru berjalan
```

Merge PR hanya bila semua cek hijau: Hostinger tidak menunggu GitHub Actions. Tidak perlu build harian: halaman
dirender di server dan data selalu dibaca langsung dari Supabase (real-time). Pekerjaan harian yang ada adalah
sinkron ClickUp & backup (`sinkron.yml`, `backup.yml`), bukan build web.

### Pengaturan di hPanel (Add Website → Node.js Web App → Import Git Repository)
| Kolom | Nilai |
|---|---|
| Repository / Branch | `rhj-tugas` / `main` |
| Preset framework | **Next.js** |
| Versi Node | **22.x** |
| Root directory | **`web`** (bukan `./`: akar repo bukan aplikasi web) |
| Build & output | default Next.js (`npm run build`, output `.next`). Daftar pilihan build command di hPanel dibaca dari `package.json` akar; abaikan, cukup default |
| Variabel environment (isi SEBELUM deploy; nilainya dikunci saat build) | `NEXT_PUBLIC_SUPABASE_URL` = `https://admhlyurfvodfyedgaio.supabase.co`<br>`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key (Supabase → Project Settings → API Keys, `sb_publishable_…`; JANGAN secret key)<br>`NEXT_PUBLIC_APP_BASE_URL` = `https://tugas.palletmeshindonesia.com` |

Domain: `tugas.palletmeshindonesia.com` + SSL; harus sama dengan `app_settings.app_base_url` (Edge hanya menerima
tombol admin dari domain itu dan localhost). Mengubah variabel environment → deploy ulang (nilai `NEXT_PUBLIC_*`
masuk saat build).

### Batasan server build Hostinger (glibc 2.28)
SWC native Next.js 16 butuh glibc 2.29, jadi di Hostinger Next.js memakai SWC WASM. Akibatnya:
- `npm run build` = `next build --webpack` (Turbopack butuh SWC native). `npm run dev` tetap Turbopack.
- Konfigurasi `next.config.mjs` (JavaScript), bukan `next.config.ts` (transpilasinya gagal di WASM).
- `outputFileTracingRoot` = folder `web/`, supaya `server.js` standalone tetap di `.next/standalone/`.
- `postbuild` (`scripts/lengkapi-standalone.mjs`) menyalin `public/` dan `.next/static` ke `.next/standalone/` (Next.js
  tidak menyalinnya sendiri), jadi `node .next/standalone/server.js` langsung lengkap.
- Dependensi native baru harus lolos job **build-hostinger** di CI (AlmaLinux 8, sama dengan server).

### Uji sesudah deploy
`/masuk` tampil (bukan "Konfigurasi aplikasi belum diisi" — kalau muncul, variabel environment belum terbaca saat
build: isi lalu deploy ulang), login owner, buka `/t/<id ClickUp>`, header `X-Robots-Tag: noindex`, buka dua browser
dan ubah status satu kartu → browser lain ikut berubah.
