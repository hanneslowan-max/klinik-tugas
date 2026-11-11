"use client";

// Bot WA 0878 (owner; keputusan Hannes 11 Nov 2026): pemantau mutu bot luar jam kerja. Tiga tab:
//   Ringkasan — saklar (nyalakan/matikan + konfirmasi), hitungan, biaya AI, detak cron/webhook, alasan terbanyak
//   Keputusan — daftar keputusan terbaru + teks balasan bot lengkap (TANPA isi chat pelanggan, tanpa nomor telepon)
//   Pengetahuan — fakta terkunci & contoh balasan (tambah/ubah/nonaktifkan; dicek validator bot di Edge)
// Isi chat lengkap dibaca di HP 0878 / inbox Kapso. Hak sebenarnya: web_wa_* (mulai_web owner) + Edge /x/admin/*.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BookOpen, Copy, ExternalLink, ListChecks, Pencil, Plus, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IsiHalaman } from "@/components/layout/isi-halaman";
import { KepalaHalaman } from "@/components/layout/kepala-halaman";
import { Chip } from "@/components/umum/chip";
import { GalatMuat, Kosong, MemuatDaftar } from "@/components/umum/keadaan";
import { useKonfirmasi } from "@/components/umum/konfirmasi";
import { KotakPesan } from "@/components/umum/kotak-pesan";
import { KakiLembar, Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  argKeputusan, cekForm, detakBot, fmtUsd, INBOX_KAPSO, LABEL_KEPUTUSAN, labelAlasan, MAKS_SITUASI, MAKS_TEKS, nadaKeputusan,
  pesanTolak, SARING_KEPUTUSAN, saringBaris, urutPerAlasan, type SaringKeputusan,
} from "@/features/bot-wa/bot-wa";
import { edgeAdmin } from "@/lib/api/edge";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import { fmtRelatif, fmtWaktu } from "@/lib/tanggal";
import { cn } from "@/lib/utils";
import type { BarisLogWa, PengetahuanBotWa, RingkasBotWa } from "@/types/domain";

type Tab = "ringkasan" | "keputusan" | "pengetahuan";
const TAB: { tab: Tab; label: string; Ikon: typeof Activity }[] = [
  { tab: "ringkasan", label: "Ringkasan", Ikon: Activity },
  { tab: "keputusan", label: "Keputusan", Ikon: ListChecks },
  { tab: "pengetahuan", label: "Pengetahuan", Ikon: BookOpen },
];
const PILIHAN_HARI = [1, 7, 30, 90];

