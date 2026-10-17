#!/usr/bin/env node
// alat/impor-pipeline.mjs — impor data Google Sheet "Customer Pipeline" (tab INPUT) ke tabel Pipeline Anvil (§7
// RANCANGAN-MODUL-PIPELINE.md). SATU KALI sebelum/di hari pindah; IDEMPOTEN & boleh diulang.
//
// Masukan: berkas EKSPOR sheet (CSV / TSV / JSON) — BUKAN konektor Google Drive (mungkin tak tersedia). Kolom sheet
// (A..N) dipetakan lewat header (alias longgar) atau posisi (--pos). Lihat docs/IMPOR-PIPELINE.md.
//
// Keluaran:
//   (a) .sql IDEMPOTEN (kunci lead = ref_sheet "rN"; dedup pelanggan by nama; dedup kontak by telepon; 1 lead_item;
//       1 lead_aktivitas jenis "Catatan impor"). Diterapkan lewat: bash alat/sql-proyek.sh <berkas.sql>.
//   (b) laporan selisih §7 (.md): total baris sheet, terimpor, PERIKSA, per tahap, per rep, basis bulanan (tanggal lead).
//       --ringkasan <file.json> → hitung selisih vs angka Ringkasan Bulanan sheet.
//   (c) daftar PERIKSA (.csv): baris ambigu/kurang data + alasan (SP gagal pola / SP dobel / order kurang data /
//       produk sebut "pallet" / enum tak cocok / dll.). Diserahkan ke Hannes/rep untuk dibereskan.
//
// Idempoten: jalankan 2x → SQL identik (deterministik; tanpa acak) & aman diterapkan ulang (cari-dulu / hapus-lalu-isi
// pada anak). Nilai tak cocok enum TIDAK dipaksa → ditandai periksa. Baris tinjau → periksa=true + periksa_sebab (agar
// lolos indeks unik parsial lead_no_sp_uniq yang mengecualikan baris periksa). Lead yang ordernya DIBATALKAN di Anvil
// (BATAL + alasan_batal "Order dibatalkan") dilewati utuh saat impor ulang → total Anvil bisa < sheet, sengaja.
//
//   node alat/impor-pipeline.mjs <berkas>                     → <berkas>.impor.sql + .laporan.md + .periksa.csv
//   node alat/impor-pipeline.mjs <berkas> --sql out.sql --laporan out.md --periksa out.csv
//   node alat/impor-pipeline.mjs <berkas> --pos               → tanpa baris header, kolom berurut A..N
//   node alat/impor-pipeline.mjs <berkas> --pemilik "Riksa=240260500,Michael=240260567"   → petakan rep → member_id
//   node alat/impor-pipeline.mjs <berkas> --rep-anvil "riksa,michael" --sumber-default Lainnya --qty-default 1 --aktor 312823267
//   node alat/impor-pipeline.mjs <berkas> --ringkasan sheet-ringkasan.json   → selisih vs sheet
//   node alat/impor-pipeline.mjs <berkas> --pecah 500         → <berkas>.impor.001.sql, .002.sql, … (tiap pecahan idempoten)
//   node alat/impor-pipeline.mjs <berkas> --stdout-sql        → SQL ke stdout (tanpa tulis berkas)
//
// stdout = ringkasan ANGKA (JSON). Tidak pernah mencetak nama/telepon pelanggan. Kode keluar: 0 ok, 1 galat argumen/baca.
// JANGAN commit berkas keluaran (berisi data pelanggan). Node >= 20, ESM.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ============================================================ konstanta enum (ikut migrasi 20261011120000)
export const PRODUK_SAH = ["Roda", "Pallet Mesh", "Airport Trolley", "Shopping Cart", "Lemari Arsip", "Material Handling", "Locker", "Lainnya"];
export const SUMBER_SAH = ["Google Ads", "Meta Ads", "Website organik", "WA langsung", "Telepon", "Referral", "Repeat order", "Lainnya"];
export const TAHAP_SAH = ["BARU", "PENAWARAN", "ORDER", "BATAL", "DIALIHKAN"];
// alasan_batal khusus tombol "Batalkan order" (migrasi 20261014130000_pipeline_batal_order). Lead BATAL dengan alasan ini =
// order yang DIBATALKAN di Anvil → impor ulang melewatinya (sheet masih menulis "Order"; tanpa penjaga lead kembali ORDER).
export const ALASAN_BATAL_ORDER = "Order dibatalkan";
export const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const POLA_SP = /^\d+\/(RSG|MCE)\/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\/20\d\d$/;
// nama perusahaan "kosong" menurut Ringkasan sheet (dikecualikan dari hitung unik) → jenis perorangan, tidak di-dedup
export const SENTINEL_PERORANGAN = new Set(["-", "?", "perorangan", "pribadi", "pr", "umum", "walk in", "walk-in"]);

// 14 kolom sheet INPUT berurut (A..N) + alias longgar (huruf besar/kecil & spasi diabaikan)
export const KOLOM = ["tgl", "company", "location", "pic", "phone", "status", "rep", "item", "remark", "respon", "no_sp", "nilai", "fu", "respon_fu"];
export const ALIAS = {
  tgl: ["tgl", "tanggal", "date", "a"],
  company: ["company", "company name", "perusahaan", "nama perusahaan", "nama", "b"],
  location: ["location", "kota", "lokasi", "c"],
  pic: ["pic name", "pic", "nama pic", "kontak", "contact", "d"],
  phone: ["phone no", "phone", "telepon", "telp", "hp", "no hp", "no telp", "e"],
  status: ["status", "tahap", "f"],
  rep: ["sales rep", "sales", "rep", "pemilik", "g"],
  item: ["item", "produk", "product", "h"],
  remark: ["remark", "kebutuhan", "note", "i"],
  respon: ["respon", "response", "respon pembeli", "j"],
  no_sp: ["no surat pesanan", "no sp", "nosp", "sp", "no_sp", "surat pesanan", "k"],
  nilai: ["nilai transaksi", "nilai", "transaksi", "value", "l"],
  fu: ["follow up", "followup", "fu", "m"],
  respon_fu: ["respon setelah fu", "respon fu", "respon setelah follow up", "n"],
};

