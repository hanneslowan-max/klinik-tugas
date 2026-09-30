"use client";

// Komentar tugas: utas (komentar + balasan satu tingkat), @mention, lampiran komentar, Balas / Ubah / Hapus, penyusun
// di bawah daftar. Lampiran komentar diunggah SESUDAH komentarnya tercatat (butuh id komentar).
// Mode cermin: komentar kartu ClickUp ditulis di ClickUp. Komentar yang dituju tautan #c-<id> disorot.
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { TeksBertautan } from "@/components/umum/teks";
import { Button } from "@/components/ui/button";
import { Penyusun } from "@/features/komentar/penyusun";
import { unggahLampiran } from "@/features/lampiran/api";
import { DaftarLampiran } from "@/features/lampiran/daftar-lampiran";
import { useProfil } from "@/features/profil/penyedia-profil";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif, fmtWaktuPanjang } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { Komentar, KomentarUtas } from "@/types/domain";

/** Jumlah komentar + balasan yang belum dihapus (label tab). */
export function jumlahKomentar(komentar: KomentarUtas[]) {
  return komentar.reduce((n, c) => n + (c.dihapus ? 0 : 1) + c.balasan.filter((b) => !b.dihapus).length, 0);
}

/** Isi komentar dari body_json (mention = chip "@username", teks dengan URL jadi tautan) atau teks polos. */
function IsiKomentar({ c }: { c: Komentar }) {
  const parts = Array.isArray(c.body_json) && c.body_json.length ? c.body_json : [{ text: c.text ?? "" }];
  return (
    <div className="mt-1 text-sm break-words whitespace-pre-wrap" data-uji="isi-komentar">
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.type === "tag") {
          return p.user ? (
            <span key={i} className="rounded bg-info-lembut px-0.5 font-semibold text-info" data-member={p.user.id} data-uji="mention">
              @{p.user.username}
            </span>
          ) : null;
        }
        return typeof p.text === "string" ? <TeksBertautan key={i} teks={p.text} /> : null;
      })}
    </div>
  );
}

type Props = {
  taskId: string;
  komentar: KomentarUtas[];
  /** boleh menulis / membalas / mengubah (tugas bisa diubah: bukan mode cermin, bukan di Sampah) */
  bolehKomentar: boolean;
  cermin: boolean;
  diSampah: boolean;
  /** id komentar yang dituju tautan #c-<id> */
  sorotId: string | null;
  onBerubah: () => Promise<unknown>;
  /** dipanggil saat mulai/selesai membalas atau mengubah komentar (penyegaran otomatis ditunda) */
  onSedangEdit?: (aktif: boolean) => void;
};

