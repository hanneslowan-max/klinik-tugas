// Pembantu tes Playwright web/. Data uji SINTETIS berawalan "uji-b3" (space/list/tugas/anggota milik tes web).
// Kunci lokal dibaca dari `supabase status -o env` saat tes (tidak ditulis ke repo). Service role HANYA dipakai
// oleh tes (Edge tiruan + pembersihan), tidak pernah oleh web-lama/.
import { test as dasar, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const DIR = dirname(fileURLToPath(import.meta.url));
const AKAR = resolve(DIR, '..', '..');
export const HASIL = join(DIR, 'hasil');
mkdirSync(HASIL, { recursive: true });

export const SANDI = 'rahasia-dev-123';                 // seed.sql — dev lokal saja
export const AKUN = {
  owner: { email: 'budi.uji@contoh.test', id: 100000001, username: 'budi santoso' },
  citra: { email: 'citra.uji@contoh.test', id: 100000002, username: 'citra lestari' },
  dodi: { email: 'dodi.uji@contoh.test', id: 100000003, username: 'dodi pratama' },
  eka: { email: 'eka.uji@contoh.test', id: 900000000001, username: 'eka wulandari' },
};
export const RUN = `${Date.now().toString(36)}`;        // pembeda antar-run
export const AWALAN = 'uji-b3';

let _env = null;
export function envLokal() {
  if (_env) return _env;
  const cli = process.env.SUPABASE_CLI || '/tmp/sbcli/node_modules/.bin/supabase';
  const teks = execFileSync(cli, ['status', '-o', 'env'], { cwd: AKAR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const e = {};
  for (const baris of teks.split('\n')) {
    const m = baris.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) e[m[1]] = m[2];
  }
  if (!e.API_URL || !e.ANON_KEY || !e.SERVICE_ROLE_KEY) throw new Error('supabase status tidak memberi API_URL/ANON_KEY/SERVICE_ROLE_KEY');
  _env = { url: e.API_URL, anon: e.ANON_KEY, service: e.SERVICE_ROLE_KEY };
  return _env;
}

const klienCache = new Map();
/** supabase-js sebagai user (login password). */
export async function klienSebagai(email, sandi = SANDI) {
  const k = `${email}|${sandi}`;
  if (klienCache.has(k)) return klienCache.get(k);
  const { url, anon } = envLokal();
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: sandi });
  if (error) throw new Error(`login ${email} gagal: ${error.message}`);
  klienCache.set(k, c);
  return c;
}

export async function rpcSebagai(email, fn, args = {}) {
  const c = await klienSebagai(email);
  const { data, error } = await c.rpc(fn, args);
  if (error) { const e = new Error(`${fn}: ${error.message}`); e.code = error.code; e.hint = error.hint; throw e; }
  return data;
}

/** Panggilan REST dengan service role (khusus tes: Edge tiruan & pembersihan). */
export async function layanan(path, { method = 'GET', body, headers = {} } = {}) {
  const { url, service } = envLokal();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const teks = await res.text();
  let isi = null;
  try { isi = teks ? JSON.parse(teks) : null; } catch { isi = teks; }
  return { status: res.status, isi };
}

// ------------------------------------------------------------------ data uji milik tes web
const NAMA_SPACE = `${AWALAN} Ruang Playwright`;
const NAMA_LIST = `${AWALAN} Papan`;
const NAMA_LIST2 = `${AWALAN} Papan 2`;

/** Space + 2 list app milik tes web (dibuat sekali, dipakai ulang). Hasil {spaceId, listId, listId2}. */
export async function siapkanPapan() {
  const s = await rpcSebagai(AKUN.owner.email, 'web_struktur');
  let sp = s.spaces.find((x) => x.name === NAMA_SPACE);
  if (!sp) sp = await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'space', name: NAMA_SPACE } });
  if (sp.archived) await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'space', id: sp.id, archived: false } });
  const ids = [];
  for (const nama of [NAMA_LIST, NAMA_LIST2]) {
    let l = (sp.lists || []).find((x) => x.name === nama);
    if (!l) l = await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'list', name: nama, space_id: sp.id } });
    if (l.archived || l.tidak_ditagih) {
      await rpcSebagai(AKUN.owner.email, 'web_admin_struktur_simpan', { p: { jenis: 'list', id: l.id, archived: false, tidak_ditagih: false } });
    }
    ids.push(l.id);
  }
  return { spaceId: sp.id, listId: ids[0], listId2: ids[1] };
}

