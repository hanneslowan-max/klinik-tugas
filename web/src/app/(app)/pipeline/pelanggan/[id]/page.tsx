import type { Metadata } from "next";

import { LayarDetailPelanggan } from "@/features/pipeline/layar-detail-pelanggan";

export const metadata: Metadata = { title: "Pelanggan" };

function idAman(mentah: string) {
  try {
    return decodeURIComponent(mentah);
  } catch {
    return mentah;
  }
}

export default async function HalamanDetailPelanggan({ params }: PageProps<"/pipeline/pelanggan/[id]">) {
  const { id } = await params;
  const pelanggan = idAman(id);
  return <LayarDetailPelanggan key={pelanggan} id={pelanggan} />;
}
