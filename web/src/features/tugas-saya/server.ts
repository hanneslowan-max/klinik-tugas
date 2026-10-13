import "server-only";

import { rpc } from "@/lib/api/rpc";
import type { DataAwal } from "@/lib/data-awal";
import { klienServer } from "@/lib/supabase/server";
import type { TugasSaya } from "@/types/domain";

/**
 * Tugas Saya milik pengguna sendiri (web_tugas_saya tanpa p_member) untuk HTML muat penuh /saya. Semua galat
 * (sesi habis, akun nonaktif, jaringan) → undefined: layar lalu memuat sendiri di browser seperti biasa.
 */
export async function ambilTugasSayaAwal(): Promise<DataAwal<TugasSaya> | undefined> {
  try {
    const data = await rpc(await klienServer(), "web_tugas_saya", {});
    return { data, pada: Date.now() };
  } catch {
    return undefined;
  }
}
