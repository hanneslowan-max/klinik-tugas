"use client";

// Dasbor Pipeline Tahap 2 (mockup "Dashboard Pipeline Anvil" bagian 5–10 + kartu sales), data web_pipeline_dasbor_lanjut —
// dimuat terpisah dari bagian 1–4 supaya skor tampil dulu. Admin/baca: 5 Sumber lead & biaya iklan · 6 Pembayaran belum
// lunas · 7 Pembatalan · 8 Kualitas data · 9 Produk & pelanggan · 10 Tren. Sales: kartu "Pembayaran order saya" &
// "Rapikan lead saya" (server hanya mengirim miliknya). Biaya iklan diisi Agen Data Harian; admin bisa tempel dari sheet.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { bacaTempelan, pecahKiriman } from "@/features/pipeline/biaya-csv";
import {
  angka,
  kumulatif,
  labelTglBulan,
  namaBulan,
  namaHari,
  persen,
  rasio,
  rentangBulan,
  rupiahJuta,
  rupiahJuta2,
  rupiahRingkas,
  tambahHari,
  tautanDaftar,
  TARGET_OMZET,
  tglPendek,
} from "@/features/pipeline/dasbor";
import { Angka, Besar, Catatan, JudulBagian, Kartu, Label, namaSales, Sub } from "@/features/pipeline/dasbor-ui";
import { BUKTI_SUMBER } from "@/features/pipeline/konstanta";
import { useBiayaIklanSet } from "@/features/pipeline/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { DasborLanjutPenuh, DasborLanjutSales, DasborPipeline, PlatformIklan } from "@/types/domain";

const labelBukti = (k: string | null) => (k == null ? "Belum dicocokkan" : (BUKTI_SUMBER[k as keyof typeof BUKTI_SUMBER] ?? k));

