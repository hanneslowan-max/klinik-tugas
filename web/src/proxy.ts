// Proxy (dulu "middleware"): nonce CSP per permintaan, penyegaran sesi Supabase, dan pengalihan ke /masuk
// untuk halaman yang butuh login. Pemeriksaan hak yang sebenarnya tetap di database (RLS + fungsi web_*).
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { bawaCookie, segarkanSesi } from "@/lib/supabase/proxy";

const HALAMAN_PUBLIK = ["/masuk"];

function kebijakanKeamanan(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  const supa = env.supabaseUrl ? new URL(env.supabaseUrl) : null;
  const asalSupa = supa ? supa.origin : "";
  const wsSupa = supa ? `${supa.protocol === "https:" ? "wss:" : "ws:"}//${supa.host}` : "";
  const aturan = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // atribut style inline dipakai Radix (posisi popover) & dnd-kit (transform kartu yang diseret)
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${asalSupa}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${asalSupa} ${wsSupa}`.trim(),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!dev && supa?.protocol === "https:") aturan.push("upgrade-insecure-requests");
  return aturan.join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = kebijakanKeamanan(nonce);

  const terusan = new Headers(request.headers);
  terusan.set("x-nonce", nonce);
  terusan.set("content-security-policy", csp);
  terusan.set("x-path", request.nextUrl.pathname + request.nextUrl.search);

  const { respons, adaPengguna } = await segarkanSesi(request, terusan);
  const path = request.nextUrl.pathname;
  const publik = HALAMAN_PUBLIK.some((p) => path === p || path.startsWith(`${p}/`));

  let akhir = respons;
  if (!adaPengguna && !publik) {
    const tujuan = request.nextUrl.clone();
    tujuan.pathname = "/masuk";
    tujuan.search = "";
    const lanjut = path + request.nextUrl.search;
    if (lanjut !== "/") tujuan.searchParams.set("lanjut", lanjut);
    akhir = bawaCookie(respons, NextResponse.redirect(tujuan));
  }
  akhir.headers.set("content-security-policy", csp);
  return akhir;
}

export const config = {
  matcher: [
    {
      // semua halaman kecuali aset statis, ikon, manifest, service worker
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|ikon|manifest.webmanifest|sw.js|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
