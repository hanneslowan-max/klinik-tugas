"use client";

// Jelajah per kategori pekerjaan (revisi Hannes 28 Okt 2026, menggantikan Space → Folder → List): kartu kategori
// (Ads, Konten, SEO, Pipeline, … diatur owner di Admin → Kategori) + "Tanpa kategori", masing-masing dengan hitungan
// tugas terbuka/telat yang terlihat oleh pengguna (web_kategori_kerja). Ketuk kartu → /jelajah/<id> (lintas list).
import {
  Clapperboard,
  ChevronRight,
  Handshake,
  Inbox,
  Megaphone,
  Search,
  Settings2,
  Tag,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { TANPA_KATEGORI, useKategoriKerja } from "@/features/kategori/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { fmtTanggal } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { HitunganKategori } from "@/types/domain";

/** Ikon kategori bawaan menurut nama; kategori buatan owner lainnya memakai ikon label. */
const IKON: Record<string, LucideIcon> = { ads: Megaphone, konten: Clapperboard, seo: Search, pipeline: Handshake };

function KartuKategori({
  href,
  nama,
  hitungan: n,
  Ikon,
  redup,
  uji,
}: {
  href: string;
  nama: string;
  hitungan: HitunganKategori;
  Ikon: LucideIcon;
  redup?: boolean;
  uji: string;
}) {
  return (
    <Link
      href={href}
      className={cn("block min-w-0 rounded-xl border bg-card transition-colors hover:bg-muted", redup && "border-dashed bg-transparent")}
      data-kategori={uji}
    >
      <IsiTautan className="flex h-full min-h-28 flex-col gap-2 p-3" kelasPetunjuk="inset-x-3 bottom-1 h-0.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              redup ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
            )}
          >
            <Ikon className="size-5" aria-hidden />
          </span>
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
        </span>
        <span className="truncate text-base font-semibold">{nama}</span>
        <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span data-uji="hitungan-terbuka">{n.terbuka} terbuka</span>
          {n.telat ? <Chip nada="telat">{n.telat} telat</Chip> : null}
        </span>
      </IsiTautan>
    </Link>
  );
}

export function LayarJelajah() {
  const { member } = useProfil();
  const q = useKategoriKerja();
  const total = q.data ? q.data.kategori.reduce((s, k) => s + k.hitungan.terbuka, q.data.tanpa.terbuka) : 0;

  return (
    <>
      <KepalaHalaman
        judul="Jelajah"
        aksi={
          member.role === "owner" ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/kategori" data-uji="atur-kategori">
                <Settings2 aria-hidden />
                Atur kategori
              </Link>
            </Button>
          ) : null
        }
      />
      <IsiHalaman className="space-y-3">
        {q.isPending ? (
          <MemuatDaftar baris={3} />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {fmtTanggal(q.data.hari_ini)} (WIB) · {total} tugas terbuka menurut jenis pekerjaan
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3" data-uji="kartu-kategori">
              {q.data.kategori.map((k) => (
                <KartuKategori
                  key={k.id}
                  href={`/jelajah/${encodeURIComponent(k.id)}`}
                  nama={k.nama}
                  hitungan={k.hitungan}
                  Ikon={IKON[k.nama.toLowerCase()] ?? Tag}
                  uji={k.id}
                />
              ))}
              <KartuKategori
                href={`/jelajah/${TANPA_KATEGORI}`}
                nama="Tanpa kategori"
                hitungan={q.data.tanpa}
                Ikon={Inbox}
                redup
                uji={TANPA_KATEGORI}
              />
            </div>
          </>
        )}
      </IsiHalaman>
    </>
  );
}
