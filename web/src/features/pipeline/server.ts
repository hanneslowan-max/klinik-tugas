import "server-only";

import { cache } from "react";

import { rpc } from "@/lib/api/rpc";
import { klienServer } from "@/lib/supabase/server";

/**
 * Akses Pipeline pengguna (web_pipeline_saya), dibaca layout (app) BERSAMAAN dengan profil & hari libur supaya menu
 * Pipeline sudah ada di HTML (tidak bergeser) dan GerbangPipeline langsung lolos. Semua galat (sesi habis, PT403, …)
 * ditelan → undefined: klien lalu memuatnya sendiri seperti biasa; tidak pernah memunculkan "Gagal memuat"/redirect.
 */
export const ambilPipelineSaya = cache(async () => {
  try {
    return await rpc(await klienServer(), "web_pipeline_saya");
  } catch {
    return undefined;
  }
});
