"use client";

// Menu ⋯ aksi tugas: salin tautan, buka di ClickUp, pindah list, arsip, (owner) hapus ke Sampah / pulihkan /
// hapus permanen. Kartu ClickUp di mode cermin: aksi ubah dinonaktifkan.
import { Archive, ArchiveRestore, ExternalLink, FolderInput, Link2, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAksiTugas } from "@/features/detail/aksi-tugas";
import { useDetail } from "@/features/detail/konteks";
import { useProfil } from "@/features/profil/penyedia-profil";
import { PemilihList } from "@/features/struktur/pemilih-list";
import { urlAman } from "@/lib/teks";

export function MenuTugas() {
  const { d, bolehUbah } = useDetail();
  const { owner } = useProfil();
  const aksi = useAksiTugas();
  const [pilihList, setPilihList] = useState(false);
  const t = d.task;
  const urlClickUp = urlAman(t.clickup_url);

  return (
    <>
      {/* modal={false}: dialog konfirmasi / pemilih list yang dibuka dari menu tidak berebut fokus dengan menu */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Aksi lain" data-uji="menu-tugas" className="pointer-coarse:size-11">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Aksi tugas</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void aksi.salinTautan()}>
            <Link2 aria-hidden />
            Salin tautan
          </DropdownMenuItem>
          {urlClickUp ? (
            <DropdownMenuItem asChild>
              <a href={urlClickUp} target="_blank" rel="noopener noreferrer" data-luar="">
                <ExternalLink aria-hidden />
                Buka di ClickUp
              </a>
            </DropdownMenuItem>
          ) : null}
          {bolehUbah ? (
            <>
              <DropdownMenuItem data-uji="aksi-pindah" onSelect={() => setPilihList(true)}>
                <FolderInput aria-hidden />
                Pindah ke list lain…
              </DropdownMenuItem>
              <DropdownMenuItem data-uji="aksi-arsip" onSelect={() => void aksi.arsip()}>
                {t.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {t.archived ? "Keluarkan dari arsip" : "Arsipkan"}
              </DropdownMenuItem>
            </>
          ) : null}
          {owner && bolehUbah ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" data-uji="aksi-hapus" onSelect={() => void aksi.hapus()}>
                <Trash2 aria-hidden />
                Hapus (ke Sampah)
              </DropdownMenuItem>
            </>
          ) : null}
          {owner && t.deleted_at ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-uji="aksi-pulihkan" onSelect={() => void aksi.pulihkan()}>
                <RotateCcw aria-hidden />
                Pulihkan dari Sampah
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" data-uji="aksi-purge" onSelect={() => void aksi.purge()}>
                <Trash2 aria-hidden />
                Hapus permanen
              </DropdownMenuItem>
            </>
          ) : null}
          {!bolehUbah && !t.deleted_at && d.boleh.cermin ? (
            <>
              <DropdownMenuSeparator />
              <p className="px-1.5 py-1 text-xs text-cermin">Kartu ClickUp: aksi ubah dinonaktifkan selama mode cermin.</p>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {bolehUbah ? <PemilihList buka={pilihList} ubahBuka={setPilihList} kecualiId={t.list.id} onPilih={(l) => void aksi.pindah(l)} /> : null}
    </>
  );
}