// ============================================================ argumen
export function bacaArgumen(argv) {
  const o = {
    input: null, sql: null, laporan: null, periksa: null, stdoutSql: false,
    pemisah: null, pos: false, mulaiBaris: 2, refKolom: null,
    pemilikPeta: new Map(), repAnvil: new Set(["riksa", "michael"]),
    sumberDefault: "Lainnya", qtyDefault: 1, aktor: "312823267", ringkasan: null, pecah: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sql") o.sql = argv[++i];
    else if (a === "--laporan") o.laporan = argv[++i];
    else if (a === "--periksa") o.periksa = argv[++i];
    else if (a === "--stdout-sql") o.stdoutSql = true;
    else if (a === "--pemisah") o.pemisah = argv[++i];
    else if (a === "--pos") o.pos = true;
    else if (a === "--mulai-baris") o.mulaiBaris = Number.parseInt(argv[++i], 10);
    else if (a === "--ref-kolom") o.refKolom = argv[++i];
    else if (a === "--sumber-default") o.sumberDefault = argv[++i];
    else if (a === "--qty-default") o.qtyDefault = Number(argv[++i]);
    else if (a === "--aktor") o.aktor = String(argv[++i]).trim();
    else if (a === "--ringkasan") o.ringkasan = argv[++i];
    else if (a === "--pecah") o.pecah = Number.parseInt(argv[++i], 10);
    else if (a === "--rep-anvil") o.repAnvil = new Set(argv[++i].split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
    else if (a === "--pemilik") {
      for (const par of argv[++i].split(",")) {
        const m = par.split("=");
        if (m.length === 2 && m[0].trim() && /^\d+$/.test(m[1].trim())) o.pemilikPeta.set(m[0].trim().toLowerCase(), m[1].trim());
        else throw new Error(`--pemilik salah: "${par}" (pakai Label=member_id)`);
      }
    } else if (a.startsWith("--")) throw new Error(`argumen tidak dikenal: ${a}`);
    else if (!o.input) o.input = a;
    else throw new Error(`argumen berlebih: ${a}`);
  }
  if (!o.input) throw new Error("berkas masukan wajib (CSV/TSV/JSON)");
  if (!Number.isFinite(o.mulaiBaris) || o.mulaiBaris < 1) throw new Error("--mulai-baris harus angka >= 1");
  if (!Number.isFinite(o.qtyDefault) || o.qtyDefault <= 0) throw new Error("--qty-default harus angka > 0");
  if (!SUMBER_SAH.includes(o.sumberDefault)) throw new Error(`--sumber-default harus salah satu: ${SUMBER_SAH.join(", ")}`);
  if (!/^\d+$/.test(o.aktor)) throw new Error("--aktor harus member_id (angka)");
  if (!Number.isFinite(o.pecah) || o.pecah < 0) throw new Error("--pecah harus angka >= 0 (0 = satu berkas)");
  return o;
}

// ============================================================ parser CSV/TSV (RFC4180-ish; telepon bisa multi-baris)
export function uraiTabel(teks, pemisah) {
  const baris = [];
  let sel = [], cur = "", inq = false;
  teks = teks.replace(/^﻿/, ""); // buang BOM
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (inq) {
      if (c === '"') { if (teks[i + 1] === '"') { cur += '"'; i++; } else inq = false; }
      else cur += c;
    } else if (c === '"') inq = true;
    else if (c === pemisah) { sel.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && teks[i + 1] === "\n") i++;
      sel.push(cur); baris.push(sel); sel = []; cur = "";
    } else cur += c;
  }
  if (cur !== "" || sel.length) { sel.push(cur); baris.push(sel); }
  return baris;
}

export function deteksiPemisah(nama, opsiPemisah) {
  if (opsiPemisah === "tab" || opsiPemisah === "\\t") return "\t";
  if (opsiPemisah) return opsiPemisah;
  if (/\.tsv$/i.test(nama)) return "\t";
  return ",";
}

// Baca berkas → array record ternormalisasi { field: nilai, _baris: <no. baris sheet> }.
export function bacaRecord(teks, nama, opsi) {
  const ext = path.extname(nama).toLowerCase();
  if (ext === ".json" || (opsi.pemisah === "json")) {
    let data = JSON.parse(teks);
    if (!Array.isArray(data)) data = data.rows || data.data || data.INPUT || [];
    return data.map((obj, idx) => petakanObjek(obj, idx, opsi));
  }
  const pemisah = deteksiPemisah(nama, opsi.pemisah);
  // JANGAN saring baris kosong: _baris harus tetap sejajar nomor baris sheet asli (ref_sheet dipakai lacak-balik & routine).
  // Baris kosong lolos sebagai tanggal kosong → dilewati di olah(), tapi penghitung baris tak bergeser.
  const baris = uraiTabel(teks, pemisah);
  if (!baris.length) return [];
  let peta, mulai, kolomNama = null;
  if (opsi.pos) {
    peta = KOLOM.map((_, i) => i);
    mulai = 0;
  } else {
    kolomNama = baris[0].map((h) => String(h).trim().toLowerCase());
    peta = KOLOM.map((f) => cariKolom(kolomNama, f));
    // Sheet asli: header kolom A (tanggal) KOSONG → tak terpetakan lewat alias. Jatuhkan ke posisi kolom pertama.
    if (peta[0] < 0) peta[0] = 0;
    mulai = 1;
  }
  const refIdx = opsi.refKolom && kolomNama ? kolomNama.indexOf(opsi.refKolom.toLowerCase()) : -1;
  const out = [];
  for (let r = mulai; r < baris.length; r++) {
    const sel = baris[r];
    const rec = { _baris: opsi.mulaiBaris + (r - mulai) };
    if (refIdx >= 0 && sel[refIdx]) rec._ref = String(sel[refIdx]).trim();
    for (let f = 0; f < KOLOM.length; f++) rec[KOLOM[f]] = peta[f] >= 0 ? (sel[peta[f]] ?? "") : "";
    out.push(rec);
  }
  return out;
}

