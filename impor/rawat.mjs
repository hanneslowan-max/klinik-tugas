#!/usr/bin/env node
// impor/rawat.mjs — perawatan lampiran: panggil Edge POST /x/rawat/lampiran (dipakai .github/workflows/rawat.yml).
// Menghapus BERKAS lampiran app pada kartu yang sudah selesai > N hari (setelan app_settings.rawat_lampiran.hari,
// default 7). Hanya lampiran buatan app; salinan ClickUp dibiarkan. Node >= 20.
//
//   node impor/rawat.mjs            → jalankan perawatan (hapus berkas kedaluwarsa)
//   node impor/rawat.mjs --dry      → hanya laporkan jumlah kandidat, tanpa menghapus
//   node impor/rawat.mjs --hari 14  → paksa ambang 14 hari (abaikan setelan)
//
// Env: TUGAS_API_URL (…/functions/v1/api/v2 atau …/functions/v1/api), TUGAS_IMPORT_TOKEN (token app scope 'impor',
//   milik owner/bot). stdout = ringkasan ANGKA saja. Kode keluar: 0 sukses, 1 gagal (token/jaringan/galat server).

import { pathToFileURL } from "node:url";
import { turunkanX } from "./sinkron.mjs";

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function argumen(argv) {
  const o = { dry: false, hari: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry") o.dry = true;
    else if (argv[i] === "--hari") o.hari = Number.parseInt(argv[++i], 10);
    else throw new Error(`argumen tidak dikenal: ${argv[i]}`);
  }
  if (o.hari !== undefined && !Number.isFinite(o.hari)) throw new Error("--hari harus angka");
  return o;
}

async function minta(url, token, init = {}) {
  for (let coba = 1; ; coba++) {
    const res = await fetch(url, {
      ...init, headers: { Authorization: token, "content-type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(300_000),
    });
    if (res.status === 429 && coba < 10) {
      await res.arrayBuffer().catch(() => {});
      const ra = Number(res.headers.get("retry-after"));
      await tidur((ra > 0 ? Math.min(ra, 30) * 1000 : 1000) + 250);
      continue;
    }
    if (res.status >= 502 && res.status <= 504 && coba < 4) {
      await res.arrayBuffer().catch(() => {});
      await tidur(2000 * coba);
      continue;
    }
    return res;
  }
}

export async function rawat({ x, token, dry = false, hari }) {
  const body = {};
  if (dry) body.dry = true;
  if (hari !== undefined) body.hari = hari;
  const res = await minta(`${x}/rawat/lampiran`, token, { method: "POST", body: JSON.stringify(body) });
  const buf = Buffer.from(await res.arrayBuffer());
  let data = null;
  try { data = buf.length ? JSON.parse(buf.toString("utf8")) : null; } catch { /* bukan JSON */ }
  if (!res.ok) {
    const err = data ? `${data.err ?? ""} ${data.ECODE ?? ""}`.trim() : buf.toString("utf8").slice(0, 120);
    throw new Error(`/x/rawat/lampiran HTTP ${res.status}: ${err}`);
  }
  return data ?? {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let kode = 0;
  try {
    const o = argumen(process.argv.slice(2));
    const token = (process.env.TUGAS_IMPORT_TOKEN || "").trim();
    if (!token) throw new Error("TUGAS_IMPORT_TOKEN kosong");
    const x = turunkanX(process.env.TUGAS_API_URL);
    const h = await rawat({ x, token, dry: o.dry, hari: o.hari });
    console.log(JSON.stringify({ aksi: "rawat-lampiran", dry: o.dry, ...h }, null, 2));
    if (h.berkas_gagal) kode = 2;
  } catch (e) {
    console.error(`rawat: GAGAL -> ${e.message}`);
    kode = 1;
  }
  process.exit(kode);
}
