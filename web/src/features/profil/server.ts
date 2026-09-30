import "server-only";

import { cache } from "react";

import { rpc } from "@/lib/api/rpc";
import { klienServer } from "@/lib/supabase/server";

/** Profil pengguna yang login (web_saya), sekali per permintaan render. */
export const ambilProfil = cache(async () => {
  const klien = await klienServer();
  return rpc(klien, "web_saya");
});

/** Hari libur (tanggal WIB) untuk hitungan hari kerja di layar. Gagal → kosong (bukan galat fatal). */
export const ambilLibur = cache(async (): Promise<string[]> => {
  const klien = await klienServer();
  const { data, error } = await klien.from("hari_libur").select("tanggal");
  if (error) return [];
  return (data ?? []).map((r) => r.tanggal);
});
