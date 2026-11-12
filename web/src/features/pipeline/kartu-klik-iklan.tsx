"use client";

// Kartu "Klik iklan → order" di layar Ringkasan (admin/baca; server menolak peran lain). Memantau keutuhan kode Ref
// unik situs (GA-RH-XXXX / GA-OY-XXXX): klik tercatat 7/30 hari per domain, berapa kodenya muncul di lead, berapa jadi
// ORDER + nilai, gbraid/wbraid yang tidak bisa diunggah, dan isi CSV unggah Google Ads saat ini.
import { GalatMuat, MemuatDaftar } from "@/components/umum/keadaan";
import { persenKodeDiLead, totalBraid } from "@/features/pipeline/klik-iklan";
import { rupiah } from "@/features/pipeline/konstanta";
import { useIklanRingkas } from "@/features/pipeline/queries";
import type { JendelaKlikIklan } from "@/types/domain";

function BarisJendela({ label, j }: { label: string; j: JendelaKlikIklan }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] items-baseline gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {j.klik} <span className="text-xs text-muted-foreground">klik</span>
      </span>
      <span className="tabular-nums">
        {j.kode_di_lead} <span className="text-xs text-muted-foreground">di lead ({persenKodeDiLead(j)})</span>
      </span>
      <span className="text-right tabular-nums">
        {j.order} <span className="text-xs text-muted-foreground">order</span>
        <span className="block text-xs text-muted-foreground">{rupiah(j.nilai)}</span>
      </span>
    </div>
  );
}

export function KartuKlikIklan() {
  const q = useIklanRingkas();
  return (
    <section className="space-y-2" data-uji="kartu-klik-iklan">
      <h2 className="text-sm font-semibold">Klik iklan → order (kode Ref unik situs)</h2>
      {q.isError ? (
        <GalatMuat galat={q.error} ulang={() => void q.refetch()} />
      ) : q.isPending ? (
        <MemuatDaftar />
      ) : (
        <>
          <div className="space-y-2">
            {q.data.per_domain.map((d) => (
              <div key={d.domain} className="space-y-1.5 rounded-xl border bg-card p-3">
                <h3 className="text-sm font-medium">
                  {d.singkat} <span className="font-normal text-muted-foreground">· {d.domain}</span>
                </h3>
                <BarisJendela label="7 hari" j={d.h7} />
                <BarisJendela label="30 hari" j={d.h30} />
              </div>
            ))}
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>
              CSV unggah Google Ads saat ini: <span className="tabular-nums">{q.data.unggah.baris}</span> order (
              {rupiah(q.data.unggah.nilai)})
              {q.data.unggah.ditunda ? `, ${q.data.unggah.ditunda} menunggu jam konversi` : ""}.
            </li>
            <li>
              gbraid/wbraid (iOS) 30 hari: <span className="tabular-nums">{totalBraid(q.data.per_domain)}</span> klik
              {q.data.unggah.dilewati_braid ? `, ${q.data.unggah.dilewati_braid} order` : ""}; belum ikut CSV.
            </li>
            <li>
              Lead 30 hari ber-kode unik tanpa klik tercatat: <span className="tabular-nums">{q.data.lead_kode_tanpa_klik}</span>.
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
