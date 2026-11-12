import type { Metadata } from "next";

import { TabLibur } from "@/features/admin/libur/tab-libur";

export const metadata: Metadata = { title: "Admin · Hari libur" };

export default function HalamanAdminLibur() {
  return <TabLibur />;
}
