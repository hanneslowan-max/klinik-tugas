# Anvil klinik — catatan salinan (12 Nov 2026)

Repo ini = salinan `rhj-tugas` (Anvil RHJ) sebagai dasar Anvil klinik hipnoterapi. Remote `upstream` = `hanneslowan-max/rhj-tugas`: perbaikan Anvil RHJ bisa ditarik dengan `git fetch upstream && git merge upstream/main` (selesaikan konflik di bagian yang sudah dibuat khusus klinik).

**BELUM DIPASANG.** Jangan deploy dari repo ini ke project Supabase RHJ (`admhlyurfvodfyedgaio`) atau domain RHJ.

## Sebelum dipasang (butuh ACC Bapak — ada biaya Supabase/hosting)
1. Project Supabase BARU khusus klinik (region Singapura; data kesehatan klien → aktifkan backup, batasi akses).
2. Ganti semua rujukan RHJ:
   - `alat/sql-proyek.sh` (kunci ref project), `supabase/config.toml`, `web/` (domain, nama "PT Roda Hammerindo Jaya", logo), `web-lama/config*.js`, uji yang mengunci domain/ref (`uji/penjaga.mjs`, `uji/*`).
   - Edge `supabase/functions/api/*`: URL & teks RHJ (berita, iklan klik).
   - Bot WA (`wa.ts`): `FAKTA_BAKU`, prompt sistem, validator (harga/ongkir RHJ) → aturan klinik (tanpa klaim medis, arahan krisis, booking).
   - Pipeline: kategori produk (Roda, Pallet Mesh, …) & sumber lead → layanan klinik; modul ERP/SP (`pipeline_sinkron_luar`) tidak dipakai.
3. Hapus/nonaktifkan modul yang tidak dipakai klinik (sinkron ERP, iklan klik RHJ, berita RHJ) atau sesuaikan.
4. Data klien = data kesehatan (UU PDP): akses per peran, tanpa nomor/nama klien di log, ekspor dibatasi. Lihat `klinik-brain/knowledge/pagar-inti.md`.
5. Secret Edge baru (Telegram bot klinik, Kapso/WA klinik, Anthropic klinik) — jangan pakai secret RHJ.
