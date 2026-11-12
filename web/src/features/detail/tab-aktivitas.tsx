"use client";

// Tab Komentar (n) / Riwayat (n). Tab aktif tercatat di URL (?tab=riwayat, replaceState tanpa memuat ulang halaman);
// tautan #c-<id> (dari notifikasi) membuka tab Komentar, menggulir ke komentarnya, dan menyorotnya.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDetail } from "@/features/detail/konteks";
import { DaftarRiwayat } from "@/features/detail/riwayat";
import { DaftarKomentar, jumlahKomentar } from "@/features/komentar/daftar-komentar";

export type TabDetail = "komentar" | "riwayat";

function langganHash(ubah: () => void) {
  window.addEventListener("hashchange", ubah);
  window.addEventListener("popstate", ubah);
  return () => {
    window.removeEventListener("hashchange", ubah);
    window.removeEventListener("popstate", ubah);
  };
}

/** Fragmen URL saat ini ("" di server). */
function useHash() {
  return useSyncExternalStore(
    langganHash,
    () => window.location.hash,
    () => "",
  );
}

function idDariHash(hash: string) {
  if (!hash.startsWith("#c-")) return null;
  try {
    return decodeURIComponent(hash.slice(3));
  } catch {
    return hash.slice(3);
  }
}

export function TabAktivitas({ tabAwal }: { tabAwal: TabDetail }) {
  const { id, d, bolehUbah, segarkan, tandaiEdit } = useDetail();
  const sorotId = idDariHash(useHash());
  const [pilihan, setPilihan] = useState<TabDetail | null>(null);
  const tab = pilihan ?? (sorotId ? "komentar" : tabAwal);
  const sudahSorot = useRef(false);

  // gulir ke komentar yang dituju sekali, sesudah daftarnya tampil
  useEffect(() => {
    if (!sorotId || sudahSorot.current || tab !== "komentar") return;
    const el = document.getElementById(`c-${sorotId}`);
    if (!el) return;
    sudahSorot.current = true;
    el.scrollIntoView({ block: "center" });
  }, [sorotId, tab, d]);

  function gantiTab(v: string) {
    const baru = v === "riwayat" ? "riwayat" : "komentar";
    setPilihan(baru);
    const u = new URL(window.location.href);
    if (baru === "riwayat") u.searchParams.set("tab", "riwayat");
    else u.searchParams.delete("tab");
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  }

  const sedangEdit = useCallback((aktif: boolean) => tandaiEdit("komentar", aktif), [tandaiEdit]);

  return (
    <section aria-label="Komentar dan riwayat">
      <Tabs value={tab} onValueChange={gantiTab} className="gap-3">
        <TabsList variant="line" className="w-full justify-start border-b group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="komentar" data-uji="tab-komentar" className="flex-none px-3">
            Komentar ({jumlahKomentar(d.komentar)})
          </TabsTrigger>
          <TabsTrigger value="riwayat" data-uji="tab-riwayat" className="flex-none px-3">
            Riwayat ({d.activity.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="komentar">
          <DaftarKomentar
            taskId={id}
            komentar={d.komentar}
            bolehKomentar={bolehUbah}
            cermin={d.boleh.cermin}
            diSampah={Boolean(d.task.deleted_at)}
            sorotId={sorotId}
            onBerubah={segarkan}
            onSedangEdit={sedangEdit}
          />
        </TabsContent>
        <TabsContent value="riwayat">
          <DaftarRiwayat activity={d.activity} statuses={d.task.statuses} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
