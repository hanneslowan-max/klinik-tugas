// Penjaga target uji: suite uji (uji/kontrak, uji/banding.mjs, impor/uji, uji/db, uji/web) HANYA boleh menembak stack
// Supabase LOKAL. Env cloud (mis. environment "Marketing") berisi TUGAS_API_URL PRODUKSI; 21 Okt 2026 suite kontrak
// sempat mengirim ±200 request ke sana (semua 401, tanpa data tertulis). Dicek SEBELUM request apa pun.
//   Lokal = host 127.0.0.1 / localhost / ::1 (DB: juga soket unix). Lainnya → exit 3, kecuali --izinkan-remote atau
//   UJI_IZINKAN_REMOTE=1. Project produksi (REF_PRODUKSI) SELALU ditolak, juga dengan izin itu.
//   Dari skrip shell:  DB_URL="$DB_URL" node uji/penjaga.mjs --suite "bash uji/db/jalankan.sh" --db DB_URL [--izinkan-remote]
//   (nilai dibaca dari env bernama itu, bukan dari argumen, supaya password DB tidak tampil di daftar proses).
// Pesan hanya menampilkan HOST, tidak pernah URL utuh (DB_URL memuat password).

import path from "node:path";
import { fileURLToPath } from "node:url";

export const REF_PRODUKSI = ["admhlyurfvodfyedgaio"]; // project "RHJ ClickUp" (docs/STATUS.md, sesi deploy 30 Sep)
export const KODE_TOLAK = 3;
const HOST_LOKAL = new Set(["127.0.0.1", "localhost", "::1"]);
// Alamat edge runtime langsung = IP kontainer Docker lokal (lihat uji/kontrak/_lib.mjs edgeLangsung): IPv4 privat.
const IP_PRIVAT = /^(10\.\d+|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+$/;

export const izinRemote = (argv = process.argv.slice(2), env = process.env) =>
  argv.includes("--izinkan-remote") || env.UJI_IZINKAN_REMOTE === "1";

// Host URL http(s), huruf kecil, tanpa kurung IPv6. null = bukan URL http(s) yang sah.
export function hostHttp(nilai) {
  try {
    const u = new URL(String(nilai));
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^\[|\]$/g, "") : null;
  } catch {
    return null;
  }
}

