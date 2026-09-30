"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { useProfil } from "@/features/profil/penyedia-profil";
import { cn } from "@/lib/utils";

/** Lonceng notifikasi dengan angka belum dibaca (disegarkan tiap 60 dtk lewat profil). */
export function Lonceng({ className }: { className?: string }) {
  const { profil } = useProfil();
  const n = profil.notif_belum || 0;
  return (
    <Link
      href="/notif"
      aria-label={n ? `Notifikasi, ${n} belum dibaca` : "Notifikasi"}
      className={cn("relative inline-flex size-10 items-center justify-center rounded-full hover:bg-muted", className)}
      data-uji="lonceng"
    >
      <Bell className="size-5" aria-hidden />
      {n > 0 ? (
        <span
          className="absolute top-1 right-1 min-w-4 rounded-full bg-telat px-1 text-center text-[10px] leading-4 font-bold text-white"
          data-uji="lonceng-angka"
        >
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}
