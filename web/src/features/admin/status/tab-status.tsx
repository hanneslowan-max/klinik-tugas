"use client";

// Admin › Status list: status per list (warna, nama, tipe, urutan). Simpan = ganti seluruh daftar status
// (web_admin_status_simpan; nama_lama = ganti nama, tugas ikut). List ClickUp hanya-baca selama mode cermin.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { TitikWarna } from "@/components/umum/status-pil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimpanStatus, useStrukturAdmin, type StatusKirim } from "@/features/admin/queries";
import { Bidang, DaftarAdmin, KELAS_WARNA, warnaInput } from "@/features/admin/umum";
import { useProfil } from "@/features/profil/penyedia-profil";
import { listDatar } from "@/features/struktur/queries";
import { pesanGalat } from "@/lib/api/galat";
import type { ListDatar, TipeStatus } from "@/types/domain";

// nilai = tipe status ClickUp (open/custom/done/closed); label Indonesia
const TIPE_STATUS = [
  { nilai: "open", label: "Awal (open)" },
  { nilai: "custom", label: "Proses (custom)" },
  { nilai: "done", label: "Selesai (done)" },
  { nilai: "closed", label: "Ditutup (closed)" },
] as const satisfies readonly { nilai: TipeStatus; label: string }[];

const labelTipe = (t: TipeStatus) => TIPE_STATUS.find((x) => x.nilai === t)?.label ?? t;

const WARNA_STATUS_BAKU = "#d3d3d3";
const WARNA_STATUS_BARU = "#a0a0a0";

export function TabStatus() {
  const q = useStrukturAdmin();
  const { cermin } = useProfil();
  const [listId, setListId] = useState("");
  // naik sesudah simpan → editor dipasang ulang dari data segar (bukan tiap muat ulang latar, supaya suntingan aman)
  const [versi, setVersi] = useState(0);

  if (q.isPending) return <MemuatDaftar baris={3} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;

  const lists = listDatar(q.data, true);
  const list = lists.find((l) => l.id === listId) ?? null;

  return (
    <section className="space-y-4" aria-label="Status list">
      <Bidang label="List" htmlFor="status-list" className="max-w-xl">
        <Select value={listId} onValueChange={setListId}>
          <SelectTrigger id="status-list" className="w-full" aria-label="Pilih list" data-uji="status-pilih-list">
            <SelectValue placeholder="— pilih list —" />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id} data-list={l.id}>
                {l.label}
                {l.archived ? " (arsip)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Bidang>
      {list ? (
        <EditorStatus
          key={`${list.id}:${versi}`}
          list={list}
          terkunci={cermin && list.sumber === "clickup"}
          onTersimpan={() => setVersi((v) => v + 1)}
        />
      ) : (
        <Kosong>Pilih list untuk mengatur statusnya.</Kosong>
      )}
    </section>
  );
}

type BarisStatus = { kunci: number; status: string; type: TipeStatus; color: string; nama_lama: string | null };

let urutKunci = 0;
const kunciBaru = () => ++urutKunci;

function EditorStatus({ list, terkunci, onTersimpan }: { list: ListDatar; terkunci: boolean; onTersimpan: () => void }) {
  const simpan = useSimpanStatus();
  const [galat, setGalat] = useState<string | null>(null);
  const [rows, setRows] = useState<BarisStatus[]>(() =>
    [...list.statuses]
      .sort((a, b) => a.orderindex - b.orderindex)
      .map((s) => ({ kunci: kunciBaru(), status: s.status, type: s.type, color: warnaInput(s.color, WARNA_STATUS_BAKU), nama_lama: s.status })),
  );

  const ubah = (i: number, isi: Partial<BarisStatus>) => setRows((r) => r.map((s, j) => (j === i ? { ...s, ...isi } : s)));
  const tukar = (i: number, j: number) =>
    setRows((r) => {
      const baru = [...r];
      [baru[i], baru[j]] = [baru[j], baru[i]];
      return baru;
    });

  const kirim = async () => {
    setGalat(null);
    if (rows.some((s) => !s.status.trim())) {
      setGalat("Nama status tidak boleh kosong.");
      return;
    }
    const statuses: StatusKirim[] = rows.map((s, i) => ({
      status: s.status.trim(),
      type: s.type,
      color: s.color,
      orderindex: i,
      ...(s.nama_lama ? { nama_lama: s.nama_lama } : {}),
    }));
    try {
      await simpan.mutateAsync({ list: list.id, statuses });
      toast.success("Status disimpan");
      onTersimpan();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  if (terkunci) {
    return (
      <div className="space-y-3">
        <KotakPesan nada="cermin">List ClickUp: status hanya-baca selama mode cermin (ikut sinkron).</KotakPesan>
        <DaftarAdmin data-uji="daftar-status">
          {rows.map((s) => (
            <li key={s.kunci} className="flex min-h-11 items-center gap-2.5 px-3 py-2 text-sm" data-uji="status-baris">
              <TitikWarna warna={s.color} className="size-3" />
              <span className="min-w-0 flex-1 truncate font-medium">{s.status}</span>
              <span className="text-xs text-muted-foreground">{labelTipe(s.type)}</span>
            </li>
          ))}
        </DaftarAdmin>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Wajib ≥1 status bertipe Awal dan ≥1 bertipe Ditutup. Status yang masih dipakai tugas tidak bisa dibuang (pindahkan
        tugasnya dulu). Ganti nama = tugas ikut; nama disimpan huruf kecil.
      </p>
      <DaftarAdmin data-uji="daftar-status">
        {rows.map((s, i) => (
          <li key={s.kunci} className="flex flex-wrap items-center gap-2 p-2" data-uji="status-baris">
            <div className="flex min-w-[min(100%,16rem)] flex-1 items-center gap-2">
              <input
                type="color"
                aria-label="Warna"
                value={s.color}
                onChange={(e) => ubah(i, { color: e.target.value })}
                className={KELAS_WARNA}
              />
              <Input aria-label="Nama status" value={s.status} onChange={(e) => ubah(i, { status: e.target.value })} autoComplete="off" />
            </div>
            <div className="flex flex-1 items-center gap-1 sm:flex-none">
              <Select value={s.type} onValueChange={(v) => ubah(i, { type: v as TipeStatus })}>
                <SelectTrigger className="w-full min-w-0 sm:w-44" aria-label="Tipe status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPE_STATUS.map((t) => (
                    <SelectItem key={t.nilai} value={t.nilai}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" aria-label="Naik" title="Naik" disabled={i === 0} onClick={() => tukar(i, i - 1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Turun"
                title="Turun"
                disabled={i === rows.length - 1}
                onClick={() => tukar(i, i + 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                aria-label="Buang status"
                title="Buang status"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </DaftarAdmin>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRows((r) => [...r, { kunci: kunciBaru(), status: "status baru", type: "custom", color: WARNA_STATUS_BARU, nama_lama: null }])
          }
        >
          <Plus aria-hidden />
          Tambah status
        </Button>
        <span className="flex-1" />
        <Button type="button" onClick={kirim} disabled={simpan.isPending} data-uji="simpan-status">
          {simpan.isPending ? "Menyimpan…" : "Simpan status"}
        </Button>
      </div>
    </div>
  );
}
