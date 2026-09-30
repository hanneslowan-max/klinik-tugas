import type { Metadata } from "next";

import { LayarList } from "@/features/list/layar-list";

export const metadata: Metadata = { title: "List" };

/** id list dari segmen URL (dijaga bila masih ter-encode). */
function idAman(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Mode & filter (?v=board · a · s · d · selesai) dibaca di klien (useSearchParams) supaya ganti filter tidak
// memuat ulang halaman server.
export default async function HalamanList({ params }: PageProps<"/l/[listId]">) {
  const { listId } = await params;
  return <LayarList listId={idAman(listId)} />;
}
