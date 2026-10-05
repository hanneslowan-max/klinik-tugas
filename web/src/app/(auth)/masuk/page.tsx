import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { FormMasuk } from "@/features/auth/form-masuk";
import { konfigLengkap } from "@/lib/env";
import { klienServer } from "@/lib/supabase/server";
import { lanjutAman } from "@/lib/teks";

export const metadata: Metadata = { title: "Masuk" };

export default async function HalamanMasuk({ searchParams }: PageProps<"/masuk">) {
  const q = await searchParams;
  const lanjut = typeof q.lanjut === "string" ? q.lanjut : null;

  if (!konfigLengkap) {
    return (
      <KotakPesan nada="galat" data-uji="konfig-kosong">
        Konfigurasi aplikasi belum diisi (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Hubungi pengelola
        aplikasi.
      </KotakPesan>
    );
  }

  // sudah masuk → langsung lanjut
  const klien = await klienServer();
  const { data } = await klien.auth.getClaims();
  if (data?.claims?.sub) redirect(lanjutAman(lanjut, "/saya", ["/masuk"]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- ikon SVG kecil statis */}
        <img src="/icon.svg" alt="" className="size-11 rounded-xl" />
        <div>
          <h1 className="text-xl font-bold">Anvil</h1>
          <p className="text-sm text-muted-foreground">PT Roda Hammerindo Jaya</p>
        </div>
      </div>
      {lanjut ? <KotakPesan nada="info">Silakan masuk untuk melanjutkan.</KotakPesan> : null}
      <FormMasuk lanjut={lanjut} />
      <p className="text-center text-xs text-muted-foreground">Lupa password atau belum punya akun? Hubungi owner.</p>
    </div>
  );
}
