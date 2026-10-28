import type { Metadata } from "next";

import { LayarKategori } from "@/features/jelajah/layar-kategori";

export const metadata: Metadata = { title: "Jelajah" };

/** id kategori dari segmen URL (dijaga bila masih ter-encode); "tanpa" = tugas tanpa kategori. */
function idAman(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Saring orang (?m) & tampilkan selesai (?selesai=1) dibaca di klien (useSearchParams) supaya tidak memuat ulang server.
export default async function HalamanKategori({ params }: PageProps<"/jelajah/[kategori]">) {
  const { kategori } = await params;
  return <LayarKategori id={idAman(kategori)} />;
}
