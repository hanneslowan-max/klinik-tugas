import type { Metadata } from "next";

import { PenjagaOwner } from "@/features/auth/penjaga-owner";
import { LayarBerita } from "@/features/berita/layar-berita";

export const metadata: Metadata = { title: "Berita" };

/** Berita (khusus owner). Penjaga hanya tampilan; hak sebenarnya dicek web_berita* (is_owner) dan Edge /x/admin/*. */
export default function HalamanBerita() {
  return (
    <PenjagaOwner judul="Berita">
      <LayarBerita />
    </PenjagaOwner>
  );
}
