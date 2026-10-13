"use client";

// Papan Tugas Saya: satu kolom per kategori tenggat (Telat · Hari ini · ≤3 hari kerja · Nanti · Tanpa due).
// Menyeret kartu ke kolom lain mengubah tenggatnya (web_ubah_tugas due + cek versi) ke tanggal yang membuatnya masuk
// kolom itu (tenggatUntukKategori, konsisten dengan kategoriDue server). "Telat" bukan tujuan drop (tidak menjadwalkan
// ke masa lampau). Kartu ClickUp terkunci saat mode cermin → tidak bisa diseret. HP: tekan-tahan ±300 ms lalu geser
// (geser cepat = menggulir); papan digeser horizontal. Desktop: seret mouse, kolom membagi lebar. State lokal tidak
// dibangun ulang dari server selama menyeret supaya kartu tidak "lompat".
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { MetaTugas } from "@/features/tugas/baris-tugas";
import { useProfil, useTerkunci } from "@/features/profil/penyedia-profil";
import { aturTahanan } from "@/features/realtime/tahanan";
import { useUbahTugas } from "@/features/tugas/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { tenggatUntukKategori } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { KategoriDue, Tugas, TugasSaya } from "@/types/domain";

const KOLOM = [
  { kunci: "telat", judul: "Telat", warna: "text-telat", tujuan: false },
  { kunci: "hari_ini", judul: "Hari ini", warna: "text-hari-ini", tujuan: true },
  { kunci: "tiga_hk", judul: "≤3 hari kerja", warna: "text-dekat", tujuan: true },
  { kunci: "nanti", judul: "Nanti", warna: "text-foreground", tujuan: true },
  { kunci: "tanpa_due", judul: "Tanpa due", warna: "text-muted-foreground", tujuan: true },
] as const satisfies readonly { kunci: KategoriDue; judul: string; warna: string; tujuan: boolean }[];

type Peta = Record<KategoriDue, Tugas[]>;

function dariData(data: TugasSaya): Peta {
  return {
    telat: data.telat ?? [],
    hari_ini: data.hari_ini ?? [],
    tiga_hk: data.tiga_hk ?? [],
    nanti: data.nanti ?? [],
    tanpa_due: data.tanpa_due ?? [],
  };
}

function kategoriKartu(peta: Peta, id: string): KategoriDue | null {
  for (const k of KOLOM) if (peta[k.kunci].some((t) => t.id === id)) return k.kunci;
  return null;
}

