"use client";

// Papan (Board): satu kolom per status (urut orderindex). Seret kartu antar kolom → status (web_ubah_tugas + versi),
// lalu urutan di antara tetangga (web_urut); seret dalam kolom → urutan. Sesudah setiap pindah, papan dimuat ulang.
// HP: tekan-tahan ±300 ms lalu geser (geser cepat = menggulir); papan digeser horizontal dengan snap yang dimatikan
// selama menyeret (snap "mandatory" membatalkan auto-scroll kecil ke kolom di luar layar). Desktop: seret mouse,
// kolom membagi lebar layar. Keyboard: spasi pada judul kartu mengangkat, panah memindah, spasi melepas.
import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type PointerSensorOptions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";

import { KartuMelayang, KolomPapan, statusDariIdKolom } from "@/features/list/kolom-papan";
import { usePindahKartu } from "@/features/list/queries";
import { kolomKartu, rencanaUrut, statusSelesai, susunanDari, urutStatus, type Susunan } from "@/features/list/urutan";
import { useTerkunci } from "@/features/profil/penyedia-profil";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { DaftarList, Tugas } from "@/types/domain";

/** Mouse/pena saja; sentuhan ditangani TouchSensor (tekan-tahan), supaya geser cepat di HP tetap menggulir. */
class SensorPenunjuk extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: e }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!e.isPrimary || e.button !== 0 || e.pointerType === "touch") return false;
        onActivation?.({ event: e });
        return true;
      },
    },
  ];
}

const PANAH = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/**
 * Panah keyboard selama kartu terangkat: kiri/kanan → kolom sebelah (dekat kartu yang setinggi, atau kolom kosong),
 * atas/bawah → kartu sebelumnya/berikutnya di kolom yang sama. (sortableKeyboardCoordinates bawaan ikut menimbang
 * droppable kolom sehingga panah kiri bisa berhenti di kolom sendiri.)
 */
const koordinatKeyboard: KeyboardCoordinateGetter = (event, { active, context: { collisionRect, droppableRects, droppableContainers } }) => {
  if (!PANAH.includes(event.code)) return undefined;
  event.preventDefault();
  if (!collisionRect) return undefined;
  const kolom: { id: UniqueIdentifier; r: ClientRect }[] = [];
  const kartu: { id: UniqueIdentifier; r: ClientRect }[] = [];
  for (const c of droppableContainers.getEnabled()) {
    const r = droppableRects.get(c.id);
    if (!r) continue;
    if (statusDariIdKolom(c.id) !== null) kolom.push({ id: c.id, r });
    else if (c.id !== active) kartu.push({ id: c.id, r });
  }
  const di = (r: ClientRect, k: ClientRect) => r.left >= k.left - 1 && r.right <= k.right + 1;
  const tengah = collisionRect.left + collisionRect.width / 2;
  const kini = kolom.find((k) => tengah >= k.r.left && tengah <= k.r.right);

  if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    const kanan = event.code === "ArrowRight";
    const acuan = kini?.r.left ?? collisionRect.left;
    const tujuan = kolom
      .filter((k) => (kanan ? k.r.left > acuan : k.r.left < acuan))
      .sort((a, b) => (kanan ? a.r.left - b.r.left : b.r.left - a.r.left))[0];
    if (!tujuan) return undefined;
    const isi = kartu.filter((x) => di(x.r, tujuan.r));
    if (!isi.length) return { x: tujuan.r.left, y: tujuan.r.top };
    const dekat = isi.reduce((a, b) => (Math.abs(b.r.top - collisionRect.top) < Math.abs(a.r.top - collisionRect.top) ? b : a));
    return { x: dekat.r.left, y: dekat.r.top };
  }

  if (!kini) return undefined;
  const bawah = event.code === "ArrowDown";
  const berikut = kartu
    .filter((x) => di(x.r, kini.r) && (bawah ? x.r.top > collisionRect.top + 1 : x.r.top < collisionRect.top - 1))
    .sort((a, b) => (bawah ? a.r.top - b.r.top : b.r.top - a.r.top))[0];
  return berikut ? { x: berikut.r.left, y: berikut.r.top } : undefined;
};

// Enter tetap membuka kartu (tautan); spasi mengangkat
const KODE_KEYBOARD = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };

