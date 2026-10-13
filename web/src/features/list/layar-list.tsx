"use client";

// List: Daftar per status + Papan (Board) kanban (web_daftar). Filter & mode di URL (?v=board · a · s · d · selesai=1),
// diperbarui dengan replaceState (tanpa entri riwayat, tanpa lompat gulir); tab Daftar ↔ Board membawa filter.
// Board mengambil lebar penuh di desktop; tingginya = sisa layar di atas navigasi bawah HP.
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { DaftarStatus } from "@/features/list/daftar-status";
import { bacaFilter, bacaMode, lolosFilter, urlList, type FilterList } from "@/features/list/filter";
import { FilterLipat, FilterListIsi } from "@/features/list/filter-list";
import { Papan } from "@/features/list/papan";
import { useDaftarList } from "@/features/list/queries";
import { TabTampilan } from "@/features/list/tab-tampilan";
import { urutStatus } from "@/features/list/urutan";
import { useProfil } from "@/features/profil/penyedia-profil";
import { listDatar, useStruktur } from "@/features/struktur/queries";
import { DialogBuatTugas } from "@/features/tugas/dialog-buat-tugas";
import { useUbahTugas } from "@/features/tugas/mutasi";
import { statusToggle } from "@/features/tugas/util";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { Tugas } from "@/types/domain";

export function LayarList({ listId }: { listId: string }) {
  const router = useRouter();
  const { member, hariIni, libur } = useProfil();
  const q = useSearchParams();
  const mode = bacaMode(q);
  const filter = useMemo(() => bacaFilter(q), [q]);
  const board = mode === "board";
  const termasukSelesai = board || filter.selesai;

  const daftar = useDaftarList(listId, termasukSelesai);
  const struktur = useStruktur();
  const ubahTugas = useUbahTugas();
  const [buatBuka, setBuatBuka] = useState(false);

  const data = daftar.data;
  const list = data?.list;
  const lokasi = useMemo(() => listDatar(struktur.data, true).find((l) => l.id === listId), [struktur.data, listId]);
  const statuses = useMemo(() => (list ? urutStatus(list.statuses) : []), [list]);
  const idSaya = Number(member.id);
  const tampak = useMemo(
    () => (data ? data.tasks.filter((t) => lolosFilter(t, filter, idSaya, hariIni, libur)) : []),
    [data, filter, idSaya, hariIni, libur],
  );
  const adaFab = Boolean(list?.boleh_ubah && !list.archived);

  function ubahFilter(ubah: Partial<FilterList>) {
    // replaceState terintegrasi dengan router Next (useSearchParams ikut berubah) tanpa memuat ulang halaman server
    window.history.replaceState(null, "", urlList(listId, mode, { ...filter, ...ubah }));
  }

  // Tombol tetap nonaktif sampai daftar terbaru tiba: mutateAsync baru selesai (berhasil maupun gagal) SESUDAH
  // onSettled useUbahTugas memuat ulang daftar yang tampil — tanpa invalidasi kedua (itu web_daftar ke-2, +1 RTT).
  async function ubahSelesai(t: Tugas) {
    if (!list) return;
    try {
      await ubahTugas.mutateAsync({ id: t.id, versi: t.versi, body: { status: statusToggle(list.statuses, t.selesai) } });
      toast.success(t.selesai ? "Tugas dibuka lagi" : "Tugas ditandai selesai", { duration: 2000 });
    } catch (e) {
      toast.error(e instanceof GalatApi && e.konflik ? "Tugas sudah diubah orang lain. Daftar dimuat ulang." : pesanGalat(e));
    }
  }

  const filterIsi = <FilterListIsi filter={filter} ubah={ubahFilter} statuses={statuses} />;

  return (
    <>
      <KepalaHalaman judul={list?.name ?? lokasi?.name ?? "List"} kembali="/jelajah" />
      <IsiHalaman lebar={board} className={cn("flex flex-col gap-2 pt-1 md:pt-3", adaFab && !board && "pb-28 lg:pb-24")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* basis: di HP remah mendapat baris sendiri (tidak terpotong jadi "Ruang › Eks…"), tab di bawahnya */}
          <div className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-x-2 gap-y-1">
            {lokasi ? (
              <nav aria-label="Lokasi list" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground" data-uji="remah">
                <Link href="/jelajah" className="inline-flex min-h-11 min-w-11 items-center truncate hover:text-foreground hover:underline md:min-h-8">
                  {lokasi.space.name}
                </Link>
                {lokasi.folder && !lokasi.folder.hidden ? (
                  <>
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{lokasi.folder.name}</span>
                  </>
                ) : null}
              </nav>
            ) : null}
            {list?.tidak_ditagih ? <Chip nada="garis">tidak ditagih</Chip> : null}
            {list?.archived ? <Chip nada="garis">list diarsip</Chip> : null}
          </div>
          <TabTampilan listId={listId} mode={mode} filter={filter} className="w-full sm:ml-auto sm:w-auto" />
        </div>

        {list && !list.boleh_ubah ? (
          <KotakPesan nada="cermin" data-uji="list-cermin">
            List ClickUp: hanya-baca selama mode cermin. Ubah kartunya di ClickUp; perubahan masuk lewat sinkron.
          </KotakPesan>
        ) : null}

        {board ? <FilterLipat filter={filter}>{filterIsi}</FilterLipat> : filterIsi}

        {/* jumlah kartu tampak untuk pembaca layar (daftar sendiri tidak diumumkan ulang tiap filter berubah) */}
        <p className="sr-only" role="status">
          {data ? `${tampak.length} tugas ditampilkan` : ""}
        </p>

        {daftar.isPending ? (
          <MemuatDaftar />
        ) : daftar.isError ? (
          <GalatMuat galat={daftar.error} ulang={() => daftar.refetch()} />
        ) : board ? (
          <Papan data={daftar.data} tampak={tampak} tampilSelesai={filter.selesai} adaFab={adaFab} />
        ) : (
          <DaftarStatus data={daftar.data} tampak={tampak} toggle={ubahSelesai} />
        )}
      </IsiHalaman>

      {adaFab && list ? (
        <>
          <Button
            type="button"
            onClick={() => setBuatBuka(true)}
            data-uji="buat-tugas"
            className={cn(
              "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 h-13 gap-1.5 rounded-full px-5 text-base font-semibold shadow-lg",
              "lg:right-6 lg:bottom-6",
            )}
          >
            <Plus className="size-5" aria-hidden />
            <span className="sr-only">Buat </span>
            Tugas
          </Button>
          <DialogBuatTugas
            buka={buatBuka}
            ubahBuka={setBuatBuka}
            list={list}
            onDibuat={(t) => router.push(`/t/${encodeURIComponent(t.id)}`)}
          />
        </>
      ) : null}
    </>
  );
}
