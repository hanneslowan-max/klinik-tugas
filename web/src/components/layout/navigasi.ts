import { Bell, CheckSquare, LayoutGrid, Newspaper, Search, Settings, Target, Trash2, type LucideIcon } from "lucide-react";

export type ItemNav = {
  href: string;
  label: string;
  Ikon: LucideIcon;
  ownerSaja?: boolean;
  /** hanya untuk pengguna berakses modul Pipeline (peran != null, §6) — gerbang dibaca dari web_pipeline_saya */
  pipelineSaja?: boolean;
  cocok: (path: string) => boolean;
};

/** Navigasi utama (urutan sama di sidebar desktop & nav bawah HP). */
export const NAV_UTAMA: ItemNav[] = [
  { href: "/saya", label: "Tugas Saya", Ikon: CheckSquare, cocok: (p) => p === "/" || p.startsWith("/saya") },
  { href: "/jelajah", label: "Jelajah", Ikon: LayoutGrid, cocok: (p) => p.startsWith("/jelajah") || p.startsWith("/l/") },
  { href: "/cari", label: "Cari", Ikon: Search, cocok: (p) => p.startsWith("/cari") },
  { href: "/pipeline", label: "Pipeline", Ikon: Target, pipelineSaja: true, cocok: (p) => p.startsWith("/pipeline") },
  // Berita (7 Nov 2026): pantauan berita kurasi Claude, khusus owner (hak sebenarnya dicek web_berita* di DB)
  { href: "/berita", label: "Berita", Ikon: Newspaper, ownerSaja: true, cocok: (p) => p.startsWith("/berita") },
];

export const NAV_LAIN: ItemNav[] = [
  { href: "/notif", label: "Notifikasi", Ikon: Bell, cocok: (p) => p.startsWith("/notif") },
  { href: "/admin", label: "Admin", Ikon: Settings, ownerSaja: true, cocok: (p) => p.startsWith("/admin") },
  { href: "/sampah", label: "Sampah", Ikon: Trash2, ownerSaja: true, cocok: (p) => p.startsWith("/sampah") },
];
