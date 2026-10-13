"use client";

// Layar "Lead saya" (§5): tab Semua / Diam >7 hari / Pallet Mesh / Penawaran, pencarian, tombol Lead baru.
// Rep default melihat leadnya sendiri; admin/baca default semua lead. Filter pemilik & tab disimpan di URL; semua
// perubahan URL di layar ini lewat history.replaceState (gantiUrl) — data dari TanStack, tanpa permintaan ke server.
// Dua tampilan (?v=papan): Daftar, atau Papan = kolom kategori PRIBADI pengguna, lead diseret antar kolom (papan-lead).
// Tab Order (revisi #3–#7): rekap & tabel order per bulan SP (daftar-order). Saringan status + tanggal (?st, dari, sampai)
// disaring di klien di atas hasil cari server (saringan-lead).
// Volume (±2.000 lead): baris dirender bertahap 50-50 (sentinel gulir + tombol cadangan) dengan batas per kunci daftar
// yang bertahan saat Kembali dari detail; kotak cari terpisah (ketikan tidak merender ulang daftar); baris di-memo.
// Papan (dnd-kit) dimuat malas: dipramuat saat ?v=papan aktif atau tombol Papan disentuh/difokus.
import { BarChart3, List, Plus, Search, ShieldCheck, SquareKanban } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
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
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { usePipelineDaftar, usePipelineKategori } from "@/features/pipeline/queries";
import { opsiStatus, SaringanLead, tanggalSah } from "@/features/pipeline/saringan-lead";
import { useProfil } from "@/features/profil/penyedia-profil";
import { imporAman, pramuat } from "@/lib/impor-aman";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { LeadRingkas } from "@/types/domain";

const TAMPILAN = [
  { papan: false, label: "Daftar", Ikon: List, uji: "tab-daftar-lead" },
  { papan: true, label: "Papan", Ikon: SquareKanban, uji: "tab-papan-lead" },
] as const;

const PapanLead = dynamic(() => imporAman(() => import("@/features/pipeline/papan-lead")).then((m) => m.PapanLead), {
  loading: () => <MemuatDaftar />,
});
const pramuatPapan = () => pramuat(() => import("@/features/pipeline/papan-lead"));

const LANGKAH = 50;

/** URL /pipeline dari parameter `dasar` dengan sebagian parameter diganti (null/kosong = hapus). */
function urlPipeline(dasar: string, ubah: Record<string, string | null>) {
  const p = new URLSearchParams(dasar);
  for (const [kunci, nilai] of Object.entries(ubah)) {
    if (nilai) p.set(kunci, nilai);
    else p.delete(kunci);
  }
  const s = p.toString();
  return s ? `/pipeline?${s}` : "/pipeline";
}

/**
 * Batas baris yang dirender per kunci daftar (tab|pemilik|cari|saringan). Tingkat modul supaya bertahan saat halaman
 * di-unmount (buka detail lead → Kembali): jumlah baris sama → posisi gulir bisa dipulihkan. Ganti kunci = mulai 50 lagi.
 */
const batasTersimpan = new Map<string, number>();

function useBatasTampil(kunci: string) {
  const [keadaan, setKeadaan] = useState(() => ({ kunci, batas: batasTersimpan.get(kunci) ?? LANGKAH }));
  let batas = keadaan.batas;
  if (keadaan.kunci !== kunci) {
    batas = LANGKAH;
    setKeadaan({ kunci, batas }); // sesuaikan state saat kunci berubah (saat render, bukan di efek)
  }
  useEffect(() => {
    if (batasTersimpan.size > 50) batasTersimpan.clear(); // varian cari tak terbatas: jangan menumpuk
    batasTersimpan.set(kunci, batas);
  }, [kunci, batas]);
  const tambah = () => setKeadaan((k) => ({ kunci: k.kunci, batas: k.batas + LANGKAH }));
  return { batas, tambah };
}

/**
 * Tombol "Tampilkan 50 lagi" yang juga menjadi sentinel gulir: saat mendekati layar (±600px) baris berikutnya
 * ditambahkan otomatis; tombol tetap ada sebagai cadangan (keyboard, pembaca layar, IntersectionObserver tak ada).
 */
