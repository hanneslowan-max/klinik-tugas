# Impor data sheet "Customer Pipeline" → tabel Pipeline Anvil (§7)

Alat: [`alat/impor-pipeline.mjs`](../alat/impor-pipeline.mjs). Memindahkan tab **INPUT** Google Sheet "Customer
Pipeline" ke tabel Pipeline (`pelanggan`, `kontak`, `lead`, `lead_item`, `lead_aktivitas`). Dipakai **sekali** sebelum
uji Langkah 3 dan **sekali lagi** di hari pindah (K8). Aturan mengikuti RANCANGAN-MODUL-PIPELINE.md §7.

Acuan kebenaran skema: migrasi `supabase/migrations/20261011120000_pipeline_tabel.sql` (kolom, enum, indeks unik
parsial `lead_no_sp_uniq`, trigger pengisi kode/riwayat/diam/cari).

## Prinsip

- **Tanpa konektor Google Drive.** Masukan = berkas **ekspor** sheet (CSV / TSV / JSON). Unduh tab INPUT sebagai CSV/
  TSV (atau ekspor JSON), simpan di luar repo, lalu jalankan alat ini terhadap berkas itu.
- **Idempoten & boleh diulang.** Kunci baris = `ref_sheet` (`r<no. baris sheet>`). Jalankan ulang → data akhir sama:
  lead dicari dulu dari `ref_sheet` lalu di-*update* (bukan dobel); pelanggan di-dedup per nama; kontak di-dedup per
  telepon; `lead_item` & `lead_aktivitas` "Catatan impor" dihapus-lalu-diisi. Generator deterministik (tanpa acak) →
  dua kali jalan menghasilkan SQL identik byte-per-byte. Pengecualian: lead yang ordernya **dibatalkan di Anvil** tidak
  disentuh sama sekali (lihat "Order yang dibatalkan di Anvil dilewati").
- **Tidak memaksa enum.** Nilai yang tak cocok enum (produk/sumber/tahap) **tidak** dipaksa; baris ditandai
  `periksa=true` + `periksa_sebab` agar manusia membereskan. Baris bertanda `periksa` **dikecualikan** dari indeks unik
  parsial `lead_no_sp_uniq` (sesuai komentar migrasi), jadi SP historis yang kotor/dobel tetap bisa masuk.
- **Tanpa fungsi SQL baru.** SQL yang dihasilkan langsung memakai tabel + fungsi yang sudah ada
  (`public.pipeline_telp_norm`). Tidak perlu migrasi tambahan.
- **Privasi.** stdout hanya ANGKA. Berkas `.impor.sql`, `.laporan.md`, `.periksa.csv` memuat nama/telepon pelanggan →
  **JANGAN commit**. Fixture uji 100% sintetis.

## Kolom sheet yang diharapkan (tab INPUT, A..N)

| Kolom | Field | Pemetaan ke Anvil |
|---|---|---|
| A Tgl | `tgl` | `lead.tanggal_masuk`. Baris teks pemisah bulan ("NOVEMBER", "JANUARI 2026") dibuang. |
| B Company | `company` | `pelanggan.nama` (dirapikan spasi; dedup case-insensitive). "-"/"?"/"perorangan"/"pribadi" → `jenis='perorangan'` (tak di-dedup). Kosong → pakai nama PIC/placeholder + PERIKSA. |
| C Location | `location` | `pelanggan.kota` apa adanya. |
| D PIC Name | `pic` | `kontak.nama`. |
| E Phone No | `phone` | `kontak.telepon` (dinormalisasi `62…` oleh `pipeline_telp_norm`), `telepon_tampil` = asli. Dedup telepon dalam pelanggan yang sama. |
| F Status | `status` | `lead.tahap` (lihat aturan di bawah). Teks asli disimpan di `lead.catatan_impor`. |
| G Sales Rep | `rep` | Riksa/Michael → `lead.pemilik` (member Anvil). Kota/sales lain → `lead.dialihkan_ke` (teks). Kosong → tanpa pemilik. |
| H Item | `item` | `lead_item.produk`. Cabinet→Lemari Arsip; "other"→Lainnya; Airport→Airport Trolley. Tak dikenal/kosong → Lainnya + PERIKSA. |
| I Remark | `remark` | `lead.kebutuhan`. |
| J Respon | `respon` | `lead.catatan`. |
| K No Surat Pesanan | `no_sp` | `lead.no_sp`. Gagal pola §3 / dobel → disimpan apa adanya + PERIKSA. |
| L Nilai Transaksi | `nilai` | `lead.nilai_transaksi` (Rp, angka saja). Memuat huruf / tak terbaca → PERIKSA. |
| M Follow Up | `fu` | digabung ke 1 `lead_aktivitas` jenis **"Catatan impor"**. |
| N Respon setelah FU | `respon_fu` | idem (isi: hitungan FU + teks N). |

