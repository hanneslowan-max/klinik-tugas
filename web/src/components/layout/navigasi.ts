import { Bell, CheckSquare, FolderTree, Search, Settings, Trash2, type LucideIcon } from "lucide-react";

export type ItemNav = { href: string; label: string; Ikon: LucideIcon; ownerSaja?: boolean; cocok: (path: string) => boolean };

/** Navigasi utama (urutan sama di sidebar desktop & nav bawah HP). */
export const NAV_UTAMA: ItemNav[] = [
  { href: "/saya", label: "Tugas Saya", Ikon: CheckSquare, cocok: (p) => p === "/" || p.startsWith("/saya") },
  { href: "/jelajah", label: "Jelajah", Ikon: FolderTree, cocok: (p) => p.startsWith("/jelajah") || p.startsWith("/l/") },
  { href: "/cari", label: "Cari", Ikon: Search, cocok: (p) => p.startsWith("/cari") },
];

export const NAV_LAIN: ItemNav[] = [
  { href: "/notif", label: "Notifikasi", Ikon: Bell, cocok: (p) => p.startsWith("/notif") },
  { href: "/admin", label: "Admin", Ikon: Settings, ownerSaja: true, cocok: (p) => p.startsWith("/admin") },
  { href: "/sampah", label: "Sampah", Ikon: Trash2, ownerSaja: true, cocok: (p) => p.startsWith("/sampah") },
];
