// Konfigurasi PUBLIK aplikasi (bukan rahasia): URL project + publishable/anon key Supabase.
// JANGAN pernah menaruh service_role key / secret key di sini.
// - Dibuka dari 127.0.0.1/localhost → stack Supabase lokal (supabase start; anon key demo bawaan CLI).
// - Domain lain (produksi) → isi PRODUKSI setelah project rhj-tugas dibuat, dan ganti GANTI_REF di .htaccess.
(function () {
  var LOKAL = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    APP_BASE_URL: location.origin,
    API_URL: '',                 // kosong = SUPABASE_URL + '/functions/v1/api'
    LINGKUNGAN: 'lokal'
  };
  var PRODUKSI = {
    SUPABASE_URL: 'https://GANTI_REF.supabase.co',
    SUPABASE_ANON_KEY: 'GANTI_DENGAN_PUBLISHABLE_KEY',
    APP_BASE_URL: 'https://tugas.palletmeshindonesia.com',
    API_URL: '',
    LINGKUNGAN: 'produksi'
  };
  var lokal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  window.RHJ_CONFIG = Object.freeze(lokal ? LOKAL : PRODUKSI);
})();