/** Baris "label · bar · angka" (satu seri; bar relatif terhadap maks). */
function BarisBar({ label, n, maks, isi, uji }: { label: string; n: number; maks: number; isi?: React.ReactNode; uji?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,11.5rem)_minmax(2rem,1fr)_auto] items-center gap-2 text-sm" data-uji={uji}>
      <span className="truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2">
        <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${rasio(n, maks) * 100}%` }} />
      </div>
      <span className="text-right tabular-nums">{isi ?? angka(n)}</span>
    </div>
  );
}

// ------------------------------------------------------------------ 5 · sumber lead & biaya iklan
function KartuBiayaGoogle({ d, bolehTempel, tempel }: { d: DasborLanjutPenuh; bolehTempel: boolean; tempel: () => void }) {
  const ik = d.iklan;
  const tombol = bolehTempel ? (
    <Button type="button" variant="outline" size="sm" onClick={tempel} data-uji="buka-tempel-biaya">
      Tempel biaya iklan
    </Button>
  ) : null;
  if (!ik.sampai) {
    return (
      <Kartu className="space-y-2" uji="kartu-biaya-google">
        <Label>Biaya Google Ads · {namaBulan(d.bulan, true)}</Label>
        <p className="text-sm">Belum ada data biaya Google Ads bulan ini di Anvil.</p>
        <Sub>Agen Data Harian mengirim biaya iklan tiap hari lewat API; admin juga bisa menempel tabel dari sheet.</Sub>
        {tombol}
      </Kartu>
    );
  }
  const g = ik.google;
  const lg = ik.lead_google;
  const rentang = `1–${tglPendek(ik.sampai)}`;
  return (
    <Kartu className="space-y-3" uji="kartu-biaya-google">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label>Biaya Google Ads per hasil · {rentang}</Label>
          <Besar uji="biaya-google">{rupiahJuta2(g.biaya)}</Besar>
          <Sub>{angka(g.klik)} klik</Sub>
        </div>
        {tombol}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Per konversi tercatat Ads ({angka(g.konversi)})</dt>
        <dd className="text-right font-medium tabular-nums">{g.konversi > 0 ? rupiahRingkas(g.biaya / g.konversi) : "—"}</dd>
        <dt className="text-muted-foreground">Per lead Anvil bersumber Google Ads ({lg.lead})</dt>
        <dd className="text-right font-medium tabular-nums" data-uji="biaya-per-lead">
          {lg.lead > 0 ? rupiahRingkas(g.biaya / lg.lead) : "—"}
        </dd>
        <dt className="text-muted-foreground">Per order dari lead itu ({lg.order})</dt>
        <dd className="text-right font-medium tabular-nums">{lg.order > 0 ? rupiahRingkas(g.biaya / lg.order) : "—"}</dd>
        <dt className="text-muted-foreground">Omzet dari lead itu</dt>
        <dd className="text-right font-medium tabular-nums">{rupiahJuta(lg.omzet)}</dd>
      </dl>
      {g.konversi > lg.lead ? (
        <Catatan>
          Ads mencatat {angka(g.konversi)} konversi, Anvil hanya {lg.lead} lead berlabel Google Ads ({rentang}). Biaya per lead dan per
          order di sini batas atas: sebagian lead iklan tercatat &quot;Lainnya&quot; atau &quot;WA langsung&quot;.
        </Catatan>
      ) : null}
      {ik.diisi_pada ? (
        <Sub>
          Data biaya diperbarui{" "}
          {new Date(ik.diisi_pada).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}{" "}
          WIB
        </Sub>
      ) : null}
    </Kartu>
  );
}

function KartuKampanye({ d }: { d: DasborLanjutPenuh }) {
  const k = d.iklan.kampanye;
  if (!k.length) return null;
  const maks = Math.max(...k.map((x) => x.biaya));
  const kelompok: { p: PlatformIklan; judul: string }[] = [
    { p: "google", judul: "Google Ads" },
    { p: "meta", judul: "Meta Ads" },
  ];
  return (
    <Kartu className="space-y-3" uji="kartu-kampanye">
      <Label>Biaya per campaign · {namaBulan(d.bulan, true)}</Label>
      {kelompok.map(({ p, judul }) => {
        const baris = k.filter((x) => x.platform === p);
        return (
          <div key={p} className="space-y-1.5">
            <div className="text-xs font-medium">{judul}</div>
            {baris.length ? (
              baris.map((x) => (
                <BarisBar key={x.campaign} label={x.campaign} n={x.biaya} maks={maks} isi={rupiahJuta2(x.biaya)} uji="baris-kampanye" />
              ))
            ) : (
              <Sub>Belum ada biaya {judul} tercatat bulan ini; baris muncul otomatis begitu iklannya tayang.</Sub>
            )}
          </div>
        );
      })}
    </Kartu>
  );
}

function BagianSumber({ d, bolehTempel, tempel }: { d: DasborLanjutPenuh; bolehTempel: boolean; tempel: () => void }) {
  const ada = d.sumber.filter((s) => s.lead > 0);
  const nol = d.sumber.filter((s) => s.lead === 0);
  const total = d.sumber.reduce((n, s) => n + s.lead, 0);
  const lainnya = d.sumber.find((s) => s.sumber === "Lainnya")?.lead ?? 0;
  const berbukti = d.bukti.filter((b) => b.kelas && b.kelas !== "tanpa-sinyal").reduce((n, b) => n + b.lead, 0);
  const maksBukti = Math.max(1, ...d.bukti.map((b) => b.lead));
  const bln = namaBulan(d.bulan, true);
  return (
    <section className="space-y-2" data-uji="dasbor-sumber">
      <JudulBagian no={5}>Sumber lead &amp; biaya iklan</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-2">
        <Kartu className="space-y-2">
          <Label>Lead masuk {bln} per Sumber (isian sales)</Label>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left font-medium">Sumber</th>
                  <th className="px-2 py-1.5 text-right font-medium">Lead</th>
                  <th className="px-2 py-1.5 text-right font-medium">Order</th>
                  <th className="px-2 py-1.5 text-right font-medium">Konversi</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Omzet</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {ada.map((s) => (
                  <tr key={s.sumber} className="border-b last:border-0" data-uji="baris-sumber">
                    <td className="py-1.5 pr-2">{s.sumber}</td>
                    <td className="px-2 py-1.5 text-right">
                      {s.sumber === "Lainnya" ? <Angka n={s.lead} href={tautanDaftar("sumber_lainnya", "semua", d.bulan)} /> : angka(s.lead)}
                    </td>
                    <td className="px-2 py-1.5 text-right">{angka(s.order)}</td>
                    <td className="px-2 py-1.5 text-right">{persen(rasio(s.order, s.lead))}</td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap">{rupiahJuta(s.omzet)}</td>
                  </tr>
                ))}
                {nol.length ? (
                  <tr className="text-muted-foreground">
                    <td className="py-1.5 pr-2">{nol.map((s) => s.sumber).join(" · ")}</td>
                    <td className="px-2 py-1.5 text-right">0</td>
                    <td className="px-2 py-1.5 text-right">0</td>
                    <td className="px-2 py-1.5 text-right">–</td>
                    <td className="py-1.5 pl-2 text-right">–</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Kartu>
        <Kartu className="space-y-2" uji="kartu-bukti">
          <Label>Bukti sumber dari chat WA 0878 (lead {bln})</Label>
          {d.bukti.map((b) => (
            <BarisBar key={b.kelas ?? "belum"} label={labelBukti(b.kelas)} n={b.lead} maks={maksBukti} />
          ))}
          <p className="text-xs text-muted-foreground">
            Lead dengan bukti sumber:{" "}
            <b className="text-foreground">
              {angka(berbukti)} dari {angka(total)} ({persen(rasio(berbukti, total))})
            </b>
            . Sumber &quot;Lainnya&quot;: <Angka n={lainnya} href={tautanDaftar("sumber_lainnya", "semua", d.bulan)} /> (
            {persen(rasio(lainnya, total))}).
          </p>
        </Kartu>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <KartuBiayaGoogle d={d} bolehTempel={bolehTempel} tempel={tempel} />
        <KartuKampanye d={d} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 6 · pembayaran belum lunas
function rincianBayar(x: { kosong: number; belum: number; dp: number; tua: number }): string {
  const bagian = [
    x.kosong ? `${x.kosong} status bayar belum dicatat` : "",
    x.belum ? `${x.belum} belum bayar` : "",
    x.dp ? `${x.dp} DP` : "",
    x.tua ? `${x.tua} umur SP >30 hari` : "",
  ].filter(Boolean);
  return bagian.join(", ");
}

function BagianBayar({ d }: { d: DasborLanjutPenuh }) {
  const total = d.bayar.reduce((n, x) => n + x.order, 0);
  const kosong = d.bayar.reduce((n, x) => n + x.kosong, 0);
  return (
    <section className="space-y-2" data-uji="dasbor-bayar">
      <JudulBagian no={6}>Pembayaran belum lunas</JudulBagian>
      <Kartu className="space-y-2">
        <Label>Order dengan SP sejak {tglPendek(d.sejak_bayar)}, status bukan LUNAS</Label>
        {d.bayar.length === 0 ? (
          <p className="text-sm">Semua order 90 hari terakhir sudah LUNAS.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left font-medium">Sales</th>
                  <th className="px-2 py-1.5 text-right font-medium">Order</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Nilai</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.bayar.map((x) => (
                  <tr key={x.pemilik ?? "tanpa"} className="border-b last:border-0" data-uji="baris-bayar">
                    <td className="py-1.5 pr-2">{namaSales(x.nama, x.pemilik)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Angka n={x.order} href={tautanDaftar("bayar_belum_lunas", x.pemilik, d.bulan)} uji="bayar-order" />
                    </td>
                    <td className="py-1.5 pl-2 text-right">{rupiahJuta(x.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {d.bayar.map((x) => `${namaSales(x.nama, x.pemilik)}: ${rincianBayar(x)}.`).join(" ")}
            </p>
            {kosong * 2 >= total ? (
              <Catatan>
                Sebagian besar karena status bayar belum diisi, belum tentu pelanggan belum bayar. Angka ini baru bisa dipakai menagih
                setelah status bayar rutin diisi.
              </Catatan>
            ) : null}
          </>
        )}
      </Kartu>
    </section>
  );
}

// ------------------------------------------------------------------ 7 · pembatalan
function BagianBatal({ d }: { d: DasborLanjutPenuh }) {
  const b = d.batal;
  const maks = Math.max(1, ...b.alasan.map((a) => a.lead));
  return (
    <section className="space-y-2" data-uji="dasbor-batal">
      <JudulBagian no={7}>Pembatalan {namaBulan(d.bulan, true)}</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-2">
        <Kartu className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Besar uji="batal-total">
              <Angka n={b.lead} href={tautanDaftar("dibatalkan", "semua", d.bulan)} />
            </Besar>
            <Sub>
              lead dibatalkan · {b.fu_kurang2} dengan FU &lt;2 kali
            </Sub>
          </div>
          {b.alasan.map((a) => (
            <BarisBar key={a.alasan} label={a.alasan} n={a.lead} maks={maks} uji="baris-alasan" />
          ))}
          {b.impor > 0 ? (
            <Sub>
              {b.impor} lead berstatus BATAL dari impor data lama tidak dihitung: tanggal batal aslinya tidak diketahui.
            </Sub>
          ) : null}
        </Kartu>
        <Kartu className="space-y-2">
          <Label>Lonjakan (≥5 batal per sales per hari)</Label>
          {b.lonjakan.length ? (
            <ul className="space-y-1 text-sm tabular-nums" data-uji="lonjakan-batal">
              {b.lonjakan.map((x) => (
                <li key={`${x.tanggal}-${x.pemilik ?? "tanpa"}`}>
                  {tglPendek(x.tanggal)} · {namaSales(x.nama, x.pemilik)} {x.lead}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tidak ada.</p>
          )}
          <Sub>Dihitung dari perubahan tahap ke BATAL yang dicatat di Anvil pada bulan ini; FU = aktivitas tercatat sebelum batal.</Sub>
        </Kartu>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 8 · kualitas data
function BagianKualitas({ d, d1 }: { d: DasborLanjutPenuh; d1: DasborPipeline }) {
  const k = d.kualitas;
  const bln = namaBulan(d.bulan);
  const pmTanpa = d1.pm.terbuka - d1.pm.terbuka_bernilai;
  const qty = d1.pm_qty_terisi ?? { lebih_1: 0, lead: 0 };
  const ubin: { label: string; isi: React.ReactNode; uji: string }[] = [
    { label: `Lead ${bln} nama pelanggan "-"`, isi: <Angka n={k.nama_kosong} href={tautanDaftar("nama_kosong", "semua", d.bulan)} />, uji: "kual-nama" },
    { label: `Lead ${bln} Sumber "Lainnya"`, isi: <Angka n={k.sumber_lainnya} href={tautanDaftar("sumber_lainnya", "semua", d.bulan)} />, uji: "kual-lainnya" },
    { label: `Lead ${bln} tanpa bukti sumber`, isi: <Angka n={k.tanpa_bukti} href={tautanDaftar("tanpa_bukti", "semua", d.bulan)} />, uji: "kual-bukti" },
    {
      label: "Lead PM terbuka tanpa nilai penawaran",
      isi: (
        <>
          <Angka n={pmTanpa} href={tautanDaftar("pm_tanpa_nilai", "semua", d.bulan)} />/{angka(d1.pm.terbuka)}
        </>
      ),
      uji: "kual-pm-nilai",
    },
    { label: "Lead PM ber-qty 1 (bawaan)", isi: `${angka(qty.lead - qty.lebih_1)}/${angka(qty.lead)}`, uji: "kual-pm-qty" },
    {
      label: `Order ${bln} tanpa status bayar`,
      isi: (
        <>
          <Angka n={k.order_tanpa_bayar} href={tautanDaftar("order_tanpa_bayar", "semua", d.bulan)} />/{angka(k.order)}
        </>
      ),
      uji: "kual-bayar",
    },
  ];
  return (
    <section className="space-y-2" data-uji="dasbor-kualitas">
      <JudulBagian no={8}>Kualitas data</JudulBagian>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {ubin.map((u) => (
          <Kartu key={u.uji}>
            <Label>{u.label}</Label>
            <div className="text-xl font-semibold tabular-nums" data-uji={u.uji}>
              {u.isi}
            </div>
          </Kartu>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Pelanggan dengan lebih dari 1 lead terbuka: {angka(k.dobel.pelanggan)} pelanggan (
        <Angka n={k.dobel.lead} href={tautanDaftar("lead_dobel", "semua", d.bulan)} uji="kual-dobel" /> lead), kandidat dobel untuk dicek di{" "}
        <Link href="/pipeline/pelanggan/dobel" className="text-primary underline-offset-4 hover:underline">
          layar Dobel
        </Link>
        .
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ 9 · produk & pelanggan
function BagianProduk({ d }: { d: DasborLanjutPenuh }) {
  const omzet = d.produk.reduce((n, p) => n + p.omzet, 0);
  const gabungan = d.produk.flatMap((p) => p.gabungan);
  return (
    <section className="space-y-2" data-uji="dasbor-produk">
      <JudulBagian no={9}>Produk &amp; pelanggan · {namaBulan(d.bulan, true)}</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Kartu className="space-y-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 text-left font-medium">Kategori</th>
                <th className="px-2 py-1.5 text-right font-medium">Lead</th>
                <th className="px-2 py-1.5 text-right font-medium">Order</th>
                <th className="py-1.5 pl-2 text-right font-medium">Omzet</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {d.produk.map((p) => (
                <tr key={p.produk} className="border-b last:border-0" data-uji="baris-produk">
                  <td className="py-1.5 pr-2">{p.produk}</td>
                  <td className="px-2 py-1.5 text-right">{angka(p.lead)}</td>
                  <td className="px-2 py-1.5 text-right">{angka(p.order)}</td>
                  <td className="py-1.5 pl-2 text-right">{rupiahJuta(p.omzet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Sub>
            Kategori menurut produk pertama di lead; lead = masuk bulan ini, order &amp; omzet = SP bulan ini.
            {gabungan.length ? ` "Lainnya" termasuk ${gabungan.join(" dan ")}.` : ""}
          </Sub>
        </Kartu>
        <div className="grid gap-2">
          <Kartu uji="kartu-pelanggan-lama">
            <Label>Order dari pelanggan lama</Label>
            <Besar>
              {angka(d.pelanggan_lama.order)} <span className="text-sm font-normal text-muted-foreground">dari {angka(d.kualitas.order)}</span>
            </Besar>
            <Sub>
              {rupiahJuta(d.pelanggan_lama.omzet)} · {persen(rasio(d.pelanggan_lama.omzet, omzet))} omzet
            </Sub>
          </Kartu>
          <Kartu uji="kartu-tidur">
            <Label>Pelanggan tidur &gt;90 hari</Label>
            <Besar>{angka(d.tidur.tidur)}</Besar>
            <Sub>
              dari {angka(d.tidur.pernah)} yang pernah order · nilai historis {rupiahJuta(d.tidur.nilai)}. Tidur = tidak ada lead masuk 90
              hari terakhir dan tidak ada lead terbuka.
            </Sub>
          </Kartu>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 10 · tren
/** Kolom per minggu (satu seri; label hanya puncak & minggu terakhir, nilai lain lewat title / tabel tersembunyi). */
function KolomMingguan({ judul, data, nilai }: { judul: string; data: DasborLanjutPenuh["minggu"]; nilai: (m: DasborLanjutPenuh["minggu"][number]) => number }) {
  const v = data.map(nilai);
  const maks = Math.max(1, ...v);
  const iMaks = v.indexOf(Math.max(...v));
  const TINGGI = 96;
  return (
    <figure className="min-w-0">
      <figcaption className="text-xs text-muted-foreground">{judul}</figcaption>
      <div className="mt-2 flex items-end gap-1" style={{ height: TINGGI + 16 }} aria-hidden>
        {data.map((m, i) => {
          const sebagian = m.sampai < tambahHari(m.mulai, 6);
          return (
            <div key={m.mulai} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`Minggu ${labelTglBulan(m.mulai)}: ${v[i]}`}>
              {i === iMaks || i === data.length - 1 ? <span className="mb-0.5 text-[10px] text-muted-foreground tabular-nums">{v[i]}</span> : null}
              <div
                className={cn("w-full max-w-6 rounded-t-[4px]", sebagian ? "bg-primary/45" : "bg-primary")}
                style={{ height: Math.max(v[i] > 0 ? 2 : 0, (v[i] / maks) * TINGGI) }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {data.map((m, i) => (
          // label tiap 4 minggu + minggu terakhir (13 label penuh bertumpuk); semua angka ada di tabel tersembunyi & title
          // label ujung rata ke dalam supaya tidak keluar dari grafik (bertabrakan dengan grafik sebelah)
          <span
            key={m.mulai}
            className={cn(
              "min-w-0 flex-1 overflow-visible text-[10px] whitespace-nowrap text-muted-foreground tabular-nums",
              i === 0 ? "text-left" : i === data.length - 1 ? "text-right" : "text-center",
            )}
          >
            {i % 4 === 0 || i === data.length - 1 ? labelTglBulan(m.mulai) : ""}
            {i === data.length - 1 && m.sampai < tambahHari(m.mulai, 6) ? "*" : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{judul}</caption>
        <tbody>
          {data.map((m, i) => (
            <tr key={m.mulai}>
              <th>{m.mulai}</th>
              <td>{v[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function useLebar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [lebar, setLebar] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLebar(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, lebar] as const;
}

/** Skala sumbu Y "rapi": 0, 200 jt, 400 jt, … */
function langkahRapi(maks: number): number {
  const kasar = maks / 3;
  const p = 10 ** Math.floor(Math.log10(kasar));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= kasar) ?? kasar;
}

function GrafikKumulatif({ d }: { d: DasborLanjutPenuh }) {
  const [ref, W] = useLebar<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const bulanLalu = rentangBulan(tambahHari(`${d.bulan}-01`, -1).slice(0, 7));
  const hariLalu = Number(bulanLalu.akhir.slice(8, 10));
  const hariIni = Number(d.batas.slice(8, 10));
  const ini = kumulatif(d.harian.bulan, hariIni);
  const lalu = kumulatif(d.harian.lalu, hariLalu);
  const target = TARGET_OMZET.tim;
  const langkah = langkahRapi(Math.max(target, ini.at(-1) ?? 0, lalu.at(-1) ?? 0));
  const atas = Math.ceil(Math.max(target, ini.at(-1) ?? 0, lalu.at(-1) ?? 0) / langkah) * langkah;
  const H = 220;
  const pad = { l: 48, r: 12, t: 12, b: 22 };
  const x = (hari: number) => pad.l + ((hari - 1) / 30) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / atas) * (H - pad.t - pad.b);
  const garis = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(atas / langkah) + 1 }, (_, i) => i * langkah);
  const bIni = namaBulan(d.bulan);
  const bLalu = namaBulan(bulanLalu.awal.slice(0, 7));
  const pilih = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const hari = Math.round(((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * 30) + 1;
    setHover(hari >= 1 && hari <= 31 ? hari : null);
  };
  return (
    <figure className="min-w-0" data-uji="grafik-kumulatif">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-primary" aria-hidden />
          {bIni} (s/d {tglPendek(d.batas)} {rupiahJuta(ini.at(-1) ?? 0)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-muted-foreground/60" aria-hidden />
          {bLalu} (akhir {rupiahJuta(lalu.at(-1) ?? 0)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-foreground/40" aria-hidden />
          Target {rupiahJuta(target)}
        </span>
      </figcaption>
      <div ref={ref} className="relative mt-2">
        <svg width={W} height={H} className="block max-w-full" role="img" aria-label={`Omzet kumulatif ${bIni} dibanding ${bLalu}`} onPointerMove={pilih} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {t === 0 ? "0" : `${Math.round(t / 1_000_000)} jt`}
              </text>
            </g>
          ))}
          {[1, 15, 30].map((h) => (
            <text key={h} x={x(h)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
              {h}
            </text>
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="stroke-foreground/40" strokeWidth={1} />
          <path d={garis(lalu)} fill="none" className="stroke-muted-foreground/60" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={garis(ini)} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {ini.length ? <circle cx={x(ini.length)} cy={y(ini.at(-1)!)} r={4} className="fill-primary stroke-card" strokeWidth={2} /> : null}
          {hover ? <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-foreground/30" strokeWidth={1} /> : null}
        </svg>
        {hover ? (
          <div
            className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm tabular-nums"
            style={{ left: Math.min(Math.max(0, x(hover) - 70), W - 150) }}
          >
            <div>
              {hover} {bIni}: {hover <= ini.length ? rupiahJuta(ini[hover - 1]) : "—"}
            </div>
            <div className="text-muted-foreground">
              {hover} {bLalu}: {hover <= lalu.length ? rupiahJuta(lalu[hover - 1]) : "—"}
            </div>
          </div>
        ) : null}
      </div>
      <Sub>Sumbu bawah = tanggal; omzet menurut tanggal SP.</Sub>
    </figure>
  );
}

function BagianTren({ d }: { d: DasborLanjutPenuh }) {
  const akhir = d.minggu.at(-1);
  const sebagian = akhir && akhir.sampai < tambahHari(akhir.mulai, 6);
  return (
    <section className="space-y-2" data-uji="dasbor-tren">
      <JudulBagian no={10}>Tren mingguan · lead &amp; order</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-2">
        <Kartu className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <KolomMingguan judul="Lead masuk per minggu" data={d.minggu} nilai={(m) => m.lead} />
            <KolomMingguan judul="Order per minggu (tanggal SP)" data={d.minggu} nilai={(m) => m.order} />
          </div>
          <Sub>
            Minggu mulai Senin.
            {sebagian && akhir
              ? ` *Minggu ${labelTglBulan(akhir.mulai)} baru Senin–${namaHari(akhir.sampai)}: ${akhir.lead} lead, ${akhir.order} order.`
              : ""}
          </Sub>
        </Kartu>
        <Kartu>
          <Label>
            Omzet kumulatif: {namaBulan(d.bulan, true)} vs {namaBulan(rentangBulan(tambahHari(`${d.bulan}-01`, -1).slice(0, 7)).awal.slice(0, 7), true)}
          </Label>
          <GrafikKumulatif d={d} />
        </Kartu>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ tempel biaya iklan (admin)
export function DialogBiayaIklan({ buka, ubahBuka }: { buka: boolean; ubahBuka: (b: boolean) => void }) {
  const [platform, setPlatform] = useState<PlatformIklan>("google");
  const [teks, setTeks] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const simpan = useBiayaIklanSet();
  const hasil = teks.trim() ? bacaTempelan(teks, platform) : null;
  const items = hasil?.items ?? [];
  const total = items.reduce((n, x) => n + x.biaya, 0);
  const kirim = async () => {
    setGalat(null);
    try {
      const r = await simpan.mutateAsync(pecahKiriman(items));
      const jml = (k: "baru" | "diubah" | "dihapus") => r.reduce((n, x) => n + x[k], 0);
      toast.success(`Biaya iklan tersimpan: ${jml("baru")} baru, ${jml("diubah")} diubah, ${jml("dihapus")} campaign lama dihapus`);
      setTeks("");
      ubahBuka(false);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };
  return (
    <Lembar
      buka={buka}
      ubahBuka={ubahBuka}
      judul="Tempel biaya iklan"
      deskripsi="Salin tabel dari sheet (judul kolom: Tanggal, Campaign, Biaya; Klik, Tayang, Konversi boleh) lalu tempel di sini. Hari yang ditempel menggantikan data hari itu untuk platform yang dipilih."
      lebar
      data-uji="dialog-biaya-iklan"
      kaki={
        <>
          <Button type="button" variant="outline" onClick={() => ubahBuka(false)}>
            Batal
          </Button>
          <Button type="button" onClick={kirim} disabled={!items.length || simpan.isPending} data-uji="simpan-biaya">
            {simpan.isPending ? "Menyimpan…" : `Simpan ${items.length || ""} baris`}
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-5">
        <div role="group" aria-label="Platform" className="inline-flex rounded-lg bg-muted p-[3px]">
          {(
            [
              { k: "google", label: "Google Ads" },
              { k: "meta", label: "Meta Ads" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              aria-pressed={platform === o.k}
              onClick={() => setPlatform(o.k)}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors",
                platform === o.k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <Textarea
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          rows={8}
          placeholder={"Tanggal\tCampaign\tBiaya\tKlik\tKonversi\n27/10/2026\tGeneral Roda\t512.345\t120\t31,5"}
          // field-sizing-fixed: tempelan bertab tidak boleh melebarkan lembar melebihi layar HP (tombol Simpan tertutup)
          className="field-sizing-fixed h-40 min-w-0 resize-y font-mono text-xs [overflow-wrap:anywhere]"
          aria-label="Tabel biaya iklan"
          data-uji="tempel-biaya"
        />
        {hasil?.galat ? <KotakPesan nada="galat">{hasil.galat}</KotakPesan> : null}
        {items.length ? (
          <p className="text-sm" data-uji="ringkas-tempel">
            {items.length} baris · {tglPendek(items[0].tanggal)}–{tglPendek(items.at(-1)!.tanggal)} ·{" "}
            {new Set(items.map((x) => x.campaign)).size} campaign · total {rupiahJuta2(total)}
          </p>
        ) : null}
        {hasil?.lewati.length ? (
          <div className="text-xs text-muted-foreground">
            {hasil.lewati.length} baris dilewati:{" "}
            {hasil.lewati
              .slice(0, 5)
              .map((x) => `baris ${x.baris} (${x.alasan})`)
              .join("; ")}
            {hasil.lewati.length > 5 ? "; …" : ""}
          </div>
        ) : null}
        {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      </div>
    </Lembar>
  );
}

// ------------------------------------------------------------------ rakitan
export function BagianLanjutAdmin({
  q,
  d1,
  bolehTempel,
}: {
  q: { data?: DasborLanjutPenuh | DasborLanjutSales; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  d1: DasborPipeline;
  bolehTempel: boolean;
}) {
  const [tempel, setTempel] = useState(false);
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => void q.refetch()} />;
  if (q.isPending || !q.data) return <MemuatDaftar baris={3} />;
  if (q.data.peran !== "penuh") return null;
  const d = q.data;
  return (
    <>
      <BagianSumber d={d} bolehTempel={bolehTempel} tempel={() => setTempel(true)} />
      <BagianBayar d={d} />
      <BagianBatal d={d} />
      <BagianKualitas d={d} d1={d1} />
      <BagianProduk d={d} />
      <BagianTren d={d} />
      {bolehTempel ? <DialogBiayaIklan buka={tempel} ubahBuka={setTempel} /> : null}
    </>
  );
}

export function KartuSalesLanjut({ d, saya }: { d: DasborLanjutSales; saya: number | null }) {
  const b = d.bayar_saya;
  const r = d.rapikan;
  const bln = namaBulan(d.bulan, true);
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <Kartu className="space-y-2" uji="sales-bayar">
        <JudulBagian>Pembayaran order saya</JudulBagian>
        {b.order ? (
          <>
            <Besar>
              <Angka n={b.order} href={tautanDaftar("bayar_belum_lunas", saya, d.bulan)} uji="bayar-saya" />
            </Besar>
            <Sub>
              order belum LUNAS · {rupiahJuta(b.nilai)} (SP sejak {tglPendek(d.sejak_bayar)})
            </Sub>
            <p className="text-sm">
              {[b.kosong ? `${b.kosong} belum diisi status bayarnya` : "", b.belum ? `${b.belum} belum bayar` : "", b.dp ? `${b.dp} DP` : ""]
                .filter(Boolean)
                .join(", ")}
              . Isi status bayar di tiap order (Belum / DP / Lunas).
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={tautanDaftar("bayar_belum_lunas", saya, d.bulan)}>Isi status bayar</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm">Semua order Anda 90 hari terakhir sudah LUNAS.</p>
        )}
      </Kartu>
      <Kartu className="space-y-2" uji="sales-rapikan">
        <JudulBagian>Rapikan lead {bln} saya</JudulBagian>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
          <dt>Nama pelanggan masih &quot;-&quot;</dt>
          <dd className="text-right font-semibold">
            <Angka n={r.nama_kosong} href={tautanDaftar("nama_kosong", saya, d.bulan)} uji="rapikan-nama" />
          </dd>
          <dt>Sumber &quot;Lainnya&quot;</dt>
          <dd className="text-right font-semibold">
            <Angka n={r.sumber_lainnya} href={tautanDaftar("sumber_lainnya", saya, d.bulan)} uji="rapikan-lainnya" />
          </dd>
          <dt>Lead {bln} yang BATAL</dt>
          <dd className="text-right font-semibold">
            <Angka n={r.batal} href={tautanDaftar("batal_masuk", saya, d.bulan)} uji="rapikan-batal" />
          </dd>
        </dl>
        <Sub>
          Dari {r.lead} lead masuk {bln}. Sumber = asal pelanggan (Google, iklan, akun Bu Lastri), bukan media chat.
        </Sub>
      </Kartu>
    </div>
  );
}
