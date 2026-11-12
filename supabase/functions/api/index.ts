// Edge Function `api` — REST agent aplikasi Tugas RHJ (meniru ClickUp API v2 + endpoint /x).
// Kontrak: docs/ARSITEKTUR.md §8 dan docs/KONTRAK-DB.md. Tanpa dependensi luar (fetch polos ke PostgREST,
// Storage, dan GoTrue memakai SUPABASE_SERVICE_ROLE_KEY bawaan runtime).
//
// Alamat: <SUPABASE_URL>/functions/v1/api/<v2|v3|x>/...
//   Runtime meneruskan path lengkap termasuk nama fungsi, jadi di sini path terlihat sebagai /api/v2/...
//   Awalan /api/api/... juga diterima. TUGAS_API_URL untuk CLI = <SUPABASE_URL>/functions/v1/api/v2
//
// Auth token (agent/CLI/importer): header `Authorization: <token>` atau `Bearer <token>` → sha256 hex →
//   rpc api_token_cek → {member_id, scope, token_id, role}. Scope: baca = GET; tulis = + POST/PUT;
//   impor = + /x/impor/* dan /x/export. DELETE hanya role owner. token_id diteruskan ke DB lewat header
//   x-token-id (activity.token_id + cek scope lapis kedua).
// Auth sesi (UI owner, hanya /x/admin/*, termasuk /x/admin/berita-tarik & /x/admin/wa-pengetahuan): header `x-sesi: <access_token>` → GoTrue /auth/v1/user.
// Rute TANPA token app (iklan.ts, migrasi 20261108120000_iklan_klik): POST /x/iklan/klik (publik, CORS khusus dua situs,
//   batas laju per origin) dan GET /x/iklan/unggah.csv (token env TOKEN_UNGGAH_IKLAN: Bearer atau Basic password).
// Rute bot WA 0878 (wa.ts, migrasi 20261110180000_wa_bot): POST /x/wa/webhook (publik, tanda tangan Kapso
//   X-Webhook-Signature wajib), POST /x/wa/proses & /x/wa/jaga (env TOKEN_WA_PROSES, dipanggil pg_cron lewat pg_net).
// Galat: {err, ECODE} + status HTTP (PT4xx dari DB dipetakan apa adanya).

import { ringkasTarik, tarikSemua, type SumberFeed } from "./berita.ts";
import {
  argKlik, asalIklanBoleh, type BarisUnggah, buatEmber, csvUnggah, MAKS_BODY_KLIK, MIN_TOKEN_UNGGAH, normalKlik, PATH_KLIK,
  tokenUnggahCocok,
} from "./iklan.ts";
import { bagiProses } from "./bagi.ts";
import { sapuProses } from "./sapu.ts";
import { envDari, jagaBot, MAKS_BODY_WEBHOOK, periksaPengetahuan, prosesAntrean, tandaTanganCocok, tokenProsesCocok, uraiWebhook } from "./wa.ts";

type Obj = Record<string, unknown>;
type Scope = "baca" | "tulis" | "impor";

interface Token {
  member_id: number;
  scope: Scope;
  token_id: string;
  role: "owner" | "member" | "bot";
}

interface Ctx {
  req: Request;
  url: URL;
  q: URLSearchParams;
  tok: Token;
  body: () => Promise<Obj>;
}

class GalatApi extends Error {
  constructor(public status: number, public err: string, public ecode: string, public extra: Record<string, string> = {}) {
    super(err);
  }
}

// ---------------------------------------------------------------- konfigurasi
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_KEY;
const BUCKET = "lampiran";
const SIGNED_DETIK = 24 * 3600; // signed URL lampiran berlaku 24 jam
const APP_URL_DEFAULT = "https://tugas.palletmeshindonesia.com";
const BURST = Math.max(1, Number(Deno.env.get("TUGAS_API_BURST") ?? 40)); // kapasitas ember per token
const LAJU = Math.max(1, Number(Deno.env.get("TUGAS_API_LAJU") ?? 20)); // isi ulang per detik per token
const MAKS_BODY = 20 * 1024 * 1024;

// URL publik untuk signed URL Storage. Di cloud SUPABASE_URL sudah publik (https://<ref>.supabase.co).
// Di lokal SUPABASE_URL = http://kong:8000 (jaringan docker) → pakai port host yang diberikan CLI.
const PUBLIC_URL = (() => {
  const eks = Deno.env.get("TUGAS_PUBLIC_SUPABASE_URL");
  if (eks) return eks.replace(/\/+$/, "");
  const port = Deno.env.get("SUPABASE_INTERNAL_HOST_PORT");
  if (/^http:\/\/kong(:\d+)?$/.test(SUPABASE_URL)) return `http://127.0.0.1:${port || "54321"}`;
  return SUPABASE_URL;
})();

function kunciService(): Record<string, string> {
  const h: Record<string, string> = { apikey: SERVICE_KEY };
  if (SERVICE_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SERVICE_KEY}`; // JWT lama; sb_secret_ cukup apikey
  return h;
}

// ---------------------------------------------------------------- respons
const CORS_HEADERS = "authorization, x-sesi, content-type, x-rhj-idem, idempotency-key, apikey, x-client-info";
const CORS_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

function json(status: number, data: unknown, extra: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(data ?? {}), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}
const galat = (e: GalatApi) => json(e.status, { err: e.err, ECODE: e.ecode }, e.extra);

// ---------------------------------------------------------------- panggilan layanan Supabase
async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 55_000) });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { res, data, text };
}

// Galat PostgREST {code, message, hint} → GalatApi. PTxyz = galat terkontrol dari fungsi SQL (kontrak §5).
function dariPostgrest(status: number, j: Obj | null, fn: string): GalatApi {
  const code = String(j?.code ?? "");
  const pesan = String(j?.message ?? "Galat database");
  const m = code.match(/^PT(\d{3})$/);
  if (m) {
    const s = Number(m[1]);
    const def = s === 401 ? "OAUTH_019" : s === 403 ? "ACCESS_001" : s === 404 ? "ITEM_013" : s === 409 ? "KONFLIK_001" : "INPUT_001";
    return new GalatApi(s, pesan, String(j?.hint || def));
  }
  // 22xxx = input tak valid (mis. teks ke bigint/date), 23xxx = pelanggaran constraint
  if (/^22/.test(code)) return new GalatApi(400, pesan, "INPUT_001");
  if (/^23/.test(code)) return new GalatApi(409, pesan, "KONFLIK_001");
  // 42501 (hak) / PGRST* / lainnya = salah konfigurasi server: jangan teruskan mentah
  console.error(`rpc ${fn} gagal: HTTP ${status} ${code} ${pesan} ${String(j?.details ?? "")}`);
  return new GalatApi(500, "Galat server", "APP_500");
}

async function rpc(fn: string, args: Obj, tokenId?: string): Promise<unknown> {
  const body: Obj = {};
  for (const [k, v] of Object.entries(args)) if (v !== undefined) body[k] = v;
  const headers: Record<string, string> = { ...kunciService(), "content-type": "application/json" };
  if (tokenId) headers["x-token-id"] = tokenId;
  const { res, data } = await http(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw dariPostgrest(res.status, data as Obj, fn);
  return data;
}

async function pilih(tabel: string, query: string): Promise<Obj[]> {
  const { res, data } = await http(`${SUPABASE_URL}/rest/v1/${tabel}?${query}`, { headers: kunciService() });
  if (!res.ok) throw dariPostgrest(res.status, data as Obj, tabel);
  return (data as Obj[]) ?? [];
}

const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// createSignedUrls (Storage REST): POST /storage/v1/object/sign/<bucket> {expiresIn, paths}
async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const hasil = new Map<string, string>();
  if (!paths.length) return hasil;
  const { res, data } = await http(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`, {
    method: "POST",
    headers: { ...kunciService(), "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGNED_DETIK, paths }),
  });
  if (!res.ok) {
    console.error(`signed url gagal: HTTP ${res.status}`, JSON.stringify(data).slice(0, 300));
    return hasil;
  }
  for (const r of (data as Obj[]) ?? []) {
    const s = r.signedURL ?? r.signedUrl;
    if (!r.error && typeof s === "string" && typeof r.path === "string") hasil.set(r.path, `${PUBLIC_URL}/storage/v1${s}`);
  }
  return hasil;
}

// Hapus objek Storage per daftar path (service role). `removeObjects`: DELETE /storage/v1/object/<bucket> {prefixes}.
// Kembalikan path yang benar-benar terhapus + tanda gagal. Objek yang memang sudah tak ada tidak masuk `dihapus`.
async function hapusObjek(paths: string[]): Promise<{ dihapus: string[]; gagal: boolean }> {
  if (!paths.length) return { dihapus: [], gagal: false };
  const r = await http(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...kunciService(), "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (r.res.ok && Array.isArray(r.data)) {
    return { dihapus: (r.data as Obj[]).map((o) => String(o.name ?? "")).filter(Boolean), gagal: false };
  }
  console.error(`hapus objek Storage gagal: HTTP ${r.res.status}`, r.text.slice(0, 300));
  return { dihapus: [], gagal: true };
}

