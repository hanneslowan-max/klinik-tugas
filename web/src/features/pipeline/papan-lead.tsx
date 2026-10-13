"use client";

// Papan Pipeline (revisi Hannes 13 Okt 2026): satu kolom per kategori PRIBADI pengguna, yaitu "Tanpa kategori" (tetap,
// paling kiri) lalu kategori buatannya sendiri. Menyeret kartu lead ke kolom lain → web_pipeline_kategori_pindah
// (optimistis, useKategoriPindah). Ini hanya menyusun papan pengguna ini: tahap/pemilik/ringkasan lead TIDAK berubah
// dan pengguna lain tidak melihatnya. Kolom bisa ditambah, diganti nama, digeser kiri/kanan, dan dihapus (menu ⋯).
// Pola seret sama dengan Papan Tugas Saya: HP tekan-tahan ±300 ms lalu geser (geser cepat = menggulir), desktop seret
// mouse, keyboard spasi pada nama lead lalu panah kiri/kanan. Tiap kolom memuat 30 kartu dulu ("Tampilkan lagi")
// supaya ±2000 lead tetap ringan; kartu yang baru dipindah tampil paling atas di kolom tujuannya.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Check, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { Chip } from "@/components/umum/chip";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { infoFu, ringkasProduk, rupiah } from "@/features/pipeline/konstanta";
import { useKategoriPindah, useKategoriSimpan } from "@/features/pipeline/mutasi";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { LeadRingkas, PapanKategori } from "@/types/domain";

/** Kunci kolom "Tanpa kategori" (bukan id kategori: id kategori selalu berawalan "pk"). */
const TANPA = "tanpa";
const AWALAN_KOLOM = "kolom:";
const LANGKAH = 30;
const MAKS_KATEGORI = 30; // = public.pipeline_kategori_maks()

type Kolom = { kunci: string; nama: string };

const idKolom = (kunci: string) => `${AWALAN_KOLOM}${kunci}`;
function kunciDariId(id: UniqueIdentifier): string | null {
  const s = String(id);
  return s.startsWith(AWALAN_KOLOM) ? s.slice(AWALAN_KOLOM.length) : null;
}

// Penunjuk di dalam kolom → kolom itu (kolom sama tinggi, jadi area kosong di bawah kartu tetap kena). Keyboard tidak
// punya penunjuk → sudut terdekat.
const deteksi: CollisionDetection = (args) => {
  const dalam = pointerWithin(args);
  return dalam.length ? dalam : closestCorners(args);
};

// Panah kiri/kanan memindah kartu yang terangkat ke kolom sebelah (satu-satunya droppable = kolom).
const koordinatKeyboard: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers } }) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return undefined;
  event.preventDefault();
  if (!collisionRect) return undefined;
  const kanan = event.code === "ArrowRight";
  const tengah = collisionRect.left + collisionRect.width / 2;
  const tujuan = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r && (kanan ? r.left > tengah : r.right < tengah))
    .sort((a, b) => (kanan ? a.left - b.left : b.left - a.left))[0];
  return tujuan ? { x: tujuan.left + 8, y: collisionRect.top } : undefined;
};

// Enter tetap membuka lead (tautan); spasi mengangkat.
const KODE_KEYBOARD = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };

const INSTRUKSI = {
  draggable:
    "Tekan spasi untuk mengangkat kartu lead. Saat terangkat, pakai panah kiri/kanan untuk memindahkannya ke kategori lain. " +
    "Tekan spasi lagi untuk melepas, atau Escape untuk membatalkan.",
};

type Props = {
  leads: LeadRingkas[];
  papan: PapanKategori;
};

