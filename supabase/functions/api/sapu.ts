// SAPU SORE (migrasi 20261111200000_wa_sapu_sore.sql; keputusan Hannes 11 Nov 2026): hari kerja 17.10 WIB, chat pelanggan
// yang masuk di jam kerja (sejak jam_mulai, bawaan 16.00) dan belum dibalas sales diantrekan untuk bot AI. Bot membalas lewat
// alur biasa (wa-proses) dengan konteks "belum sempat dibalas, sekarang di luar jam kerja, info lengkap [HARI]".
// Isi chat hanya dibaca di memori Edge untuk menentukan belum/sudah dibalas; tidak disimpan.
import { type EnvWa, type Fetch, normNomor, PENANDA, POLA_OTOMATIS_APLIKASI, POLA_TES, type Rpc } from "./wa.ts";

type Obj = Record<string, unknown>;

export interface DepsSapu {
  rpc: Rpc;
  fetch: Fetch;
  env: EnvWa;
  sekarang?: string;
  manual?: boolean;   // dijalankan agent (POST /x/wa/sapu-jalan): tidak butuh setelan aktif
}

const teks = (m: Obj): string => {
  const k = (m.kapso ?? {}) as Obj;
  const t = (m.text ?? {}) as Obj;
  const media = (m[String(m.type ?? "")] ?? {}) as Obj;
  for (const v of [t.body, media.caption, k.content]) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};
const arah = (m: Obj) => String(((m.kapso ?? {}) as Obj).direction ?? (m.from ? "inbound" : "outbound"));
const asal = (m: Obj) => String(((m.kapso ?? {}) as Obj).origin ?? "");
const waktu = (m: Obj) => Number(m.timestamp) * 1000;

/** Semua pesan sejak `sejak` (halaman 100, maks 20 halaman) dengan arah/asal/percakapan. */
export async function pesanSejak(f: Fetch, env: EnvWa, sejak: string): Promise<{ ok: boolean; status: number; pesan: Obj[]; terpotong: boolean }> {
  const out: Obj[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ limit: "100", since: sejak, fields: "kapso(direction,origin,content,whatsapp_conversation_id)" });
    if (after) q.set("after", after);
    let d: Obj = {};
    try {
      const r = await f(`${env.kapsoUrl}/meta/whatsapp/v24.0/${encodeURIComponent(env.pnid)}/messages?${q}`,
        { headers: { "X-API-Key": env.kapsoKey, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const t = await r.text();
      if (!r.ok) return { ok: false, status: r.status, pesan: out, terpotong: false };
      d = JSON.parse(t) as Obj;
    } catch {
      return { ok: false, status: 0, pesan: out, terpotong: false };
    }
    const data = (Array.isArray(d.data) ? d.data : []) as Obj[];
    out.push(...data);
    after = (((d.paging ?? {}) as Obj).cursors as Obj | undefined)?.after as string | null ?? null;
    if (!after || !data.length) return { ok: true, status: 200, pesan: out, terpotong: false };
  }
  return { ok: true, status: 200, pesan: out, terpotong: true };
}

const dariSales = (m: Obj) => {
  if (arah(m) !== "outbound" || asal(m) === "cloud_api") return false;
  const x = teks(m);
  return !(POLA_OTOMATIS_APLIKASI.test(x) || x.endsWith(PENANDA));
};
const berisi = (m: Obj) => {
  const j = String(m.type ?? "text");
  return j !== "reaction" && j !== "sticker" && !(j === "text" && POLA_TES.test(teks(m)));
};

/**
 * Chat belum dibalas: per nomor, pesan pelanggan (berisi) sesudah balasan sales terakhir, dengan pesan terakhir di
 * [sejak, sampai) dan tanpa balasan bot sesudahnya. Hasil item antrean (pesan pertama = pesan pertama sesudah balasan sales).
 */
export function belumDibalas(pesan: Obj[], sejak: string, sampai: string): Obj[] {
  const a = Date.parse(sejak), b = Date.parse(sampai);
  const per = new Map<string, Obj[]>();
  for (const m of pesan) {
    if (!Number.isFinite(waktu(m))) continue;
    const n = normNomor(arah(m) === "outbound" ? m.to : m.from);
    if (!n) continue;
    per.set(n, [...(per.get(n) ?? []), m]);
  }
  const out: Obj[] = [];
  for (const [nomor, xs] of per) {
    xs.sort((p, q) => waktu(p) - waktu(q));
    let akhirSales = -Infinity, akhirBot = -Infinity;
    for (const m of xs) {
      if (dariSales(m)) akhirSales = Math.max(akhirSales, waktu(m));
      if (arah(m) === "outbound" && asal(m) === "cloud_api") akhirBot = Math.max(akhirBot, waktu(m));
    }
    const masuk = xs.filter((m) => arah(m) !== "outbound" && berisi(m) && waktu(m) > akhirSales);
    if (!masuk.length) continue;
    const akhir = masuk[masuk.length - 1];
    if (waktu(akhir) < a || waktu(akhir) >= b) continue;
    if (akhirBot > waktu(akhir)) continue;
    const conv = ((akhir.kapso ?? {}) as Obj).whatsapp_conversation_id;
    out.push({
      nomor, percakapan: typeof conv === "string" ? conv : null,
      pesan_pertama_pada: new Date(waktu(masuk[0])).toISOString(), pesan_terakhir_pada: new Date(waktu(akhir)).toISOString(),
      id_pesan_terakhir: typeof akhir.id === "string" ? akhir.id : null,
    });
  }
  return out;
}

export async function sapuProses(d: DepsSapu): Promise<Obj> {
  const t = d.sekarang ? { sekarang: d.sekarang } : {};
  const s = (await d.rpc("x_wa_sapu_mulai", { p: { ...t } })) as { aktif: boolean; saklar: string; sejak: string; sampai: string };
  if (!s.aktif && !d.manual) return { aktif: false };
  if (s.saklar !== "kirim") return { aktif: s.aktif, saklar: s.saklar, catatan: "saklar bot bukan kirim: tidak ada yang diantrekan" };
  const r = await pesanSejak(d.fetch, d.env, s.sejak);
  if (!r.ok) {
    const hasil = { ok: false, kapso: r.status };
    await d.rpc("x_wa_sapu_mulai", { p: { hasil } });
    return hasil;
  }
  const items = belumDibalas(r.pesan, s.sejak, s.sampai);
  let antre: Obj = { antre: 0, lewat: {} };
  for (let i = 0; i < items.length; i += 100) {
    const x = (await d.rpc("x_wa_sapu_antre", { p: { items: items.slice(i, i + 100), ...t } })) as Obj;
    antre = { antre: Number(antre.antre) + Number(x.antre ?? 0), lewat: { ...(antre.lewat as Obj), ...(x.lewat as Obj) } };
  }
  const hasil = { ok: true, pesan: r.pesan.length, terpotong: r.terpotong, belum_dibalas: items.length, ...antre };
  await d.rpc("x_wa_sapu_mulai", { p: { hasil } });
  return hasil;
}
