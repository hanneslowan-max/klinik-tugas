"use client";

// Detail tugas (/t/<id>, web_detail): kepala (remah, spanduk, judul, ID, menu, peringatan), field, deskripsi,
// checklist, sub-tugas, lampiran, tab Komentar / Riwayat.
// HP: satu kolom, field langsung sesudah kepala. Desktop lebar (≥ xl): field di kolom kanan yang menempel saat digulir.
import { Search } from "lucide-react";
import Link from "next/link";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { muatMarkdown } from "@/components/umum/teks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checklist } from "@/features/detail/checklist";
import { Deskripsi } from "@/features/detail/deskripsi";
import { FieldTugas } from "@/features/detail/field-tugas";
import { KepalaDetail } from "@/features/detail/kepala-detail";
import { PenyediaDetail, useDataDetail, useDetail } from "@/features/detail/konteks";
import { Subtugas } from "@/features/detail/subtugas";
import { TabAktivitas, type TabDetail } from "@/features/detail/tab-aktivitas";
import { BagianLampiran } from "@/features/lampiran/daftar-lampiran";
import { GalatApi } from "@/lib/api/galat";
import type { DataAwal } from "@/lib/data-awal";
import type { DetailTugas } from "@/types/domain";

// pustaka markdown (dimuat malas) mulai diunduh begitu modul ini dievaluasi di klien — saat hidrasi/navigasi /t,
// sejajar web_detail — bukan sesudah komit hidrasi (efek) sehingga fase teks polos deskripsi lebih singkat
if (typeof window !== "undefined") muatMarkdown().catch(() => {});

function MemuatDetail() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat tugas">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

function TidakDitemukan({ id }: { id: string }) {
  return (
    <div className="space-y-3">
      <KotakPesan nada="galat">Tugas &quot;{id}&quot; tidak ditemukan.</KotakPesan>
      <Button asChild variant="outline">
        <Link href={`/cari?q=${encodeURIComponent(id)}`}>
          <Search aria-hidden />
          Cari tugas
        </Link>
      </Button>
    </div>
  );
}

function LampiranDetail() {
  const { id, d, bolehUbah, segarkan } = useDetail();
  return <BagianLampiran taskId={id} lampiran={d.lampiran} bolehUbah={bolehUbah} onBerubah={segarkan} />;
}

export function LayarDetail({ id, tabAwal, awal }: { id: string; tabAwal: TabDetail; awal?: DataAwal<DetailTugas> }) {
  const q = useDataDetail(id, awal);
  const tidakAda = q.error instanceof GalatApi && q.error.tidakAda;

  if (!q.data || tidakAda) {
    return (
      <>
        <KepalaHalaman judul={tidakAda ? "Tidak ditemukan" : "Tugas"} kembali="/saya" />
        <IsiHalaman>
          {tidakAda ? <TidakDitemukan id={id} /> : q.isError ? <GalatMuat galat={q.error} ulang={() => void q.refetch()} /> : <MemuatDetail />}
        </IsiHalaman>
      </>
    );
  }

  const t = q.data.task;
  return (
    <PenyediaDetail id={id} d={q.data} refetch={q.refetch}>
      <KepalaHalaman judul={t.name} kembali={`/l/${encodeURIComponent(t.list.id)}`} />
      <IsiHalaman className="max-w-3xl xl:max-w-6xl">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr] xl:gap-x-8" data-uji="detail-tugas">
          <div className="min-w-0">
            <KepalaDetail />
          </div>
          <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <div className="xl:sticky xl:top-18">
              <FieldTugas />
            </div>
          </div>
          <div className="min-w-0 space-y-6 pt-2">
            <Deskripsi />
            <Checklist />
            <Subtugas />
            <LampiranDetail />
            <TabAktivitas tabAwal={tabAwal} />
          </div>
        </div>
      </IsiHalaman>
    </PenyediaDetail>
  );
}
