"use client";

// Loader next/dynamic yang TIDAK menolak karena galat sementara. next/dynamic (Next 16, lazy-dynamic/loadable) membuat
// SATU React.lazy per komponen di tingkat modul, dan React.lazy menyimpan hasil loader SELAMANYA: loader yang menolak
// sekali (mis. sinyal putus saat chunk pertama kali diunduh) membuat setiap pemakaian berikutnya melempar galat yang
// sama ke error.tsx — seluruh layar diganti, "Coba lagi" gagal lagi, sampai halaman dimuat ulang manual.
// Maka galat dari imporAman (offline, unduhan gagal 2×, chunk masih hilang tepat sesudah muat ulang) diubah menjadi
// komponen PEMULIH: pesan kecil di tempat bagian itu ("Gagal memuat papan…" + Coba lagi). Pemulih mengimpor ulang
// (tombol, event `online`, atau dipasang lagi sesudah pindah layar); begitu berhasil komponen asli dirender di
// tempatnya dan langsung dipakai oleh semua pemasangan berikutnya — tanpa muat ulang halaman, isian lain di layar utuh.
// Chunk hilang (404, version skew) tetap memuat ulang halaman sekali (imporAman).
// Pemakaian: dynamic(() => muatKomponen(() => import("…"), (m) => m.X, "papan"), {...}) — import() harus tetap tertulis
// di dalam argumen dynamic() supaya transform Next mendaftarkan chunk-nya (pramuat chunk pada SSR).
import { RotateCw } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { imporAman } from "@/lib/impor-aman";

export function muatKomponen<M, P extends object>(
  muat: () => Promise<M>,
  pilih: (m: M) => ComponentType<P>,
  bagian: string,
): Promise<ComponentType<P>> {
  return imporAman(muat).then(pilih, (galat: unknown) => {
    if (typeof window === "undefined") throw galat; // SSR: modul lokal, galat sungguhan
    console.warn(`Gagal memuat ${bagian}:`, galat);
    return buatPemulih(muat, pilih, bagian);
  });
}

/** Komponen pengganti sementara untuk satu loader yang gagal (hasil React.lazy next/dynamic yang tersimpan). */
export function buatPemulih<M, P extends object>(muat: () => Promise<M>, pilih: (m: M) => ComponentType<P>, bagian: string): ComponentType<P> {
  let siap: ComponentType<P> | null = null;
  let janji: Promise<ComponentType<P>> | null = null;
  let pemasangan = 0;
  /** Satu impor ulang bersama untuk semua pemulih yang sedang terpasang; gagal → boleh dicoba lagi. */
  const coba = () =>
    (janji ??= imporAman(muat).then(
      (m) => (siap = pilih(m)),
      (galat: unknown) => {
        janji = null;
        throw galat;
      },
    ));

  function Pemulih(props: P) {
    const [Komponen, setKomponen] = useState<ComponentType<P> | null>(() => siap);
    const [sibuk, setSibuk] = useState(false);

    useEffect(() => {
      if (Komponen) return;
      // dipasang lagi (pindah layar lalu kembali) atau koneksi pulih → coba diam-diam (pemasangan pertama = tepat
      // sesudah gagal, tidak perlu dicoba lagi)
      const diam = () => void coba().then((K) => setKomponen(() => K), () => {});
      if (pemasangan++ > 0) diam();
      window.addEventListener("online", diam);
      return () => window.removeEventListener("online", diam);
    }, [Komponen]);

    if (Komponen) return <Komponen {...props} />;

    function cobaLagi() {
      setSibuk(true);
      coba().then(
        (K) => setKomponen(() => K),
        () => setSibuk(false),
      );
    }
    return (
      <div className="space-y-3 py-2" data-uji="gagal-muat-bagian">
        <KotakPesan nada="galat">Gagal memuat {bagian}. Periksa koneksi internet, lalu coba lagi.</KotakPesan>
        <Button type="button" variant="outline" size="sm" onClick={cobaLagi} disabled={sibuk}>
          <RotateCw aria-hidden className={sibuk ? "animate-spin" : undefined} />
          {sibuk ? "Memuat…" : "Coba lagi"}
        </Button>
      </div>
    );
  }
  return Pemulih;
}
