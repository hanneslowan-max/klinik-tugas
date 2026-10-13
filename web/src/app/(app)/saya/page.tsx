import type { Metadata } from "next";

import { LayarSaya } from "@/features/tugas-saya/layar-saya";

export const metadata: Metadata = { title: "Tugas Saya" };

// ?m (anggota) & ?v (tampilan) dibaca di klien (useSearchParams) supaya ganti tab/anggota tidak memuat ulang server.
export default function HalamanSaya() {
  return <LayarSaya />;
}