// Auto-scroll saat kartu dibawa ke tepi papan/kolom. Bawaan dnd-kit (tepi 20%, percepatan 10 ≈ 1.500 px/dtk) terlalu
// cepat untuk papan HP 390 px: kolom sebelah langsung terlewati. Tepi 10% & percepatan 5 ≈ kecepatan SortableJS lama.
const GULIR_OTOMATIS = { threshold: { x: 0.1, y: 0.12 }, acceleration: 5 };

const INSTRUKSI = {
  draggable:
    "Tekan spasi untuk mengangkat kartu. Saat kartu terangkat, pakai tombol panah untuk memindahkannya ke kolom atau posisi lain. " +
    "Tekan spasi lagi untuk melepas, atau Escape untuk membatalkan.",
};

type Props = {
  data: DaftarList;
  /** kartu yang lolos filter assignee/status/due */
  tampak: Tugas[];
  /** filter "Tampilkan selesai": kartu kolom closed/done ikut tampil */
  tampilSelesai: boolean;
  adaFab: boolean;
};

export function Papan({ data, tampak, tampilSelesai, adaFab }: Props) {
  const terkunci = useTerkunci();
  const pindah = usePindahKartu();
  const hover = useMediaQuery("(hover: hover) and (pointer: fine)");

  const statuses = useMemo(() => urutStatus(data.list.statuses), [data.list.statuses]);
  const peta = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const dasar = useMemo(() => susunanDari(statuses, tampak, tampilSelesai), [statuses, tampak, tampilSelesai]);
  // susunan sementara selama menyeret & menyimpan (kartu sudah pindah kolom sebelum server menjawab)
  const [sementara, setSementara] = useState<Susunan | null>(null);
  const susunan = sementara ?? dasar;
  const [aktifId, setAktifId] = useState<string | null>(null);
  const asal = useRef<{ status: string; indeks: number } | null>(null);
  const atasTerakhir = useRef<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(SensorPenunjuk, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: koordinatKeyboard, keyboardCodes: KODE_KEYBOARD }),
  );

  // Penunjuk di dalam kolom → kolom itu; bila kolom berisi kartu, pilih kartu terdekat (pola multi-kontainer dnd-kit).
  const deteksi = useCallback<CollisionDetection>(
    (args) => {
      const dalam = pointerWithin(args);
      let idAtas = getFirstCollision(dalam.length ? dalam : rectIntersection(args), "id");
      if (idAtas != null) {
        const st = statusDariIdKolom(idAtas);
        const isi = st !== null ? (susunan[st] ?? []) : [];
        if (isi.length) {
          const dekat = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) => isi.includes(String(c.id))),
          });
          idAtas = dekat[0]?.id ?? idAtas;
        }
        atasTerakhir.current = idAtas;
        return [{ id: idAtas }];
      }
      return atasTerakhir.current != null ? [{ id: atasTerakhir.current }] : [];
    },
    [susunan],
  );

  const kolomDari = (id: UniqueIdentifier) => statusDariIdKolom(id) ?? kolomKartu(susunan, String(id)) ?? "";
  const nama = (id: UniqueIdentifier) => `"${peta.get(String(id))?.name ?? "kartu"}"`;
  const pengumuman: Announcements = {
    onDragStart: ({ active }) => `Kartu ${nama(active.id)} diangkat.`,
    onDragOver: ({ active, over }) =>
      over ? `Kartu ${nama(active.id)} di kolom ${kolomDari(over.id)}.` : `Kartu ${nama(active.id)} tidak berada di kolom mana pun.`,
    onDragEnd: ({ active, over }) =>
      over ? `Kartu ${nama(active.id)} dilepas di kolom ${kolomDari(over.id)}.` : `Kartu ${nama(active.id)} dilepas.`,
    onDragCancel: ({ active }) => `Seret dibatalkan. Kartu ${nama(active.id)} kembali ke tempat semula.`,
  };

  function saatMulai({ active }: DragStartEvent) {
    const id = String(active.id);
    const st = kolomKartu(dasar, id);
    asal.current = st ? { status: st, indeks: dasar[st].indexOf(id) } : null;
    atasTerakhir.current = null;
    setSementara(dasar);
    setAktifId(id);
  }

  // Kartu pindah ke kolom lain selama diseret (urutan dalam kolom diurus SortableContext sampai dilepas).
  function saatLewat({ active, over }: DragOverEvent) {
    if (!over) return;
    const id = String(active.id);
    const idAtas = String(over.id);
    const dariRect = active.rect.current.translated;
    setSementara((lama) => {
      const s = lama ?? dasar;
      const dari = kolomKartu(s, id);
      const ke = statusDariIdKolom(idAtas) ?? kolomKartu(s, idAtas);
      if (!dari || !ke || dari === ke) return lama;
      const isiKe = s[ke];
      let i = isiKe.indexOf(idAtas);
      if (i < 0) i = isiKe.length; // di atas kolom (kosong / kartunya disembunyikan) → paling bawah
      else if (dariRect && dariRect.top > over.rect.top + over.rect.height / 2) i += 1;
      return { ...s, [dari]: s[dari].filter((x) => x !== id), [ke]: [...isiKe.slice(0, i), id, ...isiKe.slice(i)] };
    });
  }

  function batal() {
    asal.current = null;
    setAktifId(null);
    setSementara(null);
  }

  async function saatSelesai({ active, over }: DragEndEvent) {
    const id = String(active.id);
    const a = asal.current;
    let akhir = sementara ?? dasar;
    const ke = kolomKartu(akhir, id);
    const t = peta.get(id);
    if (!over || !a || !ke || !t) return batal();
    // urutan akhir di dalam kolom (kartu dilepas di atas kartu lain di kolom yang sama)
    if (statusDariIdKolom(over.id) === null && kolomKartu(akhir, String(over.id)) === ke) {
      const iLama = akhir[ke].indexOf(id);
      const iBaru = akhir[ke].indexOf(String(over.id));
      if (iBaru >= 0 && iLama !== iBaru) akhir = { ...akhir, [ke]: arrayMove(akhir[ke], iLama, iBaru) };
    }
    const pindahKolom = a.status !== ke;
    if (!pindahKolom && akhir[ke].indexOf(id) === a.indeks) return batal();

    asal.current = null;
    setAktifId(null);
    setSementara(akhir);
    try {
      await pindah.mutateAsync({ tugas: t, ke, ...rencanaUrut(akhir[ke], id, peta, pindahKolom, terkunci) });
      toast.success(pindahKolom ? `Status: ${ke}` : "Urutan disimpan", { duration: 1800 });
    } catch (e) {
      toast.error(e instanceof GalatApi && e.konflik ? "Kartu sudah diubah orang lain. Papan dimuat ulang." : pesanGalat(e), {
        duration: 5000,
      });
    } finally {
      // mutasi selesai sesudah daftar dimuat ulang → susunan server sudah terbaru
      setSementara(null);
    }
  }

  const menyeret = aktifId !== null;
  const kartuAktif = aktifId ? peta.get(aktifId) : undefined;
  const kolomAktif = aktifId ? kolomKartu(susunan, aktifId) : undefined;

  return (
    <>
      {data.list.boleh_ubah ? (
        <p className="text-xs text-muted-foreground" data-uji="petunjuk">
          {hover ? "Seret kartu ke kolom lain untuk mengubah status." : "Tekan-tahan kartu, lalu geser ke kolom lain untuk mengubah status."}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={deteksi}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={GULIR_OTOMATIS}
        accessibility={{ announcements: pengumuman, screenReaderInstructions: INSTRUKSI }}
        onDragStart={saatMulai}
        onDragOver={saatLewat}
        onDragEnd={saatSelesai}
        onDragCancel={batal}
      >
        {/* tinggi = sisa layar (IsiHalaman flex kolom), min 320 px; kolom bergulir vertikal di dalamnya */}
        <div
          data-uji="papan"
          data-menyeret={menyeret ? "true" : undefined}
          aria-busy={pindah.isPending}
          className={cn(
            // relative: elemen absolut di dalam kolom (teks sr-only) tetap terpotong papan, tidak melebarkan halaman
            "relative -mx-4 flex min-h-80 grow basis-0 gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-2 scroll-px-4",
            "md:-mx-6 md:px-6 md:scroll-px-6",
            menyeret ? "snap-none" : "snap-x snap-mandatory md:snap-none",
          )}
        >
          {statuses.map((s) => {
            const jumlah = tampak.reduce((n, t) => n + (t.status === s.status ? 1 : 0), 0);
            return (
              <KolomPapan
                key={s.status}
                status={s}
                ids={susunan[s.status] ?? []}
                peta={peta}
                jumlah={jumlah}
                disembunyikan={statusSelesai(s) && !tampilSelesai ? jumlah : 0}
                sorot={menyeret && kolomAktif === s.status}
                kunciSemua={pindah.isPending}
                adaFab={adaFab}
              />
            );
          })}
        </div>
        <DragOverlay>{kartuAktif ? <KartuMelayang tugas={kartuAktif} /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
