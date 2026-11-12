# Sumber & audit: anvil-shadcn

- Upstream: https://github.com/shadcn-ui/ui, commit `ba1503c64472b82256d9de95e2e62c5901a38e8b` (19 Okt 2026), folder `skills/shadcn/`.
  - `SKILL.md` → diadaptasi jadi `SKILL.md`.
  - `rules/styling.md`, `rules/forms.md`, `rules/composition.md`, `rules/icons.md`, `rules/base-vs-radix.md`, `cli.md`, `customization.md` → disalin, dengan satu ubahan mekanis: `npx shadcn@latest` / `pnpm dlx shadcn@latest` / `bunx --bun shadcn@latest` → `npx shadcn` (versi lokal terkunci).
  - Tidak disalin: `mcp.md`, `registry.md`, `design-system.md`, `design-system-page.md`, `rules/chat.md`, `evals/`, `assets/`, `scripts/showcase-coverage.mjs`, `agents/openai.yml`.
- Lisensi: MIT, Copyright (c) 2023 shadcn → `LICENSE.md` (salinan utuh).
- Diaudit & dipasang 21 Okt 2026, ACC Hannes ("ACC audit + pasang 3 di rhj-tugas"). Cara pasang: dibaca utuh, disalin manual; tanpa `npx skills add`, tanpa skrip upstream dijalankan.

## Temuan audit
| Temuan | Tindakan |
|---|---|
| Perintah otomatis saat skill dimuat: `` !`npx shadcn@latest info --json` `` (mengunduh & menjalankan versi terbaru dari npm setiap kali skill dipakai) | Dibuang; konteks proyek ditulis statis dari `web/components.json` |
| `allowed-tools: Bash(npx shadcn@latest *)` dll. (izin otomatis menjalankan versi terbaru tanpa prompt) | Dibuang |
| Semua perintah memakai `@latest` | Diganti CLI lokal `shadcn` 4.21.0 dari lockfile |
| Registry komunitas (`@magicui`, `owner/repo`, URL) = kode pihak ketiga | Hanya `@shadcn`; lainnya baca `--view` + ACC |
| `mcp.md`: menulis `.mcp.json` / menjalankan server MCP | Tidak disalin |
| `--overwrite`, `init --force`, `apply` preset menimpa komponen yang sudah diubah lokal (P9 impor subpath radix-ui) | Butuh ACC; dicatat di PAGAR |
| Aturan "no space-y-*", `Field`, `Spinner`, `Empty` belum sesuai kode Anvil (±64 berkas pakai `space-y-*`; komponen belum terpasang) | Berlaku untuk kode baru; tanpa refaktor massal |
| `scripts/showcase-coverage.mjs`: hanya membaca berkas lokal (tanpa jaringan) | Tidak dibutuhkan, tidak disalin |

## Pembaruan
Jangan menimpa dari upstream secara otomatis. Untuk memperbarui: baca diff `skills/shadcn/` sejak commit di atas, terapkan ulang adaptasi, catat commit baru di sini, ACC Hannes.
