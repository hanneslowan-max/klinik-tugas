// Bagian layar Admin (owner) = rute bertingkat /admin/<kunci>. Urutan = urutan tab (sama dengan web lama).

export const TAB_ADMIN = [
  { kunci: "anggota", label: "Anggota" },
  { kunci: "status", label: "Status list" },
  { kunci: "struktur", label: "Struktur" },
  { kunci: "libur", label: "Hari libur" },
  { kunci: "token", label: "Token API" },
  { kunci: "pipeline", label: "Akses Pipeline" },
  { kunci: "mode", label: "Mode" },
  { kunci: "sinkron", label: "Sinkron" },
] as const;

export type KunciTabAdmin = (typeof TAB_ADMIN)[number]["kunci"];

export const TAB_ADMIN_BAKU: KunciTabAdmin = "anggota";

export function tabAdminSah(k: unknown): k is KunciTabAdmin {
  return typeof k === "string" && TAB_ADMIN.some((t) => t.kunci === k);
}

/** Tab dari path "/admin/<kunci>/…"; null bila bukan tab admin. */
export function tabDariPath(path: string | null | undefined) {
  const k = path?.match(/^\/admin\/([^/?#]+)/)?.[1];
  return TAB_ADMIN.find((t) => t.kunci === k) ?? null;
}
