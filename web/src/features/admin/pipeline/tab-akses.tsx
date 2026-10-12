"use client";

// Admin › Akses Pipeline (owner): tetapkan siapa yang boleh membuka modul Pipeline + perannya.
//  - admin: lihat semua lead + Ringkasan, buat/ubah semua. (Owner & bot sudah admin otomatis, tak perlu didaftar.)
//  - rep  : kelola leadnya sendiri (Riksa/Michael). kode SP (mis. RSG/MCE) dipakai membangun No SP otomatis.
//  - baca : lihat lead + Ringkasan, tanpa membuat/mengubah (mis. Yosie mencocokkan iklan vs lead).
// Simpan/cabut lewat web_pipeline_akses_simpan (owner-only di DB). Daftar dibaca web_pipeline_akses_daftar.
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePipelineAksesAdmin, useSimpanAksesPipeline } from "@/features/admin/queries";
import { BarisAdmin, Bidang, DaftarAdmin, SubBaris } from "@/features/admin/umum";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { AksesPipelineRow, AnggotaPilihAkses, PeranPipeline } from "@/types/domain";

const PERAN: { nilai: PeranPipeline; label: string; ket: string }[] = [
  { nilai: "rep", label: "Rep", ket: "Kelola lead sendiri (Riksa/Michael)" },
  { nilai: "admin", label: "Admin", ket: "Lihat semua lead + Ringkasan, kelola semua" },
  { nilai: "baca", label: "Baca", ket: "Lihat lead + Ringkasan saja (tanpa ubah)" },
];
const LABEL_PERAN: Record<PeranPipeline, string> = { admin: "admin", rep: "rep", baca: "baca" };

const skema = z
  .object({
    member: z.string().min(1, "Pilih anggota."),
    peran: z.enum(["admin", "rep", "baca"]),
    kode_sp: z.string().trim().max(10, "Maksimal 10 karakter.").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.peran === "rep" && !v.kode_sp) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["kode_sp"], message: "Kode SP wajib untuk rep (mis. RSG/MCE)." });
    }
  });
type NilaiForm = z.infer<typeof skema>;

export function TabAksesPipeline() {
  const q = usePipelineAksesAdmin();

  if (q.isPending) return <MemuatDaftar baris={3} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;

  return (
    <section className="space-y-4" aria-label="Akses Pipeline">
      <KotakPesan nada="info">
        Owner & bot (routine) otomatis admin — tak perlu didaftar di sini. Anggota lain tidak bisa membuka modul Pipeline
        sampai diberi akses.
      </KotakPesan>

      <FormAkses anggota={q.data.anggota} akses={q.data.akses} />

      {q.data.akses.length === 0 ? (
        <Kosong>Belum ada anggota yang diberi akses Pipeline.</Kosong>
      ) : (
        <DaftarAdmin data-uji="daftar-akses-pipeline">
          {q.data.akses.map((a) => (
            <BarisAkses key={a.member_id} akses={a} />
          ))}
        </DaftarAdmin>
      )}
    </section>
  );
}

