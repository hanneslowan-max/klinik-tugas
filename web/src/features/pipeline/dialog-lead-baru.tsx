"use client";

// Form "Lead baru" (§5, target isi <30 detik): perusahaan (dedup via web_pipeline_pelanggan_cari), PIC, kota,
// telepon, produk (chips multi + qty/satuan per produk, qty wajib K5), kebutuhan, sumber (chips WAJIB, §3).
// Tanggal/pemilik/tahap otomatis di server. Pesan validasi jelas; galat server (§3) ditampilkan apa adanya.
import { useEffect, useState } from "react";
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
import { cariPelanggan, useLeadBaru, type BodyLeadBaru, type ItemMasuk } from "@/features/pipeline/mutasi";
import { pesanGalat } from "@/lib/api/galat";
import { cn } from "@/lib/utils";
import type { PelangganCari, ProdukLead, SatuanItem, SumberLead } from "@/types/domain";

type DetailItem = { qty: string; satuan: SatuanItem };

export function DialogLeadBaru({ buka, ubahBuka }: { buka: boolean; ubahBuka: (b: boolean) => void }) {
  return (
    <Lembar buka={buka} ubahBuka={ubahBuka} judul="Lead baru" data-uji="dialog-lead-baru">
      {buka ? <FormLeadBaru onSelesai={() => ubahBuka(false)} /> : null}
    </Lembar>
  );
}

