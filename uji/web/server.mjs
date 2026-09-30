#!/usr/bin/env node
// Server statis kecil untuk web-lama/ (dev lokal & Playwright). Meniru web-lama/.htaccess:
//  - berkas yang ada dilayani langsung; /css|/js|/vendor atau path berekstensi yang tidak ada → 404
//  - rute lain (SPA: /saya, /t/<id>, /l/<id>, …) → index.html
//  - header keamanan sama (CSP ketat; origin Supabase diambil dari web-lama/config.js)
//   PORT=4173 HOST=127.0.0.1 node uji/web/server.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web-lama');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

// origin Supabase untuk CSP: SUPABASE_URL pertama di config.js (blok LOKAL), bisa ditimpa env SUPABASE_URL
const cfg = readFileSync(join(AKAR, 'config.js'), 'utf8');
const supa = new URL(process.env.SUPABASE_URL || (cfg.match(/SUPABASE_URL:\s*'([^']+)'/) || [])[1] || 'http://127.0.0.1:54321');
const ws = `${supa.protocol === 'https:' ? 'wss:' : 'ws:'}//${supa.host}`;
const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  `img-src 'self' blob: data: ${supa.origin}`, `connect-src 'self' ${supa.origin} ${ws}`,
  "font-src 'self'", "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'", "base-uri 'none'",
  "form-action 'self'", "object-src 'none'",
].join('; ');

const TIPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
};

const HEADER = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

async function berkas(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? p : null;
  } catch { return null; }
}

function cacheControl(rel) {
  if (/^vendor\/.+-\d+\.\d+\.\d+\./.test(rel)) return 'public, max-age=31536000, immutable';
  if (/^(sw\.js|config\.js|index\.html)$/.test(rel)) return 'no-cache, no-store, must-revalidate';
  return 'no-cache';
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...HEADER, Allow: 'GET, HEAD' });
      return res.end();
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let path = decodeURIComponent(url.pathname);
    if (path.includes('\0')) throw new Error('path tidak sah');
    const segmen = path.split('/').filter(Boolean);
    if (segmen.some((s) => s.startsWith('.'))) {               // dotfiles (.htaccess dst.) ditolak
      res.writeHead(403, HEADER);
      return res.end('Terlarang');
    }
    const lengkap = normalize(join(AKAR, path));
    if (lengkap !== AKAR && !lengkap.startsWith(AKAR + sep)) {
      res.writeHead(403, HEADER);
      return res.end('Terlarang');
    }
    let target = await berkas(path.endsWith('/') ? join(lengkap, 'index.html') : lengkap);
    if (!target) {
      if (/^\/(css|js|vendor)\//.test(path) || /\.[A-Za-z0-9]{1,8}$/.test(path)) {
        res.writeHead(404, { ...HEADER, 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Tidak ditemukan');
      }
      target = join(AKAR, 'index.html');                      // rute SPA
    }
    const rel = target.slice(AKAR.length + 1).split(sep).join('/');
    const isi = await readFile(target);
    res.writeHead(200, {
      ...HEADER,
      'Content-Type': TIPE[extname(target)] || 'application/octet-stream',
      'Content-Length': isi.length,
      'Cache-Control': cacheControl(rel),
    });
    res.end(req.method === 'HEAD' ? undefined : isi);
  } catch (e) {
    res.writeHead(400, { ...HEADER, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Permintaan tidak sah');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`web-lama/ disajikan di http://${HOST}:${PORT} (Supabase ${supa.origin})`);
});
