"use client";

// Kepala detail tugas: remah (space › folder › list), spanduk (mode cermin / Sampah / arsip), judul yang bisa
// diubah di tempat, baris ID (ID tugas, ID ClickUp lama, asal kartu) + salin tautan + menu aksi, kotak peringatan
// (B5 beban due, due akhir pekan / hari libur).
import { ChevronRight, Link2, Lock } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";

import { Chip } from "@/components/umum/chip";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAksiTugas } from "@/features/detail/aksi-tugas";
import { useDetail } from "@/features/detail/konteks";
import { MenuTugas } from "@/features/detail/menu-tugas";
import { useProfil } from "@/features/profil/penyedia-profil";
import { NAMA_HARI, fmtTanggal, fmtWaktu, hariDalamMinggu } from "@/lib/tanggal";

function Remah() {
  const { d } = useDetail();
  const t = d.task;
  const bagian = [t.space?.name, t.folder && !t.folder.hidden ? t.folder.name : null].filter((x): x is string => Boolean(x));
  return (
    <nav aria-label="Lokasi tugas" className="flex min-h-11 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      {bagian.map((b) => (
        <Fragment key={b}>
          <span>{b}</span>
          <ChevronRight className="size-3" aria-hidden />
        </Fragment>
      ))}
      <Link href={`/l/${encodeURIComponent(t.list.id)}`} className="inline-flex min-h-11 items-center font-medium hover:text-foreground hover:underline">
        {t.list.name}
      </Link>
    </nav>
  );
}

function Spanduk() {
  const { d } = useDetail();
  const { owner } = useProfil();
  const aksi = useAksiTugas();
  const t = d.task;
  return (
    <>
      {d.boleh.cermin ? (
        <KotakPesan nada="cermin" data-uji="spanduk-cermin">
          Mode cermin: kartu ini dari ClickUp dan hanya-baca sampai cutover. Ubah status, komentar, dan lampiran di ClickUp.
        </KotakPesan>
      ) : null}
      {t.deleted_at ? (
        <KotakPesan nada="peringatan" data-uji="spanduk-sampah">
          <p>
            Tugas ini ada di Sampah sejak {fmtWaktu(t.deleted_at)}
            {t.deleted_by ? ` (oleh ${t.deleted_by.username})` : ""}.
          </p>
          {owner ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void aksi.pulihkan()}>
                Pulihkan
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void aksi.purge()}>
                Hapus permanen
              </Button>
            </div>
          ) : null}
        </KotakPesan>
      ) : null}
      {t.archived ? (
        <KotakPesan nada="info" data-uji="spanduk-arsip">
          Tugas diarsipkan{t.archived_at ? ` ${fmtWaktu(t.archived_at)}` : ""}.
        </KotakPesan>
      ) : null}
    </>
  );
}

const KELAS_JUDUL = "text-xl leading-snug font-bold break-words md:text-2xl";

/** Judul tugas; bila boleh diubah: ketuk → input, Enter/keluar menyimpan, Esc membatalkan. */
function JudulTugas() {
  const { d, bolehUbah, ubah } = useDetail();
  const [edit, setEdit] = useState(false);
  const [teks, setTeks] = useState("");
  const tombolRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const kembaliFokus = useRef(false);
  const batal = useRef(false);
  const sibuk = useRef(false);
  const nama = d.task.name;

  useEffect(() => {
    if (edit) inputRef.current?.select();
    else if (kembaliFokus.current) {
      kembaliFokus.current = false;
      tombolRef.current?.focus();
    }
  }, [edit]);

  if (!bolehUbah) {
    return (
      <h2 className={KELAS_JUDUL} data-uji="judul-tugas">
        {nama}
      </h2>
    );
  }

  async function simpan() {
    if (sibuk.current) return;
    const v = teks.trim();
    if (batal.current) batal.current = false;
    else if (v && v !== nama) {
      sibuk.current = true;
      try {
        await ubah({ name: v }, "Nama disimpan");
      } finally {
        sibuk.current = false;
      }
    }
    setEdit(false);
  }

  if (edit) {
    return (
      <Input
        ref={inputRef}
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            kembaliFokus.current = true;
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            kembaliFokus.current = true;
            batal.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => void simpan()}
        autoFocus
        maxLength={500}
        aria-label="Nama tugas"
        data-uji="input-judul"
        className="h-auto min-h-11 py-1.5 text-xl font-bold md:text-2xl"
      />
    );
  }

  return (
    <h2 className={KELAS_JUDUL}>
      <button
        ref={tombolRef}
        type="button"
        title="Ketuk untuk mengubah nama"
        data-uji="judul-tugas"
        onClick={() => {
          setTeks(nama);
          setEdit(true);
        }}
        className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] cursor-text items-center rounded-md px-1 text-left hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {nama}
      </button>
    </h2>
  );
}

function BarisId() {
  const { d } = useDetail();
  const aksi = useAksiTugas();
  const t = d.task;
  const cermin = d.boleh.cermin;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <code title="ID tugas" data-uji="id-tugas" className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
        {t.id}
      </code>
      {t.clickup_id && t.clickup_id !== t.id ? (
        <code title="ID ClickUp lama" className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {t.clickup_id}
        </code>
      ) : null}
      {t.sumber === "clickup" ? (
        <Chip nada={cermin ? "cermin" : "garis"} title={cermin ? "Kartu ClickUp, hanya-baca selama mode cermin" : undefined}>
          {cermin ? <Lock aria-hidden /> : null}
          dari ClickUp
        </Chip>
      ) : null}
      {t.menunggu_keputusan ? <Chip nada="info">menunggu keputusan</Chip> : null}
      <span className="flex-1" />
      <Button variant="outline" size="sm" onClick={() => void aksi.salinTautan()} aria-label="Salin tautan tugas" data-uji="salin-tautan">
        <Link2 aria-hidden />
        Tautan
      </Button>
      <MenuTugas />
    </div>
  );
}

function KotakPeringatan() {
  const { d } = useDetail();
  const { hariIni } = useProfil();
  const t = d.task;
  if (t.selesai || t.deleted_at) return null;
  const p = d.peringatan;
  const isi: string[] = [];
  if (p.beban_lebih?.length) {
    isi.push(
      `B5: ${p.beban_lebih.join(", ")} sudah punya lebih dari 7 kartu due pada ${fmtTanggal(t.due_wib, hariIni)}. Pertimbangkan geser kartu prioritas terendah.`,
    );
  }
  if (p.due_akhir_pekan && t.due_wib) isi.push(`Due jatuh hari ${NAMA_HARI[hariDalamMinggu(t.due_wib)]} (akhir pekan). Cek hari kerja dulu.`);
  if (p.due_libur) isi.push(`Due jatuh di hari libur: ${p.due_libur}.`);
  if (!isi.length) return null;
  return (
    <KotakPesan nada="peringatan" judul="Peringatan" data-uji="peringatan">
      <ul className="list-disc space-y-0.5 pl-4">
        {isi.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </KotakPesan>
  );
}

export function KepalaDetail() {
  return (
    <div className="space-y-3">
      <div>
        <Remah />
        <div className="space-y-2">
          <Spanduk />
        </div>
      </div>
      <div className="space-y-1.5">
        <JudulTugas />
        <BarisId />
      </div>
      <KotakPeringatan />
    </div>
  );
}
