// Pembantu murni kartu "Asal lead per situs" (web_pipeline_asal_situs, migrasi 20261111150000_pipeline_asal_situs):
// rentang (bulan dasbor / sejak bukti dicatat), tautan angka → daftar lead (/pipeline?kes=asal_situs&…) dan pembacaan
// kembali parameternya di layar daftar. Predikat lead ada di server (pipeline_asal_lead); di sini hanya URL & label.
import { rentangBulan, tglPendek } from "@/features/pipeline/dasbor";
import { ASAL_SITUS, BUKTI_SEJAK, JALUR_ASAL, PRODUK } from "@/features/pipeline/konstanta";
import type { JalurAsal, KelompokAsal, ProdukLead } from "@/types/domain";

/** Pilihan rentang kartu: bulan yang dipilih di dasbor, atau sejak bukti sumber mulai dicatat (21 Okt 2026). */
export type PilihRentang = "bulan" | "bukti";

export type SaringAsal = {
  kelompok: KelompokAsal | "semua";
  /** hanya untuk situs_rh / situs_oy */
  jalur: JalurAsal | null;
  /** null = semua produk */
  produk: ProdukLead | null;
  sejak: string;
  sampai: string;
};

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const KELOMPOK = Object.keys(ASAL_SITUS) as KelompokAsal[];
const situs = (k: string): k is "situs_rh" | "situs_oy" => k === "situs_rh" || k === "situs_oy";

/** Rentang tanggal masuk: bulan 'YYYY-MM' (s/d hari ini bila bulan berjalan) atau BUKTI_SEJAK s/d hari ini. */
export function rentangAsal(pilih: PilihRentang, bulan: string, hariIni: string): { sejak: string; sampai: string } {
  if (pilih === "bukti") return { sejak: BUKTI_SEJAK, sampai: hariIni };
  const { awal, akhir } = rentangBulan(bulan);
  return { sejak: awal, sampai: akhir < hariIni ? akhir : hariIni };
}

/** Seluruh rentang jatuh sebelum bukti dicatat → semua lead pasti "Belum ada bukti". */
export const sebelumBukti = (sampai: string) => sampai < BUKTI_SEJAK;

/** '21 Okt–11 Nov 2026' · '1–30 Sep 2026' · '11 Nov 2026'. */
export function labelRentangAsal(sejak: string, sampai: string): string {
  const tahun = sampai.slice(0, 4);
  if (sejak === sampai) return `${tglPendek(sampai)} ${tahun}`;
  const awal = sejak.slice(0, 7) === sampai.slice(0, 7) ? String(Number(sejak.slice(8, 10))) : tglPendek(sejak);
  const tahunAwal = sejak.slice(0, 4) === tahun ? "" : ` ${sejak.slice(0, 4)}`;
  return `${awal}${tahunAwal}–${tglPendek(sampai)} ${tahun}`;
}

/**
 * Tautan angka kartu → daftar lead tersaring id yang dihitung server (web_pipeline_dasbor_ids metrik asal_situs).
 * ka = kelompok (tanpa = semua), kj = jalur, kpr = produk, kd/ks = sejak/sampai. Tidak bertabrakan dengan saringan
 * daftar sendiri (?produk, ?dari, ?sampai).
 */
export function tautanAsal(s: SaringAsal): string {
  const p = new URLSearchParams({ kes: "asal_situs" });
  if (s.kelompok !== "semua") p.set("ka", s.kelompok);
  if (s.jalur && situs(s.kelompok)) p.set("kj", s.jalur);
  if (s.produk) p.set("kpr", s.produk);
  p.set("kd", s.sejak);
  p.set("ks", s.sampai);
  return `/pipeline?${p.toString()}`;
}

/** Baca kembali parameter tautanAsal; bagian yang tidak sah dibuang (kelompok → semua, jalur/produk → null, tanggal → ""). */
export function bacaSaringAsal(sp: { get(k: string): string | null }): SaringAsal {
  const ka = sp.get("ka") ?? "";
  const kelompok = (KELOMPOK as string[]).includes(ka) ? (ka as KelompokAsal) : "semua";
  const kj = sp.get("kj");
  const jalur = situs(kelompok) && (kj === "organik" || kj === "google_ads") ? kj : null;
  const kpr = sp.get("kpr");
  const produk = PRODUK.find((x) => x === kpr) ?? null;
  const tgl = (k: string) => {
    const v = sp.get(k) ?? "";
    return ISO.test(v) ? v : "";
  };
  return { kelompok, jalur, produk, sejak: tgl("kd"), sampai: tgl("ks") };
}

/** Isi spanduk daftar: 'Situs Hammerindo · Google Ads · Pallet Mesh · 21 Okt–11 Nov 2026'. */
export function labelSaringAsal(s: SaringAsal): string {
  return [
    s.kelompok === "semua" ? "Semua asal" : ASAL_SITUS[s.kelompok],
    s.jalur ? JALUR_ASAL[s.jalur] : "",
    s.produk ?? "Semua produk",
    s.sejak && s.sampai ? labelRentangAsal(s.sejak, s.sampai) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