**Pemetaan kolom:** default lewat **baris header** (alias longgar — huruf besar/kecil & spasi diabaikan; mis.
"Sales Rep"/"Sales"/"Rep"/"G", dan "Company Name" → `company`). **Catatan sheet asli:** header sel A1 (tanggal)
sering **kosong** di ekspor — otomatis dijatuhkan ke posisi kolom pertama (A). **Selalu cek angka stdout** (`total_baris_sheet`
vs `terimpor`): kalau `terimpor` mendekati 0 atau semua tanggal/pemilik kosong, berarti pemetaan header gagal →
jalankan ulang dengan `--pos` (kolom berurut A..N, tanpa membaca baris header). JSON: array objek berkunci nama
kolom/alias. `ref_sheet` diambil dari kolom `--ref-kolom` bila ada; jika tidak, dihitung dari posisi (lihat
`--mulai-baris`, default 2 karena baris 1 = header). Baris pemisah/kosong tetap menambah penghitung agar `ref_sheet`
sejajar nomor baris sheet asli.

### Aturan tahap (kolom F, multi-pilihan digabung koma)

Ambil tahap **paling akhir** menurut prioritas: mengandung "Order" → **ORDER**; "Batal" → **BATAL**; "Follow up Sales
lain" (3 variasi ejaan) → **DIALIHKAN**; "Kirim Penawaran"/"Visit" → **PENAWARAN**; selain itu → **BARU**.

**Tambahan 12 Okt (cek hasil Langkah 2):** baris dengan No SP **dan** Nilai terisi tapi status sheet belum "Order"
(dan bukan Batal) dijadikan **ORDER** + PERIKSA ("dijadikan ORDER (aturan §3)"). Tanpa ini omzetnya hilang dari ringkasan
(5 baris, Rp5.753.519 pada data 12 Okt).

### Waktu & "diam"

Sheet tidak menyimpan tanggal follow-up. `lead.diam_sejak` lead impor = **tanggal lead pukul 12:00 WIB**, kecuali
lead itu sudah punya aktivitas nyata di Anvil (FU yang dicatat rep sesudah impor) → aktivitas terakhir itu yang dipakai.
Aktivitas "Catatan impor" juga diberi waktu tanggal lead 12:00 WIB. Jam 12:00 dipakai supaya `::date` tidak bergeser
sehari karena zona waktu server (UTC). Sebelum aturan ini semua lead impor tercatat "diam 0 hari" dan tab Diam kosong.

### Order yang dibatalkan di Anvil dilewati (14 Okt, migrasi `20261014130000_pipeline_batal_order`)

Sejak tombol **Batalkan order** ada, order bisa dibatalkan di Anvil: lead pindah ke BATAL dengan `alasan_batal`
**"Order dibatalkan"** + alasan tertulis, data order tetap tersimpan. Sheet tidak tahu pembatalan itu dan masih menulis
"Order". Karena itu tiap blok SQL impor punya **penjaga** tepat sesudah lead dicari dari `ref_sheet`: bila lead itu
sudah ada dan berstatus BATAL + "Order dibatalkan", blok **dilewati utuh** (`return;` — pelanggan, kontak, lead, item,
Catatan impor tidak disentuh). Tanpa penjaga, impor ulang mengembalikan lead ke ORDER dan pembatalan + alasannya hilang.

