# Modul Berita (owner)

Permintaan Hannes, 7 Nov 2026: aplikasi untuk memantau berita terpenting, terhangat, dan terbaru dari dalam dan luar
negeri; Claude yang memilah berita yang perlu Hannes baca untuk kebutuhan bisnis dan relasi. Dibangun sebagai modul
Anvil (`/berita`), diperbarui tiap 2–3 jam di jam kerja. Hanya owner yang melihat menu dan data.

## Alur

```
 36 feed RSS/Atom ──(1) TARIK──▶ tabel berita (mentah, 14 hari) ──(2) KANDIDAT──▶ routine Claude (environment Marketing)
                                                                                       │ memilah + WebSearch
 /berita (owner) ◀──(4) BACA── berita_edisi + berita_pilihan ◀────(3) EDISI─────────────┘
        └── tanda simpan / kurang relevan ──▶ berita_tanda ──▶ umpan balik di kandidat berikutnya
```

1. **Tarik**: Edge `api` `POST /x/berita/tarik` (token agent) atau `POST /x/admin/berita-tarik` (tombol "Tarik terbaru",
   sesi owner). Edge mengunduh semua feed aktif bersamaan (12 dtk per feed, ≤50 item, item > 4 hari dibuang), parser
   `supabase/functions/api/berita.ts`, lalu `x_berita_simpan`: URL ganda atau judul sama dalam 3 hari (lintas sumber)
   dilewati, status tiap sumber dicatat, item > 14 hari dihapus. Tarikan < 90 dtk sejak yang terakhir → `ditunda`.
2. **Kandidat**: `GET /x/berita/kandidat` → item sejak edisi terakhir (maks 48 jam, 400 item, ringkas), judul edisi
   terakhir, umpan balik owner (20 disimpan + 20 kurang relevan terbaru), sumber yang galat.
3. **Edisi**: routine memilah lalu `POST /x/berita/edisi` (`x_berita_edisi_simpan`). Validasi semua-atau-tidak; pesan
   galat menyebut `pilihan[i]` supaya routine bisa memperbaiki dan mengirim ulang.
4. **Baca**: `/berita` — tab Pilihan (garis besar, pantau, berita per tingkat: 5 wajib baca, 4 penting, ≤3 perlu tahu;
   pilih edisi lama; saring dalam/luar negeri), Semua (item mentah: cari semua kata, saring wilayah/sumber, status tiap
   sumber), Tersimpan.

## Kontrak edisi (`POST /x/berita/edisi`)

```json
{
  "garis_besar": "teks 1–2000: 3–5 kalimat situasi hari ini",
  "pantau": "opsional ≤1000: agenda/hal yang perlu diawasi",
  "kandidat": 312,
  "catatan": "opsional ≤500",
  "pilihan": [
    {
      "berita_id": 123,
      "url": "wajib bila tanpa berita_id (berita dari WebSearch)",
      "judul": "1–300 (boleh ditulis ulang dalam Bahasa Indonesia)",
      "sumber": "nama media (bawaan: penerbit kandidat)",
      "terbit": "ISO opsional",
      "wilayah": "dalam | luar",
      "kategori": "ekonomi | kebijakan | industri | logistik | komoditas | bisnis | geopolitik | nasional | teknologi | lainnya",
      "skor": 5,
      "ringkasan": "1–1200",
      "dampak": "1–800: kenapa penting untuk bisnis RHJ",
      "bahan_relasi": "opsional ≤600: bahan obrolan dengan relasi"
    }
  ]
}
```

Urutan tampil = skor turun lalu urutan kiriman. URL ganda dalam satu edisi → 400. Edisi > 120 hari yang tidak punya
pilihan tersimpan dihapus otomatis saat edisi baru disimpan.

## Sumber awal (36, dicek 7 Nov 2026: HTTP 200 + item terbaru)

Dalam negeri: Google News Indonesia (utama, bisnis), Antara (terkini, ekonomi, bisnis), CNBC Indonesia (news, market),
detikFinance, detikNews, CNN Indonesia (ekonomi, nasional), Katadata, Liputan6 bisnis, Okezone ekonomi, Republika ekonomi.
Luar negeri: Google News (world, business), BBC (world, business, asia), Al Jazeera, Financial Times world, NYT (business,
world), Guardian business, Nikkei Asia, SCMP (business, china), CNA (asia, business), Straits Times asia. Industri:
Mining.com, The Loadstar, Splash247, Supply Chain Dive, Manufacturing Dive.

