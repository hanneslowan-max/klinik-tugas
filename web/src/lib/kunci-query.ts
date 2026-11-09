// Kunci TanStack Query terpusat, supaya invalidasi sesudah mutasi konsisten di semua layar.
import type { DariNotif } from "@/types/domain";

export const kunci = {
  anggota: ["anggota"] as const,
  struktur: ["struktur"] as const,
  tugasSaya: (member: number | null) => ["tugas-saya", member ?? "saya"] as const,
  semuaTugasSaya: ["tugas-saya"] as const,
  daftar: (list: string, termasukSelesai: boolean) => ["daftar", list, termasukSelesai] as const,
  semuaDaftar: ["daftar"] as const,
  detail: (id: string) => ["detail", id] as const,
  /** akar semua detail kartu (nama kategori berganti / kategori dihapus) */
  semuaDetail: ["detail"] as const,
  semuaCari: ["cari"] as const,
  /** kategori pekerjaan + hitungan (Jelajah, pemilih kategori) */
  kategoriKerja: ["kategori-kerja"] as const,
  /** isi satu kategori (null = tanpa kategori) */
  isiKategori: (id: string | null, selesai: boolean) => ["isi-kategori", id ?? "tanpa", selesai] as const,
  semuaIsiKategori: ["isi-kategori"] as const,
  cari: (q: string, space: string) => ["cari", q, space] as const,
  /** akar invalidasi semua tab notifikasi (realtime, sesudah tandai dibaca) */
  notif: ["notif"] as const,
  /** satu tab notifikasi "Dari tim" / "Dari agent" (datanya sendiri, limit sendiri) */
  notifDari: (dari: DariNotif) => ["notif", dari] as const,
  sampah: ["sampah"] as const,
  // Berita (owner): akar invalidasi sesudah tarik/tanda; edisi (null = terbaru), semua item per saringan, tersimpan
  berita: ["berita"] as const,
  beritaEdisi: (edisi: number | null) => ["berita", "edisi", edisi ?? "terbaru"] as const,
  beritaSemua: (wilayah: string, sumber: string, q: string) => ["berita", "semua", wilayah, sumber, q] as const,
  beritaTersimpan: ["berita", "tersimpan"] as const,
  adminTokens: ["admin", "tokens"] as const,
  adminSinkron: ["admin", "sinkron"] as const,
  adminLibur: ["admin", "libur"] as const,
  adminKategori: ["admin", "kategori"] as const,
  // Pipeline (sales)
  pipelineSaya: ["pipeline", "saya"] as const,
  pipelineDaftar: (tab: string, pemilik: number | null, q: string) =>
    ["pipeline", "daftar", tab, pemilik ?? "semua", q] as const,
  /** akar semua varian daftar lead (tab/pemilik/cari) */
  semuaPipelineDaftar: ["pipeline", "daftar"] as const,
  pipelineLead: (id: string) => ["pipeline", "lead", id] as const,
  /** akar semua detail lead (nama pelanggan berubah saat pelanggan diubah/digabung) */
  semuaPipelineLead: ["pipeline", "lead"] as const,
  // database pelanggan (20261017120000)
  pipelinePelangganDaftar: (q: string, saring: string, urut: string) => ["pipeline", "pelanggan", "daftar", q, saring, urut] as const,
  pipelinePelanggan: (id: string) => ["pipeline", "pelanggan", "detail", id] as const,
  pipelinePelangganDobel: ["pipeline", "pelanggan", "dobel"] as const,
  /** akar semua data pelanggan (daftar, detail, saran dobel) */
  semuaPipelinePelanggan: ["pipeline", "pelanggan"] as const,
  pipelineRingkas: (bulan: string, dasar: string) => ["pipeline", "ringkas", bulan, dasar] as const,
  /** akar semua varian ringkasan bulanan */
  semuaPipelineRingkas: ["pipeline", "ringkas"] as const,
  /** keutuhan kode klik iklan → lead → order (web_iklan_ringkas) */
  pipelineIklanRingkas: ["pipeline", "iklan", "ringkas"] as const,
  pipelineDasbor: (bulan: string) => ["pipeline", "dasbor", bulan] as const,
  pipelineDasborIds: (metrik: string, pemilik: string, bulan: string) => ["pipeline", "dasbor", "ids", metrik, pemilik, bulan] as const,
  pipelineDasborLanjut: (bulan: string) => ["pipeline", "dasbor", "lanjut", bulan] as const,
  /** akar dasbor (angka & id di baliknya) */
  semuaPipelineDasbor: ["pipeline", "dasbor"] as const,
  /** daftar akses modul Pipeline (layar admin owner) */
  pipelineAkses: ["pipeline", "akses"] as const,
  /** sales yang sah sebagai pemilik lead (pilihan Ganti sales) */
  pipelineSales: ["pipeline", "sales"] as const,
  /** kategori papan pribadi + penempatan lead milik pengguna ini */
  pipelineKategori: ["pipeline", "kategori"] as const,
  /** akar semua data Pipeline (dipakai bila hak akses berubah; mutasi lead cukup daftar + ringkasan) */
  semuaPipeline: ["pipeline"] as const,
};
