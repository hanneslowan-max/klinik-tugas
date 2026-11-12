"use client";

// Detail pelanggan (database pelanggan, 20261017120000): data & kontak, ringkasan order (jumlah, nilai, order pertama/
// terakhir, jeda rata-rata antar order), LOG semua lead/order pelanggan ini (terbaru dulu, order diberi nomor "Order
// ke-N" → repeat order kelihatan), dan riwayat gabung. Admin: saran "mungkin pelanggan yang sama" (Gabungkan ke sini /
// Bukan dobel) dan Batalkan gabung. Peran 'baca' melihat tanpa kontak (§6). Tautan lama ke pelanggan yang sudah
// digabung dialihkan ke pelanggan tujuannya.
import { GitMerge, Pencil, Repeat, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { DialogPelangganUbah } from "@/features/pipeline/dialog-pelanggan-ubah";
import { GerbangPipeline } from "@/features/pipeline/gerbang";
import { ALASAN_DOBEL, namaPelanggan, ringkasProduk, rupiah, tanggalLog } from "@/features/pipeline/konstanta";
import { usePelangganBukanDobel, usePelangganGabung, usePelangganGabungBatal } from "@/features/pipeline/mutasi";
import { PilTahap } from "@/features/pipeline/pil-tahap";
import { nomorOrder, ringkasStatistik } from "@/features/pipeline/pelanggan";
import { usePelanggan } from "@/features/pipeline/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggal, fmtWaktu } from "@/lib/tanggal";
import type { PelangganDetail } from "@/types/domain";

function Tile({ label, nilai, sub }: { label: string; nilai: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{nilai}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Baris({ dt, children }: { dt: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{dt}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function IsiDetailPelanggan({ d }: { d: PelangganDetail }) {
  const { hariIni } = useProfil();
  const konfirmasi = useKonfirmasi();
  const gabung = usePelangganGabung();
  const batalGabung = usePelangganGabungBatal();
  const bukanDobel = usePelangganBukanDobel();
  const [ubah, setUbah] = useState(false);

  const p = d.pelanggan;
  const r = d.ringkas;
  const nama = namaPelanggan(p);
  const urutOrder = nomorOrder(d.leads);

  const gabungkan = async (c: PelangganDetail["mungkin_sama"][number]) => {
    const namaC = namaPelanggan(c);
    const ok = await konfirmasi({
      judul: "Gabungkan pelanggan?",
      pesan: (
        <>
          Semua lead ({c.jml_lead}) dan kontak <strong>{namaC}</strong> dipindah ke <strong>{nama}</strong>, lalu {namaC}{" "}
          dihapus dari daftar pelanggan. Data lead tidak berubah, dan penggabungan bisa dibatalkan dari Riwayat gabung.
        </>
      ),
      ya: "Gabungkan",
    });
    if (!ok) return;
    try {
      await gabung.mutateAsync({ ke_id: p.id, dari_ids: [c.id], alasan: c.alasan });
      toast.success(`${namaC} digabung ke ${nama}`);
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  const tandaiBukanDobel = async (c: PelangganDetail["mungkin_sama"][number]) => {
    try {
      await bukanDobel.mutateAsync({ alasan: c.alasan, ids: [p.id, c.id] });
      toast.success("Ditandai bukan dobel");
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  const batalkan = async (g: PelangganDetail["gabung"][number]) => {
    const ok = await konfirmasi({
      judul: "Batalkan penggabungan?",
      pesan: (
        <>
          <strong>{g.dari_nama}</strong> dipulihkan sebagai pelanggan sendiri, dan lead serta kontak yang dulu dipindah dari sana
          dikembalikan.
        </>
      ),
      ya: "Batalkan gabung",
    });
    if (!ok) return;
    try {
      await batalGabung.mutateAsync(g.id);
      toast.success(`${g.dari_nama} dipulihkan`);
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-3 text-sm">
        <Baris dt="Nama">
          <span className="font-medium">{nama}</span>
          {p.semu ? <span className="text-muted-foreground"> · perorangan (nama di data: “{p.nama}”)</span> : null}
        </Baris>
        <Baris dt="Jenis">{p.jenis === "perorangan" ? "Perorangan" : "Perusahaan"}</Baris>
        <Baris dt="Kota">{p.kota || <span className="text-muted-foreground">—</span>}</Baris>
        <Baris dt="Kontak">
          {d.kontak_disembunyikan ? (
            <span className="text-muted-foreground">disembunyikan</span>
          ) : d.kontak.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <ul className="space-y-0.5" data-uji="kontak-pelanggan">
              {d.kontak.map((k) => (
                <li key={k.id} className="break-words">
                  {k.nama || "—"}
                  {k.telepon ? ` · ${k.telepon}` : ""}
                  {k.jabatan ? ` (${k.jabatan})` : ""}
                  {k.jml_lead > 0 ? <span className="text-muted-foreground"> · {k.jml_lead} lead</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Baris>
        {p.catatan ? (
          <Baris dt="Catatan">
            <span className="break-words whitespace-pre-line">{p.catatan}</span>
          </Baris>
        ) : null}
      </dl>

      {d.boleh_ubah ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setUbah(true)} data-uji="aksi-ubah-pelanggan">
            <Pencil aria-hidden />
            Ubah data pelanggan
          </Button>
        </div>
      ) : null}

      {r.jml_order >= 2 ? (
        <KotakPesan nada="info" judul="Pelanggan repeat order" data-uji="info-repeat">
          Sudah order {r.jml_order}× sejak {fmtTanggal(r.order_pertama, hariIni)}
          {r.jeda_order_hari != null ? `, rata-rata tiap ±${r.jeda_order_hari} hari` : ""}.
        </KotakPesan>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-uji="ringkas-pelanggan">
        <Tile label="Order" nilai={r.jml_order} sub={`dari ${r.jml_lead} lead${r.jml_aktif ? ` · ${r.jml_aktif} aktif` : ""}`} />
        <Tile label="Nilai order" nilai={rupiah(r.nilai_order)} />
        <Tile
          label="Order pertama"
          nilai={r.order_pertama ? fmtTanggal(r.order_pertama, hariIni) : "—"}
          sub={r.lead_pertama ? `lead pertama ${fmtTanggal(r.lead_pertama, hariIni)}` : undefined}
        />
        <Tile
          label="Order terakhir"
          nilai={r.order_terakhir ? fmtTanggal(r.order_terakhir, hariIni) : "—"}
          sub={r.jeda_order_hari != null ? `jeda rata-rata ±${r.jeda_order_hari} hari` : undefined}
        />
      </div>

      <section aria-label="Log lead dan order" className="space-y-2">
        <h2 className="text-sm font-semibold">Log lead &amp; order ({d.leads.length})</h2>
        {d.leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada lead.</p>
        ) : (
          <ol className="space-y-2" data-uji="log-pelanggan">
            {d.leads.map((l) => {
              const ke = urutOrder.get(l.id);
              return (
                <li key={l.id}>
                  <Link
                    href={`/pipeline/${encodeURIComponent(l.id)}`}
                    className="block rounded-xl border bg-card transition-colors hover:bg-muted"
                    data-uji="log-lead"
                    data-id={l.id}
                  >
                    <IsiTautan className="flex items-start gap-3 px-3 py-2.5" kelasPetunjuk="inset-x-3 bottom-0.5 h-0.5">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground tabular-nums">{fmtTanggal(tanggalLog(l), hariIni)}</span>
                          <PilTahap tahap={l.tahap} />
                          {ke ? (
                            <Chip nada={ke > 1 ? "sukses" : "garis"} data-uji="chip-order-ke">
                              {ke > 1 ? <Repeat aria-hidden /> : null}
                              Order ke-{ke}
                            </Chip>
                          ) : null}
                        </div>
                        <div className="truncate text-sm">{ringkasProduk(l.produk)}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {l.kode}
                          {l.no_sp ? ` · ${l.no_sp}` : ""}
                          {l.pemilik_nama ? ` · ${l.pemilik_nama}` : ""}
                        </div>
                      </div>
                      {l.nilai_transaksi != null && (l.tahap === "ORDER" || l.no_sp) ? (
                        <div className="shrink-0 text-sm font-medium tabular-nums">{rupiah(l.nilai_transaksi)}</div>
                      ) : null}
                    </IsiTautan>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {d.mungkin_sama.length > 0 ? (
        <section aria-label="Mungkin pelanggan yang sama" className="space-y-2" data-uji="mungkin-sama">
          <h2 className="text-sm font-semibold">Mungkin pelanggan yang sama</h2>
          <p className="text-xs text-muted-foreground">
            Data dari sheet lama sering tercatat dobel dengan ejaan berbeda. Gabungkan supaya riwayat order-nya jadi satu.
          </p>
          <ul className="space-y-2">
            {d.mungkin_sama.map((c) => (
              <li key={c.id} className="space-y-2 rounded-xl border bg-card px-3 py-2.5" data-uji="kandidat-sama" data-id={c.id}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/pipeline/pelanggan/${encodeURIComponent(c.id)}`} className="font-medium hover:underline">
                      {namaPelanggan(c)}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.kota, ringkasStatistik(c)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Chip nada="info" className="shrink-0">
                    {ALASAN_DOBEL[c.alasan]}
                  </Chip>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void gabungkan(c)}
                    disabled={gabung.isPending}
                    data-uji="gabung-ke-sini"
                  >
                    <GitMerge aria-hidden />
                    Gabungkan ke sini
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void tandaiBukanDobel(c)}
                    disabled={bukanDobel.isPending}
                    data-uji="bukan-dobel"
                  >
                    <X aria-hidden />
                    Bukan dobel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.gabung.length > 0 ? (
        <section aria-label="Riwayat gabung" className="space-y-2" data-uji="riwayat-gabung">
          <h2 className="text-sm font-semibold">Riwayat gabung</h2>
          <ol className="space-y-2">
            {d.gabung.map((g) => (
              <li key={g.id} className="flex items-start gap-2 border-l-2 border-border pl-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-words">
                    Digabung dari <span className="font-medium">{g.dari_nama}</span> ({g.jml_lead} lead
                    {g.alasan ? ` · ${ALASAN_DOBEL[g.alasan].toLowerCase()}` : ""})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g.cara === "otomatis" ? "Otomatis (rapikan data lama)" : "Manual"} · {g.oleh_nama ?? "sistem"} · {fmtWaktu(g.waktu)}
                  </p>
                  {g.dibatalkan_pada ? (
                    <p className="text-xs text-muted-foreground">
                      Dibatalkan {g.dibatalkan_oleh_nama ?? "sistem"} · {fmtWaktu(g.dibatalkan_pada)}
                    </p>
                  ) : null}
                </div>
                {d.boleh_gabung && !g.dibatalkan_pada ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void batalkan(g)}
                    disabled={batalGabung.isPending}
                    data-uji="batal-gabung"
                  >
                    <Undo2 aria-hidden />
                    Batalkan
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {d.boleh_ubah ? <DialogPelangganUbah buka={ubah} ubahBuka={setUbah} pelanggan={p} /> : null}
    </div>
  );
}

export function LayarDetailPelanggan({ id }: { id: string }) {
  const q = usePelanggan(id);
  const router = useRouter();
  const pindah = q.data && "digabung_ke" in q.data ? q.data.digabung_ke : null;
  useEffect(() => {
    if (pindah) router.replace(`/pipeline/pelanggan/${encodeURIComponent(pindah)}`);
  }, [pindah, router]);
  const d = q.data && !("digabung_ke" in q.data) ? q.data : null;
  return (
    <>
      <KepalaHalaman judul={d ? namaPelanggan(d.pelanggan) : "Pelanggan"} kembali="/pipeline/pelanggan" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline>
          {() =>
            q.isPending || pindah ? (
              <MemuatDaftar />
            ) : q.isError ? (
              <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
            ) : d ? (
              <IsiDetailPelanggan d={d} />
            ) : null
          }
        </GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
