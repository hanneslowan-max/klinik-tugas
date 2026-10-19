"use client";

// Navigasi sekunder modul Pipeline di kepala halaman: Pelanggan (semua peran), Ringkasan (admin/baca), Kelola akses
// (owner). Desktop (lg): tombol berlabel. HP/tablet: satu tombol ⋯ berisi tautan yang sama (pola menu ⋯ detail tugas),
// supaya baris alat di bawah judul tidak pecah jadi dua-tiga baris tombol.
import { BarChart3, Building2, MoreHorizontal, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePipelineSaya } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";

export function AksiPipeline() {
  const saya = usePipelineSaya();
  const { owner } = useProfil();
  if (!saya.data?.peran) return null;
  const tautan = [
    { href: "/pipeline/pelanggan", label: "Pelanggan", Ikon: Building2, uji: "tautan-pelanggan" },
    ...(saya.data.boleh_ringkas ? [{ href: "/pipeline/ringkasan", label: "Ringkasan", Ikon: BarChart3, uji: "tautan-ringkasan" }] : []),
    ...(owner ? [{ href: "/admin/pipeline", label: "Kelola akses", Ikon: ShieldCheck, uji: "tautan-akses-pipeline" }] : []),
  ];
  return (
    <>
      <div className="hidden items-center gap-1 lg:flex">
        {tautan.map(({ href, label, Ikon, uji }) => (
          <Button key={href} asChild variant="ghost" size="sm">
            <Link href={href} data-uji={uji}>
              <Ikon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menu Pipeline" className="size-11 rounded-full lg:hidden" data-uji="menu-pipeline">
            <MoreHorizontal className="size-5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Pipeline</DropdownMenuLabel>
          {tautan.map(({ href, label, Ikon, uji }) => (
            <DropdownMenuItem key={href} asChild className="min-h-11">
              <Link href={href} data-uji={`menu-${uji}`}>
                <Ikon aria-hidden />
                {label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
