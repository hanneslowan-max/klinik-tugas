"use client";

// Isi form "Tugas baru" / "Sub-tugas baru" (zod + react-hook-form). Dimuat MALAS oleh dialog-buat-tugas.tsx
// (next/dynamic): pustaka form (±37 KB gz) tidak ikut di JS awal /l dan /t, baru diunduh saat dialog akan dibuka
// (pramuat saat senggang / pointerdown / fokus tombol). Kategori pekerjaan ikut diisi saat membuat (28 Okt 2026);
// tanpa `list` (dari Jelajah per kategori) form menampilkan pilihan list yang boleh ditulis (mode cermin: list app).
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { useKategoriKerja } from "@/features/kategori/queries";
import { useProfil } from "@/features/profil/penyedia-profil";
import { listDatar, useStruktur } from "@/features/struktur/queries";
import { useBuatTugas, type BodyBuatTugas } from "@/features/tugas/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { PRIORITAS } from "@/lib/konstanta";
import { peringatanTanggal } from "@/lib/tanggal";
import type { StatusList, Tugas } from "@/types/domain";

const skema = z.object({
  nama: z.string().trim().min(1, "Nama tugas wajib diisi.").max(500, "Nama tugas maksimal 500 karakter."),
  deskripsi: z.string(),
  status: z.string(),
  prioritas: z.string(),
  due: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Tanggal tidak sah."),
  assignees: z.array(z.number()),
  list: z.string(),
  kategori: z.string(),
});
type NilaiForm = z.infer<typeof skema>;

export type PropsForm = {
  list?: { id: string; name: string; statuses: StatusList[] };
  parentId?: string;
  kategoriAwal?: string | null;
  onBatal: () => void;
  onDibuat: (t: Tugas) => void;
};

const TANPA = "tanpa";
const urutkan = (st: StatusList[]) => [...st].sort((a, b) => a.orderindex - b.orderindex);

export function FormBuatTugas({ list, parentId, kategoriAwal, onBatal, onDibuat }: PropsForm) {
  const { member, libur, cermin } = useProfil();
  const anggota = useAnggotaAktif();
  const kategori = useKategoriKerja();
  const struktur = useStruktur();
  const buat = useBuatTugas();
  const [galat, setGalat] = useState<string | null>(null);
  // pilihan list hanya bila list tidak ditentukan pemanggil: list aktif yang boleh ditulis
  const pilihanList = useMemo(
    () => (list ? [] : listDatar(struktur.data).filter((l) => !cermin || l.sumber === "app")),
    [list, struktur.data, cermin],
  );

  const form = useForm<NilaiForm>({
    resolver: zodResolver(skema),
    defaultValues: {
      nama: "",
      deskripsi: "",
      status: list ? (urutkan(list.statuses)[0]?.status ?? "") : "",
      prioritas: "",
      due: "",
      assignees: member.role !== "bot" ? [Number(member.id)] : [],
      list: list?.id ?? "",
      kategori: kategoriAwal ?? "",
    },
  });
  const idList = useWatch({ control: form.control, name: "list" });
  const tujuan = list ?? pilihanList.find((l) => l.id === idList);
  const statuses = tujuan ? urutkan(tujuan.statuses) : [];
  const due = useWatch({ control: form.control, name: "due" });
  const pesanDue = peringatanTanggal(due, libur);

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    if (!tujuan) {
      form.setError("list", { message: "Pilih list tujuan." });
      return;
    }
    const body: BodyBuatTugas = { name: v.nama.trim(), assignees: v.assignees };
    if (v.status) body.status = v.status;
    if (v.kategori) body.kategori = v.kategori;
    if (v.deskripsi.trim()) body.markdown = v.deskripsi;
    if (v.due) body.due = v.due;
    if (v.prioritas) body.priority = Number(v.prioritas);
    if (parentId) body.parent_id = parentId;
    try {
      const t = await buat.mutateAsync({ list: tujuan.id, body });
      toast.success("Tugas dibuat");
      onDibuat(t);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bt-nama">Nama tugas</Label>
        <Input id="bt-nama" autoComplete="off" placeholder="mis. Y7 · Ringkasan kampanye" autoFocus aria-invalid={!!e.nama} {...form.register("nama")} />
        {e.nama ? <p className="text-xs text-telat">{e.nama.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bt-desk">Deskripsi</Label>
        <Textarea id="bt-desk" rows={4} placeholder="Deskripsi (markdown). Tulis juga cara cek & kapan dianggap selesai." {...form.register("deskripsi")} />
      </div>
      {!list ? (
        <div className="space-y-1.5">
          <Label>List</Label>
          <Controller
            control={form.control}
            name="list"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  // status mengikuti list baru (status open pertama)
                  const l = pilihanList.find((x) => x.id === v);
                  form.setValue("status", l ? (urutkan(l.statuses)[0]?.status ?? "") : "");
                }}
              >
                <SelectTrigger className="w-full" aria-label="List" aria-invalid={!!e.list} data-uji="pilih-list-buat">
                  <SelectValue placeholder={struktur.isPending ? "Memuat list…" : "Pilih list"} />
                </SelectTrigger>
                <SelectContent>
                  {pilihanList.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {e.list ? <p className="text-xs text-telat">{e.list.message}</p> : null}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label>Kategori</Label>
        <Controller
          control={form.control}
          name="kategori"
          render={({ field }) => (
            <Select value={field.value || TANPA} onValueChange={(v) => field.onChange(v === TANPA ? "" : v)}>
              <SelectTrigger className="w-full" aria-label="Kategori" data-uji="pilih-kategori-buat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TANPA}>— tanpa kategori —</SelectItem>
                {(kategori.data?.kategori ?? []).map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={!statuses.length}>
                <SelectTrigger className="w-full" aria-label="Status">
                  <SelectValue placeholder="Pilih list dulu" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.status} value={s.status}>
                      {s.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prioritas</Label>
          <Controller
            control={form.control}
            name="prioritas"
            render={({ field }) => (
              <Select value={field.value || "tanpa"} onValueChange={(v) => field.onChange(v === "tanpa" ? "" : v)}>
                <SelectTrigger className="w-full" aria-label="Prioritas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tanpa">— tanpa —</SelectItem>
                  {Object.entries(PRIORITAS).map(([k, p]) => (
                    <SelectItem key={k} value={k}>
                      {p.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bt-due">Due (tanggal WIB)</Label>
        <Input id="bt-due" type="date" {...form.register("due")} />
        {pesanDue ? <KotakPesan nada="peringatan">{pesanDue}</KotakPesan> : null}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Assignee</legend>
        <Controller
          control={form.control}
          name="assignees"
          render={({ field }) => (
            <ul className="grid gap-0.5 sm:grid-cols-2">
              {(anggota.data ?? []).map((m) => {
                const dipilih = field.value.includes(Number(m.id));
                return (
                  <li key={m.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-muted">
                      <Checkbox
                        checked={dipilih}
                        onCheckedChange={(v) =>
                          field.onChange(v === true ? [...field.value, Number(m.id)] : field.value.filter((x) => x !== Number(m.id)))
                        }
                      />
                      <AvatarAnggota anggota={m} />
                      <span className="truncate text-sm">{m.username}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        />
      </fieldset>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onBatal}>
          Batal
        </Button>
        <Button type="submit" disabled={buat.isPending} data-uji="kirim-buat-tugas">
          {buat.isPending ? "Membuat…" : "Buat tugas"}
        </Button>
      </KakiLembar>
    </form>
  );
}
