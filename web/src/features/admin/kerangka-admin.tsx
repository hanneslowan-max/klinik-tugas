"use client";

// Kepala + navigasi tab Admin (tautan ke /admin/<tab>). Layout tidak dirender ulang saat pindah tab, jadi tab aktif
// dibaca dari path di klien.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { TAB_ADMIN, tabDariPath } from "@/features/admin/tab";
import { cn } from "@/lib/utils";

/** KepalaHalaman "Admin"; judul dokumen ikut tab ("Admin · Token API · Tugas RHJ"). */
export function KepalaAdmin() {
  const tab = tabDariPath(usePathname());
  return <KepalaHalaman judul="Admin" judulDokumen={tab ? `Admin · ${tab.label}` : "Admin"} kembali="/saya" />;
}

export function NavAdmin() {
  const aktif = tabDariPath(usePathname())?.kunci;
  const refAktif = useRef<HTMLAnchorElement>(null);

  // HP: tab aktif (mis. Sinkron di ujung kanan) digulir supaya terlihat
  useEffect(() => {
    refAktif.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aktif]);

  return (
    <nav aria-label="Bagian admin" className="-mx-4 md:mx-0">
      <ul className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
        {TAB_ADMIN.map((t) => {
          const ini = t.kunci === aktif;
          return (
            <li key={t.kunci} className="shrink-0">
              <Link
                href={`/admin/${t.kunci}`}
                ref={ini ? refAktif : undefined}
                aria-current={ini ? "page" : undefined}
                data-tab={t.kunci}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:h-11 pointer-coarse:px-4",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  ini ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