// ---------------------------------------------------------------- workspace & CORS (cache per isolate)
let cacheSetel: { t: number; appUrl: string; teamId: string } | null = null;
async function setelan() {
  if (cacheSetel && Date.now() - cacheSetel.t < 300_000) return cacheSetel;
  let appUrl = APP_URL_DEFAULT, teamId = "";
  try {
    const s = await pilih("app_settings", "select=key,value&key=eq.app_base_url");
    if (typeof s[0]?.value === "string") appUrl = String(s[0].value);
    const w = await pilih("workspace", "select=id&limit=1");
    if (w[0]?.id) teamId = String(w[0].id);
  } catch (e) {
    console.error("baca setelan gagal", (e as Error).message);
  }
  cacheSetel = { t: Date.now(), appUrl, teamId };
  return cacheSetel;
}

async function originBoleh(origin: string | null): Promise<boolean> {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  try {
    return new URL((await setelan()).appUrl).origin === origin;
  } catch {
    return false;
  }
}

async function denganCors(req: Request, res: Response): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!origin) return res;
  const h = new Headers(res.headers);
  h.append("vary", "Origin");
  // Rute penerima klik memakai allow-list dua situs (iklan.ts); rute lain tetap hanya app + localhost.
  const klik = normalPath(new URL(req.url).pathname) === PATH_KLIK;
  if (klik ? asalIklanBoleh(origin) : await originBoleh(origin)) {
    h.set("access-control-allow-origin", origin);
    h.set("access-control-expose-headers", "retry-after, x-ratelimit-reset, x-ratelimit-remaining");
  }
  return new Response(res.body, { status: res.status, headers: h });
}

// ---------------------------------------------------------------- burst limit (ember token per token API)
// Sederhana & per isolate (bukan global lintas instance): cukup untuk menahan loop liar satu klien.
const ember = new Map<string, { isi: number; t: number }>();
function jatah(kunci: string): { ok: boolean; sisa: number; tunggu: number } {
  const now = Date.now();
  if (ember.size > 5000) for (const [k, v] of ember) if (now - v.t > 60_000) ember.delete(k);
  const e = ember.get(kunci) ?? { isi: BURST, t: now };
  e.isi = Math.min(BURST, e.isi + ((now - e.t) / 1000) * LAJU);
  e.t = now;
  ember.set(kunci, e);
  if (e.isi >= 1) {
    e.isi -= 1;
    return { ok: true, sisa: Math.floor(e.isi), tunggu: 0 };
  }
  return { ok: false, sisa: 0, tunggu: Math.ceil(((1 - e.isi) / LAJU) * 1000) };
}

// ---------------------------------------------------------------- pembantu input
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function boolQ(q: URLSearchParams, k: string, def = false): boolean {
  const v = q.get(k);
  if (v === null || v === "") return def;
  if (/^(true|1)$/i.test(v)) return true;
  if (/^(false|0)$/i.test(v)) return false;
  throw new GalatApi(400, `Parameter ${k} harus true/false`, "INPUT_001");
}

function intQ(q: URLSearchParams, k: string): number | undefined {
  const v = q.get(k);
  if (v === null || v === "") return undefined;
  if (!/^-?\d{1,16}$/.test(v)) throw new GalatApi(400, `Parameter ${k} harus bilangan bulat`, "INPUT_001");
  return Number(v);
}

function tanggalQ(q: URLSearchParams, k: string): string | undefined {
  const v = q.get(k);
  if (v === null || v === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new GalatApi(400, `Parameter ${k} harus YYYY-MM-DD`, "INPUT_001");
  }
  return v;
}

function wajibQ(q: URLSearchParams, k: string): string {
  const v = (q.get(k) ?? "").trim();
  if (!v) throw new GalatApi(400, `Parameter ${k} wajib`, "INPUT_001");
  return v;
}

function idem(req: Request): string | undefined {
  const v = (req.headers.get("x-rhj-idem") ?? req.headers.get("idempotency-key") ?? "").trim();
  return v ? v.slice(0, 200) : undefined;
}

async function bacaBody(req: Request): Promise<Obj> {
  const text = await req.text();
  if (text.length > MAKS_BODY) throw new GalatApi(413, "Body terlalu besar", "INPUT_001");
  if (!text.trim()) return {};
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new GalatApi(400, "Body bukan JSON yang sah", "INPUT_001"); }
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new GalatApi(400, "Body harus objek JSON", "INPUT_001");
  return j as Obj;
}

// ---------------------------------------------------------------- pembentuk respons khusus
// api_task.attachments: url = signed URL 24 jam (storage_path) atau clickup_url (tautan_saja/gagal),
// lalu storage_path & clickup_url dibuang (kontrak §2).
async function lampiranTerisi(task: Obj): Promise<Obj> {
  const att = Array.isArray(task?.attachments) ? (task.attachments as Obj[]) : null;
  if (!att) return task;
  const paths = att.map((a) => a.storage_path).filter((p): p is string => typeof p === "string" && p !== "");
  const urls = await signedUrls([...new Set(paths)]);
  task.attachments = att.map((a) => {
    const { storage_path, clickup_url, ...sisa } = a;
    const sp = typeof storage_path === "string" ? storage_path : "";
    sisa.url = (sp && urls.get(sp)) || (typeof clickup_url === "string" && clickup_url) || null;
    return sisa;
  });
  return task;
}

// Satu lampiran (hasil x_lampiran_catat) → bentuk respons: tambah signed URL 24 jam, buang storage_path & clickup_url.
async function lampiranSatu(a: Obj): Promise<Obj> {
  const { storage_path, clickup_url, ...sisa } = a;
  const sp = typeof storage_path === "string" ? storage_path : "";
  sisa.url = (sp && (await signedUrls([sp])).get(sp)) || (typeof clickup_url === "string" && clickup_url) || null;
  return sisa;
}

// Paginasi ClickUp `start`(ms) + `start_id`: API ini mengembalikan SEMUA komentar di halaman pertama;
// permintaan lanjutan hanya berisi komentar yang lebih tua dari penanda (urut date desc, id desc).
function saringStart(data: Obj, q: URLSearchParams): Obj {
  const start = intQ(q, "start");
  if (start === undefined) return data;
  const sid = q.get("start_id") ?? "";
  const cs = Array.isArray(data.comments) ? (data.comments as Obj[]) : [];
  data.comments = cs.filter((c) => {
    const d = Number(c.date);
    if (d < start) return true;
    return d === start && sid !== "" && String(c.id) < sid;
  });
  return data;
}

const ANGKA_SENSUS = [
  "tasks_total", "open", "closed", "archived", "deleted", "subtasks", "comments_top", "replies", "reply_count_sum",
  "attachments_task", "attachments_comment", "assignee_links",
];

// ---------------------------------------------------------------- auth
async function tokenDari(req: Request): Promise<{ tok: Token; kunci: string }> {
  const raw = (req.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "").trim();
  if (!raw) throw new GalatApi(401, "Token tidak ada (header Authorization wajib)", "OAUTH_017");
  const hash = await sha256Hex(raw);
  const j = jatah(hash);
  if (!j.ok) {
    throw new GalatApi(429, "Rate limit", "APP_002", {
      "retry-after": String(Math.max(1, Math.ceil(j.tunggu / 1000))),
      "x-ratelimit-reset": String(Math.ceil((Date.now() + j.tunggu) / 1000)),
      "x-ratelimit-remaining": "0",
    });
  }
  const t = (await rpc("api_token_cek", { p_hash: hash })) as Token | null;
  if (!t || !t.member_id) throw new GalatApi(401, "Token tidak sah", "OAUTH_019");
  return { tok: t, kunci: hash };
}

const URUT: Record<Scope, number> = { baca: 1, tulis: 2, impor: 3 };
function wajibScope(t: Token, perlu: Scope) {
  if ((URUT[t.scope] ?? 0) < URUT[perlu]) {
    throw new GalatApi(403, `Scope token "${t.scope}" tidak cukup (perlu "${perlu}")`, "ACCESS_001");
  }
}

