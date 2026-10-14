"use client";

// Sidebar desktop bisa disembunyikan (permintaan Hannes 14 Okt 2026): tombol di kepala sidebar, tombol di header halaman
// saat tersembunyi, atau Ctrl/⌘ + \. Pilihan disimpan di cookie 1 tahun → layout server merender keadaan yang sama sejak
// HTML pertama (tanpa kedip). HP tidak terpengaruh (navigasi bawah + Menu).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { KUKI_SIDEBAR } from "@/components/layout/sidebar-kuki";

type NilaiSidebar = { terbuka: boolean; alih: () => void };

// bawaan: di luar kerangka app (mis. layar masuk) sidebar dianggap terbuka → tombol "tampilkan" tidak muncul
const Konteks = createContext<NilaiSidebar>({ terbuka: true, alih: () => {} });

export const PINTASAN_SIDEBAR = "Ctrl/⌘ + \\";

/** Pindahkan fokus ke tombol pasangan sesudah render (tombol yang diklik ikut tersembunyi / jadi inert). */
export function fokusSesudahRender(dataUji: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-uji="${dataUji}"]`)?.focus());
}

export function PenyediaSidebar({ awal, children }: { awal: boolean; children: ReactNode }) {
  const [terbuka, setTerbuka] = useState(awal);
  const alih = useCallback(() => setTerbuka((t) => !t), []);

  useEffect(() => {
    document.cookie = `${KUKI_SIDEBAR}=${terbuka ? "buka" : "tutup"}; path=/; max-age=31536000; samesite=lax`;
  }, [terbuka]);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === "\\") {
        e.preventDefault();
        alih();
      }
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [alih]);

  return <Konteks.Provider value={{ terbuka, alih }}>{children}</Konteks.Provider>;
}

export const useSidebar = () => useContext(Konteks);