export function LayarBotWa() {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [hari, setHari] = useState(7);
  return (
    <>
      <KepalaHalaman
        judul="Bot WA"
        aksi={
          <Button variant="outline" size="sm" className="pointer-coarse:h-10" asChild>
            <a href={INBOX_KAPSO} target="_blank" rel="noreferrer" data-uji="buka-kapso" title="Buka inbox Kapso (isi chat lengkap)">
              <ExternalLink data-icon="inline-start" aria-hidden />
              <span className="hidden sm:inline">Inbox Kapso</span>
            </a>
          </Button>
        }
      />
      <IsiHalaman className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div role="tablist" aria-label="Tampilan bot WA" className="flex w-full min-w-0 rounded-lg bg-muted p-[3px] sm:flex-1">
            {TAB.map(({ tab: t, label, Ikon }) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === tab}
                onClick={() => setTab(t)}
                data-uji={`tab-bot-${t}`}
                className={cn(
                  "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap outline-none pointer-coarse:h-11",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  t === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Ikon className="hidden size-4 shrink-0 sm:block" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          {tab !== "pengetahuan" ? (
            <Select value={String(hari)} onValueChange={(v) => setHari(Number(v))}>
              <SelectTrigger className="w-full sm:w-32 pointer-coarse:h-11" aria-label="Rentang hari" data-uji="pilih-hari">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PILIHAN_HARI.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h === 1 ? "24 jam" : `${h} hari`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <KotakPesan nada="info" tanpaIkon className="text-sm">
          Halaman ini tidak menampilkan isi chat pelanggan. Baca chat lengkap di HP 0878 atau inbox Kapso.
        </KotakPesan>
        {tab === "ringkasan" ? <TabRingkasan hari={hari} /> : tab === "keputusan" ? <TabKeputusan hari={hari} /> : <TabPengetahuan />}
      </IsiHalaman>
    </>
  );
}

// ---------------------------------------------------------------- Ringkasan
function Angka({ label, nilai, ket }: { label: string; nilai: string | number; ket?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{nilai}</div>
      {ket ? <div className="text-xs text-muted-foreground">{ket}</div> : null}
    </div>
  );
}

function TabRingkasan({ hari }: { hari: number }) {
  const qc = useQueryClient();
  const konfirmasi = useKonfirmasi();
  const q = useQuery({
    queryKey: kunci.botWaRingkas(hari),
    queryFn: () => rpc(klienBrowser(), "web_wa_ringkas", { p: { hari } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const saklar = useMutation({
    mutationFn: (status: "mati" | "kirim") => rpc(klienBrowser(), "web_wa_saklar", { p: { status, catatan: "dari halaman Bot WA" } }),
    onSuccess: (r) => {
      toast.success(r.saklar === "kirim" ? "Bot dinyalakan." : "Bot dimatikan.");
      void qc.invalidateQueries({ queryKey: kunci.botWa });
    },
    onError: (e) => toast.error(pesanGalat(e)),
  });

  if (q.isPending) return <MemuatDaftar baris={4} />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;
  const r: RingkasBotWa = q.data;
  const nyala = r.saklar === "kirim";

  async function ubahSaklar() {
    const ke = nyala ? "mati" : "kirim";
    const ok = await konfirmasi({
      judul: nyala ? "Matikan bot WA?" : "Nyalakan bot WA?",
      pesan: nyala
        ? "Bot berhenti membalas chat luar jam kerja. Minta Riksa/Michael menyalakan lagi pesan luar jam (A2) di HP 0878."
        : "Bot akan membalas chat di luar jam kerja (Sen–Jum < 08.00 & ≥ 17.00, Sabtu, Minggu, libur). Pastikan pesan luar jam (A2) di HP 0878 sudah dimatikan supaya pelanggan tidak menerima dua balasan.",
      ya: nyala ? "Matikan" : "Nyalakan",
      bahaya: nyala,
    });
    if (ok) saklar.mutate(ke);
  }

  const alasan = urutPerAlasan(r.per_alasan).slice(0, 8);
  return (
    <div className="flex flex-col gap-3" data-uji="ringkasan-bot">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", nyala ? "bg-sukses" : "bg-muted-foreground")} aria-hidden />
            <span className="font-semibold" data-uji="status-saklar">{nyala ? "Bot menyala" : "Bot mati"}</span>
            {r.saklar_alasan === "pemutus" ? <Chip nada="telat">dimatikan pemutus otomatis</Chip> : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {r.saklar_diubah_pada ? `Diubah ${fmtRelatif(r.saklar_diubah_pada)}` : "Belum pernah diubah"}
            {r.saklar_catatan ? ` · ${r.saklar_catatan}` : ""} · model {r.model}
          </span>
        </div>
        <Button
          variant={nyala ? "outline" : "default"}
          className="pointer-coarse:h-11"
          disabled={saklar.isPending}
          onClick={() => void ubahSaklar()}
          data-uji="tombol-saklar"
        >
          <Power data-icon="inline-start" aria-hidden />
          {nyala ? "Matikan" : "Nyalakan"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Angka label="Chat masuk" nilai={r.masuk} ket={`${r.masuk_luar_jam} di luar jam kerja`} />
        <Angka label="Balasan bot terkirim" nilai={r.kirim} ket={`${r.nomor_dibalas} chat dibalas`} />
        <Angka label="Ditolak validator" nilai={r.tolak} />
        <Angka label="Gagal kirim" nilai={r.gagal} />
        <Angka label="Biaya AI" nilai={fmtUsd(r.biaya_usd)} ket={`${r.panggilan_ai} panggilan`} />
        <Angka label="Antrean aktif" nilai={r.antrean_aktif} />
        <Angka label="Daftar diam" nilai={r.daftar_diam} ket="nomor tidak dibalas bot" />
        <Angka label="Kata kunci sales" nilai={r.kata_manusia} ket="pola aktif" />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">Detak</div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {detakBot(r, q.dataUpdatedAt).map((d) => (
            <li key={d.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", d.sehat ? "bg-sukses" : "bg-telat")} aria-hidden />
                {d.label}
              </span>
              <span className="text-muted-foreground tabular-nums">{d.iso ? fmtRelatif(d.iso) : "belum ada"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">Alasan bot tidak membalas (terbanyak)</div>
        {alasan.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {alasan.map((a) => (
              <li key={a.kunci} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Chip nada={nadaKeputusan(a.keputusan as BarisLogWa["keputusan"])}>
                    {LABEL_KEPUTUSAN[a.keputusan as BarisLogWa["keputusan"]] ?? a.keputusan}
                  </Chip>
                  <span className="truncate">{a.label}</span>
                </span>
                <span className="tabular-nums">{a.n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Keputusan
function salin(teks: string) {
  void navigator.clipboard?.writeText(teks).then(
    () => toast.success("Id percakapan disalin. Cari di inbox Kapso."),
    () => toast.error("Gagal menyalin."),
  );
}

function BarisKeputusan({ b }: { b: BarisLogWa }) {
  const arah = b.arah === "masuk" ? "Pesan masuk" : b.arah === "keluar_bot" ? "Balasan bot" : b.arah === "keluar_sales" ? "Sales membalas"
    : b.arah === "keluar_aplikasi" ? "Teks otomatis aplikasi" : b.arah === "keluar_api" ? "Keluar lewat API" : "Proses bot";
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-card p-3" data-uji="baris-keputusan">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Chip nada={nadaKeputusan(b.keputusan)}>{LABEL_KEPUTUSAN[b.keputusan]}</Chip>
        <span className="font-medium">{arah}</span>
        <span className="text-muted-foreground">{fmtWaktu(b.waktu)}</span>
        {b.nomor ? <Chip nada="garis" title="8 karakter awal hash nomor (bukan nomor telepon)">chat {b.nomor}</Chip> : null}
      </div>
      {b.alasan ? <div className="text-sm text-muted-foreground">{labelAlasan(b.alasan)}</div> : null}
      {b.teks_bot ? (
        <div className={cn("rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap", b.keputusan === "tolak" && "border border-telat/40")}>
          {b.teks_bot}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {b.token_masuk !== null ? <span className="tabular-nums">{b.token_masuk}/{b.token_keluar} token · {fmtUsd(b.biaya_usd)}</span> : null}
        {b.percakapan ? (
          <button type="button" className="inline-flex items-center gap-1 underline-offset-2 hover:underline pointer-coarse:min-h-9" onClick={() => salin(b.percakapan!)}>
            <Copy className="size-3" aria-hidden /> salin id percakapan Kapso
          </button>
        ) : null}
      </div>
    </li>
  );
}

function TabKeputusan({ hari }: { hari: number }) {
  const [saring, setSaring] = useState<SaringKeputusan>("bot");
  const q = useInfiniteQuery({
    queryKey: kunci.botWaLog(saring, hari),
    queryFn: ({ pageParam }) =>
      rpc(klienBrowser(), "web_wa_log", { p: { hari, keputusan: argKeputusan(saring), sebelum: pageParam ?? undefined, batas: 50 } }),
    initialPageParam: null as number | null,
    getNextPageParam: (h) => h.berikut,
    staleTime: 30_000,
  });
  const items = saringBaris((q.data?.pages ?? []).flatMap((h) => h.items), saring);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Saring keputusan" className="flex flex-wrap gap-1.5" data-uji="saring-keputusan">
        {SARING_KEPUTUSAN.map((o) => (
          <button
            key={o.nilai}
            type="button"
            aria-pressed={saring === o.nilai}
            onClick={() => setSaring(o.nilai)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap outline-none pointer-coarse:min-h-11",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              saring === o.nilai ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <MemuatDaftar />
      ) : q.isError ? (
        <GalatMuat galat={q.error} ulang={() => q.refetch()} />
      ) : items.length === 0 ? (
        <Kosong>Belum ada catatan untuk saringan ini.</Kosong>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((b) => (
            <BarisKeputusan key={b.id} b={b} />
          ))}
        </ul>
      )}
      {q.hasNextPage ? (
        <Button variant="outline" className="self-center pointer-coarse:h-11" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} data-uji="muat-lagi">
          {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Pengetahuan (fakta & contoh)
type PropsDaftar = {
judul: string; ket: string; baris: PengetahuanBotWa[]; jenis: "fakta" | "contoh"; sibuk: boolean;
onTambah: () => void; onUbah: (x: PengetahuanBotWa) => void; onAktif: (x: PengetahuanBotWa) => void;
};
function DaftarPengetahuan({ judul, ket, baris, jenis, sibuk, onTambah, onUbah, onAktif }: PropsDaftar) {
return (
  <section className="flex flex-col gap-2" data-uji={`bagian-${jenis}`}>
    <div className="flex items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{judul}</h2>
        <p className="text-xs text-muted-foreground">{ket}</p>
      </div>
      <Button size="sm" variant="outline" className="pointer-coarse:h-10" onClick={onTambah} data-uji={`tambah-${jenis}`}>
        <Plus data-icon="inline-start" aria-hidden /> Tambah
      </Button>
    </div>
    {baris.length === 0 ? (
      <Kosong>Belum ada.</Kosong>
    ) : (
      <ul className="flex flex-col gap-2">
        {baris.map((x) => (
          <li key={x.id} className={cn("flex flex-col gap-1.5 rounded-lg border bg-card p-3", !x.aktif && "opacity-60")} data-uji={`baris-${jenis}`}>
            {x.situasi ? <div className="text-xs font-medium text-muted-foreground">Situasi: {x.situasi}</div> : null}
            <div className="text-sm whitespace-pre-wrap">{x.teks}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {x.aktif ? <Chip nada="sukses">aktif</Chip> : <Chip>nonaktif</Chip>}
              <span>urutan {x.urutan}</span>
              <span>diubah {fmtRelatif(x.diubah_pada)}</span>
              <span className="ms-auto flex gap-1">
                <Button size="sm" variant="ghost" className="pointer-coarse:h-10" onClick={() => onUbah(x)}>
                  <Pencil data-icon="inline-start" aria-hidden /> Ubah
                </Button>
                <Button size="sm" variant="ghost" className="pointer-coarse:h-10" disabled={sibuk} onClick={() => onAktif(x)}>
                  {x.aktif ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);
}

type Form = { id?: number; jenis: "fakta" | "contoh"; teks: string; situasi: string; urutan: string };

function TabPengetahuan() {
  const qc = useQueryClient();
  const [form, setFormIsi] = useState<Form | null>(null);
  const [buka, setBuka] = useState(false);
  // isi form tetap ada selama animasi tutup (judul lembar tidak berganti); null = tutup
  const setForm = (f: Form | null) => {
    if (f) setFormIsi(f);
    setBuka(f !== null);
  };
  const q = useQuery({ queryKey: kunci.botWaPengetahuan, queryFn: () => rpc(klienBrowser(), "web_wa_pengetahuan_daftar"), staleTime: 30_000 });
  const simpan = useMutation({
    mutationFn: (body: Record<string, unknown>) => edgeAdmin<PengetahuanBotWa>("wa-pengetahuan", body),
    onSuccess: () => {
      toast.success("Tersimpan. Berlaku di balasan bot berikutnya.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: kunci.botWaPengetahuan });
    },
    onError: (e) => toast.error(pesanTolak(pesanGalat(e))),
  });

  if (q.isPending) return <MemuatDaftar />;
  if (q.isError) return <GalatMuat galat={q.error} ulang={() => q.refetch()} />;
  const fakta = q.data.filter((x) => x.jenis === "fakta");
  const contoh = q.data.filter((x) => x.jenis === "contoh");

  const kirim = () => {
    if (!form) return;
    const g = cekForm(form.jenis, form.teks, form.situasi);
    if (g) return toast.error(g);
    const body: Record<string, unknown> = { jenis: form.jenis, teks: form.teks.trim() };
    if (form.id) body.id = form.id;
    if (form.jenis === "contoh") body.situasi = form.situasi.trim();
    if (form.urutan.trim()) body.urutan = Number(form.urutan);
    simpan.mutate(body);
  };
  const aksi = (jenis: "fakta" | "contoh") => ({
    sibuk: simpan.isPending,
    onTambah: () => setForm({ jenis, teks: "", situasi: "", urutan: "" }),
    onUbah: (x: PengetahuanBotWa) => setForm({ id: x.id, jenis: x.jenis, teks: x.teks, situasi: x.situasi ?? "", urutan: String(x.urutan) }),
    onAktif: (x: PengetahuanBotWa) => simpan.mutate({ id: x.id, jenis: x.jenis, aktif: !x.aktif }),
  });

  return (
    <div className="flex flex-col gap-5">
      <DaftarPengetahuan jenis="fakta" judul="Fakta terkunci" ket="Fakta produk yang boleh disebut bot (tanpa harga, stok, atau janji). Maks 30 aktif, minimal 1."
        baris={fakta} {...aksi("fakta")} />
      <DaftarPengetahuan jenis="contoh" judul="Contoh balasan" ket="Acuan nada dan urutan pertanyaan bot, bukan untuk disalin mentah. Maks 8 aktif."
        baris={contoh} {...aksi("contoh")} />
      <Lembar
        buka={buka}
        ubahBuka={(b) => !b && setForm(null)}
        judul={form?.id ? (form.jenis === "fakta" ? "Ubah fakta" : "Ubah contoh balasan") : form?.jenis === "contoh" ? "Tambah contoh balasan" : "Tambah fakta"}
        deskripsi="Teks dicek validator bot: tidak boleh ada harga, diskon, tautan, nomor, janji stok atau waktu kirim."
        data-uji="lembar-pengetahuan"
        kaki={
          <KakiLembar>
            <Button variant="outline" onClick={() => setForm(null)}>Batal</Button>
            <Button disabled={simpan.isPending} onClick={kirim} data-uji="simpan-pengetahuan">
              {simpan.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </KakiLembar>
        }
      >
        {form ? (
          <div className="flex flex-col gap-3">
            {form.jenis === "contoh" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="situasi-bot">Situasi</Label>
                <Input id="situasi-bot" value={form.situasi} maxLength={MAKS_SITUASI} placeholder="Contoh: pelanggan tanya troli tanpa ukuran"
                  onChange={(e) => setForm({ ...form, situasi: e.target.value })} />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="teks-bot">{form.jenis === "contoh" ? "Contoh balasan" : "Fakta"}</Label>
              <Textarea id="teks-bot" rows={form.jenis === "contoh" ? 6 : 3} value={form.teks} maxLength={MAKS_TEKS}
                placeholder={form.jenis === "contoh" ? "Tulis [HARI] untuk jam balas sales; server mengisinya." : "Contoh: Troli platform kapasitas standar 150 kg dan 300 kg."}
                onChange={(e) => setForm({ ...form, teks: e.target.value })} />
              <span className="text-xs text-muted-foreground tabular-nums">{form.teks.length}/{MAKS_TEKS}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="urutan-bot">Urutan (kecil tampil dulu)</Label>
              <Input id="urutan-bot" inputMode="numeric" className="w-28" value={form.urutan} placeholder="100"
                onChange={(e) => setForm({ ...form, urutan: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </div>
          </div>
        ) : null}
      </Lembar>
    </div>
  );
}
