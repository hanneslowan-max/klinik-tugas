"use client";

// Berita (owner; permintaan Hannes 7 Nov 2026): pantauan berita dalam & luar negeri yang dipilah routine Claude tiap 2–3
// jam untuk kebutuhan bisnis dan relasi. Tiga tab (URL ?tab=, ganti tanpa round-trip):
//   Pilihan   — edisi kurasi (garis besar, pantau, berita per tingkat skor) + pilih edisi lama + saring wilayah
//   Semua     — semua item hasil tarik feed (mentah), saring wilayah/sumber/kata, muat lagi, status tiap sumber
//   Tersimpan — berita pilihan yang disimpan owner
// "Tarik terbaru" = Edge POST /x/admin/berita-tarik (sesi owner): unduh semua feed sekarang. Kurasi tetap oleh routine.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Layers, RefreshCw, Search, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  bacaSaringWilayah, bacaTabBerita, domainDari, gantiDiData, hitungWilayah, hrefBerita, kelompokSkor, labelEdisi,
  pesanTarik, SARING_WILAYAH, saringPilihan, terapkanTanda, WILAYAH_BERITA, type SaringWilayah, type TabBerita, type Tanda,
} from "@/features/berita/berita";
import { KartuPilihan } from "@/features/berita/kartu-pilihan";
import { useProfil } from "@/features/profil/penyedia-profil";
import { edgeAdmin } from "@/lib/api/edge";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif, fmtWaktu } from "@/lib/tanggal";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { DataBerita, HasilTarikBerita, PilihanBerita, SemuaBerita } from "@/types/domain";

const TAB: { tab: TabBerita; label: string; Ikon: typeof Sparkles }[] = [
  { tab: "pilihan", label: "Pilihan", Ikon: Sparkles },
  { tab: "semua", label: "Semua", Ikon: Layers },
  { tab: "simpan", label: "Tersimpan", Ikon: Bookmark },
];

/** Panah kiri/kanan memindah fokus antar-tab (pola tablist, sama dengan Notifikasi). */
function geserFokus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tab = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const i = tab.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  tab[(i + (e.key === "ArrowRight" ? 1 : tab.length - 1)) % tab.length]?.focus();
}

const kelasChip = (aktif: boolean) =>
  cn(
    "inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-sm whitespace-nowrap transition-colors outline-none sm:px-3",
    "focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11",
    aktif ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background hover:bg-muted",
  );

