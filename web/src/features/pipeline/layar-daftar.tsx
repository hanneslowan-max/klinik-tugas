"use client";

// Layar "Lead saya" (§5): tab Semua / Diam >7 hari / Pallet Mesh / Penawaran, pencarian, tombol Lead baru.
// Rep default melihat leadnya sendiri; admin/baca default semua lead. Filter pemilik & tab disimpan di URL.
// Dua tampilan (?v=papan): Daftar, atau Papan = kolom kategori PRIBADI pengguna, lead diseret antar kolom (papan-lead).
// Tab Order (revisi #3–#7): rekap & tabel order per bulan SP (daftar-order). Saringan status + tanggal (?st, dari, sampai)
// disaring di klien di atas hasil cari server (saringan-lead).
import { BarChart3, List, Plus, Search, ShieldCheck, SquareKanban } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DaftarOrder } from "@/features/pipeline/daftar-order";
import { DialogLeadBaru } from "@/features/pipeline/dialog-lead-baru";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { infoFu, ringkasProduk, rupiah, TAB_DAFTAR } from "@/features/pipeline/konstanta";
import { bulanTersedia, saringLead, type SaringanLead as NilaiSaringan } from "@/features/pipeline/order";
import { PapanLead } from "@/features/pipeline/papan-lead";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { usePipelineDaftar, usePipelineKategori } from "@/features/pipeline/queries";
import { opsiStatus, SaringanLead, tanggalSah } from "@/features/pipeline/saringan-lead";
import { useProfil } from "@/features/profil/penyedia-profil";
import { cn } from "@/lib/utils";
import type { LeadRingkas } from "@/types/domain";

const TAMPILAN = [
  { papan: false, label: "Daftar", Ikon: List, uji: "tab-daftar-lead" },
  { papan: true, label: "Papan", Ikon: SquareKanban, uji: "tab-papan-lead" },
] as const;

