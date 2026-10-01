#!/usr/bin/env node
// Deploy web/ (Next.js) ke Hostinger Business (Node.js Web Apps) lewat API resmi Hostinger
// (https://developers.hostinger.com). Pengganti integrasi Git hPanel, yang terkunci saat akun hosting dikelola
// sebagai klien ("Deployment Git dinonaktifkan saat mengelola klien").
//
//   node alat/hostinger.mjs cek
//       BACA-SAJA (hanya GET, ditegakkan di fungsi `api`): situs yang terlihat token, lalu kondisi
//       tugas.palletmeshindonesia.com: jenis situs, isi document root, SSL, riwayat build Node.js, izin token.
//   node alat/hostinger.mjs deploy
//       1. arsip SUMBER web/ dari commit HEAD (+ .env.production berisi nilai NEXT_PUBLIC_* yang memang publik)
//       2. unggah ke document root situs (TUS)   3. deteksi pengaturan build dari arsip
//       4. build Node.js di Hostinger (npm run build, Node 22). Situs baru berganti HANYA bila build sukses;
//          build gagal = situs tetap versi lama.
//       5. tampilkan log build sampai selesai   6. ganti arsip sumber di server dengan zip kosong
//       7. tunggu situs menyajikan commit ini (<meta name="rhj-versi">) & pastikan file sumber tidak bisa diunduh
//
// Lingkungan:
//   HOSTINGER_API_TOKEN                    wajib. hPanel → Profil → API. Hanya lewat GitHub Secrets; tidak dicetak.
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   wajib untuk deploy: publishable key project produksi (publik).
//   IZINKAN_TIMPA_SITUS_LAMA=ya            hanya untuk deploy PERTAMA, saat situs tujuan belum pernah jadi app
//                                          Node.js (isinya ditimpa permanen). Diisi dari centang manual di workflow.
//
// Pengaman:
//   - Domain dikunci ke DOMAIN_SAH; semua jalur API dibentuk dari konstanta itu, jadi situs lain di akun yang sama
//     (palletmeshindonesia.com, ERP admin.palletmeshindonesia.com) tidak bisa tersentuh.
//   - Kunci Supabase harus publishable/anon (ikut terkirim ke browser); secret/service_role ditolak. URL Supabase
//     dan URL aplikasi dikunci ke produksi.
//   - Tidak ada panggilan hapus situs/berkas. Satu-satunya aksi yang menimpa situs adalah build (langkah 4); selain
//     itu deploy hanya mengunggah ke document root, membersihkan cache, dan memasang SSL bila hilang.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DOMAIN_SAH = "tugas.palletmeshindonesia.com";
export const REF_SAH = "admhlyurfvodfyedgaio";
export const NAMA_ARSIP = "rhj-web.zip";
const NODE_VERSI = 22;
const BATAS_ARSIP = 50 * 1024 * 1024; // batas Hostinger untuk arsip sumber Node.js
/** Zip kosong (hanya end-of-central-directory): pengganti arsip sumber di document root setelah build. */
export const ZIP_KOSONG = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);

const ENV = process.env;
const AKAR = fileURLToPath(new URL("..", import.meta.url));

/** Penimpaan alamat hanya untuk tes (server tiruan di 127.0.0.1); token tidak pernah dikirim ke tempat lain. */
function alamat(nama, bawaan) {
  const v = ENV[nama];
  if (!v) return bawaan;
  if (!/^http:\/\/127\.0\.0\.1:\d+(\/[\w/-]*)?$/.test(v)) throw new Galat(`${nama} hanya boleh http://127.0.0.1:<port> (tes)`, 2);
  return v.replace(/\/$/, "");
}

