import type { Metadata } from "next";

import { TabAnggota } from "@/features/admin/anggota/tab-anggota";

export const metadata: Metadata = { title: "Admin · Anggota" };

export default function HalamanAdminAnggota() {
  return <TabAnggota />;
}
