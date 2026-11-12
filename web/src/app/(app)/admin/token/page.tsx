import type { Metadata } from "next";

import { TabToken } from "@/features/admin/token/tab-token";

export const metadata: Metadata = { title: "Admin · Token API" };

export default function HalamanAdminToken() {
  return <TabToken />;
}
