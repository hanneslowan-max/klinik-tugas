// Contoh config.js bila ingin satu nilai tetap (mis. staging). Isi hanya kunci PUBLIK.
// Service role / secret key TIDAK BOLEH di sini. Samakan GANTI_REF di .htaccess (CSP connect-src/img-src).
window.RHJ_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://GANTI_REF.supabase.co',
  SUPABASE_ANON_KEY: 'GANTI_DENGAN_PUBLISHABLE_KEY',
  APP_BASE_URL: 'https://tugas.palletmeshindonesia.com',
  API_URL: '',               // kosong = SUPABASE_URL + '/functions/v1/api'
  LINGKUNGAN: 'produksi'
});
