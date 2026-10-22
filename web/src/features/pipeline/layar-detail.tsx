"use client";

// Detail lead (§5): info kv, tombol aksi (Catat FU / Penawaran / Order / Batal / Alihkan / Klaim / Data order /
// Batalkan order / Ubah), riwayat pelanggan (order & lead lain pelanggan yang sama → repeat order, tautan ke log
// lengkap di /pipeline/pelanggan/[id]), dan log gabungan aktivitas + riwayat tahap. 'baca' (Yosie) melihat tanpa
// telepon/PIC & tanpa tombol tulis (§6). Order yang dibatalkan (BATAL, alasan "Order dibatalkan") tetap menampilkan data
// ordernya (riwayat). Di bawah Sumber: bukti sumber dari chat WA (diisi agent, hanya-baca; semua peran melihatnya).
import { ArrowRightLeft, FileText, Hand, Pencil, PhoneCall, ReceiptText, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { useAnggota } from "@/features/anggota/queries";
import { DialogBatalOrder } from "@/features/pipeline/dialog-batal-order";
import { DialogFu } from "@/features/pipeline/dialog-fu";
import { DialogOrder } from "@/features/pipeline/dialog-order";
import { DialogTahap, type AksiTahap } from "@/features/pipeline/dialog-tahap";
import { DialogUbah } from "@/features/pipeline/dialog-ubah";
import { GerbangPipeline, type AksesPipeline } from "@/features/pipeline/gerbang";
import { ALASAN_BATAL_ORDER, BAYAR, BAYAR_BELUM_DICATAT, rupiah, teksBuktiSumber } from "@/features/pipeline/konstanta";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { RiwayatPelanggan } from "@/features/pipeline/riwayat-pelanggan";
import { useLeadUbah } from "@/features/pipeline/mutasi";
import { usePipelineLead } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal, fmtWaktu } from "@/lib/tanggal";
import type { AktivitasLead, IdAnggota, LeadDetail, RiwayatTahapLead } from "@/types/domain";

type ItemLog =
  | { kind: "fu"; waktu: string; a: AktivitasLead }
  | { kind: "tahap"; waktu: string; r: RiwayatTahapLead };

