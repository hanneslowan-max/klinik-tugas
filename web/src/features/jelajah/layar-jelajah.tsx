"use client";

// Jelajah: Space → Folder → List (web_struktur) dengan hitungan terbuka/telat. Arsip disembunyikan (bisa dibuka).
import { ChevronDown, ChevronRight, Folder, Lock } from "lucide-react";
import Link from "next/link";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { IsiTautan } from "@/components/layout/petunjuk-tautan";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { Button } from "@/components/ui/button";
import { useProfil } from "@/features/profil/penyedia-profil";
import { useStruktur } from "@/features/struktur/queries";
import type { ListStruktur } from "@/types/domain";

function TautanList({ list: l }: { list: ListStruktur }) {
  const { cermin } = useProfil();
  const n = l.hitungan ?? { terbuka: 0, telat: 0 };
  return (
    <Link href={`/l/${encodeURIComponent(l.id)}`} className="block rounded-lg hover:bg-muted" data-list={l.id}>
      <IsiTautan className="flex min-h-12 items-center gap-3 px-3 py-2" kelasPetunjuk="inset-x-3 bottom-0.5 h-0.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{l.name}</span>
          {l.tidak_ditagih ? <Chip nada="garis">tidak ditagih</Chip> : null}
          {l.archived ? <Chip nada="garis">arsip</Chip> : null}
          {cermin && l.sumber === "clickup" ? (
            <Chip nada="cermin" title="List ClickUp: hanya-baca selama mode cermin">
              ClickUp
            </Chip>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {n.telat ? <Chip nada="telat">{n.telat} telat</Chip> : null}
          <span>{n.terbuka || 0} terbuka</span>
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </IsiTautan>
    </Link>
  );
}

export function LayarJelajah({ arsip }: { arsip: boolean }) {
  const q = useStruktur();
  const tampak = <T extends { archived: boolean }>(x: T) => arsip || !x.archived;

  return (
    <>
      <KepalaHalaman
        judul="Jelajah"
        aksi={
          <Button variant="ghost" size="sm" asChild aria-pressed={arsip}>
            <Link href={arsip ? "/jelajah" : "/jelajah?arsip=1"} replace>
              {arsip ? "Sembunyikan arsip" : "Tampilkan arsip"}
            </Link>
          </Button>
        }
      />
      <IsiHalaman className="space-y-4">
        {q.isPending ? (
          <MemuatDaftar />
        ) : q.isError ? (
          <GalatMuat galat={q.error} ulang={() => q.refetch()} />
        ) : q.data.spaces.filter(tampak).length === 0 ? (
          <Kosong>Belum ada space.</Kosong>
        ) : (
          q.data.spaces.filter(tampak).map((sp) => (
            <section key={sp.id} className="rounded-xl border bg-card p-2" data-space={sp.id}>
              <h2 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
                {sp.name}
                {sp.private ? (
                  <Chip nada="garis">
                    <Lock aria-hidden />
                    privat
                  </Chip>
                ) : null}
                {sp.archived ? <Chip nada="garis">arsip</Chip> : null}
              </h2>
              {sp.folders.filter(tampak).map((f) => {
                const lists = f.lists.filter(tampak);
                if (!lists.length) return null;
                if (f.hidden) {
                  // folder tersembunyi = list langsung di bawah space
                  return (
                    <div key={f.id}>
                      {lists.map((l) => (
                        <TautanList key={l.id} list={l} />
                      ))}
                    </div>
                  );
                }
                return (
                  <details key={f.id} open className="group/folder">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium select-none hover:bg-muted [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform group-open/folder:rotate-0" aria-hidden />
                      <Folder className="size-4 text-muted-foreground" aria-hidden />
                      {f.name}
                      {f.archived ? <Chip nada="garis">arsip</Chip> : null}
                      <span className="text-xs font-normal text-muted-foreground">· {lists.length} list</span>
                    </summary>
                    <div className="ml-4 border-l pl-2">
                      {lists.map((l) => (
                        <TautanList key={l.id} list={l} />
                      ))}
                    </div>
                  </details>
                );
              })}
              {sp.lists.filter(tampak).map((l) => (
                <TautanList key={l.id} list={l} />
              ))}
            </section>
          ))
        )}
      </IsiHalaman>
    </>
  );
}
