"use client";

// Lembar = dialog responsif: bottom sheet (vaul) di HP, dialog di tengah di desktop. Tombol aksi di kaki selalu
// terlihat (juga saat keyboard virtual terbuka; vaul memindah konten di atas keyboard).
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type Props = {
  buka: boolean;
  ubahBuka: (buka: boolean) => void;
  judul: ReactNode;
  deskripsi?: ReactNode;
  /** tombol aksi (Batal / Simpan) */
  kaki?: ReactNode;
  /** dialog lebar di desktop (form panjang) */
  lebar?: boolean;
  children?: ReactNode;
  className?: string;
  "data-uji"?: string;
};

export function Lembar({ buka, ubahBuka, judul, deskripsi, kaki, lebar, children, className, ...rest }: Props) {
  const desktop = useDesktop();

  if (desktop) {
    return (
      <Dialog open={buka} onOpenChange={ubahBuka}>
        <DialogContent
          className={cn("flex max-h-[85dvh] flex-col gap-0 p-0", lebar ? "sm:max-w-2xl" : "sm:max-w-lg", className)}
          data-uji={rest["data-uji"]}
        >
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="text-base">{judul}</DialogTitle>
            {deskripsi ? <DialogDescription>{deskripsi}</DialogDescription> : <DialogDescription className="sr-only">{judul}</DialogDescription>}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {/* m-0 membatalkan -mx-4/-mb-4 bawaan DialogFooter (dirancang utk konten p-4); di sini konten p-0 jadi footer harus flush, bukan mencuat keluar kartu. */}
          {kaki ? <DialogFooter className="m-0 border-t px-5 py-3">{kaki}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={buka} onOpenChange={ubahBuka} repositionInputs>
      <DrawerContent className={cn("max-h-[92dvh]", className)} data-uji={rest["data-uji"]}>
        <DrawerHeader className="border-b pb-3 text-left">
          <DrawerTitle className="text-base">{judul}</DrawerTitle>
          {deskripsi ? <DrawerDescription>{deskripsi}</DrawerDescription> : <DrawerDescription className="sr-only">{judul}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {kaki ? (
          <DrawerFooter className="flex-row justify-end gap-2 border-t pb-[max(1rem,env(safe-area-inset-bottom))]">{kaki}</DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Kaki lembar di DALAM isi (lengket di bawah area gulir) — untuk dialog yang state tombolnya ada di komponen isi.
 * Tetap terlihat saat keyboard virtual terbuka.
 */
export function KakiLembar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 -mb-3 mt-4 flex justify-end gap-2 border-t bg-popover px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:-mx-5 md:-mb-4 md:px-5 md:pb-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
