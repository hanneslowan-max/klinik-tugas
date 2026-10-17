// Pembantu murni database pelanggan (diuji di pelanggan.test.ts). Aturan urutan order SAMA dengan server
// (order_sebelumnya, 20261017120000): tanggal order = tanggal SP (atau tanggal masuk bila SP kosong), lalu kode lead.
import { rupiah } from "@/features/pipeline/konstanta";
import type { LeadRingkas, PelangganRingkas } from "@/types/domain";

type LeadUrut = Pick<LeadRingkas, "id" | "kode" | "tahap" | "tanggal_masuk" | "tanggal_sp">;

const tanggalOrder = (l: LeadUrut) => l.tanggal_sp ?? l.tanggal_masuk;

/** Nomor urut order per lead ORDER (1 = order pertama pelanggan ini). Lead yang bukan ORDER tidak bernomor. */
export function nomorOrder(leads: LeadUrut[]): Map<string, number> {
  const order = leads
    .filter((l) => l.tahap === "ORDER")
    .sort((a, b) => {
      const ta = tanggalOrder(a);
      const tb = tanggalOrder(b);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0;
    });
  return new Map(order.map((l, i) => [l.id, i + 1]));
}

/** Ringkas angka lead/order/nilai satu pelanggan: '3 lead · 2 order · Rp12.000.000' (tanpa order: '1 lead'). */
export function ringkasStatistik(p: Pick<PelangganRingkas, "jml_lead" | "jml_order" | "nilai_order">): string {
  const bagian = [`${p.jml_lead} lead`];
  if (p.jml_order > 0) bagian.push(`${p.jml_order} order`, rupiah(p.nilai_order));
  return bagian.join(" · ");
}
