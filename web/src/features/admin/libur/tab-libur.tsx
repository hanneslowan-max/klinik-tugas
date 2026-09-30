"use client";

// Admin › Hari libur: tambah (tanggal WIB + nama) dan hapus (web_admin_libur_simpan). Hari libur mengurangi hitungan
// hari kerja (≤3 hari kerja, TENGGAT, sisa hk) di semua layar.
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLiburAdmin, useSimpanLibur, type HariLibur } from "@/features/admin/queries";
import { BarisAdmin, Bidang, DaftarAdmin, SubBaris } from "@/features/admin/umum";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { fmtTanggalPanjang } from "@/lib/tanggal";
import { cn } from "@/lib/utils";

const skema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal."),
  nama: z.string().trim().min(1, "Isi nama hari libur."),
});
type NilaiForm = z.infer<typeof skema>;

export function TabLibur() {
  const q = useLiburAdmin();
  return (
    <section className="space-y-4" aria-label="Hari libur">
      <p className="text-sm text-muted-foreground">Hari libur mengurangi hitungan hari kerja (≤3 hari kerja, TENGGAT, sisa hk).</p>
      <FormLibur />
      {q.isPending ? (
        <MemuatDaftar baris={3} />
      ) : q.isError ? (
        <GalatMuat galat={q.error} ulang={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Kosong>Belum ada hari libur.</Kosong>
      ) : (
        <DaftarAdmin data-uji="daftar-libur">
          {q.data.map((r) => (
            <BarisLibur key={r.tanggal} libur={r} />
          ))}
        </DaftarAdmin>
      )}
    </section>
  );
}

function FormLibur() {
  const simpan = useSimpanLibur();
  const [galat, setGalat] = useState<string | null>(null);
  const form = useForm<NilaiForm>({ resolver: zodResolver(skema), defaultValues: { tanggal: "", nama: "" } });

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    try {
      await simpan.mutateAsync({ tanggal: v.tanggal, nama: v.nama });
      toast.success("Hari libur disimpan");
      form.reset();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={kirim} noValidate className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Tambah hari libur">
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start">
        <Bidang label="Tanggal" htmlFor="libur-tanggal" galat={e.tanggal?.message}>
          <Input id="libur-tanggal" type="date" aria-invalid={!!e.tanggal} {...form.register("tanggal")} />
        </Bidang>
        <Bidang label="Nama" htmlFor="libur-nama" galat={e.nama?.message}>
          {/* Controller: nama input sama dengan web lama (nama-libur) tanpa mengubah kunci form */}
          <Controller
            control={form.control}
            name="nama"
            render={({ field }) => (
              <Input id="libur-nama" placeholder="mis. Maulid Nabi" autoComplete="off" aria-invalid={!!e.nama} {...field} name="nama-libur" />
            )}
          />
        </Bidang>
        <div className="flex justify-end sm:pt-5">
          <Button type="submit" disabled={simpan.isPending} data-uji="tambah-libur">
            <CalendarPlus aria-hidden />
            {simpan.isPending ? "Menyimpan…" : "Tambah hari libur"}
          </Button>
        </div>
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
    </form>
  );
}

function BarisLibur({ libur: r }: { libur: HariLibur }) {
  const { hariIni } = useProfil();
  const konfirmasi = useKonfirmasi();
  const simpan = useSimpanLibur();
  const lewat = r.tanggal < hariIni;

  const hapus = async () => {
    const ok = await konfirmasi({
      judul: "Hapus hari libur",
      pesan: `Hapus hari libur ${r.nama} (${fmtTanggalPanjang(r.tanggal)})?`,
      ya: "Hapus",
      bahaya: true,
    });
    if (!ok) return;
    try {
      await simpan.mutateAsync({ tanggal: r.tanggal, hapus: true });
      toast.success("Dihapus");
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <BarisAdmin data-libur={r.tanggal} className={cn(lewat && "text-muted-foreground")}>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">{r.nama}</strong>
        <SubBaris>
          <span>{fmtTanggalPanjang(r.tanggal)}</span>
          {lewat ? <span>· sudah lewat</span> : null}
        </SubBaris>
      </div>
      <Button variant="destructive" onClick={hapus} disabled={simpan.isPending} aria-label={`Hapus ${r.nama}`}>
        Hapus
      </Button>
    </BarisAdmin>
  );
}