- **Akibat yang disengaja:** sesudah impor ulang, order/omzet di Ringkasan Anvil bisa **lebih kecil** dari sheet (dan
  dari tabel "Basis bulanan" laporan impor, yang dihitung dari isi sheet). Selisih itu = order yang dibatalkan di
  Anvil; jelaskan dengan daftar lead `alasan_batal = 'Order dibatalkan'`, bukan dengan mengubah data.
- **Alat impor tidak pernah menulis `alasan_batal`/`alasan_batal_lain`** (sheet tak punya kolomnya): baris Batal dari
  sheet masuk tanpa alasan + PERIKSA, dan kategori "Order dibatalkan" hanya bisa lahir dari tombol Batalkan order.
- **Pakai versi alat sesudah 14 Okt** untuk impor ulang di hari pindah; berkas `.impor.sql` yang dibuat versi lama tidak
  punya penjaga ini → buat ulang. Cek cepat: header SQL memuat baris "dilewati utuh: tidak dikembalikan ke ORDER".
- Hitung lead yang akan/telah dilewati (angka saja):
  `select count(*) from public.lead where ref_sheet is not null and tahap = 'BATAL' and alasan_batal = 'Order dibatalkan';`

### Data yang tidak ada di sheet (diisi default, dicatat)

- **`sumber`** (wajib NOT NULL, sheet tak punya) → `--sumber-default` (default **Lainnya**).
- **`qty`** (wajib `>0`, sheet tak punya) → `--qty-default` (default **1**). Item **Pallet Mesh** ditandai PERIKSA
  (qty PM dipakai win-rate <20u vs ≥20u, harus diisi ulang dari teks).
- **`tanggal_sp`** untuk ORDER tak diketahui → diisi `tanggal_masuk` + baris ditandai PERIKSA (verifikasi).
- **`alasan_batal`** tak ada di sheet → baris BATAL ditandai PERIKSA. Alat impor tidak pernah menulis kolom ini
  (lihat "Order yang dibatalkan di Anvil dilewati").

## Pemakaian

```sh
# dasar: hasilkan <berkas>.impor.sql + .laporan.md + .periksa.csv
node alat/impor-pipeline.mjs pipeline-input.csv \
  --pemilik "Riksa=<member_id>,Michael=240260567"

# peta rep → member_id (K11: Michael Eppy = 240260567). Tanpa peta, rep Anvil diresolusi dari username saat SQL
# diterapkan (LIKE '%riksa%'); gagal resolusi → pemilik kosong + PERIKSA. Utamakan --pemilik eksplisit.

# opsi lain
node alat/impor-pipeline.mjs input.tsv --pos                 # tanpa header, kolom berurut A..N
node alat/impor-pipeline.mjs input.csv --sumber-default "WA langsung" --qty-default 1 --aktor 312823267
node alat/impor-pipeline.mjs input.csv --ringkasan sheet-ringkasan.json   # hitung selisih §7 vs angka sheet
node alat/impor-pipeline.mjs input.csv --pecah 500           # pecah jadi .impor.001.sql, .002.sql, … (robust)
node alat/impor-pipeline.mjs input.csv --stdout-sql          # SQL ke stdout saja
```

Argumen: `--sql`/`--laporan`/`--periksa` (path keluaran), `--pemisah` (`tab`/`,`/`json`), `--mulai-baris N`,
`--ref-kolom <nama>`, `--rep-anvil "riksa,michael"`, `--pemilik "Label=id,…"`, `--sumber-default`, `--qty-default`,
`--aktor <member_id>` (pengisi `dibuat_oleh`; default owner 312823267), `--ringkasan <file.json>`, `--pecah N`.

### Menerapkan SQL

SQL dijalankan lewat Management API (bukan koneksi Postgres langsung — Docker tak tersedia di cloud):

```sh
SUPABASE_PROJECT_REF=admhlyurfvodfyedgaio SUPABASE_ACCESS_TOKEN=<PAT> \
  bash alat/sql-proyek.sh pipeline-input.csv.impor.sql out.json
```