export class Galat extends Error {
  constructor(pesan, kode = 1) {
    super(pesan);
    this.kode = kode;
  }
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── fungsi murni (dites di alat/hostinger.test.mjs) ─────────────────────────────

/** Kunci Supabase yang aman masuk bundel publik: publishable (sb_publishable_…) atau JWT lama ber-role anon. */
export function periksaKunciPublik(kunci) {
  const k = (kunci ?? "").trim();
  if (!k) {
    throw new Galat(
      "Publishable key Supabase kosong. Isi GitHub → Settings → Secrets and variables → Actions → Variables: SUPABASE_PUBLISHABLE_KEY.",
      2,
    );
  }
  if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Galat("Publishable key Supabase berisi karakter tidak sah.", 2);
  if (k.startsWith("sb_publishable_")) return k;
  if (k.startsWith("sb_secret_")) {
    throw new Galat("TOLAK: itu SECRET key Supabase. Nilai ini ikut terkirim ke browser; pakai publishable key (sb_publishable_…).", 2);
  }
  const bagian = k.split(".");
  if (bagian.length === 3) {
    let peran;
    try {
      peran = JSON.parse(Buffer.from(bagian[1], "base64url").toString("utf8")).role;
    } catch {
      peran = undefined;
    }
    if (peran === "anon") return k;
    if (peran) throw new Galat(`TOLAK: JWT Supabase ber-role "${peran}", bukan anon. Pakai publishable key.`, 2);
  }
  throw new Galat("Publishable key Supabase tidak dikenali (harus sb_publishable_…).", 2);
}

/** Isi .env.production yang disisipkan ke arsip (nilai NEXT_PUBLIC_* di-inline saat build). */
export function isiEnvProduksi({ kunci, versi }) {
  if (!/^[0-9a-f]{7,40}$/.test(versi ?? "")) throw new Galat(`versi commit tidak sah: ${versi}`, 2);
  const nilai = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF_SAH}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: periksaKunciPublik(kunci),
    NEXT_PUBLIC_APP_BASE_URL: `https://${DOMAIN_SAH}`,
    NEXT_PUBLIC_VERSI: versi,
  };
  return Object.entries(nilai)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
    .concat("\n");
}

/** Situs persis DOMAIN_SAH dari hasil GET /websites (filter domain di API adalah substring). */
export function pilihSitus(daftar) {
  const cocok = (daftar ?? []).filter((w) => (w.domain ?? "").toLowerCase() === DOMAIN_SAH);
  if (cocok.length === 0) {
    throw new Galat(
      `Situs ${DOMAIN_SAH} tidak terlihat oleh token ini. Token harus dibuat dari akun hPanel yang punya akses ke akun hosting klien.`,
    );
  }
  if (cocok.length > 1) throw new Galat(`Situs ${DOMAIN_SAH} muncul ${cocok.length} kali; hentikan, cek manual di hPanel.`);
  if (!cocok[0].username) throw new Galat(`Situs ${DOMAIN_SAH} tidak punya username hosting (bukan situs CloudLinux?).`);
  return cocok[0];
}

/** Sudah pernah menjadi app Node.js → build berikutnya hanya mengganti versi app, tidak menimpa situs jenis lain. */
export function sudahNode(situs, builds) {
  return situs.website_type === "nodejs" || (builds ?? []).some((b) => b.state === "completed");
}

/** Badan POST /nodejs/builds: hasil deteksi Hostinger, dengan nilai yang dikunci untuk web ini. */
export function badanBuild(deteksi) {
  if (!deteksi?.available_scripts?.includes("build")) {
    throw new Galat(`package.json di arsip tidak punya script "build" (deteksi: ${JSON.stringify(deteksi)})`);
  }
  return {
    node_version: NODE_VERSI,
    app_type: "next",
    root_directory: deteksi.root_directory ?? null,
    output_directory: deteksi.output_directory ?? ".next",
    build_script: "build",
    entry_file: deteksi.entry_file ?? null,
    package_manager: "npm",
    source_type: "archive",
    source_options: { archive_path: NAMA_ARSIP },
  };
}

/** Baris log baru (API log build memberi potongan mulai `from_line`). */
export function pecahBaris(teks) {
  if (!teks) return [];
  const baris = teks.split(/\r?\n/);
  if (baris.at(-1) === "") baris.pop();
  return baris;
}

/** Versi yang disajikan situs (dari <meta name="rhj-versi" content="…">). */
export function versiDiHtml(html) {
  return html.match(/<meta\s+name="rhj-versi"\s+content="([^"]*)"/)?.[1] ?? null;
}

// ───────────────────────────────────────────── API Hostinger ─────────────────────────────────────────────

let MODE = "cek";
let API = "https://developers.hostinger.com";
let URL_SITUS = `https://${DOMAIN_SAH}`;
const JEDA_MS = Number(ENV.HOSTINGER_JEDA_MS ?? 10_000);
const BATAS_BUILD_MS = Number(ENV.HOSTINGER_BATAS_BUILD_MS ?? 25 * 60_000);
const BATAS_SITUS_MS = Number(ENV.HOSTINGER_BATAS_SITUS_MS ?? 5 * 60_000);

