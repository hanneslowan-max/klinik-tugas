"use client";

// Pelacak kedalaman riwayat di dalam aplikasi: tombol Kembali memakai history.back() (filter & posisi gulir tetap)
// bila halaman sebelumnya bagian dari aplikasi; bila dibuka langsung dari tautan, pindah ke halaman induk.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

let kedalaman = 0;

export function adaRiwayatDalam() {
  return kedalaman > 0;
}

export function usePelacakRiwayat() {
  const pathname = usePathname();
  const pertama = useRef(true);
  const mundur = useRef(false);

  useEffect(() => {
    const f = () => {
      mundur.current = true;
    };
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    if (mundur.current) {
      kedalaman = Math.max(0, kedalaman - 1);
      mundur.current = false;
    } else {
      kedalaman++;
    }
  }, [pathname]);
}
