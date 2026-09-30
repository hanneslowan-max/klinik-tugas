"use client";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { useKeluar } from "@/features/auth/keluar";

/** Login berhasil tetapi akun belum terhubung ke anggota tim / anggotanya nonaktif. */
export function AkunBelumAktif({ terhubung }: { terhubung: boolean }) {
  const keluar = useKeluar();
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">Akun belum aktif</h1>
      <KotakPesan nada="peringatan" data-uji="akun-belum-aktif">
        {terhubung ? "Akun Anda sedang nonaktif. Hubungi owner." : "Akun ini belum terhubung ke anggota tim. Hubungi owner."}
      </KotakPesan>
      <Button onClick={() => keluar(false)}>Keluar</Button>
    </div>
  );
}
