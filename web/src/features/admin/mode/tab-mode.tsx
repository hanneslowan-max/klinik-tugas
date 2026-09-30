"use client";

// Admin › Mode: cermin (masa paralel, kartu ClickUp hanya-baca) ↔ utama (sesudah cutover). Pindah ke UTAMA memakai
// konfirmasi kuat (ketik "utama"); kembali ke cermin cukup konfirmasi biasa. Sesudah berhasil, semua data
// disegarkan dan PenyediaProfil mengumumkan mode baru.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGantiMode } from "@/features/admin/queries";
import { KUNCI_PROFIL, useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { ModeAplikasi } from "@/types/domain";

const PENJELASAN: Record<ModeAplikasi, string> = {
  cermin: "masa paralel: data dari ClickUp hanya-baca di aplikasi; sinkron harian memperbarui.",
  utama: "setelah cutover: aplikasi jadi sumber utama; semua kartu bisa diubah.",
};

export function TabMode() {
  const { profil } = useProfil();
  const qc = useQueryClient();
  const [buka, setBuka] = useState(false);
  const mode = profil.mode;
  const target: ModeAplikasi = mode === "cermin" ? "utama" : "cermin";

  // mode bisa diubah owner lain → ambil profil terbaru saat tab dibuka (web lama: muatProfil)
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: KUNCI_PROFIL });
  }, [qc]);

  return (
    <section className="max-w-2xl space-y-4" aria-label="Mode aplikasi">
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <p className="text-sm">
          Mode sekarang:{" "}
          <strong className={cn("text-base", mode === "cermin" ? "text-cermin" : "text-sukses")} data-uji="mode-sekarang">
            {mode}
          </strong>
        </p>
        <ul className="space-y-2 text-sm">
          {(["cermin", "utama"] as const).map((m) => (
            <li
              key={m}
              className={cn("rounded-lg border px-3 py-2", m === mode ? "border-primary/40 bg-primary/5" : "text-muted-foreground")}
              aria-current={m === mode ? "true" : undefined}
            >
              <strong className="text-foreground">{m}</strong> = {PENJELASAN[m]}
            </li>
          ))}
        </ul>
        <Button variant={target === "utama" ? "destructive" : "default"} onClick={() => setBuka(true)} data-uji="ganti-mode">
          Pindah ke mode {target}
        </Button>
      </div>
      <DialogGantiMode buka={buka} ubahBuka={setBuka} target={target} />
    </section>
  );
}

function DialogGantiMode({ buka, ubahBuka, target }: { buka: boolean; ubahBuka: (b: boolean) => void; target: ModeAplikasi }) {
  return (
    <Dialog open={buka} onOpenChange={ubahBuka}>
      <DialogContent role="alertdialog" data-uji="dialog-ganti-mode">
        {buka ? <IsiGantiMode target={target} onSelesai={() => ubahBuka(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function IsiGantiMode({ target, onSelesai }: { target: ModeAplikasi; onSelesai: () => void }) {
  const ganti = useGantiMode();
  const idKetik = useId();
  const [ketik, setKetik] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const kuat = target === "utama";
  const boleh = !kuat || ketik.trim().toLowerCase() === "utama";

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    if (!boleh || ganti.isPending) return;
    setGalat(null);
    try {
      await ganti.mutateAsync(target);
      onSelesai();
    } catch (err) {
      setGalat(pesanGalat(err));
    }
  };

  return (
    <form onSubmit={kirim} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Ganti mode</DialogTitle>
        <DialogDescription className="text-foreground">
          {kuat
            ? "Pindah ke mode UTAMA? Lakukan hanya saat cutover (setelah sinkron akhir & hitungan selisih 0). Kartu ClickUp jadi bisa diubah di aplikasi."
            : "Kembali ke mode CERMIN? Kartu ClickUp kembali hanya-baca."}
        </DialogDescription>
      </DialogHeader>
      {kuat ? (
        <div className="space-y-1.5">
          <Label htmlFor={idKetik}>
            Ketik <strong className="font-mono">utama</strong> untuk melanjutkan
          </Label>
          <Input
            id={idKetik}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            data-uji="ketik-mode"
            autoFocus
          />
        </div>
      ) : null}
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="submit" variant={kuat ? "destructive" : "default"} disabled={!boleh || ganti.isPending} data-uji="konfirmasi-ya">
          {ganti.isPending ? "Memproses…" : `Ya, mode ${target}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