Tidak dipakai (7 Nov): Kontan & Bisnis.com (RSS menolak/timeout), Tempo bisnis (feed berhenti Sep 2026), WSJ (feed berhenti
Jan 2025), Jakarta Post/Jakarta Globe/Kompas Money (404), CNBC internasional (403). Media yang tidak punya feed dicakup
routine lewat WebSearch.

Tambah/matikan sumber (SQL lewat `alat/sql-proyek.sh`, belum ada layar admin):
`insert into public.berita_sumber (id, nama, url, wilayah, topik, urutan) values ('kode', 'Nama', 'https://…', 'dalam', 'ekonomi', 70);`
`update public.berita_sumber set aktif = false where id = 'kode';`

## Akses & data

- Web: `web_berita`, `web_berita_semua`, `web_berita_tersimpan`, `web_berita_tanda` → `mulai_web(true)` (owner saja).
- Edge/agent: `x_berita_*` → aktor owner atau bot (`berita_wajib_aktor`); tarik & edisi butuh scope `tulis`.
- Tabel RLS ON tanpa grant untuk authenticated/anon; sequence dicabut dari service_role.
- Volume: ±1.200 item pada tarikan pertama, lalu ratusan per 2 jam; disimpan 14 hari (± 25 MB). Tidak ikut `x_export`
  (berita bisa ditarik ulang; edisi & tanda simpan ikut hilang bila DB dipulihkan dari backup).

## Routine kurasi

Scheduled task Claude "Kurasi Berita Anvil" (`trig_018JcW4KxRHo2UXtMx9ihUip`, sesi baru tiap jalan) di environment **Marketing** (punya `TUGAS_API_URL` + `TUGAS_API_TOKEN`
bot scope tulis). Jadwal: Senin–Sabtu 05.42, 07.42, 09.42, 11.42, 13.42, 15.42, 17.42 WIB
(`CRON_TZ=Asia/Jakarta 42 5,7,9,11,13,15,17 * * 1-6`). Senin pagi mencakup sejak Sabtu sore (jendela kandidat ≤48 jam).
Prompt lengkap = bagian di bawah (salinan yang dipasang di scheduled task; ubah keduanya bersamaan).

### Prompt routine

