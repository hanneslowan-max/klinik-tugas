"use client";

// Ganti sales (pemilik) satu atau banyak lead → web_pipeline_ganti_sales (29 Okt 2026). Pilihan tujuan = sales sah
// (web_pipeline_sales: owner + akses admin/rep) atau "Tanpa pemilik". Server: semua-atau-tidak; rep hanya boleh
// memindah lead miliknya / tanpa pemilik. Riwayat tercatat di tiap lead; No SP yang sudah ada tidak berubah.
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGantiSales } from "@/features/pipeline/mutasi";
import { useSalesPipeline } from "@/features/pipeline/queries";
import { pesanGalat } from "@/lib/api/galat";
import type { IdAnggota } from "@/types/domain";

/** Bagian lead yang dibutuhkan dialog (LeadRingkas maupun LeadDetail). */
export type LeadPindah = { id: string; kode: string; pemilik: IdAnggota | null; pemilik_nama: string | null };

const TANPA = "tanpa";

/** "Riksa 3 · tanpa pemilik 2" — pemilik asal lead yang dipilih. */
function ringkasAsal(leads: LeadPindah[]): string {
  const n = new Map<string, number>();
  for (const l of leads) {
    const k = l.pemilik == null ? "tanpa pemilik" : (l.pemilik_nama ?? `#${l.pemilik}`);
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n].map(([k, v]) => (leads.length === 1 ? k : `${k} ${v}`)).join(" · ");
}

export function DialogGantiSales({
  buka,
  ubahBuka,
  leads,
  onSelesai,
}: {
  buka: boolean;
  ubahBuka: (b: boolean) => void;
  leads: LeadPindah[];
  /** dipanggil sesudah berhasil (mis. keluar dari mode Pilih) */
  onSelesai?: () => void;
}) {
  const satu = leads.length === 1;
  return (
    <Lembar
      buka={buka}
      ubahBuka={ubahBuka}
      judul={satu ? `Ganti sales ${leads[0].kode}` : `Pindahkan ${leads.length} lead`}
      data-uji="dialog-ganti-sales"
    >
      {buka ? (
        <IsiGantiSales
          leads={leads}
          tutup={() => ubahBuka(false)}
          onSelesai={() => {
            ubahBuka(false);
            onSelesai?.();
          }}
        />
      ) : null}
    </Lembar>
  );
}

function IsiGantiSales({ leads, tutup, onSelesai }: { leads: LeadPindah[]; tutup: () => void; onSelesai: () => void }) {
  const sales = useSalesPipeline();
  const ganti = useGantiSales();
  const [tujuan, setTujuan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const asal = useMemo(() => ringkasAsal(leads), [leads]);
  const satu = leads.length === 1;

  const kirim = async () => {
    setGalat(null);
    const pemilik = tujuan === TANPA ? null : Number(tujuan);
    try {
      const h = await ganti.mutateAsync({ lead_ids: leads.map((l) => l.id), pemilik });
      const ke = h.pemilik_nama ?? "tanpa pemilik";
      toast.success(
        satu
          ? h.diubah
            ? `Sales diganti ke ${ke}`
            : `Lead sudah milik ${ke}`
          : `${h.diubah} lead dipindah ke ${ke}${h.sama ? ` (${h.sama} sudah milik ${ke})` : ""}`,
      );
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {satu ? "Sales sekarang" : `${leads.length} lead dipilih · sales sekarang`}:{" "}
        <span className="font-medium" data-uji="sales-asal">
          {asal}
        </span>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="gs-tujuan">Sales baru</Label>
        <Select value={tujuan} onValueChange={setTujuan}>
          <SelectTrigger id="gs-tujuan" className="w-full" data-uji="pilih-sales-baru">
            <SelectValue placeholder={sales.isPending ? "Memuat…" : "Pilih sales"} />
          </SelectTrigger>
          <SelectContent>
            {(sales.data ?? []).map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.username}
                {s.kode_sp ? ` · ${s.kode_sp}` : ""}
              </SelectItem>
            ))}
            <SelectItem value={TANPA}>— Tanpa pemilik —</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Pergantian tercatat di riwayat tiap lead. No SP yang sudah ada tidak berubah; SP berikutnya memakai kode sales baru.
      </p>
      {sales.isError ? <KotakPesan nada="galat">{pesanGalat(sales.error)}</KotakPesan> : null}
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={tutup}>
          Batal
        </Button>
        <Button type="button" onClick={kirim} disabled={!tujuan || ganti.isPending} data-uji="kirim-ganti-sales">
          {ganti.isPending ? "Memindahkan…" : satu ? "Ganti sales" : `Pindahkan ${leads.length} lead`}
        </Button>
      </KakiLembar>
    </div>
  );
}