function FormLeadBaru({ onSelesai }: { onSelesai: () => void }) {
  const buat = useLeadBaru();

  const [nama, setNama] = useState("");
  const [pelangganId, setPelangganId] = useState<string | null>(null);
  const [pic, setPic] = useState("");
  const [kota, setKota] = useState("");
  const [telepon, setTelepon] = useState("");
  const [produk, setProduk] = useState<ProdukLead[]>([]);
  const [detail, setDetail] = useState<Record<string, DetailItem>>({});
  const [kebutuhan, setKebutuhan] = useState("");
  const [sumber, setSumber] = useState<SumberLead | null>(null);

  const [saran, setSaran] = useState<PelangganCari[]>([]);
  const [peringatanTelp, setPeringatanTelp] = useState<PelangganCari[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [galatField, setGalatField] = useState<Record<string, boolean>>({});

  // dedup perusahaan: cari saat mengetik nama (bukan setelah pilih pelanggan lama). Hasil hanya ditampilkan bila
  // syarat masih terpenuhi (lihat render), jadi tak perlu setState sinkron di dalam efek.
  useEffect(() => {
    const nm = nama.trim();
    if (pelangganId || nm.length < 2) return;
    const t = setTimeout(() => {
      void cariPelanggan(nm)
        .then(setSaran)
        .catch(() => setSaran([]));
    }, 300);
    return () => clearTimeout(t);
  }, [nama, pelangganId]);

  // dedup telepon: peringatan "pelanggan lama?" bila nomor sudah ada (§3)
  useEffect(() => {
    const digit = telepon.replace(/\D/g, "");
    if (pelangganId || digit.length < 7) return;
    const t = setTimeout(() => {
      void cariPelanggan(telepon.trim())
        .then(setPeringatanTelp)
        .catch(() => setPeringatanTelp([]));
    }, 400);
    return () => clearTimeout(t);
  }, [telepon, pelangganId]);

  const tampilSaran = !pelangganId && nama.trim().length >= 2 && saran.length > 0;
  const tampilPeringatanTelp = !pelangganId && telepon.replace(/\D/g, "").length >= 7 && peringatanTelp.length > 0;

  function pilihPelanggan(p: PelangganCari) {
    setPelangganId(p.id);
    setNama(p.nama);
    if (p.kota) setKota(p.kota);
    const k = p.kontak[0];
    if (k) {
      if (k.nama) setPic(k.nama);
      if (k.telepon) setTelepon(k.telepon);
    }
    setSaran([]);
    setPeringatanTelp([]);
  }

  function lepasPelanggan() {
    setPelangganId(null);
  }

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
    const gf: Record<string, boolean> = {};
    if (!pelangganId && !nama.trim()) gf.nama = true;
    if (produk.length === 0) gf.produk = true;
    for (const p of produk) {
      const n = Number(detail[p]?.qty);
      if (!detail[p]?.qty || !Number.isFinite(n) || n <= 0) gf[`qty-${p}`] = true;
    }
    if (!sumber) gf.sumber = true;
    setGalatField(gf);
    if (Object.keys(gf).length) {
      setGalat(
        gf.produk
          ? "Pilih minimal 1 produk."
          : Object.keys(gf).some((k) => k.startsWith("qty-"))
            ? "Isi qty (> 0) untuk tiap produk."
            : gf.sumber
              ? "Pilih sumber lead (wajib)."
              : "Nama perusahaan wajib diisi.",
      );
      return;
    }

    const items: ItemMasuk[] = produk.map((p) => ({
      produk: p,
      qty: Number(detail[p].qty),
      satuan: detail[p].satuan,
    }));
    const body: BodyLeadBaru = { sumber: sumber!, items };
    if (pelangganId) body.pelanggan_id = pelangganId;
    else body.pelanggan = { nama: nama.trim(), kota: kota.trim() || undefined };
    if (pic.trim() || telepon.trim()) body.kontak = { nama: pic.trim() || undefined, telepon: telepon.trim() || undefined };
    if (kebutuhan.trim()) body.kebutuhan = kebutuhan.trim();

    try {
      const lead = await buat.mutateAsync(body);
      toast.success(`Lead ${lead.kode} dibuat`);
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Perusahaan + dedup */}
      <div className="space-y-1.5">
        <Label htmlFor="lb-nama">Perusahaan</Label>
        {pelangganId ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{nama}</span>
            <span className="text-xs text-muted-foreground">pelanggan lama</span>
            <Button type="button" variant="ghost" size="sm" onClick={lepasPelanggan}>
              Ganti
            </Button>
          </div>
        ) : (
          <>
            <Input
              id="lb-nama"
              autoComplete="off"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Ketik nama perusahaan"
              aria-invalid={galatField.nama}
              data-uji="lb-nama"
            />
            {tampilSaran ? (
              <ul className="overflow-hidden rounded-lg border" data-uji="saran-pelanggan">
                {saran.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pilihPelanggan(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1 truncate">{p.nama}</span>
                      {p.kota ? <span className="shrink-0 text-xs text-muted-foreground">{p.kota}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Pelanggan lama muncul sebagai saran, jadi tidak dobel.</p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lb-pic">Nama PIC</Label>
          <Input id="lb-pic" value={pic} onChange={(e) => setPic(e.target.value)} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lb-kota">Kota</Label>
          <Input id="lb-kota" value={kota} onChange={(e) => setKota(e.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lb-telp">Telepon / WA</Label>
        <Input id="lb-telp" inputMode="tel" value={telepon} onChange={(e) => setTelepon(e.target.value)} autoComplete="off" />
        {tampilPeringatanTelp ? (
          <KotakPesan nada="peringatan">
            Nomor ini mungkin milik pelanggan lama:{" "}
            {peringatanTelp.slice(0, 3).map((p, i) => (
              <button key={p.id} type="button" onClick={() => pilihPelanggan(p)} className="underline">
                {p.nama}
                {i < Math.min(peringatanTelp.length, 3) - 1 ? ", " : ""}
              </button>
            ))}
            . Pakai yang itu supaya tidak dobel?
          </KotakPesan>
        ) : null}
      </div>

      {/* Produk + qty */}
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
                  aria-invalid={galatField[`qty-${p}`]}
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
        ) : (
          <p className={cn("text-xs", galatField.produk ? "text-telat" : "text-muted-foreground")}>
            Pilih produk, lalu isi qty (wajib untuk tiap produk).
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lb-keb">Kebutuhan</Label>
        <Textarea
          id="lb-keb"
          rows={2}
          value={kebutuhan}
          onChange={(e) => setKebutuhan(e.target.value)}
          placeholder="mis. Pallet mesh galvanis 1200x1000"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Sumber</Label>
        <GrupChip opsi={SUMBER} nilai={sumber} onUbah={setSumber} label="Sumber lead" ariaInvalid={galatField.sumber} />
      </div>

      <KotakPesan nada="info" tanpaIkon>
        Otomatis: tanggal hari ini, pemilik Anda, tahap BARU.
      </KotakPesan>

      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}

      <KakiLembar>
        <Button type="button" variant="outline" onClick={onSelesai}>
          Batal
        </Button>
        <Button type="button" onClick={kirim} disabled={buat.isPending} data-uji="kirim-lead-baru">
          {buat.isPending ? "Menyimpan…" : "Simpan lead"}
        </Button>
      </KakiLembar>
    </div>
  );
}
