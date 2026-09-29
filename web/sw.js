// Service worker: cache ASET STATIS saja (HTML/CSS/JS/vendor/ikon), bukan data. Permintaan ke Supabase
// (lintas-origin) tidak disentuh sama sekali, jadi data tugas/komentar/lampiran tidak pernah disimpan di HP.
// Strategi: network-first (selalu versi terbaru saat online), cadangan cache saat offline.
const VERSI = 'rhj-tugas-aset-v3';
const ASET = [
  '/', '/index.html', '/config.js', '/css/app.css', '/manifest.webmanifest', '/ikon.svg', '/ikon-192.png',
  '/js/app.js', '/js/api.js', '/js/sesi.js', '/js/util.js', '/js/md.js', '/js/komponen.js', '/js/penyusun.js',
  '/js/layar/masuk.js', '/js/layar/ganti-password.js', '/js/layar/saya.js', '/js/layar/jelajah.js',
  '/js/layar/list.js', '/js/layar/detail.js', '/js/layar/cari.js', '/js/layar/notif.js', '/js/layar/admin.js',
  '/js/layar/sampah.js', '/vendor/muat.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(ASET)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function asetStatis(url) {
  return url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/config.js'
    || url.pathname === '/manifest.webmanifest' || /\.(svg|png)$/.test(url.pathname)
    || /^\/(css|js|vendor)\//.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // Supabase & lainnya: tidak di-cache
  if (req.mode === 'navigate') {
    // rute SPA (/t/…, /l/…): selalu index.html dari jaringan; offline → index.html tersimpan
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  if (!asetStatis(url)) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const salinan = res.clone();
      caches.open(VERSI).then((c) => c.put(req, salinan));
    }
    return res;
  }).catch(() => caches.match(req)));
});
