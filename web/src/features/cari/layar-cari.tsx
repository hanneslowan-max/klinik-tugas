"use client";

// Cari: nama, kode (Y7, FX-PM-…), isi, ID lama, atau URL (web_cari). Tempel URL tugas ClickUp / tautan kartu →
// langsung membuka kartunya; URL list ClickUp (/v/l/…, /v/b/…) atau /l/<id> → membuka list (rujukan dari DB);
// URL folder/space → info + tautan ke Jelajah (perbaikan P6). Pengalihan hanya saat pengguna menekan Cari, supaya
// tombol Kembali dari kartu tidak terlempar lagi ke kartu yang sama. ?q & ?space dibaca di klien; hasil cari tanpa
// pengalihan hanya mengganti URL (history.replaceState), tanpa permintaan ke server.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { idDariRujukan } from "@/features/cari/rujukan";
import { useStruktur } from "@/features/struktur/queries";
import { DaftarTugas } from "@/features/tugas/baris-tugas";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { gantiUrl } from "@/lib/url-dangkal";
import type { HasilCari } from "@/types/domain";

const SEMUA = "semua";
const NAMA_WADAH = { folder: "folder", space: "space" } as const;

const cari = (q: string, space: string) => rpc(klienBrowser(), "web_cari", { p_q: q, p_space: space || undefined });

/** Tujuan langsung dari hasil (kartu persis / list rujukan), atau null. */
function tujuanLangsung(q: string, r: HasilCari): string | null {
  const idRujukan = idDariRujukan(q);
  const persis = r.hasil.find((t) => t.id === q || (idRujukan && t.id === idRujukan));
  if (persis && (idRujukan || (r.hasil.length === 1 && persis.id === q))) return `/t/${encodeURIComponent(persis.id)}`;
  if (r.rujukan?.type === "list" && r.rujukan.id) return `/l/${encodeURIComponent(r.rujukan.id)}`;
  return null;
}

export function LayarCari() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const space = sp.get("space") ?? "";
  const qc = useQueryClient();
  const struktur = useStruktur();
  const [teks, setTeks] = useState(q);
  const [pilihSpace, setPilihSpace] = useState(space || SEMUA);
  // ?q/?space berubah (hasil Cari sendiri, ketuk menu Cari = /cari tanpa remount, Kembali/Maju) → isian ikut URL
  const [dariUrl, setDariUrl] = useState({ q, space });
  if (dariUrl.q !== q || dariUrl.space !== space) {
    setDariUrl({ q, space }); // sesuaikan state saat render, bukan di efek
    setTeks(q);
    setPilihSpace(space || SEMUA);
  }
  const [sibuk, setSibuk] = useState(false);
  const [galatKirim, setGalatKirim] = useState<string | null>(null);
  // tautan diketuk selagi Cari menunggu jawaban → hasilnya tidak lagi menulis URL / mengalihkan: replaceState saat
  // navigasi Next menunggu RSC akan membatalkan navigasi itu (lib/url-dangkal)
  const klikTautan = useRef(0);
  useEffect(() => {
    const saatKlik = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (a instanceof HTMLAnchorElement && !a.target && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) klikTautan.current++;
    };
    document.addEventListener("click", saatKlik, true);
    return () => document.removeEventListener("click", saatKlik, true);
  }, []);

  // hasil per kata kunci tidak perlu disimpan selama gcTime bawaan (30 mnt)
  const hasil = useQuery({ queryKey: kunci.cari(q, space), queryFn: () => cari(q, space), enabled: Boolean(q), gcTime: 5 * 60_000 });

  async function kirim(e: FormEvent) {
    e.preventDefault();
    const kata = teks.trim();
    const sp = pilihSpace === SEMUA ? "" : pilihSpace;
    setGalatKirim(null);
    if (!kata) {
      gantiUrl("/cari");
      return;
    }
    const nomorKlik = klikTautan.current;
    setSibuk(true);
    try {
      const r = await qc.fetchQuery({ queryKey: kunci.cari(kata, sp), queryFn: () => cari(kata, sp), gcTime: 5 * 60_000 });
      // pengguna mengetuk tautan / sudah pindah halaman selama menunggu: navigasinya menang (jangan dibatalkan, jangan
      // menimpa entri riwayat halaman lain)
      if (klikTautan.current !== nomorKlik || window.location.pathname !== "/cari") return;
      const tujuan = tujuanLangsung(kata, r);
      const u = new URLSearchParams({ q: kata });
      if (sp) u.set("space", sp);
      if (tujuan) {
        // simpan kata kunci di riwayat dulu (tanpa render ulang) supaya tombol Kembali kembali ke hasil cari
        gantiUrl(`/cari?${u}`);
        router.push(tujuan);
      } else {
        gantiUrl(`/cari?${u}`);
      }
    } catch (err) {
      setGalatKirim(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  }

  const idRujukan = idDariRujukan(q);
  const r = hasil.data;
  const ruj = r?.rujukan;

  return (
    <>
      <KepalaHalaman judul="Cari" />
      <IsiHalaman className="space-y-4">
        <form role="search" onSubmit={kirim} className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              name="q"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              placeholder="Nama, kode (Y7), isi, ID, atau URL ClickUp"
              aria-label="Kata kunci"
              autoComplete="off"
              enterKeyHint="search"
              autoFocus={!q}
              className="h-11 pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={pilihSpace} onValueChange={setPilihSpace}>
              <SelectTrigger className="min-w-0 flex-1" aria-label="Space">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEMUA}>Semua space</SelectItem>
                {(struktur.data?.spaces ?? [])
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={sibuk} data-uji="tombol-cari">
              {sibuk ? "Mencari…" : "Cari"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Tempel URL app.clickup.com/t/… atau tautan tugas untuk langsung membuka kartunya.</p>
        </form>

        {galatKirim ? <KotakPesan nada="galat">{galatKirim}</KotakPesan> : null}

        {!q ? null : hasil.isPending ? (
          <MemuatDaftar baris={3} />
        ) : hasil.isError ? (
          <GalatMuat galat={hasil.error} ulang={() => hasil.refetch()} />
        ) : r ? (
          <div className="space-y-3" aria-live="polite">
            {ruj && ruj.type in NAMA_WADAH ? (
              <KotakPesan nada="info" data-uji="rujukan-wadah">
                Tautan {NAMA_WADAH[ruj.type as keyof typeof NAMA_WADAH]} ClickUp: kartu di {NAMA_WADAH[ruj.type as keyof typeof NAMA_WADAH]} itu ada di
                bawah. <Link href="/jelajah">Buka Jelajah</Link>
              </KotakPesan>
            ) : null}
            {ruj?.type === "list" ? (
              <KotakPesan nada="info">
                Tautan list: <Link href={`/l/${encodeURIComponent(ruj.id)}`}>buka list</Link>
              </KotakPesan>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {r.hasil.length} hasil{r.hasil.length >= 50 ? " (maks. 50, persempit kata kunci)" : ""}
            </p>
            <DaftarTugas daftar={r.hasil} tampilList kosong={idRujukan ? `Tugas ${idRujukan} tidak ditemukan.` : "Tidak ada yang cocok."} />
          </div>
        ) : null}
      </IsiHalaman>
    </>
  );
}
