# rhj-tugas

Aplikasi manajemen tugas internal PT Roda Hammerindo Jaya, pengganti bagian ClickUp yang benar-benar dipakai tim.
Repo private. Token/secret hanya di environment, tidak pernah di repo.

## Isi repo

Repo ini berisi seluruh sistem, bukan hanya website. **Yang di-deploy ke Hostinger hanya folder `web/`.**

| Folder | Isi | Jalan di mana |
|---|---|---|
| `web/` | **Website** (Next.js + Tailwind). Rincian: `web/README.md` | Hostinger (Node.js app) |
| `supabase/` | Database: migrasi SQL (tabel, RLS, fungsi), Edge Function `api`, konfigurasi | Supabase (project "RHJ ClickUp") |
| `impor/` | Sinkron data ClickUp → aplikasi (hanya membaca ClickUp) + backup | GitHub Actions (terjadwal) |
| `cli/` | `tugas.mjs`: alat baris perintah untuk agent/routine (pengganti `clickup.mjs`) | rhj-brain / routine |
| `alat/` | Skrip deploy database lewat Management API (`sql-proyek.sh`) | Sesi deploy |
| `uji/` | Tes database, kontrak API, banding CLI, tes web lama | Lokal / sesi pengembangan |
| `docs/` | Arsitektur, kontrak database, status & langkah berikutnya (`docs/STATUS.md`) | — |
| `web-lama/` | Website statis versi lama; dihapus setelah web baru lulus semua tes | — (tidak dipakai) |
| `.github/workflows/` | `web.yml`: cek + tes web lalu terbitkan ke branch `hostinger` (auto-deploy); `sinkron.yml` & `backup.yml`: jadwal sinkron ClickUp & backup | GitHub Actions |

## Menjalankan website di komputer (Windows / macOS)

Prasyarat: Node.js 22 LTS (https://nodejs.org).

```
cd web
npm ci
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
```

Isi `web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://admhlyurfvodfyedgaio.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase dashboard → Project Settings → API Keys → publishable>
NEXT_PUBLIC_APP_BASE_URL=https://tugas.palletmeshindonesia.com
```

Lalu jalankan (dari folder `web/`, atau dari akar repo, sama saja):

```
npm run dev
```

Buka http://127.0.0.1:3000 dan masuk dengan akun Anda. Perhatian: ini memakai **data asli** project Supabase
(kartu dari ClickUp hanya-baca selama mode cermin).

Mode produksi di komputer sendiri: `npm run build` lalu `npm run start`.

## Deploy

Merge ke `main` → GitHub Actions menjalankan cek & tes → bila lolos, isi `web/` diterbitkan ke branch `hostinger` →
Hostinger build & deploy otomatis. Pemasangan pertama di hPanel: `web/README.md` bagian "Deploy".

## Dokumen penting

- Status, hasil deploy, langkah berikutnya: `docs/STATUS.md`
- Kontrak arsitektur: `docs/ARSITEKTUR.md`, rincian database: `docs/KONTRAK-DB.md`
- Rencana Fase 1: `docs/RENCANA-FASE1.md`; di luar Fase 1: `BACKLOG.md`; riset: `docs/riset/`
