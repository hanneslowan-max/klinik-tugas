"use client";

// Ubah data dasar lead: sumber, kebutuhan, catatan, produk + qty → web_pipeline_lead_ubah.
import { useState } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GrupChip, GrupChipGanda } from "@/features/pipeline/chip-pilih";
import { PRODUK, SATUAN, SUMBER } from "@/features/pipeline/konstanta";
import { useLeadUbah, type BodyLeadUbah, type ItemMasuk } from "@/features/pipeline/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import type { LeadDetail, ProdukLead, SatuanItem, SumberLead } from "@/types/domain";

type DetailItem = { qty: string; satuan: SatuanItem };

export function DialogUbah({ buka, ubahBuka, lead }: { buka: boolean; ubahBuka: (b: boolean) => void; lead: LeadDetail }) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul={`Ubah ${lead.kode}`} data-uji="dialog-ubah">
      {buka ? <IsiUbah lead={lead} onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function IsiUbah({ lead, onSelesai }: { lead: LeadDetail; onSelesai: () => void }) {
  const ubah = useLeadUbah();
  const [sumber, setSumber] = useState<SumberLead>(lead.sumber);
  const [kebutuhan, setKebutuhan] = useState(lead.kebutuhan ?? "");
  const [catatan, setCatatan] = useState(lead.catatan ?? "");
  const [produk, setProduk] = useState<ProdukLead[]>(lead.items.map((i) => i.produk));
  const [detail, setDetail] = useState<Record<string, DetailItem>>(
    Object.fromEntries(lead.items.map((i) => [i.produk, { qty: String(i.qty), satuan: i.satuan }])),
  );
  const [galat, setGalat] = useState<string | null>(null);

  function alihProduk(baru: ProdukLead[]) {
    setProduk(baru);
    setDetail((d) => {
      const next = { ...d };
      for (const p of baru) if (!next[p]) next[p] = { qty: "", satuan: "unit" };
      return next;
    });
  }

  const kirim = async () => {
    setGalat(null);
    if (produk.length === 0) return setGalat("Pilih minimal 1 produk.");
    for (const p of produk) {
      const n = Number(detail[p]?.qty);
      if (!detail[p]?.qty || !Number.isFinite(n) || n <= 0) return setGalat(`Isi qty (> 0) untuk ${p}.`);
    }
    const items: ItemMasuk[] = produk.map((p) => ({ produk: p, qty: Number(detail[p].qty), satuan: detail[p].satuan }));
    const body: BodyLeadUbah = {
      lead_id: lead.id,
      sumber,
      kebutuhan: kebutuhan.trim() || null,
      catatan: catatan.trim() || null,
      items,
    };
    try {
      await ubah.mutateAsync(body);
      toast.success("Lead diperbarui");
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Sumber</Label>
        <GrupChip opsi={SUMBER} nilai={sumber} onUbah={setSumber} label="Sumber lead" />
      </div>
      <div className="space-y-1.5">
        <Label>Produk</Label>
        <GrupChipGanda opsi={PRODUK} nilai={produk} onUbah={alihProduk} label="Produk" />
        {produk.length ? (
          <div className="mt-2 space-y-2">
            {produk.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{p}</span>
                <Input
                  inputMode="numeric"
                  value={detail[p]?.qty ?? ""}
                  onChange={(e) => setDetail((d) => ({ ...d, [p]: { ...(d[p] ?? { satuan: "unit" }), qty: e.target.value } }))}
                  placeholder="Qty"
                  aria-label={`Qty ${p}`}
                  className="w-20"
                />
                <Select
                  value={detail[p]?.satuan ?? "unit"}
                  onValueChange={(v) => setDetail((d) => ({ ...d, [p]: { ...(d[p] ?? { qty: "" }), satuan: v as SatuanItem } }))}
                >
                  <SelectTrigger className="w-24" aria-label={`Satuan ${p}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SATUAN.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ub-keb">Kebutuhan</Label>
        <Textarea id="ub-keb" rows={2} value={kebutuhan} onChange={(e) => setKebutuhan(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ub-cat">Catatan</Label>
        <Textarea id="ub-cat" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="button" onClick={kirim} disabled={ubah.isPending} data-uji="kirim-ubah">
          {ubah.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </KakiLembar>
    </div>
  );
}
