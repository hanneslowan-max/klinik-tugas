"use client";

// Database pelanggan (permintaan Hannes 17 Okt: "lead yang diinput dijadikan database, jadi customer yang repeat order
// ketahuan log-nya"). Daftar semua pelanggan + statistik lead/order dari web_pipeline_pelanggan_daftar; saringan
// (Semua / Repeat order / Pernah order / Ada lead aktif), urutan, dan kata cari disimpan di URL (?s, ?u, ?q) supaya
// Kembali dari detail pelanggan memulihkannya. Admin: tautan "Saran gabung" (pelanggan dobel dari data sheet lama).
import { GitMerge, Repeat } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { namaPelanggan, SARING_PELANGGAN, URUT_PELANGGAN } from "@/features/pipeline/konstanta";
import { KotakCari } from "@/features/pipeline/kotak-cari";
import { ringkasStatistik } from "@/features/pipeline/pelanggan";
import { usePelangganDaftar } from "@/features/pipeline/queries";
import { TampilLagi, useBatasTampil } from "@/features/pipeline/tampil-bertahap";
import { useProfil } from "@/features/profil/penyedia-profil";
import { fmtTanggal } from "@/lib/tanggal";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { PelangganRingkas, SaringPelanggan, UrutPelanggan } from "@/types/domain";

const JALUR = "/pipeline/pelanggan";

/** URL layar ini dari parameter `dasar` dengan sebagian parameter diganti (null/kosong = hapus). */
function urlPelanggan(dasar: string, ubah: Record<string, string | null>) {
  const p = new URLSearchParams(dasar);
  for (const [k, v] of Object.entries(ubah)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const s = p.toString();
  return s ? `${JALUR}?${s}` : JALUR;
}

// memo: ±1.900 baris; data = objek cache yang sama selama tidak berubah
const KartuPelanggan = memo(function KartuPelanggan({ p, hariIni }: { p: PelangganRingkas; hariIni: string }) {
  const nama = namaPelanggan(p);
  const terakhir = p.order_terakhir ?? p.lead_terakhir;
  return (
    <Link
      href={`${JALUR}/${encodeURIComponent(p.id)}`}
      className="block rounded-xl border bg-card transition-colors hover:bg-muted"
      data-uji="baris-pelanggan"
      data-id={p.id}
    >
      <IsiTautan className="flex items-start gap-2 px-3 py-2.5" kelasPetunjuk="inset-x-3 bottom-0.5 h-0.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{nama}</span>
            {p.jml_order >= 2 ? (
              <Chip nada="sukses" className="shrink-0" data-uji="chip-pelanggan-repeat">
                <Repeat aria-hidden />
                Repeat
              </Chip>
            ) : null}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {[p.semu ? "Perorangan" : p.pic, p.kota].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="truncate text-xs text-muted-foreground tabular-nums">{ringkasStatistik(p)}</div>
        </div>
        {terakhir ? (
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>{p.order_terakhir ? "Order terakhir" : "Lead terakhir"}</div>
            <div className="font-medium text-foreground tabular-nums">{fmtTanggal(terakhir, hariIni)}</div>
          </div>
        ) : null}
      </IsiTautan>
    </Link>
  );
});

function IsiDaftarPelanggan({ akses }: { akses: AksesPipeline }) {
  const { hariIni } = useProfil();
  const sp = useSearchParams();
  const saring: SaringPelanggan = SARING_PELANGGAN.find((s) => s.kunci === sp.get("s"))?.kunci ?? "semua";
  const urut: UrutPelanggan = URUT_PELANGGAN.find((u) => u.kunci === sp.get("u"))?.kunci ?? "terakhir";
  const qUrl = sp.get("q") ?? "";
  const q = qUrl.trim();

  const setParam = (k: string, v: string | null) => {
    if (window.location.pathname !== JALUR) return; // sudah berpindah halaman
    gantiUrl(urlPelanggan(window.location.search, { [k]: v }));
  };

  const daftar = usePelangganDaftar({ q, saring, urut });
  const { batas, tambah } = useBatasTampil(["pelanggan", q, saring, urut].join("|"));
  const items = daftar.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Semua pelanggan dari lead yang diinput, lengkap dengan riwayat order-nya.</p>
        {akses.peran === "admin" ? (
          <Button asChild variant="outline" className="ml-auto">
            <Link href={`${JALUR}/dobel`} data-uji="tautan-saran-gabung">
              <GitMerge aria-hidden />
              Saran gabung
            </Link>
          </Button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Saring pelanggan" className="flex gap-1.5 overflow-x-auto pb-1">
        {SARING_PELANGGAN.map((s) => (
          <button
            key={s.kunci}
            role="tab"
            aria-selected={saring === s.kunci}
            onClick={() => setParam("s", s.kunci === "semua" ? null : s.kunci)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
              saring === s.kunci
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
            data-uji={`saring-pelanggan-${s.kunci}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <KotakCari
            nilaiUrl={qUrl}
            tulis={(v) => setParam("q", v || null)}
            placeholder={akses.peran === "baca" ? "Cari nama perusahaan atau kota" : "Cari nama, PIC, nomor HP, kota"}
            label="Cari pelanggan"
            uji="cari-pelanggan"
          />
        </div>
        <Select value={urut} onValueChange={(v) => setParam("u", v === "terakhir" ? null : v)}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Urutkan" data-uji="urut-pelanggan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {URUT_PELANGGAN.map((u) => (
              <SelectItem key={u.kunci} value={u.kunci}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {daftar.isError ? (
        <GalatMuat galat={daftar.error} ulang={() => void daftar.refetch()} />
      ) : daftar.isPending ? (
        <MemuatDaftar />
      ) : items.length === 0 ? (
        <Kosong>{q || saring !== "semua" ? "Tidak ada pelanggan yang cocok." : "Belum ada pelanggan."}</Kosong>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" data-uji="hitungan-pelanggan">
            {daftar.data.total} pelanggan
          </p>
          <div className="space-y-2">
            {items.slice(0, batas).map((p) => (
              <KartuPelanggan key={p.id} p={p} hariIni={hariIni} />
            ))}
          </div>
          {items.length > batas ? <TampilLagi sisa={items.length - batas} tambah={tambah} /> : null}
        </>
      )}
    </div>
  );
}

export function LayarPelanggan() {
  return (
    <>
      <KepalaHalaman judul="Pelanggan" kembali="/pipeline" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline>{(akses) => <IsiDaftarPelanggan akses={akses} />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
