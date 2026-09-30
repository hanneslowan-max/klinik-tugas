"use client";

// Tugas Saya: Telat · Hari ini · ≤3 hari kerja · Nanti · Tanpa due (web_tugas_saya). Bisa melihat anggota lain.
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
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

export function LayarSaya({ target }: { target: number | null }) {
  const router = useRouter();
  const { member } = useProfil();
  const idSaya = Number(member.id);
  const bukanSaya = target !== null && target !== idSaya;
  const anggota = useAnggotaAktif();

  const q = useQuery({
    queryKey: kunci.tugasSaya(bukanSaya ? target : null),
    queryFn: () => rpc(klienBrowser(), "web_tugas_saya", bukanSaya ? { p_member: target } : {}),
  });

  const judul = bukanSaya ? `Tugas ${q.data?.member?.username ?? ""}`.trim() : "Tugas Saya";
  const total = q.data ? GRUP.reduce((n, g) => n + (q.data[g.kunci]?.length ?? 0), 0) : 0;

  return (
    <>
      <KepalaHalaman judul={judul} />
      <IsiHalaman className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Tugas milik</span>
          <Select
            value={String(bukanSaya ? target : idSaya)}
            onValueChange={(v) => router.replace(Number(v) === idSaya ? "/saya" : `/saya?m=${v}`)}
          >
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
            {total === 0 ? <Kosong>Tidak ada kartu terbuka.</Kosong> : null}
            {GRUP.map((g) => {
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
            })}
          </>
        )}
      </IsiHalaman>
    </>
  );
}