export function PapanSaya({ data }: { data: TugasSaya }) {
  const { hariIni, libur } = useProfil();
  const terkunci = useTerkunci();
  const ubah = useUbahTugas();
  const [peta, setPeta] = useState<Peta>(() => dariData(data));
  const [aktif, setAktif] = useState<Tugas | null>(null);
  const [dataSebelum, setDataSebelum] = useState(data);
  const menyeret = aktif !== null;

  // Samakan dengan server saat data berubah, tetapi JANGAN selama menyeret (kartu bisa "lompat"). Pola "sesuaikan
  // state saat prop berubah" dijalankan saat render (bukan di effect) — https://react.dev/learn/you-might-not-need-an-effect
  if (data !== dataSebelum && !menyeret) {
    setDataSebelum(data);
    setPeta(dariData(data));
  }

  // tahan penyegaran realtime List selama menyeret, sejajar dengan Papan List
  useEffect(() => {
    aturTahanan("daftar", menyeret);
    return () => aturTahanan("daftar", false);
  }, [menyeret]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function mulai(e: DragStartEvent) {
    const id = String(e.active.id);
    const k = kategoriKartu(peta, id);
    setAktif(k ? (peta[k].find((t) => t.id === id) ?? null) : null);
  }

  async function selesai(e: DragEndEvent) {
    const kartu = aktif;
    setAktif(null);
    if (!kartu || !e.over) return;
    const dari = kategoriKartu(peta, kartu.id);
    const ke = e.over.id as KategoriDue;
    if (!dari || dari === ke || terkunci(kartu)) return;
    const tenggat = tenggatUntukKategori(ke, hariIni, libur);
    if (tenggat === undefined) return; // 'telat' bukan tujuan
    const judulKe = KOLOM.find((k) => k.kunci === ke)?.judul ?? ke;

    setPeta((p) => ({ ...p, [dari]: p[dari].filter((t) => t.id !== kartu.id), [ke]: [...p[ke], kartu] }));
    try {
      await ubah.mutateAsync({ id: kartu.id, versi: kartu.versi, body: { due: tenggat } });
      toast.success(`Tenggat "${kartu.name}" → ${judulKe}`);
    } catch (err) {
      setPeta(dariData(data)); // kembalikan; segarkanTugas (onSettled) lalu menyamakan dengan server
      toast.error(pesanGalat(err));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={mulai} onDragEnd={selesai} onDragCancel={() => setAktif(null)}>
      <div className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain pb-2" data-uji="papan-saya">
        {KOLOM.map((k) => (
          <Kolom key={k.kunci} kol={k} tugas={peta[k.kunci]} />
        ))}
      </div>
      <DragOverlay>
        {aktif ? (
          <div className={kelasKartu(false)}>
            <IsiKartu tugas={aktif} statis />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Kolom({ kol, tugas }: { kol: (typeof KOLOM)[number]; tugas: Tugas[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: kol.kunci, disabled: !kol.tujuan });
  return (
    <section
      ref={setNodeRef}
      data-kolom={kol.kunci}
      data-uji={`kolom-${kol.kunci}`}
      className={cn(
        "flex w-[17rem] shrink-0 snap-start flex-col rounded-xl border bg-muted/30 lg:w-auto lg:flex-1",
        kol.tujuan && isOver && "ring-2 ring-primary/50",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <span className={cn("text-sm font-semibold", kol.warna)}>{kol.judul}</span>
        <span className="rounded-full bg-muted px-2 text-xs leading-5 font-semibold text-muted-foreground">{tugas.length}</span>
      </header>
      <ul className="flex min-h-16 flex-col gap-2 px-2 pb-2" data-uji="isi-kolom">
        {tugas.map((t) => (
          <Kartu key={t.id} tugas={t} />
        ))}
        {tugas.length === 0 ? <li className="px-1 py-6 text-center text-xs text-muted-foreground">—</li> : null}
      </ul>
    </section>
  );
}

const kelasKartu = (kunci: boolean) =>
  cn(
    "rounded-lg border bg-card p-2.5 text-card-foreground shadow-xs select-none [-webkit-touch-callout:none]",
    kunci ? "border-l-[3px] border-l-cermin" : "cursor-grab touch-manipulation hover:border-primary/40",
  );

function Kartu({ tugas: t }: { tugas: Tugas }) {
  const terkunci = useTerkunci();
  const kunci = terkunci(t);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: t.id, disabled: kunci });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-id={t.id}
      data-uji="kartu-saya"
      data-terkunci={kunci ? "true" : undefined}
      className={cn(kelasKartu(kunci), isDragging && "opacity-35")}
    >
      <IsiKartu tugas={t} tautanRef={setActivatorNodeRef} petunjukSeret={kunci ? undefined : attributes["aria-describedby"]} />
    </li>
  );
}

function IsiKartu({
  tugas: t,
  tautanRef,
  petunjukSeret,
  statis,
}: {
  tugas: Tugas;
  tautanRef?: (el: HTMLElement | null) => void;
  petunjukSeret?: string;
  statis?: boolean;
}) {
  const kelasNama = "block min-h-11 rounded-sm text-sm leading-snug font-semibold break-words pointer-fine:min-h-7";
  return (
    <div className="space-y-1.5">
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
          <IsiTautan>{t.name}</IsiTautan>
        </Link>
      )}
      <MetaTugas tugas={t} tampilList />
    </div>
  );
}
