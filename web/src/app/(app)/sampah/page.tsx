import type { Metadata } from "next";

import { PenjagaOwner } from "@/features/auth/penjaga-owner";
import { LayarSampah } from "@/features/sampah/layar-sampah";

export const metadata: Metadata = { title: "Sampah" };

export default function HalamanSampah() {
  return (
    <PenjagaOwner judul="Sampah">
      <LayarSampah />
    </PenjagaOwner>
  );
}