export function PapanLead({ leads, papan }: Props) {
  const pindah = useKategoriPindah();
  const [aktif, setAktif] = useState<LeadRingkas | null>(null);
  // lead yang baru dipindah (terbaru dulu): tampil paling atas di kolom tujuannya selama halaman terbuka
  const [baru, setBaru] = useState<string[]>([]);

  const kolom: Kolom[] = useMemo(
    () => [{ kunci: TANPA, nama: "Tanpa kategori" }, ...papan.kategori.map((k) => ({ kunci: k.id, nama: k.nama }))],
    [papan.kategori],
  );
  const namaKolom = useMemo(() => new Map(kolom.map((k) => [k.kunci, k.nama])), [kolom]);

  /** kunci kolom tempat lead berada (penempatan ke kategori yang sudah dihapus = Tanpa kategori) */
  const kolomLead = (id: string) => {
    const k = papan.posisi[id];
    return k && namaKolom.has(k) ? k : TANPA;
  };

  const isi = useMemo(() => {
    const peta = new Map<string, LeadRingkas[]>(kolom.map((k) => [k.kunci, []]));
    for (const l of leads) {
      const k = papan.posisi[l.id];
      peta.get(k && peta.has(k) ? k : TANPA)?.push(l);
    }
    if (baru.length) {
      const urut = new Map(baru.map((id, i) => [id, i]));
      const r = (id: string) => urut.get(id) ?? Number.MAX_SAFE_INTEGER;
      for (const daftar of peta.values()) daftar.sort((a, b) => r(a.id) - r(b.id)); // sort stabil: sisanya tetap urut daftar
    }
    return peta;
  }, [kolom, leads, papan.posisi, baru]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: koordinatKeyboard, keyboardCodes: KODE_KEYBOARD }),
  );

  const leadDari = (id: UniqueIdentifier) => leads.find((l) => l.id === String(id));
  const pengumuman: Announcements = {
    onDragStart: ({ active }) => `Lead ${leadDari(active.id)?.pelanggan ?? ""} diangkat.`,
    onDragOver: ({ over }) => {
      const k = over ? kunciDariId(over.id) : null;
      return k ? `Di atas kategori ${namaKolom.get(k) ?? ""}.` : "Tidak di atas kategori.";
    },
    onDragEnd: ({ active, over }) => {
      const k = over ? kunciDariId(over.id) : null;
      return k ? `Lead ${leadDari(active.id)?.pelanggan ?? ""} dipindah ke ${namaKolom.get(k) ?? ""}.` : "Pindah dibatalkan.";
    },
    onDragCancel: () => "Pindah dibatalkan.",
  };

  function mulai(e: DragStartEvent) {
    setAktif(leadDari(e.active.id) ?? null);
  }

  function selesai(e: DragEndEvent) {
    const lead = aktif;
    setAktif(null);
    if (!lead || !e.over) return;
    const ke = kunciDariId(e.over.id);
    if (ke === null || ke === kolomLead(lead.id)) return;
    setBaru((b) => [lead.id, ...b.filter((x) => x !== lead.id)]);
    pindah.mutate(
      { lead_id: lead.id, kategori_id: ke === TANPA ? null : ke },
      { onError: (err) => toast.error(`Gagal memindah "${lead.pelanggan}": ${pesanGalat(err)}`) },
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={deteksi}
      onDragStart={mulai}
      onDragEnd={selesai}
      onDragCancel={() => setAktif(null)}
      accessibility={{ announcements: pengumuman, screenReaderInstructions: INSTRUKSI }}
    >
      <div
        // relative: elemen sr-only (absolute) di kolom luar layar ikut terpotong wadah gulir, tidak melebarkan halaman HP
        className={cn("relative flex gap-3 overflow-x-auto overscroll-x-contain pb-2", aktif ? "snap-none" : "snap-x")}
        data-uji="papan-lead"
      >
        {kolom.map((k, i) => (
          <KolomLead
            key={k.kunci}
            kolom={k}
            leads={isi.get(k.kunci) ?? []}
            urutanKategori={papan.kategori.map((x) => x.id)}
            indeks={i - 1}
          />
        ))}
        <TambahKategori penuh={papan.kategori.length >= MAKS_KATEGORI} />
      </div>
      <DragOverlay>
        {aktif ? (
          <div aria-hidden className="cursor-grabbing">
            <div className={cn(kelasKartu, "rotate-2 shadow-lg ring-1 ring-primary/30")}>
              <IsiKartu lead={aktif} statis />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// -------------------------------------------------------------------- kolom

type PropsKolom = {
  kolom: Kolom;
  leads: LeadRingkas[];
  /** id kategori urut kiri→kanan (untuk geser) */
  urutanKategori: string[];
  /** posisi kolom di antara kategori (−1 = Tanpa kategori) */
  indeks: number;
};

function KolomLead({ kolom, leads, urutanKategori, indeks }: PropsKolom) {
  const { setNodeRef, isOver } = useDroppable({ id: idKolom(kolom.kunci) });
  const [batas, setBatas] = useState(LANGKAH);
  const sisa = leads.length - batas;
  return (
    <section
      ref={setNodeRef}
      data-uji="kolom-kategori"
      data-kolom={kolom.kunci}
      aria-label={`Kategori ${kolom.nama}`}
      className={cn(
        "flex w-[17rem] shrink-0 snap-start flex-col rounded-xl border bg-muted/30 md:w-72",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      {kolom.kunci === TANPA ? (
        <header className="flex min-h-11 items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">{kolom.nama}</span>
          <Jumlah n={leads.length} />
        </header>
      ) : (
        <KepalaKategori kolom={kolom} jumlah={leads.length} urutanKategori={urutanKategori} indeks={indeks} />
      )}
      <ul className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2" data-uji="isi-kolom-kategori">
        {leads.slice(0, batas).map((l) => (
          <KartuLead key={l.id} lead={l} />
        ))}
        {leads.length === 0 ? (
          <li className="px-1 py-6 text-center text-xs text-muted-foreground">Seret lead ke sini</li>
        ) : null}
      </ul>
      {sisa > 0 ? (
        <button
          type="button"
          onClick={() => setBatas((b) => b + LANGKAH)}
          className="mx-2 mb-2 rounded-md py-2 text-xs font-medium text-primary hover:bg-muted"
          data-uji="tampil-lagi"
        >
          Tampilkan {Math.min(LANGKAH, sisa)} lagi (sisa {sisa})
        </button>
      ) : null}
    </section>
  );
}

function Jumlah({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-muted px-2 text-xs leading-5 font-semibold text-muted-foreground">
      {n}
      <span className="sr-only"> lead</span>
    </span>
  );
}

function KepalaKategori({ kolom, jumlah, urutanKategori, indeks }: { kolom: Kolom; jumlah: number; urutanKategori: string[]; indeks: number }) {
  const simpan = useKategoriSimpan();
  const konfirmasi = useKonfirmasi();
  const [ubah, setUbah] = useState(false);
  // "Ganti nama" dari menu: jangan kembalikan fokus ke tombol ⋯ (fokus harus tetap di input nama)
  const keInput = useRef(false);

  const geser = (arah: -1 | 1) => {
    const ids = [...urutanKategori];
    const j = indeks + arah;
    if (j < 0 || j >= ids.length) return;
    [ids[indeks], ids[j]] = [ids[j], ids[indeks]];
    simpan.mutate({ aksi: "urut", ids }, { onError: (e) => toast.error(pesanGalat(e)) });
  };

  const hapus = async () => {
    const ok = await konfirmasi({
      judul: "Hapus kategori",
      pesan: (
        <>
          Kategori <b>{kolom.nama}</b> dihapus dari papan Anda.
          {jumlah ? ` ${jumlah} lead di dalamnya kembali ke "Tanpa kategori".` : ""} Data lead tidak berubah.
        </>
      ),
      ya: "Hapus",
      bahaya: true,
    });
    if (!ok) return;
    try {
      await simpan.mutateAsync({ aksi: "hapus", id: kolom.kunci });
      toast.success(`Kategori "${kolom.nama}" dihapus`);
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  if (ubah) {
    return (
      <div className="px-2 py-1.5">
        <FormNama
          awal={kolom.nama}
          label={`Ganti nama kategori ${kolom.nama}`}
          menyimpan={simpan.isPending}
          batal={() => setUbah(false)}
          simpan={async (nama) => {
            if (nama === kolom.nama) return setUbah(false);
            try {
              await simpan.mutateAsync({ aksi: "ganti_nama", id: kolom.kunci, nama });
              setUbah(false);
            } catch (e) {
              toast.error(pesanGalat(e));
            }
          }}
        />
      </div>
    );
  }

  return (
    <header className="flex min-h-11 items-center gap-2 py-1 pr-1 pl-3">
      {/* klik dua kali = pintas desktop; jalur utama (juga HP & keyboard) = menu ⋯ → Ganti nama */}
      <span
        onDoubleClick={() => setUbah(true)}
        className="min-w-0 flex-1 truncate text-sm font-semibold"
        title="Klik dua kali untuk ganti nama"
        data-uji="nama-kategori"
      >
        {kolom.nama}
      </span>
      <Jumlah n={jumlah} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Aksi kategori ${kolom.nama}`} className="pointer-coarse:size-11" data-uji="menu-kategori">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-44"
          onCloseAutoFocus={(e) => {
            if (keInput.current) e.preventDefault();
            keInput.current = false;
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              keInput.current = true;
              setUbah(true);
            }}
            data-uji="aksi-ganti-nama"
          >
            <Pencil aria-hidden />
            Ganti nama
          </DropdownMenuItem>
          <DropdownMenuItem disabled={indeks <= 0} onSelect={() => geser(-1)} data-uji="aksi-geser-kiri">
            <ArrowLeft aria-hidden />
            Geser ke kiri
          </DropdownMenuItem>
          <DropdownMenuItem disabled={indeks >= urutanKategori.length - 1} onSelect={() => geser(1)} data-uji="aksi-geser-kanan">
            <ArrowRight aria-hidden />
            Geser ke kanan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void hapus()} data-uji="aksi-hapus-kategori">
            <Trash2 aria-hidden />
            Hapus kategori
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function TambahKategori({ penuh }: { penuh: boolean }) {
  const simpan = useKategoriSimpan();
  const [buka, setBuka] = useState(false);
  return (
    <div className="w-[17rem] shrink-0 snap-start md:w-72">
      {buka ? (
        <div className="rounded-xl border bg-muted/30 p-2">
          <FormNama
            awal=""
            label="Nama kategori baru"
            placeholder="Nama kategori, mis. Prioritas"
            menyimpan={simpan.isPending}
            batal={() => setBuka(false)}
            simpan={async (nama) => {
              try {
                await simpan.mutateAsync({ aksi: "buat", nama });
                setBuka(false);
              } catch (e) {
                toast.error(pesanGalat(e));
              }
            }}
          />
        </div>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full justify-start border-dashed text-muted-foreground"
          onClick={() => setBuka(true)}
          disabled={penuh}
          title={penuh ? `Maksimal ${MAKS_KATEGORI} kategori` : undefined}
          data-uji="tambah-kategori"
        >
          <Plus aria-hidden />
          Tambah kategori
        </Button>
      )}
    </div>
  );
}

function FormNama({
  awal,
  label,
  placeholder,
  menyimpan,
  simpan,
  batal,
}: {
  awal: string;
  label: string;
  placeholder?: string;
  menyimpan: boolean;
  simpan: (nama: string) => void;
  batal: () => void;
}) {
  const [nama, setNama] = useState(awal);
  const rapi = nama.replace(/\s+/g, " ").trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (rapi && !menyimpan) simpan(rapi);
      }}
      className="flex items-center gap-1"
    >
      <Input
        autoFocus
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            batal();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        maxLength={40}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 min-w-0 flex-1"
        data-uji="input-kategori"
      />
      <Button type="submit" size="icon" className="size-9 shrink-0" disabled={!rapi || menyimpan} aria-label="Simpan" data-uji="simpan-kategori">
        <Check aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={batal} aria-label="Batal">
        <X aria-hidden />
      </Button>
    </form>
  );
}

// -------------------------------------------------------------------- kartu

const kelasKartu =
  "rounded-lg border bg-card p-2.5 text-card-foreground shadow-xs select-none [-webkit-touch-callout:none] cursor-grab touch-manipulation hover:border-primary/40";

function KartuLead({ lead }: { lead: LeadRingkas }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-id={lead.id}
      data-uji="kartu-lead"
      className={cn(kelasKartu, isDragging && "opacity-35")}
    >
      <IsiKartu lead={lead} tautanRef={setActivatorNodeRef} petunjukSeret={attributes["aria-describedby"]} />
    </li>
  );
}

function IsiKartu({
  lead: l,
  tautanRef,
  petunjukSeret,
  statis,
}: {
  lead: LeadRingkas;
  tautanRef?: (el: HTMLElement | null) => void;
  petunjukSeret?: string;
  statis?: boolean;
}) {
  const { hariIni } = useProfil();
  const buka = l.tahap === "BARU" || l.tahap === "PENAWARAN";
  const fu = buka && l.fu_berikutnya ? infoFu(l.fu_berikutnya, hariIni) : null;
  const panas = buka && l.diam_hari > 7;
  // HP: nama = sasaran sentuh ≥44 px, teks di tengah (bukan celah kosong di bawahnya)
  const kelasNama = "flex min-h-11 min-w-0 flex-1 items-center rounded-sm text-sm leading-snug font-semibold break-words pointer-fine:min-h-0";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {statis ? (
          <span className={kelasNama}>{l.pelanggan}</span>
        ) : (
          <Link
            ref={tautanRef}
            href={`/pipeline/${encodeURIComponent(l.id)}`}
            draggable={false}
            aria-describedby={petunjukSeret}
            className={cn(kelasNama, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
          >
            <IsiTautan className="min-w-0">{l.pelanggan}</IsiTautan>
          </Link>
        )}
        <PilTahap tahap={l.tahap} className="shrink-0" />
      </div>
      <div className="truncate text-xs text-muted-foreground">{ringkasProduk(l.produk)}</div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{l.kode}</span>
        <span className="min-w-0 truncate">{l.pemilik_nama ?? "tanpa pemilik"}</span>
        {l.periksa ? <Chip nada="hari-ini">periksa</Chip> : null}
        {l.tahap === "ORDER" ? <span className="font-medium text-foreground tabular-nums">{rupiah(l.nilai_transaksi)}</span> : null}
        {fu ? <span className={cn("whitespace-nowrap", fu.mendesak && "font-semibold text-telat")}>{fu.teks}</span> : null}
        {buka ? <span className={cn("tabular-nums", panas && "font-semibold text-telat")}>diam {l.diam_hari} hr</span> : null}
      </div>
    </div>
  );
}
