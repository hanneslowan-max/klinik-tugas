"use client";

// Daftar lampiran (tugas & komentar) + bagian "Lampiran" di detail tugas (unggah banyak berkas sekaligus).
// Gambar dipratinjau lewat signed URL; unduh memakai signed URL ber-Content-Disposition (nama asli berkas).
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Paperclip, Trash2 } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { toast } from "sonner";

import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { Button } from "@/components/ui/button";
import { useProfil } from "@/features/profil/penyedia-profil";
import { SEGAR_URL, kunciUrlLampiran, unggahLampiran, urlLampiran, useUrlLampiran } from "@/features/lampiran/api";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { ACCEPT_LAMPIRAN } from "@/lib/konstanta";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif } from "@/lib/tanggal";
import { ukuranBerkas, urlAman } from "@/lib/teks";
import { cn } from "@/lib/utils";
import type { Lampiran } from "@/types/domain";

const CATATAN_SALIN = {
  gagal: "gagal disalin dari ClickUp",
  tautan_saja: "belum disalin (tautan ClickUp)",
} as const;

/** Kotak 40×40: pratinjau gambar (signed URL) atau ekstensi berkas. */
function JenisLampiran({ a }: { a: Lampiran }) {
  const gambar = /^image\//.test(a.mimetype ?? "");
  const pratinjau = useUrlLampiran(a, false, gambar);
  const [gagal, setGagal] = useState(false);
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-[11px] font-bold text-muted-foreground uppercase"
      aria-hidden
    >
      {gambar && pratinjau.data && !gagal ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL Storage (bukan aset statis)
        <img src={pratinjau.data} alt="" loading="lazy" className="size-full object-cover" onError={() => setGagal(true)} />
      ) : (
        (a.extension || "?").slice(0, 4)
      )}
    </span>
  );
}

