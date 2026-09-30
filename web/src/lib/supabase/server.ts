import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/** Klien Supabase untuk Server Component / Route Handler, memakai cookie sesi pengguna (RLS tetap berlaku). */
export async function klienServer() {
  const toples = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => toples.getAll(),
      setAll: (daftar) => {
        try {
          for (const { name, value, options } of daftar) toples.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component (cookie hanya-baca): penyegaran sesi sudah ditangani proxy.
        }
      },
    },
  });
}
