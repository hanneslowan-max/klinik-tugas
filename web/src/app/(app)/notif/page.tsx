import type { Metadata } from "next";

import { LayarNotif } from "@/features/notif/layar-notif";

export const metadata: Metadata = { title: "Notifikasi" };

export default function HalamanNotif() {
  return <LayarNotif />;
}
