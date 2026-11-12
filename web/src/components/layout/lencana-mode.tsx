"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { useProfil } from "@/features/profil/penyedia-profil";

/** Lencana "Mode cermin" + penjelasannya. Tidak tampil di mode utama. */
export function LencanaMode() {
  const { cermin } = useProfil();
  const [buka, setBuka] = useState(false);
  if (!cermin) return null;
  return (
    <>
      {/* area sentuh 44px; pil yang terlihat lebih kecil */}
      <button type="button" onClick={() => setBuka(true)} className="inline-flex min-h-11 items-center px-0.5" data-uji="lencana-mode">
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-cermin-lembut px-2.5 text-xs font-semibold text-cermin">
          <Lock className="size-3" aria-hidden />
          Mode cermin
        </span>
      </button>
      <Lembar buka={buka} ubahBuka={setBuka} judul="Mode cermin" kaki={<Button onClick={() => setBuka(false)}>Mengerti</Button>}>
        <div className="space-y-2 text-sm">
          <p>Aplikasi sedang berjalan paralel dengan ClickUp. Selama mode cermin:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Kartu, komentar, dan lampiran yang berasal dari ClickUp hanya-baca di sini. Ubah di ClickUp; perubahan masuk
              lewat sinkron harian.
            </li>
            <li>Tugas buatan aplikasi (mis. di space latihan) tetap bisa diubah.</li>
            <li>Owner memindah ke mode utama saat cutover.</li>
          </ul>
        </div>
      </Lembar>
    </>
  );
}
