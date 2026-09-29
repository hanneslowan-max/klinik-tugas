#!/usr/bin/env node
// Salin pustaka pihak ketiga dari node_modules ke web/vendor (tanpa CDN saat runtime, CSP script-src 'self').
//   node uji/web/salin-vendor.mjs        → salin + tulis web/vendor/VERSI.json dan web/vendor/muat.js
//   node uji/web/salin-vendor.mjs --cek  → hanya periksa: isi web/vendor sama dengan node_modules & index.html merujuk
//                                          berkas supabase-js versi terpasang (exit 1 bila beda)
// Nama berkas memuat versi supaya bisa di-cache "immutable" (.htaccess). Komentar sourceMappingURL dibuang
// (berkas .map tidak ikut disalin).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NM = join(AKAR, 'node_modules');
const VENDOR = join(AKAR, 'web', 'vendor');
const CEK = process.argv.includes('--cek');

const versi = (pkg) => JSON.parse(readFileSync(join(NM, pkg, 'package.json'), 'utf8')).version;

const PAKET = [
  { pkg: '@supabase/supabase-js', src: 'dist/umd/supabase.js', nama: (v) => `supabase-js-${v}.umd.js`,
    lisensi: 'LICENSE', catatan: 'UMD → window.supabase (dimuat <script> di index.html)' },
  { pkg: 'markdown-it', src: 'dist/browser/markdown-it.esm.min.mjs', nama: (v) => `markdown-it-${v}.esm.min.mjs`,
    lisensi: 'LICENSE', ekspor: 'markdownit', catatan: 'ESM' },
  { pkg: 'dompurify', src: 'dist/purify.es.mjs', nama: (v) => `purify-${v}.es.mjs`,
    lisensi: 'LICENSE', ekspor: 'DOMPurify', catatan: 'ESM' },
  { pkg: 'sortablejs', src: 'modular/sortable.esm.js', nama: (v) => `sortable-${v}.esm.js`,
    lisensi: 'LICENSE', ekspor: 'Sortable', catatan: 'ESM' },
];

const bersihkan = (teks) => teks.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/u, '\n');
const sha = (isi) => createHash('sha256').update(isi).digest('hex');

let gagal = 0;
const hasil = [];
const muat = ['// Dibuat otomatis oleh uji/web/salin-vendor.mjs. Jangan diedit manual.'];

if (!CEK) mkdirSync(join(VENDOR, 'lisensi'), { recursive: true });

for (const p of PAKET) {
  const v = versi(p.pkg);
  const isi = bersihkan(readFileSync(join(NM, p.pkg, p.src), 'utf8'));
  const nama = p.nama(v);
  const tujuan = join(VENDOR, nama);
  const lis = readFileSync(join(NM, p.pkg, p.lisensi), 'utf8');
  const namaLis = `${p.pkg.replace(/[@/]/g, '_').replace(/^_/, '')}-LICENSE.txt`;
  if (CEK) {
    if (!existsSync(tujuan)) { console.error(`GAGAL: ${nama} tidak ada di web/vendor`); gagal++; }
    else if (sha(readFileSync(tujuan, 'utf8')) !== sha(isi)) { console.error(`GAGAL: ${nama} beda dengan node_modules`); gagal++; }
    else console.log(`ok  ${nama}`);
  } else {
    writeFileSync(tujuan, isi);
    writeFileSync(join(VENDOR, 'lisensi', namaLis), lis);
    console.log(`salin ${p.pkg}@${v} → web/vendor/${nama}`);
  }
  if (p.ekspor) muat.push(`export { default as ${p.ekspor} } from './${nama}';`);
  hasil.push({ paket: p.pkg, versi: v, berkas: nama, sha256: sha(isi), catatan: p.catatan });
}

const supa = hasil.find((h) => h.paket === '@supabase/supabase-js');
muat.push(`export const SUPABASE_JS = '/vendor/${supa.berkas}';`);
const teksMuat = muat.join('\n') + '\n';
const teksVersi = JSON.stringify({ catatan: 'Dibuat uji/web/salin-vendor.mjs', paket: hasil }, null, 2) + '\n';

// index.html wajib merujuk berkas supabase-js yang sama
const indexHtml = readFileSync(join(AKAR, 'web', 'index.html'), 'utf8');
if (!indexHtml.includes(`/vendor/${supa.berkas}`)) {
  console.error(`GAGAL: web/index.html belum merujuk /vendor/${supa.berkas} (perbarui tag <script>)`);
  gagal++;
}

if (CEK) {
  const lama = existsSync(join(VENDOR, 'muat.js')) ? readFileSync(join(VENDOR, 'muat.js'), 'utf8') : '';
  if (lama !== teksMuat) { console.error('GAGAL: web/vendor/muat.js tidak sesuai versi terpasang'); gagal++; }
  const sisa = readdirSync(VENDOR).filter((f) => /\.(m?js)$/.test(f) && f !== 'muat.js'
    && !hasil.some((h) => h.berkas === f));
  if (sisa.length) { console.error(`GAGAL: berkas vendor lama tersisa: ${sisa.join(', ')}`); gagal++; }
} else {
  // buang versi lama supaya tidak ikut ter-deploy
  for (const f of readdirSync(VENDOR)) {
    if (/\.(m?js)$/.test(f) && f !== 'muat.js' && !hasil.some((h) => h.berkas === f)) {
      unlinkSync(join(VENDOR, f));
      console.log(`hapus versi lama web/vendor/${f}`);
    }
  }
  writeFileSync(join(VENDOR, 'muat.js'), teksMuat);
  writeFileSync(join(VENDOR, 'VERSI.json'), teksVersi);
}

if (gagal) { console.error(`${gagal} masalah`); process.exit(1); }
console.log(CEK ? 'vendor cocok' : 'selesai');
