import type { Metadata, Viewport } from "next";

import { Penyedia } from "@/components/penyedia";
import { env } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Anvil", template: "%s · Anvil" },
  description: "Aplikasi tugas internal PT Roda Hammerindo Jaya",
  applicationName: "Anvil",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "Anvil", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

/** Origin Supabase (untuk preconnect), atau null bila konfigurasi kosong/tidak sah. */
function asalSupabase(): string | null {
  try {
    return env.supabaseUrl ? new URL(env.supabaseUrl).origin : null;
  } catch {
    return null;
  }
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = asalSupabase();
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-background font-sans text-foreground">
        {/* Buka koneksi (DNS+TCP+TLS) ke Supabase sejak HTML diparse, bukan sesudah hidrasi. React menaikkannya ke
            <head>. crossOrigin="anonymous" WAJIB: fetch supabase-js berjalan tanpa kredensial (mode CORS), jadi soket
            preconnect tanpa atribut ini tidak terpakai. Bila kelak fetch Supabase memakai credentials:"include",
            atribut ini harus ikut diubah. */}
        {supabase ? <link rel="preconnect" href={supabase} crossOrigin="anonymous" /> : null}
        <Penyedia>{children}</Penyedia>
      </body>
    </html>
  );
}
