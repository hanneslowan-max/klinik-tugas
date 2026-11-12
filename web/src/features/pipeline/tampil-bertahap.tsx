"use client";

// Render bertahap daftar besar (lead ±2.000, pelanggan ±1.900): 50 baris dulu, tambah 50 saat sentinel mendekati layar
// (tombol tetap ada sebagai cadangan). Batas per kunci daftar bertahan saat Kembali dari detail.
import { useEffect, useEffectEvent, useRef, useState } from "react";

export const LANGKAH = 50;

/**
 * Batas baris yang dirender per kunci daftar (tab|pemilik|cari|saringan). Tingkat modul supaya bertahan saat halaman
 * di-unmount (buka detail lead → Kembali): jumlah baris sama → posisi gulir bisa dipulihkan. Ganti kunci = mulai 50 lagi.
 */
const batasTersimpan = new Map<string, number>();

export function useBatasTampil(kunci: string) {
  const [keadaan, setKeadaan] = useState(() => ({ kunci, batas: batasTersimpan.get(kunci) ?? LANGKAH }));
  let batas = keadaan.batas;
  if (keadaan.kunci !== kunci) {
    batas = LANGKAH;
    setKeadaan({ kunci, batas }); // sesuaikan state saat kunci berubah (saat render, bukan di efek)
  }
  useEffect(() => {
    if (batasTersimpan.size > 50) batasTersimpan.clear(); // varian cari tak terbatas: jangan menumpuk
    batasTersimpan.set(kunci, batas);
  }, [kunci, batas]);
  const tambah = () => setKeadaan((k) => ({ kunci: k.kunci, batas: k.batas + LANGKAH }));
  return { batas, tambah };
}

/**
 * Tombol "Tampilkan 50 lagi" yang juga menjadi sentinel gulir: saat mendekati layar (±600px) baris berikutnya
 * ditambahkan otomatis; tombol tetap ada sebagai cadangan (keyboard, pembaca layar, IntersectionObserver tak ada).
 */
export function TampilLagi({ sisa, tambah }: { sisa: number; tambah: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const saatTerlihat = useEffectEvent(() => tambah());
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) saatTerlihat();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sisa]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={tambah}
      className="w-full rounded-lg border border-dashed py-2.5 text-sm font-medium text-primary hover:bg-muted"
      data-uji="tampil-lagi"
    >
      Tampilkan {Math.min(LANGKAH, sisa)} lagi (sisa {sisa})
    </button>
  );
}
