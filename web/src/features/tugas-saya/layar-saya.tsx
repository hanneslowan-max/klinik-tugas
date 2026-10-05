"use client";

// Tugas Saya: Telat · Hari ini · ≤3 hari kerja · Nanti · Tanpa due (web_tugas_saya). Bisa melihat anggota lain.
// Dua tampilan (di URL ?v=board): Daftar (grup per tenggat) atau Papan (kolom per tenggat, seret untuk ubah tenggat).
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, List, SquareKanban } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
import { PapanSaya } from "@/features/tugas-saya/papan-saya";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtTanggal } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { TugasSaya } from "@/types/domain";

const GRUP = [
  { kunci: "telat", judul: "Telat", warna: "text-telat" },
  { kunci: "hari_ini", judul: "Hari ini", warna: "text-hari-ini" },
  { kunci: "tiga_hk", judul: "≤3 hari kerja", warna: "text-dekat" },
  { kunci: "nanti", judul: "Nanti", warna: "text-foreground" },
  { kunci: "tanpa_due", judul: "Tanpa due", warna: "text-muted-foreground", tutup: true },
] as const satisfies readonly { kunci: keyof TugasSaya; judul: string; warna: string; tutup?: boolean }[];

const TAB = [
  { board: false, label: "Daftar", Ikon: List, uji: "tab-daftar" },
  { board: true, label: "Papan", Ikon: SquareKanban, uji: "tab-board" },
] as const;

export function LayarSaya({ target }: { target: number | null }) {
  const router = useRouter();
  const { member } = useProfil();
  const idSaya = Number(member.id);
  const bukanSaya = target !== null && target !== idSaya;
  const anggota = useAnggotaAktif();
  const sp = useSearchParams();
  const board = sp.get("v") === "board";

  const hrefSaya = (m: number, keBoard: boolean) => {
    const p = new URLSearchParams();
    if (m !== idSaya) p.set("m", String(m));
    if (keBoard) p.set("v", "board");
    const s = p.toString();
    return s ? `/saya?${s}` : "/saya";
  };

  const q = useQuery({
    queryKey: kunci.tugasSaya(bukanSaya ? target : null),
    queryFn: () => rpc(klienBrowser(), "web_tugas_saya", bukanSaya ? { p_member: target } : {}),
  });

  const judul = bukanSaya ? `Tugas ${q.data?.member?.username ?? ""}`.trim() : "Tugas Saya";
  const total = q.data ? GRUP.reduce((n, g) => n + (q.data[g.kunci]?.length ?? 0), 0) : 0;
  const pemilik = bukanSaya ? target : idSaya;

  return (
    <>
      <KepalaHalaman judul={judul} />
      <IsiHalaman lebar={board} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Tugas milik</span>
          <Select value={String(pemilik)} onValueChange={(v) => router.replace(hrefSaya(Number(v), board))}>
            <SelectTrigger className="h-9 min-w-44" aria-label="Tugas milik" data-uji="pilih-pemilik">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(anggota.data ?? [{ id: idSaya, username: member.username }]).map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {Number(m.id) === idSaya ? `Saya (${m.username})` : m.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div role="tablist" aria-label="Tampilan" className="ml-auto inline-flex shrink-0 rounded-lg bg-muted p-[3px]">
            {TAB.map(({ board: b, label, Ikon, uji }) => (
              <Link
                key={label}
                role="tab"
                aria-selected={board === b}
                tabIndex={board === b ? 0 : -1}
                href={hrefSaya(pemilik, b)}
                replace
                data-uji={uji}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  board === b ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ikon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>

        {q.isPending ? (
          <MemuatDaftar />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {fmtTanggal(q.data.tanggal)} (WIB) · {total} kartu terbuka
            </p>
            {total === 0 ? (
              <Kosong>Tidak ada kartu terbuka.</Kosong>
            ) : board ? (
              <PapanSaya data={q.data} />
            ) : (
              GRUP.map((g) => {
                const isi = q.data[g.kunci] ?? [];
                if (!isi.length) return null;
                return (
                  <details key={g.kunci} open={!("tutup" in g && g.tutup)} className="group/grup" data-grup={g.kunci}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 py-2 select-none [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform group-open/grup:rotate-0" aria-hidden />
                      <span className={cn("text-sm font-semibold", g.warna)}>{g.judul}</span>
                      <span className="rounded-full bg-muted px-2 text-xs leading-5 font-semibold text-muted-foreground">{isi.length}</span>
                    </summary>
                    <DaftarTugas daftar={isi} tampilList />
                  </details>
                );
              })
            )}
          </>
        )}
      </IsiHalaman>
    </>
  );
}
