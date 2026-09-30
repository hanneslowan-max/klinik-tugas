"use client";

// Admin › Token API: buat token untuk routine/agent (tampil SEKALI; DB hanya menyimpan sha256), daftar token beserta
// pemakaian terakhir, dan cabut (routine/agent yang memakainya langsung ditolak).
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnggotaAdmin, useBuatToken, useCabutToken, useTokenAdmin } from "@/features/admin/queries";
import { BarisAdmin, Bidang, DaftarAdmin, SubBaris, TeksRahasia, TombolSalin } from "@/features/admin/umum";
import { pesanGalat } from "@/lib/api/galat";
import { LABEL_PERAN } from "@/lib/konstanta";
import { fmtWaktu } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { Anggota, TokenApi, TokenBaru } from "@/types/domain";

const HAK_AKSES = [
  { nilai: "baca", label: "baca (hanya membaca)" },
  { nilai: "tulis", label: "tulis (baca + buat/ubah)" },
  { nilai: "impor", label: "impor (khusus sinkron ClickUp)" },
] as const satisfies readonly { nilai: TokenApi["scope"]; label: string }[];

const skema = z.object({
  member: z.string().min(1, "Pilih anggota."),
  nama: z.string().trim().min(1, "Nama token wajib diisi."),
  scope: z.enum(["baca", "tulis", "impor"]),
});
type NilaiForm = z.infer<typeof skema>;

export function TabToken() {
  const anggota = useAnggotaAdmin();
  const tokens = useTokenAdmin();
  const [tokenBaru, setTokenBaru] = useState<TokenBaru | null>(null);

  return (
    <section className="space-y-4" aria-label="Token API">
      {anggota.isPending ? (
        <MemuatDaftar baris={1} />
      ) : anggota.isError ? (
        <GalatMuat galat={anggota.error} ulang={() => anggota.refetch()} />
      ) : (
        <FormToken anggota={anggota.data.filter((m) => m.aktif)} onDibuat={setTokenBaru} />
      )}

      {tokens.isPending ? (
        <MemuatDaftar baris={3} />
      ) : tokens.isError ? (
        <GalatMuat galat={tokens.error} ulang={() => tokens.refetch()} />
      ) : tokens.data.length === 0 ? (
        <Kosong>Belum ada token.</Kosong>
      ) : (
        <DaftarAdmin data-uji="daftar-token">
          {tokens.data.map((k) => (
            <BarisToken key={k.id} token={k} />
          ))}
        </DaftarAdmin>
      )}

      <DialogTokenBaru token={tokenBaru} ubahBuka={(b) => !b && setTokenBaru(null)} />
    </section>
  );
}

function FormToken({ anggota, onDibuat }: { anggota: Anggota[]; onDibuat: (t: TokenBaru) => void }) {
  const buat = useBuatToken();
  const [galat, setGalat] = useState<string | null>(null);
  // bawaan: anggota bot (pemilik token routine/agent)
  const bawaan = anggota.find((m) => m.role === "bot") ?? anggota[0];
  const form = useForm<NilaiForm>({
    resolver: zodResolver(skema),
    defaultValues: { member: bawaan ? String(bawaan.id) : "", nama: "", scope: "baca" },
  });

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    try {
      const t = await buat.mutateAsync({ member: Number(v.member), nama: v.nama, scope: v.scope });
      form.resetField("nama");
      onDibuat(t);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={kirim} noValidate className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="judul-buat-token">
      <h2 id="judul-buat-token" className="text-sm font-semibold">
        Buat token
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Bidang label="Anggota" htmlFor="token-anggota" galat={e.member?.message}>
          <Controller
            control={form.control}
            name="member"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} name="token-anggota">
                <SelectTrigger id="token-anggota" className="w-full">
                  <SelectValue placeholder="— pilih anggota —" />
                </SelectTrigger>
                <SelectContent>
                  {anggota.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.username} ({LABEL_PERAN[m.role]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
        <Bidang label="Nama" htmlFor="token-nama" galat={e.nama?.message}>
          <Controller
            control={form.control}
            name="nama"
            render={({ field }) => (
              <Input id="token-nama" placeholder="mis. routine digest pagi" autoComplete="off" aria-invalid={!!e.nama} {...field} name="token-nama" />
            )}
          />
        </Bidang>
        <Bidang label="Hak akses" htmlFor="token-scope">
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} name="token-scope">
                <SelectTrigger id="token-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HAK_AKSES.map((h) => (
                    <SelectItem key={h.nilai} value={h.nilai}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Bidang>
      </div>
      <p className="text-xs text-muted-foreground">Routine: baca. Sesi interaktif agent: tulis (tanpa hapus). Hapus hanya token owner.</p>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={buat.isPending} data-uji="buat-token">
          <KeyRound aria-hidden />
          {buat.isPending ? "Membuat…" : "Buat token"}
        </Button>
      </div>
    </form>
  );
}

/** Token mentah tampil SEKALI; begitu dialog ditutup, token dibuang dari memori layar. */
function DialogTokenBaru({ token, ubahBuka }: { token: TokenBaru | null; ubahBuka: (b: boolean) => void }) {
  return (
    <Lembar
      buka={token !== null}
      ubahBuka={ubahBuka}
      judul="Token baru"
      kaki={
        token ? (
          <>
            <TombolSalin teks={token.token} />
            <Button type="button" onClick={() => ubahBuka(false)}>
              Sudah disalin
            </Button>
          </>
        ) : null
      }
    >
      {token ? (
        <div className="space-y-3" data-uji="token-baru">
          <KotakPesan nada="peringatan">Salin sekarang. Token ini hanya tampil SEKALI dan tidak bisa dilihat lagi.</KotakPesan>
          <TeksRahasia nilai={token.token} data-uji="token-mentah" />
          <p className="text-xs text-muted-foreground">
            {token.nama} · hak {token.scope} · awalan {token.prefix}
          </p>
        </div>
      ) : null}
    </Lembar>
  );
}

function BarisToken({ token: k }: { token: TokenApi }) {
  const konfirmasi = useKonfirmasi();
  const cabut = useCabutToken();

  const klikCabut = async () => {
    const ok = await konfirmasi({
      judul: "Cabut token",
      pesan: `Cabut token "${k.nama}" (${k.prefix}…)? Routine/agent yang memakainya langsung ditolak.`,
      ya: "Cabut",
      bahaya: true,
    });
    if (!ok) return;
    try {
      await cabut.mutateAsync(k.id);
      toast.success("Token dicabut");
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  };

  return (
    <BarisAdmin data-token={k.prefix} className={cn(k.revoked_at && "bg-muted/40")}>
      <div className="min-w-0 flex-1">
        <strong className={cn("block truncate text-sm font-semibold", k.revoked_at && "text-muted-foreground")}>{k.nama}</strong>
        <SubBaris>
          <code className="rounded bg-muted px-1 font-mono">{k.prefix}…</code>
          <Chip>{k.scope}</Chip>
          <span>{k.member.username}</span>
          {k.revoked_at ? <Chip nada="telat">dicabut {fmtWaktu(k.revoked_at)}</Chip> : null}
          <span>{k.last_used_at ? `dipakai ${fmtWaktu(k.last_used_at)}` : "belum dipakai"}</span>
        </SubBaris>
      </div>
      {k.revoked_at ? null : (
        <Button variant="destructive" onClick={klikCabut} disabled={cabut.isPending} aria-label={`Cabut token ${k.nama}`}>
          Cabut
        </Button>
      )}
    </BarisAdmin>
  );
}
