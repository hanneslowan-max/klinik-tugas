// Pembagian SEKETIKA chat WA 0878 baru di jam kerja (migrasi 20261111170000_wa_bagi_seketika.sql; keputusan Hannes
// 11 Nov 2026). Dipanggil POST /x/wa/bagi (pg_cron tiap menit lewat wa.picu_bagi, token TOKEN_WA_PROSES):
//   x_wa_bagi_ambil → tiap calon dibaca ulang lewat API Kapso (percakapan lama? sudah dibalas sales?) → x_wa_bagi_hasil
//   (pemilik bergiliran) → Telegram grup RHJ Online Sales (TELEGRAM_CHAT_SALES) → x_wa_bagi_umum.
// Isi chat hanya dibaca di memori Edge untuk dua cek itu; tidak disimpan, tidak dikirim ke mana pun.
// Pesan grup memuat nomor chat (boleh di grup sales, keputusan Hannes 29 Okt 2026) + nama sales; tanpa nama/isi pelanggan.
import { ambilPesan, type EnvWa, type Fetch, type ItemAntrean, PENANDA, POLA_OTOMATIS_APLIKASI, type Rpc } from "./wa.ts";

type Obj = Record<string, unknown>;

export interface DepsBagi {
  rpc: Rpc;
  fetch: Fetch;
  env: EnvWa;
  chatSales: string;
  sekarang?: string;   // ISO, hanya tes (WA_IZINKAN_JAM_UJI=1)
}

interface Calon { id: number; nomor: string; percakapan: string | null; masuk_pada: string }
interface Umum { id: number; nomor: string; pemilik_nama: string }
interface Sales { id: number; nama: string }

const MENIT = 60_000;

function teks(m: Obj): string {
  const k = (m.kapso ?? {}) as Obj;
  const t = (m.text ?? {}) as Obj;
  for (const v of [t.body, k.content]) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 62812… → 0812… */
export function nomorLokal(n: string): string {
  return n.startsWith("62") ? `0${n.slice(2)}` : n;
}

/**
 * Keputusan satu calon dari pesan Kapso: batal percakapan_berjalan (ada pesan > 1 menit sebelum pesan pertama dan
 * ≤ hariBaru hari), sales sudah membalas → tugaskan ke sales yang namanya disebut (satu nama saja), selain itu batal
 * sudah_dibalas; belum dibalas → tugaskan bergiliran.
 */
export function putuskan(c: Calon, pesan: Obj[], sales: Sales[], hariBaru: number): Obj {
  const masuk = Date.parse(c.masuk_pada);
  const waktu = (m: Obj) => Number(m.timestamp) * 1000;
  const lama = pesan.some((m) => {
    const t = waktu(m);
    return Number.isFinite(t) && t < masuk - MENIT && t > masuk - hariBaru * 24 * 60 * MENIT;
  });
  if (lama) return { id: c.id, keputusan: "batal", alasan: "percakapan_berjalan" };
  const balas = pesan.filter((m) => {
    const k = (m.kapso ?? {}) as Obj;
    if (String(k.direction ?? "") !== "outbound") return false;
    const t = waktu(m);
    if (!Number.isFinite(t) || t < masuk - MENIT) return false;
    const x = teks(m);
    return !(POLA_OTOMATIS_APLIKASI.test(x) || x.endsWith(PENANDA));
  });
  if (!balas.length) return { id: c.id, keputusan: "tugaskan" };
  const disebut = new Set<number>();
  for (const m of balas) {
    const x = teks(m);
    for (const s of sales) {
      const nama = s.nama.trim();
      if (nama.length >= 3 && new RegExp(`(^|[^\\p{L}])${escRx(nama)}([^\\p{L}]|$)`, "iu").test(x)) disebut.add(s.id);
    }
  }
  if (disebut.size === 1) return { id: c.id, keputusan: "tugaskan", sales: [...disebut][0], alasan: "sudah_membalas" };
  return { id: c.id, keputusan: "batal", alasan: "sudah_dibalas" };
}

export function teksUmum(u: Umum[]): string {
  const baris = u.slice(0, 25).map((x) => `- ${nomorLokal(x.nomor)} → ${x.pemilik_nama}`);
  return ["Chat baru masuk, mohon langsung dibalas oleh:", ...baris, "Lead dicatat otomatis di Anvil bila calon pembeli."].join("\n");
}

async function kirimTelegram(d: DepsBagi, isi: string): Promise<boolean> {
  if (!d.env.telegramToken || !d.chatSales) return false;
  try {
    const r = await d.fetch(`${d.env.telegramUrl}/bot${d.env.telegramToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: d.chatSales, text: isi, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000),
    });
    await r.text();
    return r.ok;
  } catch {
    return false;
  }
}

export async function bagiProses(d: DepsBagi): Promise<Obj> {
  const t = d.sekarang ? { sekarang: d.sekarang } : {};
  const a = (await d.rpc("x_wa_bagi_ambil", { p: { batas: 5, ...t } })) as {
    aktif: boolean; hari_baru?: number; sales?: Sales[]; items: Calon[]; umum: Umum[];
  };
  if (!a.aktif) return { aktif: false };
  const kep: Obj[] = [];
  for (const c of a.items) {
    const it = { antrean_id: 0, nomor: c.nomor, percakapan: c.percakapan, pesan_pertama_pada: c.masuk_pada } as unknown as ItemAntrean;
    const r = await ambilPesan(d.fetch, d.env, it);
    if (!r.ok) { kep.push({ id: c.id, keputusan: "tunda" }); continue; }
    kep.push(putuskan(c, r.pesan as unknown as Obj[], a.sales ?? [], a.hari_baru ?? 7));
  }
  const h = kep.length ? ((await d.rpc("x_wa_bagi_hasil", { p: { items: kep, ...t } })) as { umum: Umum[] }) : { umum: [] };
  const umum = [...(a.umum ?? []), ...(h.umum ?? [])];
  let terkirim: boolean | null = null;
  if (umum.length) {
    terkirim = await kirimTelegram(d, teksUmum(umum));
    await d.rpc("x_wa_bagi_umum", { p: { ids: umum.map((u) => u.id), ok: terkirim } });
  }
  const hitung: Record<string, number> = {};
  for (const k of kep) {
    const key = `${k.keputusan}${k.alasan ? `:${k.alasan}` : ""}`;
    hitung[key] = (hitung[key] ?? 0) + 1;
  }
  return { aktif: true, dinilai: a.items.length, keputusan: hitung, diumumkan: umum.length, terkirim };
}
