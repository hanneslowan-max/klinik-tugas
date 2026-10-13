// import() yang tahan "version skew" sesudah deploy: chunk lama (nama berisi hash) hilang dari server begitu versi baru
// terpasang, sehingga halaman yang masih terbuka gagal memuat bagian yang dimuat malas (next/dynamic, pramuat).
// Bila import() gagal, halaman dimuat ulang SEKALI (penanda di sessionStorage) supaya mendapat HTML + chunk versi
// baru; bila sesudah muat ulang masih gagal (penanda sudah ada) atau sessionStorage tak tersedia, galat dilempar
// apa adanya (tidak pernah loop).

const PENANDA = "anvil:muat-ulang-chunk";

/** Jalankan `muat` (berisi import()); gagal → muat ulang sekali. */
export function imporAman<T>(muat: () => Promise<T>): Promise<T> {
  return muat().then(
    (m) => {
      try {
        sessionStorage.removeItem(PENANDA);
      } catch {
        // tanpa sessionStorage: tidak apa-apa
      }
      return m;
    },
    (galat: unknown) => {
      if (typeof window === "undefined") throw galat;
      let sudahPernah = true;
      try {
        sudahPernah = sessionStorage.getItem(PENANDA) === "1";
        if (!sudahPernah) sessionStorage.setItem(PENANDA, "1");
      } catch {
        sudahPernah = true; // tanpa penanda tidak bisa menjamin "sekali" → jangan muat ulang
      }
      if (sudahPernah) throw galat;
      window.location.reload();
      return new Promise<T>(() => {}); // menunggu muat ulang
    },
  );
}

/** Pramuat chunk (abaikan galat: pemuatan sebenarnya lewat imporAman yang menangani kegagalan). */
export function pramuat(muat: () => Promise<unknown>) {
  void muat().catch(() => {});
}

/** Jalankan saat browser senggang (requestIdleCallback; cadangan setTimeout). Mengembalikan pembatal. */
export function saatSenggang(f: () => void, cadanganMs = 1500): () => void {
  if (typeof window === "undefined") return () => {};
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(f, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(f, cadanganMs);
  return () => clearTimeout(id);
}
