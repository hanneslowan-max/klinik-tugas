import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormGantiPassword } from "@/features/auth/form-ganti-password";
import { ambilProfil } from "@/features/profil/server";
import { GalatApi } from "@/lib/api/galat";

export const metadata: Metadata = { title: "Ganti password" };

/** Wajib saat members.harus_ganti_password (password sementara dari owner); juga bisa dari Menu. */
export default async function HalamanGantiPassword({ searchParams }: PageProps<"/ganti-password">) {
  const q = await searchParams;
  const lanjut = typeof q.lanjut === "string" ? q.lanjut : null;
  let wajib = false;
  try {
    const profil = await ambilProfil();
    wajib = Boolean(profil.member?.harus_ganti_password);
  } catch (e) {
    if (e instanceof GalatApi && e.sesiHabis) redirect("/masuk?lanjut=%2Fganti-password");
    throw e;
  }
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Ganti password</h1>
      <FormGantiPassword wajib={wajib} lanjut={lanjut} />
    </div>
  );
}
