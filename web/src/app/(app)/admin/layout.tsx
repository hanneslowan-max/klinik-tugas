// Admin (owner): 7 bagian sebagai rute bertingkat /admin/<tab> dengan kepala & navigasi tab bersama. Penjaga owner
// hanya tampilan; hak sebenarnya dicek fungsi web_admin_* (is_owner()) dan Edge /x/admin/*.
import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaAdmin, NavAdmin } from "@/features/admin/kerangka-admin";
import { PenjagaOwner } from "@/features/auth/penjaga-owner";

export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return (
    <PenjagaOwner judul="Admin">
      <KepalaAdmin />
      <IsiHalaman lebar className="max-w-5xl space-y-4">
        <NavAdmin />
        <div data-uji="admin-isi">{children}</div>
      </IsiHalaman>
    </PenjagaOwner>
  );
}
