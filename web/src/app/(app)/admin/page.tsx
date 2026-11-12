import { redirect } from "next/navigation";

import { TAB_ADMIN_BAKU, tabAdminSah } from "@/features/admin/tab";

/** /admin → /admin/<tab>; tautan lama /admin?tab=<tab> (web lama) tetap berlaku. */
export default async function HalamanAdmin({ searchParams }: PageProps<"/admin">) {
  const { tab } = await searchParams;
  redirect(`/admin/${tabAdminSah(tab) ? tab : TAB_ADMIN_BAKU}`);
}
