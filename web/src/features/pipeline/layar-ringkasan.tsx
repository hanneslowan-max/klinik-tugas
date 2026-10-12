"use client";

// Ringkasan pipeline (§4) via web_pipeline_ringkas. Hanya untuk pengguna boleh_ringkas (admin/baca).
// Metrik per bulan (leads/order/omzet + per rep), win-rate (semua + Pallet Mesh per qty), siklus rata-rata.
// Dasar omzet: SP (default, K2) atau tanggal lead (cocok-silang sheet lama).
import { useState } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { GerbangPipeline } from "@/features/pipeline/gerbang";
import { rupiah } from "@/features/pipeline/konstanta";
import { usePipelineRingkas } from "@/features/pipeline/queries";
import { cn } from "@/lib/utils";
import type { RingkasBulan, WinRate } from "@/types/domain";

function persenWr(w: WinRate): string {
  return w.rate == null ? "—" : `${Math.round(w.rate * 100)}%`;
}

function Tile({ label, nilai, sub }: { label: string; nilai: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{nilai}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function BlokBulan({ b }: { b: RingkasBulan }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold tabular-nums">{b.bulan}</h3>
        <span className="text-sm font-medium tabular-nums">{rupiah(b.omzet_total)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
        <div>
          <div className="text-xs text-muted-foreground">Leads</div>
          <div className="tabular-nums">{b.leads}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Pelanggan baru</div>
          <div className="tabular-nums">{b.pelanggan_baru}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Penawaran</div>
          <div className="tabular-nums">{b.penawaran}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Order</div>
          <div className="tabular-nums">{b.order}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Batal</div>
          <div className="tabular-nums">{b.batal}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Dialihkan</div>
          <div className="tabular-nums">{b.dialihkan}</div>
        </div>
      </div>
      {b.per_rep.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-sm">
          {b.per_rep.map((r) => (
            <li key={r.pemilik ?? "x"} className="tabular-nums">
              <span className="text-muted-foreground">{r.username ?? "tanpa pemilik"}:</span> {rupiah(r.omzet)}{" "}
              <span className="text-muted-foreground">({r.order} order)</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Tabel({ judul, kolom, baris, catatan }: { judul: string; kolom: string[]; baris: (string | number)[][]; catatan?: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{judul}</h2>
      {baris.length === 0 ? (
        <Kosong>Belum ada data.</Kosong>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                {kolom.map((k, i) => (
                  <th key={k} className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={cn("px-3 py-2 tabular-nums", ci === 0 ? "text-left font-medium" : "text-right")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {catatan ? <p className="text-xs text-muted-foreground">{catatan}</p> : null}
    </section>
  );
}

function IsiRingkas() {
  const [dasar, setDasar] = useState<"sp" | "lead">("sp");
  const q = usePipelineRingkas({ bulan: "", dasar });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Dasar omzet</span>
        <div role="group" aria-label="Dasar omzet" className="inline-flex rounded-lg bg-muted p-[3px]">
          {[
            { k: "sp" as const, label: "Tanggal SP" },
            { k: "lead" as const, label: "Tanggal lead" },
          ].map((o) => (
            <button
              key={o.k}
              type="button"
              aria-pressed={dasar === o.k}
              onClick={() => setDasar(o.k)}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
                dasar === o.k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {q.isError ? (
        <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
      ) : q.isPending ? (
        <MemuatDaftar />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Win rate (lead matang = order + batal)</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Semua" nilai={persenWr(q.data.win_rate.semua)} sub={`${q.data.win_rate.semua.order}/${q.data.win_rate.semua.matang}`} />
              <Tile label="Pallet Mesh" nilai={persenWr(q.data.win_rate.pm)} sub={`${q.data.win_rate.pm.order}/${q.data.win_rate.pm.matang}`} />
              <Tile label="PM < 20u" nilai={persenWr(q.data.win_rate.pm_kecil_lt20)} sub={`${q.data.win_rate.pm_kecil_lt20.order}/${q.data.win_rate.pm_kecil_lt20.matang}`} />
              <Tile label="PM ≥ 20u" nilai={persenWr(q.data.win_rate.pm_besar_ge20)} sub={`${q.data.win_rate.pm_besar_ge20.order}/${q.data.win_rate.pm_besar_ge20.matang}`} />
            </div>
            <Tile
              label="Siklus rata-rata (masuk → SP)"
              nilai={q.data.siklus_hari_rata2 != null ? `${q.data.siklus_hari_rata2} hari` : "—"}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Per bulan</h2>
            {q.data.bulan.length === 0 ? (
              <Kosong>Belum ada data.</Kosong>
            ) : (
              <div className="space-y-2">
                {q.data.bulan.map((b) => (
                  <BlokBulan key={b.bulan} b={b} />
                ))}
              </div>
            )}
          </section>

          <Tabel
            judul="Per sumber"
            kolom={["Sumber", "Lead", "Order", "Omzet"]}
            baris={q.data.per_sumber.map((s) => [s.sumber, s.leads, s.order, rupiah(s.omzet)])}
          />
          <Tabel
            judul="Per produk"
            kolom={["Produk", "Lead", "Order", "Omzet"]}
            baris={q.data.per_produk.map((p) => [p.produk, p.leads, p.order, rupiah(p.omzet)])}
            catatan="Lead multi-produk dihitung di tiap produknya (jumlah bisa > total lead)."
          />
          <Tabel
            judul="Alasan batal"
            kolom={["Alasan", "Jumlah"]}
            baris={q.data.per_alasan_batal.map((a) => [a.alasan, a.jumlah])}
          />
        </>
      )}
    </div>
  );
}

export function LayarRingkasan() {
  return (
    <>
      <KepalaHalaman judul="Ringkasan Pipeline" kembali="/pipeline" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline perlu="ringkas">{() => <IsiRingkas />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