function Baris({ dt, children }: { dt: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{dt}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function IsiDetail({ lead, akses }: { lead: LeadDetail; akses: AksesPipeline }) {
  const anggota = useAnggota();
  const klaim = useLeadUbah();
  const [fu, setFu] = useState(false);
  const [ubah, setUbah] = useState(false);
  const [aksi, setAksi] = useState<AksiTahap | null>(null);
  const [dataOrder, setDataOrder] = useState(false);
  const [batalOrder, setBatalOrder] = useState(false);

  const namaAnggota = (id: IdAnggota | null | undefined) =>
    id == null ? "sistem" : (anggota.data?.find((m) => Number(m.id) === Number(id))?.username ?? `#${id}`);

  const { member } = useProfil();
  const buka = lead.tahap === "BARU" || lead.tahap === "PENAWARAN";
  const bisaKlaim = akses.bolehTulis && lead.pemilik == null;
  // sama dengan pipeline_boleh_ubah & tab Order: admin, pemilik, atau lead tanpa pemilik
  const bisaUbahOrder = lead.tahap === "ORDER" && (akses.peran === "admin" || lead.pemilik == null || Number(lead.pemilik) === Number(member.id));
  // lebih ketat (sama dengan server, aksi batal_order): admin, atau rep PEMILIK — order tanpa pemilik: admin (rep Klaim dulu)
  const bisaBatalOrder =
    akses.bolehTulis && lead.tahap === "ORDER" && (akses.peran === "admin" || (lead.pemilik != null && Number(lead.pemilik) === Number(member.id)));
  // order yang dibatalkan customer: data order tetap tampil sebagai riwayat (hanya-baca)
  const orderBatal = lead.tahap === "BATAL" && lead.alasan_batal === ALASAN_BATAL_ORDER;

  const log: ItemLog[] = [
    ...lead.aktivitas.map((a) => ({ kind: "fu" as const, waktu: a.waktu, a })),
    ...lead.riwayat_tahap.map((r) => ({ kind: "tahap" as const, waktu: r.waktu, r })),
  ].sort((x, y) => (x.waktu < y.waktu ? 1 : -1));

  const lakukanKlaim = async () => {
    try {
      await klaim.mutateAsync({ lead_id: lead.id, klaim: true });
      toast.success("Lead diklaim");
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      {lead.periksa ? (
        <KotakPesan nada="peringatan" judul="Perlu diperiksa">
          {lead.periksa_sebab || "Data impor ini perlu dicek manual."}
          {lead.ref_sheet ? ` (baris sheet ${lead.ref_sheet})` : ""}
        </KotakPesan>
      ) : null}

      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 gap-x-3 rounded-xl border bg-card px-3 py-3 text-sm">
        <Baris dt="Perusahaan">
          <Link
            href={`/pipeline/pelanggan/${encodeURIComponent(lead.pelanggan.id)}`}
            className="font-medium underline-offset-2 hover:underline"
            data-uji="tautan-pelanggan-lead"
          >
            {lead.pelanggan.nama}
          </Link>
          {lead.pelanggan.kota ? <span className="text-muted-foreground"> · {lead.pelanggan.kota}</span> : null}
        </Baris>
        {lead.kontak ? (
          <Baris dt="PIC">
            {lead.kontak.nama || "—"}
            {lead.kontak.telepon ? ` · ${lead.kontak.telepon}` : ""}
            {lead.kontak.jabatan ? ` (${lead.kontak.jabatan})` : ""}
          </Baris>
        ) : akses.peran === "baca" ? (
          <Baris dt="PIC">
            <span className="text-muted-foreground">disembunyikan</span>
          </Baris>
        ) : null}
        <Baris dt="Produk">
          <ul className="space-y-0.5">
            {lead.items.map((i) => (
              <li key={i.id}>
                {i.produk} · {Number(i.qty).toLocaleString("id-ID")} {i.satuan}
                {i.spesifikasi ? ` · ${i.spesifikasi}` : ""}
              </li>
            ))}
          </ul>
        </Baris>
        <Baris dt="Tahap">
          <PilTahap tahap={lead.tahap} />
          {lead.tahap === "PENAWARAN" && lead.tanggal_penawaran ? (
            <span className="text-muted-foreground"> sejak {fmtTanggal(lead.tanggal_penawaran)}</span>
          ) : null}
        </Baris>
        <Baris dt="Sumber">
          {lead.sumber}
          <BuktiSumber lead={lead} />
        </Baris>
        <Baris dt="Masuk">{fmtTanggal(lead.tanggal_masuk)}</Baris>
        <Baris dt="Pemilik">{lead.pemilik_nama || <span className="text-muted-foreground">tanpa pemilik</span>}</Baris>
        {lead.nilai_penawaran != null ? <Baris dt="Penawaran">{rupiah(lead.nilai_penawaran)}</Baris> : null}
        {lead.tahap === "ORDER" || orderBatal ? (
          <>
            <Baris dt="No SP">
              <span className="font-mono">{lead.no_sp || "—"}</span>
              {lead.tanggal_sp ? <span className="text-muted-foreground"> · {fmtTanggal(lead.tanggal_sp)}</span> : null}
            </Baris>
            <Baris dt="No PO">{lead.no_po || <span className="text-muted-foreground">—</span>}</Baris>
            <Baris dt="Nominal">
              <span className="font-medium tabular-nums">{rupiah(lead.nilai_transaksi)}</span>
            </Baris>
            <Baris dt="Pembayaran">
              <InfoBayar lead={lead} batal={orderBatal} />
            </Baris>
          </>
        ) : null}
        {lead.tahap === "BATAL" ? (
          <Baris dt="Alasan batal">
            <div className="break-words whitespace-pre-line" data-uji="detail-alasan-batal">
              {orderBatal ? (
                <>
                  <span className="font-medium">{lead.alasan_batal}</span>
                  {lead.alasan_batal_lain ? <span className="block">{lead.alasan_batal_lain}</span> : null}
                </>
              ) : (
                <>
                  {lead.alasan_batal}
                  {lead.alasan_batal_lain ? ` · ${lead.alasan_batal_lain}` : ""}
                </>
              )}
            </div>
          </Baris>
        ) : null}
        {lead.tahap === "DIALIHKAN" ? <Baris dt="Dialihkan ke">{lead.dialihkan_ke}</Baris> : null}
      </dl>

      {akses.bolehTulis ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setFu(true)} data-uji="aksi-fu">
            <PhoneCall aria-hidden />
            Catat FU
          </Button>
          {buka ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setAksi("penawaran")}>
                <FileText aria-hidden />
                Kirim penawaran
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAksi("order")} data-uji="aksi-order">
                <ShoppingCart aria-hidden />
                Order
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAksi("batal")}>
                <XCircle aria-hidden />
                Batal
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAksi("alihkan")}>
                <ArrowRightLeft aria-hidden />
                Alihkan
              </Button>
            </>
          ) : null}
          {bisaKlaim ? (
            <Button type="button" variant="outline" size="sm" onClick={lakukanKlaim} disabled={klaim.isPending}>
              <Hand aria-hidden />
              Klaim
            </Button>
          ) : null}
          {bisaUbahOrder ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setDataOrder(true)} data-uji="aksi-data-order">
              <ReceiptText aria-hidden />
              Data order
            </Button>
          ) : null}
          {bisaBatalOrder ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setBatalOrder(true)} data-uji="aksi-batal-order">
              <XCircle aria-hidden />
              Batalkan order
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setUbah(true)} data-uji="aksi-ubah">
            <Pencil aria-hidden />
            Ubah
          </Button>
        </div>
      ) : null}

      <RiwayatPelanggan lead={lead} />

      <section aria-label="Riwayat" className="space-y-3">
        <h2 className="text-sm font-semibold">Riwayat</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>
        ) : (
          <ol className="space-y-3">
            {log.map((it, i) =>
              it.kind === "fu" ? (
                <li key={`a${it.a.id}`} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmtWaktu(it.a.waktu)} · {namaAnggota(it.a.oleh)} · {it.a.jenis}
                  </div>
                  {it.a.hasil ? <p className="text-sm break-words whitespace-pre-line">{it.a.hasil}</p> : null}
                  {it.a.rencana_berikutnya ? (
                    <p className="text-xs text-muted-foreground">Rencana berikutnya: {fmtTanggal(it.a.rencana_berikutnya)}</p>
                  ) : null}
                </li>
              ) : (
                <li key={`r${i}`} className="border-l-2 border-primary/40 pl-3">
                  <div className="text-xs text-muted-foreground tabular-nums">{fmtWaktu(it.r.waktu)}</div>
                  <p className="text-sm">
                    Tahap {it.r.dari ? `${it.r.dari} → ` : "→ "}
                    <span className="font-medium">{it.r.ke}</span>
                  </p>
                </li>
              ),
            )}
          </ol>
        )}
      </section>

      {akses.bolehTulis ? (
        <>
          <DialogFu buka={fu} ubahBuka={setFu} leadId={lead.id} />
          <DialogUbah buka={ubah} ubahBuka={setUbah} lead={lead} />
          {aksi ? <DialogTahap buka={!!aksi} ubahBuka={(b) => !b && setAksi(null)} lead={lead} aksi={aksi} /> : null}
          {bisaUbahOrder ? <DialogOrder buka={dataOrder} ubahBuka={setDataOrder} lead={lead} /> : null}
          {/* tidak digerbang bisaBatalOrder: sesudah berhasil lead jadi BATAL, dialog harus tetap ada sampai animasi tutup */}
          <DialogBatalOrder buka={batalOrder} ubahBuka={setBatalOrder} lead={lead} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Bukti sumber dari chat WA 0878 (agent, x_pipeline_sumber_bukti_set): baris kecil hanya-baca di bawah Sumber isian sales.
 * Tidak tampil bila belum ada bukti. Boleh berbeda dengan Sumber; laporan membandingkan keduanya.
 */
function BuktiSumber({ lead }: { lead: LeadDetail }) {
  const teks = teksBuktiSumber(lead);
  if (!teks) return null;
  return (
    <p
      className="text-xs text-muted-foreground break-words"
      data-uji="detail-bukti-sumber"
      title={lead.sumber_bukti_diisi_pada ? `Dari chat WA, dicatat agent ${fmtWaktu(lead.sumber_bukti_diisi_pada)}` : undefined}
    >
      Bukti sumber (agent): {teks}
    </p>
  );
}

/**
 * Status bayar + rincian (DP & sisa, tanggal lunas) + jejak siapa/kapan dicatat. `batal` = order sudah dibatalkan:
 * tampilan netral (bukan "Belum bayar"/sisa tagihan merah) — yang penting hanya uang yang sudah diterima.
 */
function InfoBayar({ lead, batal }: { lead: LeadDetail; batal?: boolean }) {
  const b = lead.bayar_status ? BAYAR[lead.bayar_status] : BAYAR_BELUM_DICATAT;
  const dicatat = lead.bayar_diubah_pada ? (
    <p className="text-xs text-muted-foreground">
      dicatat {lead.bayar_diubah_oleh_nama ?? "sistem"} · {fmtWaktu(lead.bayar_diubah_pada)}
    </p>
  ) : null;
  if (batal) {
    const dibayar = lead.bayar_status === "LUNAS" || lead.bayar_status === "DP";
    const nominal = lead.bayar_status === "LUNAS" ? lead.nilai_transaksi : lead.bayar_dp;
    const tanggal = lead.bayar_status === "LUNAS" ? lead.tanggal_lunas : lead.tanggal_dp;
    return (
      <div className="space-y-0.5" data-uji="detail-bayar">
        {dibayar ? (
          <p className="tabular-nums">
            {b.label}
            {nominal != null ? ` ${rupiah(nominal)}` : ""} sudah dibayar{tanggal ? ` (${fmtTanggal(tanggal)})` : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">Tidak ada pembayaran tercatat</p>
        )}
        <p className="text-xs text-muted-foreground">Order dibatalkan{dibayar ? " · pengembalian dana diurus di luar Anvil" : ""}</p>
        {dicatat}
      </div>
    );
  }
  const sisa = lead.nilai_transaksi != null && lead.bayar_dp != null ? Math.max(0, lead.nilai_transaksi - lead.bayar_dp) : null;
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Chip nada={b.nada} data-uji="detail-bayar">
          {b.label}
        </Chip>
        {lead.bayar_status === "DP" ? (
          <span className="tabular-nums">
            DP {rupiah(lead.bayar_dp)}
            {lead.tanggal_dp ? ` (${fmtTanggal(lead.tanggal_dp)})` : ""}
            {sisa != null ? ` · sisa ${rupiah(sisa)}` : ""}
          </span>
        ) : null}
        {lead.bayar_status === "LUNAS" && lead.tanggal_lunas ? <span>{fmtTanggal(lead.tanggal_lunas)}</span> : null}
      </div>
      {dicatat}
    </div>
  );
}

export function LayarDetailLead({ id }: { id: string }) {
  const q = usePipelineLead(id);
  return (
    <>
      <KepalaHalaman judul={q.data?.kode ?? "Lead"} kembali="/pipeline" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline>
          {(akses) =>
            q.isPending ? (
              <MemuatDaftar />
            ) : q.isError ? (
              <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
            ) : (
              <IsiDetail lead={q.data} akses={akses} />
            )
          }
        </GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
