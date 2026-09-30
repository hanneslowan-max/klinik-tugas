import type { Metadata } from "next";

import { LayarCari } from "@/features/cari/layar-cari";

export const metadata: Metadata = { title: "Cari" };

export default async function HalamanCari({ searchParams }: PageProps<"/cari">) {
  const q = await searchParams;
  return <LayarCari q={typeof q.q === "string" ? q.q : ""} space={typeof q.space === "string" ? q.space : ""} />;
}
