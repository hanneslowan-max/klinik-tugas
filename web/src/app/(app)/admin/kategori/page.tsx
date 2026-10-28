import type { Metadata } from "next";

import { TabKategori } from "@/features/admin/kategori/tab-kategori";

export const metadata: Metadata = { title: "Admin · Kategori" };

export default function HalamanAdminKategori() {
  return <TabKategori />;
}
