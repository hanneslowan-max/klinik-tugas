"use client";

// Sidebar desktop bisa disembunyikan (permintaan Hannes 14 Okt 2026): tombol di kepala sidebar, tombol di header halaman
// saat tersembunyi, atau Ctrl/⌘ + \. Pilihan disimpan di cookie 1 tahun → layout server merender keadaan yang sama sejak
// HTML pertama (tanpa kedip). HP tidak terpengaruh (navigasi bawah + Menu).
//
// Di klien COOKIE yang jadi sumber kebenaran (useSyncExternalStore), bukan state yang diisi `awal` sekali: Kembali / tautan
// < 30 dtk dari /ganti-password memasang ulang penyedia ini dengan payload layout dari cache router (`awal` basi). `awal`
// hanya dipakai saat hidrasi (= cookie yang dibaca server). Cookie hanya DITULIS saat pengguna mengalihkan.
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { KUKI_SIDEBAR, sidebarTerbukaDariKuki } from "@/components/layout/sidebar-kuki";

type NilaiSidebar = { terbuka: boolean; alih: () => void };

// bawaan: di luar kerangka app (mis. layar masuk) sidebar dianggap terbuka → tombol "tampilkan" tidak muncul
const Konteks = createContext<NilaiSidebar>({ terbuka: true, alih: () => {} });

export const PINTASAN_SIDEBAR = "Ctrl/⌘ + \\";
const LAYAR_DESKTOP = "(min-width: 64rem)"; // = lg: sidebar & tombolnya baru tampil mulai lebar ini

const pendengar = new Set<() => void>();

function langgan(ubah: () => void) {
  pendengar.add(ubah);
  return () => {
    pendengar.delete(ubah);
  };
}

function terbukaMenurutKuki() {
  const awalan = `${KUKI_SIDEBAR}=`;
  return sidebarTerbukaDariKuki(document.cookie.split("; ").find((b) => b.startsWith(awalan))?.slice(awalan.length));
}

function alih() {
  document.cookie = `${KUKI_SIDEBAR}=${terbukaMenurutKuki() ? "tutup" : "buka"}; path=/; max-age=31536000; samesite=lax`;
  pendengar.forEach((ubah) => ubah());
}

/** Pindahkan fokus ke tombol pasangan sesudah render (tombol yang diklik ikut tersembunyi / jadi inert). */
export function fokusSesudahRender(dataUji: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-uji="${dataUji}"]`)?.focus());
}

export function PenyediaSidebar({ awal, children }: { awal: boolean; children: ReactNode }) {
  const terbuka = useSyncExternalStore(langgan, terbukaMenurutKuki, () => awal);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key !== "\\") return;
      // di bawah lg sidebar memang tidak tampil: jangan diam-diam mengubah pilihan desktop
      if (!window.matchMedia(LAYAR_DESKTOP).matches) return;
      e.preventDefault();
      // fokus di dalam sidebar (akan inert) / di tombol "tampilkan" (akan dilepas) jangan jatuh ke <body>
      const aktif = document.activeElement;
      const pindahFokus = aktif?.closest('[data-uji="sidebar"]') || aktif?.matches('[data-uji="tampilkan-sidebar"]');
      const tadinyaTerbuka = terbukaMenurutKuki();
      alih();
      if (pindahFokus) fokusSesudahRender(tadinyaTerbuka ? "tampilkan-sidebar" : "sembunyikan-sidebar");
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, []);

  return <Konteks.Provider value={{ terbuka, alih }}>{children}</Konteks.Provider>;
}

export const useSidebar = () => useContext(Konteks);