function TampilLagi({ sisa, tambah }: { sisa: number; tambah: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const saatTerlihat = useEffectEvent(() => tambah());
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) saatTerlihat();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sisa]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={tambah}
      className="w-full rounded-lg border border-dashed py-2.5 text-sm font-medium text-primary hover:bg-muted"
      data-uji="tampil-lagi"
    >
      Tampilkan {Math.min(LANGKAH, sisa)} lagi (sisa {sisa})
    </button>
  );
}

/**
 * Kotak cari dengan isian lokal: ketikan hanya merender komponen ini; kata ter-debounce 300 ms ditulis ke URL (?q)
 * lewat `tulis` (daftar disaring dari URL; Kembali dari detail lead memulihkan pencarian).
 * - Tulisan tertunda tidak boleh jatuh saat navigasi sedang menunggu RSC: replaceState = ACTION_RESTORE di router
 *   Next yang MENGGANTIKAN navigasi itu (ketukan diabaikan). Maka klik selagi timer menunggu (fase capture dokumen,
 *   sebelum onClick <Link>): tautan yang berpindah halaman → timer dibatalkan & ketikan yang belum diterapkan
 *   dibuang; klik lain (tab/saringan, tautan URL-dangkal `data-url-dangkal`, Ctrl/Shift+klik) → ditulis SEKARANG,
 *   serempak sebelum handler-nya. Kembali/Maju (popstate) → dibatalkan.
 * - ?q berubah dari luar (ketuk menu Pipeline = /pipeline tanpa remount, Kembali/Maju) → isian ikut URL. Gema tulisan
 *   sendiri dikenali dari `tertulis`, jadi ketikan lanjutan tidak tertimpa.
 */
function KotakCari({ nilaiUrl, tulis }: { nilaiUrl: string; tulis: (q: string) => void }) {
  const [isi, setIsi] = useState(nilaiUrl);
  const [jejak, setJejak] = useState({ url: nilaiUrl, tertulis: nilaiUrl.trim() });
  if (jejak.url !== nilaiUrl) {
    setJejak({ url: nilaiUrl, tertulis: nilaiUrl.trim() }); // sesuaikan state saat render, bukan di efek
    if (nilaiUrl.trim() !== jejak.tertulis) setIsi(nilaiUrl);
  }
  const input = useRef<HTMLInputElement>(null);
  const tunda = useRef<ReturnType<typeof setTimeout>>(undefined);
  const kirim = useEffectEvent(() => {
    const q = isi.trim();
    if (q === nilaiUrl.trim()) return;
    setJejak((j) => ({ ...j, tertulis: q }));
    tulis(q);
  });
  const buang = useEffectEvent(() => setIsi(nilaiUrl));
  useEffect(() => {
    const t = setTimeout(() => {
      tunda.current = undefined;
      kirim();
    }, 300);
    tunda.current = t;
    return () => {
      clearTimeout(t);
      if (tunda.current === t) tunda.current = undefined;
    };
  }, [isi]);
  useEffect(() => {
    const henti = () => {
      clearTimeout(tunda.current);
      tunda.current = undefined;
    };
    const saatKlik = (e: MouseEvent) => {
      if (tunda.current === undefined || e.target === input.current) return;
      henti();
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const pindah =
        a instanceof HTMLAnchorElement &&
        !a.hasAttribute("data-url-dangkal") &&
        !a.target &&
        !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);
      if (pindah) buang();
      else kirim();
    };
    const saatKembali = () => {
      if (tunda.current === undefined) return;
      henti();
      buang();
    };
    document.addEventListener("click", saatKlik, true);
    window.addEventListener("popstate", saatKembali);
    return () => {
      document.removeEventListener("click", saatKlik, true);
      window.removeEventListener("popstate", saatKembali);
    };
  }, []);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={input}
        value={isi}
        onChange={(e) => setIsi(e.target.value)}
        placeholder="Cari perusahaan, PIC, produk, No SP/PO, kode lead"
        className="pl-9"
        aria-label="Cari lead"
        data-uji="cari-lead"
      />
    </div>
  );
}

// memo: daftar besar tidak dirender ulang per baris saat induk berubah (data lead = objek cache yang sama)
const BarisLead = memo(function BarisLead({ lead, hariIni, kategori }: { lead: LeadRingkas; hariIni: string; kategori?: string }) {
  const buka = lead.tahap === "BARU" || lead.tahap === "PENAWARAN";
  const panas = buka && lead.diam_hari > 7;
  const fu = buka && lead.fu_berikutnya ? infoFu(lead.fu_berikutnya, hariIni) : null;
  return (
    <Link
      href={`/pipeline/${encodeURIComponent(lead.id)}`}
      className="block rounded-xl border bg-card transition-colors hover:bg-muted"
      data-uji="baris-lead"
    >
      <IsiTautan className="flex items-start gap-2 px-3 py-2.5" kelasPetunjuk="inset-x-3 bottom-0.5 h-0.5">
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
      </IsiTautan>
    </Link>
  );
});