```
Kamu kurator berita pribadi Hannes Lowan, owner PT Roda Hammerindo Jaya (RHJ, Jakarta Barat): distributor & fabrikator
material handling 25+ tahun — roda kastor industri (impor), troli, pallet mesh baja OYAMA (dibuat di pabrik sendiri),
lemari arsip, locker, shopping cart. Pelanggan: pabrik/manufaktur (otomotif, FMCG), gudang & logistik, ritel, F&B,
kantor & instansi. Bahan baku & biaya: baja (kawat, pelat, HRC/CRC), barang impor dari China, kurs rupiah, ongkos
logistik. Tugasmu: dari berita 2–3 jam terakhir, pilih yang perlu Hannes baca untuk BISNIS dan BERELASI (bahan obrolan
dengan pelanggan, pemasok, pejabat, sesama pengusaha), lalu kirim satu edisi ke Anvil.

Aturan keras:
- Hanya panggil API Anvil di bawah (curl). Jangan ubah repo apa pun, jangan git push, jangan kirim pesan/email.
- ATURAN NOL: angka, nama, dan klaim hanya dari sumber yang kamu baca. Jangan menebak. Bila hanya membaca judul,
  tulis ringkasan seperlunya tanpa angka yang tidak ada di judul/cuplikan.
- Bahasa Indonesia ringkas, sapa "Bapak" bila perlu, tanpa hiperbola, tanpa kata promosi.
- Tanpa data pribadi orang biasa (nomor HP, alamat). Tokoh publik/perusahaan boleh.

Langkah:
1. Siapkan: B="${TUGAS_API_URL%/v2}/x/berita"; H="Authorization: $TUGAS_API_TOKEN". Bila TUGAS_API_URL/TUGAS_API_TOKEN
   kosong: cetak "token Anvil tidak ada" lalu berhenti.
2. Tarik feed: curl -sS -X POST "$B/tarik" -H "$H" -o /tmp/tarik.json. Catat baru/sumber_galat. Galat → lanjut saja.
3. Kandidat: curl -sS "$B/kandidat" -H "$H" -o /tmp/kandidat.json. Baca utuh: kandidat (id, sumber, wilayah, judul,
   cuplikan, terbit_at), edisi_terakhir (jangan ulang judul yang sama kecuali ada perkembangan penting; tulis
   "Perkembangan:" di ringkasan), umpan_balik (disimpan = minat Hannes, utamakan topik serupa; kurang = kurangi topik
   serupa), sumber_galat.
4. Lengkapi dengan WebSearch 3–6 kueri untuk hal yang belum tercakup feed (mis. "berita ekonomi Indonesia hari ini",
   "harga baja", "kebijakan impor baja", "rupiah hari ini", "industri manufaktur Indonesia", berita global besar hari
   ini). Untuk berita skor 4–5, buka artikelnya (WebFetch) bila bisa supaya ringkasan & dampak akurat.
5. Pilih 8–15 berita (paling banyak 3 skor 5). Campur dalam & luar negeri sesuai bobot berita hari itu. Skor:
   5 = langsung berdampak ke bisnis RHJ / keputusan Hannes hari ini (harga & pasokan baja, kurs tajam, aturan impor/
   pajak/TKDN/SNI, pelanggan besar ekspansi/tutup, gangguan logistik besar, krisis besar);
   4 = penting diketahui hari ini (makro, suku bunga, kebijakan, korporasi besar, geopolitik yang menyentuh rantai pasok);
   3 = konteks industri & bahan obrolan; 1–2 = ringan tapi berguna untuk relasi. Buang gosip, kriminal kecil, olahraga,
   hiburan, kecuali benar-benar jadi pembicaraan nasional.
   Tiap pilihan: berita_id (dari kandidat) ATAU url (dari WebSearch), judul (Bahasa Indonesia, boleh ditulis ulang),
   sumber, wilayah, kategori, skor, ringkasan 2–3 kalimat, dampak 1–2 kalimat spesifik ke RHJ (produk, biaya, pelanggan,
   peluang), bahan_relasi 1 kalimat untuk skor ≥3 bila ada sudut obrolan yang berguna.
   garis_besar: 3–5 kalimat situasi hari ini (yang paling penting dulu). pantau: agenda/rilis yang perlu diawasi
   (tanggal bila ada di sumber). kandidat: jumlah kandidat yang kamu tinjau.
6. Bila sejak edisi terakhir tidak ada berita baru yang layak (kandidat sedikit dan tidak penting), jangan kirim edisi;
   cetak "tidak ada edisi: <alasan>".
7. Tulis JSON ke /tmp/edisi.json (pakai python/jq supaya valid UTF-8), kirim:
   curl -sS -X POST "$B/edisi" -H "$H" -H 'content-type: application/json' --data-binary @/tmp/edisi.json
   Balasan 400 menyebut pilihan[i] yang salah → perbaiki dan kirim ulang (maks 2 kali). Kunci yang sah hanya:
   garis_besar, pantau, kandidat, catatan, pilihan[berita_id, url, judul, sumber, terbit, wilayah, kategori, skor,
   ringkasan, dampak, bahan_relasi]. Kategori: ekonomi, kebijakan, industri, logistik, komoditas, bisnis, geopolitik,
   nasional, teknologi, lainnya.
8. Akhiri dengan 3 baris: jumlah kandidat, jumlah pilihan (dan berapa skor 5), id edisi atau alasan tidak ada edisi.
```

## Deploy

1. Migrasi `20261107120000_berita.sql` ke project `admhlyurfvodfyedgaio`: `bash alat/sql-proyek.sh --migrasi`.
2. Edge: `supabase functions deploy api --no-verify-jwt --project-ref admhlyurfvodfyedgaio` (ikut `berita.ts`).
3. Cek: `POST /x/berita/tarik` dengan token bot → `sumber_ok` mendekati 36; `GET /x/berita/kandidat`.
4. Merge PR ke `main` → Hostinger build web (`/berita`).
5. Pasang scheduled task kurasi (bagian Routine).

## Tes

- DB: `uji/db/36_berita.sql` (74 cek; hak, simpan tarikan, dobel, retensi, kandidat, edisi, web owner, penolakan member)
  + `09` (71 `web_*`, 41 `api_/x_/impor_`).
- Parser: `node uji/berita/jalankan.mjs` (34 cek, murni Node 22.18+, fixture sintetis).
- Edge lokal: `node uji/berita/kontrak.mjs` (21 cek; butuh `supabase functions serve`; alamat tetap 127.0.0.1).
- Web: vitest `features/berita/berita.test.ts` (11), e2e `tests/e2e/berita.spec.ts` (3 skenario × HP/desktop).
