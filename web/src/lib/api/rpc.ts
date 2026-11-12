// Pembungkus bertipe untuk fungsi web_* (semua tulis data lewat fungsi SQL SECURITY DEFINER; ARSITEKTUR §0).
// Dipakai di browser (klienBrowser) maupun server (klienServer): klien yang dikirim menentukan sesi & RLS.
import type { SupabaseClient } from "@supabase/supabase-js";

import { GalatApi } from "@/lib/api/galat";
import type { Database } from "@/types/database";
import type { HasilRpc } from "@/types/domain";

type Fungsi = Database["public"]["Functions"];
export type NamaWeb = Extract<keyof Fungsi, keyof HasilRpc>;
export type ArgsWeb<N extends NamaWeb> = Fungsi[N]["Args"];

type Klien = SupabaseClient<Database>;

type GalatPostgrest = { message: string; code?: string; hint?: string | null; details?: string | null };

export function bungkusGalat(error: GalatPostgrest, status?: number | null) {
  return new GalatApi({ message: error.message, code: error.code, hint: error.hint, details: error.details, status });
}

/** Argumen boleh dihilangkan bila fungsi tanpa parameter atau semua parameternya opsional. */
type ArgsOpsional<N extends NamaWeb> = Record<never, never> extends ArgsWeb<N> ? [args?: ArgsWeb<N>] : [args: ArgsWeb<N>];

/** Panggil fungsi web_*. Melempar GalatApi (pesan DB berbahasa Indonesia). */
export async function rpc<N extends NamaWeb>(klien: Klien, nama: N, ...args: ArgsOpsional<N>): Promise<HasilRpc[N]> {
  const { data, error, status } = await klien.rpc(nama, (args[0] ?? {}) as never);
  if (error) throw bungkusGalat(error, status);
  return data as HasilRpc[N];
}
