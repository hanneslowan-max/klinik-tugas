// Ganti URL TANPA round-trip ke server ("shallow routing", docs Next single-page-applications.md). Dipakai untuk
// tab/filter yang hanya mengubah ?query di halaman yang sama: datanya dari TanStack Query, jadi navigasi Next
// (permintaan RSC + render server) tidak membawa apa pun selain jeda. history.replaceState/pushState terintegrasi
// dengan router Next: useSearchParams/usePathname ikut berubah dan Kembali/Maju tetap dipulihkan router.
//
// Untuk <Link>: pasang `onNavigate={(e) => { e.preventDefault(); gantiUrl(href) }}` + `prefetch={false}`.
// onNavigate tidak dipanggil untuk Ctrl/Cmd/Shift/klik tengah, jadi "buka di tab baru" tetap jalan.
// AWAS: panggil serempak dari handler klik/ketik, bukan dari timer/async. replaceState/pushState = ACTION_RESTORE yang
// menggantikan navigasi Next yang sedang menunggu RSC (tautan yang baru diketuk diabaikan) — lihat KotakCari Pipeline
// dan kirim() di LayarCari (sesudah await: hanya bila tidak ada tautan yang diketuk selama menunggu).

/** replaceState (baku) atau pushState (`dorong`: buat entri riwayat baru, mis. Daftar ↔ Papan di list). */
export function gantiUrl(url: string, { dorong = false }: { dorong?: boolean } = {}) {
  if (dorong) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}
