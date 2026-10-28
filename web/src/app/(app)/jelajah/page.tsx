import type { Metadata } from "next";

import { LayarJelajah } from "@/features/jelajah/layar-jelajah";

export const metadata: Metadata = { title: "Jelajah" };

// Jelajah per kategori pekerjaan (28 Okt 2026): data dimuat di klien (web_kategori_kerja).
export default function HalamanJelajah() {
  return <LayarJelajah />;
}
