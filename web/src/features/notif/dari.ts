// Tab notifikasi "Dari tim" / "Dari agent" (revisi #2): tab aktif di URL (?dari=agent) dan hitung ulang angka
// belum-dibaca secara lokal (optimistis) sebelum disamakan dengan server. Murni, tanpa React (diuji Vitest).
// Klasifikasi tim/agent ditentukan server (SQL notif_dari_agent), bukan di sini.
import type { DaftarNotif, DariNotif } from "@/types/domain";

/** Tab aktif dari URL: "agent" hanya bila ?dari=agent; kosong / nilai lain = "tim" (tab bawaan). */
export function bacaDari(sp: Pick<URLSearchParams, "get"> | null | undefined): DariNotif {
  return sp?.get("dari") === "agent" ? "agent" : "tim";
}

/** URL layar notifikasi untuk satu tab (tab bawaan tanpa parameter). */
export function hrefNotif(dari: DariNotif): string {
  return dari === "agent" ? "/notif?dari=agent" : "/notif";
}

/** Tab yang satunya. */
export function tabLain(dari: DariNotif): DariNotif {
  return dari === "agent" ? "tim" : "agent";
}

/** Jumlah belum dibaca satu tab (0 bila data belum ada). */
export function belumTab(d: Pick<DaftarNotif, "belum_tim" | "belum_agent"> | null | undefined, dari: DariNotif): number {
  if (!d) return 0;
  return Math.max(0, Number(dari === "agent" ? d.belum_agent : d.belum_tim) || 0);
}

/** Teks lencana angka: "99+" bila lebih dari 99 (sama dengan lonceng). */
export function angkaNotif(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** Satu notifikasi dibuka: tandai dibaca, turunkan `belum` (total) dan `belum_<kelompoknya>` satu kali.
 *  Item yang sudah dibaca / tidak ada di data ini → data tidak berubah. */
export function tandaiDibaca(d: DaftarNotif, id: number, kini: string): DaftarNotif {
  const item = d.items.find((x) => x.id === id);
  if (!item || item.read_at) return d;
  return {
    ...d,
    belum: Math.max(0, d.belum - 1),
    belum_tim: item.dari === "tim" ? Math.max(0, d.belum_tim - 1) : d.belum_tim,
    belum_agent: item.dari === "agent" ? Math.max(0, d.belum_agent - 1) : d.belum_agent,
    items: d.items.map((x) => (x.id === id ? { ...x, read_at: kini } : x)),
  };
}

/** "Tandai semua dibaca" di satu tab berhasil (server menandai `dibaca` baris): semua item tab itu dibaca,
 *  angka tab = 0, total turun sebanyak `dibaca`. */
export function tandaiTabDibaca(d: DaftarNotif, dari: DariNotif, dibaca: number, kini: string): DaftarNotif {
  return {
    ...d,
    belum: Math.max(0, d.belum - Math.max(0, dibaca)),
    belum_tim: dari === "tim" ? 0 : d.belum_tim,
    belum_agent: dari === "agent" ? 0 : d.belum_agent,
    items: d.items.map((x) => (x.dari === dari && !x.read_at ? { ...x, read_at: kini } : x)),
  };
}
