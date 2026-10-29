"use client";

// Dasbor Pipeline Tahap 1 (brief Hannes 29 Okt 2026; mockup "Dashboard Pipeline Anvil"), data web_pipeline_dasbor.
// Admin/baca: 1 Skor bulan ini · 2 Kesehatan follow-up per sales · 3 Corong per bulan lead masuk · 4 Fokus Pallet Mesh.
// Sales (rep): "milik saya" — server hanya mengirim angka miliknya + omzet tim (progres target tim); bagian penuh tidak
// ada di data, bukan sekadar disembunyikan. Angka bergaris titik → daftar lead yang dihitung (/pipeline?kes=…).
// Bulan dipilih di ?bulan=YYYY-MM (kosong = bulan berjalan). Target & ambang di dasbor.ts.
import { Info } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AksiPipeline } from "@/features/pipeline/aksi-pipeline";
import {
  angka,
  awalBasis90,
  daftarBulan,
  labelRentang,
  labelSisa,
  namaBulan,
  nilaiPenawaranValid,
  persen,
  persenBulat,
  perubahan,
  rasio,
  rupiahJuta,
  siklusValid,
  skorTarget,
  splitQtyValid,
  tautanDaftar,
  TARGET_OMZET,
  targetSales,
  tglPendek,
} from "@/features/pipeline/dasbor";
import { DialogFu } from "@/features/pipeline/dialog-fu";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { ringkasProduk } from "@/features/pipeline/konstanta";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { useDasborPipeline } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { fmtTanggal, fmtTanggalPanjang } from "@/lib/tanggal";
import { gantiUrl } from "@/lib/url-dangkal";
import { cn } from "@/lib/utils";
import type { BulanCorong, DasborPipeline, JumlahMenang, KesehatanSales, MetrikDasbor } from "@/types/domain";

// ------------------------------------------------------------------ kepingan
function Kartu({ children, className, uji }: { children: ReactNode; className?: string; uji?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)} data-uji={uji}>
      {children}
    </div>
  );
}

function JudulBagian({ no, children }: { no?: number; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      {no ? (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary tabular-nums">
          {no}
        </span>
      ) : null}
      {children}
    </h2>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}

function Besar({ children, uji }: { children: ReactNode; uji?: string }) {
  return (
    <div className="text-2xl font-semibold tabular-nums" data-uji={uji}>
      {children}
    </div>
  );
}

function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-xs text-muted-foreground", className)}>{children}</div>;
}

/** Progres ke target (satu seri: tanpa legenda; angkanya tertulis di samping). */
function Meter({ r, label, className }: { r: number; label: string; className?: string }) {
  const p = Math.max(0, Math.min(1, r));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(r * 100)}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

/** Angka yang membuka daftar lead di baliknya. */
function Angka({ n, href, uji, className }: { n: number; href: string; uji?: string; className?: string }) {
  return (
    <Link
      href={href}
      data-uji={uji}
      className={cn(
        "tabular-nums underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 hover:text-primary hover:decoration-primary",
        className,
      )}
    >
      {angka(n)}
    </Link>
  );
}