SQL berjalan sebagai role `postgres` (pemilik tabel) → RLS tidak menghalangi (tabel tidak `FORCE ROW LEVEL SECURITY`),
dan `pipeline_telp_norm` bisa dipanggil pemilik walau EXECUTE dicabut dari role API. Header SQL menyetel
`app.sumber='impor'` + `app.actor_id=<aktor>` supaya trigger mengisi `dibuat_oleh`/`lead_riwayat_tahap.oleh`.
Dengan `--pecah`, terapkan tiap `*.impor.NNN.sql` berurutan (masing-masing idempoten & bisa diulang sendiri).

## Format laporan selisih (§7)

`*.laporan.md` berisi:

1. **Hitungan** — total baris sheet, tidak terimpor (pemisah bulan + tanggal tak terbaca), terimpor, jumlah PERIKSA.
2. **Per tahap** — BARU / PENAWARAN / ORDER / BATAL / DIALIHKAN.
3. **Per rep** — pemilik (Riksa/Michael/…), dialihkan (`→ <tujuan>`), dan "(tanpa pemilik)".
4. **Basis bulanan** — leads, order, omzet per bulan **berdasarkan tanggal lead** (kolom A) agar bisa dicocokkan
   dengan tab "Ringkasan Bulanan" sheet lama.
5. **Selisih** (bila `--ringkasan` diberi) — per bulan: `Anvil / Sheet / Δ` untuk leads, order, omzet. Status **LULUS**
   bila Δ = 0 semua (syarat §7 sebelum sheet dikunci); selain itu selisih dijelaskan baris per baris.
6. **PERIKSA** — tabel `ref_sheet | tahap | sebab`.

`--ringkasan` menerima JSON: `{ "YYYY-MM": { "leads": N, "order": N, "omzet": N }, … }` (angka dari tab Ringkasan
Bulanan sheet). Pakai ini di hari pindah untuk membuktikan selisih = 0.

### Daftar PERIKSA (`*.periksa.csv`)

Kolom `ref_sheet,tahap,sebab`. Sebab yang dideteksi: No SP gagal pola §3; No SP dobel antar-baris; ORDER tanpa SP/
tanpa nilai; ORDER (tanggal SP ditebak dari tanggal lead); ada SP tapi tahap bukan ORDER; BATAL tanpa alasan;
DIALIHKAN tanpa tujuan; produk tak dikenal → Lainnya; teks menyebut "pallet" tapi produk bukan Pallet Mesh; qty Pallet
Mesh default; nilai transaksi memuat huruf/tak terbaca; nama perusahaan kosong; tanggal masuk di masa depan (salah
ketik tahun). Serahkan daftar ini ke Hannes/rep untuk dibereskan setelah pindah.

## Uji

```sh
node uji/pipeline/jalankan.mjs        # self-test murni Node (tanpa DB); fixture sintetis uji/pipeline/fixture/
```

Menguji parser CSV (kutip/koma/baris-baru), klasifikasi tahap & produk, pembersih tanggal/nilai/SP/telepon, deteksi
PERIKSA, hitungan laporan + selisih, dan generator SQL (idempoten/deterministik, escaping, pecah berkas, penjaga order
yang dibatalkan di tiap blok tepat sesudah cari `ref_sheet`, tidak ada penulisan `alasan_batal`). Penjaga juga dicoba
sekali (14 Okt) di DB lokal dalam transaksi yang di-rollback: impor → batalkan order → impor ulang = lead tetap BATAL
"Order dibatalkan" (isi & jumlah item/aktivitas/riwayat tidak berubah), lead lain tetap diperbarui.

> **Catatan Docker:** idempotensi terhadap DB nyata (cari-by-`ref_sheet`, dedup, hapus-lalu-isi anak) diverifikasi
> secara statik di self-test (pola SQL) karena stack Supabase lokal tak tersedia. Saat stack lokal/uji ada, jalankan
> `bash alat/sql-proyek.sh <...>.impor.sql` **dua kali** dan pastikan hitungan baris (`lead`, `lead_item`,
> `lead_aktivitas`) tidak bertambah di jalan kedua.
