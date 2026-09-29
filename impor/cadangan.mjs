#!/usr/bin/env node
// impor/cadangan.mjs — backup data aplikasi Tugas lewat Edge (dipakai .github/workflows/backup.yml). Node >= 20.
//
//   node impor/cadangan.mjs ekspor   --keluar <dir>                    → <dir>/ekspor-<tanggal WIB>.json (byte mentah /x/export)
//   node impor/cadangan.mjs lampiran --ekspor <file.json> --keluar <dir> → <dir>/<storage_path> tiap lampiran status_salin=ok
//
// Env: TUGAS_API_URL (…/functions/v1/api/v2 atau …/functions/v1/api), TUGAS_EXPORT_TOKEN (token app).
//   Catatan kontrak: /x/export saat ini butuh scope 'impor' (Edge + DB x_export); /x/file cukup 'baca'.
// stdout = ringkasan ANGKA saja (tanpa isi data). Enkripsi (age) dikerjakan workflow; berkas mentah jangan di-commit.
// Kode keluar: 0 sukses, 1 gagal (ekspor tidak lengkap / token / jaringan), 2 sebagian lampiran gagal.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { turunkanX } from "./sinkron.mjs";

const KUNCI_WAJIB = ["meta", "workspace", "members", "spaces", "folders", "lists", "list_statuses", "tasks", "task_assignees",
  "comments", "comment_mentions", "attachments", "activity", "app_settings"];
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

function argumen(argv) {
  const o = { aksi: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--keluar") o.keluar = argv[++i];
    else if (argv[i] === "--ekspor") o.ekspor = argv[++i];
    else throw new Error(`argumen tidak dikenal: ${argv[i]}`);
  }
  if (!["ekspor", "lampiran"].includes(o.aksi)) throw new Error("aksi harus ekspor atau lampiran");
  if (!o.keluar) throw new Error("--keluar <dir> wajib");
  if (o.aksi === "lampiran" && !o.ekspor) throw new Error("--ekspor <file.json> wajib untuk aksi lampiran");
  return o;
}

async function minta(url, token, init = {}) {
  for (let coba = 1; ; coba++) {
    const res = await fetch(url, { ...init, headers: { Authorization: token, ...(init.headers || {}) }, signal: AbortSignal.timeout(300_000) });
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

export async function ekspor({ x, token, keluar }) {
  const res = await minta(`${x}/export`, token);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    let err = "";
    try { const j = JSON.parse(buf.toString("utf8")); err = `${j.err ?? ""} ${j.ECODE ?? ""}`; } catch { err = buf.toString("utf8").slice(0, 120); }
    throw new Error(`/x/export HTTP ${res.status}: ${err.trim()}`);
  }
  const data = JSON.parse(buf.toString("utf8"));
  const kurang = KUNCI_WAJIB.filter((k) => !(k in data));
  if (kurang.length) throw new Error(`ekspor tidak lengkap, kunci hilang: ${kurang.join(",")}`);
  if ((data.api_tokens || []).some((t) => t && "token_hash" in t)) throw new Error("ekspor memuat token_hash (tidak boleh)");
  fs.mkdirSync(keluar, { recursive: true });
  const tgl = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const f = path.join(keluar, `ekspor-${tgl}.json`);
  fs.writeFileSync(f, buf, { mode: 0o600 });
  const hitungan = Object.fromEntries(Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  return { berkas: f, byte: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex"), hitungan };
}

export async function lampiran({ x, token, eksporFile, keluar }) {
  const data = JSON.parse(fs.readFileSync(eksporFile, "utf8"));
  const daftar = (data.attachments || []).filter((a) => a.storage_path && !a.deleted_at && a.status_salin === "ok");
  const r = { total: daftar.length, ok: 0, gagal: 0, byte: 0, galat: [] };
  for (const a of daftar) {
    try {
      const rel = path.normalize(a.storage_path);
      if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("storage_path tidak aman");
      const res = await minta(`${x}/file/${encodeURIComponent(a.id)}`, token, { redirect: "manual" });
      const lokasi = res.headers.get("location");
      await res.arrayBuffer().catch(() => {});
      if (res.status !== 302 || !lokasi) throw new Error(`/x/file HTTP ${res.status}`);
      const unduh = await fetch(lokasi, { signal: AbortSignal.timeout(300_000) }); // signed URL: tanpa header auth
      if (!unduh.ok) throw new Error(`unduh HTTP ${unduh.status}`);
      const buf = Buffer.from(await unduh.arrayBuffer());
      const f = path.join(keluar, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf, { mode: 0o600 });
      r.ok++;
      r.byte += buf.length;
    } catch (e) {
      r.gagal++;
      r.galat.push({ id: a.id, err: String(e.message).slice(0, 160) });
    }
  }
  return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let kode = 0;
  try {
    const o = argumen(process.argv.slice(2));
    const token = (process.env.TUGAS_EXPORT_TOKEN || "").trim();
    if (!token) throw new Error("TUGAS_EXPORT_TOKEN kosong");
    const x = turunkanX(process.env.TUGAS_API_URL);
    if (o.aksi === "ekspor") {
      const h = await ekspor({ x, token, keluar: o.keluar });
      console.log(JSON.stringify({ aksi: "ekspor", ...h }, null, 2));
    } else {
      const h = await lampiran({ x, token, eksporFile: o.ekspor, keluar: o.keluar });
      console.log(JSON.stringify({ aksi: "lampiran", ...h, galat: h.galat.slice(0, 20) }, null, 2));
      if (h.gagal) kode = 2;
    }
  } catch (e) {
    console.error(`cadangan: GAGAL -> ${e.message}`);
    kode = 1;
  }
  process.exit(kode);
}
