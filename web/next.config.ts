import type { NextConfig } from "next";

// Header keamanan statis (CSP dengan nonce dipasang per permintaan di src/proxy.ts).
const headerKeamanan = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Hostinger Node.js Web Apps menjalankan build standalone
  output: "standalone",
  poweredByHeader: false,
  // server dev diakses lewat 127.0.0.1 (tes Playwright)
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: headerKeamanan }];
  },
};

export default nextConfig;
