"use client";

import { useMemo } from "react";

import { htmlAman } from "@/lib/markdown";
import { pecahUrl } from "@/lib/teks";
import { cn } from "@/lib/utils";

/** Markdown → HTML yang sudah disaring DOMPurify (html:false di markdown-it). */
export function Markdown({ teks, className, ...rest }: { teks: string | null | undefined; className?: string; "data-uji"?: string }) {
  const html = useMemo(() => htmlAman(teks), [teks]);
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
