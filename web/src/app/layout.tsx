import type { Metadata, Viewport } from "next";

import { Penyedia } from "@/components/penyedia";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-background font-sans text-foreground">
        <Penyedia>{children}</Penyedia>
      </body>
    </html>
  );
}
