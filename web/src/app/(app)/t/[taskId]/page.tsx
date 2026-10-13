import type { Metadata } from "next";
import { headers } from "next/headers";

import { ambilDetailAwal } from "@/features/detail/server";
import { LayarDetail } from "@/features/detail/layar-detail";
import { permintaanDokumen } from "@/lib/data-awal";

export const metadata: Metadata = { title: "Tugas" };

function idAman(mentah: string) {
  try {
    return decodeURIComponent(mentah);
  } catch {
    return mentah;
  }
}

// Muat DOKUMEN penuh (tautan WA/email, F5): web_detail dibaca di server (sejajar dengan layout) dan ikut di HTML
// (lib/data-awal.ts). Navigasi RSC/prefetch/refresh tetap memuat di browser seperti biasa.
export default async function HalamanDetail({ params, searchParams }: PageProps<"/t/[taskId]">) {
  const { taskId } = await params;
  const q = await searchParams;
  const id = idAman(taskId);
  const awal = permintaanDokumen(await headers()) ? await ambilDetailAwal(id) : undefined;
  // key: pindah antar-tugas (mis. ke sub-tugas) selalu mulai dengan keadaan layar yang bersih
  return <LayarDetail key={id} id={id} tabAwal={q.tab === "riwayat" ? "riwayat" : "komentar"} awal={awal} />;
}
