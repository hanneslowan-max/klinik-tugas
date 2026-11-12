"use client";

// Markdown → HTML aman: markdown-it (html:false) lalu DOMPurify. Satu-satunya jalur HTML mentah di aplikasi
// (dipakai komponen <Markdown>, juga pratinjau DOCX lewat htmlAmanDokumen), sama dengan web lama (md.js).
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });

let kaitTerpasang = false;
function pasangKait() {
  if (kaitTerpasang) return;
  kaitTerpasang = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
}

const OPSI = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed", "svg", "math"],
  FORBID_ATTR: ["style", "id", "class"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

export function htmlAman(teks: string | null | undefined): string {
  pasangKait();
  return DOMPurify.sanitize(md.render(teks || ""), OPSI) as string;
}

/**
 * HTML dari dokumen (pratinjau DOCX lewat mammoth) → HTML aman, dengan saringan yang sama. Gambar di dalam dokumen
 * berupa data:image/… (DOMPurify mengizinkan data URI hanya di img src).
 */
export function htmlAmanDokumen(html: string): string {
  pasangKait();
  return DOMPurify.sanitize(html, OPSI) as string;
}
