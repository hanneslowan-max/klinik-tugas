"use client";

// Dialog konfirmasi berbasis Promise: `if (!(await konfirmasi({ pesan }))) return;`
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OpsiKonfirmasi = { pesan: ReactNode; judul?: string; ya?: string; batal?: string; bahaya?: boolean };
type FungsiKonfirmasi = (opsi: OpsiKonfirmasi) => Promise<boolean>;

const Konteks = createContext<FungsiKonfirmasi | null>(null);

export function KonfirmasiProvider({ children }: { children: ReactNode }) {
  const [opsi, setOpsi] = useState<OpsiKonfirmasi | null>(null);
  const selesai = useRef<((v: boolean) => void) | null>(null);

  const konfirmasi = useCallback<FungsiKonfirmasi>(
    (o) =>
      new Promise<boolean>((resolve) => {
        selesai.current?.(false);
        selesai.current = resolve;
        setOpsi(o);
      }),
    [],
  );

  const tutup = (v: boolean) => {
    selesai.current?.(v);
    selesai.current = null;
    setOpsi(null);
  };

  return (
    <Konteks.Provider value={konfirmasi}>
      {children}
      <Dialog open={opsi !== null} onOpenChange={(b) => !b && tutup(false)}>
        <DialogContent role="alertdialog" showCloseButton={false} data-uji="dialog-konfirmasi">
          <DialogHeader>
            <DialogTitle>{opsi?.judul ?? "Konfirmasi"}</DialogTitle>
            <DialogDescription className="text-foreground">{opsi?.pesan}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => tutup(false)}>
              {opsi?.batal ?? "Batal"}
            </Button>
            <Button variant={opsi?.bahaya ? "destructive" : "default"} onClick={() => tutup(true)} data-uji="konfirmasi-ya">
              {opsi?.ya ?? "Ya"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Konteks.Provider>
  );
}

export function useKonfirmasi(): FungsiKonfirmasi {
  const k = useContext(Konteks);
  if (!k) throw new Error("useKonfirmasi di luar KonfirmasiProvider");
  return k;
}