function cariKolom(kolomNama, field) {
  for (const a of ALIAS[field]) { const i = kolomNama.indexOf(a); if (i >= 0) return i; }
  // cocokkan longgar (header memuat alias)
  for (const a of ALIAS[field]) { const i = kolomNama.findIndex((h) => h === a || h.replace(/[^a-z0-9]/g, "") === a.replace(/[^a-z0-9]/g, "")); if (i >= 0) return i; }
  return -1;
}

function petakanObjek(obj, idx, opsi) {
  const low = {};
  for (const k of Object.keys(obj)) low[String(k).trim().toLowerCase()] = obj[k];
  const rec = { _baris: opsi.mulaiBaris + idx };
  if (opsi.refKolom && low[opsi.refKolom.toLowerCase()] != null) rec._ref = String(low[opsi.refKolom.toLowerCase()]).trim();
  else if (low.ref_sheet != null) rec._ref = String(low.ref_sheet).trim();
  for (const f of KOLOM) {
    let v = "";
    for (const a of ALIAS[f]) if (low[a] != null) { v = low[a]; break; }
    rec[f] = v == null ? "" : String(v);
  }
  return rec;
}

// ============================================================ pembersih nilai (mencerminkan fungsi SQL bila relevan)
const bersih = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function telpNorm(s) {
  const d = String(s ?? "").replace(/[^0-9]/g, "");
  if (d.length < 7) return null;
  if (d.slice(0, 2) === "62") return d;
  if (d[0] === "0") return "62" + d.slice(1);
  if (d[0] === "8") return "62" + d;
  return d;
}

export function romawi(n) { return (n >= 1 && n <= 12) ? ROMAWI[n - 1] : null; }

