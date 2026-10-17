import type { Metadata } from "next";

import { LayarDobelPelanggan } from "@/features/pipeline/layar-dobel-pelanggan";

export const metadata: Metadata = { title: "Saran gabung pelanggan" };

export default function HalamanDobelPelanggan() {
  return <LayarDobelPelanggan />;
}
