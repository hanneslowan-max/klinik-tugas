// Penjaga semua layar yang butuh login: sesi sah (proxy sudah mengalihkan tamu), anggota aktif, dan wajib ganti
// password sementara. Profil & hari libur dimuat di server lalu diteruskan ke klien.
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { KerangkaApp } from "@/components/layout/kerangka-app";
import { AkunBelumAktif } from "@/features/auth/akun-belum-aktif";
import { PenyediaProfil } from "@/features/profil/penyedia-profil";
import { ambilLibur, ambilProfil } from "@/features/profil/server";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { KotakPesan } from "@/components/umum/kotak-pesan";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const path = (await headers()).get("x-path") || "/saya";
  const lanjut = encodeURIComponent(path);

  let profil;
  try {
    profil = await ambilProfil();
  } catch (e) {
    if (e instanceof GalatApi && e.sesiHabis) redirect(`/masuk?lanjut=${lanjut}`);
    return (
      <div className="mx-auto max-w-md p-6">
        <KotakPesan nada="galat" judul="Gagal memuat">
          {pesanGalat(e)}
        </KotakPesan>
      </div>
    );
  }

  if (!profil.member || !profil.anggota_aktif) {
    return <AkunBelumAktif terhubung={Boolean(profil.member)} />;
  }
  if (profil.member.harus_ganti_password) redirect(`/ganti-password?lanjut=${lanjut}`);

  const libur = await ambilLibur();
  return (
    <PenyediaProfil awal={profil} liburAwal={libur}>
      <KerangkaApp>{children}</KerangkaApp>
    </PenyediaProfil>
  );
}