function ItemLampiran({ a, bolehHapus, onHapus }: { a: Lampiran; bolehHapus: boolean; onHapus: (a: Lampiran) => void }) {
  const { hariIni } = useProfil();
  const qc = useQueryClient();
  const unduh = useUrlLampiran(a, true);
  const tautanCu = a.storage_path ? null : urlAman(a.clickup_url);
  const judul = a.title || "(tanpa nama)";
  const sub = [
    ukuranBerkas(a.size),
    a.uploaded_by?.username,
    fmtRelatif(a.created_at, hariIni),
    a.comment_id ? "di komentar" : null,
    a.status_salin && a.status_salin in CATATAN_SALIN ? CATATAN_SALIN[a.status_salin as keyof typeof CATATAN_SALIN] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function klikUnduh(e: MouseEvent<HTMLAnchorElement>) {
    // href masih segar → biarkan browser membukanya; selain itu minta signed URL baru dulu
    if (unduh.data && Date.now() - unduh.dataUpdatedAt < SEGAR_URL) return;
    e.preventDefault();
    try {
      const url = await qc.fetchQuery({
        queryKey: kunciUrlLampiran(a.storage_path, true),
        queryFn: () => urlLampiran(a.storage_path!, a.title, true),
        staleTime: 0,
      });
      window.location.assign(url);
    } catch (err) {
      toast.error(pesanGalat(err));
    }
  }

  return (
    <li className="flex min-h-14 items-center gap-2.5 rounded-xl border bg-card p-2" data-lampiran={a.id}>
      <JenisLampiran a={a} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={judul}>
          {judul}
        </div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </div>
      {a.storage_path ? (
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-w-11">
          <a
            href={unduh.data ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Unduh ${judul}`}
            data-uji="unduh-lampiran"
            onClick={klikUnduh}
          >
            <Download aria-hidden />
            <span className="max-sm:sr-only">Unduh</span>
          </a>
        </Button>
      ) : null}
      {tautanCu ? (
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-w-11">
          <a href={tautanCu} target="_blank" rel="noopener noreferrer" data-luar="" title={`Buka ${judul} di ClickUp`}>
            <ExternalLink aria-hidden />
            <span className="max-sm:sr-only">Tautan ClickUp</span>
          </a>
        </Button>
      ) : null}
      {bolehHapus ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Hapus lampiran ${judul}`}
          className="text-muted-foreground hover:text-telat"
          onClick={() => onHapus(a)}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

type PropsDaftar = {
  daftar: Lampiran[];
  /** tugas boleh diubah (bukan mode cermin / Sampah) */
  bolehUbah: boolean;
  onBerubah: () => Promise<unknown> | void;
  className?: string;
};

/** Daftar lampiran; hapus hanya untuk pengunggah atau owner. */
export function DaftarLampiran({ daftar, bolehUbah, onBerubah, className }: PropsDaftar) {
  const { owner, member } = useProfil();
  const konfirmasi = useKonfirmasi();

  async function hapus(a: Lampiran) {
    if (!(await konfirmasi({ pesan: `Hapus lampiran "${a.title ?? ""}"?`, ya: "Hapus", bahaya: true }))) return;
    try {
      await rpc(klienBrowser(), "web_lampiran_hapus", { p_id: a.id });
      toast.success("Lampiran dihapus", { duration: 2000 });
    } catch (e) {
      toast.error(pesanGalat(e), { duration: 5000 });
      return;
    }
    await onBerubah();
  }

  if (!daftar.length) return null;
  return (
    <ul className={cn("grid gap-2", className)} data-uji="daftar-lampiran">
      {daftar.map((a) => (
        <ItemLampiran
          key={a.id}
          a={a}
          bolehHapus={bolehUbah && (owner || (a.uploaded_by !== null && Number(a.uploaded_by.id) === Number(member.id)))}
          onHapus={hapus}
        />
      ))}
    </ul>
  );
}

type PropsBagian = {
  taskId: string;
  /** semua lampiran tugas (termasuk yang ada di komentar; jumlahnya ditampilkan di judul) */
  lampiran: Lampiran[];
  bolehUbah: boolean;
  onBerubah: () => Promise<unknown> | void;
};

/** Bagian "Lampiran" di detail tugas: hanya lampiran tingkat tugas; lampiran komentar tampil di komentarnya. */
export function BagianLampiran({ taskId, lampiran, bolehUbah, onBerubah }: PropsBagian) {
  const idJudul = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const lampiranTugas = lampiran.filter((a) => !a.comment_id);

  async function pilihBerkas(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setSibuk(true);
    let ok = 0;
    try {
      for (const f of files) {
        const idToast = toast.loading(`Mengunggah ${f.name}…`);
        try {
          await unggahLampiran(taskId, f);
          ok++;
        } catch (err) {
          toast.error(pesanGalat(err), { duration: 6000 });
        } finally {
          toast.dismiss(idToast);
        }
      }
    } finally {
      setSibuk(false);
    }
    if (ok) {
      toast.success(`${ok} lampiran terunggah`);
      await onBerubah();
    }
  }

  return (
    <section aria-labelledby={idJudul} className="space-y-2">
      <div className="flex min-h-11 items-center gap-2">
        <h3 id={idJudul} className="flex-1 text-sm font-semibold">
          Lampiran ({lampiran.length})
        </h3>
        {bolehUbah ? (
          <>
            <Button variant="outline" size="sm" data-uji="tambah-lampiran" disabled={sibuk} onClick={() => inputRef.current?.click()}>
              <Paperclip aria-hidden />
              {sibuk ? "Mengunggah…" : "Tambah"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_LAMPIRAN}
              multiple
              hidden
              data-uji="input-lampiran"
              aria-label="Pilih berkas lampiran"
              onChange={pilihBerkas}
            />
          </>
        ) : null}
      </div>
      {lampiranTugas.length ? (
        <DaftarLampiran daftar={lampiranTugas} bolehUbah={bolehUbah} onBerubah={onBerubah} />
      ) : (
        <p className="text-sm text-muted-foreground">{lampiran.length ? "Lampiran lain ada di komentar." : "Belum ada lampiran."}</p>
      )}
    </section>
  );
}
