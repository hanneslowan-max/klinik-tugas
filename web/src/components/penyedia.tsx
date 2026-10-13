"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { DaftarSW } from "@/components/daftar-sw";
import { KonfirmasiProvider } from "@/components/umum/konfirmasi";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GalatApi } from "@/lib/api/galat";

/** QueryClient aplikasi (diekspor untuk tes). */
export function buatQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (e) => {
        // sesi habis di tengah jalan (token dicabut/kedaluwarsa) → kembali ke layar masuk
        if (e instanceof GalatApi && e.sesiHabis && typeof window !== "undefined") {
          const lanjut = encodeURIComponent(location.pathname + location.search);
          // muat ulang penuh (bukan navigasi klien) supaya seluruh cache & state sesi lama terbuang
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sengaja muat ulang penuh
          window.location.href = `/masuk?lanjut=${lanjut}`;
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Simpan data layar yang tidak terpasang 30 mnt (bawaan 5 mnt): kembali ke Tugas Saya/List/Pipeline sesudah
        // lama bekerja di detail langsung menampilkan data lama (disegarkan di latar), bukan skeleton + 1 RTT.
        // JANGAN Infinity / ≥ 50 mnt: gcTime query = maks antar-observer, dan signed URL lampiran (berlaku 60 mnt)
        // mengandalkan gcTime SEGAR_URL (50 mnt) supaya URL kedaluwarsa terbuang.
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
        retry: (n, e) => !(e instanceof GalatApi && (e.sesiHabis || (e.status ?? 0) >= 400)) && n < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function Penyedia({ children }: { children: ReactNode }) {
  const [qc] = useState(buatQueryClient);
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={400}>
        <KonfirmasiProvider>{children}</KonfirmasiProvider>
        <Toaster position="top-center" richColors closeButton />
        <DaftarSW />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
