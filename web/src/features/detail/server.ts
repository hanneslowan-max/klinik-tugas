import "server-only";

import { rpc } from "@/lib/api/rpc";
import type { DataAwal } from "@/lib/data-awal";
import { klienServer } from "@/lib/supabase/server";
import type { DetailTugas } from "@/types/domain";

/**
 * Detail tugas (web_detail) untuk HTML muat penuh /t/<id>. web_detail memeriksa tugas_terlihat (RLS + fungsi);
 * semua galat (tidak ada, tidak boleh, sesi habis) → undefined: layar memuat sendiri di browser seperti biasa
 * (termasuk pesan "tidak ditemukan").
 */
export async function ambilDetailAwal(id: string): Promise<DataAwal<DetailTugas> | undefined> {
  try {
    const data = await rpc(await klienServer(), "web_detail", { p_task: id });
    return { data, pada: Date.now() };
  } catch {
    return undefined;
  }
}