// Sesi UI owner untuk /x/admin/*: header x-sesi (atau Authorization: Bearer <JWT>).
async function ownerDariSesi(req: Request): Promise<{ member: Obj; uid: string; jwt: string }> {
  let jwt = (req.headers.get("x-sesi") ?? "").trim().replace(/^bearer\s+/i, "");
  if (!jwt) {
    const a = (req.headers.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "");
    if (a.startsWith("eyJ")) jwt = a;
  }
  if (!jwt) throw new GalatApi(401, "Sesi tidak ada (header x-sesi wajib)", "OAUTH_019");
  const { res, data } = await http(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  const uid = res.ok ? String((data as Obj)?.id ?? "") : "";
  if (!uid) throw new GalatApi(401, "Sesi tidak sah, silakan masuk lagi", "OAUTH_019");
  const rows = await pilih("members", `select=id,role,aktif&auth_user_id=eq.${encodeURIComponent(uid)}`);
  const m = rows[0];
  if (!m || m.aktif !== true) throw new GalatApi(403, "Akun ini belum terdaftar sebagai anggota aktif", "ACCESS_001");
  if (m.role !== "owner") throw new GalatApi(403, "Hanya owner yang boleh mengatur akun", "ACCESS_001");
  return { member: m, uid, jwt };
}

// ---------------------------------------------------------------- admin akun (GoTrue admin API)
async function goTrue(method: string, path: string, body?: Obj) {
  return await http(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: { ...kunciService(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function galatGoTrue(status: number, data: Obj | null): GalatApi {
  const kode = String(data?.error_code ?? data?.code ?? "");
  const pesan = String(data?.msg ?? data?.message ?? data?.error_description ?? "Galat Auth");
  // GoTrue admin PUT dengan email yang sudah dipakai menjawab HTTP 500 + kode Postgres 23505 (users_email_partial_key).
  if (/email_exists|user_already_exists|already been registered|23505|duplicate key/i.test(`${kode} ${pesan}`)) {
    return new GalatApi(409, "Email sudah dipakai akun lain", "KONFLIK_001");
  }
  if (/weak_password|password/i.test(`${kode} ${pesan}`) && status < 500) return new GalatApi(400, `Password ditolak: ${pesan}`, "INPUT_001");
  if (/email_address_invalid|validation_failed|invalid/i.test(`${kode} ${pesan}`) && status < 500) {
    return new GalatApi(400, `Data akun ditolak: ${pesan}`, "INPUT_001");
  }
  console.error(`gotrue gagal: HTTP ${status} ${kode} ${pesan}`);
  return new GalatApi(502, "Layanan Auth gagal", "APP_502");
}

function wajibPassword(b: Obj): string {
  const p = typeof b.password_sementara === "string" ? b.password_sementara : "";
  if (p.length < 8) throw new GalatApi(400, "password_sementara minimal 8 karakter", "INPUT_001");
  if (p.length > 72) throw new GalatApi(400, "password_sementara maksimal 72 karakter", "INPUT_001");
  return p;
}

async function anggotaTarget(b: Obj): Promise<Obj> {
  const id = Number(b.member_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new GalatApi(400, "member_id wajib (angka)", "INPUT_001");
  const rows = await pilih("members", `select=id,username,email,role,aktif,auth_user_id&id=eq.${id}`);
  if (!rows[0]) throw new GalatApi(404, "Anggota tidak ditemukan", "ITEM_013");
  if (rows[0].role === "bot") throw new GalatApi(400, "Bot tidak punya akun login", "INPUT_001");
  return rows[0];
}

async function adminAkun(req: Request): Promise<unknown> {
  const { member: owner } = await ownerDariSesi(req);
  const b = await bacaBody(req);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GalatApi(400, "email wajib dan harus sah", "INPUT_001");
  const password = wajibPassword(b);
  const m = await anggotaTarget(b);
  // Cek bentrok email di members DULU supaya akun Auth tidak telanjur diubah lalu x_admin_akun menolak (409).
  const bentrok = await pilih("members", `select=id&email=eq.${encodeURIComponent(email)}&id=neq.${m.id}&limit=1`);
  if (bentrok[0]) throw new GalatApi(409, "Email sudah dipakai anggota lain", "KONFLIK_001");

  let uid = typeof m.auth_user_id === "string" ? m.auth_user_id : "";
  let dibuatBaru = false;
  if (uid) {
    const r = await goTrue("PUT", `/admin/users/${uid}`, { email, password, email_confirm: true });
    if (r.res.status === 404) uid = ""; // akun Auth sudah hilang → buat baru
    else if (!r.res.ok) throw galatGoTrue(r.res.status, r.data as Obj);
  }
  if (!uid) {
    const r = await goTrue("POST", "/admin/users", { email, password, email_confirm: true });
    if (!r.res.ok) throw galatGoTrue(r.res.status, r.data as Obj);
    uid = String((r.data as Obj)?.id ?? "");
    dibuatBaru = true;
  }
  try {
    const hasil = (await rpc("x_admin_akun", {
      p_aktor: owner.id, p_member: m.id, p_auth_user: uid, p_email: email, p_harus_ganti: true,
    })) as Obj;
    return { ...hasil, akun_baru: dibuatBaru };
  } catch (e) {
    if (dibuatBaru) await goTrue("DELETE", `/admin/users/${uid}`); // jangan tinggalkan akun yatim
    throw e;
  }
}

async function adminReset(req: Request): Promise<unknown> {
  const { member: owner } = await ownerDariSesi(req);
  const b = await bacaBody(req);
  const password = wajibPassword(b);
  const m = await anggotaTarget(b);
  const uid = typeof m.auth_user_id === "string" ? m.auth_user_id : "";
  if (!uid) throw new GalatApi(404, "Anggota ini belum punya akun login (buat lewat /x/admin/akun)", "ITEM_013");
  const r = await goTrue("PUT", `/admin/users/${uid}`, { password });
  if (!r.res.ok) throw galatGoTrue(r.res.status, r.data as Obj);
  const hasil = (await rpc("x_admin_akun", {
    p_aktor: owner.id, p_member: m.id, p_auth_user: uid, p_email: null, p_harus_ganti: true,
  })) as Obj;
  return { ...hasil, akun_baru: false };
}

// Purge permanen dari Sampah (owner): web_purge dijalankan SEBAGAI user (JWT sesi, aturan & activity tetap
// dari DB), lalu objek Storage yang dikembalikan dihapus dengan service role (member tak punya policy delete;
// trigger storage.protect_objects_delete mencegah hapus dari SQL). Kontrak DB §6 web_purge.
async function adminPurge(req: Request): Promise<unknown> {
  const { jwt } = await ownerDariSesi(req);
  const b = await bacaBody(req);
  const task = typeof b.task_id === "string" ? b.task_id.trim() : "";
  if (!task) throw new GalatApi(400, "task_id wajib", "INPUT_001");
  const { res, data } = await http(`${SUPABASE_URL}/rest/v1/rpc/web_purge`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ p_task: task }),
  });
  if (!res.ok) throw dariPostgrest(res.status, data as Obj, "web_purge");
  const hasil = (data ?? {}) as Obj;
  const paths = Array.isArray(hasil.storage_paths) ? (hasil.storage_paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
  const { dihapus, gagal: storageGagal } = await hapusObjek(paths);
  // Path yang tak terhapus (objek memang tak ada / galat Storage) dilaporkan supaya bisa diulang.
  return { ...hasil, storage_dihapus: dihapus, storage_sisa: paths.filter((p) => !dihapus.includes(p)), storage_gagal: storageGagal };
}

// ---------------------------------------------------------------- Berita (20261107120000_berita.sql)
// Tarik semua feed aktif (Edge mengunduh & mengurai, DB menyimpan + menyaring dobel). Dipanggil routine kurasi (token
// owner/bot) dan tombol "Tarik terbaru" owner. Tarikan < 90 detik sejak yang terakhir dilewati (tombol ditekan berulang /
// routine & owner bersamaan) — hasilnya {ditunda:true, terakhir_tarik}. (`dilewati` di hasil biasa = jumlah item kotor.)
async function beritaTarik(aktor: number, tokenId?: string): Promise<Obj> {
  const sumber = (await rpc("x_berita_sumber", { p_aktor: aktor }, tokenId)) as SumberFeed[];
  const [akhir] = await pilih("berita_sumber", "select=terakhir_tarik&terakhir_tarik=not.is.null&order=terakhir_tarik.desc&limit=1");
  const t = akhir?.terakhir_tarik ? Date.parse(String(akhir.terakhir_tarik)) : NaN;
  if (Number.isFinite(t) && Date.now() - t < 90_000) return { ditunda: true, terakhir_tarik: akhir.terakhir_tarik };
  const hasil = await tarikSemua(sumber ?? []);
  const simpan = (await rpc("x_berita_simpan", { p_aktor: aktor, p: { hasil } }, tokenId)) as Obj;
  return { ...simpan, per_sumber: ringkasTarik(hasil) };
}

// Simpan fakta/contoh balasan bot WA dari halaman web Bot WA (sesi owner). Teks dicek validator bot yang sama dengan
// /x/wa/pengetahuan SEBELUM disimpan; web tidak punya fungsi web_* simpan (supaya validator tidak bisa dilewati).
async function adminWaPengetahuan(req: Request): Promise<unknown> {
  const { member } = await ownerDariSesi(req);
  const b = await bacaBody(req);
  validasiPengetahuan(b);
  return await rpc("x_wa_pengetahuan_simpan", { p_aktor: Number(member.id), p: b });
}

/** Validator isi fakta/contoh bot (dipakai /x/wa/pengetahuan dan /x/admin/wa-pengetahuan). */
function validasiPengetahuan(b: Obj) {
  if (typeof b.teks !== "string" && typeof b.situasi !== "string") return;
  // jenis wajib bila mengirim teks/situasi (juga saat ubah), supaya validator memakai aturan yang benar
  if (b.jenis !== "fakta" && b.jenis !== "contoh") throw new GalatApi(400, "jenis harus fakta|contoh", "INPUT_001");
  const alasan = typeof b.teks === "string"
    ? periksaPengetahuan(b.jenis, b.teks, typeof b.situasi === "string" ? b.situasi : null)
    : periksaPengetahuan(b.jenis, "Situasi saja.", b.situasi as string).filter((x) => x.startsWith("situasi:"));
  if (alasan.length) throw new GalatApi(400, `ditolak validator: ${[...new Set(alasan)].join(", ")}`, "INPUT_001");
}

async function adminBeritaTarik(req: Request): Promise<unknown> {
  const { member } = await ownerDariSesi(req);
  return await beritaTarik(Number(member.id));
}

// ---------------------------------------------------------------- iklan (20261108120000_iklan_klik.sql, iklan.ts)
// Penerima klik dari situs: kapasitas 30 kiriman sekaligus per origin, isi ulang 30/menit (lalu lintas iklan asli
// ±60 klik/hari). Unggah CSV: percobaan token SALAH dibatasi 10 sekaligus, isi ulang 10/menit (token benar tidak dibatasi
// ember ini, jadi pengirim token salah tidak bisa menghalangi unggahan Google).
const emberKlik = buatEmber(30, 30);
const emberUnggahSalah = buatEmber(10, 10);

function galatLaju(tunggu: number): GalatApi {
  return new GalatApi(429, "Rate limit", "APP_002", {
    "retry-after": String(Math.max(1, Math.ceil(tunggu / 1000))), "x-ratelimit-remaining": "0",
  });
}

async function iklanKlik(req: Request, method: string): Promise<Response> {
  const origin = req.headers.get("origin");
  if (method === "OPTIONS") {
    if (!asalIklanBoleh(origin)) return json(403, { err: "Origin tidak diizinkan", ECODE: "ACCESS_001" });
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin!, "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "Origin",
      },
    });
  }
  if (method !== "POST") throw new GalatApi(405, `Method ${method} tidak didukung untuk ${PATH_KLIK}`, "APP_001");
  // Browser selalu mengirim Origin pada POST lintas situs (fetch maupun sendBeacon). Tanpa/asing → tolak.
  if (!asalIklanBoleh(origin)) throw new GalatApi(403, "Origin tidak diizinkan", "ACCESS_001");
  const j = emberKlik(`klik:${origin}`);
  if (!j.ok) throw galatLaju(j.tunggu);
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BODY_KLIK) throw new GalatApi(413, "Body terlalu besar", "INPUT_001");
  // content-type tidak diperiksa: text/plain (sendBeacon, tanpa preflight) dan application/json sama-sama JSON.
  const text = await req.text();
  if (text.length > MAKS_BODY_KLIK) throw new GalatApi(413, "Body terlalu besar", "INPUT_001");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new GalatApi(400, "Body bukan JSON yang sah", "INPUT_001"); }
  const n = normalKlik(body, { origin });
  if (!n.ok) throw new GalatApi(400, n.pesan, "INPUT_001");
  await rpc("x_iklan_klik_catat", { p: argKlik(n.klik) });   // 409 bila kode dipakai kunjungan lain (dipetakan rpc)
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

