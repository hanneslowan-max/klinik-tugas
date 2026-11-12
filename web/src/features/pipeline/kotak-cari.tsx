"use client";

// Kotak cari daftar Pipeline (lead & pelanggan) yang menyimpan kata cari di URL (?q) — Kembali dari detail memulihkannya.
import { Search } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Kotak cari dengan isian lokal: ketikan hanya merender komponen ini; kata ter-debounce 300 ms ditulis ke URL (?q)
 * lewat `tulis` (daftar disaring dari URL; Kembali dari detail lead memulihkan pencarian).
 * - Tulisan tertunda tidak boleh jatuh saat navigasi sedang menunggu RSC: replaceState = ACTION_RESTORE di router
 *   Next yang MENGGANTIKAN navigasi itu (ketukan diabaikan). Maka klik selagi timer menunggu (fase capture dokumen,
 *   sebelum onClick <Link>): tautan yang berpindah halaman → timer dibatalkan & ketikan yang belum diterapkan
 *   dibuang; klik lain (tab/saringan, tautan URL-dangkal `data-url-dangkal`, Ctrl/Shift+klik) → ditulis SEKARANG,
 *   serempak sebelum handler-nya. Kembali/Maju (popstate) → dibatalkan.
 * - ?q berubah dari luar (ketuk menu Pipeline = /pipeline tanpa remount, Kembali/Maju) → isian ikut URL. Gema tulisan
 *   sendiri dikenali dari `tertulis`, jadi ketikan lanjutan tidak tertimpa.
 */
export function KotakCari({
  nilaiUrl,
  tulis,
  placeholder = "Cari perusahaan, PIC, produk, No SP/PO, kode lead",
  label = "Cari lead",
  uji = "cari-lead",
}: {
  nilaiUrl: string;
  tulis: (q: string) => void;
  placeholder?: string;
  label?: string;
  uji?: string;
}) {
  const [isi, setIsi] = useState(nilaiUrl);
  const [jejak, setJejak] = useState({ url: nilaiUrl, tertulis: nilaiUrl.trim() });
  if (jejak.url !== nilaiUrl) {
    setJejak({ url: nilaiUrl, tertulis: nilaiUrl.trim() }); // sesuaikan state saat render, bukan di efek
    if (nilaiUrl.trim() !== jejak.tertulis) setIsi(nilaiUrl);
  }
  const input = useRef<HTMLInputElement>(null);
  const tunda = useRef<ReturnType<typeof setTimeout>>(undefined);
  // hanya ketikan PENGGUNA yang boleh ditulis ke URL. Isian yang disamakan dari URL (navigasi, Kembali) tidak pernah
  // ditulis balik — kalau tidak, kata lama bisa "hidup lagi" 300 ms sesudah menu Pipeline diketuk (update setIsi yang
  // sama nilainya ditahan React lalu diputar ulang sesudah render transisi navigasi).
  const diketik = useRef(false);
  const kirim = useEffectEvent(() => {
    if (!diketik.current) return;
    diketik.current = false;
    const q = isi.trim();
    if (q === nilaiUrl.trim()) return;
    setJejak((j) => ({ ...j, tertulis: q }));
    tulis(q);
  });
  const buang = useEffectEvent(() => {
    diketik.current = false;
    if (isi !== nilaiUrl) setIsi(nilaiUrl);
  });
  useEffect(() => {
    const t = setTimeout(() => {
      tunda.current = undefined;
      kirim();
    }, 300);
    tunda.current = t;
    return () => {
      clearTimeout(t);
      if (tunda.current === t) tunda.current = undefined;
    };
  }, [isi]);
  useEffect(() => {
    const henti = () => {
      clearTimeout(tunda.current);
      tunda.current = undefined;
    };
    const saatKlik = (e: MouseEvent) => {
      if (tunda.current === undefined || e.target === input.current) return;
      henti();
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const pindah =
        a instanceof HTMLAnchorElement &&
        !a.hasAttribute("data-url-dangkal") &&
        !a.target &&
        !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);
      if (pindah) buang();
      else kirim();
    };
    const saatKembali = () => {
      if (tunda.current === undefined) return;
      henti();
      buang();
    };
    document.addEventListener("click", saatKlik, true);
    window.addEventListener("popstate", saatKembali);
    return () => {
      document.removeEventListener("click", saatKlik, true);
      window.removeEventListener("popstate", saatKembali);
    };
  }, []);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={input}
        value={isi}
        onChange={(e) => {
          diketik.current = true;
          setIsi(e.target.value);
        }}
        placeholder={placeholder}
        className="pl-9"
        aria-label={label}
        data-uji={uji}
      />
    </div>
  );
}
