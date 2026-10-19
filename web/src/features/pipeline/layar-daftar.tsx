"use client";

// Layar "Lead saya" (§5): tab Semua / Follow up / Diam >7 hari / Penawaran / Order, pencarian, saringan Produk (semua
// produk, ?produk=) + Filter, Urutkan (?urut=, di baris jumlah), tombol Lead baru.
// Rep default melihat leadnya sendiri; admin/baca default semua lead. Filter pemilik & tab disimpan di URL; semua
// perubahan URL di layar ini lewat history.replaceState (gantiUrl) — data dari TanStack, tanpa permintaan ke server.
// Dua tampilan (?v=papan): Daftar, atau Papan = kolom kategori PRIBADI pengguna, lead diseret antar kolom (papan-lead).
// Tab Order (revisi #3–#7): rekap & tabel order per bulan SP (daftar-order). Saringan status + tanggal (?st, dari, sampai)
// disaring di klien di atas hasil cari server (saringan-lead).
// Volume (±2.000 lead): baris dirender bertahap 50-50 (sentinel gulir + tombol cadangan) dengan batas per kunci daftar
// yang bertahan saat Kembali dari detail; kotak cari terpisah (ketikan tidak merender ulang daftar); baris di-memo.
// Papan (dnd-kit) dimuat malas: dipramuat saat ?v=papan aktif, saat senggang sesudah daftar tiba, atau tombol Papan
// disentuh/difokus; gagal memuat → pesan + Coba lagi di tempat papan (muatKomponen).
import { List, Plus, SquareKanban } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { AksiPipeline } from "@/features/pipeline/aksi-pipeline";
import { DaftarOrder } from "@/features/pipeline/daftar-order";
import { DialogLeadBaru } from "@/features/pipeline/dialog-lead-baru";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { infoFu, PRODUK, ringkasProduk, rupiah, TAB_DAFTAR } from "@/features/pipeline/konstanta";
import { ChipRepeat } from "@/features/pipeline/chip-repeat";
import { KotakCari } from "@/features/pipeline/kotak-cari";
import { bulanTersedia, hitungProduk, saringLead, urutkan, urutSah, type SaringanLead as NilaiSaringan } from "@/features/pipeline/order";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { usePipelineDaftar, usePipelineKategori } from "@/features/pipeline/queries";
import { opsiStatus, PilihUrut, SaringanLead, tanggalSah } from "@/features/pipeline/saringan-lead";
import { TampilLagi, useBatasTampil } from "@/features/pipeline/tampil-bertahap";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pramuat, saatSenggang } from "@/lib/impor-aman";
import { muatKomponen } from "@/lib/muat-komponen";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { LeadRingkas } from "@/types/domain";

const TAMPILAN = [
  { papan: false, label: "Daftar", Ikon: List, uji: "tab-daftar-lead" },
  { papan: true, label: "Papan", Ikon: SquareKanban, uji: "tab-papan-lead" },
] as const;

const PapanLead = dynamic(() => muatKomponen(() => import("@/features/pipeline/papan-lead"), (m) => m.PapanLead, "papan"), {
  loading: () => <MemuatDaftar />,
});
const pramuatPapan = () => pramuat(() => import("@/features/pipeline/papan-lead"));

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
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm text-muted-foreground">{ringkasProduk(lead.produk)}</span>
            <ChipRepeat n={lead.order_sebelumnya} />
          </div>
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

