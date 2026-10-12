"use client";

// Kerangka layar yang butuh login. HP: konten + navigasi bawah (Saya · Jelajah · Cari · Menu).
// Desktop (≥ lg): sidebar kiri (navigasi + akun) + konten.
import { KeyRound, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { NAV_LAIN, NAV_UTAMA, type ItemNav } from "@/components/layout/navigasi";
import { usePelacakRiwayat } from "@/components/layout/riwayat";
import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { Lembar } from "@/components/umum/lembar";
import { useKeluar } from "@/features/auth/keluar";
import { usePipelineSaya } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { PenyimakRealtime } from "@/features/realtime/penyimak-realtime";
import { LABEL_PERAN } from "@/lib/konstanta";
import { cn } from "@/lib/utils";

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

function TautanSidebar({ item, path, angka }: { item: ItemNav; path: string; angka?: number }) {
  const aktif = item.cocok(path);
  return (
    <Link
      href={item.href}
      aria-current={aktif ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        aktif && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <item.Ikon className="size-4.5" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {angka ? <span className="rounded-full bg-telat px-1.5 text-[11px] leading-5 font-bold text-white">{angka > 99 ? "99+" : angka}</span> : null}
    </Link>
  );
}

function Sidebar({ path, navUtama }: { path: string; navUtama: ItemNav[] }) {
  const { owner, profil } = useProfil();
  const keluar = useKeluar();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex" aria-label="Navigasi utama">
      <div className="flex h-14 items-center gap-2.5 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- ikon SVG kecil statis */}
        <img src="/icon.svg" alt="" className="size-7 rounded-md" />
        <div className="leading-tight">
          <div className="text-sm font-bold">Anvil</div>
          <div className="text-[11px] text-muted-foreground">PT Roda Hammerindo Jaya</div>
        </div>
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
    </aside>
  );
}

function NavBawah({ path, navUtama }: { path: string; navUtama: ItemNav[] }) {
  const { owner, profil } = useProfil();
  const keluar = useKeluar();
  const [menu, setMenu] = useState(false);
  const kelasItem = "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground";
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
              <item.Ikon className="size-5" aria-hidden />
              {item.href === "/saya" ? "Saya" : item.label}
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
                  onClick={() => setMenu(false)}
                  className="flex h-12 items-center gap-3 px-4 text-sm font-medium"
                  data-uji={`menu-${item.href.slice(1)}`}
                >
                  <item.Ikon className="size-4.5 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/notif" && profil.notif_belum ? (
                    <span className="rounded-full bg-telat px-1.5 text-[11px] leading-5 font-bold text-white">{profil.notif_belum}</span>
                  ) : null}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/ganti-password" onClick={() => setMenu(false)} className="flex h-12 items-center gap-3 px-4 text-sm font-medium">
                <KeyRound className="size-4.5 text-muted-foreground" aria-hidden />
                Ganti password
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

export function KerangkaApp({ children }: { children: ReactNode }) {
  const path = usePathname();
  usePelacakRiwayat();
  // Gerbang menu Pipeline (§6): sembunyikan dari anggota tanpa akses modul. Halaman tetap digerbangi GerbangPipeline + RLS server.
  const aksesPipeline = usePipelineSaya();
  const navUtama = NAV_UTAMA.filter((i) => !i.pipelineSaja || !!aksesPipeline.data?.peran);
  return (
    <div className="flex min-h-dvh">
      <a href="#isi" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-2">
        Lompat ke isi
      </a>
      <Sidebar path={path} />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <main id="isi" className="flex min-w-0 flex-1 flex-col" tabIndex={-1}>
          {children}
        </main>
      </div>
      <NavBawah path={path} />
      <PenyimakRealtime />
    </div>
  );
}
