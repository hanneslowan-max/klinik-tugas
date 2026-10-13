// Penjaga semua layar yang butuh login: sesi sah (proxy sudah mengalihkan tamu), anggota aktif, dan wajib ganti
// password sementara. Profil, hari libur, dan akses Pipeline dimuat di server lalu diteruskan ke klien. Ketiganya
// dibaca BERSAMAAN (bukan berurutan): HTML baru terkirim sesudah layout selesai, jadi tiap panggilan berurutan ke
// Supabase menambah satu round-trip pada setiap muat penuh.
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { KerangkaApp } from "@/components/layout/kerangka-app";
import { AkunBelumAktif } from "@/features/auth/akun-belum-aktif";
import { ambilPipelineSaya } from "@/features/pipeline/server";
import { PenyediaProfil } from "@/features/profil/penyedia-profil";
import { ambilLibur, ambilProfil } from "@/features/profil/server";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { KotakPesan } from "@/components/umum/kotak-pesan";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const path = (await headers()).get("x-path") || "/saya";
  const lanjut = encodeURIComponent(path);

  // hari libur dibaca bersamaan dengan web_saya; hasilnya dibuang bila ternyata dialihkan / akun belum aktif.
  // Galatnya ditelan di sini (libur kosong), jadi tidak pernah memunculkan "Gagal memuat".
  const janjiLibur = ambilLibur().catch((): string[] => []);
  // akses Pipeline (menu & gerbang): galat sudah ditelan di ambilPipelineSaya → undefined (klien memuat sendiri)
  const janjiPipeline = ambilPipelineSaya();

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

  const [libur, pipelineAwal] = await Promise.all([janjiLibur, janjiPipeline]);
  return (
    <PenyediaProfil awal={profil} liburAwal={libur}>
      <KerangkaApp pipelineAwal={pipelineAwal}>{children}</KerangkaApp>
    </PenyediaProfil>
  );
}
