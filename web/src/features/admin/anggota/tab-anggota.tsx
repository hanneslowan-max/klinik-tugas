"use client";

// Admin › Anggota: daftar anggota (peran, status akun login), tambah/ubah anggota, aktifkan login / setel ulang
// password (Edge). Akun login dibuat owner (tanpa daftar mandiri).
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { DialogAkun, DialogHasilAkun, type HasilAkun } from "@/features/admin/anggota/dialog-akun";
import { DialogAnggota } from "@/features/admin/anggota/form-anggota";
import { useAnggotaAdmin } from "@/features/admin/queries";
import { BarisAdmin, DaftarAdmin, SubBaris } from "@/features/admin/umum";
import { LABEL_PERAN } from "@/lib/konstanta";
import { cn } from "@/lib/utils";
import type { Anggota } from "@/types/domain";

/** Satu dialog terbuka pada satu waktu: form anggota → (aktifkan login / reset) → password sementara. */
type Dialog =
  | { jenis: "form"; anggota: Anggota | null }
  | { jenis: "akun"; anggota: Anggota; email: string }
  | { jenis: "hasil"; hasil: HasilAkun }
  | null;

export function TabAnggota() {
  const q = useAnggotaAdmin();
  const [dialog, setDialog] = useState<Dialog>(null);
  const tutup = (buka: boolean) => {
    if (!buka) setDialog(null);
  };

  if (q.isPending) return <MemuatDaftar />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;

  return (
    <section className="space-y-3" aria-label="Anggota">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {q.data.length} anggota. Akun login dibuat owner (tanpa daftar mandiri).
        </p>
        <Button data-uji="tambah-anggota" onClick={() => setDialog({ jenis: "form", anggota: null })}>
          <UserPlus aria-hidden />
          Tambah anggota
        </Button>
      </div>

      {q.data.length === 0 ? (
        <Kosong>Belum ada anggota.</Kosong>
      ) : (
        <DaftarAdmin data-uji="daftar-anggota">
          {q.data.map((m) => (
            <BarisAnggota key={m.id} anggota={m} onUbah={() => setDialog({ jenis: "form", anggota: m })} />
          ))}
        </DaftarAdmin>
      )}

      <DialogAnggota
        buka={dialog?.jenis === "form"}
        ubahBuka={tutup}
        anggota={dialog?.jenis === "form" ? dialog.anggota : null}
        onAkun={(m, email) => setDialog({ jenis: "akun", anggota: m, email })}
      />
      <DialogAkun
        buka={dialog?.jenis === "akun"}
        ubahBuka={tutup}
        anggota={dialog?.jenis === "akun" ? dialog.anggota : null}
        emailAwal={dialog?.jenis === "akun" ? dialog.email : ""}
        onBerhasil={(hasil) => setDialog({ jenis: "hasil", hasil })}
      />
      <DialogHasilAkun hasil={dialog?.jenis === "hasil" ? dialog.hasil : null} ubahBuka={tutup} />
    </section>
  );
}

function BarisAnggota({ anggota: m, onUbah }: { anggota: Anggota; onUbah: () => void }) {
  return (
    <BarisAdmin data-anggota={m.username}>
      <AvatarAnggota anggota={m} ukuran="besar" className={cn(!m.aktif && "opacity-50")} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <strong className="font-semibold">{m.username}</strong>
          {m.nama && m.nama !== m.username ? <span className="text-muted-foreground"> · {m.nama}</span> : null}
        </div>
        <SubBaris>
          <Chip>{LABEL_PERAN[m.role]}</Chip>
          {!m.aktif ? <Chip nada="telat">nonaktif</Chip> : null}
          {m.role !== "bot" ? (
            <Chip nada={m.punya_akun ? "sukses" : "garis"}>{m.punya_akun ? "bisa login" : "belum ada login"}</Chip>
          ) : null}
          {m.harus_ganti_password ? <Chip nada="hari-ini">wajib ganti password</Chip> : null}
          {m.impor_clickup ? <Chip nada="garis">dari ClickUp</Chip> : null}
          {m.email ? <span className="min-w-0 break-all">{m.email}</span> : null}
        </SubBaris>
      </div>
      <Button variant="outline" aria-label={`Ubah ${m.username}`} onClick={onUbah}>
        Ubah
      </Button>
    </BarisAdmin>
  );
}
