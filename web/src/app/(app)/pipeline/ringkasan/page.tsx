import type { Metadata } from "next";

import { LayarRingkasan } from "@/features/pipeline/layar-ringkasan";

export const metadata: Metadata = { title: "Ringkasan Pipeline" };

export default function HalamanRingkasanPipeline() {
  return <LayarRingkasan />;
}
