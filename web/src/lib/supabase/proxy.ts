import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Segarkan sesi Supabase (cookie) untuk satu permintaan. `terusan` = header permintaan yang diteruskan ke render
 * (mis. nonce CSP). Mengembalikan respons yang membawa cookie baru + apakah ada pengguna yang sah.
 */
export async function segarkanSesi(request: NextRequest, terusan: Headers) {
  let respons = NextResponse.next({ request: { headers: terusan } });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (daftar) => {
        for (const { name, value } of daftar) request.cookies.set(name, value);
        respons = NextResponse.next({ request: { headers: terusan } });
        for (const { name, value, options } of daftar) respons.cookies.set(name, value, options);
      },
    },
  });

  // getClaims memverifikasi JWT (tanda tangan / ke Auth). Jangan menaruh kode lain di antara createServerClient
  // dan panggilan ini: sesi bisa keluar secara acak (panduan @supabase/ssr).
  const { data } = await supabase.auth.getClaims();
  return { respons, adaPengguna: Boolean(data?.claims?.sub) };
}

/** Salin cookie sesi dari respons penyegaran ke respons lain (mis. redirect) supaya sesi tidak hilang. */
export function bawaCookie(dari: NextResponse, ke: NextResponse) {
  for (const c of dari.cookies.getAll()) ke.cookies.set(c);
  return ke;
}
