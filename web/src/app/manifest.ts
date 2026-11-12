import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anvil",
    short_name: "Anvil",
    description: "Anvil, aplikasi tugas internal PT Roda Hammerindo Jaya",
    lang: "id",
    dir: "ltr",
    start_url: "/saya",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    // warna bar sistem aplikasi terpasang (bar navigasi/taskbar Android) — hitam atas permintaan Hannes 6 Nov 2026
    theme_color: "#000000",
    icons: [
      { src: "/ikon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ikon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ikon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
