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

## Deploy (Hostinger Business, Node.js Web Apps)

1. hPanel → Websites → Add website → Node.js app → sambungkan repo GitHub `rhj-tugas`.
   - Bila hPanel bisa memilih *root directory*: isi `web`.
   - Bila tidak: pakai branch khusus berisi isi `web/` saja:
     `git subtree split --prefix=web -b web-app && git push origin web-app`, lalu pilih branch `web-app`.
2. Build command `npm run build`, start `npm run start` (Node 22). Output `standalone` sudah diatur di
   `next.config.ts`.
3. Environment variables (dipakai saat build): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_BASE_URL=https://tugas.palletmeshindonesia.com`.
4. Domain/subdomain `tugas.palletmeshindonesia.com` + SSL di hPanel.
5. Uji: `/masuk` tampil tanpa galat CSP di konsol, header `X-Robots-Tag: noindex`, login → wajib ganti
   password, `/t/<id ClickUp>` membuka kartu.
