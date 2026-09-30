"use client";

// Kolom Board (satu per status) + kartu yang bisa diseret (dnd-kit sortable). Kartu terkunci (mode cermin) tidak
// bisa diseret tetapi tetap menjadi posisi urut. Kolom selesai menyembunyikan kartunya kecuali filter
// "Tampilkan selesai", tetapi tetap menerima kartu (menandai selesai).
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";

import { TitikWarna } from "@/components/umum/status-pil";
import { useTerkunci } from "@/features/profil/penyedia-profil";
import { MetaTugas } from "@/features/tugas/baris-tugas";
import { cn } from "@/lib/utils";
import type { StatusList, Tugas } from "@/types/domain";

const AWALAN_KOLOM = "kolom:";

/** id droppable kolom (tidak bentrok dengan id kartu). */
export const idKolom = (status: string) => `${AWALAN_KOLOM}${status}`;

/** Status dari id droppable kolom; null bila id milik kartu. */
export function statusDariIdKolom(id: string | number): string | null {
  const s = String(id);
  return s.startsWith(AWALAN_KOLOM) ? s.slice(AWALAN_KOLOM.length) : null;
}

type PropsKolom = {
  status: StatusList;
  /** id kartu yang tampak di kolom (susunan saat ini, termasuk kartu yang sedang diseret ke sini) */
  ids: string[];
  peta: ReadonlyMap<string, Tugas>;
  /** jumlah kartu lolos filter (termasuk yang disembunyikan) */
  jumlah: number;
  disembunyikan: number;
  /** kolom tempat kartu yang diseret sedang berada */
  sorot: boolean;
  /** ruang bawah ekstra supaya kartu terakhir tidak tertutup tombol "Tugas" */
  adaFab: boolean;
};

export function KolomPapan({ status: s, ids, peta, jumlah, disembunyikan, sorot, adaFab }: PropsKolom) {
  const { setNodeRef } = useDroppable({ id: idKolom(s.status) });
  return (
    <section
      ref={setNodeRef}
      data-uji="kolom"
      data-kolom={s.status}
      className={cn(
        "flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-xl bg-muted/70 transition-shadow dark:bg-muted/40",
        "md:w-auto md:max-w-[480px] md:min-w-[272px] md:flex-1 md:basis-0",
        sorot && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 text-sm font-semibold">
        <TitikWarna warna={s.color} className="size-2.5" />
        <span className="min-w-0 flex-1 truncate">{s.status}</span>
        <span className="text-xs font-medium text-muted-foreground">
          {jumlah}
          <span className="sr-only"> kartu</span>
        </span>
      </div>
      {disembunyikan ? (
        <p className="px-3 pb-1 text-xs text-muted-foreground" data-uji="kolom-tersembunyi">
          {disembunyikan} kartu selesai disembunyikan. Seret kartu ke sini untuk menandai selesai.
        </p>
      ) : null}
      <SortableContext id={s.status} items={ids} strategy={verticalListSortingStrategy}>
        <ul
          data-uji="kolom-isi"
          data-status={s.status}
          aria-label={`Kolom ${s.status}`}
          className={cn("min-h-20 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2 pt-1 pb-3", adaFab && "pb-20")}
        >
          {ids.map((id) => {
            const t = peta.get(id);
            return t ? <KartuPapan key={id} tugas={t} /> : null;
          })}
        </ul>
      </SortableContext>
    </section>
  );
}

const kelasKartu = (kunci: boolean) =>
  cn(
    "rounded-lg border bg-card p-2.5 text-card-foreground shadow-xs select-none [-webkit-touch-callout:none]",
    kunci ? "border-l-[3px] border-l-cermin" : "cursor-grab touch-manipulation hover:border-primary/40",
  );

function KartuPapan({ tugas: t }: { tugas: Tugas }) {
  const terkunci = useTerkunci();
  const kunci = terkunci(t);
  // kartu terkunci tidak bisa diseret, tetapi tetap menjadi posisi urut bagi kartu lain
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: t.id,
    disabled: { draggable: kunci, droppable: false },
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-uji="kartu-papan"
      data-id={t.id}
      data-terkunci={kunci ? "true" : undefined}
      className={cn(kelasKartu(kunci), isDragging && "opacity-35")}
    >
      <IsiKartu tugas={t} tautanRef={setActivatorNodeRef} petunjukSeret={kunci ? undefined : attributes["aria-describedby"]} />
    </li>
  );
}

type PropsIsi = {
  tugas: Tugas;
  /** keyboard (spasi) mengangkat kartu hanya dari tautan ini, bukan dari elemen lain di dalam kartu */
  tautanRef?: (el: HTMLElement | null) => void;
  /** id instruksi seret untuk pembaca layar */
  petunjukSeret?: string;
  /** salinan di DragOverlay: tanpa tautan (tidak bisa difokus) */
  statis?: boolean;
};

function IsiKartu({ tugas: t, tautanRef, petunjukSeret, statis }: PropsIsi) {
  const kelasNama = "flex min-h-11 items-center rounded-sm text-sm leading-snug font-semibold break-words";
  return (
    <>
      {statis ? (
        <span className={kelasNama}>{t.name}</span>
      ) : (
        <Link
          ref={tautanRef}
          href={`/t/${encodeURIComponent(t.id)}`}
          draggable={false}
          aria-describedby={petunjukSeret}
          className={cn(kelasNama, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
        >
          {t.name}
        </Link>
      )}
      <div className="mt-1.5">
        <MetaTugas tugas={t} tampilStatus={false} />
      </div>
    </>
  );
}

/** Kartu yang melayang mengikuti jari/penunjuk selama diseret (DragOverlay). */
export function KartuMelayang({ tugas }: { tugas: Tugas }) {
  return (
    <div aria-hidden className={cn(kelasKartu(false), "rotate-2 cursor-grabbing shadow-lg ring-1 ring-primary/30")}>
      <IsiKartu tugas={tugas} statis />
    </div>
  );
}
