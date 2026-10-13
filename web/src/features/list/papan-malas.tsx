"use client";

// Papan (Board) list dimuat MALAS: dnd-kit (±15 KB gz) hanya diunduh bila papan dipakai. Pramuat dipanggil saat
// ?v=board aktif (sejajar dengan web_daftar) dan saat tab Papan disentuh/difokus.
import dynamic from "next/dynamic";

import { MemuatDaftar } from "@/components/umum/keadaan";
import { imporAman, pramuat } from "@/lib/impor-aman";

export const Papan = dynamic(() => imporAman(() => import("@/features/list/papan")).then((m) => m.Papan), {
  loading: () => <MemuatDaftar />,
});

export const pramuatPapanList = () => pramuat(() => import("@/features/list/papan"));
