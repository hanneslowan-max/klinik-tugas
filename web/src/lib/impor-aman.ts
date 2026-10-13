// import() yang tahan "version skew" sesudah deploy: chunk lama (nama berisi hash) hilang dari server begitu versi baru
// terpasang, sehingga halaman yang masih terbuka gagal memuat bagian yang dimuat malas (next/dynamic, pramuat).
// Bila import() gagal, halaman dimuat ulang SEKALI supaya mendapat HTML + chunk versi baru — HANYA bila chunk memang
// hilang (server menjawab 404). Galat jaringan (offline, sinyal putus sesaat) tidak memuat ulang: isian yang belum
// disimpan tidak boleh hilang; chunk masih ada → dicoba sekali lagi, selebihnya galat dilempar apa adanya.
// Penanda waktu muat ulang (sessionStorage) mencegah loop: gagal lagi dalam JEDA_MUAT_ULANG sesudah muat ulang (atau
// sessionStorage tak tersedia) → galat dilempar. Penanda kedaluwarsa sendiri, jadi deploy berikutnya di tab yang sama
// tetap dimuat ulang.

const PENANDA = "anvil:muat-ulang-chunk";
const JEDA_MUAT_ULANG = 2 * 60_000;

function hapusPenanda() {
  try {
    sessionStorage.removeItem(PENANDA);
  } catch {
    // tanpa sessionStorage: tidak apa-apa
  }
}

/** true = boleh memuat ulang sekarang (penanda dipasang); false = baru saja dimuat ulang / tanpa sessionStorage. */
function pasangPenanda(): boolean {
  try {
    const lalu = Number(sessionStorage.getItem(PENANDA));
    if (lalu && Date.now() - lalu < JEDA_MUAT_ULANG) return false;
    sessionStorage.setItem(PENANDA, String(Date.now()));
    return true;
  } catch {
    return false; // tanpa penanda tidak bisa menjamin "sekali" → jangan muat ulang
  }
}

/**
 * Sebab import() gagal: "hilang" = chunk dijawab 404 oleh server (version skew); "ada" = chunk masih tersedia (gagal
 * sesaat); "putus" = offline / jaringan / server tak menjawab normal. ChunkLoadError webpack membawa URL chunk di
 * `request`; galat tanpa URL (bundler lain) dianggap "hilang" bila online (perilaku lama).
 */
async function sebabGagal(galat: unknown): Promise<"hilang" | "ada" | "putus"> {
  if (navigator.onLine === false) return "putus";
  const url = typeof galat === "object" && galat !== null && "request" in galat && typeof galat.request === "string" ? galat.request : null;
  if (!url) return "hilang";
  try {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    return r.status === 404 ? "hilang" : r.ok ? "ada" : "putus";
  } catch {
    return "putus";
  }
}

/** Jalankan `muat` (berisi import()); chunk hilang (404) → muat ulang sekali; gagal sesaat → coba sekali lagi. */
export function imporAman<T>(muat: () => Promise<T>): Promise<T> {
  const berhasil = (m: T) => {
    hapusPenanda();
    return m;
  };
  return muat().then(berhasil, async (galat: unknown) => {
    if (typeof window === "undefined") throw galat;
    const sebab = await sebabGagal(galat);
    if (sebab === "ada") return muat().then(berhasil); // webpack melupakan chunk yang gagal → diunduh ulang
    if (sebab === "putus" || !pasangPenanda()) throw galat;
    window.location.reload();
    return new Promise<T>(() => {}); // menunggu muat ulang
  });
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
