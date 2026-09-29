// Klien Supabase + pembungkus RPC web_* + panggilan Edge admin. Semua tulis data lewat fungsi web_* (ARSITEKTUR §0).

const CFG = window.RHJ_CONFIG || {};
/** false bila config.js belum diisi (nilai GANTI_… / kosong) → app.js menampilkan pesan, bukan layar kosong. */
export const KONFIG_OK = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/GANTI/.test(`${CFG.SUPABASE_URL}${CFG.SUPABASE_ANON_KEY}`)
  && window.supabase);
export const KONFIG = CFG;
export const API_URL = (CFG.API_URL || `${(CFG.SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/api`).replace(/\/$/, '');

export const klien = KONFIG_OK ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'rhj-tugas-sesi' },
  global: { headers: { 'x-client-info': 'rhj-tugas-web' } },
}) : null;

export class GalatApi extends Error {
  constructor({ message, code, hint, status, details }) {
    super(message || 'Terjadi kesalahan');
    this.code = code || null;          // mis. PT409 / 42501
    this.hint = hint || null;          // ECODE: CERMIN_001, KONFLIK_001, …
    this.status = status || null;
    this.details = details || null;
  }
  get konflik() { return this.hint === 'KONFLIK_001'; }
  get cermin() { return this.hint === 'CERMIN_001'; }
  get sesiHabis() { return this.code === 'PT401' || this.hint === 'OAUTH_019' || this.code === 'PGRST301' || this.status === 401; }
}

/** Pesan Bahasa Indonesia yang layak ditampilkan. */
export function pesanGalat(e) {
  if (!e) return 'Terjadi kesalahan';
  if (e instanceof GalatApi) {
    if (e.code && /^PT\d{3}$/.test(e.code)) return e.message;       // pesan DB sudah Bahasa Indonesia
    if (e.code === '42501') return 'Tidak punya izin untuk tindakan ini.';
    if (e.sesiHabis) return 'Sesi habis. Silakan masuk lagi.';
    if (e.status === 0 || /fetch|network/i.test(e.message)) return 'Tidak bisa terhubung ke server. Periksa koneksi.';
    return e.message;
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) return 'Tidak bisa terhubung ke server. Periksa koneksi.';
  return e.message || String(e);
}

function bungkus(error, status) {
  return new GalatApi({ message: error.message, code: error.code, hint: error.hint, details: error.details, status });
}

/** Panggil fungsi web_* (POST). Melempar GalatApi. */
export async function rpc(nama, args = {}) {
  const { data, error, status } = await klien.rpc(nama, args);
  if (error) throw bungkus(error, status);
  return data;
}

/** SELECT langsung (RLS). builder = (q) => q.select(...)... */
export async function pilih(tabel, builder) {
  const { data, error, status } = await builder(klien.from(tabel));
  if (error) throw bungkus(error, status);
  return data;
}

export async function tokenAkses() {
  const { data } = await klien.auth.getSession();
  return data.session ? data.session.access_token : null;
}

/**
 * Edge admin (ARSITEKTUR §8): POST {API_URL}/x/admin/<akun|reset|purge>, header x-sesi = JWT owner.
 * Galat Edge berbentuk {err, ECODE}. Edge belum dipasang / tidak jalan (jaringan, 404 atau 502–504 tanpa ECODE)
 * → GalatApi dengan hint EDGE_TIDAK_ADA.
 */
export async function edgeAdmin(jalur, body) {
  const token = await tokenAkses();
  if (!token) throw new GalatApi({ message: 'Sesi habis. Silakan masuk lagi.', code: 'PT401', status: 401 });
  let res;
  try {
    res = await fetch(`${API_URL}/x/admin/${jalur}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, 'x-sesi': token },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GalatApi({ message: 'Layanan admin (Edge Function) tidak bisa dihubungi.', hint: 'EDGE_TIDAK_ADA', status: 0 });
  }
  let isi = null;
  try { isi = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) {
    if ((res.status === 404 || (res.status >= 502 && res.status <= 504)) && !(isi && isi.ECODE)) {
      throw new GalatApi({ message: 'Layanan admin (Edge Function) belum terpasang.', hint: 'EDGE_TIDAK_ADA', status: res.status });
    }
    throw new GalatApi({ message: (isi && (isi.err || isi.message)) || `Gagal (HTTP ${res.status})`,
      hint: isi && isi.ECODE, code: `PT${res.status}`, status: res.status });
  }
  return isi;
}

// ------------------------------------------------------------------ Storage lampiran
export const BUCKET = 'lampiran';
export const MIME_IZIN = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/csv': ['csv'], 'text/plain': ['txt'],
};
export const BATAS_BERKAS = 25 * 1024 * 1024;
export const ACCEPT = Object.values(MIME_IZIN).flat().map((e) => `.${e}`).join(',');

export function mimeBerkas(file) {
  const ext = (file.name.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
  if (file.type && MIME_IZIN[file.type]) return file.type;
  for (const [m, exts] of Object.entries(MIME_IZIN)) if (ext && exts.includes(ext)) return m;
  return null;
}

function namaAman(nama) {
  const bersih = nama.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '');
  return (bersih || 'berkas').slice(-80);
}

/** Unggah ke t/<task>/<uuid>-<nama> lalu catat lewat web_lampiran_catat. */
export async function unggahLampiran(taskId, file, commentId = null) {
  const mime = mimeBerkas(file);
  if (!mime) throw new GalatApi({ message: `Tipe berkas tidak diizinkan: ${file.name}. Boleh: gambar, PDF, DOCX, XLSX, CSV, TXT.` });
  if (file.size > BATAS_BERKAS) throw new GalatApi({ message: `Berkas ${file.name} melebihi 25 MB.` });
  const path = `t/${taskId}/${crypto.randomUUID()}-${namaAman(file.name)}`;
  const { error } = await klien.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false, cacheControl: '3600' });
  if (error) {
    const pesan = /row-level security|Unauthorized|403/i.test(error.message)
      ? 'Tidak boleh mengunggah ke tugas ini (mode cermin / tugas terhapus / bukan anggota).'
      : `Gagal mengunggah: ${error.message}`;
    throw new GalatApi({ message: pesan, status: error.statusCode ? Number(error.statusCode) : null });
  }
  return rpc('web_lampiran_catat', { p_task: taskId, p_comment: commentId, p_path: path, p_title: file.name,
    p_mime: mime, p_size: file.size });
}

/** Signed URL (Storage) — unduh=true memaksa Content-Disposition attachment dengan nama asli. */
export async function urlLampiran(path, judul, unduh = true, detik = 3600) {
  const { data, error } = await klien.storage.from(BUCKET).createSignedUrl(path, detik, unduh ? { download: judul || true } : undefined);
  if (error) throw new GalatApi({ message: `Gagal membuat tautan unduh: ${error.message}` });
  return data.signedUrl;
}