function iso(y, mo, d) {
  if (!(y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function serialTanggal(n) {
  // epoch serial Google/Excel = 1899-12-30
  if (!(n > 0 && n < 80000)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

const BULAN_PEMISAH = /^(jan(uari)?|feb(ruari)?|mar(et|ch)?|apr(il)?|mei|may|jun(i|e)?|jul(i|y)?|agu(stus)?|aug(ust)?|sep(tember)?|okt(ober)?|oct(ober)?|nov(ember)?|des(ember)?|dec(ember)?)(\s+20\d\d)?$/i;

export function parseTanggal(s) {
  const v = bersih(s);
  if (!v) return { kosong: true };
  if (BULAN_PEMISAH.test(v)) return { pemisah: true };         // teks pemisah bulan ("NOVEMBER", "JANUARI 2026")
  if (!/\d/.test(v)) return { pemisah: true };                 // teks lain tanpa angka → anggap pemisah
  let m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);     // dd/mm/yyyy atau d/m/yy
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = iso(y, +m[2], +m[1]); if (d) return { date: d }; return { takTerbaca: true }; }
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                  // yyyy-mm-dd(...)
  if (m) { const d = iso(+m[1], +m[2], +m[3]); if (d) return { date: d }; return { takTerbaca: true }; }
  if (/^\d+(\.\d+)?$/.test(v)) { const d = serialTanggal(Number(v)); if (d) return { date: d }; }
  return { takTerbaca: true };
}

export function parseNilai(s) {
  const v = bersih(s);
  if (!v) return { kosong: true };
  const sisa = v.toLowerCase().replace(/rp\.?/g, "").replace(/[\d.,\s]/g, "");
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return { takTerbaca: true };
  if (sisa) return { nilai: Number(digits), mengandungHuruf: true };   // "5jt", "2025 fu" dll → curiga
  return { nilai: Number(digits) };
}

export function parseSP(s) {
  const v = bersih(s);
  if (!v) return { kosong: true };
  return { nilai: v, ok: POLA_SP.test(v) };
}

export function klasifikasiTahap(s) {
  const t = bersih(s).toLowerCase();
  if (!t) return "BARU";
  if (/order/.test(t)) return "ORDER";
  if (/batal|cancel/.test(t)) return "BATAL";
  if (/sales\s*lain|follow\s*up\s*sales|dialih|alih/.test(t)) return "DIALIHKAN";
  if (/kirim\s*penawaran|penawaran|quot|visit|kunjung/.test(t)) return "PENAWARAN";
  return "BARU";
}

export function petakanProduk(h) {
  const v = bersih(h); const l = v.toLowerCase();
  if (!v) return { produk: "Lainnya", dikenal: false, kosong: true };
  if (/pallet/.test(l)) return { produk: "Pallet Mesh", dikenal: true };
  if (/shopping\s*cart|keranjang|trol?i\s*belanja/.test(l)) return { produk: "Shopping Cart", dikenal: true };
  if (/airport|trol?ley|trol?i/.test(l)) return { produk: "Airport Trolley", dikenal: true };
  if (/roda|castor|kastor/.test(l)) return { produk: "Roda", dikenal: true };
  if (/cabinet|lemari|arsip|filing/.test(l)) return { produk: "Lemari Arsip", dikenal: true };
  if (/material\s*handling|mat\s*handling/.test(l)) return { produk: "Material Handling", dikenal: true };
  if (/locker|loker/.test(l)) return { produk: "Locker", dikenal: true };
  if (/^other$|lain/.test(l)) return { produk: "Lainnya", dikenal: true };
  return { produk: "Lainnya", dikenal: false };                 // tak dikenal → Lainnya + PERIKSA
}

const sebutPallet = (...t) => /pallet/i.test(t.filter(Boolean).join(" "));

// ============================================================ olah (semua baris → objek olahan + laporan + periksa)
export function olah(records, opsi, hariIni = new Date().toISOString().slice(0, 10)) {
  const leads = [];
  const dilewati = [];               // {ref, sebab} baris tak diimpor (pemisah / tanggal tak terbaca)
  const periksa = [];                // {ref, kode, tahap, sebab} untuk daftar PERIKSA
  const spLihat = new Map();         // no_sp(normcase) → [ref...] untuk deteksi dobel

  for (const rec of records) {
    const ref = rec._ref ? rec._ref : `r${rec._baris}`;
    const tgl = parseTanggal(rec.tgl);
    if (tgl.pemisah) { dilewati.push({ ref, jenis: "pemisah", sebab: `baris pemisah bulan: "${bersih(rec.tgl)}"` }); continue; }
    if (tgl.takTerbaca || tgl.kosong) { dilewati.push({ ref, jenis: "tanggal", sebab: `tanggal tidak terbaca: "${bersih(rec.tgl)}"` }); continue; }

    const sebab = [];
    const lead = { ref_sheet: ref, tanggal_masuk: tgl.date, periksa: false };

    // ---- pelanggan
    let nama = bersih(rec.company);
    let jenis = "perusahaan";
    let dedup = true;
    if (!nama) { nama = bersih(rec.pic) || "(Tanpa nama perusahaan)"; jenis = "perorangan"; dedup = false; sebab.push("nama perusahaan kosong di sheet"); }
    else if (SENTINEL_PERORANGAN.has(nama.toLowerCase())) { jenis = "perorangan"; dedup = false; }
    lead.pelanggan = { nama, jenis, kota: bersih(rec.location) || null, dedup };

    // ---- kontak
    const telpRaw = bersih(rec.phone);
    const telp = telpNorm(telpRaw);
    const pic = bersih(rec.pic);
    lead.kontak = (pic || telp) ? { nama: pic || null, telepon: telp, telepon_tampil: telpRaw || null } : null;

    // ---- tahap (dari F, teks asli disimpan)
    lead.tahap = klasifikasiTahap(rec.status);
    lead.catatan_impor = bersih(rec.status) || null;

    // ---- pemilik / dialihkan_ke (G)
    const g = bersih(rec.rep);
    lead.pemilik = null; lead.dialihkan_ke = null;
    if (g) {
      const gl = g.toLowerCase();
      const basis = [...opsi.repAnvil].find((r) => gl === r || gl.includes(r));
      if (basis) {
        if (opsi.pemilikPeta.has(gl)) lead.pemilik = { mode: "id", id: opsi.pemilikPeta.get(gl), label: g };
        else if (opsi.pemilikPeta.has(basis)) lead.pemilik = { mode: "id", id: opsi.pemilikPeta.get(basis), label: g };
        else lead.pemilik = { mode: "nama", basis, label: g };     // resolusi by username saat terapkan SQL
      } else {
        lead.dialihkan_ke = g;                                     // kota / sales lain → teks apa adanya
      }
    }

    // ---- sumber (sheet tak punya; wajib NOT NULL) → default
    lead.sumber = opsi.sumberDefault;

    // ---- kebutuhan / catatan (I, J)
    lead.kebutuhan = bersih(rec.remark) || null;
    lead.catatan = bersih(rec.respon) || null;

    // ---- no_sp / nilai_transaksi / tanggal_sp (K, L)
    const sp = parseSP(rec.no_sp);
    const nilai = parseNilai(rec.nilai);
    lead.no_sp = null; lead.nilai_transaksi = null; lead.tanggal_sp = null;
    if (!sp.kosong) {
      lead.no_sp = sp.nilai;
      if (!sp.ok) sebab.push(`No SP tidak sesuai pola §3: "${sp.nilai}"`);
      const key = sp.nilai.toLowerCase();
      if (!spLihat.has(key)) spLihat.set(key, []);
      spLihat.get(key).push(ref);
    }
    if (!nilai.kosong) {
      if (nilai.takTerbaca) sebab.push(`Nilai transaksi tidak terbaca: "${bersih(rec.nilai)}"`);
      else { lead.nilai_transaksi = nilai.nilai; if (nilai.mengandungHuruf) sebab.push(`Nilai transaksi memuat huruf: "${bersih(rec.nilai)}"`); }
    }

    // ---- SP + nilai terisi tapi status sheet belum "Order" → ORDER (aturan §3: SP terisi → ORDER). Tanpa ini omzet
    // baris itu hilang dari ringkasan (cek 12 Okt: 5 baris, Rp5.753.519). Tetap PERIKSA supaya bisa ditinjau.
    if (lead.tahap !== "ORDER" && lead.tahap !== "BATAL" && lead.no_sp && lead.nilai_transaksi > 0) {
      sebab.push(`ada No SP + Nilai tapi status sheet bukan Order ("${bersih(rec.status)}") → dijadikan ORDER (aturan §3)`);
      lead.tahap = "ORDER";
    }

    // ---- aturan tahap ORDER vs kelengkapan (§7 no.2) — tidak dipaksa, hanya ditandai
    if (lead.tahap === "ORDER") {
      lead.tanggal_sp = tgl.date;                                  // tanggal SP belum diketahui → diisi tanggal lead
      sebab.push("tanggal SP diisi dari tanggal lead (belum diketahui di sheet) — verifikasi");
      if (!lead.no_sp) sebab.push("tahap ORDER tapi tidak ada No SP");
      if (lead.nilai_transaksi == null) sebab.push("tahap ORDER tapi tidak ada Nilai Transaksi");
    } else if (lead.no_sp) {
      // ada SP tapi tahap bukan ORDER (§7 no.2 arah sebaliknya)
      lead.tanggal_sp = tgl.date;
      sebab.push("ada No SP tapi tahap bukan ORDER");
    }
    if (lead.tahap === "BATAL") sebab.push("tahap BATAL — isi alasan_batal (tidak diimpor dari sheet)" + (bersih(rec.respon) ? ` (petunjuk kolom J: "${bersih(rec.respon)}")` : ""));
    if (lead.tahap === "DIALIHKAN" && !lead.dialihkan_ke) sebab.push("tahap DIALIHKAN tapi tujuan (kolom G) kosong");
    if (tgl.date > hariIni) sebab.push(`tanggal masuk di masa depan: ${tgl.date} (cek salah ketik tahun)`);

    // ---- lead_item (H) — 1 item; qty tidak ada di sheet → default
    const prod = petakanProduk(rec.item);
    const item = { produk: prod.produk, qty: opsi.qtyDefault, satuan: "unit", spesifikasi: null, periksa: false, sebab: [] };
    if (prod.kosong) item.sebab.push("produk kosong di sheet → Lainnya");
    else if (!prod.dikenal) item.sebab.push(`produk tak dikenal: "${bersih(rec.item)}" → Lainnya`);
    if (prod.produk !== "Pallet Mesh" && sebutPallet(rec.remark, rec.respon, rec.respon_fu)) {
      item.sebab.push('teks menyebut "pallet" tapi produk bukan Pallet Mesh (tidak diubah otomatis)');
    }
    if (prod.produk === "Pallet Mesh") item.sebab.push(`qty Pallet Mesh = default ${opsi.qtyDefault} (perlu diisi dari teks untuk win-rate <20u vs >=20u)`);
    if (item.sebab.length) item.periksa = true;
    lead.item = item;

    // ---- lead_aktivitas "Catatan impor" (M + N)
    const fu = bersih(rec.fu);
    const nFU = bersih(rec.respon_fu);
    const isi = [fu ? `FU: ${fu}` : null, nFU ? `Respon setelah FU: ${nFU}` : null].filter(Boolean).join(". ");
    lead.catatan_impor_akt = isi || null;

    // ---- gabung periksa
    if (item.periksa) sebab.push(...item.sebab);
    if (sebab.length) { lead.periksa = true; lead.periksa_sebab = sebab.join("; "); periksa.push({ ref, tahap: lead.tahap, sebab: lead.periksa_sebab }); }
    leads.push(lead);
  }

  // ---- SP dobel: tandai semua baris yang berbagi no_sp (§7)
  for (const [key, refs] of spLihat) {
    if (refs.length > 1) {
      for (const lead of leads) {
        if (lead.no_sp && lead.no_sp.toLowerCase() === key) {
          const tmb = `No SP dobel di ${refs.length} baris (${refs.join(", ")})`;
          lead.periksa = true;
          lead.periksa_sebab = lead.periksa_sebab ? `${lead.periksa_sebab}; ${tmb}` : tmb;
          const p = periksa.find((x) => x.ref === lead.ref_sheet);
          if (p) p.sebab = lead.periksa_sebab; else periksa.push({ ref: lead.ref_sheet, tahap: lead.tahap, sebab: lead.periksa_sebab });
        }
      }
    }
  }

  return { leads, dilewati, periksa };
}

// ============================================================ laporan (hitungan + selisih §7)
export function hitungLaporan(hasil, records, ringkasanSheet = null) {
  const { leads, dilewati, periksa } = hasil;
  const perTahap = Object.fromEntries(TAHAP_SAH.map((t) => [t, 0]));
  const perRep = {};
  const perBulan = {};   // bulan(tanggal lead) → {leads, order, omzet}
  for (const l of leads) {
    perTahap[l.tahap]++;
    const rep = l.pemilik ? l.pemilik.label : (l.dialihkan_ke ? `→ ${l.dialihkan_ke}` : "(tanpa pemilik)");
    perRep[rep] = (perRep[rep] || 0) + 1;
    const bln = l.tanggal_masuk.slice(0, 7);
    perBulan[bln] ??= { leads: 0, order: 0, omzet: 0 };
    perBulan[bln].leads++;
    if (l.tahap === "ORDER") { perBulan[bln].order++; perBulan[bln].omzet += l.nilai_transaksi || 0; }
  }
  const lap = {
    total_baris_sheet: records.length,
    tidak_terimpor: dilewati.length,
    pemisah_bulan: dilewati.filter((d) => d.jenis === "pemisah").length,
    tanggal_tak_terbaca: dilewati.filter((d) => d.jenis === "tanggal").length,
    terimpor: leads.length,
    periksa: periksa.length,
    per_tahap: perTahap,
    per_rep: perRep,
    per_bulan: perBulan,
    basis: "tanggal lead (kolom A) — untuk cocok-silang dengan Ringkasan Bulanan sheet (§7)",
  };
  if (ringkasanSheet) lap.selisih = hitungSelisih(perBulan, ringkasanSheet);
  return lap;
}

// Selisih per bulan vs angka Ringkasan Bulanan sheet. ringkasanSheet = { "YYYY-MM": {leads, order, omzet}, ... }
function hitungSelisih(perBulan, sheet) {
  const bulan = [...new Set([...Object.keys(perBulan), ...Object.keys(sheet)])].sort();
  const rows = [];
  for (const b of bulan) {
    const a = perBulan[b] || { leads: 0, order: 0, omzet: 0 };
    const s = sheet[b] || { leads: 0, order: 0, omzet: 0 };
    rows.push({
      bulan: b,
      leads: { anvil: a.leads, sheet: s.leads ?? 0, selisih: a.leads - (s.leads ?? 0) },
      order: { anvil: a.order, sheet: s.order ?? 0, selisih: a.order - (s.order ?? 0) },
      omzet: { anvil: a.omzet, sheet: s.omzet ?? 0, selisih: a.omzet - (s.omzet ?? 0) },
    });
  }
  const lulus = rows.every((r) => r.leads.selisih === 0 && r.order.selisih === 0 && r.omzet.selisih === 0);
  return { lulus, rows };
}

export function laporanMarkdown(lap, hasil, sumberNama) {
  const l = [];
  l.push(`# Laporan impor Pipeline (§7)`, "");
  l.push(`Sumber: \`${path.basename(sumberNama)}\` · dihasilkan ${new Date().toISOString()}`, "");
  l.push(`## Hitungan`, "");
  l.push(`| Metrik | Jumlah |`, `|---|---|`);
  l.push(`| Total baris sheet | ${lap.total_baris_sheet} |`);
  l.push(`| Tidak terimpor | ${lap.tidak_terimpor} |`);
  l.push(`| · baris pemisah bulan | ${lap.pemisah_bulan} |`);
  l.push(`| · tanggal tak terbaca | ${lap.tanggal_tak_terbaca} |`);
  l.push(`| Terimpor (lead) | ${lap.terimpor} |`);
  l.push(`| PERIKSA (perlu tinjau) | ${lap.periksa} |`, "");
  l.push(`## Per tahap`, "");
  l.push(`| Tahap | Jumlah |`, `|---|---|`);
  for (const t of TAHAP_SAH) l.push(`| ${t} | ${lap.per_tahap[t]} |`);
  l.push("");
  l.push(`## Per rep (pemilik / dialihkan)`, "");
  l.push(`| Rep | Lead |`, `|---|---|`);
  for (const [r, n] of Object.entries(lap.per_rep).sort((a, b) => b[1] - a[1])) l.push(`| ${r} | ${n} |`);
  l.push("");
  l.push(`## Basis bulanan (tanggal lead) — cocok-silang Ringkasan sheet`, "");
  l.push(`| Bulan | Leads | Order | Omzet |`, `|---|---|---|---|`);
  for (const b of Object.keys(lap.per_bulan).sort()) {
    const x = lap.per_bulan[b];
    l.push(`| ${b} | ${x.leads} | ${x.order} | ${rupiah(x.omzet)} |`);
  }
  l.push("");
  l.push(`_Angka di atas = isi sheet. Lead yang ordernya dibatalkan di Anvil (alasan "${ALASAN_BATAL_ORDER}") dilewati SQL, jadi order/omzet Ringkasan Anvil sesudah impor bisa lebih kecil dari sheet (sengaja)._`, "");
  if (lap.selisih) {
    l.push(`## Selisih vs Ringkasan Bulanan sheet`, "");
    l.push(`Status: **${lap.selisih.lulus ? "LULUS (selisih 0 semua)" : "ADA SELISIH — jelaskan baris per baris sebelum kunci sheet (§7)"}**`, "");
    l.push(`| Bulan | Leads A/S/Δ | Order A/S/Δ | Omzet A/S/Δ |`, `|---|---|---|---|`);
    for (const r of lap.selisih.rows) {
      l.push(`| ${r.bulan} | ${r.leads.anvil}/${r.leads.sheet}/${tanda(r.leads.selisih)} | ${r.order.anvil}/${r.order.sheet}/${tanda(r.order.selisih)} | ${rupiah(r.omzet.anvil)}/${rupiah(r.omzet.sheet)}/${tanda(r.omzet.selisih)} |`);
    }
    l.push("");
  }
  l.push(`## PERIKSA (baris perlu ditinjau manusia)`, "");
  if (!hasil.periksa.length) l.push("_(tidak ada)_", "");
  else {
    l.push(`| ref_sheet | tahap | sebab |`, `|---|---|---|`);
    for (const p of hasil.periksa) l.push(`| ${p.ref} | ${p.tahap} | ${p.sebab} |`);
    l.push("");
  }
  return l.join("\n");
}

const tanda = (n) => (n > 0 ? `+${n}` : String(n));
const rupiah = (n) => "Rp" + (n || 0).toLocaleString("id-ID");

export function periksaCsv(hasil) {
  const esc = (s) => { const v = String(s ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const out = ["ref_sheet,tahap,sebab"];
  for (const p of hasil.periksa) out.push([p.ref, p.tahap, p.sebab].map(esc).join(","));
  return out.join("\n") + "\n";
}

// ============================================================ generator SQL IDEMPOTEN
const qstr = (v) => (v === null || v === undefined || v === "") ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const qstrWajib = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;         // untuk nama (tak boleh null)
const qnum = (v) => (v === null || v === undefined || Number.isNaN(v)) ? "null" : String(v);
const qdate = (v) => v ? `'${v}'::date` : "null";
const qbool = (v) => (v ? "true" : "false");

function pilihTag(teks) {
  let tag = "rhjimpor";
  while (teks.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$`;
}

function blokLead(lead) {
  const p = lead.pelanggan, k = lead.kontak, it = lead.item;
  const L = [];
  L.push(`declare`);
  L.push(`  v_pel text; v_kontak text; v_lead text; v_pel_lama text; v_kontak_lama text; v_pemilik bigint; v_telp text;`);
  L.push(`begin`);
  L.push(`  select id, pelanggan_id, kontak_id into v_lead, v_pel_lama, v_kontak_lama from public.lead where ref_sheet = ${qstrWajib(lead.ref_sheet)} limit 1;`);
  // penjaga: order yang dibatalkan di Anvil ("Batalkan order", alasan tertulis) TIDAK disentuh sama sekali (pelanggan,
  // kontak, lead, item, catatan) → pembatalan + alasannya tidak hilang & lead tidak kembali ORDER/omzet.
  L.push(`  if v_lead is not null and exists (select 1 from public.lead where id = v_lead and tahap = 'BATAL' and alasan_batal = ${qstrWajib(ALASAN_BATAL_ORDER)}) then return; end if;`);
  // pelanggan
  if (p.dedup) {
    // Cari pelanggan (database pelanggan, migrasi 20261017120000 — WAJIB sudah terpasang): (1) nama persis; (2) kunci nama
    // sama (PT./CV/tanda baca beda = aturan gabung otomatis); (3) nama pelanggan yang sudah DIGABUNG di Anvil → tujuan
    // gabungnya; (4) lead lama: tetap di pelanggannya sekarang (gabung/ubah nama di Anvil dihormati); (5) baru → buat.
    // Tanpa (2)–(4) impor ulang di hari pindah membuat lagi pelanggan yang sudah digabung dan memindah lead-nya kembali.
    L.push(`  select id into v_pel from public.pelanggan where lower(btrim(nama)) = lower(${qstrWajib(p.nama)}) limit 1;`);
    L.push(`  if v_pel is null then select id into v_pel from public.pelanggan where kunci = public.pipeline_nama_kunci(${qstrWajib(p.nama)}) order by id limit 1; end if;`);
    L.push(`  if v_pel is null then select public.pipeline_pelanggan_akhir(g.dari_id) into v_pel from public.pelanggan_gabung g where g.dibatalkan_pada is null and public.pipeline_nama_kunci(g.dari ->> 'nama') = public.pipeline_nama_kunci(${qstrWajib(p.nama)}) order by g.id desc limit 1; end if;`);
    L.push(`  if v_pel is null then v_pel := v_pel_lama; end if;`);
    L.push(`  if v_pel is null then`);
    L.push(`    insert into public.pelanggan (nama, jenis, kota) values (${qstrWajib(p.nama)}, ${qstr(p.jenis)}, ${qstr(p.kota)}) returning id into v_pel;`);
    L.push(`  elsif ${qstr(p.kota)} is not null then update public.pelanggan set kota = coalesce(kota, ${qstr(p.kota)}) where id = v_pel; end if;`);
  } else {
    // perorangan/tanpa nama: jangan di-dedup; pakai pelanggan lead lama bila sudah ada (idempoten)
    L.push(`  if v_pel_lama is not null then v_pel := v_pel_lama;`);
    L.push(`  else insert into public.pelanggan (nama, jenis, kota) values (${qstrWajib(p.nama)}, ${qstr(p.jenis)}, ${qstr(p.kota)}) returning id into v_pel; end if;`);
  }
  // kontak
  if (k) {
    L.push(`  v_telp := public.pipeline_telp_norm(${qstr(k.telepon_tampil)});`);
    L.push(`  if v_telp is not null then select id into v_kontak from public.kontak where pelanggan_id = v_pel and telepon = v_telp limit 1; end if;`);
    L.push(`  if v_kontak is null then`);
    L.push(`    if v_kontak_lama is not null and exists (select 1 from public.kontak where id = v_kontak_lama and pelanggan_id = v_pel) then`);
    L.push(`      v_kontak := v_kontak_lama;`);
    L.push(`      update public.kontak set nama = ${qstr(k.nama)}, telepon = v_telp, telepon_tampil = ${qstr(k.telepon_tampil)} where id = v_kontak;`);
    L.push(`    else insert into public.kontak (pelanggan_id, nama, telepon, telepon_tampil) values (v_pel, ${qstr(k.nama)}, v_telp, ${qstr(k.telepon_tampil)}) returning id into v_kontak; end if;`);
    L.push(`  end if;`);
  }
  // pemilik
  if (lead.pemilik && lead.pemilik.mode === "id") {
    L.push(`  select id into v_pemilik from public.members where id = ${qnum(Number(lead.pemilik.id))} and aktif;`);
  } else if (lead.pemilik && lead.pemilik.mode === "nama") {
    L.push(`  select id into v_pemilik from public.members where aktif and lower(username) like ${qstrWajib("%" + lead.pemilik.basis + "%")} order by id limit 1;`);
  }
  // lead upsert
  const kolom = `pelanggan_id, kontak_id, sumber, pemilik, dialihkan_ke, tahap, tanggal_masuk, kebutuhan, catatan, catatan_impor, no_sp, tanggal_sp, nilai_transaksi, periksa, periksa_sebab, ref_sheet`;
  const pemilikExpr = lead.pemilik ? "v_pemilik" : "null";
  const nilaiList = [
    "v_pel", k ? "v_kontak" : "null", qstr(lead.sumber), pemilikExpr, qstr(lead.dialihkan_ke),
    qstr(lead.tahap), qdate(lead.tanggal_masuk), qstr(lead.kebutuhan), qstr(lead.catatan), qstr(lead.catatan_impor),
    qstr(lead.no_sp), qdate(lead.tanggal_sp), qnum(lead.nilai_transaksi), qbool(lead.periksa), qstr(lead.periksa_sebab), qstrWajib(lead.ref_sheet),
  ];
  L.push(`  if v_lead is null then`);
  L.push(`    insert into public.lead (${kolom}) values (${nilaiList.join(", ")}) returning id into v_lead;`);
  L.push(`  else`);
  L.push(`    update public.lead set pelanggan_id = v_pel, kontak_id = ${k ? "v_kontak" : "null"}, sumber = ${qstr(lead.sumber)}, pemilik = ${pemilikExpr}, dialihkan_ke = ${qstr(lead.dialihkan_ke)}, tahap = ${qstr(lead.tahap)}, tanggal_masuk = ${qdate(lead.tanggal_masuk)}, kebutuhan = ${qstr(lead.kebutuhan)}, catatan = ${qstr(lead.catatan)}, catatan_impor = ${qstr(lead.catatan_impor)}, no_sp = ${qstr(lead.no_sp)}, tanggal_sp = ${qdate(lead.tanggal_sp)}, nilai_transaksi = ${qnum(lead.nilai_transaksi)}, periksa = ${qbool(lead.periksa)}, periksa_sebab = ${qstr(lead.periksa_sebab)} where id = v_lead;`);
  L.push(`  end if;`);
  // anak: hapus-lalu-isi (idempoten)
  L.push(`  delete from public.lead_item where lead_id = v_lead;`);
  L.push(`  insert into public.lead_item (lead_id, produk, qty, satuan, spesifikasi, periksa, periksa_sebab) values (v_lead, ${qstr(it.produk)}, ${qnum(it.qty)}, ${qstr(it.satuan)}, ${qstr(it.spesifikasi)}, ${qbool(it.periksa)}, ${qstr(it.periksa ? it.sebab.join("; ") : null)});`);
  L.push(`  delete from public.lead_aktivitas where lead_id = v_lead and jenis = 'Catatan impor';`);
  // waktu catatan impor = tanggal lead pukul 12:00 WIB (bukan saat impor; tengah hari supaya ::date tidak bergeser zona), supaya riwayat & "diam N hari" tidak tampak baru hari ini
  if (lead.catatan_impor_akt) L.push(`  insert into public.lead_aktivitas (lead_id, jenis, hasil, waktu) values (v_lead, 'Catatan impor', ${qstr(lead.catatan_impor_akt)}, ((${qdate(lead.tanggal_masuk)}) + time '12:00') at time zone 'Asia/Jakarta');`);
  // diam_sejak: sheet tidak menyimpan tanggal FU → pakai tanggal lead, kecuali sudah ada aktivitas nyata di Anvil
  // (FU yang dicatat rep sesudah impor). Tanpa ini semua lead impor tercatat "diam 0 hari" (cek 12 Okt).
  L.push(`  update public.lead set diam_sejak = greatest(((${qdate(lead.tanggal_masuk)}) + time '12:00') at time zone 'Asia/Jakarta', coalesce((select max(a.waktu) from public.lead_aktivitas a where a.lead_id = v_lead and a.jenis <> 'Catatan impor'), '-infinity'::timestamptz)) where id = v_lead;`);
  L.push(`end`);
  return L.join("\n");
}

// Bangun SQL untuk sekumpulan lead (default semua; `leads` = subset untuk pecahan). `info` → keterangan pecahan.
export function buatSQL(hasil, opsi, sumberNama, leads = hasil.leads, info = "") {
  const periksaN = leads.filter((l) => l.periksa).length;
  const kepala = [];
  kepala.push(`-- Impor Pipeline (§7) — DIHASILKAN oleh alat/impor-pipeline.mjs. JANGAN commit (berisi data pelanggan).`);
  kepala.push(`-- Sumber: ${path.basename(sumberNama)}${info ? ` ${info}` : ""} · lead: ${leads.length} · periksa: ${periksaN}`);
  kepala.push(`-- Terapkan: bash alat/sql-proyek.sh <berkas .impor.sql>   (idempoten; aman diulang — kunci ref_sheet)`);
  kepala.push(`-- Lead yang ordernya DIBATALKAN di Anvil (BATAL + alasan_batal '${ALASAN_BATAL_ORDER}') dilewati utuh: tidak dikembalikan ke ORDER.`);
  kepala.push(`-- Konteks aktor impor (dibuat_oleh/riwayat). Sumber 'impor'. Tanpa ini, dibuat_oleh = null (FK nullable, tetap jalan).`);
  kepala.push(`set statement_timeout = 0;`);
  kepala.push(`select set_config('app.sumber', 'impor', false);`);
  kepala.push(`select set_config('app.actor_id', '${opsi.aktor}', false);`);
  kepala.push("");
  const blok = leads.map((lead) => {
    const body = blokLead(lead);
    const tag = pilihTag(body);
    return `-- ${lead.ref_sheet}${lead.periksa ? " [PERIKSA]" : ""}\ndo ${tag}\n${body}\n${tag};`;
  });
  return kepala.join("\n") + "\n" + blok.join("\n\n") + "\n";
}

// Pecah lead menjadi beberapa berkas SQL (tiap pecahan idempoten sendiri). Mengembalikan [{nama_akhiran, sql}].
export function buatSQLPecah(hasil, opsi, sumberNama, perPecah) {
  const n = hasil.leads.length;
  const total = Math.max(1, Math.ceil(n / perPecah));
  const out = [];
  for (let i = 0; i < total; i++) {
    const subset = hasil.leads.slice(i * perPecah, (i + 1) * perPecah);
    const no = String(i + 1).padStart(3, "0");
    out.push({ no, sql: buatSQL(hasil, opsi, sumberNama, subset, `(pecahan ${i + 1}/${total})`) });
  }
  return out;
}

// ============================================================ runner
export function jalankanImpor(teks, nama, opsi, hariIni) {
  const records = bacaRecord(teks, nama, opsi);
  const hasil = olah(records, opsi, hariIni);
  let ringkasanSheet = null;
  if (opsi.ringkasan) ringkasanSheet = JSON.parse(fs.readFileSync(opsi.ringkasan, "utf8"));
  const lap = hitungLaporan(hasil, records, ringkasanSheet);
  const sql = buatSQL(hasil, opsi, nama);
  return { records, hasil, lap, sql };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let kode = 0;
  try {
    const o = bacaArgumen(process.argv.slice(2));
    const teks = fs.readFileSync(o.input, "utf8");
    const { hasil, lap, sql } = jalankanImpor(teks, o.input, o);
    const dasar = o.input;
    if (o.stdoutSql) process.stdout.write(sql);
    else {
      const lapPath = o.laporan || `${dasar}.laporan.md`;
      const perPath = o.periksa || `${dasar}.periksa.csv`;
      fs.writeFileSync(lapPath, laporanMarkdown(lap, hasil, o.input));
      fs.writeFileSync(perPath, periksaCsv(hasil));
      let sqlPaths;
      if (o.pecah > 0) {
        sqlPaths = buatSQLPecah(hasil, o, o.input, o.pecah).map(({ no, sql: isi }) => {
          const p = `${dasar}.impor.${no}.sql`; fs.writeFileSync(p, isi); return p;
        });
      } else {
        const sqlPath = o.sql || `${dasar}.impor.sql`;
        fs.writeFileSync(sqlPath, sql);
        sqlPaths = [sqlPath];
      }
      // stdout = ANGKA saja (tanpa nama/telepon)
      console.log(JSON.stringify({
        aksi: "impor-pipeline", sql: sqlPaths, laporan: lapPath, periksa: perPath,
        total_baris_sheet: lap.total_baris_sheet, terimpor: lap.terimpor, periksa_jumlah: lap.periksa,
        tidak_terimpor: lap.tidak_terimpor, per_tahap: lap.per_tahap,
        selisih_lulus: lap.selisih ? lap.selisih.lulus : null,
      }, null, 2));
    }
  } catch (e) {
    console.error(`impor-pipeline: GAGAL -> ${e.message}`);
    kode = 1;
  }
  process.exit(kode);
}