function IsiDaftar({ akses }: { akses: AksesPipeline }) {
  const { member, hariIni, owner } = useProfil();
  const idSaya = Number(member.id);
  const sp = useSearchParams();

  const tab = TAB_DAFTAR.find((t) => t.kunci === sp.get("tab"))?.kunci ?? "semua";
  const papan = sp.get("v") === "papan";
  const modeOrder = tab === "order";
  // papan aktif → unduh chunk papan sejajar dengan data (bukan sesudah data tiba)
  useEffect(() => {
    if (papan) pramuatPapan();
  }, [papan]);
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

  // kata cari ter-debounce disimpan di URL (?q): Kembali dari detail lead memulihkan pencarian
  const qUrl = sp.get("q") ?? "";
  const q = qUrl.trim();

  const [bukaBaru, setBukaBaru] = useState(false);

  const hrefParam = (kunci: string, nilai: string | null) => urlPipeline(sp.toString(), { [kunci]: nilai }); // href <Link>
  // handler: dasarnya URL SAAT INI, bukan sp render terakhir (kotak cari bisa baru saja menulis ?q di klik yang sama)
  const gantiParams = (ubah: Record<string, string | null>) => {
    if (window.location.pathname !== "/pipeline") return; // sudah berpindah halaman (mis. Kembali sedang berjalan)
    gantiUrl(urlPipeline(window.location.search, ubah));
  };
  const setParam = (kunci: string, nilai: string | null) => gantiParams({ [kunci]: nilai });
  const setSaringan = (f: NilaiSaringan) => gantiParams({ st: f.status, dari: f.dari, sampai: f.sampai });
  // status selalu dibuang saat ganti tab (pilihannya beda per tab); tanggal berarti lain di tab Order (tanggal SP) →
  // dibuang saat pindah masuk/keluar tab Order
  const pindahTab = (kunci: string) =>
    gantiParams({
      tab: kunci === "semua" ? null : kunci,
      st: null,
      ...((kunci === "order") !== modeOrder ? { dari: null, sampai: null } : {}),
    });

  const daftar = usePipelineDaftar({ tab, pemilik, q });
  const kategori = usePipelineKategori();
  const namaKategori = useMemo(() => new Map(kategori.data?.kategori.map((k) => [k.id, k.nama])), [kategori.data]);
  const kategoriLead = (id: string) => namaKategori.get(kategori.data?.posisi[id] ?? "");
  const { status: stSaring, dari: dariSaring, sampai: sampaiSaring } = saringan;
  const tersaring = useMemo(
    () => (daftar.data ? saringLead(daftar.data.items, { status: stSaring, dari: dariSaring, sampai: sampaiSaring }, modeOrder) : []),
    [daftar.data, stSaring, dariSaring, sampaiSaring, modeOrder],
  );
  const { batas, tambah } = useBatasTampil([tab, pemilik ?? "semua", q, stSaring, dariSaring, sampaiSaring].join("|"));
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
              prefetch={false}
              onNavigate={(e) => {
                e.preventDefault();
                setParam("v", b ? "papan" : null);
              }}
              data-url-dangkal
              onPointerDown={b ? pramuatPapan : undefined}
              onFocus={b ? pramuatPapan : undefined}
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

      <KotakCari nilaiUrl={qUrl} tulis={(v) => setParam("q", v || null)} />

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
          <DaftarOrder
            leads={tersaring}
            namaKategori={kategoriLead}
            bisaUbah={bisaUbahOrder}
            batas={batas}
            lagi={(sisa) => <TampilLagi sisa={sisa} tambah={tambah} />}
          />
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{hitungan}</p>
          <div className="space-y-2">
            {tersaring.slice(0, batas).map((l) => (
              <BarisLead key={l.id} lead={l} hariIni={hariIni} kategori={kategoriLead(l.id)} />
            ))}
          </div>
          {tersaring.length > batas ? <TampilLagi sisa={tersaring.length - batas} tambah={tambah} /> : null}
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
