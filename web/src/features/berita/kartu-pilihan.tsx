"use client";

// Kartu satu berita pilihan kurator: kategori, wilayah, sumber, judul (tautan ke sumber), ringkasan, dampak ke bisnis,
// bahan obrolan relasi, dan aksi owner (Simpan / Kurang relevan). Membuka tautan = tanda dibaca. Tanda dikirim lewat
// web_berita_tanda oleh pemanggil (onTanda) supaya cache edisi & tersimpan diperbarui di satu tempat.
import { Bookmark, BookmarkCheck, ExternalLink, MessagesSquare, ThumbsDown, TrendingUp } from "lucide-react";

import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { KATEGORI_BERITA, WILAYAH_BERITA, type Tanda } from "@/features/berita/berita";
import { fmtRelatif, fmtWaktu } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { PilihanBerita } from "@/types/domain";

export function KartuPilihan({
  p,
  hariIni,
  onTanda,
  sibuk,
}: {
  p: PilihanBerita;
  hariIni?: string | null;
  onTanda: (p: PilihanBerita, tanda: Tanda) => void;
  sibuk?: boolean;
}) {
  const bacaSumber = () => {
    if (!p.dibaca) onTanda(p, { dibaca: true });
  };
  return (
    <article
      className={cn("rounded-xl border bg-card px-3.5 py-3", p.kurang && "opacity-60")}
      data-uji="kartu-berita"
      data-skor={p.skor}
      data-wilayah={p.wilayah}
      data-dibaca={p.dibaca ? "1" : undefined}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Chip nada={p.skor >= 5 ? "telat" : p.skor === 4 ? "hari-ini" : "biasa"}>{KATEGORI_BERITA[p.kategori] ?? p.kategori}</Chip>
        <Chip nada="garis">{WILAYAH_BERITA[p.wilayah]}</Chip>
        <span className="min-w-0 truncate">
          {p.sumber}
          {p.terbit_at ? (
            <>
              {" · "}
              <span title={fmtWaktu(p.terbit_at)}>{fmtRelatif(p.terbit_at, hariIni)}</span>
            </>
          ) : null}
        </span>
      </div>

      <h3 className="mt-2 text-[15px] leading-snug font-semibold">
        {!p.dibaca ? <span className="mr-1.5 inline-block size-2 rounded-full bg-info align-middle" aria-label="Belum dibuka" /> : null}
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={bacaSumber}
          onAuxClick={bacaSumber}
          className="underline-offset-2 hover:underline"
          data-uji="judul-berita"
        >
          {p.judul}
        </a>
      </h3>

      <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{p.ringkasan}</p>

      <div className="mt-2.5 flex flex-col gap-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">
          <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <TrendingUp className="size-3.5" aria-hidden />
            Dampak ke bisnis
          </div>
          {p.dampak}
        </div>
        {p.bahan_relasi ? (
          <div className="rounded-lg bg-info-lembut/50 px-3 py-2 text-sm leading-relaxed">
            <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <MessagesSquare className="size-3.5" aria-hidden />
              Bahan obrolan relasi
            </div>
            {p.bahan_relasi}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <Button asChild variant="outline" size="sm" className="pointer-coarse:h-10">
          <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={bacaSumber} onAuxClick={bacaSumber}>
            <ExternalLink data-icon="inline-start" aria-hidden />
            Baca sumber
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("pointer-coarse:h-10", p.disimpan && "text-primary")}
          aria-pressed={p.disimpan}
          disabled={sibuk}
          onClick={() => onTanda(p, { disimpan: !p.disimpan })}
          data-uji="simpan-berita"
        >
          {p.disimpan ? <BookmarkCheck data-icon="inline-start" aria-hidden /> : <Bookmark data-icon="inline-start" aria-hidden />}
          {p.disimpan ? "Tersimpan" : "Simpan"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn("pointer-coarse:h-10", p.kurang && "text-telat")}
          aria-pressed={p.kurang}
          disabled={sibuk}
          onClick={() => onTanda(p, { kurang: !p.kurang })}
          aria-label="Kurang relevan"
          title="Kurang relevan: kurator belajar dari tanda ini untuk edisi berikutnya"
          data-uji="kurang-berita"
        >
          <ThumbsDown data-icon="inline-start" aria-hidden />
          <span className="sm:hidden">Kurang</span>
          <span className="hidden sm:inline">Kurang relevan</span>
        </Button>
      </div>
    </article>
  );
}