export function DaftarKomentar({ taskId, komentar, bolehKomentar, cermin, diSampah, sorotId, onBerubah, onSedangEdit }: Props) {
  const { member, owner, hariIni } = useProfil();
  const konfirmasi = useKonfirmasi();
  const [balasKe, setBalasKe] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const idSaya = Number(member.id);

  const sedangEdit = balasKe !== null || editId !== null;
  useEffect(() => {
    onSedangEdit?.(sedangEdit);
    return () => onSedangEdit?.(false);
  }, [sedangEdit, onSedangEdit]);

  async function jalankan<T>(kerja: () => Promise<T>, pesan: string): Promise<T | null> {
    try {
      const r = await kerja();
      toast.success(pesan, { duration: 2000 });
      return r;
    } catch (e) {
      toast.error(pesanGalat(e), { duration: 5000 });
      return null;
    }
  }

  async function kirimKomentar(teks: string, berkas: File[], parent: string | null) {
    const klien = klienBrowser();
    const r = await jalankan(
      () => rpc(klien, "web_komentar", parent ? { p_task: taskId, p_teks: teks, p_parent: parent } : { p_task: taskId, p_teks: teks }),
      parent ? "Balasan terkirim" : "Komentar terkirim",
    );
    if (!r) return false;
    for (const f of berkas) {
      try {
        await unggahLampiran(taskId, f, r.id);
      } catch (e) {
        toast.error(pesanGalat(e), { duration: 6000 });
      }
    }
    setBalasKe(null);
    await onBerubah();
    return true;
  }

  async function simpanEdit(c: Komentar, teks: string) {
    const r = await jalankan(() => rpc(klienBrowser(), "web_komentar_edit", { p_comment: c.id, p_teks: teks }), "Komentar disimpan");
    if (!r) return false;
    setEditId(null);
    await onBerubah();
    return true;
  }

  async function hapus(c: Komentar) {
    if (!(await konfirmasi({ pesan: "Hapus komentar ini?", ya: "Hapus", bahaya: true }))) return;
    if (await jalankan(() => rpc(klienBrowser(), "web_komentar_hapus", { p_comment: c.id }), "Komentar dihapus")) await onBerubah();
  }

  function nodeKomentar(c: Komentar, balasan: KomentarUtas["balasan"] | null) {
    const penulis = c.author !== null && Number(c.author.id) === idSaya;
    const bolehAksi = !c.dihapus && bolehKomentar;
    const nama = c.author?.username ?? "tidak dikenal";
    return (
      <li
        key={c.id}
        id={`c-${c.id}`}
        data-komentar={c.id}
        data-uji="komentar"
        className={cn("flex scroll-mt-20 gap-2.5 py-3", sorotId === c.id && "sorot rounded-lg bg-info-lembut px-2")}
      >
        <AvatarAnggota anggota={c.author ?? { username: "?" }} ukuran="sedang" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <strong className="text-sm font-semibold text-foreground">{nama}</strong>
            <time dateTime={c.created_at} title={fmtWaktuPanjang(c.created_at)}>
              {fmtRelatif(c.created_at, hariIni)}
            </time>
            {c.edited_at && !c.dihapus ? <span title={`Diubah ${fmtWaktuPanjang(c.edited_at)}`}>(diubah)</span> : null}
            {c.sumber === "clickup" ? <Chip nada="garis">ClickUp</Chip> : null}
          </div>

          {c.dihapus ? (
            <p className="mt-1 text-sm text-muted-foreground italic">Komentar dihapus.</p>
          ) : editId === c.id ? (
            <div className="mt-2">
              <Penyusun
                kunci={`edit-${c.id}`}
                teksAwal={c.text ?? ""}
                labelKirim="Simpan"
                placeholder="Ubah komentar"
                fokusAwal
                batal={() => setEditId(null)}
                kirim={(teks) => simpanEdit(c, teks)}
              />
            </div>
          ) : (
            <IsiKomentar c={c} />
          )}

          {c.lampiran?.length ? <DaftarLampiran daftar={c.lampiran} bolehUbah={bolehKomentar} onBerubah={onBerubah} className="mt-2" /> : null}

          {bolehAksi && editId !== c.id ? (
            <div className="-ml-2 mt-0.5 flex flex-wrap">
              {balasan ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  data-uji="balas"
                  onClick={() => {
                    setBalasKe(c.id);
                    setEditId(null);
                  }}
                >
                  Balas
                </Button>
              ) : null}
              {penulis ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  data-uji="ubah-komentar"
                  onClick={() => {
                    setEditId(c.id);
                    setBalasKe(null);
                  }}
                >
                  Ubah
                </Button>
              ) : null}
              {penulis || owner ? (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-telat" data-uji="hapus-komentar" onClick={() => hapus(c)}>
                  Hapus
                </Button>
              ) : null}
            </div>
          ) : null}

          {balasan && (balasan.length || balasKe === c.id) ? (
            <ul className="mt-1 ml-1 border-l-2 pl-3" data-uji="balasan" aria-label={`Balasan untuk ${nama}`}>
              {balasan.map((b) => nodeKomentar(b, null))}
              {balasKe === c.id ? (
                <li className="py-2">
                  <Penyusun
                    kunci={`balas-${c.id}`}
                    placeholder={`Balas ${c.author?.username ?? ""}… (@ untuk mention)`}
                    labelKirim="Balas"
                    bolehLampiran
                    fokusAwal
                    batal={() => setBalasKe(null)}
                    kirim={(teks, berkas) => kirimKomentar(teks, berkas, c.id)}
                  />
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-3">
      {komentar.length ? (
        <ul className="divide-y" data-uji="daftar-komentar">
          {komentar.map((c) => nodeKomentar(c, c.balasan))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">Belum ada komentar.</p>
      )}
      {bolehKomentar ? (
        <Penyusun kunci="baru" bolehLampiran kirim={(teks, berkas) => kirimKomentar(teks, berkas, null)} />
      ) : cermin ? (
        <KotakPesan nada="cermin" data-uji="komentar-terkunci">
          Komentar kartu ClickUp ditulis di ClickUp selama mode cermin.
        </KotakPesan>
      ) : diSampah ? (
        <KotakPesan nada="info">Tugas di Sampah tidak bisa dikomentari.</KotakPesan>
      ) : null}
    </div>
  );
}
