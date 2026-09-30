"use client";

import { useEffect } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { pesanGalat } from "@/lib/api/galat";

/** Galat tak terduga di satu layar: kerangka tetap tampil, layar bisa dicoba lagi. */
export default function GalatLayar({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <IsiHalaman className="space-y-3">
      <KotakPesan nada="galat" judul="Terjadi kesalahan">
        {pesanGalat(error)}
      </KotakPesan>
      <Button variant="outline" onClick={reset}>
        Coba lagi
      </Button>
    </IsiHalaman>
  );
}