class GalatApi extends Galat {
  constructor(status, pesan) {
    super(pesan);
    this.status = status;
  }
}

/**
 * Panggil API Hostinger. Mode `cek` hanya boleh GET. GET & panggilan `ulang:true` diulang saat 429/5xx/409
 * (Retry-After) atau jaringan putus. `kosongBila`: status yang dianggap "tidak ada" → null.
 */
async function api(metode, jalur, { body, query, kosongBila = [], ulang = metode === "GET" } = {}) {
  if (MODE !== "deploy" && metode !== "GET") throw new Galat(`mode ${MODE} hanya GET (ditolak: ${metode} ${jalur})`, 2);
  const url = new URL(API + jalur);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  for (let coba = 1; ; coba++) {
    let res;
    try {
      res = await fetch(url, {
        method: metode,
        headers: {
          Authorization: `Bearer ${ENV.HOSTINGER_API_TOKEN.trim()}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      if (ulang && coba < 4) {
        await tidur(2000 * 2 ** (coba - 1));
        continue;
      }
      throw new Galat(`${metode} ${jalur}: jaringan gagal (${e.message})`);
    }
    const sementara = res.status === 429 || res.status >= 500 || (res.status === 409 && res.headers.has("retry-after"));
    if (ulang && sementara && coba < 5) {
      await res.arrayBuffer();
      const tunggu = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** (coba - 1);
      await tidur(Math.min(tunggu, 60_000));
      continue;
    }
    const teks = await res.text();
    let data = null;
    try {
      data = teks ? JSON.parse(teks) : null;
    } catch {
      data = null;
    }
    if (res.ok) return data;
    if (kosongBila.includes(res.status)) return null;
    const rincian = [
      data?.message ?? teks.slice(0, 300),
      data?.errors ? JSON.stringify(data.errors) : "",
      data?.correlation_id ? `(correlation_id ${data.correlation_id})` : "",
    ];
    throw new GalatApi(res.status, `${metode} ${jalur} → HTTP ${res.status}: ${rincian.filter(Boolean).join(" ")}`);
  }
}

const jalurSitus = (situs) => `/api/hosting/v1/accounts/${encodeURIComponent(situs.username)}/websites/${DOMAIN_SAH}`;

async function cariSitus() {
  const hasil = await api("GET", "/api/hosting/v1/websites", { query: { domain: DOMAIN_SAH, per_page: 100 } });
  return pilihSitus(hasil?.data);
}

async function daftarBuild(situs) {
  const hasil = await api("GET", `${jalurSitus(situs)}/nodejs/builds`, { query: { per_page: 100 }, kosongBila: [404, 422] });
  return hasil?.data ?? [];
}

async function isiDocumentRoot(situs) {
  const hasil = await api("GET", `/api/hosting/v1/accounts/${encodeURIComponent(situs.username)}/domains/${DOMAIN_SAH}/files`, {
    query: { max_depth: 1, max_items: 100 },
  });
  return hasil?.items ?? [];
}

/** Unggah satu berkas ke document root lewat TUS 1.0.0 (POST buat, PATCH isi). `override=true` → aman diulang. */
async function unggah(situs, nama, isi) {
  for (let coba = 1; ; coba++) {
    try {
      const kred = await api("POST", "/api/hosting/v1/files/upload-urls", {
        body: { username: situs.username, domain: DOMAIN_SAH },
        ulang: true,
      });
      const tujuan = `${kred.url.replace(/\/$/, "")}/${nama}?override=true`;
      const h = { "X-Auth": kred.auth_key, "X-Auth-Rest": kred.rest_auth_key, "Tus-Resumable": "1.0.0" };
      const buat = await fetch(tujuan, {
        method: "POST",
        headers: { ...h, "Upload-Length": String(isi.length), "Upload-Offset": "0" },
        signal: AbortSignal.timeout(60_000),
      });
      const teksBuat = await buat.text();
      if (buat.status !== 201) throw new Galat(`TUS POST ${nama} → HTTP ${buat.status}: ${teksBuat.slice(0, 200)}`);
      const kirim = await fetch(tujuan, {
        method: "PATCH",
        headers: { ...h, "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" },
        body: isi,
        signal: AbortSignal.timeout(300_000),
      });
      const teksKirim = await kirim.text();
      const offset = kirim.headers.get("upload-offset");
      if (kirim.status !== 204 || Number(offset) !== isi.length) {
        throw new Galat(
          `TUS PATCH ${nama} → HTTP ${kirim.status}, Upload-Offset ${offset} (harus ${isi.length}) ${teksKirim.slice(0, 200)}`,
        );
      }
      return;
    } catch (e) {
      if (coba >= 4 || e instanceof GalatApi) throw e;
      console.log(`  unggah ${nama} gagal (${e.message}); ulang ${coba}/3`);
      await tidur(2000 * 2 ** (coba - 1));
    }
  }
}

// ──────────────────────────────────────────────── keluaran ────────────────────────────────────────────────

const ringkasan = [];
function catat(...md) {
  ringkasan.push(...md);
}
function tulisRingkasan() {
  if (ENV.GITHUB_STEP_SUMMARY && ringkasan.length) appendFileSync(ENV.GITHUB_STEP_SUMMARY, ringkasan.join("\n") + "\n");
}
const ms = (x) => `${Math.round(x / 1000)} dtk`;
/** Teks aman untuk sel tabel markdown ringkasan. */
const sel = (teks) => String(teks).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

// ──────────────────────────────────────────────── mode cek ────────────────────────────────────────────────

let gagalCek = 0;
async function periksa(label, fn) {
  try {
    const hasil = await fn();
    console.log(`✔ ${label}: ${hasil}`);
    catat(`| ${label} | ${sel(hasil)} |`);
    return true;
  } catch (e) {
    gagalCek++;
    console.log(`✘ ${label}: ${e.message}`);
    catat(`| ${label} | ✘ ${sel(e.message)} |`);
    return false;
  }
}

async function cek() {
  console.log(`Cek baca-saja Hostinger untuk ${DOMAIN_SAH} (hanya GET)\n`);
  catat(`### Cek Hostinger (baca-saja) — ${DOMAIN_SAH}\n`, "| Pemeriksaan | Hasil |", "|---|---|");

  const domainInduk = DOMAIN_SAH.split(".").slice(1).join(".");
  await periksa(`Situs *.${domainInduk} yang terlihat token`, async () => {
    const hasil = await api("GET", "/api/hosting/v1/websites", { query: { domain: domainInduk, per_page: 100 } });
    const baris = (hasil?.data ?? []).map(
      (w) =>
        `${w.domain} (vhost ${w.vhost_type ?? "-"}, jenis ${w.website_type}, ${w.is_enabled ? "aktif" : "NONAKTIF"}, order ${w.order_id})`,
    );
    return baris.length ? `\n  ${baris.join("\n  ")}` : "tidak ada";
  });

  let situs;
  const adaSitus = await periksa(`Situs ${DOMAIN_SAH}`, async () => {
    situs = await cariSitus();
    return `vhost ${situs.vhost_type ?? "-"}, jenis ${situs.website_type}, akun hosting ${situs.username}, order ${situs.order_id}`;
  });
  if (!adaSitus) {
    catat("\n**Kesimpulan:** token tidak bisa melihat situs tujuan; deploy lewat API belum mungkin dengan token ini.");
    throw new Galat(`Situs ${DOMAIN_SAH} tidak terlihat.`);
  }

  let builds = [];
  await periksa("Isi document root", async () => {
    const isi = await isiDocumentRoot(situs);
    return isi.length ? isi.map((f) => `${f.name}${f.type === "directory" ? "/" : ` (${f.size_bytes ?? "?"} B)`}`).join(", ") : "kosong";
  });
  await periksa("SSL", async () => {
    const s = await api("GET", `${jalurSitus(situs)}/ssl/status`);
    return `${s.status}${s.expires_at ? `, berlaku s/d ${s.expires_at}` : ""}${s.is_https_redirect_enabled ? ", redirect HTTPS aktif" : ""}`;
  });
  await periksa("Riwayat build Node.js", async () => {
    builds = await daftarBuild(situs);
    return builds.length
      ? builds
          .slice(0, 5)
          .map((b) => `${b.state} ${b.created_at}`)
          .join("; ")
      : "belum pernah";
  });
  await periksa("Pengaturan build tersimpan", async () => {
    const s = await api("GET", `${jalurSitus(situs)}/nodejs/builds/settings`, { kosongBila: [404] });
    return s ? `${s.app_type}, Node ${s.node_version}, output ${s.output_directory}` : "belum ada";
  });
  await periksa("Environment variables Node.js (nama saja)", async () => {
    const s = await api("GET", `${jalurSitus(situs)}/nodejs/builds/settings/env`, { kosongBila: [404] });
    const daftar = [s, s?.data, s?.env_vars].find(Array.isArray) ?? [];
    const nama = daftar.map((v) => v?.key).filter(Boolean);
    return nama.length ? nama.join(", ") : "tidak ada";
  });
  await periksa("Paket hosting", async () => {
    const hasil = await api("GET", "/api/hosting/v1/orders", { query: { per_page: 100 } });
    const o = (hasil?.data ?? []).find((x) => x.id === situs.order_id);
    return o ? `${o.plan?.name ?? "?"} (${o.status})` : `order ${situs.order_id} tidak terlihat`;
  });
  await periksa("Koneksi Git (GitHub) di akun", async () => {
    const hasil = await api("GET", "/api/hosting/v1/git/installations");
    const daftar = Array.isArray(hasil) ? hasil : (hasil?.data ?? []);
    return daftar.length ? daftar.map((g) => `${g.provider}:${g.account_login} (${g.status})`).join(", ") : "tidak ada";
  });

  const node = sudahNode(situs, builds);
  const saran = node
    ? "Situs sudah app Node.js: setelah variabel `HOSTINGER_AKTIF=1`, setiap merge ke main langsung di-deploy."
    : "Situs BELUM app Node.js. Deploy pertama menimpa isi di atas secara permanen: jalankan Actions → Web → Run workflow dengan centang `timpa_situs_lama`.";
  console.log(`\n${saran}`);
  catat(`\n**Kesimpulan:** ${saran}`);
  if (situs.vhost_type === "subdomain") {
    const p = "Catatan: situs ini ber-vhost `subdomain`. Bila build ditolak API, app Node.js perlu situs tersendiri.";
    console.log(p);
    catat(`\n${p}`);
  }
  if (gagalCek) throw new Galat(`${gagalCek} pemeriksaan gagal (✘ di atas): kemungkinan izin token kurang.`);
}

// ─────────────────────────────────────────────── mode deploy ───────────────────────────────────────────────

function git(...args) {
  return execFileSync("git", args, { cwd: AKAR, maxBuffer: 2 * BATAS_ARSIP });
}

function buatArsip(envProduksi) {
  const isiWeb = git("ls-tree", "--name-only", "HEAD:web").toString().split("\n");
  const envTerkomit = isiWeb.filter((n) => n.startsWith(".env") && n !== ".env.example");
  if (envTerkomit.length) throw new Galat(`web/ berisi berkas env yang ter-commit (${envTerkomit.join(", ")}); hapus dulu.`, 2);
  const arsip = git("archive", "--format=zip", `--add-virtual-file=.env.production:${envProduksi}`, "HEAD:web");
  if (arsip.length > BATAS_ARSIP) throw new Galat(`Arsip ${arsip.length} B melebihi batas Hostinger 50 MB.`, 2);
  return arsip;
}

async function tungguBuildLainSelesai(situs) {
  const mulai = Date.now();
  for (;;) {
    const jalan = (await daftarBuild(situs)).filter((b) => b.state === "pending" || b.state === "running");
    if (!jalan.length) return;
    if (Date.now() - mulai > BATAS_BUILD_MS) throw new Galat(`Build lain (${jalan[0].uuid}) tidak selesai-selesai; cek hPanel.`);
    console.log(`  menunggu build lain selesai (${jalan.map((b) => `${b.uuid} ${b.state}`).join(", ")})`);
    await tidur(JEDA_MS * 3);
  }
}

async function pantauBuild(situs, uuid) {
  const mulai = Date.now();
  let dari = 0;
  for (;;) {
    const build = await api("GET", `${jalurSitus(situs)}/nodejs/builds/${uuid}`);
    const log = await api("GET", `${jalurSitus(situs)}/nodejs/builds/${uuid}/logs`, { query: { from_line: dari }, kosongBila: [404, 422] });
    const baris = pecahBaris(log?.logs);
    for (const b of baris) console.log(`  │ ${b}`);
    dari += baris.length;
    if (build.state === "completed" || build.state === "failed") return { build, durasi: Date.now() - mulai };
    if (Date.now() - mulai > BATAS_BUILD_MS) throw new Galat(`Build ${uuid} belum selesai setelah ${ms(BATAS_BUILD_MS)}; cek hPanel.`);
    await tidur(JEDA_MS);
  }
}

async function tungguSitusVersiBaru(situs, versi) {
  const mulai = Date.now();
  let terakhir = "";
  for (let putaran = 1; ; putaran++) {
    try {
      const res = await fetch(`${URL_SITUS}/masuk`, {
        redirect: "manual",
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(30_000),
      });
      const html = await res.text();
      const v = versiDiHtml(html);
      if (res.status === 200 && v === versi) return { robots: res.headers.get("x-robots-tag") ?? "" };
      terakhir = `HTTP ${res.status}, versi ${v ?? "tidak ada"}`;
    } catch (e) {
      terakhir = e.message;
    }
    if (putaran === 6) {
      console.log(`  situs belum menyajikan versi baru (${terakhir}); bersihkan cache situs`);
      await api("DELETE", `${jalurSitus(situs)}/cache/clear`, { kosongBila: [404, 422] });
    }
    if (Date.now() - mulai > BATAS_SITUS_MS) {
      throw new Galat(
        `Build sukses, tapi ${URL_SITUS}/masuk belum menyajikan versi ${versi} (terakhir: ${terakhir}). Cek runtime log di hPanel.`,
      );
    }
    await tidur(JEDA_MS);
  }
}

/** Berkas sumber yang ternyata bisa diunduh publik dari situs (harusnya semua ditangani app Next.js). */
async function berkasTerpapar() {
  const uji = [
    [`/${NAMA_ARSIP}`, (b) => b.length > ZIP_KOSONG.length && b[0] === 0x50 && b[1] === 0x4b],
    ["/package.json", (b) => b.toString().includes('"rhj-tugas-web"')],
    ["/.env.production", (b) => b.toString().includes("NEXT_PUBLIC_")],
    ["/src/proxy.ts", (b) => b.toString().includes("segarkanSesi")],
  ];
  const temuan = [];
  for (const [jalur, cocok] of uji) {
    try {
      const res = await fetch(URL_SITUS + jalur, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const isi = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && cocok(isi)) temuan.push(jalur);
    } catch {
      // tidak terjangkau = tidak terpapar
    }
  }
  return temuan;
}

async function deploy() {
  const sha = git("rev-parse", "HEAD").toString().trim();
  const versi = sha.slice(0, 12);
  const envProduksi = isiEnvProduksi({ kunci: ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, versi });
  const arsip = buatArsip(envProduksi);
  console.log(`Deploy commit ${versi} → ${DOMAIN_SAH} (arsip sumber web/ ${Math.round(arsip.length / 1024)} KB)`);
  catat(`### Deploy Hostinger — ${DOMAIN_SAH}\n`, "| | |", "|---|---|", `| Commit | \`${versi}\` |`);

  const situs = await cariSitus();
  console.log(`Situs: vhost ${situs.vhost_type ?? "-"}, jenis ${situs.website_type}, akun ${situs.username}`);
  const builds = await daftarBuild(situs);
  if (!sudahNode(situs, builds)) {
    const isi = await isiDocumentRoot(situs);
    const daftar = isi.map((f) => f.name).join(", ") || "kosong";
    if (ENV.IZINKAN_TIMPA_SITUS_LAMA !== "ya") {
      throw new Galat(
        `Situs ${DOMAIN_SAH} belum app Node.js (jenis ${situs.website_type}; isi: ${daftar}). Deploy pertama menimpa isinya ` +
          "permanen, jadi hanya jalan lewat Actions → Web → Run workflow dengan centang timpa_situs_lama.",
        2,
      );
    }
    console.log(`Deploy PERTAMA (izin timpa diberikan): isi lama yang akan diganti: ${daftar}`);
    catat(`| Deploy pertama | menimpa situs jenis ${situs.website_type} (isi lama: ${daftar}) |`);
  }

  await tungguBuildLainSelesai(situs);
  console.log(`Unggah ${NAMA_ARSIP}`);
  await unggah(situs, NAMA_ARSIP, arsip);

  const deteksi = await api("GET", `${jalurSitus(situs)}/nodejs/builds/settings/from-archive`, { query: { archive_path: NAMA_ARSIP } });
  const badan = badanBuild(deteksi);
  if (deteksi.app_type !== "next") console.log(`  peringatan: deteksi Hostinger "${deteksi.app_type}", dipaksa "next"`);
  console.log(`Build: ${JSON.stringify({ ...badan, source_options: undefined, source_type: undefined })}`);

  const mulaiBuild = await api("POST", `${jalurSitus(situs)}/nodejs/builds`, { body: badan, ulang: false });
  console.log(`Build ${mulaiBuild.uuid} dimulai`);
  const { build, durasi } = await pantauBuild(situs, mulaiBuild.uuid);
  catat(`| Build | \`${build.uuid}\` ${build.state} (${ms(durasi)}) |`);

  // arsip sumber jangan tertinggal di document root (bisa diunduh publik bila server menyajikan berkas statis)
  try {
    await unggah(situs, NAMA_ARSIP, ZIP_KOSONG);
  } catch (e) {
    console.log(`  peringatan: arsip sumber di server gagal dikosongkan (${e.message})`);
    catat(`| Peringatan | arsip sumber di server gagal dikosongkan |`);
  }

  if (build.state !== "completed") {
    const analisis = await api("GET", `${jalurSitus(situs)}/nodejs/builds/${build.uuid}/analysis`, { kosongBila: [422, 429] });
    if (analisis?.analysis) {
      console.log(`\nAnalisis Hostinger: ${analisis.analysis}\nSaran: ${analisis.solution ?? "-"}`);
      catat(`| Analisis | ${sel(analisis.analysis)} |`, `| Saran | ${sel(analisis.solution ?? "-")} |`);
    }
    throw new Galat(`Build ${build.uuid} GAGAL. Situs tetap menjalankan versi sebelumnya.`);
  }

  // situs dibuka lewat HTTPS: pasang ulang sertifikat bila hilang/kedaluwarsa
  const ssl = await api("GET", `${jalurSitus(situs)}/ssl/status`, { kosongBila: [404, 422] });
  if (ssl) catat(`| SSL | ${ssl.status} |`);
  if (ssl && ["not_installed", "expired", "failed"].includes(ssl.status)) {
    console.log(`  SSL ${ssl.status}: minta pemasangan sertifikat`);
    await api("POST", `${jalurSitus(situs)}/ssl/setup`, { kosongBila: [422] });
  }

  console.log(`Build selesai (${ms(durasi)}); menunggu ${URL_SITUS} menyajikan versi ${versi}`);
  const { robots } = await tungguSitusVersiBaru(situs, versi);
  catat(`| Situs | ${URL_SITUS} menyajikan \`${versi}\` |`);
  if (!robots.includes("noindex")) {
    console.log("  peringatan: header X-Robots-Tag noindex tidak ada");
    catat("| Peringatan | header X-Robots-Tag noindex tidak ada |");
  }

  const terpapar = await berkasTerpapar();
  if (terpapar.length) {
    catat(`| BAHAYA | berkas sumber bisa diunduh publik: ${terpapar.join(", ")} |`);
    throw new Galat(`Situs jalan, tetapi berkas sumber bisa diunduh publik: ${terpapar.join(", ")}. Periksa document root di hPanel.`);
  }
  console.log(`\nSelesai: ${URL_SITUS} menjalankan commit ${versi}.`);
}

// ───────────────────────────────────────────────── utama ─────────────────────────────────────────────────

async function utama() {
  MODE = process.argv[2];
  if (MODE !== "cek" && MODE !== "deploy") throw new Galat("Pakai: node alat/hostinger.mjs cek|deploy", 2);
  if (!ENV.HOSTINGER_API_TOKEN?.trim()) {
    throw new Galat(
      "HOSTINGER_API_TOKEN kosong. Buat token di hPanel → Profil → API, simpan sebagai GitHub Secret HOSTINGER_API_TOKEN.",
      2,
    );
  }
  API = alamat("HOSTINGER_API_BASE", API);
  URL_SITUS = alamat("HOSTINGER_URL_SITUS", URL_SITUS);
  if (MODE === "cek") await cek();
  else await deploy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await utama();
    tulisRingkasan();
  } catch (e) {
    tulisRingkasan();
    console.error(`\n✘ ${e.message}`);
    process.exit(e instanceof Galat ? e.kode : 1);
  }
}