// Host tujuan psql/libpq untuk DB_URL: URI postgres(ql)://… atau "host=… dbname=…"; selain itu = nama DB saja.
// [] = soket unix bawaan; null = tidak bisa dipastikan (service=/PGSERVICE tanpa host) → diperlakukan non-lokal.
export function hostDb(nilai, env = process.env) {
  const s = String(nilai).trim();
  const host = [];
  let service = false;
  const uri = s.match(/^postgres(?:ql)?:\/\/([^/?#]*)[^?#]*(?:\?([^#]*))?/i);
  if (uri) {
    const auth = uri[1].slice(uri[1].lastIndexOf("@") + 1);
    for (const h of auth.split(",")) {
      const tanpaPort = h.startsWith("[") ? h.slice(1, h.indexOf("]")) : h.replace(/:[^:]*$/, "");
      if (tanpaPort) host.push(decodeURIComponent(tanpaPort));
    }
    for (const [k, v] of new URLSearchParams(uri[2] || "")) {
      if (k === "host" || k === "hostaddr") host.push(...v.split(",").filter(Boolean));
      if (k === "service") service = true;
    }
  } else if (s.includes("=")) {
    for (const [, k, v] of s.matchAll(/(\w+)\s*=\s*('(?:[^'\\]|\\.)*'|\S*)/g)) {
      const isi = v.startsWith("'") ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v;
      if (k === "host" || k === "hostaddr") host.push(...isi.split(",").filter(Boolean));
      if (k === "service") service = true;
    }
  }
  if (host.length) return host.map((h) => h.toLowerCase());
  if (env.PGHOST || env.PGHOSTADDR) return [env.PGHOST, env.PGHOSTADDR].filter(Boolean).flatMap((h) => h.split(","));
  return service || env.PGSERVICE ? null : [];
}

const lokal = (h, jenis) =>
  HOST_LOKAL.has(h) || (jenis === "db" && /^[/@]/.test(h)) || (jenis === "edge" && IP_PRIVAT.test(h));

// targets: [{ nama, nilai, jenis: "http" | "db" | "edge", env? }]; nilai kosong = tidak dipakai → dilewati.
// env = nama variabel env asal nilai (untuk saran `env -u …`).
export function periksa(targets, { izin = izinRemote(), env = process.env } = {}) {
  const tolak = [], remote = [], buangEnv = new Set();
  for (const t of targets) {
    if (t.nilai === undefined || t.nilai === null || t.nilai === "") continue;
    const ref = REF_PRODUKSI.find((r) => String(t.nilai).toLowerCase().includes(r));
    if (ref) {
      tolak.push({ teks: `${t.nama} → project PRODUKSI ${ref} (selalu ditolak, juga dengan --izinkan-remote)`, mutlak: true });
      if (t.env) buangEnv.add(t.env);
      continue;
    }
    const host = t.jenis === "db" ? hostDb(t.nilai, env) : [hostHttp(t.nilai)];
    const bukan = host === null ? ["(tidak bisa dipastikan: service/PGSERVICE)"]
      : host.filter((h) => h === null || !lokal(h, t.jenis)).map((h) => h ?? "(bukan URL http/https)");
    if (!bukan.length) continue;
    const teks = `${t.nama} → host ${bukan.join(", ")}`;
    if (izin) remote.push(teks);
    else {
      tolak.push({ teks, mutlak: false });
      if (t.env) buangEnv.add(t.env);
    }
  }
  return { tolak, remote, buangEnv: [...buangEnv] };
}

// Tolak (exit 3, atau throw bila lempar) sebelum request apa pun bila ada target non-lokal tanpa izin.
// perintah = cara menjalankan suite (untuk pesan dan saran); argumen=false bila suite tak menerima --izinkan-remote.
export function jagaLokal(perintah, targets, { lempar = false, argumen = true, izin = izinRemote(), env = process.env } = {}) {
  const { tolak, remote, buangEnv } = periksa(targets, { izin, env });
  if (tolak.length) {
    const baris = [
      `${perintah}: DIHENTIKAN sebelum request apa pun — target uji bukan stack Supabase lokal.`,
      ...tolak.map((t) => `  - ${t.teks}`),
      "Uji hanya boleh ke 127.0.0.1/localhost (supabase start + supabase functions serve). Env sesi cloud bisa berisi URL PRODUKSI.",
    ];
    if (buangEnv.length) baris.push(`Jalankan ke lokal: env ${buangEnv.map((e) => `-u ${e}`).join(" ")} ${perintah}`);
    if (tolak.some((t) => !t.mutlak)) {
      baris.push(`Sengaja ke remote NON-produksi: ${argumen ? "tambahkan --izinkan-remote atau " : ""}UJI_IZINKAN_REMOTE=1.`);
    }
    const pesan = baris.join("\n");
    if (lempar) throw new Error(pesan);
    console.error(pesan);
    process.exit(KODE_TOLAK);
  }
  if (remote.length) console.error(`${perintah}: PERINGATAN — izin remote aktif, target non-lokal:\n${remote.map((r) => `  - ${r}`).join("\n")}`);
}

// ---------------------------------------------------------------- CLI (untuk skrip shell)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let perintah = "uji";
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") perintah = argv[++i];
    else if (a === "--db" || a === "--http") {
      const nama = argv[++i];
      targets.push({ nama, nilai: process.env[nama], jenis: a.slice(2), env: nama });
    } else if (a !== "--izinkan-remote") {
      console.error(`penjaga: argumen tidak dikenal ${a}`);
      process.exit(2);
    }
  }
  jagaLokal(perintah, targets);
}
