#!/usr/bin/env node
// Self-test alat/impor-pipeline.mjs — MURNI Node (tanpa DB / Docker / stack lokal). Menguji parser, klasifikasi,
// pembersih nilai, generator SQL idempoten, laporan selisih §7, dan deteksi PERIKSA terhadap fixture SINTETIS.
//   node uji/pipeline/jalankan.mjs            (UJI_VERBOSE=1 → cetak semua cek)
// Exit 0 = lulus, 1 = ada gagal. Fixture 100% sintetis (nama/telepon palsu).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bacaArgumen, uraiTabel, bacaRecord, telpNorm, romawi, parseTanggal, parseNilai, parseSP,
  klasifikasiTahap, petakanProduk, serialTanggal, olah, hitungLaporan, buatSQL, buatSQLPecah, jalankanImpor, ALASAN_BATAL_ORDER,
} from "../../alat/impor-pipeline.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixture", "pipeline-contoh.csv");
const HARI_INI = "2026-10-11";

const hasil = { lulus: 0, gagal: [] };
function cek(nama, kondisi, info) {
  if (kondisi) { hasil.lulus++; if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`); }
  else { hasil.gagal.push(nama); let s = info === undefined ? "" : typeof info === "string" ? info : JSON.stringify(info); if (s.length > 800) s = s.slice(0, 800) + "…"; console.log(`  GAGAL ${nama}${s ? `  <- ${s}` : ""}`); }
}
function bagian(n) { console.log(`\n== ${n}`); }

const opsiDasar = () => bacaArgumen([FIXTURE]);

// ---------------------------------------------------------------- aturan SP + nilai → ORDER (cek 12 Okt)
bagian("Aturan: SP + Nilai tapi status bukan Order → ORDER");
{
  const teks = [
    ",Company Name,Location,PIC Name,Phone No,Status,Sales Rep,Item,Remark,Respon,No Surat Pesanan,Nilai Transaksi,Follow Up,Respon setelah FU",
    "2026-08-03,PT Sp Nilai,Jakarta,Ani,0812-1010-2020,Customer Baru,Riksa,Roda,roda,ok,8/RSG/VIII/2026,Rp 400.000,,",
    "2026-08-04,PT Sp Saja,Jakarta,Beni,0812-1010-3030,Customer Baru,Riksa,Roda,roda,ok,9/RSG/VIII/2026,,,",
    "2026-08-05,PT Sp Batal,Jakarta,Cici,0812-1010-4040,\"Customer Baru, Batal\",Riksa,Roda,roda,ok,10/RSG/VIII/2026,Rp 500.000,,",
  ].join("\n");
  const op = bacaArgumen(["x.csv"]);
  const h = olah(bacaRecord(teks, "x.csv", op), op, HARI_INI);
  const [a, b, c] = h.leads;
  cek("SP + nilai + status Customer Baru → ORDER", a.tahap === "ORDER", a.tahap);
  cek("SP + nilai → tetap PERIKSA dengan sebab", a.periksa && (a.periksa_sebab || "").includes("dijadikan ORDER"), a.periksa_sebab);
  cek("SP tanpa nilai → tidak dipaksa ORDER", b.tahap !== "ORDER", b.tahap);
  cek("SP + nilai tapi BATAL → tetap BATAL", c.tahap === "BATAL", c.tahap);
}

bagian("Aturan: diam_sejak lead impor = tanggal lead");
{
  const op = bacaArgumen([FIXTURE]);
  const h = olah(bacaRecord(fs.readFileSync(FIXTURE, "utf8"), FIXTURE, op), op, HARI_INI);
  const sql = buatSQL(h, op, FIXTURE);
  cek("SQL menyetel diam_sejak dari tanggal lead", sql.includes("update public.lead set diam_sejak = greatest((('2025-10-13'::date) + time '12:00') at time zone 'Asia/Jakarta'"), "tidak ada update diam_sejak");
  cek("aktivitas FU nyata (bukan Catatan impor) tetap menang", sql.includes("a.jenis <> 'Catatan impor'"), "");
  cek("waktu Catatan impor = tanggal lead", /'Catatan impor', .*'Asia\/Jakarta'\)/.test(sql), "");
}

// ---------------------------------------------------------------- unit: pembersih & klasifikasi
bagian("Unit: pembersih nilai & klasifikasi");
cek("telpNorm 0812.. → 62..", telpNorm("0812-1111-2222") === "6281211112222", telpNorm("0812-1111-2222"));
cek("telpNorm 62.. tetap", telpNorm("62812000111") === "62812000111");
cek("telpNorm 8.. → 62..", telpNorm("8123456789") === "628123456789");
cek("telpNorm < 7 digit → null", telpNorm("12345") === null);
cek("romawi 1..12", romawi(1) === "I" && romawi(9) === "IX" && romawi(10) === "X" && romawi(12) === "XII" && romawi(13) === null);

cek("parseTanggal yyyy-mm-dd", parseTanggal("2025-10-13").date === "2025-10-13");
cek("parseTanggal dd/mm/yyyy", parseTanggal("13/10/2025").date === "2025-10-13");
cek("parseTanggal d/m/yy → 20yy", parseTanggal("5/9/25").date === "2025-09-05");
cek("parseTanggal teks pemisah 'NOVEMBER'", parseTanggal("NOVEMBER").pemisah === true, parseTanggal("NOVEMBER"));
cek("parseTanggal 'JANUARI 2026' → pemisah (nama bulan + tahun)", parseTanggal("JANUARI 2026").pemisah === true, parseTanggal("JANUARI 2026"));
cek("parseTanggal kosong", parseTanggal("").kosong === true);
cek("serialTanggal 45000-an (serial Sheets) valid", /^20\d\d-\d\d-\d\d$/.test(serialTanggal(45945) || ""), serialTanggal(45945));

cek("parseNilai 'Rp 5.000.000' → 5000000", parseNilai("Rp 5.000.000").nilai === 5000000);
cek("parseNilai kosong", parseNilai("").kosong === true);
cek("parseNilai '2025 fu' → mengandung huruf", parseNilai("2025 fu").mengandungHuruf === true, parseNilai("2025 fu"));
cek("parseNilai '-' → takTerbaca", parseNilai("-").takTerbaca === true);

cek("parseSP pola benar", parseSP("12/RSG/X/2025").ok === true);
cek("parseSP MCE benar", parseSP("7/MCE/III/2026").ok === true);
cek("parseSP gagal (tanpa kode rep)", parseSP("N/10/2025").ok === false);
cek("parseSP gagal (tahun 2 digit)", parseSP("12/RSG/X/25").ok === false);
cek("parseSP kosong", parseSP("").kosong === true);

cek("klasifikasiTahap Order menang", klasifikasiTahap("Customer Baru, Kirim Penawaran, Order") === "ORDER");
cek("klasifikasiTahap Batal", klasifikasiTahap("Batal") === "BATAL");
cek("klasifikasiTahap Follow up Sales lain → DIALIHKAN", klasifikasiTahap("Follow up Sales lain") === "DIALIHKAN");
cek("klasifikasiTahap Kirim Penawaran → PENAWARAN", klasifikasiTahap("Kirim Penawaran") === "PENAWARAN");
cek("klasifikasiTahap Visit → PENAWARAN", klasifikasiTahap("Visit") === "PENAWARAN");
cek("klasifikasiTahap kosong → BARU", klasifikasiTahap("") === "BARU");
cek("klasifikasiTahap Customer Baru → BARU", klasifikasiTahap("Customer Baru") === "BARU");

cek("petakanProduk Cabinet → Lemari Arsip", petakanProduk("Cabinet").produk === "Lemari Arsip" && petakanProduk("Cabinet").dikenal);
cek("petakanProduk 'other' → Lainnya (dikenal)", petakanProduk("other").produk === "Lainnya" && petakanProduk("other").dikenal);
cek("petakanProduk Pallet Mesh", petakanProduk("Pallet Mesh").produk === "Pallet Mesh");
cek("petakanProduk Airport → Airport Trolley", petakanProduk("Airport Trolley").produk === "Airport Trolley");
cek("petakanProduk tak dikenal → Lainnya + dikenal=false", petakanProduk("Gerobak Dorong").produk === "Lainnya" && petakanProduk("Gerobak Dorong").dikenal === false);
cek("petakanProduk kosong → Lainnya + kosong", petakanProduk("").kosong === true);

// ---------------------------------------------------------------- unit: parser CSV
bagian("Unit: parser CSV (quote, pemisah, multi-baris)");
{
  const t = 'a,b,c\n1,"dua, koma","tiga\nbaris"\n';
  const b = uraiTabel(t, ",");
  cek("uraiTabel: 2 baris", b.length === 2, b.length);
  cek("uraiTabel: koma dalam kutip utuh", b[1][1] === "dua, koma", b[1][1]);
  cek("uraiTabel: newline dalam kutip utuh", b[1][2] === "tiga\nbaris", JSON.stringify(b[1][2]));
  const tsv = uraiTabel("x\ty\n1\t2\n", "\t");
  cek("uraiTabel TSV", tsv[1][0] === "1" && tsv[1][1] === "2");
  // baris kosong interior tidak boleh menggeser ref_sheet (header "a"=tgl, "b"=company)
  const recD = bacaRecord("a,b\n2025-01-01,X\n\n2025-01-03,Z\n", "blank.csv", bacaArgumen(["blank.csv"]));
  const zRec = recD.find((r) => r.tgl === "2025-01-03");
  cek("baris kosong interior tetap sejajar nomor baris sheet (ref_sheet)", !!zRec && zRec._baris === 4, zRec && zRec._baris);
}

// ---------------------------------------------------------------- integrasi: olah fixture
bagian("Integrasi: olah fixture sintetis");
const teks = fs.readFileSync(FIXTURE, "utf8");
const opsi = bacaArgumen([FIXTURE, "--pemilik", "Riksa=240260500,Michael=240260567"]);
const records = bacaRecord(teks, FIXTURE, opsi);
const h = olah(records, opsi, HARI_INI);
const lap = hitungLaporan(h, records);

cek("records = 15 baris data (header dibuang)", records.length === 15, records.length);
cek("ref_sheet berurut mulai r2", records[0]._baris === 2 && records[14]._baris === 16, { a: records[0]._baris, z: records[14]._baris });
cek("header kolom A kosong → tgl via posisi; 'Company Name' → company (regresi dry-run)", records[0].tgl === "2025-10-13" && records[0].company === "PT Sinar Uji", { tgl: records[0].tgl, co: records[0].company });
cek("tidak terimpor = 1 (NOVEMBER pemisah)", lap.tidak_terimpor === 1 && lap.pemisah_bulan === 1, { t: lap.tidak_terimpor, p: lap.pemisah_bulan });
cek("terimpor = 14", lap.terimpor === 14, lap.terimpor);

cek("per_tahap BARU=6", lap.per_tahap.BARU === 6, lap.per_tahap);
cek("per_tahap PENAWARAN=2", lap.per_tahap.PENAWARAN === 2, lap.per_tahap);
cek("per_tahap ORDER=4", lap.per_tahap.ORDER === 4, lap.per_tahap);
cek("per_tahap BATAL=1", lap.per_tahap.BATAL === 1, lap.per_tahap);
cek("per_tahap DIALIHKAN=1", lap.per_tahap.DIALIHKAN === 1, lap.per_tahap);

cek("per_rep Riksa=5", lap.per_rep["Riksa"] === 5, lap.per_rep);
cek("per_rep Michael=4", lap.per_rep["Michael"] === 4, lap.per_rep);
cek("per_rep dialihkan Surabaya=1", lap.per_rep["→ Surabaya"] === 1, lap.per_rep);
cek("per_rep dialihkan Felix=1 (rep non-Anvil → dialihkan_ke)", lap.per_rep["→ Felix"] === 1, lap.per_rep);
cek("per_rep tanpa pemilik=3", lap.per_rep["(tanpa pemilik)"] === 3, lap.per_rep);

// ---------------------------------------------------------------- PERIKSA
bagian("PERIKSA: baris ambigu/kurang data terdeteksi");
const perByRef = Object.fromEntries(h.periksa.map((p) => [p.ref, p.sebab]));
cek("jumlah PERIKSA = 10", h.periksa.length === 10, { n: h.periksa.length, refs: h.periksa.map((p) => p.ref) });
cek("r3: PM qty default ditandai", /Pallet Mesh/.test(perByRef.r3 || ""), perByRef.r3);
cek("r4: ORDER tanggal SP dari tanggal lead", /tanggal SP diisi dari tanggal lead/.test(perByRef.r4 || ""), perByRef.r4);
cek("r5: No SP gagal pola", /tidak sesuai pola/.test(perByRef.r5 || ""), perByRef.r5);
cek("r6 & r7: No SP dobel", /dobel/.test(perByRef.r6 || "") && /dobel/.test(perByRef.r7 || ""), { r6: perByRef.r6, r7: perByRef.r7 });
cek("r8: BATAL selalu periksa (alasan_batal tak diimpor, walau kolom J terisi)", /BATAL/.test(perByRef.r8 || ""), perByRef.r8);
cek("r10: teks sebut pallet, produk bukan PM", /menyebut "pallet"/.test(perByRef.r10 || ""), perByRef.r10);
cek("r13: produk tak dikenal", /tak dikenal/.test(perByRef.r13 || ""), perByRef.r13);
cek("r14: nama perusahaan kosong", /nama perusahaan kosong/.test(perByRef.r14 || ""), perByRef.r14);
cek("r16: tanggal masuk masa depan", /masa depan/.test(perByRef.r16 || ""), perByRef.r16);
cek("r2, r9, r12, r15 TIDAK periksa", !perByRef.r2 && !perByRef.r9 && !perByRef.r12 && !perByRef.r15, Object.keys(perByRef));

// ---------------------------------------------------------------- SQL idempoten
bagian("SQL: idempoten & deterministik");
const sql1 = buatSQL(h, opsi, FIXTURE);
const h2 = olah(bacaRecord(teks, FIXTURE, opsi), opsi, HARI_INI);
const sql2 = buatSQL(h2, opsi, FIXTURE);
cek("SQL deterministik (2x jalan = identik byte-per-byte)", sql1 === sql2, { len1: sql1.length, len2: sql2.length });
cek("set_config app.actor_id ada", sql1.includes("select set_config('app.actor_id', '312823267', false)"));
cek("set_config app.sumber impor ada", sql1.includes("select set_config('app.sumber', 'impor', false)"));
cek("kunci ref_sheet dipakai (cari lead dulu)", sql1.includes("from public.lead where ref_sheet = 'r4' limit 1"), "r4 lookup");
cek("pelanggan dedup by lower(nama) (cari dulu, baru insert)", sql1.includes("where lower(btrim(nama)) = lower('PT Sinar Uji')"));
cek("kontak dedup by telepon (pakai pipeline_telp_norm)", sql1.includes("public.pipeline_telp_norm("));
cek("lead_item hapus-lalu-isi (idempoten)", sql1.includes("delete from public.lead_item where lead_id = v_lead;"));
cek("lead_aktivitas Catatan impor hapus-lalu-isi", sql1.includes("delete from public.lead_aktivitas where lead_id = v_lead and jenis = 'Catatan impor';"));
cek("apostrof di-escape (ganda) & kutip ganda apa adanya", sql1.includes(`PT Maju''s "Alat"`), "escape");
cek("pemilik via peta id (bukan nama)", sql1.includes("from public.members where id = 240260500 and aktif"), "pemilik id");
cek("dialihkan_ke teks non-Anvil (Felix)", sql1.includes("'Felix'"), "dialihkan felix");
cek("tahap ORDER tidak dipaksa ada SP (r5 no_sp disimpan apa adanya)", sql1.includes("'N/10/2025'"), "sp apa adanya");
cek("insert lead memakai upsert (if v_lead is null ... else update)", sql1.includes("if v_lead is null then") && sql1.includes("update public.lead set"), "upsert");
cek("baris PERIKSA ditandai komentar di SQL", /-- r4 \[PERIKSA\]/.test(sql1) && /-- r2(?!\d)(?! \[PERIKSA\])/.test(sql1), "komentar periksa");
cek("do block dollar-quote aman ($rhjimpor$)", sql1.includes("do $rhjimpor$"), "tag");
{
  // penjaga batal order (migrasi 20261014130000): impor ulang tidak boleh mengembalikan order yang dibatalkan di Anvil ke ORDER
  const penjaga = "  if v_lead is not null and exists (select 1 from public.lead where id = v_lead and tahap = 'BATAL' and alasan_batal = 'Order dibatalkan') then return; end if;";
  const nBlok = (sql1.match(/^do \$/gm) || []).length;
  cek("ALASAN_BATAL_ORDER = 'Order dibatalkan' (ejaan = CHECK lead_alasan_batal_check)", ALASAN_BATAL_ORDER === "Order dibatalkan", ALASAN_BATAL_ORDER);
  cek("penjaga batal order ada di SETIAP blok lead", sql1.split(penjaga).length - 1 === nBlok && nBlok === 14, { penjaga: sql1.split(penjaga).length - 1, nBlok });
  cek("penjaga tepat sesudah cari lead by ref_sheet (sebelum pelanggan/kontak/lead disentuh)", sql1.includes(`from public.lead where ref_sheet = 'r4' limit 1;\n${penjaga}\n`), "urutan penjaga");
  // (teks periksa_sebab BATAL memuat kata "alasan_batal" → cek penugasan kolom / daftar kolom insert, bukan sekadar kata)
  const tanpaPenjaga = sql1.split("\n").filter((b) => b !== penjaga).join("\n");
  const tulisAlasan = /\balasan_batal(_lain)?\s*=/.test(tanpaPenjaga) || /insert into public\.lead \([^)]*alasan_batal/.test(tanpaPenjaga);
  cek("impor tidak pernah menulis alasan_batal (hanya dibaca penjaga)", !tulisAlasan, "alasan_batal ditulis");
}

// ---------------------------------------------------------------- SQL pecah (robust untuk 1.981 baris)
bagian("SQL: pecah berkas (tiap pecahan idempoten)");
{
  const pecah = buatSQLPecah(h, opsi, FIXTURE, 5);
  cek("14 lead / 5 per pecahan → 3 pecahan", pecah.length === 3, pecah.map((p) => p.no));
  cek("penomoran 001/002/003", pecah[0].no === "001" && pecah[2].no === "003");
  const jumlahBlok = pecah.map((p) => (p.sql.match(/^do \$/gm) || []).length);
  cek("blok per pecahan 5+5+4 = 14", JSON.stringify(jumlahBlok) === JSON.stringify([5, 5, 4]), jumlahBlok);
  cek("tiap pecahan punya set_config aktor (bisa diterapkan sendiri)", pecah.every((p) => p.sql.includes("set_config('app.actor_id'")));
  cek("gabungan blok pecahan = semua blok SQL utuh", jumlahBlok.reduce((a, b) => a + b, 0) === (sql1.match(/^do \$/gm) || []).length);
}

// ---------------------------------------------------------------- selisih §7
bagian("Laporan selisih §7 (vs Ringkasan sheet)");
// per_bulan Anvil dari olah di atas
const pb = lap.per_bulan;
cek("per_bulan 2025-09: 2 leads, 2 order, omzet 3.000.000", pb["2025-09"].leads === 2 && pb["2025-09"].order === 2 && pb["2025-09"].omzet === 3000000, pb["2025-09"]);
cek("per_bulan 2025-10: 7 leads, 2 order, omzet 8.000.000", pb["2025-10"].leads === 7 && pb["2025-10"].order === 2 && pb["2025-10"].omzet === 8000000, pb["2025-10"]);
cek("per_bulan 2025-11: 3 leads, 0 order", pb["2025-11"].leads === 3 && pb["2025-11"].order === 0, pb["2025-11"]);
{
  const sheetCocok = {
    "2025-09": { leads: 2, order: 2, omzet: 3000000 },
    "2025-10": { leads: 7, order: 2, omzet: 8000000 },
    "2025-11": { leads: 3, order: 0, omzet: 0 },
    "2025-12": { leads: 1, order: 0, omzet: 0 },
    "2099-01": { leads: 1, order: 0, omzet: 0 },
  };
  const lapOk = hitungLaporan(h, records, sheetCocok);
  cek("selisih LULUS saat angka cocok", lapOk.selisih.lulus === true, lapOk.selisih.rows);
  const sheetBeda = { ...sheetCocok, "2025-10": { leads: 7, order: 3, omzet: 8000000 } };
  const lapBeda = hitungLaporan(h, records, sheetBeda);
  cek("selisih TIDAK lulus saat order beda", lapBeda.selisih.lulus === false, lapBeda.selisih.rows.find((r) => r.bulan === "2025-10"));
  cek("selisih order 2025-10 = -1 (anvil 2 - sheet 3)", lapBeda.selisih.rows.find((r) => r.bulan === "2025-10").order.selisih === -1);
}

// ---------------------------------------------------------------- jalankanImpor end-to-end
bagian("End-to-end jalankanImpor + argumen");
{
  const r = jalankanImpor(teks, FIXTURE, opsi, HARI_INI);
  cek("jalankanImpor mengembalikan sql + lap + hasil", typeof r.sql === "string" && r.lap.terimpor === 14 && r.hasil.periksa.length === 10, { t: r.lap.terimpor, p: r.hasil.periksa.length });
  const salah = (a) => { try { bacaArgumen(a); return false; } catch { return true; } };
  cek("argumen: --pemilik salah ditolak", salah([FIXTURE, "--pemilik", "Riksa"]));
  cek("argumen: --sumber-default di luar enum ditolak", salah([FIXTURE, "--sumber-default", "Tiktok"]));
  cek("argumen: --aktor non-angka ditolak", salah([FIXTURE, "--aktor", "owner"]));
  cek("argumen: tanpa input ditolak", salah([]));
  const o2 = bacaArgumen([FIXTURE, "--pos", "--qty-default", "2", "--rep-anvil", "riksa"]);
  cek("argumen: --pos --qty-default 2 --rep-anvil riksa terbaca", o2.pos === true && o2.qtyDefault === 2 && o2.repAnvil.has("riksa") && !o2.repAnvil.has("michael"), { pos: o2.pos, q: o2.qtyDefault });
}

// ---------------------------------------------------------------- hasil
console.log(`\nLULUS ${hasil.lulus} · GAGAL ${hasil.gagal.length}`);
for (const g of hasil.gagal) console.log(`  - ${g}`);
process.exit(hasil.gagal.length ? 1 : 0);
