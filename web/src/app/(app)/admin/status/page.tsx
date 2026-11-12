import type { Metadata } from "next";

import { TabStatus } from "@/features/admin/status/tab-status";

export const metadata: Metadata = { title: "Admin · Status list" };

export default function HalamanAdminStatus() {
  return <TabStatus />;
}