function FormAkses({ anggota, akses }: { anggota: AnggotaPilihAkses[]; akses: AksesPipelineRow[] }) {
  const simpan = useSimpanAksesPipeline();
  const aksesPer = useMemo(() => new Map(akses.map((a) => [a.member_id, a])), [akses]);
  const form = useForm<NilaiForm>({
    resolver: zodResolver(skema),
    defaultValues: { member: "", peran: "rep", kode_sp: "" },
  });
  const peran = useWatch({ control: form.control, name: "peran" });

  const kirim = form.handleSubmit(async (v) => {
    try {
      await simpan.mutateAsync({
        member_id: Number(v.member),
        peran: v.peran,
        kode_sp: v.peran === "baca" ? null : (v.kode_sp?.trim().toUpperCase() || null),
      });
      const nama = anggota.find((m) => String(m.id) === v.member)?.username ?? "anggota";
      toast.success(`Akses ${LABEL_PERAN[v.peran]} diberikan ke ${nama}`);
      form.reset({ member: "", peran: "rep", kode_sp: "" });
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  if (anggota.length === 0) {
    return <KotakPesan nada="peringatan">Belum ada anggota aktif (role anggota) untuk diberi akses.</KotakPesan>;
  }

  return (
    <form onSubmit={kirim} noValidate className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="judul-beri-akses">
      <h2 id="judul-beri-akses" className="text-sm font-semibold">
        Beri / ubah akses
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Bidang label="Anggota" htmlFor="akses-anggota" galat={e.member?.message}>
          <Controller
            control={form.control}
            name="member"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} name="akses-anggota">
                <SelectTrigger id="akses-anggota" className="w-full">
                  <SelectValue placeholder="— pilih anggota —" />
                </SelectTrigger>
                <SelectContent>
                  {anggota.map((m) => {
                    const ada = aksesPer.get(m.id);
                    return (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.username}
                        {ada ? ` · sudah: ${LABEL_PERAN[ada.peran]}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
        <Bidang label="Peran" htmlFor="akses-peran" ket={PERAN.find((p) => p.nilai === peran)?.ket}>
          <Controller
            control={form.control}
            name="peran"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} name="akses-peran">
                <SelectTrigger id="akses-peran" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERAN.map((p) => (
                    <SelectItem key={p.nilai} value={p.nilai}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
        {peran !== "baca" ? (
          <Bidang
            label="Kode SP"
            htmlFor="akses-kode-sp"
            ket={peran === "rep" ? "Wajib. Dipakai membangun No SP (mis. RSG, MCE)." : "Opsional (bila admin juga menjual)."}
            galat={e.kode_sp?.message}
          >
            <Controller
              control={form.control}
              name="kode_sp"
              render={({ field }) => (
                <Input
                  id="akses-kode-sp"
                  placeholder="RSG"
                  autoComplete="off"
                  maxLength={10}
                  className="uppercase"
                  aria-invalid={!!e.kode_sp}
                  {...field}
                  name="akses-kode-sp"
                />
              )}
            />
          </Bidang>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Memilih anggota yang sudah punya akses akan memperbarui perannya.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={simpan.isPending} data-uji="beri-akses">
          <ShieldCheck aria-hidden />
          {simpan.isPending ? "Menyimpan…" : "Simpan akses"}
        </Button>
      </div>
    </form>
  );
}

function BarisAkses({ akses: a }: { akses: AksesPipelineRow }) {
  const konfirmasi = useKonfirmasi();
  const simpan = useSimpanAksesPipeline();

  const klikCabut = async () => {
    const ok = await konfirmasi({
      judul: "Cabut akses",
      pesan: `Cabut akses Pipeline untuk "${a.username}"? Menu Pipeline langsung hilang untuk anggota ini.`,
      ya: "Cabut",
      bahaya: true,
    });
    if (!ok) return;
    try {
      await simpan.mutateAsync({ member_id: a.member_id, hapus: true });
      toast.success(`Akses ${a.username} dicabut`);
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <BarisAdmin data-akses={a.member_id} className={cn(!a.aktif && "bg-muted/40")}>
      <div className="min-w-0 flex-1">
        <strong className={cn("block truncate text-sm font-semibold", !a.aktif && "text-muted-foreground")}>
          {a.username}
          {a.nama ? ` · ${a.nama}` : ""}
        </strong>
        <SubBaris>
          <Chip nada={a.peran === "admin" ? "hari-ini" : undefined}>{LABEL_PERAN[a.peran]}</Chip>
          {a.kode_sp ? <Chip>SP {a.kode_sp}</Chip> : null}
          {!a.aktif ? <Chip nada="telat">nonaktif</Chip> : null}
        </SubBaris>
      </div>
      <Button variant="destructive" onClick={klikCabut} disabled={simpan.isPending} aria-label={`Cabut akses ${a.username}`}>
        Cabut
      </Button>
    </BarisAdmin>
  );
}
