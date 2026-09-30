// Pembantu uji kontrak: konfigurasi stack lokal, HTTP, login, RPC web, jalankan CLI, pencatat cek.
// Tanpa dependensi (Node >= 20). Data uji HANYA sintetis dan berawalan "uji-b1".

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const CLI = path.join(ROOT, "cli", "tugas.mjs");

// ---------------------------------------------------------------- konfigurasi
function statusEnv() {
  const kandidat = [process.env.SUPABASE_CLI, "/tmp/sbcli/node_modules/.bin/supabase"].filter(Boolean);
  for (const bin of kandidat) {
    if (!fs.existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ["status", "-o", "env"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const env = {};
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
        if (m) env[m[1]] = m[2];
      }
      return env;
    } catch { /* coba kandidat berikut */ }
  }
  return {};
}

// Alamat edge runtime langsung (tanpa Kong). Kong lokal menjawab CORS sendiri (ACAO "*"), padahal di cloud
// fungsi yang menjawab; jadi uji CORS diarahkan ke runtime: http://<ip kontainer>:8081/api.
function edgeLangsung() {
  try {
    const proj = (fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m) || [])[1];
    const ip = execFileSync("docker", ["inspect", `supabase_edge_runtime_${proj}`, "--format",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/)[0];
    return ip ? `http://${ip}:8081/api` : "";
  } catch {
    return "";
  }
}

export function konfigurasi() {
  const perlu = !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY;
  const st = perlu ? statusEnv() : {};
  const url = (process.env.SUPABASE_URL || st.API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
  const cfg = {
    url,
    anon: process.env.SUPABASE_ANON_KEY || st.ANON_KEY || "",
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || st.SERVICE_ROLE_KEY || "",
    api: (process.env.TUGAS_API_URL || `${url}/functions/v1/api/v2`).replace(/\/+$/, ""),
    password: process.env.UJI_PASSWORD || "rahasia-dev-123", // password akun seed dev lokal (bukan rahasia)
    asli: process.env.CLICKUP_MJS_ASLI || "/home/user/rhj-brain/tools/clickup.mjs",
  };
  cfg.fnBase = cfg.api.replace(/\/v2$/, "");
  cfg.edgeLangsung = process.env.UJI_EDGE_LANGSUNG || edgeLangsung();
  if (!cfg.anon || !cfg.service) throw new Error("Kunci lokal tidak ditemukan: set SUPABASE_ANON_KEY & SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_CLI");
  return cfg;
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
    if (s.length > 600) s = s.slice(0, 600) + "…";
    console.log(`  GAGAL ${nama}${s ? `  ← ${s}` : ""}`);
  }
  return !!kondisi;
}
// Banding struktural: urutan kunci objek diabaikan (jsonb mengurutkan ulang), urutan array dipertahankan.
// Urutan kunci yang penting (output CLI) dicek terpisah lewat Object.keys(...) atau teks stdout.
function kanonik(x) {
  if (Array.isArray(x)) return x.map(kanonik);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, kanonik(x[k])]));
  return x;
}
export const sama = (nama, a, b) =>
  cek(nama, JSON.stringify(kanonik(a)) === JSON.stringify(kanonik(b)), { dapat: a, harap: b });
export const kunci = (o) => (o && typeof o === "object" ? Object.keys(o).sort() : null);
export function kunciSama(nama, o, harap) {
  return sama(nama, kunci(o), [...harap].sort());
}

// ---------------------------------------------------------------- HTTP
export async function http(method, url, { headers = {}, body, raw = false, redirect = "follow" } = {}) {
  const res = await fetch(url, {
    method, redirect,
    headers: { ...(body !== undefined && !raw ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = buf.length ? JSON.parse(buf.toString("utf8")) : null; } catch { /* bukan JSON */ }
  return { status: res.status, headers: res.headers, json, buf, text: buf.toString("utf8") };
}

export async function login(cfg, email, password = cfg.password) {
  const r = await http("POST", `${cfg.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: cfg.anon }, body: { email, password },
  });
  if (r.status !== 200 || !r.json?.access_token) throw new Error(`login ${email} gagal: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  return r.json.access_token;
}

// Panggil fungsi web_* sebagai user (JWT). Galat → throw dengan {status, code, hint}.
export async function rpcWeb(cfg, jwt, fn, args = {}) {
  const r = await http("POST", `${cfg.url}/rest/v1/rpc/${fn}`, {
    headers: { apikey: cfg.anon, Authorization: `Bearer ${jwt}` }, body: args,
  });
  if (r.status >= 300) {
    const e = new Error(`${fn}: HTTP ${r.status} ${r.json?.message ?? r.text.slice(0, 200)}`);
    Object.assign(e, { status: r.status, hint: r.json?.hint, code: r.json?.code });
    throw e;
  }
  return r.json;
}

export async function pilihWeb(cfg, jwt, tabel, query) {
  const r = await http("GET", `${cfg.url}/rest/v1/${tabel}?${query}`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${jwt}` } });
  if (r.status !== 200) throw new Error(`select ${tabel}: HTTP ${r.status} ${r.text.slice(0, 200)}`);
  return r.json;
}

export const svcHeaders = (cfg) => ({ apikey: cfg.service, Authorization: `Bearer ${cfg.service}` });

// Panggil Edge API langsung (bukan lewat CLI).
export function apiEdge(cfg, token) {
  return (method, p, opsi = {}) =>
    http(method, `${cfg.fnBase}${p}`, { ...opsi, headers: { ...(token ? { Authorization: token } : {}), ...(opsi.headers || {}) } });
}

// ---------------------------------------------------------------- CLI
const ENV_BERSIH = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(TUGAS_|CLICKUP_)/.test(k)),
);

export function jalankan(file, args, env = {}, { cwd = ROOT, timeout = 180_000 } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [file, ...args], { env: { ...ENV_BERSIH, ...env }, cwd, timeout, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 99) : 0;
        let json = null;
        try { json = stdout.trim() ? JSON.parse(stdout) : null; } catch { /* bukan JSON */ }
        resolve({ code, stdout, stderr, json });
      });
  });
}

// CLI mode tugas dengan token tertentu.
export const tugas = (cfg, token, args, envTambah = {}) =>
  jalankan(CLI, args, { TUGAS_API_URL: cfg.api, TUGAS_API_TOKEN: token, ...envTambah });

// ---------------------------------------------------------------- tanggal WIB (rumus sama dengan CLI)
export const wibDate = (ms) => new Date(Number(ms) + 7 * 3600e3).toISOString().slice(0, 10);
export const toMs = (d) => new Date(`${d}T12:00:00+07:00`).getTime();
export function geserHari(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
