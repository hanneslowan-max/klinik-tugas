"use client";

// Deskripsi markdown: Lihat / Ubah / Pratinjau (markdown-it html:false + DOMPurify lewat <Markdown>).
// Deskripsi ClickUp yang tak terbaca (blok sinkron) tampil sebagai teks polos; mulai mengubah dari teks polos itu.
import { useId, useState } from "react";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Markdown } from "@/components/umum/teks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDetail, useTandaiEdit } from "@/features/detail/konteks";

type Mode = "lihat" | "edit" | "pratinjau";

const KELAS_KARTU = "rounded-xl border bg-card p-3 text-sm";

export function Deskripsi() {
  const { d, bolehUbah, ubah } = useDetail();
  const idJudul = useId();
  const [mode, setMode] = useState<Mode>("lihat");
  const [draf, setDraf] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const t = d.task;
  const isiMd = t.markdown ?? "";
  useTandaiEdit("deskripsi", bolehUbah && mode !== "lihat");

  const tampilan = t.desc_unreadable ? (
    <div className="space-y-2">
      <KotakPesan nada="info" data-uji="desk-tak-terbaca">
        Isi deskripsi tak terbaca dari ClickUp (blok sinkron). Teks polos:
      </KotakPesan>
      <div className={`${KELAS_KARTU} break-words whitespace-pre-wrap`}>{t.description_plain || "(kosong)"}</div>
    </div>
  ) : isiMd.trim() ? (
    <Markdown teks={isiMd} className={KELAS_KARTU} data-uji="desk-render" />
  ) : (
    <p className="text-sm text-muted-foreground italic">Belum ada deskripsi.</p>
  );

  if (!bolehUbah) {
    return (
      <section aria-labelledby={idJudul} className="space-y-2">
        <h3 id={idJudul} className="text-sm font-semibold">
          Deskripsi
        </h3>
        {tampilan}
      </section>
    );
  }

  function gantiMode(m: Mode) {
    if (m !== "lihat" && draf === null) setDraf(t.desc_unreadable ? t.description_plain || isiMd : isiMd);
    setMode(m);
  }

  function selesai() {
    setDraf(null);
    setMode("lihat");
  }

  async function simpan() {
    const v = draf ?? "";
    if (v === isiMd) return selesai();
    setSibuk(true);
    try {
      if (await ubah({ markdown_description: v }, "Deskripsi disimpan")) selesai();
    } finally {
      setSibuk(false);
    }
  }

  const tombol = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={selesai}>
        Batal
      </Button>
      <Button size="sm" disabled={sibuk} onClick={() => void simpan()} data-uji="desk-simpan">
        {sibuk ? "Menyimpan…" : "Simpan"}
      </Button>
    </div>
  );

  return (
    <section aria-labelledby={idJudul}>
      {/* manual: panah memindah fokus antar-tab, Enter/Spasi mengaktifkan (tab Ubah langsung memfokuskan editor) */}
      <Tabs value={mode} onValueChange={(v) => gantiMode(v as Mode)} activationMode="manual">
        <div className="flex min-h-11 flex-wrap items-center gap-2">
          <h3 id={idJudul} className="flex-1 text-sm font-semibold">
            Deskripsi
          </h3>
          <TabsList aria-label="Mode deskripsi">
            <TabsTrigger value="lihat" data-uji="desk-lihat" className="px-3">
              Lihat
            </TabsTrigger>
            <TabsTrigger value="edit" data-uji="desk-edit" className="px-3">
              Ubah
            </TabsTrigger>
            <TabsTrigger value="pratinjau" data-uji="desk-pratinjau" className="px-3">
              Pratinjau
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="lihat">{tampilan}</TabsContent>
        <TabsContent value="edit" className="space-y-2">
          <Textarea
            value={draf ?? ""}
            onChange={(e) => setDraf(e.target.value)}
            aria-label="Deskripsi (markdown)"
            data-uji="desk-teks"
            autoFocus
            className="max-h-[70dvh] min-h-50 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Markdown: **tebal**, _miring_, - daftar, [teks](https://…). HTML tidak dirender.</p>
          {tombol}
        </TabsContent>
        <TabsContent value="pratinjau" className="space-y-2">
          {draf?.trim() ? (
            <Markdown teks={draf} className={KELAS_KARTU} data-uji="desk-pratinjau" />
          ) : (
            <p className="text-sm text-muted-foreground italic" data-uji="desk-pratinjau">
              Belum ada deskripsi.
            </p>
          )}
          {tombol}
        </TabsContent>
      </Tabs>
    </section>
  );
}
