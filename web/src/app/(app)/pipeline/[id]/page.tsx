import type { Metadata } from "next";

import { LayarDetailLead } from "@/features/pipeline/layar-detail";

export const metadata: Metadata = { title: "Lead" };

function idAman(mentah: string) {
  try {
    return decodeURIComponent(mentah);
  } catch {
    return mentah;
  }
}

export default async function HalamanLead({ params }: PageProps<"/pipeline/[id]">) {
  const { id } = await params;
  const lead = idAman(id);
  return <LayarDetailLead key={lead} id={lead} />;
}
