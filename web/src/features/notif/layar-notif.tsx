"use client";

// Notifikasi (assign, mention, komentar) milik sendiri, dipisah dua tab (revisi #2): "Dari tim" (anggota di web) dan
// "Dari agent" (akun bot "claude (agent)" atau lewat token API; aturan SQL notif_dari_agent). Tab ada di URL
// (?dari=agent, replaceState tanpa memuat ulang halaman); tiap tab memuat datanya sendiri (limit sendiri) dan
// menampilkan angka belum-dibacanya. "Tandai semua dibaca" (di bawah tab, bukan di kepala halaman) hanya untuk tab
// aktif. Lonceng tetap TOTAL semua tab.
// Membuka satu notifikasi / tandai dibaca langsung menurunkan angka lonceng, lalu disamakan dengan server (profil).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCheck, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { angkaNotif, bacaDari, belumTab, hrefNotif, tabLain, tandaiDibaca, tandaiTabDibaca } from "@/features/notif/dari";
import { KUNCI_PROFIL, useProfil, useSetNotifBelum } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif, fmtWaktu } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { DaftarNotif, DariNotif, Notifikasi } from "@/types/domain";

const JENIS: Record<Notifikasi["jenis"], string> = { assign: "menugaskan Anda", mention: "menyebut Anda", komentar: "berkomentar" };

/** Item per tab (server membatasi 1–500). */
const BATAS = 100;

const TAB_NOTIF = [
  { dari: "tim", label: "Dari tim", Ikon: Users, kosong: "Belum ada notifikasi dari tim." },
  { dari: "agent", label: "Dari agent", Ikon: Bot, kosong: "Belum ada notifikasi dari agent." },
] as const satisfies readonly { dari: DariNotif; label: string; Ikon: typeof Bot; kosong: string }[];

function ambilNotif(dari: DariNotif) {
  return rpc(klienBrowser(), "web_notif", { p_limit: BATAS, p_dari: dari });
}

/** Panah kiri/kanan memindah fokus antar-tab (pola tablist). */
function geserFokus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tab = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const i = tab.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  tab[(i + (e.key === "ArrowRight" ? 1 : tab.length - 1)) % tab.length]?.focus();
}

