// Kunci TanStack Query terpusat, supaya invalidasi sesudah mutasi konsisten di semua layar.
export const kunci = {
  anggota: ["anggota"] as const,
  struktur: ["struktur"] as const,
  tugasSaya: (member: number | null) => ["tugas-saya", member ?? "saya"] as const,
  semuaTugasSaya: ["tugas-saya"] as const,
  daftar: (list: string, termasukSelesai: boolean) => ["daftar", list, termasukSelesai] as const,
  semuaDaftar: ["daftar"] as const,
  detail: (id: string) => ["detail", id] as const,
  semuaCari: ["cari"] as const,
  cari: (q: string, space: string) => ["cari", q, space] as const,
  notif: ["notif"] as const,
  sampah: ["sampah"] as const,
  adminTokens: ["admin", "tokens"] as const,
  adminSinkron: ["admin", "sinkron"] as const,
  adminLibur: ["admin", "libur"] as const,
};
