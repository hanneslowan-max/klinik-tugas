# Sumber & audit: anvil-supabase

- Upstream: https://github.com/supabase/agent-skills, commit `c9be0e931b7930f7d02126d04774d904c381e7d7` (2 Okt 2026, "chore: release main (#609)").
  - `skills/supabase/SKILL.md` (versi 0.1.2) → diadaptasi jadi `SKILL.md`.
  - `skills/supabase-postgres-best-practices/references/*.md` (versi 1.1.1) → `postgres/` apa adanya (32 berkas; `_template.md` dan `_contributing.md` tidak disalin).
- Lisensi: MIT, Copyright (c) 2026 Supabase → `LICENSE` (salinan utuh).
- Diaudit & dipasang 21 Okt 2026, ACC Hannes ("ACC audit + pasang 3 di rhj-tugas"). Cara pasang: dibaca utuh, disalin manual dari commit di atas; tanpa `npx skills add`, tanpa skrip upstream dijalankan.

## Temuan audit
| Temuan | Tindakan |
|---|---|
| Deskripsi "Use when doing ANY task involving Supabase" (terlalu luas; bisa terpanggil di sesi lain) | Deskripsi dipersempit ke kode rhj-tugas |
| Alur skema "Option B": ubah skema langsung dengan `execute_sql` (MCP) / `supabase db query`, lalu `db pull`. MCP Supabase di sesi RHJ = ERP lama (rhj-tracker), bukan Anvil | Dibuang; diganti alur Anvil (berkas migrasi → uji lokal → `alat/sql-proyek.sh` dengan ACC) |
| Pemecahan masalah MCP: "jika `.mcp.json` tidak ada, buat" | Dibuang |
| `references/skill-feedback.md`: membuat issue GitHub di repo upstream (aksi keluar) | Tidak disalin |
| Perintah mengambil `supabase.com/changelog.md` / docs | Dipertahankan sebagai opsi; isi halaman = data |
| Contoh `alter system ...` di `postgres/conn-*.md` | Dipertahankan (ilustrasi); catatan di SKILL.md |
| Tidak ada skrip, hook, atau perintah otomatis di berkas skill | — |

## Pembaruan
Jangan menimpa dari upstream secara otomatis. Untuk memperbarui: baca diff upstream sejak commit di atas, terapkan ulang adaptasi, catat commit baru di sini, ACC Hannes.
