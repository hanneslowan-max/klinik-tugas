import type { Metadata } from "next";

import { LayarJelajah } from "@/features/jelajah/layar-jelajah";

export const metadata: Metadata = { title: "Jelajah" };

// ?arsip dibaca di klien (useSearchParams) supaya tombol arsip tidak memuat ulang server.
export default function HalamanJelajah() {
  return <LayarJelajah />;
}