const dibuat = [];
/** Buat tugas uji (owner) → baris web. Nama otomatis berawalan "uji-b3 <run>". */
export async function buatTugas(listId, body, email = AKUN.owner.email) {
  const baris = await rpcSebagai(email, 'web_buat_tugas', { p_list: listId, p_body: { ...body, name: `${AWALAN} ${RUN} ${body.name}` } });
  dibuat.push(baris.id);
  return baris;
}
export function catatTugas(id) { dibuat.push(id); }

/** Hapus lunak + purge semua tugas uji run ini; hapus objek Storage-nya (service role). */
export async function bersihkanTugas() {
  const paths = [];
  for (const id of dibuat.splice(0)) {
    try { await rpcSebagai(AKUN.owner.email, 'web_hapus', { p_task: id }); } catch { /* mungkin sudah di Sampah */ }
    try {
      const r = await rpcSebagai(AKUN.owner.email, 'web_purge', { p_task: id });
      paths.push(...(r.storage_paths || []));
    } catch { /* sudah dipurge / sub-tugas */ }
  }
  if (paths.length) await layanan('/storage/v1/object/lampiran', { method: 'DELETE', body: { prefixes: paths } });
}

/** SQL baca-saja ke DB lokal (psql superuser lokal; khusus tes). Mengembalikan teks hasil (-At). */
export function sqlLokal(sql) {
  const db = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  return execFileSync('psql', [db, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
}
/** SQL UBAH ke DB lokal (khusus tes: menyiapkan keadaan yang tidak bisa dibuat lewat web, mis. tasks.extra hasil impor,
 *  atau memulihkan read_at notifikasi seed). Hanya data sintetis/uji; jangan dipakai untuk memeriksa hasil. */
export function sqlUbahLokal(sql) {
  return sqlLokal(`begin; select set_config('app.sumber', 'sistem', true); ${sql}; commit;`);
}
/** Nama objek Storage bucket lampiran di bawah t/<task>/ (termasuk yang yatim). */
export function objekLampiran(taskId) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId)) throw new Error(`id tugas tidak wajar: ${taskId}`);
  const t = sqlLokal(`select name from storage.objects where bucket_id = 'lampiran' and name like 't/${taskId}/%' order by name`);
  return t ? t.split('\n') : [];
}

/** Tanggal WIB (YYYY-MM-DD) + n hari. */
export function tanggalWib(n = 0) {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + n * 86400000);
  return d.toISOString().slice(0, 10);
}
/** Hari kerja berikutnya (Senin–Jumat) ≥ n hari dari sekarang. */
export function hariKerjaKe(n) {
  for (let i = n; ; i++) {
    const t = tanggalWib(i);
    const w = new Date(`${t}T00:00:00Z`).getUTCDay();
    if (w !== 0 && w !== 6) return t;
  }
}
export function sabtuBerikut() {
  for (let i = 1; ; i++) {
    const t = tanggalWib(i);
    if (new Date(`${t}T00:00:00Z`).getUTCDay() === 6) return t;
  }
}

// ------------------------------------------------------------------ UI
export async function masuk(page, email, sandi = SANDI, lanjut = '/saya') {
  await page.goto(`/masuk?lanjut=${encodeURIComponent(lanjut)}`);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(sandi);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
}

export async function keluar(page) {
  await page.locator('#tombol-menu').click();
  await page.locator('[data-uji=keluar]').click();
  await expect(page).toHaveURL(/\/masuk/);
}

export async function foto(page, nama) {
  await page.screenshot({ path: join(HASIL, `${nama}.png`), fullPage: false });
}

/**
 * Edge tiruan untuk /api/x/admin/akun & /reset (ARSITEKTUR §8) selama Edge B1 belum ada: memverifikasi JWT owner
 * dari header x-sesi, lalu GoTrue admin API + RPC x_admin_akun dengan service role lokal. Set RHJ_EDGE_ASLI=1
 * untuk memakai Edge sungguhan (supabase functions serve).
 */
