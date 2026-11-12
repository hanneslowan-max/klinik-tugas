// Password sementara untuk aktifkan login / setel ulang password (Edge /x/admin/akun|reset). Dibuat di browser owner
// dengan crypto.getRandomValues; abjad tanpa karakter yang mirip (0/O, 1/l/I) supaya mudah diketik ulang.

export const ABJAD_SANDI = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const PANJANG_SANDI = 12;
/** Batas minimal password sementara (sama dengan Edge). */
export const MIN_SANDI = 8;

type Acak = (isi: Uint32Array) => Uint32Array;
const acakBawaan: Acak = (isi) => crypto.getRandomValues(isi);

/** Password acak tanpa bias modulo (nilai di atas kelipatan panjang abjad dibuang). */
export function sandiSementara(panjang = PANJANG_SANDI, acak: Acak = acakBawaan): string {
  const n = ABJAD_SANDI.length;
  const batas = Math.floor(0x1_0000_0000 / n) * n;
  let hasil = "";
  while (hasil.length < panjang) {
    for (const x of acak(new Uint32Array(panjang))) {
      if (x >= batas) continue;
      hasil += ABJAD_SANDI[x % n];
      if (hasil.length === panjang) break;
    }
  }
  return hasil;
}
