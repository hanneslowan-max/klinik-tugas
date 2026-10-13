import type { Metadata } from "next";
import { headers } from "next/headers";

import { ambilTugasSayaAwal } from "@/features/tugas-saya/server";
import { LayarSaya } from "@/features/tugas-saya/layar-saya";
import { permintaanDokumen } from "@/lib/data-awal";

export const metadata: Metadata = { title: "Tugas Saya" };

// ?m (anggota) & ?v (tampilan) dibaca di klien (useSearchParams) supaya ganti tab/anggota tidak memuat ulang server.
// Muat DOKUMEN penuh tanpa ?m: Tugas Saya dibaca di server (sejajar dengan layout) dan ikut di HTML (lib/data-awal.ts).
// Navigasi RSC/prefetch/refresh tidak membawa Sec-Fetch-Dest: document → tidak ada panggilan server tambahan.
export default async function HalamanSaya({ searchParams }: PageProps<"/saya">) {
  const dokumen = permintaanDokumen(await headers());
  const sp = await searchParams;
  const awal = dokumen && typeof sp.m !== "string" ? await ambilTugasSayaAwal() : undefined;
  return <LayarSaya awal={awal} />;
}
