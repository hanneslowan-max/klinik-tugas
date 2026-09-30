// Galat API seragam untuk fungsi web_*, Storage, dan Edge admin. Pesan fungsi SQL sudah berbahasa Indonesia
// (RAISE ... ERRCODE 'PT4xx', HINT = ECODE; ARSITEKTUR §5), jadi diteruskan apa adanya.

export type DataGalat = {
  message?: string;
  code?: string | null;
  hint?: string | null;
  status?: number | null;
  details?: string | null;
};

export class GalatApi extends Error {
  readonly code: string | null;
  /** ECODE: CERMIN_001, KONFLIK_001, EDGE_TIDAK_ADA, … */
  readonly hint: string | null;
  readonly status: number | null;
  readonly details: string | null;

  constructor({ message, code, hint, status, details }: DataGalat) {
    super(message || "Terjadi kesalahan");
    this.name = "GalatApi";
    this.code = code ?? null;
    this.hint = hint ?? null;
    this.status = status ?? null;
    this.details = details ?? null;
  }

  get konflik() {
    return this.hint === "KONFLIK_001";
  }
  get cermin() {
    return this.hint === "CERMIN_001";
  }
  get tidakAda() {
    return this.code === "PT404";
  }
  get sesiHabis() {
    return this.code === "PT401" || this.hint === "OAUTH_019" || this.code === "PGRST301" || this.status === 401;
  }
}

const POLA_JARINGAN = /Failed to fetch|NetworkError|Load failed|fetch failed|network/i;

/** Pesan Bahasa Indonesia yang layak ditampilkan ke pengguna. */
export function pesanGalat(e: unknown): string {
  if (!e) return "Terjadi kesalahan";
  if (e instanceof GalatApi) {
    if (e.code && /^PT\d{3}$/.test(e.code)) return e.message; // pesan DB sudah Bahasa Indonesia
    if (e.code === "42501") return "Tidak punya izin untuk tindakan ini.";
    if (e.sesiHabis) return "Sesi habis. Silakan masuk lagi.";
    if (e.status === 0 || POLA_JARINGAN.test(e.message)) return "Tidak bisa terhubung ke server. Periksa koneksi.";
    return e.message;
  }
  const pesan = e instanceof Error ? e.message : String(e);
  if (POLA_JARINGAN.test(pesan)) return "Tidak bisa terhubung ke server. Periksa koneksi.";
  return pesan || "Terjadi kesalahan";
}
