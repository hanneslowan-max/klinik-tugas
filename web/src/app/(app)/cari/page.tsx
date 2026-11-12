import type { Metadata } from "next";

import { LayarCari } from "@/features/cari/layar-cari";

export const metadata: Metadata = { title: "Cari" };

// ?q & ?space dibaca di klien (useSearchParams) supaya submit Cari tidak memuat ulang server.
export default function HalamanCari() {
  return <LayarCari />;
}
