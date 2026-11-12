"use client";

// Admin › Kategori: kategori pekerjaan bersama untuk Jelajah (Ads, Konten, SEO, Pipeline, …) — tambah, ganti nama,
// geser urutan, hapus (web_admin_kategori_simpan). Hapus = tugasnya kembali "Tanpa kategori" (tercatat di Riwayat).
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKategoriAdmin, useSimpanKategori } from "@/features/admin/queries";
import { BarisAdmin, Bidang, DaftarAdmin, SubBaris } from "@/features/admin/umum";
import { pesanGalat } from "@/lib/api/galat";
import type { KategoriAdmin } from "@/types/domain";

const MAKS_NAMA = 40;

export function TabKategori() {
  const q = useKategoriAdmin();
  const simpan = useSimpanKategori();

  const geser = (daftar: KategoriAdmin[], i: number, j: number) => {
    const ids = daftar.map((k) => k.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    simpan.mutate({ aksi: "urut", ids }, { onError: (e) => toast.error(pesanGalat(e)) });
  };

  return (
    <section className="space-y-4" aria-label="Kategori pekerjaan">
      <p className="text-sm text-muted-foreground">
        Kategori pekerjaan mengelompokkan tugas di Jelajah (lintas list). Setiap tugas punya paling banyak satu kategori;
        anggota mengaturnya di detail tugas atau saat membuat tugas.
      </p>
      <FormKategori />
      {q.isPending ? (
        <MemuatDaftar baris={4} />
      ) : q.isError ? (
        <GalatMuat galat={q.error} ulang={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Kosong>Belum ada kategori. Semua tugas tampil sebagai &ldquo;Tanpa kategori&rdquo;.</Kosong>
      ) : (
        <DaftarAdmin data-uji="daftar-kategori">
          {q.data.map((k, i) => (
            <BarisKategori
              key={k.id}
              kategori={k}
              naik={i > 0 ? () => geser(q.data, i, i - 1) : undefined}
              turun={i < q.data.length - 1 ? () => geser(q.data, i, i + 1) : undefined}
              sibuk={simpan.isPending}
            />
          ))}
        </DaftarAdmin>
      )}
    </section>
  );
}

function FormKategori() {
  const simpan = useSimpanKategori();
  const [nama, setNama] = useState("");
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    setGalat(null);
    if (!nama.trim()) {
      setGalat("Isi nama kategori.");
      return;
    }
    try {
      await simpan.mutateAsync({ aksi: "buat", nama });
      toast.success("Kategori ditambahkan");
      setNama("");
    } catch (err) {
      setGalat(pesanGalat(err));
    }
  };

  return (
    <form onSubmit={kirim} noValidate className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Tambah kategori">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Bidang label="Nama kategori" htmlFor="kategori-nama">
          <Input
            id="kategori-nama"
            value={nama}
            maxLength={MAKS_NAMA}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. Website"
            autoComplete="off"
            aria-invalid={!!galat}
          />
        </Bidang>
        <Button type="submit" disabled={simpan.isPending} data-uji="tambah-kategori">
          <Plus aria-hidden />
          {simpan.isPending ? "Menyimpan…" : "Tambah kategori"}
        </Button>
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
    </form>
  );
}

function BarisKategori({
  kategori: k,
  naik,
  turun,
  sibuk,
}: {
  kategori: KategoriAdmin;
  naik?: () => void;
  turun?: () => void;
  sibuk: boolean;
}) {
  const konfirmasi = useKonfirmasi();
  const simpan = useSimpanKategori();
  const [ubah, setUbah] = useState<string | null>(null);

  const gantiNama = async (e: FormEvent) => {
    e.preventDefault();
    if (ubah === null || ubah.trim() === k.nama) {
      setUbah(null);
      return;
    }
    try {
      await simpan.mutateAsync({ aksi: "ganti_nama", id: k.id, nama: ubah });
      toast.success("Nama kategori disimpan");
      setUbah(null);
    } catch (err) {
      toast.error(pesanGalat(err));
    }
  };

  const hapus = async () => {
    const ok = await konfirmasi({
      judul: "Hapus kategori",
      pesan: k.jumlah
        ? `Hapus kategori ${k.nama}? ${k.jumlah} tugas di dalamnya kembali menjadi "Tanpa kategori".`
        : `Hapus kategori ${k.nama}?`,
      ya: "Hapus",
      bahaya: true,
    });
    if (!ok) return;
    try {
      await simpan.mutateAsync({ aksi: "hapus", id: k.id });
      toast.success("Kategori dihapus");
    } catch (err) {
      toast.error(pesanGalat(err));
    }
  };

  return (
    <BarisAdmin data-kategori={k.id} className="flex-wrap sm:flex-nowrap">
      {ubah !== null ? (
        <form onSubmit={gantiNama} className="flex min-w-0 flex-1 items-center gap-1.5">
          <Input
            value={ubah}
            maxLength={MAKS_NAMA}
            onChange={(e) => setUbah(e.target.value)}
            aria-label={`Nama baru untuk ${k.nama}`}
            autoFocus
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="icon" aria-label="Simpan nama" title="Simpan nama" disabled={simpan.isPending}>
            <Check aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Batal" title="Batal" onClick={() => setUbah(null)}>
            <X aria-hidden />
          </Button>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold">{k.nama}</strong>
          <SubBaris>
            <span>{k.jumlah} tugas</span>
          </SubBaris>
        </div>
      )}
      {ubah === null ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={`Naikkan ${k.nama}`} title="Naik" disabled={!naik || sibuk} onClick={naik}>
            <ArrowUp aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Turunkan ${k.nama}`} title="Turun" disabled={!turun || sibuk} onClick={turun}>
            <ArrowDown aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Ganti nama ${k.nama}`} title="Ganti nama" onClick={() => setUbah(k.nama)}>
            <Pencil aria-hidden />
          </Button>
          <Button type="button" variant="destructive" size="icon" aria-label={`Hapus ${k.nama}`} title="Hapus" onClick={hapus} disabled={simpan.isPending}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
    </BarisAdmin>
  );
}
