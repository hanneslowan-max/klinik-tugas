"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LencanaMode } from "@/components/layout/lencana-mode";
import { Lonceng } from "@/components/layout/lonceng";
import { adaRiwayatDalam } from "@/components/layout/riwayat";
import { cn } from "@/lib/utils";

type Props = {
  judul: ReactNode;
  /** judul dokumen (tab browser) bila berbeda / judul berupa elemen */
  judulDokumen?: string;
  /** tampilkan tombol kembali; nilai = tujuan cadangan bila tidak ada riwayat di aplikasi */
  kembali?: string;
  aksi?: ReactNode;
  className?: string;
};

/** Header halaman (lengket di atas): kembali, judul, lencana mode, lonceng, aksi opsional. */
export function KepalaHalaman({ judul, judulDokumen, kembali, aksi, className }: Props) {
  const router = useRouter();
  const teksJudul = judulDokumen ?? (typeof judul === "string" ? judul : undefined);

  useEffect(() => {
    if (teksJudul) document.title = `${teksJudul} · Tugas RHJ`;
  }, [teksJudul]);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-4",
        "pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      {kembali ? (
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => (adaRiwayatDalam() ? router.back() : router.push(kembali))}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold" data-uji="judul-halaman">
        {judul}
      </h1>
      {aksi}
      <LencanaMode />
      <Lonceng />
    </header>
  );
}
