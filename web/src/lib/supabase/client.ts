"use client";

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

let klien: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Klien Supabase di browser (satu instans). Sesi disimpan di cookie supaya server & proxy ikut membacanya. */
export function klienBrowser() {
  if (!klien) {
    klien = createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey, {
      global: { headers: { "x-client-info": "rhj-tugas-web" } },
    });
  }
  return klien;
}

export type KlienSupabase = ReturnType<typeof klienBrowser>;
