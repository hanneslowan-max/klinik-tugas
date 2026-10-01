// Lengkapi server standalone (.next/standalone) dengan public/ dan .next/static: `next build` tidak menyalinnya sendiri
// (dokumentasi Next.js, output "standalone"). Dijalankan npm otomatis sesudah `npm run build` (postbuild), jadi
// .next/standalone/server.js langsung bisa melayani CSS/JS/ikon di Hostinger maupun lokal.
import { cpSync, existsSync } from "node:fs";

if (existsSync(".next/standalone")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
}
