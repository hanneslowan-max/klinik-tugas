import type { Metadata } from "next";

import { LayarPelanggan } from "@/features/pipeline/layar-pelanggan";

export const metadata: Metadata = { title: "Pelanggan" };

export default function HalamanPelanggan() {
  return <LayarPelanggan />;
}