async function iklanUnggah(req: Request, method: string): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") throw new GalatApi(405, `Method ${method} tidak didukung`, "APP_001");
  const harap = Deno.env.get("TOKEN_UNGGAH_IKLAN") ?? "";
  if (!(await tokenUnggahCocok(req.headers.get("authorization"), harap))) {
    if (harap.trim().length < MIN_TOKEN_UNGGAH) {
      console.error(`TOKEN_UNGGAH_IKLAN belum disetel (atau < ${MIN_TOKEN_UNGGAH} karakter): unggah CSV ditolak`);
    }
    const j = emberUnggahSalah("unggah");
    if (!j.ok) throw galatLaju(j.tunggu);
    // Jawaban sama untuk token salah / tidak ada / env kosong: tidak membocorkan ada-tidaknya data.
    throw new GalatApi(401, "Token tidak sah", "OAUTH_019", { "www-authenticate": 'Basic realm="Anvil unggah iklan", charset="UTF-8"' });
  }
  const data = (await rpc("x_iklan_unggah", {})) as { baris?: BarisUnggah[]; dilewati_braid?: number; ditunda?: number };
  const { csv, n } = csvUnggah(data?.baris ?? []);
  return new Response(method === "HEAD" ? null : csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
      "content-disposition": 'inline; filename="unggah-konversi-order.csv"',
      "x-baris": String(n), "x-dilewati-braid": String(data?.dilewati_braid ?? 0), "x-ditunda": String(data?.ditunda ?? 0),
    },
  });
}

// ---------------------------------------------------------------- bot WA 0878 (wa.ts, 20261110180000_wa_bot.sql)
// Waktu acuan tiruan (header x-wa-sekarang) HANYA bila env WA_IZINKAN_JAM_UJI=1 (uji lokal, uji/wa/serve.env).
const emberWaSalah = buatEmber(20, 20);
function waSekarang(req: Request): { sekarang?: string } {
  if (Deno.env.get("WA_IZINKAN_JAM_UJI") !== "1") return {};
  const v = (req.headers.get("x-wa-sekarang") ?? "").trim();
  return v ? { sekarang: v } : {};
}
const waEnv = () => envDari((k) => Deno.env.get(k));
const waRpc = (fn: string, args: Obj) => rpc(fn, args);

async function waWebhook(req: Request, method: string): Promise<Response> {
  if (method !== "POST") throw new GalatApi(405, `Method ${method} tidak didukung untuk /x/wa/webhook`, "APP_001");
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BODY_WEBHOOK) throw new GalatApi(413, "Body terlalu besar", "INPUT_001");
  const text = await req.text();
  if (text.length > MAKS_BODY_WEBHOOK) throw new GalatApi(413, "Body terlalu besar", "INPUT_001");
  const rahasia = Deno.env.get("KAPSO_WEBHOOK_SECRET") ?? "";
  if (!(await tandaTanganCocok(text, req.headers.get("x-webhook-signature"), rahasia))) {
    if (rahasia.trim().length < 16) console.error("KAPSO_WEBHOOK_SECRET belum disetel (atau < 16 karakter): webhook WA ditolak");
    const j = emberWaSalah("webhook");
    if (!j.ok) throw galatLaju(j.tunggu);
    throw new GalatApi(401, "Tanda tangan tidak sah", "OAUTH_019");
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new GalatApi(400, "Body bukan JSON yang sah", "INPUT_001"); }
  const env = waEnv();
  const { items, dilewati } = uraiWebhook(body, req.headers.get("x-webhook-event"), env.pnid);
  const idem = (req.headers.get("x-idempotency-key") ?? "").trim().slice(0, 200);
  const r = (await rpc("x_wa_webhook", { p: { kunci_idem: idem || undefined, items, ...waSekarang(req) } })) as Obj;
  // Pembagian seketika (bagi.ts, 20261111170000): calon chat baru jam kerja. Gagal di sini TIDAK menggagalkan webhook.
  let bagi: Obj | undefined;
  if (r.dobel !== true && items.some((x) => x.arah === "masuk")) {
    try {
      bagi = (await rpc("x_wa_bagi_calon", { p: { items, ...waSekarang(req) } })) as Obj;
    } catch (e) {
      console.error("x_wa_bagi_calon gagal:", e instanceof Error ? e.message : String(e));
    }
  }
  return json(200, { ok: true, ...r, dilewati, ...(bagi?.aktif ? { bagi_calon: bagi.calon } : {}) });
}

async function waSapu(req: Request, method: string): Promise<Response> {
  if (method !== "POST") throw new GalatApi(405, `Method ${method} tidak didukung`, "APP_001");
  await waTokenProses(req);
  return json(200, await sapuProses({ rpc: waRpc, fetch: (u: string, i?: RequestInit) => fetch(u, i), env: waEnv(), ...waSekarang(req) }));
}

async function waBagi(req: Request, method: string): Promise<Response> {
  if (method !== "POST") throw new GalatApi(405, `Method ${method} tidak didukung`, "APP_001");
  await waTokenProses(req);
  return json(200, await bagiProses({ rpc: waRpc, fetch: (u: string, i?: RequestInit) => fetch(u, i), env: waEnv(),
                                      chatSales: Deno.env.get("TELEGRAM_CHAT_SALES") ?? "", ...waSekarang(req) }));
}

async function waTokenProses(req: Request) {
  if (!(await tokenProsesCocok(req.headers.get("authorization"), Deno.env.get("TOKEN_WA_PROSES")))) {
    if ((Deno.env.get("TOKEN_WA_PROSES") ?? "").trim().length < 24) console.error("TOKEN_WA_PROSES belum disetel (atau < 24 karakter)");
    const j = emberWaSalah("proses");
    if (!j.ok) throw galatLaju(j.tunggu);
    throw new GalatApi(401, "Token tidak sah", "OAUTH_019");
  }
}

