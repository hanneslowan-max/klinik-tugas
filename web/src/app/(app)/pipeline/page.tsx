import type { Metadata } from "next";

import { LayarDaftar } from "@/features/pipeline/layar-daftar";

export const metadata: Metadata = { title: "Pipeline" };

export default function HalamanPipeline() {
  return <LayarDaftar />;
}
