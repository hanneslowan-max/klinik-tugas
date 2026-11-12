# Audit skill pihak ketiga untuk Anvil · 21 Okt 2026

ACC Hannes: "ACC audit + pasang 3 di rhj-tugas". Semua berkas dibaca utuh dari clone read-only di folder sementara (di luar repo). Tidak ada `npx skills add` dan tidak ada skrip upstream yang dijalankan.

## Hasil
| Kandidat | Putusan | Dipasang sebagai |
|---|---|---|
| supabase/agent-skills (`supabase` + `supabase-postgres-best-practices`), MIT, commit c9be0e9 | PASANG dengan adaptasi | `.claude/skills/anvil-supabase/` |
| shadcn-ui/ui `skills/shadcn`, MIT, commit ba1503c | PASANG dengan adaptasi | `.claude/skills/anvil-shadcn/` |
| vercel-labs/next-skills `next-best-practices` | TIDAK DIPASANG: sudah dipensiunkan Vercel. Isinya sekarang ikut paket Next.js (`web/node_modules/next/dist/docs/`) dan aturan `web/AGENTS.md` yang ditulis `next dev`. Anvil sudah memakai Next 16.3.7 dan `web/AGENTS.md` sudah ada | — (sudah tercakup) |

## Temuan yang diubah sebelum dipasang
Supabase:
- Alur skema upstream menyuruh agent mengubah skema langsung dengan `execute_sql` (MCP). Di sesi RHJ, MCP Supabase tersambung ke **ERP lama** (dicek 21 Okt: hanya `rhj-tracker` dan `rhj-tacker.dev`), bukan Anvil. Bagian ini dibuang; diganti alur Anvil: berkas migrasi → uji lokal → `alat/sql-proyek.sh` dengan ACC.
- Deskripsi "pakai untuk SEMUA tugas Supabase" dipersempit ke kode rhj-tugas.
- Langkah membuat `.mcp.json` dan membuat issue GitHub di repo upstream dibuang.

shadcn:
- Skill upstream **menjalankan `npx shadcn@latest info` otomatis setiap kali dimuat** dan memberi izin otomatis untuk `npx shadcn@latest`. Artinya kode versi terbaru dari npm dijalankan tanpa dibaca. Dua-duanya dibuang. Perintah diganti CLI lokal `shadcn` 4.21.0 yang terkunci di lockfile.
- Registry komunitas (kode pihak ketiga) hanya boleh sesudah dibaca + ACC. `--overwrite`/ganti preset butuh ACC karena komponen Anvil sudah diubah lokal (P9, impor subpath radix-ui).
- Aturan gaya upstream berlaku untuk kode baru saja; tidak ada refaktor massal.

## Temuan tambahan: pengaman ERP baca-saja tidak terpasang
`docs/STATUS.md` mewajibkan pengaman ERP baca-saja di tiap container baru (hook + daftar tolak di `~/.claude/`). Di container sesi ini pengaman itu **tidak ada**, padahal tool penulis MCP Supabase (`apply_migration`, `deploy_edge_function`, `execute_sql`, …) tersedia. Supaya tidak bergantung pada pemasangan ulang manual, pengamannya dimasukkan ke repo:
- `.claude/settings.json`: tolak 11 tool MCP Supabase penulis.
- `.claude/hooks/supabase-readonly.sh`: `execute_sql` dengan kata kunci penulis (insert/update/delete/alter/drop/…, `do $$`, `set_config`) ditolak. Diuji 8 contoh: 6 query penulis ditolak, 2 SELECT lolos.
- Berlaku di sesi yang proyeknya rhj-tugas. Belum terbukti aktif secara langsung (sesi ini berproyek `/home/user`).

## Belum diaudit (sesuai usulan, menunggu kebutuhan)
marmelab/atomic-crm (rujukan untuk skill internal `anvil-pipeline-dev`), react-pdf, webhook WhatsApp, playwright-cli, vercel react-best-practices.
