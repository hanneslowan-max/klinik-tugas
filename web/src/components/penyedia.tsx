"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { KonfirmasiProvider } from "@/components/umum/konfirmasi";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GalatApi } from "@/lib/api/galat";

function buatQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (e) => {
        // sesi habis di tengah jalan (token dicabut/kedaluwarsa) → kembali ke layar masuk
        if (e instanceof GalatApi && e.sesiHabis && typeof window !== "undefined") {
          const lanjut = encodeURIComponent(location.pathname + location.search);
          // muat ulang penuh (bukan navigasi klien) supaya seluruh cache & state sesi lama terbuang
          window.location.href = `/masuk?lanjut=${lanjut}`;
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}
