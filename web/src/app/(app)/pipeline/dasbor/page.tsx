import type { Metadata } from "next";

import { LayarDasbor } from "@/features/pipeline/layar-dasbor";

export const metadata: Metadata = { title: "Dasbor Pipeline" };

export default function HalamanDasborPipeline() {
  return <LayarDasbor />;
}