function BarisLead({ lead, hariIni, kategori }: { lead: LeadRingkas; hariIni: string; kategori?: string }) {
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
          {kategori ? (
            <Chip nada="garis" className="min-w-0 shrink truncate" data-uji="chip-kategori">
              {kategori}
            </Chip>
          ) : null}
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
  const { member, hariIni, owner } = useProfil();
  const idSaya = Number(member.id);
  const router = useRouter();
  const sp = useSearchParams();

  const tab = TAB_DAFTAR.find((t) => t.kunci === sp.get("tab"))?.kunci ?? "semua";
  const papan = sp.get("v") === "papan";
  const modeOrder = tab === "order";
  // nilai URL yang tidak sah untuk tab ini diabaikan (bukan mengosongkan daftar diam-diam)
  const stUrl = sp.get("st");
  const saringan: NilaiSaringan = {
    status: stUrl && opsiStatus(tab).some((o) => o.v === stUrl) ? stUrl : null,
    dari: tanggalSah(sp.get("dari")),
    sampai: tanggalSah(sp.get("sampai")),
  };
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

  const hrefParams = (ubah: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [kunci, nilai] of Object.entries(ubah)) {
      if (nilai) p.set(kunci, nilai);
      else p.delete(kunci);
    }
    const s = p.toString();
    return s ? `/pipeline?${s}` : "/pipeline";
  };
  const hrefParam = (kunci: string, nilai: string | null) => hrefParams({ [kunci]: nilai });
  const setParam = (kunci: string, nilai: string | null) => router.replace(hrefParam(kunci, nilai));
  const setSaringan = (f: NilaiSaringan) => router.replace(hrefParams({ st: f.status, dari: f.dari, sampai: f.sampai }));
  // status selalu dibuang saat ganti tab (pilihannya beda per tab); tanggal berarti lain di tab Order (tanggal SP) →
  // dibuang saat pindah masuk/keluar tab Order
  const pindahTab = (kunci: string) =>
    router.replace(
      hrefParams({
        tab: kunci === "semua" ? null : kunci,
        st: null,
        ...((kunci === "order") !== modeOrder ? { dari: null, sampai: null } : {}),
      }),
    );

  const daftar = usePipelineDaftar({ tab, pemilik, q });
  const kategori = usePipelineKategori();
  const namaKategori = new Map(kategori.data?.kategori.map((k) => [k.id, k.nama]));
  const kategoriLead = (id: string) => namaKategori.get(kategori.data?.posisi[id] ?? "");
  const tersaring = daftar.data ? saringLead(daftar.data.items, saringan, modeOrder) : [];
  const bisaUbahOrder = (l: LeadRingkas) =>
    akses.bolehTulis && (akses.peran === "admin" || l.pemilik == null || Number(l.pemilik) === idSaya);
  const hitungan = daftar.data
    ? tersaring.length === daftar.data.total
      ? `${daftar.data.total} ${modeOrder ? "order" : "lead"}`
      : `${tersaring.length} dari ${daftar.data.total} ${modeOrder ? "order" : "lead"}`
    : "";

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
        <div role="tablist" aria-label="Tampilan" className="inline-flex shrink-0 rounded-lg bg-muted p-[3px]">
          {TAMPILAN.map(({ papan: b, label, Ikon, uji }) => (
            <Link
              key={label}
              role="tab"
              aria-selected={papan === b}
              tabIndex={papan === b ? 0 : -1}
              href={hrefParam("v", b ? "papan" : null)}
              replace
              data-uji={uji}
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                papan === b ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Ikon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {owner ? (
            <Button asChild variant="outline">
              <Link href="/admin/pipeline" data-uji="tautan-akses-pipeline">
                <ShieldCheck aria-hidden />
                Kelola akses
              </Link>
            </Button>
          ) : null}
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
            onClick={() => pindahTab(t.kunci)}
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
          placeholder="Cari perusahaan, PIC, produk, No SP/PO, kode lead"
          className="pl-9"
          aria-label="Cari lead"
          data-uji="cari-lead"
        />
      </div>

      <SaringanLead
        key={modeOrder ? "order" : "lead"}
        tab={tab}
        modeOrder={modeOrder}
        nilai={saringan}
        ubah={setSaringan}
        hariIni={hariIni}
        bulan={modeOrder && daftar.data ? bulanTersedia(daftar.data.items) : []}
      />

      {papan ? (
        daftar.isError || kategori.isError ? (
          <GalatMuat
            galat={daftar.error ?? kategori.error}
            ulang={() => void Promise.all([daftar.refetch(), kategori.refetch()])}
          />
        ) : daftar.isPending || kategori.isPending ? (
          <MemuatDaftar />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {hitungan} · Kategori di papan ini pribadi, hanya terlihat oleh Anda. Menyeret lead tidak mengubah tahapnya.
            </p>
            <PapanLead leads={tersaring} papan={kategori.data} />
          </>
        )
      ) : daftar.isError ? (
        <GalatMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : daftar.isPending ? (
        <MemuatDaftar />
      ) : tersaring.length === 0 ? (
        <Kosong>
          {q || daftar.data.items.length
            ? `Tidak ada ${modeOrder ? "order" : "lead"} yang cocok.`
            : modeOrder
              ? "Belum ada order."
              : "Belum ada lead."}
        </Kosong>
      ) : modeOrder ? (
        <>
          <p className="text-xs text-muted-foreground">{hitungan}</p>
          <DaftarOrder leads={tersaring} namaKategori={kategoriLead} bisaUbah={bisaUbahOrder} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{hitungan}</p>
          <div className="space-y-2">
            {tersaring.map((l) => (
              <BarisLead key={l.id} lead={l} hariIni={hariIni} kategori={kategoriLead(l.id)} />
            ))}
          </div>
        </>
      )}

      {akses.bolehTulis ? <DialogLeadBaru buka={bukaBaru} ubahBuka={setBukaBaru} /> : null}
    </div>
  );
}

export function LayarDaftar() {
  const sp = useSearchParams();
  // papan & tabel Order butuh lebar penuh
  const lebar = sp.get("v") === "papan" || sp.get("tab") === "order";
  return (
    <>
      <KepalaHalaman judul="Pipeline" />
      <IsiHalaman lebar={lebar} className="space-y-4">
        <GerbangPipeline>{(akses) => <IsiDaftar akses={akses} />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
