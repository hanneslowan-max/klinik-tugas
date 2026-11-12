"use client";

// Kartu "Asal lead per situs" (keputusan Hannes 11 Nov 2026, permintaan Yosie: lead Pallet Mesh dari website Hammerindo atau
// Palletmesh Indonesia). Data web_pipeline_asal_situs (20261111150000): lead masuk di rentang per kelompok sumber_bukti
// (kode Ref chat WA 0878, diisi agent sejak 21 Okt 2026), dua baris situs dirinci organik/form vs Google Ads. Saringan
// produk + rentang (bulan dasbor / sejak bukti dicatat). Angka lead → daftar lead tersaring (tautanAsal). Admin/baca melihat
// semua lead; rep hanya lead miliknya (server).
import { Fragment, useState } from "react";

import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labelRentangAsal, rentangAsal, sebelumBukti, tautanAsal, type PilihRentang, type SaringAsal } from "@/features/pipeline/asal-situs";
import { angka, namaBulan, persen, rasio, rupiahJuta } from "@/features/pipeline/dasbor";
import { Angka, Catatan, Kartu, Label, Sub } from "@/features/pipeline/dasbor-ui";
import { ASAL_SITUS, BUKTI_SEJAK, JALUR_ASAL, PRODUK, rupiah } from "@/features/pipeline/konstanta";
import { useAsalSitus } from "@/features/pipeline/queries";
import { cn } from "@/lib/utils";
import type { AngkaAsal, ProdukLead } from "@/types/domain";

const SEMUA = "Semua";

/** Sel angka satu baris: lead (bisa diklik), order, nilai order (juta; rupiah penuh di title), % jadi order. */
function SelAngka({ a, href }: { a: AngkaAsal; href: string }) {
  return (
    <>
      <td className="px-1.5 py-1.5 text-right sm:px-2" data-uji="asal-lead">
        {a.lead > 0 ? <Angka n={a.lead} href={href} /> : "0"}
      </td>
      <td className="px-1.5 py-1.5 text-right sm:px-2" data-uji="asal-order">
        {angka(a.order)}
      </td>
      <td className="px-1.5 py-1.5 text-right whitespace-nowrap sm:px-2" data-uji="asal-nilai" title={a.order > 0 ? rupiah(a.nilai) : undefined}>
        {a.order > 0 ? rupiahJuta(a.nilai) : "–"}
      </td>
      <td className="py-1.5 pl-1.5 text-right sm:pl-2">{a.lead > 0 ? persen(rasio(a.order, a.lead)) : "–"}</td>
    </>
  );
}

export function KartuAsalSitus({ bulan, hariIni, saya = false }: { bulan: string; hariIni: string; saya?: boolean }) {
  const [produk, setProduk] = useState<ProdukLead | null>(null);
  const [pilih, setPilih] = useState<PilihRentang>("bulan");
  const { sejak, sampai } = rentangAsal(pilih, bulan, hariIni);
  const q = useAsalSitus({ produk, sejak, sampai });
  const href = (s: Pick<SaringAsal, "kelompok" | "jalur">) => tautanAsal({ ...s, produk, sejak, sampai });
  const sejakBukti = labelRentangAsal(BUKTI_SEJAK, BUKTI_SEJAK);
  // HP: label pendek supaya dua pilihan tetap satu baris
  const opsiRentang: { k: PilihRentang; label: string; pendek: string }[] = [
    { k: "bulan", label: `${namaBulan(bulan, true)} ${bulan.slice(0, 4)}`, pendek: `${namaBulan(bulan)} ${bulan.slice(0, 4)}` },
    { k: "bukti", label: `Sejak bukti dicatat (${sejakBukti})`, pendek: `Sejak ${sejakBukti}` },
  ];

  return (
    <Kartu className="space-y-3" uji="kartu-asal-situs">
      <div className="space-y-2">
        <Label>
          Asal lead {saya ? "saya " : ""}per situs · <span data-uji="asal-rentang">{labelRentangAsal(sejak, sampai)}</span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={produk ?? SEMUA} onValueChange={(v) => setProduk(v === SEMUA ? null : (v as ProdukLead))}>
            <SelectTrigger className="h-8 w-44" aria-label="Produk" data-uji="asal-produk">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEMUA}>Semua produk</SelectItem>
              {PRODUK.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="group" aria-label="Rentang" className="inline-flex rounded-lg bg-muted p-[3px]">
            {opsiRentang.map((o) => (
              <button
                key={o.k}
                type="button"
                aria-pressed={pilih === o.k}
                onClick={() => setPilih(o.k)}
                title={o.label}
                data-uji={`asal-rentang-${o.k}`}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  pilih === o.k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="sm:hidden">{o.pendek}</span>
                <span className="max-sm:hidden">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {q.isError ? (
        <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
      ) : q.isPending ? (
        <MemuatDaftar baris={3} />
      ) : (
        <div className={cn("space-y-2 transition-opacity", q.isPlaceholderData && "opacity-60")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left font-medium">Asal</th>
                  <th className="px-1.5 py-1.5 text-right font-medium sm:px-2">Lead</th>
                  <th className="px-1.5 py-1.5 text-right font-medium sm:px-2">Order</th>
                  <th className="px-1.5 py-1.5 text-right font-medium sm:px-2">
                    Nilai<span className="max-sm:hidden"> order</span>
                  </th>
                  <th className="py-1.5 pl-1.5 text-right font-medium sm:pl-2">
                    %<span className="max-sm:hidden"> jadi</span> order
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {q.data.kelompok.map((k) => (
                  <Fragment key={k.kelompok}>
                    <tr className="border-b last:border-0" data-uji={`asal-${k.kelompok}`}>
                      <td className="py-1.5 pr-2 font-medium">{ASAL_SITUS[k.kelompok]}</td>
                      <SelAngka a={k} href={href({ kelompok: k.kelompok, jalur: null })} />
                    </tr>
                    {k.jalur?.map((j) => (
                      <tr key={j.jalur} className="border-b text-muted-foreground last:border-0" data-uji={`asal-${k.kelompok}-${j.jalur}`}>
                        <td className="py-1 pr-2 pl-4 text-xs">{JALUR_ASAL[j.jalur]}</td>
                        <SelAngka a={j} href={href({ kelompok: k.kelompok, jalur: j.jalur })} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="tabular-nums">
                <tr className="border-t font-semibold" data-uji="asal-total">
                  <td className="py-1.5 pr-2">Total{produk ? ` ${produk}` : ""}</td>
                  <SelAngka a={q.data.total} href={href({ kelompok: "semua", jalur: null })} />
                </tr>
              </tfoot>
            </table>
          </div>
          {sebelumBukti(sampai) ? (
            <Catatan uji="asal-sebelum-bukti">
              Bukti sumber baru dicatat otomatis sejak {sejakBukti}; lead sebelum itu tidak bisa dipisah per
              situs.
            </Catatan>
          ) : null}
          <Sub>
            Asal situs dibaca dari kode Ref di chat WA 0878 (otomatis sejak 21 Okt 2026). Chat dari aset WhatsApp di iklan Google tanpa
            membuka situs tidak membawa kode. Organik / form = tombol WA atau form situs; Google Ads = kode GA-RH / GA-OY.
          </Sub>
        </div>
      )}
    </Kartu>
  );
}
