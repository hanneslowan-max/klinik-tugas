"use client";

// Form tambah/ubah space, folder, list (web_admin_struktur_simpan; tanpa hapus — arsipkan saja). Mode cermin: struktur
// asal ClickUp hanya-baca, kecuali tanda "tidak ditagih" pada list (aturan aplikasi, bukan data ClickUp).
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimpanStruktur, type DataStruktur, type JenisStruktur } from "@/features/admin/queries";
import { Bidang } from "@/features/admin/umum";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import type { FolderStruktur, ListStruktur, SpaceStruktur, Struktur } from "@/types/domain";

export type ItemStruktur = SpaceStruktur | FolderStruktur | ListStruktur;

/** Sasaran form: item yang diubah, atau null = tambah baru. */
export type SasaranStruktur = { jenis: JenisStruktur; item: ItemStruktur | null };

const TANPA_FOLDER = "__tanpa__";

type NilaiForm = {
  nama: string;
  space: string;
  folder: string;
  privat: boolean;
  tersembunyi: boolean;
  tidakDitagih: boolean;
  arsip: boolean;
};

type Props = {
  sasaran: SasaranStruktur | null;
  ubahBuka: (b: boolean) => void;
  struktur: Struktur;
};

export function DialogStruktur({ sasaran, ubahBuka, struktur }: Props) {
  const judul = sasaran ? `${sasaran.item ? "Ubah" : "Tambah"} ${sasaran.jenis}` : "";
  return (
    <Lembar buka={sasaran !== null} ubahBuka={ubahBuka} judul={judul} data-uji="dialog-struktur">
      {sasaran ? <FormStruktur sasaran={sasaran} struktur={struktur} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function FormStruktur({ sasaran: { jenis, item: x }, struktur: s, onSelesai }: { sasaran: SasaranStruktur; struktur: Struktur; onSelesai: () => void }) {
  const { cermin } = useProfil();
  const simpan = useSimpanStruktur();
  const [galat, setGalat] = useState<string | null>(null);
  const baru = x === null;
  const kunciCu = cermin && x?.sumber === "clickup";

  const form = useForm<NilaiForm>({
    resolver: zodResolver(
      z.object({
        nama: kunciCu ? z.string() : z.string().trim().min(1, "Nama wajib diisi."),
        space: baru && jenis !== "space" ? z.string().min(1, "Pilih space.") : z.string(),
        folder: z.string(),
        privat: z.boolean(),
        tersembunyi: z.boolean(),
        tidakDitagih: z.boolean(),
        arsip: z.boolean(),
      }),
    ),
    defaultValues: {
      nama: x?.name ?? "",
      space: s.spaces[0]?.id ?? "",
      folder: TANPA_FOLDER,
      privat: x !== null && "private" in x ? x.private : false,
      tersembunyi: x !== null && "hidden" in x ? x.hidden : false,
      tidakDitagih: x !== null && "tidak_ditagih" in x ? x.tidak_ditagih : false,
      arsip: x?.archived ?? false,
    },
  });
  const spaceId = useWatch({ control: form.control, name: "space" });
  const folders = s.spaces.find((sp) => sp.id === spaceId)?.folders ?? [];

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    const p: DataStruktur = { jenis };
    if (x) p.id = x.id;
    if (!kunciCu) {
      p.name = v.nama;
      if (!baru) p.archived = v.arsip;
      if (jenis === "space") p.private = v.privat;
      if (jenis === "folder") p.hidden = v.tersembunyi;
    }
    if (jenis === "list") p.tidak_ditagih = v.tidakDitagih;
    if (baru && jenis !== "space") p.space_id = v.space;
    if (baru && jenis === "list" && v.folder !== TANPA_FOLDER) p.folder_id = v.folder;
    try {
      await simpan.mutateAsync(p);
      toast.success("Struktur disimpan");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      {kunciCu ? <KotakPesan nada="cermin">Struktur ClickUp: hanya &quot;tidak ditagih&quot; yang bisa diubah selama mode cermin.</KotakPesan> : null}
      <Bidang label="Nama" htmlFor="st-nama" galat={e.nama?.message}>
        <Input id="st-nama" autoComplete="off" disabled={kunciCu} aria-invalid={!!e.nama} autoFocus={baru} {...form.register("nama")} />
      </Bidang>
      {baru && jenis !== "space" ? (
        <Bidang label="Space" htmlFor="st-space" galat={e.space?.message}>
          <Controller
            control={form.control}
            name="space"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("folder", TANPA_FOLDER);
                }}
              >
                <SelectTrigger id="st-space" className="w-full">
                  <SelectValue placeholder="— pilih space —" />
                </SelectTrigger>
                <SelectContent>
                  {s.spaces.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.name}
                      {sp.archived ? " (arsip)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
      ) : null}
      {baru && jenis === "list" ? (
        <Bidang label="Folder" htmlFor="st-folder">
          <Controller
            control={form.control}
            name="folder"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="st-folder" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TANPA_FOLDER}>— tanpa folder —</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.archived ? " (arsip)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
      ) : null}
      <div className="space-y-0.5">
        {jenis === "space" ? <Centang control={form.control} name="privat" label="Privat" disabled={kunciCu} /> : null}
        {jenis === "folder" ? <Centang control={form.control} name="tersembunyi" label="Tersembunyi" disabled={kunciCu} /> : null}
        {jenis === "list" ? <Centang control={form.control} name="tidakDitagih" label="Tidak ditagih (tidak masuk TENGGAT/B5)" /> : null}
        {!baru ? <Centang control={form.control} name="arsip" label="Diarsip" disabled={kunciCu} /> : null}
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="submit" disabled={simpan.isPending} data-uji="simpan-struktur">
          {simpan.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </form>
  );
}

function Centang({
  control,
  name,
  label,
  disabled,
}: {
  control: Control<NilaiForm>;
  name: "privat" | "tersembunyi" | "tidakDitagih" | "arsip";
  label: string;
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-60">
          <Checkbox name={name} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={disabled} />
          {label}
        </label>
      )}
    />
  );
}
