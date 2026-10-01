// Tes alat/hostinger.mjs: fungsi pengaman + alur cek/deploy penuh terhadap server tiruan API Hostinger
// (127.0.0.1, tanpa jaringan). Jalankan: node --test alat/
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DOMAIN_SAH,
  NAMA_ARSIP,
  ZIP_KOSONG,
  badanBuild,
  isiEnvProduksi,
  pecahBaris,
  periksaKunciPublik,
  pilihSitus,
  sudahNode,
  versiDiHtml,
} from "./hostinger.mjs";

const SKRIP = fileURLToPath(new URL("./hostinger.mjs", import.meta.url));
const AKAR = fileURLToPath(new URL("..", import.meta.url));
const KUNCI = "sb_publishable_UjiSaja_123";
const VERSI = execFileSync("git", ["rev-parse", "HEAD"], { cwd: AKAR }).toString().trim().slice(0, 12);
const jwt = (muatan) => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(muatan)).toString("base64url"), "ttd"].join(".");

function bacaDariZip(zip, nama) {
  const berkas = join(mkdtempSync(join(tmpdir(), "hostinger-zip-")), "a.zip");
  writeFileSync(berkas, zip);
  return execFileSync("unzip", ["-p", berkas, nama]).toString();
}

describe("fungsi pengaman", () => {
  it("kunci Supabase: hanya publishable/anon yang lolos, dan nilainya tidak pernah ikut di pesan galat", () => {
    assert.equal(periksaKunciPublik(` ${KUNCI} `), KUNCI);
    assert.equal(periksaKunciPublik(jwt({ role: "anon" })), jwt({ role: "anon" }));
    const tolak = [
      ["sb_secret_RahasiaSekali", /SECRET/],
      [jwt({ role: "service_role" }), /service_role/],
      ["", /kosong/],
      [`${KUNCI}\nNEXT_PUBLIC_X=1`, /karakter/],
      ["acak-saja", /tidak dikenali/],
    ];
    for (const [kunci, pola] of tolak) {
      assert.throws(
        () => periksaKunciPublik(kunci),
        (e) => pola.test(e.message) && (!kunci || !e.message.includes(kunci)) && e.kode === 2,
      );
    }
  });

  it(".env.production: URL Supabase & URL aplikasi terkunci ke produksi", () => {
    const isi = isiEnvProduksi({ kunci: KUNCI, versi: "abcdef123456" });
    assert.equal(
      isi,
      [
        "NEXT_PUBLIC_SUPABASE_URL=https://admhlyurfvodfyedgaio.supabase.co",
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${KUNCI}`,
        "NEXT_PUBLIC_APP_BASE_URL=https://tugas.palletmeshindonesia.com",
        "NEXT_PUBLIC_VERSI=abcdef123456",
        "",
      ].join("\n"),
    );
    assert.throws(() => isiEnvProduksi({ kunci: KUNCI, versi: "main" }), /versi/);
  });

  it("situs: hanya domain yang persis sama", () => {
    const situs = (domain) => ({ domain, username: "u1", website_type: "other" });
    assert.equal(pilihSitus([situs("palletmeshindonesia.com"), situs(DOMAIN_SAH)]).domain, DOMAIN_SAH);
    assert.throws(
      () => pilihSitus([situs("palletmeshindonesia.com"), situs(`x${DOMAIN_SAH}`), situs(`${DOMAIN_SAH}.lain.com`)]),
      /tidak terlihat/,
    );
    assert.throws(() => pilihSitus([situs(DOMAIN_SAH), situs(DOMAIN_SAH)]), /2 kali/);
    assert.throws(() => pilihSitus([{ domain: DOMAIN_SAH, username: null }]), /username/);
  });

  it("situs dianggap sudah Node.js bila jenisnya nodejs atau pernah build sukses", () => {
    assert.equal(sudahNode({ website_type: "other" }, []), false);
    assert.equal(sudahNode({ website_type: "other" }, [{ state: "failed" }]), false);
    assert.equal(sudahNode({ website_type: "other" }, [{ state: "completed" }]), true);
    assert.equal(sudahNode({ website_type: "nodejs" }, []), true);
  });

  it("badan build: Next.js, Node 22, npm, arsip kita", () => {
    const badan = badanBuild({
      app_type: "vite",
      node_version: 18,
      root_directory: null,
      output_directory: "dist",
      available_scripts: ["build"],
    });
    assert.deepEqual(badan, {
      node_version: 22,
      app_type: "next",
      root_directory: null,
      output_directory: "dist",
      build_script: "build",
      entry_file: null,
      package_manager: "npm",
      source_type: "archive",
      source_options: { archive_path: NAMA_ARSIP },
    });
    assert.throws(() => badanBuild({ available_scripts: ["dev"] }), /script "build"/);
  });

  it("baris log & penanda versi", () => {
    assert.deepEqual(pecahBaris("a\r\nb\n"), ["a", "b"]);
    assert.deepEqual(pecahBaris(null), []);
    assert.equal(versiDiHtml('<head><meta name="rhj-versi" content="abc123"/></head>'), "abc123");
    assert.equal(versiDiHtml("<head></head>"), null);
  });
});

/** Server tiruan API Hostinger + server TUS + situs, mencatat semua permintaan. */
async function tiruan(opsi = {}) {
  const o = { jenis: "other", hasilBuild: "completed", bocor: false, ssl: "active", tolakOrder: false, ...opsi };
  const catatan = [];
  const unggahan = [];
  let badanBuildDiterima = null;
  let pollBuild = 0;
  let versiSitus = "lama";
  const dasar = `/api/hosting/v1/accounts/u123/websites/${DOMAIN_SAH}`;
  const LOG = ["npm ci", "next build", "selesai"];

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const p = u.pathname;
    const potongan = [];
    for await (const c of req) potongan.push(c);
    const isi = Buffer.concat(potongan);
    catatan.push({ metode: req.method, jalur: p, query: Object.fromEntries(u.searchParams) });
    const json = (status, data, header = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...header });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };

    if (p.startsWith("/api/") && req.headers.authorization !== "Bearer token-uji") return json(401, { message: "Unauthenticated" });
    if (req.method === "GET" && p === "/api/hosting/v1/websites") {
      const semua = [
        {
          domain: "palletmeshindonesia.com",
          vhost_type: "main",
          website_type: "wordpress",
          username: "u123",
          order_id: 7,
          is_enabled: true,
        },
        {
          domain: "admin.palletmeshindonesia.com",
          vhost_type: "addon",
          website_type: "other",
          username: "u123",
          order_id: 7,
          is_enabled: true,
        },
        { domain: DOMAIN_SAH, vhost_type: "addon", website_type: o.jenis, username: "u123", order_id: 7, is_enabled: true },
      ];
      return json(200, { data: semua.filter((w) => w.domain.includes(u.searchParams.get("domain") ?? "")), meta: { total: 3 } });
    }
    if (p === `/api/hosting/v1/accounts/u123/domains/${DOMAIN_SAH}/files`) {
      return json(200, { path: "", items: [{ name: "default.php", path: "default.php", type: "file", size_bytes: 1234 }], total_items: 1 });
    }
    if (p === `${dasar}/ssl/status`) return json(200, { status: o.ssl, is_https_redirect_enabled: true, expires_at: null });
    if (req.method === "POST" && p === `${dasar}/ssl/setup`) return json(200, { message: "Request accepted" });
    if (req.method === "GET" && p === `${dasar}/nodejs/builds`) {
      return o.jenis === "nodejs"
        ? json(200, { data: [{ uuid: "lama", state: "completed", created_at: "2026-10-01T00:00:00Z" }] })
        : json(422, { message: "bukan Node.js" });
    }
    if (p === `${dasar}/nodejs/builds/settings`) return json(404, { message: "Not found" });
    if (p === `${dasar}/nodejs/builds/settings/env`) return json(200, []);
    if (p === "/api/hosting/v1/orders" && o.tolakOrder) return json(403, { message: "Forbidden" });
    if (p === "/api/hosting/v1/orders") return json(200, { data: [{ id: 7, plan: { name: "hostinger_business" }, status: "active" }] });
    if (p === "/api/hosting/v1/git/installations") return json(200, []);
    if (req.method === "POST" && p === "/api/hosting/v1/files/upload-urls") {
      assert.deepEqual(JSON.parse(isi), { username: "u123", domain: DOMAIN_SAH });
      return json(200, { url: `http://127.0.0.1:${server.address().port}/tus/`, auth_key: "kunci-x", rest_auth_key: "kunci-rest" });
    }
    if (p.startsWith("/tus/")) {
      const sah =
        req.headers["x-auth"] === "kunci-x" && req.headers["x-auth-rest"] === "kunci-rest" && u.searchParams.get("override") === "true";
      if (!sah || req.headers["tus-resumable"] !== "1.0.0") return json(403, { message: "auth TUS" });
      if (req.method === "POST") {
        res.writeHead(201);
        return res.end();
      }
      if (req.method === "PATCH" && req.headers["content-type"] === "application/offset+octet-stream") {
        unggahan.push({ nama: p.slice(5), isi });
        res.writeHead(204, { "Upload-Offset": String(isi.length) });
        return res.end();
      }
    }
    if (p === `${dasar}/nodejs/builds/settings/from-archive`) {
      assert.equal(u.searchParams.get("archive_path"), NAMA_ARSIP);
      return json(200, {
        app_type: "next",
        node_version: 20,
        root_directory: null,
        output_directory: ".next",
        build_script: "build",
        entry_file: null,
        package_manager: "npm",
        available_scripts: ["dev", "build", "start"],
      });
    }
    if (req.method === "POST" && p === `${dasar}/nodejs/builds`) {
      badanBuildDiterima = JSON.parse(isi);
      return json(200, { uuid: "b-baru", state: "pending" });
    }
    if (p === `${dasar}/nodejs/builds/b-baru`) {
      pollBuild++;
      const state = pollBuild < LOG.length ? "running" : o.hasilBuild;
      if (state === "completed") versiSitus = /NEXT_PUBLIC_VERSI=(\w+)/.exec(bacaDariZip(unggahan[0].isi, ".env.production"))[1];
      return json(200, { uuid: "b-baru", state });
    }
    if (p === `${dasar}/nodejs/builds/b-baru/logs`) {
      const baris = LOG.slice(Number(u.searchParams.get("from_line") ?? 0), Math.min(LOG.length, pollBuild));
      return json(200, { logs: baris.map((b) => `${b}\n`).join(""), lines: baris.length });
    }
    if (p === `${dasar}/nodejs/builds/b-baru/analysis`)
      return json(200, { analysis: "Modul tidak ditemukan", solution: "Perbaiki import" });
    if (p === `${dasar}/cache/clear`) return json(200, { message: "ok" });
    if (p === "/situs/masuk") {
      res.writeHead(200, { "content-type": "text/html", "x-robots-tag": "noindex, nofollow, noarchive" });
      return res.end(`<html><head><meta name="rhj-versi" content="${versiSitus}"/></head><body>Masuk</body></html>`);
    }
    if (o.bocor && p === "/situs/package.json") {
      res.writeHead(200);
      return res.end('{"name":"rhj-tugas-web"}');
    }
    if (p.startsWith("/situs/")) {
      res.writeHead(404);
      return res.end("tidak ada");
    }
    json(404, { message: `tiruan: ${req.method} ${p} tidak dikenal` });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  function jalankan(mode, envTambah = {}) {
    const ringkasan = join(mkdtempSync(join(tmpdir(), "hostinger-uji-")), "ringkasan.md");
    return new Promise((resolve) => {
      const anak = spawn(process.execPath, [SKRIP, mode], {
        cwd: AKAR,
        env: {
          PATH: process.env.PATH,
          HOSTINGER_API_TOKEN: "token-uji",
          HOSTINGER_API_BASE: `http://127.0.0.1:${port}`,
          HOSTINGER_URL_SITUS: `http://127.0.0.1:${port}/situs`,
          HOSTINGER_JEDA_MS: "20",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KUNCI,
          GITHUB_STEP_SUMMARY: ringkasan,
          ...envTambah,
        },
      });
      let keluaran = "";
      anak.stdout.on("data", (d) => (keluaran += d));
      anak.stderr.on("data", (d) => (keluaran += d));
      anak.on("close", (kode) => resolve({ kode, keluaran, ringkasan: existsSync(ringkasan) ? readFileSync(ringkasan, "utf8") : "" }));
    });
  }

  return {
    jalankan,
    catatan,
    unggahan,
    get badanBuild() {
      return badanBuildDiterima;
    },
    tutup: () => new Promise((r) => server.close(r)),
  };
}

/** Semua jalur per-akun hanya menyentuh DOMAIN_SAH; tidak ada hapus situs/berkas. */
function pastikanHanyaSitusSah(catatan) {
  for (const c of catatan) {
    if (c.jalur.startsWith("/api/hosting/v1/accounts/")) assert.ok(c.jalur.includes(`/${DOMAIN_SAH}/`), `${c.metode} ${c.jalur}`);
    if (c.metode === "DELETE") assert.ok(c.jalur.endsWith("/cache/clear"), `${c.metode} ${c.jalur}`);
    assert.ok(!c.jalur.includes("admin.palletmeshindonesia.com"));
  }
}

describe("cek (baca-saja)", () => {
  it("hanya GET, melaporkan isi situs dan langkah deploy pertama", async () => {
    const t = await tiruan();
    try {
      const { kode, keluaran, ringkasan } = await t.jalankan("cek");
      assert.equal(kode, 0, keluaran);
      assert.deepEqual([...new Set(t.catatan.map((c) => c.metode))], ["GET"]);
      assert.match(keluaran, /BELUM app Node\.js/);
      assert.match(ringkasan, /default\.php/);
      assert.match(ringkasan, /hostinger_business/);
      pastikanHanyaSitusSah(t.catatan);
    } finally {
      await t.tutup();
    }
  });
});

describe("cek: izin kurang", () => {
  it("satu pemeriksaan ditolak → keluar 1, sisanya tetap dilaporkan", async () => {
    const t = await tiruan({ tolakOrder: true });
    try {
      const { kode, keluaran, ringkasan } = await t.jalankan("cek");
      assert.equal(kode, 1, keluaran);
      assert.match(ringkasan, /Paket hosting \| ✘ GET \/api\/hosting\/v1\/orders → HTTP 403/);
      assert.match(ringkasan, /default\.php/);
      assert.deepEqual([...new Set(t.catatan.map((c) => c.metode))], ["GET"]);
    } finally {
      await t.tutup();
    }
  });
});

describe("deploy", () => {
  it("situs belum Node.js dan tanpa izin timpa → ditolak tanpa satu pun aksi tulis", async () => {
    const t = await tiruan();
    try {
      const { kode, keluaran } = await t.jalankan("deploy");
      assert.equal(kode, 2, keluaran);
      assert.match(keluaran, /timpa_situs_lama/);
      assert.deepEqual([...new Set(t.catatan.map((c) => c.metode))], ["GET"]);
      assert.equal(t.unggahan.length, 0);
    } finally {
      await t.tutup();
    }
  });

  it("deploy pertama dengan izin: unggah sumber, build Next.js, kosongkan arsip, situs menyajikan commit ini", async () => {
    const t = await tiruan();
    try {
      const { kode, keluaran, ringkasan } = await t.jalankan("deploy", { IZINKAN_TIMPA_SITUS_LAMA: "ya" });
      assert.equal(kode, 0, keluaran);

      assert.equal(t.unggahan.length, 2);
      const [sumber, pengganti] = t.unggahan;
      assert.equal(sumber.nama, NAMA_ARSIP);
      const env = bacaDariZip(sumber.isi, ".env.production");
      assert.match(env, new RegExp(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${KUNCI}`));
      assert.match(env, new RegExp(`NEXT_PUBLIC_VERSI=${VERSI}`));
      assert.match(bacaDariZip(sumber.isi, "package.json"), /"name": "rhj-tugas-web"/);
      assert.equal(pengganti.nama, NAMA_ARSIP);
      assert.deepEqual(pengganti.isi, ZIP_KOSONG);

      assert.equal(t.badanBuild.app_type, "next");
      assert.equal(t.badanBuild.node_version, 22);
      assert.equal(t.badanBuild.package_manager, "npm");
      assert.deepEqual(t.badanBuild.source_options, { archive_path: NAMA_ARSIP });

      for (const baris of ["npm ci", "next build", "selesai"]) {
        assert.equal(keluaran.split("\n").filter((b) => b === `  │ ${baris}`).length, 1, `log "${baris}" tepat sekali`);
      }
      assert.match(keluaran, new RegExp(`menjalankan commit ${VERSI}`));
      assert.match(ringkasan, /Deploy pertama/);
      assert.ok(!keluaran.includes("token-uji") && !ringkasan.includes("token-uji"));
      pastikanHanyaSitusSah(t.catatan);
    } finally {
      await t.tutup();
    }
  });

  it("situs yang sudah Node.js: deploy rutin tanpa izin khusus", async () => {
    const t = await tiruan({ jenis: "nodejs" });
    try {
      const { kode, keluaran } = await t.jalankan("deploy");
      assert.equal(kode, 0, keluaran);
      assert.equal(t.badanBuild.app_type, "next");
    } finally {
      await t.tutup();
    }
  });

  it("build gagal → keluar 1, analisis Hostinger ditampilkan, arsip tetap dikosongkan", async () => {
    const t = await tiruan({ jenis: "nodejs", hasilBuild: "failed" });
    try {
      const { kode, keluaran } = await t.jalankan("deploy");
      assert.equal(kode, 1, keluaran);
      assert.match(keluaran, /GAGAL/);
      assert.match(keluaran, /Modul tidak ditemukan/);
      assert.deepEqual(t.unggahan.at(-1).isi, ZIP_KOSONG);
    } finally {
      await t.tutup();
    }
  });

  it("secret key Supabase → ditolak sebelum menghubungi Hostinger, nilainya tidak tercetak", async () => {
    const t = await tiruan({ jenis: "nodejs" });
    try {
      const { kode, keluaran } = await t.jalankan("deploy", { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_JanganBocor" });
      assert.equal(kode, 2, keluaran);
      assert.equal(t.catatan.length, 0);
      assert.ok(!keluaran.includes("JanganBocor"));
    } finally {
      await t.tutup();
    }
  });

  it("berkas sumber bisa diunduh dari situs → keluar 1 dengan peringatan", async () => {
    const t = await tiruan({ jenis: "nodejs", bocor: true });
    try {
      const { kode, keluaran } = await t.jalankan("deploy");
      assert.equal(kode, 1, keluaran);
      assert.match(keluaran, /\/package\.json/);
    } finally {
      await t.tutup();
    }
  });

  it("SSL hilang → pemasangan sertifikat diminta", async () => {
    const t = await tiruan({ jenis: "nodejs", ssl: "not_installed" });
    try {
      const { kode, keluaran } = await t.jalankan("deploy");
      assert.equal(kode, 0, keluaran);
      assert.ok(t.catatan.some((c) => c.metode === "POST" && c.jalur.endsWith(`/${DOMAIN_SAH}/ssl/setup`)));
      pastikanHanyaSitusSah(t.catatan);
    } finally {
      await t.tutup();
    }
  });

  it("alamat API selain 127.0.0.1 tidak bisa disuntikkan", async () => {
    const t = await tiruan();
    try {
      const { kode, keluaran } = await t.jalankan("cek", { HOSTINGER_API_BASE: "https://contoh.com" });
      assert.equal(kode, 2, keluaran);
      assert.equal(t.catatan.length, 0);
    } finally {
      await t.tutup();
    }
  });
});
