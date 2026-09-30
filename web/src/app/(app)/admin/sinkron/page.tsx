import type { Metadata } from "next";

import { TabSinkron } from "@/features/admin/sinkron/tab-sinkron";

export const metadata: Metadata = { title: "Admin · Sinkron" };

export default function HalamanAdminSinkron() {
  return <TabSinkron />;
}