export async function pasangEdgeTiruan(page) {
  if (process.env.RHJ_EDGE_ASLI === '1') return;
  const { url, anon } = envLokal();
  await page.route('**/functions/v1/api/x/admin/**', async (route) => {
    const req = route.request();
    const balas = (status, json) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const jwt = req.headers()['x-sesi'];
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } });
    if (!u.ok) return balas(401, { err: 'Sesi tidak sah', ECODE: 'OAUTH_019' });
    const user = await u.json();
    const pem = await layanan(`/rest/v1/members?auth_user_id=eq.${user.id}&select=id,role,aktif`);
    const owner = pem.isi && pem.isi[0];
    if (!owner || owner.role !== 'owner' || !owner.aktif) return balas(403, { err: 'Hanya owner', ECODE: 'ACCESS_001' });
    const body = JSON.parse(req.postData() || '{}');
    const jalur = new URL(req.url()).pathname.split('/').pop();
    if (jalur === 'purge') {
      // meniru adminPurge Edge B1: web_purge SEBAGAI user (JWT sesi), lalu objek Storage dihapus dengan service role
      const r = await fetch(`${url}/rest/v1/rpc/web_purge`, { method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ p_task: body.task_id }) });
      const isi = await r.json().catch(() => null);
      if (!r.ok) return balas(Number(String(isi && isi.code).replace(/^PT/, '')) || 500, { err: isi && isi.message, ECODE: isi && isi.hint });
      const paths = isi.storage_paths || [];
      let dihapus = [];
      if (paths.length) {
        const s = await layanan('/storage/v1/object/lampiran', { method: 'DELETE', body: { prefixes: paths } });
        if (s.status < 300 && Array.isArray(s.isi)) dihapus = s.isi.map((o) => o.name);
      }
      return balas(200, { ...isi, storage_dihapus: dihapus, storage_sisa: paths.filter((p) => !dihapus.includes(p)), storage_gagal: false });
    }
    const m = (await layanan(`/rest/v1/members?id=eq.${body.member_id}&select=id,email,auth_user_id,role`)).isi[0];
    if (!m) return balas(404, { err: 'Anggota tidak ditemukan', ECODE: 'ITEM_013' });
    let authId = m.auth_user_id;
    let email = body.email || m.email;
    if (jalur === 'akun') {
      const r = await layanan('/auth/v1/admin/users', { method: 'POST', body: { email, password: body.password_sementara, email_confirm: true } });
      if (r.status >= 300) return balas(r.status === 422 ? 409 : 400, { err: `Gagal membuat akun: ${r.isi && (r.isi.msg || r.isi.message)}`, ECODE: 'KONFLIK_001' });
      authId = r.isi.id;
    } else if (jalur === 'reset') {
      if (!authId) return balas(400, { err: 'Anggota belum punya akun', ECODE: 'INPUT_001' });
      const r = await layanan(`/auth/v1/admin/users/${authId}`, { method: 'PUT', body: { password: body.password_sementara } });
      if (r.status >= 300) return balas(400, { err: 'Gagal reset password', ECODE: 'INPUT_001' });
    } else {
      return balas(404, { err: 'Rute tidak dikenal', ECODE: 'ITEM_013' });
    }
    const x = await layanan('/rest/v1/rpc/x_admin_akun', { method: 'POST',
      body: { p_aktor: owner.id, p_member: m.id, p_auth_user: authId, p_email: email, p_harus_ganti: true } });
    if (x.status >= 300) return balas(x.status, { err: x.isi && x.isi.message, ECODE: x.isi && x.isi.hint });
    return balas(200, x.isi);
  });
}

/** test + pemantau: galat halaman & pelanggaran CSP membuat tes gagal. */
export const test = dasar.extend({
  pantau: [async ({ page }, use) => {
    const masalah = [];
    page.on('pageerror', (e) => masalah.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(t)) masalah.push(`CSP: ${t}`);
    });
    await use(masalah);
    expect(masalah, 'galat JS / pelanggaran CSP di halaman').toEqual([]);
  }, { auto: true }],
});
export { expect };
