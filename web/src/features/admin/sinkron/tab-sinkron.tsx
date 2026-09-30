"use client";

// Admin › Sinkron: laporan 20 run sinkron ClickUp terakhir (web_admin_sinkron). Run terbaru terbuka; tiap run
// menampilkan ringkasan, data ditulis, lampiran, ditandai hilang, space privat, pemakaian API ClickUp, galat, selisih
// sensus, dan rincian teknis (JSON). Pemformatan ada di format.ts (fungsi murni, diuji).
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useSinkronAdmin } from "@/features/admin/queries";
import { angka, rincianRun, type BagianRun, type TabelAngka } from "@/features/admin/sinkron/format";
import { cn } from "@/lib/utils";
import type { RunSinkron } from "@/types/domain";

export function TabSinkron() {
  const q = useSinkronAdmin();

  if (q.isPending) return <MemuatDaftar baris={3} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;

  return (
    <section className="space-y-3" aria-label="Sinkron">
      <p className="text-sm text-muted-foreground">
        Mode: {q.data.mode}. Sinkron otomatis dijalankan GitHub Actions (05:45 WIB); pemicu manual ada di Actions. Run terbaru
        terbuka; ketuk run lain untuk melihat hitungannya.
      </p>
      {q.data.runs.length === 0 ? (
        <Kosong>Belum ada run sinkron.</Kosong>
      ) : (
        <ul className="space-y-3" data-uji="daftar-sinkron">
          {q.data.runs.map((x, i) => (
            <KartuRun key={x.id} run={x} terbuka={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function KartuRun({ run, terbuka }: { run: RunSinkron; terbuka: boolean }) {
  const r = useMemo(() => rincianRun(run), [run]);
  return (
    <li className="rounded-xl border bg-card" data-run={r.id}>
      <details open={terbuka} className="group/run">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2.5 select-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/run:rotate-90" aria-hidden />
          <strong className="mr-auto text-sm font-semibold">{r.judul}</strong>
          <Chip nada={r.jumlahGalat ? "telat" : "sukses"}>{angka(r.jumlahGalat)} galat</Chip>
          <Chip nada={r.jumlahSelisih ? "hari-ini" : "sukses"}>{angka(r.jumlahSelisih)} selisih</Chip>
          <span className="basis-full pl-6 text-xs text-muted-foreground">{r.waktu}</span>
        </summary>
        <div className="space-y-4 border-t px-3 pt-3 pb-1">
          {r.bagian.length ? (
            r.bagian.map((b) => <Bagian key={b.judul} bagian={b} />)
          ) : (
            <p className="text-sm text-muted-foreground">Run ini tidak mencatat hitungan.</p>
          )}
          <details className="group/json">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open/json:rotate-90" aria-hidden />
              Rincian teknis (JSON)
            </summary>
            <pre className="mb-3 max-h-72 overflow-auto rounded-lg bg-muted p-2 font-mono text-xs" data-uji="sinkron-json">
              {r.json}
            </pre>
          </details>
        </div>
      </details>
    </li>
  );
}

function Bagian({ bagian: b }: { bagian: BagianRun }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold">{b.judul}</h3>
      {b.jenis === "tabel" ? (
        <Tabel tabel={b.tabel} />
      ) : b.jenis === "teks" ? (
        <p className="text-sm" data-uji={b.uji}>
          {b.teks}
        </p>
      ) : (
        <ul className="space-y-1 text-sm" data-uji={b.uji}>
          {b.butir.map((g, i) => (
            <li key={i} className="border-l-2 border-telat/40 pl-2">
              {g.konteks ? <span className="text-muted-foreground">{g.konteks}: </span> : null}
              <span className="font-mono text-xs break-all">{g.pesan}</span>
            </li>
          ))}
        </ul>
      )}
      {"catatan" in b && b.catatan ? <p className="text-xs text-muted-foreground">{b.catatan}</p> : null}
    </div>
  );
}

/** Tabel angka: kolom pertama = label baris; angka rata kanan; nol redup; angka bermasalah merah tebal. */
function Tabel({ tabel: t }: { tabel: TabelAngka }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-3xl border-collapse text-sm" data-uji={t.uji}>
        <thead>
          <tr className="border-b">
            {t.kepala.map((k, i) => (
              <th
                key={i}
                scope="col"
                className={cn("px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-muted-foreground", k.angka ? "text-right" : "text-left")}
              >
                {k.teks}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.baris.map((b, i) => (
            <tr key={i} className="border-b last:border-0">
              <th scope="row" className="min-w-[7em] px-2 py-1.5 text-left align-top font-medium">
                {b.label}
              </th>
              {b.sel.map((s, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-2 py-1.5 align-top",
                    s.angka ? "text-right whitespace-nowrap tabular-nums" : "break-words",
                    s.nol && "text-muted-foreground",
                    s.buruk && "font-bold text-telat",
                  )}
                  data-buruk={s.buruk || undefined}
                >
                  {s.teks}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
