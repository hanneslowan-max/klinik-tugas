// Data awal dari server untuk muat DOKUMEN penuh (buka app/PWA, F5, tautan luar): page.tsx membaca web_* di server
// HANYA bila permintaannya dokumen (Sec-Fetch-Dest: document), lalu meneruskannya sebagai prop ke layar klien →
// initialData TanStack. Hasilnya isi layar sudah ada di HTML, bukan menunggu JS + hidrasi + koneksi baru ke Supabase.
// Navigasi klien (RSC), router.refresh, dan prefetch tidak membawa data ini (perilaku lama: dimuat di browser).
//
// Berkas ini netral (bukan 'use client' / 'server-only') supaya tipenya bisa dipakai kedua sisi.

/** Hasil web_* + jam server saat dibaca (ms epoch). */
export type DataAwal<T> = { data: T; pada: number };

/** true bila permintaan ini memuat dokumen penuh (bukan navigasi RSC/prefetch). */
export function permintaanDokumen(h: Headers): boolean {
  return h.get("sec-fetch-dest") === "document";
}

/**
 * Opsi useQuery dari data awal. Bentuk FUNGSI (dievaluasi sekali saat entri cache dibuat, aman untuk aturan lint
 * kemurnian render). Umur data = min(jam server, jam klien): jam HP yang tertinggal tidak membuat data tampak
 * "dari masa depan" (tetap dianggap segar paling lama staleTime sejak dibaca server).
 */
export function opsiDataAwal<T>(awal: DataAwal<T> | undefined, pakai = true) {
  return {
    initialData: () => (awal && pakai ? awal.data : undefined),
    initialDataUpdatedAt: () => (awal && pakai ? Math.min(awal.pada, Date.now()) : undefined),
  };
}
