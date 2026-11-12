"use client";

// Form "Tambah anggota" / "Ubah <username>" (web_admin_anggota_simpan). Username anggota impor ClickUp dikunci;
// owner tidak bisa menurunkan peran / menonaktifkan dirinya sendiri (dicek juga di DB). Aksi akun login (Edge)
// tersedia di dalam form untuk anggota aktif non-bot.
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogIn } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimpanAnggota, type DataAnggota } from "@/features/admin/queries";
import { Bidang, KELAS_WARNA, warnaInput } from "@/features/admin/umum";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import type { Anggota, Peran } from "@/types/domain";

// nilai DB tetap owner/member/bot; label Indonesia
const PILIHAN_PERAN = [
  { nilai: "member", label: "anggota" },
  { nilai: "owner", label: "owner (admin penuh)" },
  { nilai: "bot", label: "bot (token agent)" },
] as const satisfies readonly { nilai: Peran; label: string }[];

export const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailBoleh = (pesan: string) => z.string().trim().refine((v) => !v || POLA_EMAIL.test(v), pesan);

function buatSkema(usernameDikunci: boolean) {
  return z.object({
    username: usernameDikunci ? z.string() : z.string().trim().min(1, "Username wajib diisi."),
    nama: z.string().trim(),
    email: emailBoleh("Email login tidak sah."),
    clickup_email: emailBoleh("Email ClickUp tidak sah."),
    initials: z.string().trim().max(3, "Inisial maksimal 3 huruf."),
    color: z.string(),
    role: z.enum(["member", "owner", "bot"]),
    aktif: z.boolean(),
  });
}
type NilaiForm = z.infer<ReturnType<typeof buatSkema>>;

type Props = {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  /** null = anggota baru */
  anggota: Anggota | null;
  /** buka dialog aktifkan login / setel ulang password (email = isi kolom email login saat ini) */
  onAkun: (m: Anggota, email: string) => void;
};

export function DialogAnggota({ buka, ubahBuka, anggota, onAkun }: Props) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={anggota ? `Ubah ${anggota.username}` : "Tambah anggota"} lebar data-uji="dialog-anggota">
      {buka ? <FormAnggota anggota={anggota} onSelesai={() => ubahBuka(false)} onAkun={onAkun} /> : null}
    </Lembar>
  );
}

function FormAnggota({ anggota: m, onSelesai, onAkun }: { anggota: Anggota | null; onSelesai: () => void; onAkun: Props["onAkun"] }) {
  const { member } = useProfil();
  const simpan = useSimpanAnggota();
  const [galat, setGalat] = useState<string | null>(null);
  const dikunci = Boolean(m?.impor_clickup);
  const diriSendiri = m !== null && Number(m.id) === Number(member.id);

  const form = useForm<NilaiForm>({
    resolver: zodResolver(buatSkema(dikunci)),
    defaultValues: {
      username: m?.username ?? "",
      nama: m?.nama ?? "",
      email: m?.email ?? "",
      clickup_email: m?.clickup_email ?? "",
      initials: m?.initials ?? "",
      color: warnaInput(m?.color),
      role: m?.role ?? "member",
      aktif: m?.aktif ?? true,
    },
  });
  const [username, initials, color, email] = useWatch({ control: form.control, name: ["username", "initials", "color", "email"] });

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    const p: DataAnggota = {
      nama: v.nama,
      email: v.email,
      clickup_email: v.clickup_email,
      initials: v.initials,
      color: v.color,
      role: v.role,
      aktif: v.aktif,
    };
    if (!dikunci) p.username = v.username;
    if (m) p.id = m.id;
    try {
      await simpan.mutateAsync(p);
      toast.success(m ? "Anggota disimpan" : "Anggota ditambahkan");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  const bisaAkun = m !== null && m.role !== "bot" && m.aktif;
  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      <Bidang
        label="Username (dipakai untuk @mention & routine)"
        htmlFor="ag-username"
        ket={dikunci ? "Username anggota dari ClickUp dikunci." : 'Huruf kecil, mis. "nama depan".'}
        galat={e.username?.message}
      >
        <Input id="ag-username" autoComplete="off" disabled={dikunci} aria-invalid={!!e.username} autoFocus={!m} {...form.register("username")} />
      </Bidang>
      <Bidang label="Nama lengkap" htmlFor="ag-nama">
        <Input id="ag-nama" autoComplete="off" {...form.register("nama")} />
      </Bidang>
      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Email login" htmlFor="ag-email" ket="Email untuk masuk ke aplikasi." galat={e.email?.message}>
          <Input id="ag-email" type="email" autoComplete="off" aria-invalid={!!e.email} {...form.register("email")} />
        </Bidang>
        <Bidang label="Email ClickUp" htmlFor="ag-cu-email" galat={e.clickup_email?.message}>
          <Input id="ag-cu-email" type="email" autoComplete="off" aria-invalid={!!e.clickup_email} {...form.register("clickup_email")} />
        </Bidang>
      </div>
      <div className="flex items-end gap-3">
        <Bidang label="Inisial" htmlFor="ag-inisial" galat={e.initials?.message} className="w-24">
          <Input id="ag-inisial" maxLength={3} autoComplete="off" aria-invalid={!!e.initials} {...form.register("initials")} />
        </Bidang>
        <Bidang label="Warna" htmlFor="ag-warna">
          <input id="ag-warna" type="color" className={KELAS_WARNA} {...form.register("color")} />
        </Bidang>
        <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
          <AvatarAnggota anggota={{ username: username || "?", initials: initials || null, color }} ukuran="besar" />
          <span>Pratinjau</span>
        </div>
      </div>
      <Bidang
        label="Peran"
        htmlFor="ag-peran"
        ket="owner = admin penuh; anggota = anggota tim; bot = pemilik token routine/agent (tanpa login)."
      >
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={diriSendiri} name="role">
              <SelectTrigger id="ag-peran" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PILIHAN_PERAN.map((p) => (
                  // anggota yang sudah punya akun login tidak bisa dijadikan bot (ditolak DB)
                  <SelectItem key={p.nilai} value={p.nilai} disabled={p.nilai === "bot" && Boolean(m?.punya_akun)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Bidang>
      <Controller
        control={form.control}
        name="aktif"
        render={({ field }) => (
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <Checkbox name="aktif" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={diriSendiri} />
            Aktif
          </label>
        )}
      />
      {diriSendiri ? <p className="text-xs text-muted-foreground">Anda tidak bisa menurunkan peran atau menonaktifkan diri sendiri.</p> : null}

      {bisaAkun ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-sm font-medium">Akun login</div>
          <p className="text-xs text-muted-foreground">
            {m.punya_akun
              ? "Sudah bisa login. Setel ulang bila anggota lupa password."
              : "Belum bisa login. Aktifkan login dengan email di atas dan password sementara."}
          </p>
          <Button
            type="button"
            variant="outline"
            data-uji={m.punya_akun ? "reset-password" : "aktifkan-login"}
            onClick={() => onAkun(m, email ?? "")}
          >
            {m.punya_akun ? <KeyRound aria-hidden /> : <LogIn aria-hidden />}
            {m.punya_akun ? "Setel ulang password" : "Aktifkan login"}
          </Button>
        </div>
      ) : null}

      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="submit" disabled={simpan.isPending} data-uji="simpan-anggota">
          {simpan.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </form>
  );
}
