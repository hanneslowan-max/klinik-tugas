"use client";

import { useMemo, useSyncExternalStore } from "react";

import { htmlAman } from "@/lib/markdown";
import { pecahUrl } from "@/lib/teks";
import { cn } from "@/lib/utils";

const tanpaLangganan = () => () => {};

/**
 * Markdown → HTML yang sudah disaring DOMPurify (html:false di markdown-it). Dirender KLIEN-SAJA: DOMPurify butuh
 * DOM (di server ia tak bisa menyaring). HTML server & hidrasi pertama = teks polos (node teks React, TANPA
 * innerHTML), sesudah hidrasi = HTML aman. Mount klien biasa (navigasi) langsung HTML tanpa kedipan.
 */
export function Markdown({ teks, className, ...rest }: { teks: string | null | undefined; className?: string; "data-uji"?: string }) {
  const klien = useSyncExternalStore(
    tanpaLangganan,
    () => true,
    () => false,
  );
  const html = useMemo(() => (klien ? htmlAman(teks) : ""), [klien, teks]);
  if (!klien) {
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
