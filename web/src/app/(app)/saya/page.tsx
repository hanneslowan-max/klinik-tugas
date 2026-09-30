import type { Metadata } from "next";

import { LayarSaya } from "@/features/tugas-saya/layar-saya";

export const metadata: Metadata = { title: "Tugas Saya" };

export default async function HalamanSaya({ searchParams }: PageProps<"/saya">) {
  const q = await searchParams;
  const m = typeof q.m === "string" && /^\d+$/.test(q.m) ? Number(q.m) : null;
  return <LayarSaya target={m} />;
}