export function LayarNotif() {
  const qc = useQueryClient();
  const { hariIni } = useProfil();
  const setNotifBelum = useSetNotifBelum();
  const dari = bacaDari(useSearchParams());
  const lain = tabLain(dari);

  const q = useQuery({
    queryKey: kunci.notifDari(dari),
    queryFn: async () => {
      const r = await ambilNotif(dari);
      setNotifBelum(r.belum); // total semua tab = angka lonceng
      return r;
    },
    staleTime: 0,
  });
  // tab lain hanya dibaca dari cache (tidak memuat sendiri) → angka tab tetap tampil selama tab baru memuat
  const qLain = useQuery({ queryKey: kunci.notifDari(lain), queryFn: () => ambilNotif(lain), enabled: false });
  const hitung = q.data ?? qLain.data;

  // sesudah tab aktif termuat, siapkan tab satunya supaya pindah tab langsung tampil (paling sering sekali per menit)
  const siap = q.isSuccess;
  useEffect(() => {
    if (siap) void qc.prefetchQuery({ queryKey: kunci.notifDari(lain), queryFn: () => ambilNotif(lain), staleTime: 60_000 });
  }, [siap, lain, qc]);

  const baca = useMutation({
    mutationFn: (v: { ids: number[] | null; dari?: DariNotif }) =>
      rpc(klienBrowser(), "web_notif_baca", { p_ids: v.ids ?? undefined, p_dari: v.dari }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: kunci.notif }); // akar: kedua tab
      void qc.invalidateQueries({ queryKey: KUNCI_PROFIL });
    },
  });

  function gantiTab(d: DariNotif) {
    if (d === dari) return;
    // replaceState terintegrasi dengan router Next (useSearchParams ikut berubah) tanpa memuat ulang halaman server
    window.history.replaceState(null, "", hrefNotif(d));
  }

  function bacaSatu(n: Notifikasi) {
    if (n.read_at) return;
    // lonceng langsung turun (navigasi ke kartu tidak menunggu), lalu disamakan dengan server
    const kini = new Date().toISOString();
    qc.setQueryData<DaftarNotif>(kunci.notifDari(dari), (d) => (d ? tandaiDibaca(d, n.id, kini) : d));
    setNotifBelum(Math.max(0, (q.data?.belum ?? 1) - 1));
    baca.mutate({ ids: [n.id] });
  }

  function bacaSemua() {
    const tab = dari;
    const total = q.data?.belum ?? 0;
    baca.mutate(
      { ids: null, dari: tab },
      {
        onSuccess: (r) => {
          setNotifBelum(Math.max(0, total - r.dibaca));
          const kini = new Date().toISOString();
          qc.setQueryData<DaftarNotif>(kunci.notifDari(tab), (d) => (d ? tandaiTabDibaca(d, tab, r.dibaca, kini) : d));
          toast.success(`${r.dibaca} notifikasi dari ${tab} ditandai dibaca`);
        },
        onError: (e) => toast.error(pesanGalat(e)),
      },
    );
  }

  const tabAktif = TAB_NOTIF.find((t) => t.dari === dari) ?? TAB_NOTIF[0];
  const belumAktif = belumTab(q.data, dari);

  return (
    <>
      <KepalaHalaman judul="Notifikasi" kembali="/saya" />
      <IsiHalaman className="space-y-3">
        <div role="tablist" aria-label="Asal notifikasi" onKeyDown={geserFokus} className="flex rounded-lg bg-muted p-[3px]">
          {TAB_NOTIF.map(({ dari: d, label, Ikon }) => {
            const aktif = d === dari;
            const n = belumTab(hitung, d);
            return (
              <button
                key={d}
                type="button"
                role="tab"
                id={`tab-notif-${d}`}
                aria-selected={aktif}
                aria-controls="panel-notif"
                tabIndex={aktif ? 0 : -1}
                onClick={() => gantiTab(d)}
                data-uji={`tab-notif-${d}`}
                className={cn(
                  "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  aktif ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ikon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                {n > 0 ? (
                  <span
                    className="min-w-5 rounded-full bg-telat px-1.5 text-center text-[11px] leading-5 font-bold text-white"
                    data-uji={`angka-tab-notif-${d}`}
                  >
                    {angkaNotif(n)}
                    <span className="sr-only"> belum dibaca</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="panel-notif" aria-labelledby={`tab-notif-${dari}`} data-dari-aktif={dari} className="space-y-2">
          {/* aksi tab aktif saja (bukan di kepala halaman): judul tetap muat di HP dan jelas berlaku untuk tab ini */}
          <div className="flex min-h-8 items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" data-uji="ringkas-tab-notif">
              {q.data ? (belumAktif ? `${belumAktif} belum dibaca` : "Semua sudah dibaca") : null}
            </p>
            <Button variant="ghost" size="sm" disabled={!belumAktif || baca.isPending} onClick={bacaSemua}>
              <CheckCheck aria-hidden />
              Tandai semua dibaca
            </Button>
          </div>
          {q.isPending ? (
            <MemuatDaftar />
          ) : q.isError ? (
            <GalatMuat galat={q.error} ulang={() => q.refetch()} />
          ) : q.data.items.length === 0 ? (
            <Kosong>{tabAktif.kosong}</Kosong>
          ) : (
            <ul className="space-y-2" data-uji="daftar-notif">
              {q.data.items.map((n) => {
                const href = n.task ? `/t/${encodeURIComponent(n.task.id)}${n.comment_id ? `#c-${n.comment_id}` : ""}` : null;
                const isi = (
                  <>
                    <div className="text-sm leading-snug">
                      {n.read_at ? null : (
                        <Chip nada="info" className="mr-1.5" data-uji="notif-baru">
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {n.actor ? <AvatarAnggota anggota={n.actor} /> : null}
                      <span title={fmtWaktu(n.created_at)}>{fmtRelatif(n.created_at, hariIni)}</span>
                      {n.lewat_api && n.actor?.role !== "bot" ? (
                        <Chip nada="garis" title="Dikirim lewat token API (agent/CLI) atas nama anggota ini">
                          lewat API
                        </Chip>
                      ) : null}
                    </div>
                  </>
                );
                const kelas = cn("block rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted/40", !n.read_at && "border-info/30 bg-info-lembut/40");
                return (
                  <li key={n.id} data-notif={n.id} data-jenis={n.jenis} data-dari={n.dari}>
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
        </div>
      </IsiHalaman>
    </>
  );
}