/** Baris "N lead" + pilihan urutan di kanan. */
function BarisJumlah({
  children,
  urut,
  modeOrder,
  ubahUrut,
}: {
  children: ReactNode;
  urut: string | null;
  modeOrder: boolean;
  ubahUrut: (u: string | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-xs text-muted-foreground">{children}</p>
      <PilihUrut nilai={urut} modeOrder={modeOrder} ubah={ubahUrut} />
    </div>
  );
}

function IsiDaftar({ akses }: { akses: AksesPipeline }) {
  const { member, hariIni } = useProfil();
  const idSaya = Number(member.id);
  const sp = useSearchParams();

  const tab = TAB_DAFTAR.find((t) => t.kunci === sp.get("tab"))?.kunci ?? "semua";
  const papan = sp.get("v") === "papan";
  const modeOrder = tab === "order";
  // nilai URL yang tidak sah untuk tab ini diabaikan (bukan mengosongkan daftar diam-diam)
  const stUrl = sp.get("st");
  const produkUrl = sp.get("produk");
  const saringan: NilaiSaringan = {
    status: stUrl && opsiStatus(tab).some((o) => o.v === stUrl) ? stUrl : null,
    dari: tanggalSah(sp.get("dari")),
    sampai: tanggalSah(sp.get("sampai")),
    produk: produkUrl && PRODUK.some((p) => p === produkUrl) ? produkUrl : null,
  };
  const urut = urutSah(sp.get("urut"), modeOrder);
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
  const setSaringan = (f: NilaiSaringan) => gantiParams({ st: f.status, dari: f.dari, sampai: f.sampai, produk: f.produk });
  // status selalu dibuang saat ganti tab (pilihannya beda per tab); tanggal & urutan berarti lain di tab Order (tanggal
  // SP) → dibuang saat pindah masuk/keluar tab Order
  const pindahTab = (kunci: string) =>
    gantiParams({
      tab: kunci === "semua" ? null : kunci,
      st: null,
      ...((kunci === "order") !== modeOrder ? { dari: null, sampai: null, urut: null } : {}),
    });

  const daftar = usePipelineDaftar({ tab, pemilik, q });
  const kategori = usePipelineKategori();
  // papan aktif → unduh chunk papan sejajar dengan data (bukan sesudah data tiba); tampilan Daftar → pramuat saat
  // senggang sesudah daftar tiba, supaya ketukan Papan pertama tidak menunggu (atau gagal karena sinyal putus) unduhan
  const adaDaftar = Boolean(daftar.data);
  useEffect(() => {
    if (papan) {
      pramuatPapan();
      return;
    }
    return adaDaftar ? saatSenggang(pramuatPapan) : undefined;
  }, [papan, adaDaftar]);
  const namaKategori = useMemo(() => new Map(kategori.data?.kategori.map((k) => [k.id, k.nama])), [kategori.data]);
  const kategoriLead = (id: string) => namaKategori.get(kategori.data?.posisi[id] ?? "");
  const { status: stSaring, dari: dariSaring, sampai: sampaiSaring, produk: produkSaring } = saringan;
  // jumlah per produk = lead yang tampil bila produk itu dipilih (saringan lain tetap berlaku)
  const tanpaProduk = useMemo(
    () => (daftar.data ? saringLead(daftar.data.items, { status: stSaring, dari: dariSaring, sampai: sampaiSaring, produk: null }, modeOrder) : []),
    [daftar.data, stSaring, dariSaring, sampaiSaring, modeOrder],
  );
  const jumlahProduk = useMemo(() => hitungProduk(tanpaProduk), [tanpaProduk]);
  const tersaring = useMemo(
    () => (produkSaring ? tanpaProduk.filter((l) => l.produk.some((i) => i.produk === produkSaring)) : tanpaProduk),
    [tanpaProduk, produkSaring],
  );
  // tab Order dikelompokkan & diurutkan di DaftarOrder; daftar lead & papan memakai salinan terurut ini
  const terurut = useMemo(() => urutkan(tersaring, urut, modeOrder), [tersaring, urut, modeOrder]);
  const { batas, tambah } = useBatasTampil([tab, pemilik ?? "semua", q, stSaring, dariSaring, sampaiSaring, produkSaring, urut].join("|"));
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
              {/* rep: dua sakelar berdampingan; ikon disembunyikan di HP sempit agar tetap satu baris */}
              <Ikon className={cn("size-4", akses.peran === "rep" && "max-sm:hidden")} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
        {/* Pelanggan / Ringkasan / Kelola akses ada di kepala halaman (AksiPipeline). Lead baru: tombol di sini untuk
            desktop; di HP/tablet tombol melayang di bawah (pola "+ Tugas" layar list), jadi baris ini tetap satu baris. */}
        {akses.bolehTulis ? (
          <Button onClick={() => setBukaBaru(true)} className="ml-auto hidden lg:inline-flex" data-uji="tombol-lead-baru">
            <Plus aria-hidden />
            Lead baru
          </Button>
        ) : null}
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
        jumlahProduk={jumlahProduk}
        jumlahSemua={tanpaProduk.length}
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
            <BarisJumlah urut={urut} modeOrder={modeOrder} ubahUrut={(u) => setParam("urut", u)}>
              {hitungan} · Kategori di papan ini pribadi, hanya terlihat oleh Anda. Menyeret lead tidak mengubah tahapnya.
            </BarisJumlah>
            <PapanLead leads={terurut} papan={kategori.data} />
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
          <BarisJumlah urut={urut} modeOrder={modeOrder} ubahUrut={(u) => setParam("urut", u)}>
            {hitungan}
          </BarisJumlah>
          <DaftarOrder
            leads={tersaring}
            urut={urut}
            namaKategori={kategoriLead}
            bisaUbah={bisaUbahOrder}
            batas={batas}
            lagi={(sisa) => <TampilLagi sisa={sisa} tambah={tambah} />}
          />
        </>
      ) : (
        <>
          <BarisJumlah urut={urut} modeOrder={modeOrder} ubahUrut={(u) => setParam("urut", u)}>
            {hitungan}
          </BarisJumlah>
          <div className="space-y-2">
            {terurut.slice(0, batas).map((l) => (
              <BarisLead key={l.id} lead={l} hariIni={hariIni} kategori={kategoriLead(l.id)} />
            ))}
          </div>
          {terurut.length > batas ? <TampilLagi sisa={terurut.length - batas} tambah={tambah} /> : null}
        </>
      )}

      {akses.bolehTulis ? (
        <>
          {/* ruang supaya baris terakhir tidak tertutup tombol melayang */}
          <div className="h-16 lg:hidden" aria-hidden />
          <Button
            type="button"
            onClick={() => setBukaBaru(true)}
            className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 h-13 gap-1.5 rounded-full px-5 text-base font-semibold shadow-lg lg:hidden"
            data-uji="tombol-lead-baru"
          >
            <Plus className="size-5" aria-hidden />
            Lead baru
          </Button>
          <DialogLeadBaru buka={bukaBaru} ubahBuka={setBukaBaru} />
        </>
      ) : null}
    </div>
  );
}

export function LayarDaftar() {
  const sp = useSearchParams();
  // papan & tabel Order butuh lebar penuh
  const lebar = sp.get("v") === "papan" || sp.get("tab") === "order";
  return (
    <>
      <KepalaHalaman judul="Pipeline" aksi={<AksiPipeline />} />
      <IsiHalaman lebar={lebar} className="space-y-4">
        <GerbangPipeline>{(akses) => <IsiDaftar akses={akses} />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
