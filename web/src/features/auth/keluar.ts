"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { klienBrowser } from "@/lib/supabase/client";

/** Keluar: hapus sesi (cookie), buang cache data, kembali ke layar masuk. */
export function useKeluar() {
  const router = useRouter();
  const qc = useQueryClient();
  return async (pesan = true) => {
    try {
      await klienBrowser().auth.signOut();
    } catch {
      // tetap lanjut: cookie lokal sudah dibersihkan klien
    }
    qc.clear();
    if (pesan) toast.success("Anda sudah keluar");
    router.replace("/masuk");
    router.refresh();
  };
}
