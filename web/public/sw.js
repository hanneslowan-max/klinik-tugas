// Service worker Tugas RHJ: HANYA cache aset statis (JS/CSS Next.js yang ber-hash dan ikon), cache-first.
// Halaman & data selalu dari jaringan (butuh login; data tidak pernah disimpan di cache).
const CACHE = "rhj-tugas-aset-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function asetStatis(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || /^\/(ikon[\w-]*\.png|icon\.svg|apple-icon\.png)$/.test(url.pathname))
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!asetStatis(url)) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const ada = await c.match(req);
      if (ada) return ada;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }),
  );
});
