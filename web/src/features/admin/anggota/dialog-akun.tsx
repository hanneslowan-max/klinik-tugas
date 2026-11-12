"use client";

// Aktifkan login / setel ulang password lewat Edge /x/admin/akun|reset (ARSITEKTUR §8). Password sementara dibuat di
// browser, tampil SEKALI sesudah berhasil; anggota wajib menggantinya saat masuk.
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POLA_EMAIL } from "@/features/admin/anggota/form-anggota";
import { MIN_SANDI, sandiSementara } from "@/features/admin/anggota/sandi";
import { useAkunAnggota } from "@/features/admin/queries";
import { Bidang, TeksRahasia, TombolSalin } from "@/features/admin/umum";
import { GalatApi, pesanGalat } from "@/lib/api/galat";
import type { Anggota } from "@/types/domain";

export type HasilAkun = { anggota: Anggota; email: string; sandi: string };

function buatSkema(reset: boolean) {
  return z.object({
    // reset: email login tidak diubah (akun sudah ada)
    email: reset
      ? z.string()
      : z.string().trim().min(1, "Email wajib diisi.").refine((v) => POLA_EMAIL.test(v), "Email tidak sah."),
    sandi: z.string().min(MIN_SANDI, `Password sementara minimal ${MIN_SANDI} karakter.`),
  });
}
type NilaiForm = z.infer<ReturnType<typeof buatSkema>>;

type Props = {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  anggota: Anggota | null;
  emailAwal: string;
  onBerhasil: (h: HasilAkun) => void;
};

export function DialogAkun({ buka, ubahBuka, anggota, emailAwal, onBerhasil }: Props) {
  const reset = Boolean(anggota?.punya_akun);
  return (
    <Lembar
      buka={buka}
      ubahBuka={ubahBuka}
      judul={`${reset ? "Setel ulang password" : "Aktifkan login"} ${anggota?.username ?? ""}`.trim()}
      deskripsi={
        reset
          ? "Password lama diganti password sementara. Anggota wajib menggantinya saat masuk berikutnya."
          : "Membuat akun login. Anggota wajib mengganti password sementara saat pertama masuk."
      }
      data-uji="dialog-akun"
    >
      {buka && anggota ? <FormAkun anggota={anggota} reset={reset} emailAwal={emailAwal} onBatal={() => ubahBuka(false)} onBerhasil={onBerhasil} /> : null}
    </Lembar>
  );
}

function FormAkun({
  anggota: m,
  reset,
  emailAwal,
  onBatal,
  onBerhasil,
}: {
  anggota: Anggota;
  reset: boolean;
  emailAwal: string;
  onBatal: () => void;
  onBerhasil: Props["onBerhasil"];
}) {
  const akun = useAkunAnggota();
  const [galat, setGalat] = useState<string | null>(null);
  const form = useForm<NilaiForm>({
    resolver: zodResolver(buatSkema(reset)),
    defaultValues: { email: reset ? (m.email ?? "") : emailAwal, sandi: sandiSementara() },
  });

  const kirim = form.handleSubmit(async (v) => {
    setGalat(null);
    try {
      await akun.mutateAsync({ reset, anggota: m, email: v.email, sandi: v.sandi });
      onBerhasil({ anggota: m, email: reset ? (m.email ?? "") : v.email, sandi: v.sandi });
    } catch (e) {
      setGalat(e instanceof GalatApi && e.hint === "EDGE_TIDAK_ADA" ? `${e.message} Hubungi pengelola aplikasi.` : pesanGalat(e));
    }
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={kirim} noValidate className="space-y-4">
      <Bidang label="Email login" htmlFor="akun-email" galat={e.email?.message}>
        {/* Controller: nama input sama dengan web lama (email-login) tanpa mengubah kunci form */}
        <Controller
          control={form.control}
          name="email"
          render={({ field }) => (
            <Input id="akun-email" type="email" autoComplete="off" aria-invalid={!!e.email} {...field} name="email-login" disabled={reset} />
          )}
        />
      </Bidang>
      <Bidang
        label={`Password sementara (min. ${MIN_SANDI})`}
        htmlFor="akun-sandi"
        ket="Berikan lewat jalur pribadi (WA/langsung), jangan di grup."
        galat={e.sandi?.message}
      >
        <Controller
          control={form.control}
          name="sandi"
          render={({ field }) => (
            <Input
              id="akun-sandi"
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={!!e.sandi}
              {...field}
              name="password-sementara"
            />
          )}
        />
      </Bidang>
      {galat ? (
        <KotakPesan nada="galat" data-uji="galat-akun">
          {galat}
        </KotakPesan>
      ) : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onBatal}>
          Batal
        </Button>
        <Button type="submit" disabled={akun.isPending} data-uji="kirim-akun">
          {akun.isPending ? "Memproses…" : reset ? "Setel ulang password" : "Aktifkan login"}
        </Button>
      </KakiLembar>
    </form>
  );
}

/** Password sementara hasil aktifkan/reset: tampil sekali, bisa disalin. */
export function DialogHasilAkun({ hasil, ubahBuka }: { hasil: HasilAkun | null; ubahBuka: (b: boolean) => void }) {
  return (
    <Lembar
      buka={hasil !== null}
      ubahBuka={ubahBuka}
      judul="Password sementara"
      kaki={
        hasil ? (
          <>
            <TombolSalin teks={hasil.sandi} />
            <Button type="button" onClick={() => ubahBuka(false)}>
              Selesai
            </Button>
          </>
        ) : null
      }
    >
      {hasil ? (
        <div className="space-y-3" data-uji="hasil-akun">
          <p className="text-sm">
            Login <strong>{hasil.anggota.username}</strong>: {hasil.email || "—"}
          </p>
          <TeksRahasia nilai={hasil.sandi} data-uji="sandi-sementara" />
          <KotakPesan nada="peringatan">Password ini hanya tampil sekali. Anggota diminta menggantinya saat masuk.</KotakPesan>
        </div>
      ) : null}
    </Lembar>
  );
}
