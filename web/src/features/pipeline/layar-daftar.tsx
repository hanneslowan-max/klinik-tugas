"use client";

// Layar "Lead saya" (§5): tab Semua / Diam >7 hari / Pallet Mesh / Penawaran, pencarian, tombol Lead baru.
// Rep default melihat leadnya sendiri; admin/baca default semua lead. Filter pemilik & tab disimpan di URL.
import { BarChart3, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogLeadBaru } from "@/features/pipeline/dialog-lead-baru";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { ringkasProduk, rupiah, TAB_DAFTAR } from "@/features/pipeline/konstanta";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { usePipelineDaftar } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { fmtTanggal, selisihHari } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { LeadRingkas } from "@/types/domain";

/** Status rencana follow-up relatif hari ini (tab "Follow up hari ini"). */
function infoFu(fu: string, hariIni: string): { teks: string; mendesak: boolean } {
  if (fu < hariIni) return { teks: `FU telat ${selisihHari(fu, hariIni)} hr`, mendesak: true };
  if (fu === hariIni) return { teks: "FU hari ini", mendesak: true };
  return { teks: `FU ${fmtTanggal(fu, hariIni)}`, mendesak: false };
}

function BarisLead({ lead, hariIni }: { lead: LeadRingkas; hariIni: string }) {
  const buka = lead.tahap === "BARU" || lead.tahap === "PENAWARAN";
  const panas = buka && lead.diam_hari > 7;
  const fu = buka && lead.fu_berikutnya ? infoFu(lead.fu_berikutnya, hariIni) : null;
  return (
    <Link
      href={`/pipeline/${encodeURIComponent(lead.id)}`}
      className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:bg-muted"
      data-uji="baris-lead"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{lead.pelanggan}</span>
          {lead.periksa ? <Chip nada="hari-ini">periksa</Chip> : null}
        </div>
        <div className="truncate text-sm text-muted-foreground">{ringkasProduk(lead.produk)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {lead.kode}
          {lead.kota ? ` · ${lead.kota}` : ""}
          {lead.pemilik_nama ? ` · ${lead.pemilik_nama}` : " · tanpa pemilik"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PilTahap tahap={lead.tahap} />
        {lead.tahap === "ORDER" ? (
          <span className="text-xs font-medium tabular-nums">{rupiah(lead.nilai_transaksi)}</span>
        ) : buka ? (
          <>
            {fu ? (
              <span className={cn("text-xs whitespace-nowrap", fu.mendesak ? "font-semibold text-telat" : "text-muted-foreground")}>
                {fu.teks}
              </span>
            ) : null}
            <span className={cn("text-xs tabular-nums", panas ? "font-semibold text-telat" : "text-muted-foreground")}>
              diam {lead.diam_hari} hr
            </span>
          </>
        ) : null}
      </div>
    </Link>
  );
}

function IsiDaftar({ akses }: { akses: AksesPipeline }) {
  const { member, hariIni } = useProfil();
  const idSaya = Number(member.id);
  const router = useRouter();
  const sp = useSearchParams();

  const tab = TAB_DAFTAR.find((t) => t.kunci === sp.get("tab"))?.kunci ?? "semua";
  // pemilik: ?m=<id> | "semua". Rep default ke dirinya; admin/baca default semua.
  const mParam = sp.get("m");
  const pemilik: number | null =
    mParam === "semua" ? null : mParam && /^\d+$/.test(mParam) ? Number(mParam) : akses.peran === "rep" ? idSaya : null;

  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState(qInput.trim());
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const [bukaBaru, setBukaBaru] = useState(false);

  const setParam = (kunci: string, nilai: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (nilai) p.set(kunci, nilai);
    else p.delete(kunci);
    const s = p.toString();
    router.replace(s ? `/pipeline?${s}` : "/pipeline");
  };

  const daftar = usePipelineDaftar({ tab, pemilik, q });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {akses.peran === "rep" ? (
          <div role="group" aria-label="Pemilik" className="inline-flex rounded-lg bg-muted p-[3px]">
            {[
              { k: null, label: "Lead saya" },
              { k: "semua", label: "Semua" },
            ].map((o) => {
              const aktif = o.k === null ? pemilik === idSaya : pemilik === null;
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => setParam("m", o.k === null ? null : "semua")}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
                    aktif ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {akses.boleh_ringkas ? (
            <Button asChild variant="outline">
              <Link href="/pipeline/ringkasan" data-uji="tautan-ringkasan">
                <BarChart3 aria-hidden />
                Ringkasan
              </Link>
            </Button>
          ) : null}
          {akses.bolehTulis ? (
            <Button onClick={() => setBukaBaru(true)} data-uji="tombol-lead-baru">
              <Plus aria-hidden />
              Lead baru
            </Button>
          ) : null}
        </div>
      </div>

      <div role="tablist" aria-label="Saring lead" className="flex gap-1.5 overflow-x-auto pb-1">
        {TAB_DAFTAR.map((t) => (
          <button
            key={t.kunci}
            role="tab"
            aria-selected={tab === t.kunci}
            onClick={() => setParam("tab", t.kunci === "semua" ? null : t.kunci)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
              tab === t.kunci
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Cari perusahaan / kode lead"
          className="pl-9"
          aria-label="Cari lead"
          data-uji="cari-lead"
        />
      </div>

      {daftar.isError ? (
        <GalatMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : daftar.isPending ? (
        <MemuatDaftar />
      ) : daftar.data.items.length === 0 ? (
        <Kosong>{q ? "Tidak ada lead yang cocok." : "Belum ada lead."}</Kosong>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{daftar.data.total} lead</p>
          <div className="space-y-2">
            {daftar.data.items.map((l) => (
              <BarisLead key={l.id} lead={l} hariIni={hariIni} />
            ))}
          </div>
        </>
      )}

      {akses.bolehTulis ? <DialogLeadBaru buka={bukaBaru} ubahBuka={setBukaBaru} /> : null}
    </div>
  );
}

export function LayarDaftar() {
  return (
    <>
      <KepalaHalaman judul="Pipeline" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline>{(akses) => <IsiDaftar akses={akses} />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
