"use client";

// Bagian "Order & lead lain pelanggan ini" di detail lead (database pelanggan, 20261017120000): ringkasan repeat order
// (sudah order berapa kali, total, order terakhir, lead ini order ke berapa) + 5 lead/order lain terbaru, dengan tautan
// ke log lengkap di halaman pelanggan. Data dari web_pipeline_pelanggan (cache sama dengan halaman pelanggan).
import { Repeat } from "lucide-react";
import Link from "next/link";

import { Chip } from "@/components/umum/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ringkasProduk, rupiah, tanggalLog } from "@/features/pipeline/konstanta";
import { nomorOrder } from "@/features/pipeline/pelanggan";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { usePelanggan } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { fmtTanggal } from "@/lib/tanggal";
import type { LeadDetail } from "@/types/domain";

const MAKS = 5;

export function RiwayatPelanggan({ lead }: { lead: LeadDetail }) {
  const { hariIni } = useProfil();
  const q = usePelanggan(lead.pelanggan.id);
  const href = `/pipeline/pelanggan/${encodeURIComponent(lead.pelanggan.id)}`;

  let isi;
  if (q.isPending) {
    isi = <Skeleton className="h-14 w-full rounded-xl" />;
  } else if (q.isError || !q.data || "digabung_ke" in q.data) {
    isi = (
      <p className="text-sm text-muted-foreground">
        Riwayat pelanggan belum bisa dimuat.{" "}
        <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => void q.refetch()}>
          Coba lagi
        </button>
      </p>
    );
  } else {
    const d = q.data;
    const urut = nomorOrder(d.leads);
    const ke = urut.get(lead.id);
    const lain = d.leads.filter((l) => l.id !== lead.id);
    const orderLain = d.ringkas.jml_order - (ke ? 1 : 0);
    isi = (
      <>
        <p className="text-sm" data-uji="ringkas-riwayat-pelanggan">
          {lain.length === 0 ? (
            "Lead pertama dari pelanggan ini."
          ) : orderLain > 0 ? (
            <>
              Pelanggan ini sudah order <span className="font-medium">{d.ringkas.jml_order}×</span> ({rupiah(d.ringkas.nilai_order)}
              ), terakhir {fmtTanggal(d.ringkas.order_terakhir, hariIni)}.{ke ? ` Lead ini = order ke-${ke}.` : ""}
            </>
          ) : (
            `Pelanggan lama: ${lain.length} lead lain, belum pernah order${ke ? " sebelum ini" : ""}.`
          )}
        </p>
        {lain.length ? (
          <ol className="space-y-1.5">
            {lain.slice(0, MAKS).map((l) => {
              const n = urut.get(l.id);
              return (
                <li key={l.id}>
                  <Link
                    href={`/pipeline/${encodeURIComponent(l.id)}`}
                    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"
                    data-uji="riwayat-pelanggan-lead"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{fmtTanggal(tanggalLog(l), hariIni)}</span>
                        {n ? (
                          <Chip nada={n > 1 ? "sukses" : "garis"}>
                            {n > 1 ? <Repeat aria-hidden /> : null}
                            Order ke-{n}
                          </Chip>
                        ) : (
                          <PilTahap tahap={l.tahap} />
                        )}
                      </span>
                      <span className="block truncate">{ringkasProduk(l.produk)}</span>
                    </span>
                    {n ? <span className="shrink-0 text-sm font-medium tabular-nums">{rupiah(l.nilai_transaksi)}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : null}
      </>
    );
  }

  return (
    <section aria-label="Order dan lead lain pelanggan ini" className="space-y-2" data-uji="riwayat-pelanggan">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Order &amp; lead lain pelanggan ini</h2>
        <Link href={href} className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline" data-uji="tautan-log-pelanggan">
          Lihat log lengkap
        </Link>
      </div>
      {isi}
    </section>
  );
}
