"use client";

// Isi satu kategori pekerjaan lintas list (web_tugas_kategori), dikelompokkan per tenggat seperti Tugas Saya: Telat ·
// Hari ini · ≤3 hari kerja · Nanti · Tanpa due · Menunggu keputusan · Tidak ditagih. Saring per orang (?m) dan
// tampilkan yang sudah selesai (?selesai=1) dibaca di klien & diganti lewat replaceState (gantiUrl), tanpa RSC.
// Tombol Tugas → form Tugas baru dengan pilihan list + kategori ini terisi.
import { ChevronDown, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { TANPA_KATEGORI, useIsiKategori, useKategoriKerja } from "@/features/kategori/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
import { DialogBuatTugas, pramuatFormBuatTugas, usePramuatFormBuatTugas } from "@/features/tugas/dialog-buat-tugas";
import { fmtTanggal } from "@/lib/tanggal";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { Tugas } from "@/types/domain";

const GRUP = [
  { kunci: "telat", judul: "Telat", warna: "text-telat" },
  { kunci: "hari_ini", judul: "Hari ini", warna: "text-hari-ini" },
  { kunci: "tiga_hk", judul: "≤3 hari kerja", warna: "text-dekat" },
  { kunci: "nanti", judul: "Nanti", warna: "text-foreground" },
  { kunci: "tanpa_due", judul: "Tanpa due", warna: "text-muted-foreground" },
  { kunci: "menunggu_keputusan", judul: "Menunggu keputusan", warna: "text-muted-foreground" },
  { kunci: "tidak_ditagih", judul: "Tidak ditagih", warna: "text-muted-foreground", tutup: true },
] as const;

const SEMUA = "semua";

function Grup({ uji, judul, warna, isi, tutup }: { uji: string; judul: string; warna: string; isi: Tugas[]; tutup?: boolean }) {
  return (
    <details open={!tutup} className="group/grup" data-grup={uji}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 select-none [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform group-open/grup:rotate-0" aria-hidden />
        <span className={cn("text-sm font-semibold", warna)}>{judul}</span>
        <span className="rounded-full bg-muted px-2 text-xs leading-5 font-semibold text-muted-foreground">{isi.length}</span>
      </summary>
      <DaftarTugas daftar={isi} tampilList />
    </details>
  );
}

export function LayarKategori({ id: idUrl }: { id: string }) {
  const router = useRouter();
  const { member } = useProfil();
  const sp = useSearchParams();
  const id = idUrl === TANPA_KATEGORI ? null : idUrl;
  const m = sp.get("m");
  const orang = m && /^\d+$/.test(m) ? Number(m) : null;
  const selesai = sp.get("selesai") === "1";
  const q = useIsiKategori(id, selesai);
  const daftarKategori = useKategoriKerja();
  const anggota = useAnggotaAktif();
  const [buatBuka, setBuatBuka] = useState(false);
  usePramuatFormBuatTugas(Boolean(q.data));

  const nama =
    id === null
      ? "Tanpa kategori"
      : (q.data?.kategori?.nama ?? daftarKategori.data?.kategori.find((k) => k.id === id)?.nama ?? "Kategori");

  const href = (o: number | null, s: boolean) => {
    const p = new URLSearchParams();
    if (o !== null) p.set("m", String(o));
    if (s) p.set("selesai", "1");
    const x = p.toString();
    return `/jelajah/${encodeURIComponent(idUrl)}${x ? `?${x}` : ""}`;
  };

  const saring = useMemo(
    () => (orang === null ? (t: Tugas) => Boolean(t) : (t: Tugas) => t.assignees.some((a) => Number(a.id) === orang)),
    [orang],
  );
  const terbuka = useMemo(() => (q.data ? q.data.tasks.filter(saring) : []), [q.data, saring]);
  const sudah = useMemo(() => (q.data?.selesai ? q.data.selesai.filter(saring) : []), [q.data, saring]);

  return (
    <>
      <KepalaHalaman judul={nama} kembali="/jelajah" />
      <IsiHalaman className="space-y-4 pb-28 lg:pb-24">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Tugas milik</span>
          <Select value={orang === null ? SEMUA : String(orang)} onValueChange={(v) => gantiUrl(href(v === SEMUA ? null : Number(v), selesai))}>
            <SelectTrigger className="h-9 min-w-44" aria-label="Tugas milik" data-uji="saring-orang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEMUA}>Semua orang</SelectItem>
              {(anggota.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {Number(a.id) === Number(member.id) ? `Saya (${a.username})` : a.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-pressed={selesai}
            onClick={() => gantiUrl(href(orang, !selesai))}
            data-uji="alih-selesai"
          >
            {selesai ? "Sembunyikan selesai" : `Tampilkan selesai${q.data ? ` (${q.data.jumlah_selesai})` : ""}`}
          </Button>
        </div>

        {q.isPending ? (
          <MemuatDaftar />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground" role="status">
              {fmtTanggal(q.data.tanggal)} (WIB) · {terbuka.length} tugas terbuka
            </p>
            {terbuka.length === 0 ? (
              <Kosong>{orang === null ? "Tidak ada tugas terbuka di kategori ini." : "Tidak ada tugas terbuka milik orang ini di kategori ini."}</Kosong>
            ) : (
              GRUP.map((g) => {
                const isi = terbuka.filter((t) => t.kategori_due === g.kunci);
                return isi.length ? (
                  <Grup key={g.kunci} uji={g.kunci} judul={g.judul} warna={g.warna} isi={isi} tutup={"tutup" in g && g.tutup} />
                ) : null;
              })
            )}
            {selesai ? (
              sudah.length ? (
                <Grup
                  uji="selesai"
                  judul={q.data.jumlah_selesai > (q.data.selesai?.length ?? 0) ? `Selesai (${q.data.selesai?.length} terakhir)` : "Selesai"}
                  warna="text-muted-foreground"
                  isi={sudah}
                />
              ) : (
                <Kosong>Belum ada tugas selesai.</Kosong>
              )
            ) : null}
          </>
        )}
      </IsiHalaman>

      <Button
        type="button"
        onClick={() => setBuatBuka(true)}
        onPointerDown={pramuatFormBuatTugas}
        onFocus={pramuatFormBuatTugas}
        data-uji="buat-tugas"
        className={cn(
          "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 h-13 gap-1.5 rounded-full px-5 text-base font-semibold shadow-lg",
          "lg:right-6 lg:bottom-6",
        )}
      >
        <Plus className="size-5" aria-hidden />
        <span className="sr-only">Buat </span>
        Tugas
      </Button>
      <DialogBuatTugas
        buka={buatBuka}
        ubahBuka={setBuatBuka}
        kategoriAwal={id}
        onDibuat={(t) => router.push(`/t/${encodeURIComponent(t.id)}`)}
      />
    </>
  );
}
