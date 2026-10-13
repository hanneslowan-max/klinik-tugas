"use client";

// Papan (Board) list dimuat MALAS: dnd-kit (±15 KB gz) tidak ikut JS awal layar list. Pramuat dipanggil saat
// ?v=board aktif (sejajar dengan web_daftar), saat browser senggang sesudah daftar tiba, dan saat tab Papan
// disentuh/difokus. Gagal memuat (sinyal putus) → pesan + Coba lagi di tempat papan (muatKomponen), bukan layar galat.
import dynamic from "next/dynamic";

import { MemuatDaftar } from "@/components/umum/keadaan";
import { pramuat } from "@/lib/impor-aman";
import { muatKomponen } from "@/lib/muat-komponen";

export const Papan = dynamic(() => muatKomponen(() => import("@/features/list/papan"), (m) => m.Papan, "papan"), {
  loading: () => <MemuatDaftar />,
});

export const pramuatPapanList = () => pramuat(() => import("@/features/list/papan"));
