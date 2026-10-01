// Konfigurasi publik (dibaca browser & server). Nilai NEXT_PUBLIC_* di-inline saat build, jadi wajib ada di
// lingkungan build (lokal: .env.local; produksi: pengaturan environment Node.js app di Hostinger).
// Tidak ada secret di sini: URL project + publishable key memang publik (ARSITEKTUR §0).

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const env = {
  supabaseUrl,
  supabaseKey,
  /** Edge Function `api` (admin akun/reset/purge). */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? `${supabaseUrl}/functions/v1/api`).replace(/\/$/, ""),
  /** Dasar tautan kartu yang disalin (sama dengan app_settings.app_base_url). */
  appBaseUrl: (process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").replace(/\/$/, ""),
};

/** false bila konfigurasi belum diisi → layar menampilkan pesan, bukan halaman kosong. */
export const konfigLengkap = Boolean(env.supabaseUrl && env.supabaseKey);
