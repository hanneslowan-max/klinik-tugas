// Preload `node --import` untuk uji banding: membekukan jam proses di BEKU_WAKTU (ISO) supaya `agenda`
// (Date.now() untuk `sejak`/`tanggal_wib`/kategori) identik di clickup.mjs dan tugas.mjs. File CLI TIDAK diubah.
// Hanya `Date.now()` dan `new Date()` tanpa argumen yang dibekukan; setTimeout/AbortSignal tetap jam nyata.
const beku = process.env.BEKU_WAKTU;
if (beku) {
  const T = Date.parse(beku);
  if (Number.isNaN(T)) throw new Error(`BEKU_WAKTU tidak sah: ${beku}`);
  const Asli = Date;
  class DateBeku extends Asli {
    constructor(...a) {
      if (a.length === 0) super(T);
      else super(...a);
    }
    static now() {
      return T;
    }
  }
  globalThis.Date = DateBeku;
}
