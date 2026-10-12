import type { Metadata } from "next";

import { TabAksesPipeline } from "@/features/admin/pipeline/tab-akses";

export const metadata: Metadata = { title: "Admin · Akses Pipeline" };

export default function HalamanAdminAksesPipeline() {
  return <TabAksesPipeline />;
}
