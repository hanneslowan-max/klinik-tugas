import type { Metadata } from "next";

import { TabStruktur } from "@/features/admin/struktur/tab-struktur";

export const metadata: Metadata = { title: "Admin · Struktur" };

export default function HalamanAdminStruktur() {
  return <TabStruktur />;
}
