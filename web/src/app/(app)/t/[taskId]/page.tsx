import type { Metadata } from "next";

import { LayarDetail } from "@/features/detail/layar-detail";

export const metadata: Metadata = { title: "Tugas" };

function idAman(mentah: string) {
  try {
    return decodeURIComponent(mentah);
  } catch {
    return mentah;
  }
}

export default async function HalamanDetail({ params, searchParams }: PageProps<"/t/[taskId]">) {
  const { taskId } = await params;
  const q = await searchParams;
  const id = idAman(taskId);
  // key: pindah antar-tugas (mis. ke sub-tugas) selalu mulai dengan keadaan layar yang bersih
  return <LayarDetail key={id} id={id} tabAwal={q.tab === "riwayat" ? "riwayat" : "komentar"} />;
}