async function waProsesJaga(req: Request, method: string, jenis: "proses" | "jaga"): Promise<Response> {
  if (method !== "POST") throw new GalatApi(405, `Method ${method} tidak didukung`, "APP_001");
  await waTokenProses(req);
  const deps = { rpc: waRpc, fetch: (u: string, i?: RequestInit) => fetch(u, i), env: waEnv(), ...waSekarang(req) };
  return json(200, jenis === "proses" ? await prosesAntrean(deps) : await jagaBot(deps));
}

// ---------------------------------------------------------------- rute token
type Handler = (c: Ctx, g: string[]) => Promise<unknown>;
interface Rute { m: string; p: RegExp; perlu: Scope; owner?: boolean; h: Handler }

const A = (c: Ctx) => c.tok.member_id;
const T = (c: Ctx) => c.tok.token_id;
const d = decodeURIComponent;

const PARAM_LIST_TASK = new Set([
  "page", "include_closed", "subtasks", "archived", "include_markdown_description", "date_updated_gt",
  "custom_task_ids", "team_id",
]);

async function cekTeam(tid: string) {
  const s = await setelan();
  if (s.teamId && tid !== s.teamId) throw new GalatApi(404, "Workspace tidak ditemukan", "ITEM_013");
}

const RUTE: Rute[] = [
  // ---- v2 (padanan ClickUp)
  { m: "GET", p: /^\/v2\/user$/, perlu: "baca", h: (c) => rpc("api_user", { p_aktor: A(c) }, T(c)) },
  { m: "GET", p: /^\/v2\/team$/, perlu: "baca", h: (c) => rpc("api_team", { p_aktor: A(c) }, T(c)) },
  {
    m: "GET", p: /^\/v2\/team\/([^/]+)\/space$/, perlu: "baca",
    h: async (c, g) => {
      await cekTeam(d(g[0]));
      return rpc("api_spaces", { p_aktor: A(c), p_archived: boolQ(c.q, "archived") }, T(c));
    },
  },
  {
    m: "GET", p: /^\/v2\/space\/([^/]+)\/folder$/, perlu: "baca",
    h: (c, g) => rpc("api_space_folders", { p_aktor: A(c), p_space: d(g[0]), p_archived: boolQ(c.q, "archived") }, T(c)),
  },
  {
    m: "GET", p: /^\/v2\/space\/([^/]+)\/list$/, perlu: "baca",
    h: (c, g) => rpc("api_space_lists", { p_aktor: A(c), p_space: d(g[0]), p_archived: boolQ(c.q, "archived") }, T(c)),
  },
  {
    m: "GET", p: /^\/v2\/folder\/([^/]+)\/list$/, perlu: "baca",
    h: (c, g) => rpc("api_folder_lists", { p_aktor: A(c), p_folder: d(g[0]), p_archived: boolQ(c.q, "archived") }, T(c)),
  },
  { m: "GET", p: /^\/v2\/list\/([^/]+)$/, perlu: "baca", h: (c, g) => rpc("api_list", { p_aktor: A(c), p_list: d(g[0]) }, T(c)) },
  {
    m: "GET", p: /^\/v2\/list\/([^/]+)\/task$/, perlu: "baca",
    h: (c, g) => {
      for (const k of c.q.keys()) {
        if (!PARAM_LIST_TASK.has(k)) throw new GalatApi(400, `Parameter tidak didukung: ${k}`, "INPUT_001");
      }
      const page = intQ(c.q, "page") ?? 0;
      if (page < 0) throw new GalatApi(400, "Parameter page tidak boleh negatif", "INPUT_001");
      return rpc("api_list_tasks", {
        p_aktor: A(c), p_list: d(g[0]), p_page: page,
        p_include_closed: boolQ(c.q, "include_closed"), p_subtasks: boolQ(c.q, "subtasks"),
        p_archived: boolQ(c.q, "archived"), p_md: boolQ(c.q, "include_markdown_description"),
        p_date_updated_gt: intQ(c.q, "date_updated_gt"),
      }, T(c));
    },
  },
  {
    m: "POST", p: /^\/v2\/list\/([^/]+)\/task$/, perlu: "tulis",
    h: async (c, g) => rpc("api_create_task", { p_aktor: A(c), p_list: d(g[0]), p_body: await c.body(), p_idem: idem(c.req) }, T(c)),
  },
  {
    m: "GET", p: /^\/v2\/list\/([^/]+)\/field$/, perlu: "baca",
    h: async (c, g) => {
      await rpc("api_list", { p_aktor: A(c), p_list: d(g[0]) }, T(c)); // 404 bila list tak ada
      return { fields: [] };
    },
  },
  {
    m: "GET", p: /^\/v2\/task\/([^/]+)$/, perlu: "baca",
    h: async (c, g) =>
      lampiranTerisi((await rpc("api_task", {
        p_aktor: A(c), p_task: d(g[0]), p_md: boolQ(c.q, "include_markdown_description"),
      }, T(c))) as Obj),
  },
  {
    m: "PUT", p: /^\/v2\/task\/([^/]+)$/, perlu: "tulis",
    h: async (c, g) => rpc("api_update_task", { p_aktor: A(c), p_task: d(g[0]), p_body: await c.body() }, T(c)),
  },
  {
    m: "DELETE", p: /^\/v2\/task\/([^/]+)$/, perlu: "tulis", owner: true,
    h: (c, g) => rpc("api_delete_task", { p_aktor: A(c), p_task: d(g[0]) }, T(c)),
  },
  {
    m: "GET", p: /^\/v2\/task\/([^/]+)\/comment$/, perlu: "baca",
    h: async (c, g) => saringStart((await rpc("api_task_comments", { p_aktor: A(c), p_task: d(g[0]) }, T(c))) as Obj, c.q),
  },
  {
    m: "POST", p: /^\/v2\/task\/([^/]+)\/comment$/, perlu: "tulis",
    h: async (c, g) =>
      rpc("api_create_comment", { p_aktor: A(c), p_task: d(g[0]), p_body: await c.body(), p_idem: idem(c.req) }, T(c)),
  },
  {
    m: "GET", p: /^\/v2\/comment\/([^/]+)\/reply$/, perlu: "baca",
    h: (c, g) => rpc("api_comment_replies", { p_aktor: A(c), p_comment: d(g[0]) }, T(c)),
  },
  {
    m: "POST", p: /^\/v2\/comment\/([^/]+)\/reply$/, perlu: "tulis",
    h: async (c, g) =>
      rpc("api_create_reply", { p_aktor: A(c), p_comment: d(g[0]), p_body: await c.body(), p_idem: idem(c.req) }, T(c)),
  },
  {
    // Unggah lampiran dalam SATU panggilan: multipart/form-data, field `file` (opsional `title`, `comment_id`).
    // Edge (service role) menaruh berkas ke Storage lalu x_lampiran_catat mencatat barisnya. Allowlist MIME + 25 MB
    // ditegakkan bucket; mode cermin (kartu ClickUp tak bisa dilampiri) & atribusi pengunggah oleh trigger. Objek
    // yatim dibersihkan bila pencatatan gagal.
    m: "POST", p: /^\/v2\/task\/([^/]+)\/attachment$/, perlu: "tulis",
    h: async (c, g) => {
      const task = d(g[0]);
      if (!/^multipart\/form-data/i.test(c.req.headers.get("content-type") ?? "")) {
        throw new GalatApi(400, "Kirim berkas sebagai multipart/form-data dengan field 'file'", "INPUT_001");
      }
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        throw new GalatApi(400, "Isi multipart/form-data tidak valid", "INPUT_001");
      }
      const f = form.get("file") ?? form.get("attachment");
      if (!(f instanceof File)) throw new GalatApi(400, "Field 'file' wajib berisi sebuah berkas", "INPUT_001");
      if (f.size === 0) throw new GalatApi(400, "Berkas kosong", "INPUT_001");
      if (f.size > 26214400) throw new GalatApi(413, "Berkas melebihi 25 MB", "INPUT_001");
      const title = (form.get("title") as string | null)?.toString().trim() || "";
      const comment = (form.get("comment_id") as string | null)?.toString().trim() || "";
      // deno-lint-ignore no-control-regex -- tolak karakter kontrol di nama objek
      const nama = ((f.name || title || "lampiran").replace(/[\/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim() || "lampiran").slice(0, 200);
      const mime = f.type || "application/octet-stream";
      const path = `t/${task}/${crypto.randomUUID().slice(0, 8)}-${nama}`;

      // 1) unggah ke Storage (service role). Bucket menolak tipe di luar allowlist & berkas > 25 MB.
      const up = await http(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(path)}`, {
        method: "POST",
        headers: { ...kunciService(), "content-type": mime, "x-upsert": "false" },
        body: new Uint8Array(await f.arrayBuffer()),
        timeoutMs: 300_000,
      });
      if (!up.res.ok) {
        const pesan = String((up.data as Obj)?.message ?? (up.data as Obj)?.error ?? up.text ?? "").slice(0, 200);
        if (/mime|not allowed|invalid.?mime|content.?type/i.test(pesan)) {
          throw new GalatApi(400, `Tipe berkas tidak diizinkan: ${mime}`, "INPUT_001");
        }
        if (up.res.status === 413 || /exceed|too large|maximum size/i.test(pesan)) {
          throw new GalatApi(413, "Berkas melebihi 25 MB", "INPUT_001");
        }
        if (up.res.status === 409) throw new GalatApi(409, "Berkas dengan nama itu sudah ada", "KONFLIK_001");
        console.error(`unggah lampiran gagal: HTTP ${up.res.status} ${pesan}`);
        throw new GalatApi(502, "Storage gagal menerima berkas", "APP_502");
      }

      // 2) catat baris (cek tugas terlihat/editable + trigger cermin). Bersihkan objek bila gagal.
      try {
        const hasil = await rpc("x_lampiran_catat", {
          p_aktor: A(c), p_task: task, p_comment: comment || null, p_path: path,
          p_title: title || null, p_mime: mime, p_size: f.size,
        }, T(c));
        return await lampiranSatu(hasil as Obj);
      } catch (e) {
        await http(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(path)}`, { method: "DELETE", headers: kunciService() }).catch(() => {});
        throw e;
      }
    },
  },
  // ---- v3: pindah home list
  {
    m: "PUT", p: /^\/v3\/workspaces\/([^/]+)\/tasks\/([^/]+)\/home_list\/([^/]+)$/, perlu: "tulis",
    h: async (c, g) => {
      await cekTeam(d(g[0]));
      return rpc("api_move_task", { p_aktor: A(c), p_task: d(g[1]), p_list: d(g[2]) }, T(c));
    },
  },
  // ---- x: tambahan aplikasi Tugas
  {
    m: "GET", p: /^\/x\/(?:task\/([^/]+)\/activity|activity\/([^/]+))$/, perlu: "baca",
    h: (c, g) => rpc("x_activity", { p_aktor: A(c), p_task: d(g[0] ?? g[1]) }, T(c)),
  },
  { m: "GET", p: /^\/x\/resolve$/, perlu: "baca", h: (c) => rpc("x_resolve", { p_aktor: A(c), p_ref: wajibQ(c.q, "ref") }, T(c)) },
  {
    m: "GET", p: /^\/x\/search$/, perlu: "baca",
    h: (c) => rpc("x_search", {
      p_aktor: A(c), p_q: wajibQ(c.q, "q"), p_space: c.q.get("space") || undefined,
      p_include_closed: boolQ(c.q, "include_closed"),
    }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/tenggat$/, perlu: "baca",
    h: (c) => rpc("x_tenggat", { p_aktor: A(c), p_tanggal: tanggalQ(c.q, "tanggal"), p_folder: c.q.get("folder") || undefined }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/sensus$/, perlu: "baca",
    h: (c) => rpc("x_sensus", { p_aktor: A(c), p_sumber: c.q.get("sumber") || undefined }, T(c)),
  },
  {
    // Hitungan verifikasi (CLI `verify`): x_sensus disaring per list/folder/space; total dijumlah ulang (tanpa sha).
    m: "GET", p: /^\/x\/count$/, perlu: "baca",
    h: async (c) => {
      const s = (await rpc("x_sensus", { p_aktor: A(c), p_sumber: c.q.get("sumber") || undefined }, T(c))) as Obj;
      const f = { list: c.q.get("list") || "", folder: c.q.get("folder") || "", space: c.q.get("space") || "" };
      if (!f.list && !f.folder && !f.space) return s;
      const ids = (v: string) => new Set(v.split(",").map((x) => x.trim()).filter(Boolean));
      const L = ids(f.list), F = ids(f.folder), S = ids(f.space);
      const lists = ((s.lists as Obj[]) ?? []).filter((l) =>
        (!L.size || L.has(String(l.list_id))) && (!F.size || F.has(String(l.folder_id))) && (!S.size || S.has(String(l.space_id)))
      );
      if (!lists.length) throw new GalatApi(404, "Tidak ada list yang cocok dengan filter", "ITEM_013");
      const total: Obj = { lists: lists.length };
      for (const k of ANGKA_SENSUS) total[k] = lists.reduce((n, l) => n + (Number(l[k]) || 0), 0);
      return { dibuat: s.dibuat, sumber: s.sumber, filter: f, lists, total };
    },
  },
  { m: "GET", p: /^\/x\/export$/, perlu: "impor", h: (c) => rpc("x_export", { p_aktor: A(c) }, T(c)) },
  // ---- Pipeline. Baca (scope baca) untuk routine/agent. Tulis (scope tulis): fu (set rencana FU) dipakai routine
  // Arahan Pipeline untuk menandai lead yang harus di-follow-up (tab "Follow up hari ini"); sumber-bukti (bukti asal
  // lead dari chat WA 0878, Kapso) dipakai routine agent — TIDAK menyentuh `sumber` isian sales, hanya kolom
  // sumber_bukti*. Body {items:[{lead_id, bukti, kode?, chat_pada?}]} maks 200; aktor wajib owner/bot/admin Pipeline.
  {
    m: "POST", p: /^\/x\/pipeline\/fu$/, perlu: "tulis",
    h: async (c) => rpc("x_pipeline_fu_set", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  {
    m: "POST", p: /^\/x\/pipeline\/sumber-bukti$/, perlu: "tulis",
    h: async (c) => rpc("x_pipeline_sumber_bukti_set", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  // Biaya iklan harian per campaign (Agen Data Harian menarik Google/Meta Ads) → tabel iklan_biaya untuk dasbor Pipeline
  // bagian 5. Body {items:[{tanggal, platform, campaign, biaya, klik?, tayang?, konversi?}]} maks 1000; item per
  // (tanggal, platform) = keadaan lengkap hari itu (campaign yang tidak dikirim dihapus). Aktor owner/bot/admin Pipeline.
  {
    m: "POST", p: /^\/x\/pipeline\/biaya-iklan$/, perlu: "tulis",
    h: async (c) => rpc("x_pipeline_biaya_iklan_set", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  // Sinkron dari luar (20261110120000_pipeline_sinkron_luar, keputusan Hannes 10 Nov): routine rhj-brain mengirim SP ERP
  // (→ ORDER, idempoten per erp_so_id) dan chat WA calon pembeli (→ lead otomatis, idempoten per kunci_luar). Body = satu
  // item ATAU {items:[…]} maks 100 (hasil per item, item gagal tidak membatalkan yang lain). Aktor owner/bot/admin
  // Pipeline (DB). Tautan = audit sinkron (tanpa nomor/nama pelanggan).
  {
    m: "POST", p: /^\/x\/pipeline\/order-erp$/, perlu: "tulis",
    h: async (c) => rpc("x_pipeline_order_erp", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  {
    m: "POST", p: /^\/x\/pipeline\/lead-otomatis$/, perlu: "tulis",
    h: async (c) => rpc("x_pipeline_lead_otomatis", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/pipeline\/tautan$/, perlu: "baca",
    h: (c) => rpc("x_pipeline_tautan", { p_aktor: A(c), p: {
      jenis: c.q.get("jenis") || undefined, sejak: c.q.get("sejak") || undefined, batas: c.q.get("batas") || undefined } }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/pipeline\/leads$/, perlu: "baca",
    h: (c) => rpc("x_pipeline_daftar", { p_aktor: A(c), p: {
      tab: c.q.get("tab") ?? undefined, pemilik: c.q.get("pemilik") ?? undefined, q: c.q.get("q") ?? undefined } }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/pipeline\/lead\/([^/]+)$/, perlu: "baca",
    h: (c, g) => rpc("x_pipeline_lead", { p_aktor: A(c), p_id: d(g[0]) }, T(c)),
  },
  {
    m: "GET", p: /^\/x\/pipeline\/ringkas$/, perlu: "baca",
    h: (c) => rpc("x_pipeline_ringkas", { p_aktor: A(c), p: {
      dasar: c.q.get("dasar") ?? undefined, bulan: c.q.get("bulan") ?? undefined } }, T(c)),
  },
  // Asal lead per situs (20261111150000_pipeline_asal_situs): lead masuk [sejak, sampai] per kelompok sumber_bukti (situs RH /
  // situs OY / Meta / lain / tanpa kode / belum) + organik vs Google Ads; produk = lead yang punya item itu. Angka = kartu
  // dasbor. Bawaan sejak = 2026-10-21 (bukti mulai dicatat), sampai = hari ini WIB. Cakupan peran ditegakkan DB.
  {
    m: "GET", p: /^\/x\/pipeline\/asal-situs$/, perlu: "baca",
    h: (c) => rpc("x_pipeline_asal_situs", { p_aktor: A(c), p: {
      produk: c.q.get("produk") || undefined, sejak: c.q.get("sejak") || undefined, sampai: c.q.get("sampai") || undefined } }, T(c)),
  },
  // Ringkasan keutuhan kode klik iklan (admin/baca Pipeline, ditegakkan DB): klik 7/30 hari per domain, kode yang muncul
  // di lead, order + nilai, gbraid/wbraid dilewati, isi CSV unggah saat ini.
  { m: "GET", p: /^\/x\/iklan\/ringkas$/, perlu: "baca", h: (c) => rpc("x_iklan_ringkas", { p_aktor: A(c) }, T(c)) },
  {
    // Retensi klik iklan (job terjadwal rawat.yml, owner/bot): hapus baris iklan_klik > 90 hari. Body opsional {dry?:bool}.
    m: "POST", p: /^\/x\/rawat\/iklan-klik$/, perlu: "impor",
    h: async (c) => {
      const b = (await c.body().catch(() => ({}))) as Obj;
      return rpc("x_rawat_iklan_klik", { p_aktor: A(c), p_dry: b.dry === true }, T(c));
    },
  },
  {
    // Perawatan lampiran (job terjadwal, owner/bot): hapus BERKAS lampiran app pada kartu selesai > N hari (setelan
    // app_settings.rawat_lampiran.hari, default 7). Baris di-soft-delete (jejak di riwayat) oleh x_rawat_lampiran;
    // berkas fisik dihapus di sini (service role). Body opsional {hari?:int, dry?:bool}. dry → hanya daftar, tanpa hapus.
    m: "POST", p: /^\/x\/rawat\/lampiran$/, perlu: "impor",
    h: async (c) => {
      const b = (await c.body().catch(() => ({}))) as Obj;
      const hariNum = Number(b.hari);
      const hari = Number.isFinite(hariNum) ? Math.trunc(hariNum) : null;
      const dry = b.dry === true;
      const hasil = (await rpc("x_rawat_lampiran", { p_aktor: A(c), p_hari: hari, p_dry: dry }, T(c))) as Obj;
      const paths = Array.isArray(hasil.storage_paths)
        ? (hasil.storage_paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
      const { storage_paths: _sp, ...sisa } = hasil;
      if (dry) return { ...sisa, berkas: paths.length };   // dry: laporkan jumlah, jangan sentuh berkas
      const { dihapus, gagal } = await hapusObjek(paths);
      return { ...sisa, berkas_dihapus: dihapus.length, berkas_sisa: paths.length - dihapus.length, berkas_gagal: gagal };
    },
  },
  {
    // Unduh lampiran: 302 ke signed URL (atau URL ClickUp untuk lampiran tautan_saja/gagal).
    m: "GET", p: /^\/x\/file\/([^/]+)$/, perlu: "baca",
    h: async (c, g) => {
      const id = d(g[0]);
      const r = (await rpc("x_resolve", { p_aktor: A(c), p_ref: id }, T(c))) as Obj | null;
      const task = r?.type === "attachment" ? String(r.url ?? "").match(/\/t\/([^/#?]+)/)?.[1] : undefined;
      if (!task) throw new GalatApi(404, "Lampiran tidak ditemukan", "ITEM_013");
      const t = await lampiranTerisi((await rpc("api_task", { p_aktor: A(c), p_task: task }, T(c))) as Obj);
      const a = ((t.attachments as Obj[]) ?? []).find((x) => x.id === id);
      if (!a?.url) throw new GalatApi(404, "Berkas lampiran tidak tersedia", "ITEM_013");
      return new Response(null, { status: 302, headers: { location: String(a.url), "cache-control": "no-store" } });
    },
  },
  // ---- Berita (owner/bot saja, ditegakkan DB). tarik = unduh semua feed + simpan item baru; kandidat = item sejak edisi
  // terakhir + umpan balik owner (routine kurasi); edisi = simpan hasil kurasi {garis_besar, pantau?, kandidat?,
  // catatan?, pilihan:[…]} (kontrak lengkap di komentar x_berita_edisi_simpan).
  { m: "POST", p: /^\/x\/berita\/tarik$/, perlu: "tulis", h: (c) => beritaTarik(A(c), T(c)) },
  {
    m: "GET", p: /^\/x\/berita\/kandidat$/, perlu: "baca",
    h: (c) => rpc("x_berita_kandidat", { p_aktor: A(c), p: { jam: intQ(c.q, "jam"), batas: intQ(c.q, "batas") } }, T(c)),
  },
  {
    m: "POST", p: /^\/x\/berita\/edisi$/, perlu: "tulis",
    h: async (c) => rpc("x_berita_edisi_simpan", { p_aktor: A(c), p: await c.body() }, T(c)),
  },
  // ---- Bot WA 0878 (owner/bot, ditegakkan DB): ringkasan tanpa isi chat/nomor, saklar mati|kirim, daftar diam.
  {
    m: "GET", p: /^\/x\/wa\/ringkas$/, perlu: "baca",
    h: (c) => rpc("x_wa_ringkas", { p_aktor: A(c), p: { hari: intQ(c.q, "hari") } }, T(c)),
  },
  { m: "POST", p: /^\/x\/wa\/saklar$/, perlu: "tulis", h: async (c) => rpc("x_wa_saklar", { p_aktor: A(c), p: await c.body() }, T(c)) },
  { m: "POST", p: /^\/x\/wa\/diam$/, perlu: "tulis", h: async (c) => rpc("x_wa_diam", { p_aktor: A(c), p: await c.body() }, T(c)) },
  // Mode uji (saklar 'uji', migrasi 20261111130000): daftar nomor uji {nomor?, hapus?, catatan?}; tanpa nomor = lihat daftar.
  { m: "POST", p: /^\/x\/wa\/uji$/, perlu: "tulis", h: async (c) => rpc("x_wa_uji", { p_aktor: A(c), p: await c.body() }, T(c)) },
  // Pembagian seketika chat baru jam kerja (20261111170000): daftar penugasan (MEMUAT nomor; routine Pantau WA Jam) dan
  // setelan {aktif?, sales?:[id…], jeda_detik?, hari_baru?} (GET = lihat + hitungan hari ini tanpa nomor).
  {
    m: "GET", p: /^\/x\/wa\/penugasan$/, perlu: "baca",
    h: (c) => rpc("x_wa_bagi_daftar", { p_aktor: A(c), p: { hari: intQ(c.q, "hari") } }, T(c)),
  },
  // Sapu sore (20261111200000): setelan {aktif?, jam_mulai?} dan jalankan manual (owner/bot, scope tulis).
  { m: "GET", p: /^\/x\/wa\/sapu-setel$/, perlu: "baca", h: (c) => rpc("x_wa_sapu_setel", { p_aktor: A(c), p: {} }, T(c)) },
  { m: "POST", p: /^\/x\/wa\/sapu-setel$/, perlu: "tulis", h: async (c) => rpc("x_wa_sapu_setel", { p_aktor: A(c), p: await c.body() }, T(c)) },
  {
    m: "POST", p: /^\/x\/wa\/sapu-jalan$/, perlu: "tulis",
    h: async (c) => {
      await rpc("x_wa_sapu_setel", { p_aktor: A(c), p: { jalan: true } }, T(c));   // izin owner/bot + scope tulis
      return sapuProses({ rpc: waRpc, fetch: (u: string, i?: RequestInit) => fetch(u, i), env: waEnv(), manual: true });
    },
  },
  { m: "GET", p: /^\/x\/wa\/bagi-setel$/, perlu: "baca", h: (c) => rpc("x_wa_bagi_setel", { p_aktor: A(c), p: {} }, T(c)) },
  { m: "POST", p: /^\/x\/wa\/bagi-setel$/, perlu: "tulis", h: async (c) => rpc("x_wa_bagi_setel", { p_aktor: A(c), p: await c.body() }, T(c)) },
  // Fakta & contoh balasan bot (wa.pengetahuan, keputusan Hannes 11 Nov): daftar (baca) / simpan (tulis). Teks dicek
  // validator yang sama dengan balasan bot SEBELUM disimpan; ditolak → 400 dengan daftar alasan.
  { m: "GET", p: /^\/x\/wa\/pengetahuan$/, perlu: "baca", h: (c) => rpc("x_wa_pengetahuan_daftar", { p_aktor: A(c), p: {} }, T(c)) },
  {
    m: "POST", p: /^\/x\/wa\/pengetahuan$/, perlu: "tulis",
    h: async (c) => {
      const b = await c.body();
      validasiPengetahuan(b);
      return rpc("x_wa_pengetahuan_simpan", { p_aktor: A(c), p: b }, T(c));
    },
  },
  // ---- x/impor (scope impor)
  {
    m: "POST", p: /^\/x\/impor\/batch$/, perlu: "impor",
    h: async (c) => {
      const b = await c.body();
      if (typeof b.jenis !== "string" || !b.jenis) throw new GalatApi(400, "jenis wajib", "INPUT_001");
      if (!Array.isArray(b.rows)) throw new GalatApi(400, "rows wajib berupa array", "INPUT_001");
      return rpc("impor_batch", {
        p_aktor: A(c), p_jenis: b.jenis, p_rows: b.rows, p_mode: b.mode ?? undefined, p_at_awal: b.at_awal ?? undefined,
      }, T(c));
    },
  },
  {
    m: "POST", p: /^\/x\/impor\/hilang$/, perlu: "impor",
    h: async (c) => {
      const b = await c.body();
      if (typeof b.jenis !== "string" || !b.jenis) throw new GalatApi(400, "jenis wajib", "INPUT_001");
      if (!Array.isArray(b.ids_ada)) throw new GalatApi(400, "ids_ada wajib berupa array", "INPUT_001");
      return rpc("impor_tandai_hilang", {
        p_aktor: A(c), p_jenis: b.jenis, p_ids_ada: b.ids_ada.map(String), p_mode: b.mode ?? undefined,
        p_lingkup: b.lingkup ?? undefined,
      }, T(c));
    },
  },
  {
    m: "POST", p: /^\/x\/impor\/run(?:\/(mulai|selesai))?$/, perlu: "impor",
    h: async (c, g) => {
      const b = await c.body();
      const aksi = g[0] ?? b.aksi;
      if (aksi === "mulai") return rpc("impor_run_mulai", { p_aktor: A(c), p_mode: b.mode }, T(c));
      if (aksi === "selesai") {
        return rpc("impor_run_selesai", {
          p_aktor: A(c), p_id: b.id, p_counts: b.counts ?? undefined, p_census: b.census ?? undefined,
          p_diffs: b.diffs ?? undefined, p_errors: b.errors ?? undefined,
        }, T(c));
      }
      throw new GalatApi(400, 'aksi wajib "mulai" atau "selesai"', "INPUT_001");
    },
  },
  {
    // Signed upload URL Storage untuk SALINAN lampiran ClickUp (importer): path t/<task_id>/<nama>.
    // Hanya kartu asal ClickUp: lampiran kartu buatan app diunggah anggota lewat web (RLS Storage), jadi token
    // impor/backup tidak boleh menulis ke folder kartu app (review: menimpa berkas tanpa jejak activity).
    // upsert:true hanya dihormati bila path SUDAH tercatat sebagai lampiran sumber='clickup' dan tidak dirujuk
    // lampiran app; path lain diperlakukan tanpa upsert (objek yang sudah ada → 409, tidak pernah ditimpa).
    m: "POST", p: /^\/x\/impor\/upload-url$/, perlu: "impor",
    h: async (c) => {
      const b = await c.body();
      let path = typeof b.path === "string" ? b.path.trim() : "";
      if (!path && typeof b.task_id === "string" && typeof b.nama === "string") {
        path = `t/${b.task_id}/${b.nama.replace(/[\/\\]/g, "_")}`;
      }
      const m = path.match(/^t\/([A-Za-z0-9_-]+)\/([^/]+)$/);
      // deno-lint-ignore no-control-regex -- sengaja menolak karakter kontrol di nama objek
      if (!m || m[2] === "." || m[2] === ".." || /[\x00-\x1f]/.test(path)) {
        throw new GalatApi(400, "path wajib berbentuk t/<task_id>/<nama>", "INPUT_001");
      }
      await rpc("api_task", { p_aktor: A(c), p_task: m[1] }, T(c)); // tugas wajib ada (+ cek token di DB)
      const [tugas] = await pilih("tasks", `select=sumber&id=eq.${encodeURIComponent(m[1])}&deleted_at=is.null`);
      if (!tugas) throw new GalatApi(404, "Tugas tidak ditemukan", "ITEM_013");
      if (tugas.sumber !== "clickup") {
        throw new GalatApi(403, "Unggah lewat importer hanya untuk kartu asal ClickUp (kartu ini buatan app)", "ACCESS_001");
      }
      const mintaTimpa = b.upsert === true;
      let timpa = false;
      if (mintaTimpa) {
        const rujuk = await pilih("attachments", `select=sumber&storage_path=eq.${encodeURIComponent(path)}`);
        if (rujuk.some((a) => a.sumber !== "clickup")) {
          throw new GalatApi(403, "Berkas ini lampiran buatan app: tidak boleh ditimpa lewat importer", "ACCESS_001");
        }
        timpa = rujuk.length > 0;
      }
      const headers: Record<string, string> = { ...kunciService(), "content-type": "application/json" };
      if (timpa) headers["x-upsert"] = "true";
      const { res, data } = await http(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${encPath(path)}`, {
        method: "POST", headers, body: "{}",
      });
      if (!res.ok) {
        const pesan = String((data as Obj)?.message ?? (data as Obj)?.error ?? "");
        if (res.status === 409 || /exists/i.test(pesan)) {
          throw new GalatApi(409, mintaTimpa
            ? "Objek sudah ada dan belum tercatat sebagai salinan lampiran ClickUp: tidak boleh ditimpa"
            : "Objek sudah ada (upsert:true hanya untuk salinan lampiran ClickUp yang sudah tercatat)", "KONFLIK_001");
        }
        console.error(`upload-url gagal: HTTP ${res.status} ${pesan}`);
        throw new GalatApi(502, "Storage gagal membuat URL unggah", "APP_502");
      }
      const rel = String((data as Obj)?.url ?? "");
      const token = new URL(rel, "http://x").searchParams.get("token");
      return { bucket: BUCKET, path, url: `${PUBLIC_URL}/storage/v1${rel}`, token, method: "PUT", berlaku_detik: 7200 };
    },
  },
];

// ---------------------------------------------------------------- server
function normalPath(pathname: string): string {
  let p = pathname.replace(/\/+$/, "") || "/";
  p = p.replace(/^\/functions\/v1(?=\/)/, "");
  p = p.replace(/^\/api(?=\/|$)/, ""); // nama fungsi
  p = p.replace(/^\/api(?=\/|$)/, ""); // awalan /api ala ClickUp (base .../functions/v1/api/api/v2)
  return p || "/";
}

async function tangani(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const path = normalPath(url.pathname);

  // Rute tanpa token app (sebelum preflight umum & loop RUTE): penerima klik situs + CSV unggah Google Ads.
  if (path === PATH_KLIK) return await iklanKlik(req, method);
  if (/^\/x\/iklan\/unggah(?:\.csv)?$/.test(path)) return await iklanUnggah(req, method);
  if (path === "/x/wa/webhook") return await waWebhook(req, method);
  if (path === "/x/wa/bagi") return await waBagi(req, method);
  if (path === "/x/wa/sapu") return await waSapu(req, method);
  if (path === "/x/wa/proses" || path === "/x/wa/jaga") return await waProsesJaga(req, method, path === "/x/wa/proses" ? "proses" : "jaga");

  if (method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (!(await originBoleh(origin))) return json(403, { err: "Origin tidak diizinkan", ECODE: "ACCESS_001" });
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin!, "access-control-allow-methods": CORS_METHODS,
        "access-control-allow-headers": CORS_HEADERS, "access-control-max-age": "600", vary: "Origin",
      },
    });
  }

  if (method === "POST" && path === "/x/admin/berita-tarik") return json(200, await adminBeritaTarik(req));
  if (method === "POST" && path === "/x/admin/wa-pengetahuan") return json(200, await adminWaPengetahuan(req));
  if (method === "POST" && /^\/x\/admin\/(akun|reset|purge)$/.test(path)) {
    const aksi = path.slice("/x/admin/".length);
    return json(200, aksi === "akun" ? await adminAkun(req) : aksi === "reset" ? await adminReset(req) : await adminPurge(req));
  }

  let cocokPath = false;
  for (const r of RUTE) {
    const g = path.match(r.p);
    if (!g) continue;
    cocokPath = true;
    if (r.m !== method) continue;
    const { tok } = await tokenDari(req);
    wajibScope(tok, r.perlu);
    if (r.owner && tok.role !== "owner") throw new GalatApi(403, "Hanya owner yang boleh menghapus tugas", "HAPUS_OWNER");
    let dibaca: Promise<Obj> | null = null;
    const ctx: Ctx = { req, url, q: url.searchParams, tok, body: () => (dibaca ??= bacaBody(req)) };
    const hasil = await r.h(ctx, g.slice(1).filter((x) => x !== undefined));
    return hasil instanceof Response ? hasil : json(200, hasil ?? {});
  }
  if (cocokPath) return json(405, { err: `Method ${method} tidak didukung untuk ${path}`, ECODE: "APP_001" });
  return json(404, { err: "Route not found", ECODE: "APP_001" });
}

Deno.serve(async (req) => {
  let res: Response;
  try {
    res = await tangani(req);
    if (req.method.toUpperCase() === "OPTIONS") return res; // preflight sudah lengkap header CORS-nya
  } catch (e) {
    if (e instanceof GalatApi) res = galat(e);
    else {
      console.error("galat tak terduga:", (e as Error)?.stack ?? String(e));
      res = json(500, { err: "Galat server", ECODE: "APP_500" });
    }
  }
  return await denganCors(req, res);
});
