// JavaScript biasa (bukan next.config.ts): server build Hostinger memakai glibc 2.28, jadi Next.js berjalan dengan SWC
// WASM dan gagal mentranspilasi next.config.ts di sana. .mjs dimuat langsung tanpa transpilasi. Karena itu juga build
// memakai webpack (`next build --webpack`): Turbopack butuh SWC native (glibc >= 2.29).
import { fileURLToPath } from "node:url";

// Akar proyek = folder web/ ini. Tanpa ini Next.js memilih akar repo (ada package-lock.json di sana) dan server
// standalone pindah ke .next/standalone/web/server.js.
const akarProyek = fileURLToPath(new URL(".", import.meta.url));

// Header keamanan statis (CSP dengan nonce dipasang per permintaan di src/proxy.ts).
const headerKeamanan = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Hostinger Node.js Web Apps menjalankan build standalone
  output: "standalone",
  outputFileTracingRoot: akarProyek,
  turbopack: { root: akarProyek },
  poweredByHeader: false,
  // server dev diakses lewat 127.0.0.1 (tes Playwright)
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      { source: "/:path*", headers: headerKeamanan },
      // service worker: jangan di-cache browser supaya versi baru langsung terpasang
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
