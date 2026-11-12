import type { ReactNode } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { ambilProfil } from "@/features/profil/server";

/**
 * Penjaga halaman khusus owner (Admin, Sampah). Hanya tampilan: hak sebenarnya tetap dicek fungsi web_admin_* /
 * web_purge di database (is_owner()).
 */
export async function PenjagaOwner({ judul, children }: { judul: string; children: ReactNode }) {
  const profil = await ambilProfil();
  if (!profil.owner) {
    return (
      <>
        <KepalaHalaman judul="Khusus owner" kembali="/saya" />
        <IsiHalaman>
          <KotakPesan nada="peringatan" data-uji="khusus-owner">
            Halaman {judul} khusus owner.
          </KotakPesan>
        </IsiHalaman>
      </>
    );
  }
  return <>{children}</>;
}
