"use client";

// Sampah (owner): tugas terhapus lunak → pulihkan (web_pulihkan) / hapus permanen (Edge /x/admin/purge: web_purge +
// hapus objek Storage lampiran; lihat useHapusPermanen).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { Button } from "@/components/ui/button";
import { useHapusPermanen } from "@/features/tugas/hapus-permanen";
import { segarkanTugas } from "@/features/tugas/mutasi";
import { bungkusGalat, rpc } from "@/lib/api/rpc";
import { pesanGalat } from "@/lib/api/galat";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtWaktu } from "@/lib/tanggal";

async function muatSampah() {
  const klien = klienBrowser();
  const [tugas, lists, anggota] = await Promise.all([
    klien
      .from("tasks")
      .select("id,name,list_id,parent_id,deleted_at,deleted_by,sumber")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(500),
    klien.from("lists").select("id,name"),
    rpc(klien, "web_anggota"),
  ]);
  if (tugas.error) throw bungkusGalat(tugas.error, tugas.status);
  if (lists.error) throw bungkusGalat(lists.error, lists.status);
  return {
    tugas: tugas.data ?? [],
    namaList: new Map((lists.data ?? []).map((l) => [l.id, l.name])),
    namaAnggota: new Map(anggota.map((m) => [String(m.id), m.username])),
  };
}

export function LayarSampah() {
  const qc = useQueryClient();
  const konfirmasi = useKonfirmasi();
  const hapusPermanen = useHapusPermanen();
  const q = useQuery({ queryKey: kunci.sampah, queryFn: muatSampah });

  async function pulihkan(id: string) {
    try {
      await rpc(klienBrowser(), "web_pulihkan", { p_task: id });
      toast.success("Tugas dipulihkan");
      segarkanTugas(qc, id);
      void qc.invalidateQueries({ queryKey: kunci.sampah });
    } catch (e) {
      toast.error(pesanGalat(e));
    }
  }

  async function purge(id: string, nama: string) {
    const ok = await konfirmasi({
      judul: "Hapus permanen",
      pesan: `Hapus permanen "${nama}" beserta sub-tugas, komentar, dan berkas lampirannya? Tidak bisa dibatalkan.`,
      ya: "Hapus permanen",
      bahaya: true,
    });
    if (ok) await hapusPermanen(id);
  }

  return (
    <>
      <KepalaHalaman judul="Sampah" kembali="/saya" />
      <IsiHalaman className="space-y-3">
        <p className="text-xs text-muted-foreground">Tugas yang dihapus owner. Pulihkan, atau hapus permanen (riwayat tetap tersimpan).</p>
        {q.isPending ? (
          <MemuatDaftar />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : q.data.tugas.length === 0 ? (
          <Kosong>Sampah kosong.</Kosong>
        ) : (
          <ul className="space-y-2" data-uji="daftar-sampah">
            {q.data.tugas.map((t) => (
              <li key={t.id} className="rounded-xl border bg-card px-3 py-2.5" data-id={t.id}>
                <Link href={`/t/${encodeURIComponent(t.id)}`} className="block space-y-1">
                  <div className="text-sm font-medium break-words">{t.name}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{q.data.namaList.get(t.list_id) ?? t.list_id}</span>
                    <span>dihapus {fmtWaktu(t.deleted_at)}</span>
                    {t.deleted_by ? <span>oleh {q.data.namaAnggota.get(String(t.deleted_by)) ?? t.deleted_by}</span> : null}
                    {t.parent_id ? <Chip nada="garis">sub-tugas</Chip> : null}
                  </div>
                </Link>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => pulihkan(t.id)}>
                    Pulihkan
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => purge(t.id, t.name)}>
                    Hapus permanen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </IsiHalaman>
    </>
  );
}
