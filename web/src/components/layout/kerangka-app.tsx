"use client";

// Kerangka layar yang butuh login. HP: konten + navigasi bawah (Saya · Jelajah · Cari · Menu).
// Desktop (≥ lg): sidebar kiri (navigasi + akun) + konten; sidebar bisa disembunyikan (layout/sidebar.tsx).
import { KeyRound, LogOut, Menu, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { NAV_LAIN, NAV_UTAMA, type ItemNav } from "@/components/layout/navigasi";
import { PetunjukTautan, useTautanMenunggu } from "@/components/layout/petunjuk-tautan";
import { usePelacakRiwayat } from "@/components/layout/riwayat";
import { fokusSesudahRender, PenyediaSidebar, PINTASAN_SIDEBAR, useSidebar } from "@/components/layout/sidebar";
import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { Lembar } from "@/components/umum/lembar";
import { useKeluar } from "@/features/auth/keluar";
import { usePipelineSaya } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { PenyimakRealtime } from "@/features/realtime/penyimak-realtime";
import { LABEL_PERAN } from "@/lib/konstanta";
import { cn } from "@/lib/utils";
import type { PipelineSaya } from "@/types/domain";

function KartuAkun() {
  const { member } = useProfil();
  return (
    <div className="flex items-center gap-3">
      <AvatarAnggota anggota={member} ukuran="besar" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{member.nama || member.username}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{member.email}</span>
          <Chip>{LABEL_PERAN[member.role]}</Chip>
        </div>
      </div>
    </div>
  );
}

/** Angka kecil (notifikasi belum dibaca) di item navigasi. */
function Angka({ n }: { n?: number }) {
  return n ? <span className="rounded-full bg-telat px-1.5 text-[11px] leading-5 font-bold text-white">{n > 99 ? "99+" : n}</span> : null;
}

// Isi item navigasi = turunan <Link> (useLinkStatus): saat diklik ikon & label LANGSUNG ber-warna aktif (sorotan
// optimistis) sebelum halaman tujuan selesai dimuat. aria-current tetap dari usePathname (halaman yang benar-benar tampil).
function IsiTautanSidebar({ item, angka }: { item: ItemNav; angka?: number }) {
  const menunggu = useTautanMenunggu();
  return (
    <>
      <item.Ikon className={cn("size-4.5", menunggu && "text-primary")} aria-hidden />
      <span className={cn("flex-1", menunggu && "text-primary")}>{item.label}</span>
      <Angka n={angka} />
      <PetunjukTautan className="inset-y-2 left-0 w-0.5" />
    </>
  );
}

function TautanSidebar({ item, path, angka }: { item: ItemNav; path: string; angka?: number }) {
  const aktif = item.cocok(path);
  return (
    <Link
      href={item.href}
      aria-current={aktif ? "page" : undefined}
      className={cn(
        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        aktif && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <IsiTautanSidebar item={item} angka={angka} />
    </Link>
  );
}

function IsiTautanBawah({ item }: { item: ItemNav }) {
  const menunggu = useTautanMenunggu();
  return (
    <>
      <item.Ikon className={cn("size-5", menunggu && "text-primary")} aria-hidden />
      <span className={cn(menunggu && "text-primary")}>{item.href === "/saya" ? "Saya" : item.label}</span>
      <PetunjukTautan className="inset-x-5 top-0 h-0.5" />
    </>
  );
}

function IsiTautanMenu({ item, angka }: { item: ItemNav; angka?: number }) {
  const menunggu = useTautanMenunggu();
  return (
    <>
      <item.Ikon className={cn("size-4.5", menunggu ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className={cn("flex-1", menunggu && "text-primary")}>{item.label}</span>
      <Angka n={angka} />
      <PetunjukTautan className="inset-y-3 left-0 w-0.5" />
    </>
  );
}

function Sidebar({ path, navUtama }: { path: string; navUtama: ItemNav[] }) {
  const { owner, profil } = useProfil();
  const keluar = useKeluar();
  const { terbuka, alih } = useSidebar();
  return (
    // Tersembunyi = lebar 0 (animasi lebar; isi tetap 16rem supaya tidak terjepit) + inert (tidak bisa difokus/dibaca) +
    // isi invisible SESUDAH animasi menutup (transisi visibility: tetap terlihat selama lebar menyusut).
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
        terbuka ? "w-64 border-r" : "w-0",
      )}
      aria-label="Navigasi utama"
      inert={!terbuka}
      data-uji="sidebar"
      data-terbuka={terbuka}
    >
      <div
        className={cn(
          "flex h-full w-64 flex-col",
          // transisi HANYA saat menutup: saat membuka harus langsung terlihat (fokus dipindah ke tombol di dalamnya)
          !terbuka && "invisible transition-[visibility] duration-200 motion-reduce:transition-none",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 pr-2 pl-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- ikon SVG kecil statis */}
          <img src="/icon.svg" alt="" className="size-7 rounded-md" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-bold">Anvil</div>
            <div className="truncate text-[11px] text-muted-foreground">PT Roda Hammerindo Jaya</div>
          </div>
          <button
            type="button"
            onClick={() => {
              alih();
              fokusSesudahRender("tampilkan-sidebar");
            }}
            aria-label="Sembunyikan sidebar"
            title={`Sembunyikan sidebar (${PINTASAN_SIDEBAR})`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            data-uji="sembunyikan-sidebar"
          >
            <PanelLeftClose className="size-4.5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {navUtama.map((item) => (
            <TautanSidebar key={item.href} item={item} path={path} />
          ))}
          <div className="my-3 border-t" />
          {NAV_LAIN.filter((i) => !i.ownerSaja || owner).map((item) => (
            <TautanSidebar key={item.href} item={item} path={path} angka={item.href === "/notif" ? profil.notif_belum : undefined} />
          ))}
        </nav>
        <div className="space-y-3 border-t p-4">
          <KartuAkun />
          <div className="grid grid-cols-2 gap-1">
            <Link href="/ganti-password" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium whitespace-nowrap hover:bg-muted">
              <KeyRound className="size-3.5" aria-hidden />
              Password
            </Link>
            <button
              type="button"
              onClick={() => keluar()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-telat hover:bg-telat-lembut"
              data-uji="keluar"
            >
              <LogOut className="size-3.5" aria-hidden />
              Keluar
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavBawah({ path, navUtama }: { path: string; navUtama: ItemNav[] }) {
  const { owner, profil } = useProfil();
  const keluar = useKeluar();
  const [menu, setMenu] = useState(false);
  // Lembar Menu ditutup SESUDAH halaman berganti (path berubah), bukan saat tautan diklik: tautannya tetap ter-mount
  // sehingga petunjuk menunggunya terlihat selama halaman tujuan dimuat. (Pola "sesuaikan state saat render".)
  const [pathMenu, setPathMenu] = useState(path);
  if (pathMenu !== path) {
    setPathMenu(path);
    setMenu(false);
  }
  // tautan ke halaman yang sedang tampil tidak mengganti path → tutup langsung
  const tutupBilaSama = (href: string) => () => {
    if (href === path) setMenu(false);
  };
  const kelasItem = "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground";
  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navigasi utama"
        data-uji="nav-bawah"
      >
        {navUtama.map((item) => {
          const aktif = item.cocok(path);
          return (
            <Link key={item.href} href={item.href} aria-current={aktif ? "page" : undefined} className={cn(kelasItem, aktif && "text-primary")}>
              <IsiTautanBawah item={item} />
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenu(true)} className={kelasItem} data-uji="tombol-menu">
          <Menu className="size-5" aria-hidden />
          Menu
        </button>
      </nav>
      <Lembar buka={menu} ubahBuka={setMenu} judul="Menu">
        <div className="space-y-4">
          <KartuAkun />
          <ul className="divide-y rounded-xl border">
            {NAV_LAIN.filter((i) => !i.ownerSaja || owner).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={tutupBilaSama(item.href)}
                  className="relative flex h-12 items-center gap-3 px-4 text-sm font-medium"
                  data-uji={`menu-${item.href.slice(1)}`}
                >
                  <IsiTautanMenu item={item} angka={item.href === "/notif" ? profil.notif_belum : undefined} />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/ganti-password" className="relative flex h-12 items-center gap-3 px-4 text-sm font-medium">
                <KeyRound className="size-4.5 text-muted-foreground" aria-hidden />
                Ganti password
                <PetunjukTautan className="inset-y-3 left-0 w-0.5" />
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  void keluar();
                }}
                className="flex h-12 w-full items-center gap-3 px-4 text-sm font-medium text-telat"
                data-uji="keluar"
              >
                <LogOut className="size-4.5" aria-hidden />
                Keluar
              </button>
            </li>
          </ul>
        </div>
      </Lembar>
    </>
  );
}

export function KerangkaApp({
  children,
  pipelineAwal,
  sidebarAwal = true,
}: {
  children: ReactNode;
  pipelineAwal?: PipelineSaya;
  /** sidebar desktop terbuka? (pilihan pengguna dari cookie, dibaca layout server) */
  sidebarAwal?: boolean;
}) {
  const path = usePathname();
  usePelacakRiwayat();
  // Gerbang menu Pipeline (§6): sembunyikan dari anggota tanpa akses modul. Halaman tetap digerbangi GerbangPipeline + RLS server.
  // pipelineAwal (dari layout server) mengisi cache sebelum render pertama: menu tidak bergeser dan GerbangPipeline
  // (turunan KerangkaApp) langsung lolos tanpa menunggu web_pipeline_saya dari browser.
  const aksesPipeline = usePipelineSaya(pipelineAwal);
  const { owner } = useProfil();
  const navUtama = NAV_UTAMA.filter((i) => (!i.pipelineSaja || !!aksesPipeline.data?.peran) && (!i.ownerSaja || owner));
  return (
    <PenyediaSidebar awal={sidebarAwal}>
      <div className="flex min-h-dvh">
        <a href="#isi" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-2">
          Lompat ke isi
        </a>
        <Sidebar path={path} navUtama={navUtama} />
        <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <main id="isi" className="flex min-w-0 flex-1 flex-col" tabIndex={-1}>
            {children}
          </main>
        </div>
        <NavBawah path={path} navUtama={navUtama} />
        <PenyimakRealtime />
      </div>
    </PenyediaSidebar>
  );
}
