import type { Metadata } from "next";

import { LayarJelajah } from "@/features/jelajah/layar-jelajah";

export const metadata: Metadata = { title: "Jelajah" };

export default async function HalamanJelajah({ searchParams }: PageProps<"/jelajah">) {
  const q = await searchParams;
  return <LayarJelajah arsip={q.arsip === "1"} />;
}
