"use client";

// Edge admin (ARSITEKTUR §8): POST {apiUrl}/x/admin/<akun|reset|purge|berita-tarik|wa-pengetahuan>, header x-sesi = JWT owner.
// Galat Edge berbentuk {err, ECODE}. Edge belum terpasang / tidak jalan (jaringan, 404 atau 502–504 tanpa ECODE)
// → GalatApi dengan hint EDGE_TIDAK_ADA.
import { GalatApi } from "@/lib/api/galat";
import { env } from "@/lib/env";
import { klienBrowser } from "@/lib/supabase/client";

export async function edgeAdmin<T = unknown>(jalur: "akun" | "reset" | "purge" | "berita-tarik" | "wa-pengetahuan", body: unknown): Promise<T> {
  const { data } = await klienBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new GalatApi({ message: "Sesi habis. Silakan masuk lagi.", code: "PT401", status: 401 });

  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/x/admin/${jalur}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: env.supabaseKey, "x-sesi": token },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GalatApi({ message: "Layanan admin (Edge Function) tidak bisa dihubungi.", hint: "EDGE_TIDAK_ADA", status: 0 });
  }

  let isi: { err?: string; message?: string; ECODE?: string } | null = null;
  try {
    isi = await res.json();
  } catch {
    // bukan JSON
  }
  if (!res.ok) {
    if ((res.status === 404 || (res.status >= 502 && res.status <= 504)) && !isi?.ECODE) {
      throw new GalatApi({ message: "Layanan admin (Edge Function) belum terpasang.", hint: "EDGE_TIDAK_ADA", status: res.status });
    }
    throw new GalatApi({
      message: isi?.err || isi?.message || `Gagal (HTTP ${res.status})`,
      hint: isi?.ECODE,
      code: `PT${res.status}`,
      status: res.status,
    });
  }
  return isi as T;
}
