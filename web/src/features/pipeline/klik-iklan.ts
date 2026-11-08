// Pembantu murni kartu "Klik iklan → order" (web_iklan_ringkas, migrasi 20261108120000_iklan_klik).
import type { JendelaKlikIklan } from "@/types/domain";

/** Bagian klik yang kodenya muncul di lead, mis. "42%"; klik 0 → "—" (belum bisa dihitung, bukan 0%). */
export function persenKodeDiLead(j: Pick<JendelaKlikIklan, "klik" | "kode_di_lead">): string {
  if (!j.klik) return "—";
  return `${Math.round((j.kode_di_lead / j.klik) * 100)}%`;
}

/** Jumlah klik gbraid/wbraid semua domain (30 hari): tidak bisa ikut CSV unggah. */
export function totalBraid(per: { h30: Pick<JendelaKlikIklan, "braid"> }[]): number {
  return per.reduce((n, d) => n + (Number(d.h30.braid) || 0), 0);
}
