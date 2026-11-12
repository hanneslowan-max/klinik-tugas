// Penahan penyegaran real-time: selama sebuah layar sedang dipakai (mengedit deskripsi, menyeret kartu), perubahan
// dari orang lain DITUNDA, lalu dijalankan begitu layar dilepas. Ini menjaga cek versi tetap bekerja: tanpa penahan,
// data (dan `versi`) kartu yang sedang diedit akan diperbarui diam-diam sehingga konflik tidak terdeteksi.

const tertahan = new Set<string>();
const tertunda = new Map<string, () => void>();

/** Nama penahan: "daftar" (List/Papan) atau `detail:<id tugas>`. */
export type NamaTahanan = "daftar" | `detail:${string}`;

export function sedangDitahan(nama: NamaTahanan): boolean {
  return tertahan.has(nama);
}

/**
 * Jalankan `aksi` sekarang, atau tunda bila `nama` sedang ditahan (aksi tertunda terakhir menang).
 * Mengembalikan true bila ditunda.
 */
export function jalankanAtauTunda(nama: NamaTahanan, aksi: () => void): boolean {
  if (tertahan.has(nama)) {
    tertunda.set(nama, aksi);
    return true;
  }
  aksi();
  return false;
}

/** Tahan / lepas. Saat dilepas, aksi yang tertunda langsung dijalankan. */
export function aturTahanan(nama: NamaTahanan, aktif: boolean) {
  if (aktif) {
    tertahan.add(nama);
    return;
  }
  tertahan.delete(nama);
  const aksi = tertunda.get(nama);
  if (aksi) {
    tertunda.delete(nama);
    aksi();
  }
}

/** Untuk tes. */
export function kosongkanTahanan() {
  tertahan.clear();
  tertunda.clear();
}