/** Catatan "kenapa angka ini kosong / belum valid" (oranye lembut, ikon + teks). */
function Catatan({ children, uji }: { children: ReactNode; uji?: string }) {
  return (
    <p className="flex gap-2 rounded-lg bg-hari-ini-lembut px-3 py-2 text-xs text-foreground" data-uji={uji}>
      <Info className="mt-px size-3.5 shrink-0 text-hari-ini" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const namaSales = (nama: string | null, pemilik: number | null) => (pemilik == null ? "Tanpa pemilik" : (nama ?? `#${pemilik}`));

// ------------------------------------------------------------------ 1 · skor bulan ini (admin)
function BagianSkor({ d }: { d: DasborPipeline }) {
  const s = d.skor;
  const st = skorTarget({ omzet: s.omzet, target: TARGET_OMZET.tim, bulan: d.bulan, hariIni: d.hari_ini });
  const lalu = labelRentang(d.batas_lalu);
  const win = d.win_pm ?? { order: 0, lead: 0 };
  const ubahLead = perubahan(s.lead_masuk, s.lead_masuk_lalu);
  return (
    <section className="space-y-2" data-uji="dasbor-skor">
      <JudulBagian no={1}>Skor bulan ini</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Kartu className="space-y-2">
          <Label>Omzet {namaBulan(d.bulan, true)} (tanggal SP)</Label>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Besar uji="skor-omzet">{rupiahJuta(s.omzet)}</Besar>
            <Sub>
              dari target {rupiahJuta(st.target)} · {persenBulat(st.persen)}
            </Sub>
          </div>
          <Meter r={st.persen} label="Omzet terhadap target tim" />
          <div className="space-y-0.5 text-sm">
            {st.selesai ? (
              <p>
                Bulan selesai · {st.kurang > 0 ? <>kurang {rupiahJuta(st.kurang)} dari target</> : "target tercapai"} · rata-rata{" "}
                {rupiahJuta(rasio(s.omzet, st.hkBulan))}/hari kerja
              </p>
            ) : (
              <>
                <p data-uji="skor-kurang">
                  {st.kurang > 0 ? (
                    <>
                      Kurang <b className="tabular-nums">{rupiahJuta(st.kurang)}</b> · sisa {st.sisaHk} hari kerja (
                      {labelSisa(d.hari_ini, d.bulan)})
                      {st.perluPerHari != null ? <> · perlu {rupiahJuta(st.perluPerHari)}/hari</> : null}
                    </>
                  ) : (
                    "Target tercapai"
                  )}
                </p>
                {st.laju != null ? (
                  <p className="text-muted-foreground" data-uji="skor-proyeksi">
                    Laju {st.hkLewat} hari kerja: {rupiahJuta(st.laju)}/hari → proyeksi akhir bulan {rupiahJuta(st.proyeksi)}
                  </p>
                ) : null}
              </>
            )}
            <p className="text-muted-foreground">
              {lalu}: {rupiahJuta(s.omzet_lalu)}
            </p>
          </div>
        </Kartu>
        <Kartu className="space-y-3">
          <Label>Omzet per sales (target {rupiahJuta(TARGET_OMZET.salesBaku)} per sales)</Label>
          {(d.per_sales ?? []).length === 0 ? (
            <Sub>Belum ada order.</Sub>
          ) : (
            (d.per_sales ?? []).map((p) => {
              const target = targetSales(p.pemilik);
              return (
                <div key={p.pemilik ?? "tanpa"} className="space-y-1" data-uji="skor-sales">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{namaSales(p.nama, p.pemilik)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {rupiahJuta(p.omzet)}
                      {p.pemilik != null ? <> dari {rupiahJuta(target)}</> : null} · {p.order} order
                    </span>
                  </div>
                  {p.pemilik != null ? <Meter r={rasio(p.omzet, target)} label={`Omzet ${p.nama ?? ""} terhadap target`} /> : null}
                </div>
              );
            })
          )}
        </Kartu>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kartu>
          <Label>Order (SP terbit)</Label>
          <Besar uji="skor-order">{angka(s.order)}</Besar>
          <Sub>
            {lalu}: {angka(s.order_lalu)}
          </Sub>
        </Kartu>
        <Kartu>
          <Label>Porsi Pallet Mesh</Label>
          <Besar>{persen(rasio(s.omzet_pm, s.omzet))}</Besar>
          <Sub>
            {rupiahJuta(s.omzet_pm)} dari {s.order_pm} order ({persenBulat(rasio(s.order_pm, s.order))} jumlah order)
          </Sub>
        </Kartu>
        <Kartu>
          <Label>Lead masuk</Label>
          <Besar uji="skor-lead">{angka(s.lead_masuk)}</Besar>
          <Sub>
            {lalu}: {angka(s.lead_masuk_lalu)}
            {ubahLead ? ` (${ubahLead})` : ""}
          </Sub>
        </Kartu>
        <Kartu>
          <Label>Win rate Pallet Mesh</Label>
          <Besar uji="skor-win-pm">{persen(rasio(win.order, win.lead))}</Besar>
          <Sub>
            {win.order} order dari {win.lead} lead PM umur ≥90 hari
          </Sub>
        </Kartu>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 2 · kesehatan follow-up (admin)
const KOLOM_KESEHATAN: { k: Exclude<MetrikDasbor, "sentuh_basis" | "sentuh_cepat" | "lama" | "pm_terbuka" | "diam_0_7">; label: string }[] = [
  { k: "fu_hari_ini", label: "FU hari ini" },
  { k: "fu_telat", label: "FU telat" },
  { k: "tanpa_jadwal", label: "Tanpa jadwal FU" },
  { k: "baru_tanpa_catatan", label: "BARU tanpa catatan" },
  { k: "diam_8_14", label: "Diam 8–14 hr" },
  { k: "diam_15_30", label: "Diam 15–30 hr" },
  { k: "diam_31", label: "Diam >30 hr" },
];

function SelSentuh({ k, bulan }: { k: KesehatanSales; bulan: string }) {
  return (
    <span className="whitespace-nowrap">
      <Angka n={k.sentuh_cepat} href={tautanDaftar("sentuh_cepat", k.pemilik, bulan)} uji="kes-sentuh_cepat" /> /{" "}
      <Angka n={k.sentuh_basis} href={tautanDaftar("sentuh_basis", k.pemilik, bulan)} uji="kes-sentuh_basis" />
      {k.sentuh_basis > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">{persenBulat(rasio(k.sentuh_cepat, k.sentuh_basis))}</span> : null}
    </span>
  );
}

function BagianKesehatan({ d }: { d: DasborPipeline }) {
  const bln = namaBulan(d.bulan);
  const sales = d.kesehatan.filter((k) => k.pemilik != null);
  return (
    <section className="space-y-2" data-uji="dasbor-kesehatan">
      <JudulBagian no={2}>Kesehatan follow-up per sales</JudulBagian>
      {d.kesehatan.length === 0 ? (
        <Kosong>Tidak ada lead terbuka.</Kosong>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Sales</th>
                <th className="px-3 py-2 text-right font-medium">Lead terbuka ≤90 hari</th>
                <th className="px-3 py-2 text-right font-medium">Lead {bln} disentuh ≤1 hari kerja</th>
                {KOLOM_KESEHATAN.map((c) => (
                  <th key={c.k} className="px-3 py-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.kesehatan.map((k) => (
                <tr key={k.pemilik ?? "tanpa"} className="border-b last:border-0" data-uji="baris-kesehatan" data-pemilik={k.pemilik ?? "tanpa"}>
                  <td className="px-3 py-2 text-left font-medium">{namaSales(k.nama, k.pemilik)}</td>
                  <td className="px-3 py-2 text-right">
                    <Angka n={k.terbuka90} href={tautanDaftar("terbuka90", k.pemilik, d.bulan)} uji="kes-terbuka90" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <SelSentuh k={k} bulan={d.bulan} />
                  </td>
                  {KOLOM_KESEHATAN.map((c) => (
                    <td key={c.k} className="px-3 py-2 text-right">
                      <Angka n={k[c.k]} href={tautanDaftar(c.k, k.pemilik, d.bulan)} uji={`kes-${c.k}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground" data-uji="catatan-kesehatan">
        Lead terbuka = tahap BARU/PENAWARAN, masuk sejak {tglPendek(awalBasis90(d.hari_ini))}. Di luar itu masih ada lead
        terbuka lama:{" "}
        {d.kesehatan.map((k, i) => (
          <span key={k.pemilik ?? "tanpa"}>
            {i > 0 ? ", " : ""}
            {k.pemilik == null ? "tanpa pemilik" : namaSales(k.nama, k.pemilik)}{" "}
            <Angka n={k.lama} href={tautanDaftar("lama", k.pemilik, d.bulan)} uji="kes-lama" />
          </span>
        ))}
        . &quot;Disentuh&quot; = ada FU tercatat atau tahap berubah paling lambat 1 hari kerja sesudah lead masuk; chat WA yang
        tidak dicatat tidak terlihat. Hari kerja = Senin–Sabtu.
        {sales.length ? (
          <>
            {" "}
            FU tercatat sepanjang {namaBulan(d.bulan, true)}:{" "}
            {sales.map((k, i) => (
              <span key={k.pemilik}>
                {i > 0 ? ", " : ""}
                {namaSales(k.nama, k.pemilik)} {angka(k.fu_tercatat ?? 0)}
              </span>
            ))}
            .
          </>
        ) : null}{" "}
        Setiap angka bergaris titik membuka daftar lead-nya.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ 3 · corong & siklus (admin)
// Urutan tumpukan lolos uji CVD (hue tahap sama dengan pil tahap; warna di globals.css --grafik-*).
const TAHAP_CORONG = [
  { k: "ORDER", kelas: "bg-grafik-order" },
  { k: "BARU", kelas: "bg-grafik-baru" },
  { k: "PENAWARAN", kelas: "bg-grafik-penawaran" },
  { k: "DIALIHKAN", kelas: "bg-grafik-dialihkan" },
  { k: "BATAL", kelas: "bg-grafik-batal" },
] as const;

function BarisCorong({ b, maks }: { b: BulanCorong; maks: number }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_minmax(0,1fr)_9rem]" data-uji="baris-corong">
      <div className="text-sm tabular-nums">
        {namaBulan(b.bulan)} · {angka(b.total)}
      </div>
      <div className="h-5">
        {b.total > 0 ? (
          <div className="flex h-full gap-[2px] overflow-hidden rounded-r-[4px]" style={{ width: `${rasio(b.total, maks) * 100}%` }}>
            {TAHAP_CORONG.filter((t) => b[t.k] > 0).map((t) => (
              <div
                key={t.k}
                className={cn("h-full min-w-[2px]", t.kelas)}
                style={{ flexGrow: b[t.k], flexBasis: 0 }}
                title={`${t.k} ${angka(b[t.k])} (${persen(rasio(b[t.k], b.total))})`}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="col-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-3 sm:text-right">
        {angka(b.ORDER)} order · {persen(rasio(b.ORDER, b.total))}
      </div>
    </div>
  );
}

function KotakSiklus({ d }: { d: DasborPipeline }) {
  const s = d.siklus;
  if (!s) return null;
  const sejak = tglPendek(s.sejak);
  const teks = (x: { n: number; median: number | null }) =>
    siklusValid(x.n) && x.median != null ? `${angka(x.median)} hari (median, ${x.n} lead)` : "belum bisa dihitung";
  const kurang = !siklusValid(s.lead_penawaran.n) || !siklusValid(s.penawaran_order.n);
  return (
    <Kartu className="space-y-2" uji="kotak-siklus">
      <Label>Waktu siklus (lead masuk sejak {sejak})</Label>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Lead → penawaran</dt>
        <dd className="font-medium">{teks(s.lead_penawaran)}</dd>
        <dt className="text-muted-foreground">Penawaran → order</dt>
        <dd className="font-medium">{teks(s.penawaran_order)}</dd>
      </dl>
      {kurang ? (
        <Catatan uji="catatan-siklus">
          Sampel kurang dari 10 lead: dari lead sejak {sejak} baru {s.lead_penawaran.n} yang punya riwayat PENAWARAN dan{" "}
          {s.penawaran_order.n} yang lanjut ke ORDER (order banyak dicatat langsung dari BARU). Kotak ini terisi sendiri begitu
          sales menaikkan tahap saat kirim penawaran.
        </Catatan>
      ) : null}
    </Kartu>
  );
}

function BagianCorong({ d }: { d: DasborPipeline }) {
  const corong = d.corong ?? [];
  const maks = Math.max(1, ...corong.map((b) => b.total));
  return (
    <section className="space-y-2" data-uji="dasbor-corong">
      <JudulBagian no={3}>Corong per bulan lead masuk (tahap sekarang)</JudulBagian>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Kartu className="space-y-3">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda tahap">
            {TAHAP_CORONG.map((t) => (
              <li key={t.k} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[3px]", t.kelas)} aria-hidden />
                {t.k}
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            {corong.map((b) => (
              <BarisCorong key={b.bulan} b={b} maks={maks} />
            ))}
          </div>
          {/* tampilan tabel: semua angka tertulis (warna bukan satu-satunya penanda) */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {corong.map((b, i) => (
              <span key={b.bulan}>
                {i > 0 ? ". " : ""}
                {namaBulan(b.bulan)}: {TAHAP_CORONG.map((t) => `${t.k} ${angka(b[t.k])}`).join(" · ")}
              </span>
            ))}
            .
          </p>
        </Kartu>
        <KotakSiklus d={d} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 4 · Pallet Mesh (admin)
function SelMenang({ judul, w, valid }: { judul: string; w: JumlahMenang; valid: boolean }) {
  return (
    <div>
      <Label>{judul}</Label>
      {valid ? (
        <div className="text-lg font-semibold tabular-nums">
          {persen(rasio(w.order, w.lead))}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({w.order}/{w.lead})
          </span>
        </div>
      ) : (
        <div className="text-sm font-medium text-muted-foreground">belum valid</div>
      )}
    </div>
  );
}

function BagianPm({ d }: { d: DasborPipeline }) {
  const pm = d.pm;
  const win = d.win_pm ?? { order: 0, lead: 0 };
  const qty = d.pm_qty_terisi ?? { lebih_1: 0, lead: 0 };
  const splitValid = splitQtyValid(qty.lebih_1, qty.lead);
  const nilaiValid = nilaiPenawaranValid(pm.terbuka_bernilai, pm.terbuka);
  const sales = (d.pm_sales ?? []).filter((x) => x.pemilik != null);
  const tanpa = (d.pm_sales ?? []).find((x) => x.pemilik == null);
  return (
    <section className="space-y-2" data-uji="dasbor-pm">
      <JudulBagian no={4}>Fokus Pallet Mesh</JudulBagian>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kartu>
          <Label>Lead PM terbuka · total</Label>
          <Besar uji="pm-total">
            <Angka n={pm.terbuka} href={tautanDaftar("pm_terbuka", "semua", d.bulan)} />
          </Besar>
          <Sub>
            {angka(pm.qty)} unit diminta
            {pm.terbesar && pm.terbesar.qty * 2 >= pm.qty && pm.qty > 0
              ? ` (${angka(pm.terbesar.qty)} di antaranya ${pm.terbesar.kode})`
              : ""}
          </Sub>
        </Kartu>
        {sales.map((x) => (
          <Kartu key={x.pemilik}>
            <Label>{namaSales(x.nama, x.pemilik)}</Label>
            <Besar>
              <Angka n={x.terbuka} href={tautanDaftar("pm_terbuka", x.pemilik, d.bulan)} uji="pm-sales" />
            </Besar>
            <Sub>
              {angka(x.qty)} unit · {x.diam30} diam &gt;30 hari
              {nilaiValid ? ` · penawaran ${rupiahJuta(x.nilai)}` : ""}
            </Sub>
          </Kartu>
        ))}
        {tanpa ? (
          <Kartu>
            <Label>Tanpa pemilik</Label>
            <Besar>
              <Angka n={tanpa.terbuka} href={tautanDaftar("pm_terbuka", null, d.bulan)} uji="pm-tanpa" />
            </Besar>
            <Sub>
              {tanpa.diam30} diam &gt;30 hari · buka lead lalu tekan <b>Klaim</b>
            </Sub>
          </Kartu>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">
          10 lead PM terbuka teratas (urut qty, lalu paling lama diam; diam ≤120 hari)
        </h3>
        {(d.pm_teratas ?? []).length === 0 ? (
          <Kosong className="py-4">Tidak ada lead PM terbuka.</Kosong>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Pelanggan</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-left font-medium">Tahap</th>
                  <th className="px-3 py-2 text-left font-medium">Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Diam</th>
                  <th className="px-3 py-2 text-right font-medium">FU berikut</th>
                </tr>
              </thead>
              <tbody>
                {(d.pm_teratas ?? []).map((t) => (
                  <tr key={t.id} className="border-b last:border-0" data-uji="baris-pm-teratas">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <Link href={`/pipeline/${encodeURIComponent(t.id)}`} className="text-primary underline-offset-4 hover:underline">
                        {t.kode}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2">{t.pelanggan}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{angka(t.qty)}</td>
                    <td className="px-3 py-2">
                      <PilTahap tahap={t.tahap} />
                    </td>
                    <td className="px-3 py-2">{t.sales ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.diam}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {t.fu_berikutnya ? fmtTanggal(t.fu_berikutnya, d.hari_ini) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Kartu className="space-y-3" uji="pm-win-qty">
        <Label>Win rate PM per qty (lead umur ≥90 hari)</Label>
        <div className="grid grid-cols-3 gap-3">
          <SelMenang judul="Semua" w={win} valid />
          <SelMenang judul="Qty <20" w={d.pm_win_qty?.kecil ?? { order: 0, lead: 0 }} valid={splitValid} />
          <SelMenang judul="Qty ≥20" w={d.pm_win_qty?.besar ?? { order: 0, lead: 0 }} valid={splitValid} />
        </div>
        <div>
          <Label>Nilai penawaran PM per sales</Label>
          {nilaiValid ? (
            <div className="flex flex-wrap gap-x-4 text-sm tabular-nums">
              {(d.pm_sales ?? []).map((x) => (
                <span key={x.pemilik ?? "tanpa"}>
                  <span className="text-muted-foreground">{namaSales(x.nama, x.pemilik)}:</span> {rupiahJuta(x.nilai)}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm font-medium text-muted-foreground">belum valid</div>
          )}
        </div>
        {!nilaiValid || !splitValid ? (
          <Catatan uji="catatan-pm">
            {!nilaiValid
              ? `Nilai penawaran baru terisi di ${pm.terbuka_bernilai} dari ${pm.terbuka} lead PM terbuka, jadi "nilai penawaran PM per sales" belum bisa ditampilkan (perlu ≥50%). `
              : ""}
            {!splitValid
              ? `Qty: ${qty.lead - qty.lebih_1} dari ${qty.lead} lead PM tercatat qty 1 (bawaan impor), sehingga pemisahan <20 vs ≥20 belum bermakna (perlu ≥30% lead PM ber-qty >1).`
              : ""}
          </Catatan>
        ) : null}
      </Kartu>
    </section>
  );
}

// ------------------------------------------------------------------ tampilan sales "milik saya"
function TampilanSales({ d, akses }: { d: DasborPipeline; akses: AksesPipeline }) {
  const { member } = useProfil();
  const [fuId, setFuId] = useState<string | null>(null);
  const [bukaFu, setBukaFu] = useState(false);
  const k = d.kesehatan.find((x) => x.pemilik === d.saya) ?? d.kesehatan[0];
  const s = d.skor;
  const target = targetSales(d.saya);
  const tim = skorTarget({ omzet: d.omzet_tim, target: TARGET_OMZET.tim, bulan: d.bulan, hariIni: d.hari_ini });
  const fu = d.fu_hari_ini ?? [];
  const bln = namaBulan(d.bulan, true);
  const href = (m: MetrikDasbor) => tautanDaftar(m, d.saya, d.bulan);
  const ember: { m: MetrikDasbor; label: string; n: number }[] = k
    ? [
        { m: "diam_0_7", label: "0–7 hari", n: k.diam_0_7 },
        { m: "diam_8_14", label: "8–14 hari", n: k.diam_8_14 },
        { m: "diam_15_30", label: "15–30 hari", n: k.diam_15_30 },
        { m: "diam_31", label: ">30 hari", n: k.diam_31 },
      ]
    : [];
  return (
    <div className="space-y-4" data-uji="dasbor-sales">
      <div>
        <h2 className="text-base font-semibold">Pipeline saya · {member.nama ?? member.username}</h2>
        <p className="text-xs text-muted-foreground">{fmtTanggalPanjang(d.hari_ini)} · hanya lead dan order milik Anda</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Kartu className="space-y-1.5">
          <Label>Omzet saya {bln}</Label>
          <Besar uji="sales-omzet">{rupiahJuta(s.omzet)}</Besar>
          <Meter r={rasio(s.omzet, target)} label="Omzet saya terhadap target" />
          <Sub>
            {s.order} order (tanggal SP) · {persenBulat(rasio(s.omzet, target))} dari target {rupiahJuta(target)}
          </Sub>
        </Kartu>
        <Kartu className="space-y-1.5">
          <Label>Target tim bulan ini</Label>
          <Besar uji="sales-tim">{persenBulat(tim.persen)}</Besar>
          <Meter r={tim.persen} label="Omzet tim terhadap target tim" />
          <Sub>
            {rupiahJuta(d.omzet_tim)} dari {rupiahJuta(tim.target)}
            {tim.kurang > 0 ? ` · kurang ${rupiahJuta(tim.kurang)}` : " · tercapai"}
          </Sub>
        </Kartu>
        <Kartu className="space-y-1.5">
          <Label>Lead baru {namaBulan(d.bulan)} disentuh ≤1 hari kerja</Label>
          <Besar uji="sales-sentuh">{k && k.sentuh_basis > 0 ? persenBulat(rasio(k.sentuh_cepat, k.sentuh_basis)) : "—"}</Besar>
          {k ? (
            <Sub>
              <Angka n={k.sentuh_cepat} href={href("sentuh_cepat")} uji="kes-sentuh_cepat" /> dari{" "}
              <Angka n={k.sentuh_basis} href={href("sentuh_basis")} uji="kes-sentuh_basis" /> lead · yang dihitung hanya FU yang
              dicatat di Anvil
            </Sub>
          ) : null}
        </Kartu>
      </div>

      <section className="space-y-2" data-uji="sales-fu-hari-ini">
        <div className="flex items-baseline justify-between gap-2">
          <JudulBagian>Follow up hari ini · {fu.length} lead</JudulBagian>
          <Link href={href("fu_hari_ini")} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Lihat semua
          </Link>
        </div>
        {fu.length === 0 ? (
          <Kosong className="py-4">Tidak ada FU terjadwal hari ini.</Kosong>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Pelanggan</th>
                  <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Produk</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Tahap</th>
                  <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Sumber</th>
                  <th className="px-3 py-2 text-right font-medium">Diam</th>
                  {akses.bolehTulis ? <th className="px-3 py-2" aria-label="Aksi" /> : null}
                </tr>
              </thead>
              <tbody>
                {fu.slice(0, 10).map((l) => (
                  <tr key={l.id} className="border-b last:border-0" data-uji="baris-fu-hari-ini">
                    <td className="max-w-[11rem] px-3 py-2 font-medium sm:whitespace-nowrap">
                      <Link href={`/pipeline/${encodeURIComponent(l.id)}`} className="text-primary underline-offset-4 hover:underline">
                        {l.kode}
                      </Link>
                      {/* HP: pelanggan di bawah kode (kolom Pelanggan disembunyikan) supaya tombol Catat FU tetap terlihat */}
                      <div className="truncate text-xs font-normal text-muted-foreground sm:hidden">{l.pelanggan}</div>
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-3 py-2 sm:table-cell">{l.pelanggan}</td>
                    <td className="hidden max-w-[14rem] truncate px-3 py-2 md:table-cell">{ringkasProduk(l.produk)}</td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      <PilTahap tahap={l.tahap} />
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">{l.sumber}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{l.diam_hari} hr</td>
                    {akses.bolehTulis ? (
                      <td className="px-2 py-1.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFuId(l.id);
                            setBukaFu(true);
                          }}
                          data-uji="catat-fu-dasbor"
                        >
                          Catat FU
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Urutan: Pallet Mesh dulu, lalu yang paling lama diam.{fu.length > 10 ? ` ${fu.length - 10} lead lagi di "Lihat semua".` : ""}
        </p>
      </section>

      {k ? (
        <div className="grid gap-2 lg:grid-cols-2">
          <Kartu className="space-y-3" uji="sales-antrean">
            <JudulBagian>Antrean saya</JudulBagian>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
              <dt>FU telat</dt>
              <dd className="text-right font-semibold">
                <Angka n={k.fu_telat} href={href("fu_telat")} uji="kes-fu_telat" />
              </dd>
              <dt>Lead terbuka tanpa jadwal FU</dt>
              <dd className="text-right font-semibold">
                <Angka n={k.tanpa_jadwal} href={href("tanpa_jadwal")} uji="kes-tanpa_jadwal" />
              </dd>
              <dt>BARU tanpa catatan &gt;1 hari kerja</dt>
              <dd className="text-right font-semibold">
                <Angka n={k.baru_tanpa_catatan} href={href("baru_tanpa_catatan")} uji="kes-baru_tanpa_catatan" />
              </dd>
            </dl>
            <div className="space-y-1.5 border-t pt-3">
              <Label>
                Lama diam · <Angka n={k.terbuka90} href={href("terbuka90")} uji="kes-terbuka90" /> lead terbuka sejak{" "}
                {tglPendek(awalBasis90(d.hari_ini))}
              </Label>
              {ember.map((e) => (
                <div key={e.m} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{e.label}</span>
                  <div className="h-2">
                    <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${rasio(e.n, k.terbuka90) * 100}%` }} />
                  </div>
                  <span className="text-right">
                    <Angka n={e.n} href={href(e.m)} uji={`kes-${e.m}`} />
                  </span>
                </div>
              ))}
            </div>
            {k.lama > 0 ? (
              <Sub>
                Di luar itu ada <Angka n={k.lama} href={href("lama")} uji="kes-lama" /> lead terbuka lama (masuk &gt;90 hari lalu).
              </Sub>
            ) : null}
          </Kartu>
          <Kartu className="space-y-2" uji="sales-pm">
            <JudulBagian>Pallet Mesh saya</JudulBagian>
            <Besar>
              <Angka n={d.pm.terbuka} href={href("pm_terbuka")} uji="pm-saya" />
            </Besar>
            <Sub>lead terbuka · {angka(d.pm.qty)} unit</Sub>
            <p className="text-sm">{d.pm.diam30} diam &gt;30 hari.</p>
            {nilaiPenawaranValid(d.pm.terbuka_bernilai, d.pm.terbuka) ? (
              <p className="text-sm">
                Nilai penawaran {rupiahJuta(d.pm.nilai)} ({d.pm.terbuka_bernilai} lead).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Isi nilai penawaran saat kirim harga supaya nilai PM Anda terlihat di sini.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={href("pm_terbuka")}>Buka lead PM saya</Link>
            </Button>
          </Kartu>
        </div>
      ) : null}

      {fuId ? <DialogFu buka={bukaFu} ubahBuka={setBukaFu} leadId={fuId} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ layar
function IsiDasbor({ akses }: { akses: AksesPipeline }) {
  const { hariIni } = useProfil();
  const sp = useSearchParams();
  const pilihan = daftarBulan(hariIni);
  const bulanUrl = sp.get("bulan") ?? "";
  const bulan = pilihan.includes(bulanUrl) ? bulanUrl : "";
  const q = useDasborPipeline(bulan);
  const gantiBulan = (b: string) => gantiUrl(b === pilihan[0] ? "/pipeline/dasbor" : `/pipeline/dasbor?bulan=${b}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={bulan || pilihan[0]} onValueChange={gantiBulan}>
          <SelectTrigger className="w-44" aria-label="Bulan" data-uji="pilih-bulan-dasbor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pilihan.map((b) => (
              <SelectItem key={b} value={b}>
                {namaBulan(b, true)} {b.slice(0, 4)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Omzet menurut tanggal SP · hari kerja Senin–Sabtu
          {q.data?.peran === "penuh" ? " · semua sales" : ""}
        </p>
      </div>
      {q.isError ? (
        <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
      ) : q.isPending ? (
        <MemuatDaftar />
      ) : q.data.peran === "penuh" ? (
        <div className={cn("space-y-6 transition-opacity", q.isPlaceholderData && "opacity-60")} data-uji="dasbor-admin">
          <BagianSkor d={q.data} />
          <BagianKesehatan d={q.data} />
          <BagianCorong d={q.data} />
          <BagianPm d={q.data} />
        </div>
      ) : (
        <div className={cn("transition-opacity", q.isPlaceholderData && "opacity-60")}>
          <TampilanSales d={q.data} akses={akses} />
        </div>
      )}
    </div>
  );
}

export function LayarDasbor() {
  return (
    <>
      <KepalaHalaman judul="Dasbor Pipeline" kembali="/pipeline" aksi={<AksiPipeline />} />
      <IsiHalaman lebar className="max-w-6xl space-y-4">
        <GerbangPipeline>{(akses) => <IsiDasbor akses={akses} />}</GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