function SaringWilayahChip({ nilai, onUbah, angka }: { nilai: SaringWilayah; onUbah: (v: SaringWilayah) => void; angka?: Record<SaringWilayah, number> }) {
  return (
    <div role="group" aria-label="Wilayah berita" className="flex flex-wrap gap-1.5" data-uji="saring-wilayah">
      {SARING_WILAYAH.map((o) => (
        <button key={o.nilai} type="button" aria-pressed={nilai === o.nilai} className={kelasChip(nilai === o.nilai)} onClick={() => onUbah(o.nilai)}>
          {o.label}
          {angka ? <span className="text-xs text-muted-foreground tabular-nums">{angka[o.nilai]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Tanda owner (dibaca / simpan / kurang): optimistis di cache edisi & tersimpan, lalu disamakan dengan server. */
function useTanda() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: { p: PilihanBerita; tanda: Tanda }) =>
      rpc(klienBrowser(), "web_berita_tanda", { p: { pilihan_id: v.p.id, ...v.tanda } }),
    onMutate: ({ p, tanda }) => {
      const baru = terapkanTanda(p, tanda, new Date().toISOString());
      qc.setQueriesData<DataBerita>({ queryKey: ["berita", "edisi"] }, (d) => (d ? gantiDiData(d, baru) : d));
      qc.setQueryData<{ items: PilihanBerita[] }>(kunci.beritaTersimpan, (d) =>
        d ? { items: d.items.map((x) => (x.id === baru.id ? baru : x)) } : d,
      );
    },
    onError: (e) => toast.error(pesanGalat(e)),
    onSettled: (_r, _e, v) => {
      if (v.tanda.disimpan !== undefined) void qc.invalidateQueries({ queryKey: kunci.beritaTersimpan });
      if (v.tanda.disimpan !== undefined || v.tanda.kurang !== undefined) {
        toast.success(
          v.tanda.disimpan === true ? "Disimpan" : v.tanda.disimpan === false ? "Dihapus dari Tersimpan"
            : v.tanda.kurang ? "Ditandai kurang relevan — kurator memakai tanda ini di edisi berikutnya" : "Tanda kurang relevan dibatalkan",
        );
      }
    },
  });
  return { tandai: (p: PilihanBerita, tanda: Tanda) => m.mutate({ p, tanda }), sibuk: m.isPending };
}

export function LayarBerita() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const tab = bacaTabBerita(sp.get("tab"));

  const tarik = useMutation({
    mutationFn: () => edgeAdmin<HasilTarikBerita>("berita-tarik", {}),
    onSuccess: (h) => {
      toast.success(pesanTarik(h));
      void qc.invalidateQueries({ queryKey: kunci.berita });
    },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  function gantiTab(t: TabBerita) {
    if (t !== tab) gantiUrl(hrefBerita(t));
  }

  return (
    <>
      <KepalaHalaman
        judul="Berita"
        aksi={
          // HP: ikon saja (judul halaman tetap terbaca di 360px); label penuh mulai sm
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10 pointer-coarse:min-w-10"
            disabled={tarik.isPending}
            onClick={() => tarik.mutate()}
            aria-label="Tarik terbaru"
            title="Tarik berita terbaru dari semua sumber"
            data-uji="tarik-berita"
          >
            <RefreshCw data-icon="inline-start" className={cn(tarik.isPending && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">{tarik.isPending ? "Menarik…" : "Tarik terbaru"}</span>
          </Button>
        }
      />
      <IsiHalaman className="flex flex-col gap-3">
        <div role="tablist" aria-label="Tampilan berita" onKeyDown={geserFokus} className="flex rounded-lg bg-muted p-[3px]">
          {TAB.map(({ tab: t, label, Ikon }) => {
            const aktif = t === tab;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-berita-${t}`}
                aria-selected={aktif}
                aria-controls="panel-berita"
                tabIndex={aktif ? 0 : -1}
                onClick={() => gantiTab(t)}
                data-uji={`tab-berita-${t}`}
                className={cn(
                  "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none pointer-coarse:h-11",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  aktif ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ikon className="hidden size-4 shrink-0 sm:block" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id="panel-berita" aria-labelledby={`tab-berita-${tab}`} className="flex flex-col gap-3">
          {tab === "pilihan" ? <TabPilihan /> : tab === "semua" ? <TabSemua /> : <TabTersimpan />}
        </div>
      </IsiHalaman>
    </>
  );
}

// ---------------------------------------------------------------- Pilihan (edisi kurasi)
function TabPilihan() {
  const { hariIni } = useProfil();
  const sp = useSearchParams();
  const edisiUrl = Number(sp.get("edisi")) || null;
  const wilayah = bacaSaringWilayah(sp.get("wilayah"));
  const { tandai, sibuk } = useTanda();

  const q = useQuery({
    queryKey: kunci.beritaEdisi(edisiUrl),
    queryFn: () => rpc(klienBrowser(), "web_berita", { p: edisiUrl ? { edisi: edisiUrl } : {} }),
    staleTime: 60_000,
    refetchInterval: edisiUrl ? false : 10 * 60_000, // edisi terbaru: cek edisi baru tiap 10 menit selama terbuka
  });

  if (q.isPending) return <MemuatDaftar baris={4} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;
  const d = q.data;
  if (!d.edisi) {
    return (
      <KotakPesan nada="info" judul="Belum ada edisi kurasi" data-uji="berita-kosong">
        Routine Claude memilah berita tiap 2–3 jam di jam kerja dan mengirim edisinya ke sini. Sementara itu, tab
        <span className="font-semibold"> Semua</span> sudah berisi berita terbaru dari {d.sumber.aktif} sumber (tekan Tarik terbaru
        bila masih kosong).
      </KotakPesan>
    );
  }
  const ed = d.edisi;
  const items = saringPilihan(ed.pilihan, wilayah);
  const tingkat = kelompokSkor(items);
  const angka = hitungWilayah(ed.pilihan);
  const terbaru = d.daftar_edisi[0]?.id === ed.id;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-uji="meta-edisi">
          Dipilah Claude{" "}
          <span title={fmtWaktu(ed.dibuat_at)} className="font-medium text-foreground">
            {fmtRelatif(ed.dibuat_at, hariIni)}
          </span>
          {ed.kandidat ? ` dari ${ed.kandidat} berita` : ""}
          {!terbaru ? " · edisi lama" : ""}
        </p>
        {d.daftar_edisi.length > 1 ? (
          <Select
            value={String(ed.id)}
            onValueChange={(v) => gantiUrl(hrefBerita("pilihan", { edisi: Number(v) === d.daftar_edisi[0]?.id ? null : v, wilayah }))}
          >
            <SelectTrigger size="sm" className="max-w-full min-w-0 pointer-coarse:h-10" aria-label="Pilih edisi" data-uji="pilih-edisi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {d.daftar_edisi.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {labelEdisi(e)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <section className="rounded-xl border bg-muted/40 px-3.5 py-3" aria-labelledby="judul-garis-besar" data-uji="garis-besar">
        <h2 id="judul-garis-besar" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Garis besar
        </h2>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{ed.garis_besar}</p>
        {ed.pantau ? (
          <>
            <h2 className="mt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pantau berikutnya</h2>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{ed.pantau}</p>
          </>
        ) : null}
      </section>

      <SaringWilayahChip nilai={wilayah} angka={angka} onUbah={(v) => gantiUrl(hrefBerita("pilihan", { edisi: edisiUrl, wilayah: v }))} />

      {tingkat.length === 0 ? (
        <Kosong>Tidak ada berita {WILAYAH_BERITA[wilayah as "dalam"]?.toLowerCase()} di edisi ini.</Kosong>
      ) : (
        tingkat.map((t) => (
          <section key={t.kunci} aria-labelledby={`tingkat-${t.kunci}`} className="flex flex-col gap-2" data-uji={`tingkat-${t.kunci}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 pt-1">
              <h2 id={`tingkat-${t.kunci}`} className="text-sm font-bold whitespace-nowrap">
                {t.judul}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t.items.length} · {t.keterangan}
              </span>
            </div>
            {t.items.map((p) => (
              <KartuPilihan key={p.id} p={p} hariIni={hariIni} onTanda={tandai} sibuk={sibuk} />
            ))}
          </section>
        ))
      )}
      {ed.catatan ? <p className="text-xs text-muted-foreground">Catatan kurator: {ed.catatan}</p> : null}
    </>
  );
}

// ---------------------------------------------------------------- Tersimpan
function TabTersimpan() {
  const { hariIni } = useProfil();
  const { tandai, sibuk } = useTanda();
  const q = useQuery({ queryKey: kunci.beritaTersimpan, queryFn: () => rpc(klienBrowser(), "web_berita_tersimpan"), staleTime: 30_000 });
  if (q.isPending) return <MemuatDaftar baris={3} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;
  if (!q.data.items.length) return <Kosong>Belum ada berita tersimpan. Tekan Simpan di kartu berita untuk menyimpannya di sini.</Kosong>;
  return (
    <div className="flex flex-col gap-2" data-uji="daftar-tersimpan">
      {q.data.items.map((p) => (
        <KartuPilihan key={p.id} p={p} hariIni={hariIni} onTanda={tandai} sibuk={sibuk} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Semua (mentah)
function TabSemua() {
  const { hariIni } = useProfil();
  const sp = useSearchParams();
  const wilayah = bacaSaringWilayah(sp.get("wilayah"));
  const sumber = sp.get("sumber") ?? "";
  const qUrl = sp.get("q") ?? "";
  const [ketik, setKetik] = useState(qUrl);

  // kata cari masuk URL 400 ms sesudah berhenti mengetik (replaceState dari timer aman: tidak ada navigasi Next tertunda
  // di halaman ini selain tautan luar)
  useEffect(() => {
    const t = setTimeout(() => {
      if (ketik.trim() !== qUrl) gantiUrl(hrefBerita("semua", { wilayah, sumber, q: ketik.trim() }));
    }, 400);
    return () => clearTimeout(t);
  }, [ketik, qUrl, wilayah, sumber]);

  const q = useInfiniteQuery({
    queryKey: kunci.beritaSemua(wilayah, sumber, qUrl),
    queryFn: ({ pageParam }) =>
      rpc(klienBrowser(), "web_berita_semua", {
        p: { ...(wilayah !== "semua" ? { wilayah } : {}), ...(sumber ? { sumber } : {}), ...(qUrl ? { q: qUrl } : {}), ...(pageParam ? { sebelum: pageParam } : {}) },
      }),
    initialPageParam: null as number | null,
    getNextPageParam: (h: SemuaBerita) => h.berikut,
    staleTime: 60_000,
  });

  const daftarSumber = q.data?.pages[0]?.sumber ?? [];
  const items = q.data?.pages.flatMap((h) => h.items) ?? [];

  return (
    <>
      <div className="flex flex-col gap-2">
        <SaringWilayahChip nilai={wilayah} onUbah={(v) => gantiUrl(hrefBerita("semua", { wilayah: v, sumber, q: qUrl }))} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={ketik}
              onChange={(e) => setKetik(e.target.value)}
              placeholder="Cari judul berita…"
              aria-label="Cari judul berita"
              className="pl-8"
              maxLength={100}
              data-uji="cari-berita"
            />
          </div>
          <Select value={sumber || "semua"} onValueChange={(v) => gantiUrl(hrefBerita("semua", { wilayah, sumber: v === "semua" ? null : v, q: qUrl }))}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Sumber" data-uji="pilih-sumber">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="semua">Semua sumber</SelectItem>
                {daftarSumber.filter((s) => s.aktif).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nama}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isPending ? (
        <MemuatDaftar />
      ) : q.isError ? (
        <GalatMuat galat={q.error} ulang={() => q.refetch()} />
      ) : items.length === 0 ? (
        <Kosong>{qUrl || sumber || wilayah !== "semua" ? "Tidak ada berita yang cocok." : "Belum ada berita. Tekan Tarik terbaru."}</Kosong>
      ) : (
        <ul className="divide-y rounded-xl border" data-uji="daftar-semua">
          {items.map((b) => (
            <li key={b.id} className="px-3.5 py-2.5" data-wilayah={b.wilayah}>
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-sm leading-snug font-medium underline-offset-2 hover:underline">
                {b.judul}
              </a>
              {b.cuplikan ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.cuplikan}</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="min-w-0 truncate font-medium text-foreground/80">{b.penerbit ?? b.sumber}</span>
                {b.penerbit ? <span className="min-w-0 truncate">via {b.sumber}</span> : <span>{domainDari(b.url)}</span>}
                {/* feed tanpa tanggal terbit (mis. Nikkei): tampilkan saat masuk, bukan seolah baru terbit */}
                {b.terbit_at ? (
                  <span title={fmtWaktu(b.terbit_at)}>{fmtRelatif(b.terbit_at, hariIni)}</span>
                ) : (
                  <span title={`Feed tanpa tanggal terbit; masuk ${fmtWaktu(b.ditarik_at)}`}>masuk {fmtRelatif(b.ditarik_at, hariIni)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage ? (
        <Button variant="outline" className="self-center pointer-coarse:h-11" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} data-uji="muat-lagi">
          {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </Button>
      ) : null}

      {daftarSumber.length ? <StatusSumber sumber={daftarSumber} hariIni={hariIni} /> : null}
    </>
  );
}

function StatusSumber({ sumber, hariIni }: { sumber: SemuaBerita["sumber"]; hariIni?: string | null }) {
  const [buka, setBuka] = useState(false);
  const galat = sumber.filter((s) => s.aktif && s.terakhir_galat).length;
  return (
    <Collapsible open={buka} onOpenChange={setBuka} className="rounded-xl border">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm font-medium" data-uji="status-sumber">
        <span className="flex-1">
          Status sumber ({sumber.filter((s) => s.aktif).length})
          {galat ? (
            <Chip nada="telat" className="ml-2">
              {galat} gagal
            </Chip>
          ) : null}
        </span>
        <ChevronDown className={cn("size-4 transition-transform", buka && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y border-t text-xs">
          {sumber.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3.5 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{s.nama}</span>
              <span className="text-muted-foreground">{WILAYAH_BERITA[s.wilayah]}</span>
              <span className="text-muted-foreground tabular-nums">{s.item_24j} / 24 jam</span>
              {s.terakhir_galat ? (
                <span className="w-full text-telat">Gagal: {s.terakhir_galat}</span>
              ) : s.terakhir_ok ? (
                <span className="text-muted-foreground" title={fmtWaktu(s.terakhir_ok)}>
                  ok {fmtRelatif(s.terakhir_ok, hariIni)}
                </span>
              ) : (
                <span className="text-muted-foreground">belum ditarik</span>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
