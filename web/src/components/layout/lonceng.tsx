"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { PetunjukTautan, useTautanMenunggu } from "@/components/layout/petunjuk-tautan";
import { useProfil } from "@/features/profil/penyedia-profil";
import { cn } from "@/lib/utils";

/** Ikon lonceng (turunan Link): langsung ber-warna aktif saat diklik, garis petunjuk bila halaman lama dimuat. */
function IkonLonceng() {
  const menunggu = useTautanMenunggu();
  return (
    <>
      <Bell className={cn("size-5", menunggu && "text-primary")} aria-hidden />
      <PetunjukTautan className="inset-x-3 bottom-1 h-0.5" />
    </>
  );
}

/** Lonceng notifikasi dengan angka belum dibaca (disegarkan tiap 60 dtk lewat profil). */
export function Lonceng({ className }: { className?: string }) {
  const { profil } = useProfil();
  const n = profil.notif_belum || 0;
  return (
    <Link
      href="/notif"
      aria-label={n ? `Notifikasi, ${n} belum dibaca` : "Notifikasi"}
      className={cn("relative inline-flex size-11 items-center justify-center rounded-full hover:bg-muted", className)}
      data-uji="lonceng"
    >
      <IkonLonceng />
      {n > 0 ? (
        <span
          className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-telat px-1 text-center text-[10px] leading-4 font-bold text-white"
          data-uji="lonceng-angka"
        >
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}
