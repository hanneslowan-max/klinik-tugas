"use client";

// Saran gabung pelanggan dobel (admin; 20261017120000): kelompok "Nama sama" (ejaan beda: PT./CV/tanda baca), "Nomor HP
// sama", dan "Nama mirip" (salah ketik). Admin memilih pelanggan tujuan (bawaan: lead terbanyak), boleh mengganti nama
// sesudah digabung, lalu Gabungkan — atau tandai "Bukan dobel" supaya kelompok itu tidak muncul lagi. Setiap gabung
// tercatat dan bisa dibatalkan dari halaman pelanggan tujuan.
import { GitMerge, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Chip } from "@/components/umum/chip";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GerbangPipeline } from "@/features/pipeline/gerbang";
import { ALASAN_DOBEL, namaPelanggan } from "@/features/pipeline/konstanta";
import { usePelangganBukanDobel, usePelangganGabung } from "@/features/pipeline/mutasi";
import { ringkasStatistik } from "@/features/pipeline/pelanggan";
import { usePelangganDobel } from "@/features/pipeline/queries";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { KelompokDobel } from "@/types/domain";

function KartuKelompok({ k }: { k: KelompokDobel }) {
  const konfirmasi = useKonfirmasi();
  const gabung = usePelangganGabung();
  const bukanDobel = usePelangganBukanDobel();
  // tujuan bawaan: anggota pertama (server mengurutkan lead terbanyak dulu), tapi hindari nama pengisi ("-")
  const bawaan = k.anggota.find((a) => !a.semu) ?? k.anggota[0];
  const [tujuan, setTujuan] = useState(bawaan.id);
  const [namaBaru, setNamaBaru] = useState<string | null>(null);
  const ke = k.anggota.find((a) => a.id === tujuan) ?? bawaan;
  const namaAkhir = namaBaru ?? ke.nama;
  const lain = k.anggota.filter((a) => a.id !== ke.id);
  const sibuk = gabung.isPending || bukanDobel.isPending;

  const gabungkan = async () => {
    const ok = await konfirmasi({
      judul: "Gabungkan pelanggan?",
      pesan: (
        <>
          {lain.map((a) => namaPelanggan(a)).join(", ")} digabung ke <strong>{namaPelanggan({ ...ke, nama: namaAkhir.trim() || ke.nama })}</strong>.
          Semua lead & kontaknya dipindah; data lead tidak berubah. Bisa dibatalkan dari halaman pelanggan tujuan.
        </>
      ),
      ya: "Gabungkan",
    });
    if (!ok) return;
    try {
      await gabung.mutateAsync({
        ke_id: ke.id,
        dari_ids: lain.map((a) => a.id),
        alasan: k.alasan,
        ...(namaAkhir.trim() && namaAkhir.trim() !== ke.nama ? { nama: namaAkhir.trim() } : {}),
      });
      toast.success(`${lain.length} pelanggan digabung`);
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  const abaikan = async () => {
    try {
      await bukanDobel.mutateAsync({ alasan: k.alasan, ids: k.anggota.map((a) => a.id) });
      toast.success("Ditandai bukan dobel");
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <li className="space-y-3 rounded-xl border bg-card p-3" data-uji="kelompok-dobel" data-kunci={k.kunci}>
      <div className="flex items-center gap-2">
        <Chip nada="info">{ALASAN_DOBEL[k.alasan]}</Chip>
        <span className="text-xs text-muted-foreground">{k.anggota.length} pelanggan · pilih tujuan gabung</span>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Pelanggan tujuan</legend>
        {k.anggota.map((a) => (
          <label
            key={a.id}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm",
              a.id === ke.id ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <input
              type="radio"
              name={`tujuan-${k.kunci}`}
              className="mt-1 size-4 accent-primary"
              checked={a.id === ke.id}
              onChange={() => {
                setTujuan(a.id);
                setNamaBaru(null);
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words">
                {namaPelanggan(a)}
                {a.semu ? <span className="font-normal text-muted-foreground"> (nama di data: “{a.nama}”)</span> : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                {[a.kota, ringkasStatistik(a), a.telepon.join(", ")].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Link
              href={`/pipeline/pelanggan/${encodeURIComponent(a.id)}`}
              className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Lihat
            </Link>
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={`nama-${k.kunci}`}>Nama sesudah digabung</Label>
        <Input
          id={`nama-${k.kunci}`}
          value={namaAkhir}
          onChange={(e) => setNamaBaru(e.target.value)}
          autoComplete="off"
          maxLength={200}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void gabungkan()} disabled={sibuk} data-uji="gabungkan-kelompok">
          <GitMerge aria-hidden />
          Gabungkan {lain.length} ke tujuan
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void abaikan()} disabled={sibuk} data-uji="bukan-dobel-kelompok">
          <X aria-hidden />
          Bukan dobel
        </Button>
      </div>
    </li>
  );
}

function IsiDobel() {
  const q = usePelangganDobel();
  if (q.isPending) return <MemuatDaftar />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => void q.refetch()} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pelanggan yang kemungkinan sama tetapi tercatat terpisah (ejaan berbeda, nomor HP sama, atau salah ketik). Setelah
        digabung, semua lead & order-nya tampil dalam satu riwayat.
      </p>
      {q.data.kelompok.length === 0 ? (
        <Kosong>Tidak ada saran gabung. Data pelanggan sudah rapi.</Kosong>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{q.data.total} kelompok</p>
          <ul className="space-y-3">
            {q.data.kelompok.map((k) => (
              <KartuKelompok key={k.kunci} k={k} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function LayarDobelPelanggan() {
  return (
    <>
      <KepalaHalaman judul="Saran gabung pelanggan" kembali="/pipeline/pelanggan" />
      <IsiHalaman className="space-y-4">
        <GerbangPipeline>
          {(akses) =>
            akses.peran === "admin" ? (
              <IsiDobel />
            ) : (
              <KotakPesan nada="info" judul="Khusus admin">
                Saran gabung pelanggan hanya untuk admin Pipeline.
              </KotakPesan>
            )
          }
        </GerbangPipeline>
      </IsiHalaman>
    </>
  );
}
