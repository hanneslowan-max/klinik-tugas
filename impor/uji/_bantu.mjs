// Pembantu uji B2 (importer + banding): konfigurasi stack lokal, login seed, token uji, psql baca, spawn node.
// Data uji HANYA sintetis. Token uji bernama "uji-b2 …" dan dibersihkan sendiri (cabut + hapus baris).

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jagaLokal } from "../../uji/penjaga.mjs";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const SINKRON = path.join(ROOT, "impor", "sinkron.mjs");
export const DB_URL = process.env.UJI_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const MOCK_PORT = Number(process.env.MOCK_PORT || 54399); // tetap → URL lampiran di DB stabil antar-run
export const OWNER_EMAIL = "budi.uji@contoh.test"; // akun seed dev lokal (bukan rahasia)
export const PASSWORD_SEED = process.env.UJI_PASSWORD || "rahasia-dev-123";
export const BOT_ID = 900000000002; // 'claude (agent)' seed

function statusEnv() {
  for (const bin of [process.env.SUPABASE_CLI, "/tmp/sbcli/node_modules/.bin/supabase"].filter(Boolean)) {
    if (!fs.existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ["status", "-o", "env"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const env = {};
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
        if (m) env[m[1]] = m[2];
      }
      return env;
    } catch { /* coba berikut */ }
  }
  return {};
}

export function konfigurasi() {
  const st = process.env.SUPABASE_ANON_KEY ? {} : statusEnv();
  const url = (process.env.SUPABASE_URL || st.API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
  const cfg = {
    url, anon: process.env.SUPABASE_ANON_KEY || st.ANON_KEY || "",
    api: (process.env.TUGAS_API_URL || `${url}/functions/v1/api/v2`).replace(/\/+$/, ""),
  };
  // Penjaga: target harus lokal SEBELUM request apa pun (uji/penjaga.mjs; --izinkan-remote untuk sengaja remote).
  jagaLokal(`node ${path.relative(ROOT, process.argv[1] || "")}`, [
    { nama: "SUPABASE_URL", nilai: cfg.url, env: "SUPABASE_URL" },
    { nama: "TUGAS_API_URL", nilai: cfg.api, env: "TUGAS_API_URL" },
    { nama: "UJI_DB_URL", nilai: DB_URL, jenis: "db", env: "UJI_DB_URL" },
  ]);
  if (!cfg.anon) throw new Error("Kunci anon lokal tidak ditemukan (supabase status)");
  return cfg;
}

export async function edgeSiap(cfg) {
  try {
    const r = await fetch(`${cfg.api}/user`);
    return r.status === 401;
  } catch {
    return false;
  }
}

export async function login(cfg, email = OWNER_EMAIL, password = PASSWORD_SEED) {
  const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: cfg.anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error(`login ${email} gagal: HTTP ${r.status}`);
  return j.access_token;
}

export async function rpcWeb(cfg, jwt, fn, args = {}) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: cfg.anon, Authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${j?.message ?? ""}`);
  return j;
}

// psql baca (-At, JSON per baris bila perlu). Tulis langsung HANYA untuk membersihkan baris token uji sendiri.
export function psql(sql) {
  return execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql], { encoding: "utf8" }).trim();
}
export function psqlJson(sql) {
  const out = psql(`select coalesce(json_agg(x), '[]'::json) from (${sql}) x`);
  return JSON.parse(out || "[]");
}

export class Token {
  constructor(cfg, label) {
    this.cfg = cfg;
    this.label = `uji-b2 ${label} ${Date.now().toString(36)}`;
    this.dibuat = [];
  }
  async buat(member, scope, nama) {
    this.jwt ??= await login(this.cfg);
    const r = await rpcWeb(this.cfg, this.jwt, "web_admin_token_buat", { p_member: member, p_nama: `${this.label} ${nama}`, p_scope: scope });
    this.dibuat.push(r.id);
    return r.token;
  }
  async bersihkan() {
    if (!this.dibuat.length) return 0;
    this.jwt ??= await login(this.cfg);
    for (const id of this.dibuat) await rpcWeb(this.cfg, this.jwt, "web_admin_token_cabut", { p_id: id }).catch(() => {});
    // Tidak ada fungsi hapus token; baris uji yang sudah dicabut dihapus supaya tes DB bersama (hitungan global) tak terganggu.
    const ids = this.dibuat.map((x) => `'${String(x).replace(/'/g, "")}'`).join(",");
    const n = psql(`with d as (delete from public.api_tokens where id in (${ids}) and nama like 'uji-b2 %' and revoked_at is not null returning 1) select count(*) from d`);
    this.dibuat = [];
    return Number(n);
  }
}

const ENV_BERSIH = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(TUGAS_|CLICKUP_|SINKRON_|BEKU_)/.test(k)));

export function jalankanNode(args, env = {}, { cwd = ROOT, timeout = 900_000 } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env: { ...ENV_BERSIH, ...env }, cwd, timeout, maxBuffer: 256 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 99) : 0;
        let json = null;
        try { json = stdout.trim() ? JSON.parse(stdout) : null; } catch { /* bukan JSON */ }
        resolve({ code, stdout, stderr, json });
      });
  });
}

// ---------------------------------------------------------------- pencatat cek
export const hasil = { lulus: 0, gagal: [], bagian: "" };
export function bagian(nama) {
  hasil.bagian = nama;
  console.log(`\n== ${nama}`);
}
export function cek(nama, kondisi, info) {
  if (kondisi) {
    hasil.lulus++;
    if (process.env.UJI_VERBOSE) console.log(`  ok   ${nama}`);
  } else {
    hasil.gagal.push(`${hasil.bagian} › ${nama}`);
    let s = info === undefined ? "" : typeof info === "string" ? info : JSON.stringify(info);
    if (s.length > 800) s = s.slice(0, 800) + "…";
    console.log(`  GAGAL ${nama}${s ? `  ← ${s}` : ""}`);
  }
  return !!kondisi;
}
