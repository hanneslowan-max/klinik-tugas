"use client";

import { useMemo, useSyncExternalStore } from "react";

import { imporAman } from "@/lib/impor-aman";
import { pecahUrl } from "@/lib/teks";
import { cn } from "@/lib/utils";

// lib/markdown (markdown-it + DOMPurify, ±53 KB gz) dimuat MALAS: tidak ikut JS awal /t. Disimpan di tingkat modul
// (sekali per halaman) dan diumumkan ke <Markdown> lewat useSyncExternalStore.
type ModMarkdown = typeof import("@/lib/markdown");
let modMarkdown: ModMarkdown | null = null;
let janjiMarkdown: Promise<ModMarkdown> | null = null;
const pendengarMarkdown = new Set<() => void>();

/** Mulai unduh lib/markdown (aman dipanggil berkali-kali). Dipanggil saat detail tugas mount, sejajar web_detail. */
export function muatMarkdown(): Promise<ModMarkdown> {
  janjiMarkdown ??= imporAman(() => import("@/lib/markdown")).then(
    (m) => {
      modMarkdown = m;
      for (const f of pendengarMarkdown) f();
      return m;
    },
    (galat: unknown) => {
      janjiMarkdown = null; // boleh dicoba lagi pada mount berikutnya; sementara tetap teks polos
      throw galat;
    },
  );
  return janjiMarkdown;
}

function langgananMarkdown(f: () => void) {
  pendengarMarkdown.add(f);
  muatMarkdown().catch(() => {});
  return () => {
    pendengarMarkdown.delete(f);
  };
}

/**
 * Markdown → HTML yang sudah disaring DOMPurify (html:false di markdown-it). Dirender KLIEN-SAJA: DOMPurify butuh
 * DOM (di server ia tak bisa menyaring). HTML server, hidrasi pertama, dan selama lib/markdown belum termuat = teks
 * polos (node teks React, TANPA innerHTML); sesudahnya = HTML aman. Mount klien saat lib sudah termuat (navigasi)
 * langsung HTML tanpa kedipan.
 */
export function Markdown({ teks, className, ...rest }: { teks: string | null | undefined; className?: string; "data-uji"?: string }) {
  const md = useSyncExternalStore(
    langgananMarkdown,
    () => modMarkdown,
    () => null,
  );
  const html = useMemo(() => (md ? md.htmlAman(teks) : ""), [md, teks]);
  if (!md) {
    return (
      <div className={cn("md break-words whitespace-pre-wrap", className)} data-uji={rest["data-uji"]}>
        {teks ?? ""}
      </div>
    );
  }
  // isi sudah disanitasi DOMPurify (lib/markdown.ts)
  return <div className={cn("md", className)} data-uji={rest["data-uji"]} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Teks polos dengan URL http(s) menjadi tautan (tanpa innerHTML). */
export function TeksBertautan({ teks }: { teks: string }) {
  return (
    <>
      {pecahUrl(teks).map((p, i) =>
        p.jenis === "url" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">
            {p.isi}
          </a>
        ) : (
          <span key={i}>{p.isi}</span>
        ),
      )}
    </>
  );
}
