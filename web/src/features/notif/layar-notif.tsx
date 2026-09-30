"use client";

// Notifikasi (assign, mention, komentar) milik sendiri. Membuka satu notifikasi / "Tandai semua dibaca" langsung
// menurunkan angka lonceng, lalu disamakan dengan server (profil).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { KUNCI_PROFIL, useProfil, useSetNotifBelum } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif, fmtWaktu } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { DaftarNotif, Notifikasi } from "@/types/domain";

const JENIS: Record<Notifikasi["jenis"], string> = { assign: "menugaskan Anda", mention: "menyebut Anda", komentar: "berkomentar" };

export function LayarNotif() {
  const qc = useQueryClient();
  const { hariIni } = useProfil();
  const setNotifBelum = useSetNotifBelum();

  const q = useQuery({
    queryKey: kunci.notif,
    queryFn: async () => {
      const r = await rpc(klienBrowser(), "web_notif", { p_limit: 100 });
      setNotifBelum(r.belum);
      return r;
    },
    staleTime: 0,
  });

  const baca = useMutation({
    mutationFn: (ids: number[] | null) => rpc(klienBrowser(), "web_notif_baca", { p_ids: ids ?? undefined }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: kunci.notif });
      void qc.invalidateQueries({ queryKey: KUNCI_PROFIL });
    },
  });

  function bacaSatu(n: Notifikasi) {
    if (n.read_at) return;
    // lonceng langsung turun (navigasi ke kartu tidak menunggu), lalu disamakan dengan server
    qc.setQueryData<DaftarNotif>(kunci.notif, (d) =>
      d ? { belum: Math.max(0, d.belum - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) } : d,
    );
    setNotifBelum(Math.max(0, (q.data?.belum ?? 1) - 1));
    baca.mutate([n.id]);
  }

  return (
    <>
      <KepalaHalaman
        judul="Notifikasi"
        kembali="/saya"
        aksi={
          <Button
            variant="ghost"
            size="sm"
            disabled={!q.data?.belum || baca.isPending}
            onClick={() =>
              baca.mutate(null, {
                onSuccess: (r) => {
                  setNotifBelum(0);
                  toast.success(`${r.dibaca} notifikasi ditandai dibaca`);
                },
                onError: (e) => toast.error(pesanGalat(e)),
              })
            }
          >
            Tandai semua dibaca
          </Button>
        }
      />
      <IsiHalaman>
        {q.isPending ? (
          <MemuatDaftar />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <Kosong>Belum ada notifikasi.</Kosong>
        ) : (
          <ul className="space-y-2" data-uji="daftar-notif">
            {q.data.items.map((n) => {
              const href = n.task ? `/t/${encodeURIComponent(n.task.id)}${n.comment_id ? `#c-${n.comment_id}` : ""}` : null;
              const isi = (
                <>
                  <div className="text-sm leading-snug">
                    {n.read_at ? null : (
                      <Chip nada="info" className="mr-1.5">
                        baru
                      </Chip>
                    )}
                    <span className="font-semibold">{n.actor ? n.actor.username : "Seseorang"}</span> {JENIS[n.jenis] ?? n.jenis}
                    {n.task ? (
                      <>
                        {" di "}
                        <span className="font-semibold">{n.task.name}</span>
                      </>
                    ) : null}
                    {n.task?.deleted ? " (di Sampah)" : ""}
                  </div>
                  {n.cuplikan ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">&ldquo;{n.cuplikan}&rdquo;</div> : null}
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {n.actor ? <AvatarAnggota anggota={n.actor} /> : null}
                    <span title={fmtWaktu(n.created_at)}>{fmtRelatif(n.created_at, hariIni)}</span>
                  </div>
                </>
              );
              const kelas = cn("block rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted/40", !n.read_at && "border-info/30 bg-info-lembut/40");
              return (
                <li key={n.id} data-notif={n.id} data-jenis={n.jenis}>
                  {href ? (
                    <Link href={href} className={kelas} onClick={() => bacaSatu(n)}>
                      {isi}
                    </Link>
                  ) : (
                    <button type="button" className={cn(kelas, "w-full text-left")} onClick={() => bacaSatu(n)}>
                      {isi}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </IsiHalaman>
    </>
  );
}
