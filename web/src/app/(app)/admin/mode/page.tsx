import type { Metadata } from "next";

import { TabMode } from "@/features/admin/mode/tab-mode";

export const metadata: Metadata = { title: "Admin · Mode" };

export default function HalamanAdminMode() {
  return <TabMode />;
}
