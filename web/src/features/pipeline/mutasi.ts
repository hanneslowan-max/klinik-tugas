"use client";

// Tulis data Pipeline (fungsi web_pipeline_* SECURITY DEFINER). Mutasi lead mengembalikan lead terkini (bentuk sama
// dengan web_pipeline_lead untuk penulis: j_pipeline_lead(id, false)) → langsung jadi cache detail; lalu daftar &
// ringkasan dimuat ulang. Pesan galat DB (Bahasa Indonesia) diteruskan via GalatApi.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import type {
  AlasanDobel,
  CekDuplikatTelepon,
  HasilBiayaIklan,
  ItemBiayaIklan,
  JenisPelanggan,
  LeadDetail,
  PapanKategori,
  PelangganCari,
  PelangganDetail,
  ProdukLead,
  SatuanItem,
  StatusBayar,
  SumberLead,
} from "@/types/domain";

/**
 * Sesudah mutasi lead: hasil mutasi = lead terkini → cache detail (tanpa web_pipeline_lead kedua), lalu muat ulang
 * daftar & ringkasan saja (bukan akar ['pipeline']: akses, kategori, dan detail lain tidak berubah). Promise selesai
 * sesudah daftar segar termuat — dialog (Lead baru, data order) menunggu ini sebelum menutup.
 */
function segarkanPipeline(qc: QueryClient, lead?: LeadDetail) {
  if (lead) qc.setQueryData(kunci.pipelineLead(lead.id), lead);
  return Promise.all([
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineDaftar }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineRingkas }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineDasbor }),
    // statistik & log pelanggan ikut berubah (lead baru, order, batal)
    qc.invalidateQueries({ queryKey: kunci.semuaPipelinePelanggan }),
  ]);
}

/**
 * Sesudah pelanggan diubah/digabung/dibatalkan gabungnya: nama & pengelompokan pelanggan tampil di daftar lead,
 * detail lead, ringkasan (pelanggan baru), dasbor (10 PM teratas), dan semua layar pelanggan.
 */
function segarkanPelanggan(qc: QueryClient, detail?: PelangganDetail) {
  if (detail) qc.setQueryData(kunci.pipelinePelanggan(detail.pelanggan.id), detail);
  return Promise.all([
    qc.invalidateQueries({ queryKey: kunci.semuaPipelinePelanggan }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineDaftar }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineLead }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineRingkas }),
    qc.invalidateQueries({ queryKey: kunci.semuaPipelineDasbor }),
  ]);
}

/** Tempel biaya iklan (admin Pipeline) per kiriman; dasbor dimuat ulang sesudah semua kiriman. */
export function useBiayaIklanSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kiriman: ItemBiayaIklan[][]) => {
      const hasil: HasilBiayaIklan[] = [];
      for (const items of kiriman) {
        hasil.push(await rpc(klienBrowser(), "web_pipeline_biaya_iklan_set", { p: { items } as unknown as Json }));
      }
      return hasil;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: kunci.semuaPipelineDasbor }),
  });
}

export type ItemMasuk = { produk: ProdukLead; qty: number; satuan?: SatuanItem; spesifikasi?: string | null };

export type BodyLeadBaru = {
  sumber: SumberLead;
  tanggal_masuk?: string;
  konfirmasi?: boolean;
  pelanggan_id?: string;
  pelanggan?: { nama: string; jenis?: "perusahaan" | "perorangan"; kota?: string | null };
  kontak?: { nama?: string | null; telepon?: string | null; jabatan?: string | null };
  pemilik?: number;
  kebutuhan?: string | null;
  catatan?: string | null;
  items: ItemMasuk[];
};

export function useLeadBaru() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyLeadBaru) => rpc(klienBrowser(), "web_pipeline_lead_buat", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead),
  });
}

export type BodyFu = {
  lead_id: string;
  jenis: string;
  hasil?: string | null;
  rencana_berikutnya?: string | null;
};

export function useFuCatat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyFu) => rpc(klienBrowser(), "web_pipeline_fu_catat", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead),
  });
}

export type BodyTahap = {
  lead_id: string;
  /** batal_order = order dibatalkan customer (lead ORDER → BATAL; data order tetap tersimpan), wajib `alasan` */
  aksi: "penawaran" | "order" | "batal" | "alihkan" | "batal_order";
  nilai_penawaran?: number | null;
  nomor?: string;
  no_sp?: string;
  tanggal_sp?: string;
  nilai_transaksi?: number;
  alasan_batal?: string;
  alasan_batal_lain?: string | null;
  dialihkan_ke?: string;
  /** alasan pembatalan order (teks bebas 5–500 karakter sesudah dirapikan) — hanya untuk aksi batal_order */
  alasan?: string;
};

export function useTahap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyTahap) => rpc(klienBrowser(), "web_pipeline_tahap", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead),
    // ditolak (mis. PT409: tahap sudah berubah di perangkat lain) → muat ulang detail, supaya tombol yang disebut pesan
    // galat ("Batalkan order"/"Data order") benar-benar tampil
    onError: (_e, body) => qc.invalidateQueries({ queryKey: kunci.pipelineLead(body.lead_id) }),
  });
}

export type BodyLeadUbah = {
  lead_id: string;
  kebutuhan?: string | null;
  catatan?: string | null;
  sumber?: SumberLead;
  klaim?: boolean;
  items?: ItemMasuk[];
};

export function useLeadUbah() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyLeadUbah) => rpc(klienBrowser(), "web_pipeline_lead_ubah", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead),
  });
}

export type BodyOrderUbah = {
  lead_id: string;
  nilai_transaksi?: number;
  tanggal_sp?: string;
  /** nomor urut SP (angka) → server membangun nomor/KODE/ROMAWI/TAHUN dari tanggal SP */
  nomor?: string;
  no_po?: string | null;
  bayar_status?: StatusBayar;
  bayar_dp?: number | null;
  tanggal_dp?: string | null;
  tanggal_lunas?: string | null;
};

/** Ubah data order (nominal, No SP, No PO, pembayaran) — hanya kunci yang dikirim yang berubah. */
export function useOrderUbah() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyOrderUbah) => rpc(klienBrowser(), "web_pipeline_order_ubah", { p: body as unknown as Json }),
    onSuccess: (lead) => segarkanPipeline(qc, lead),
  });
}

/** Pencarian pelanggan (dedup saat input lead baru). Dipanggil imperatif (debounce di komponen). */
export function cariPelanggan(q: string): Promise<PelangganCari[]> {
  return rpc(klienBrowser(), "web_pipeline_pelanggan_cari", { p_q: q });
}

/**
 * Lead lain dengan nomor WA/telepon yang sama (peringatan dobel, bukan blokir; IMP-CMO-261015-1). Maks 5 terbaru +
 * total. Dipanggil imperatif saat kolom telepon ditinggalkan & sebelum simpan.
 */
export function cekDuplikatTelepon(telepon: string): Promise<CekDuplikatTelepon> {
  return rpc(klienBrowser(), "web_pipeline_cek_duplikat", { p_telepon: telepon });
}

// -------------------------------------------------------------------- database pelanggan (20261017120000)
export type BodyPelangganUbah = {
  pelanggan_id: string;
  nama?: string;
  kota?: string | null;
  jenis?: JenisPelanggan;
  catatan?: string | null;
};

/** Ubah nama/kota/jenis/catatan pelanggan (admin & rep). Hanya kunci yang dikirim yang berubah. */
export function usePelangganUbah() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyPelangganUbah) => rpc(klienBrowser(), "web_pipeline_pelanggan_ubah", { p: body as unknown as Json }),
    onSuccess: (detail) => segarkanPelanggan(qc, detail),
  });
}

export type BodyGabung = { ke_id: string; dari_ids: string[]; nama?: string; alasan?: AlasanDobel };

/** Gabungkan pelanggan dobel ke satu pelanggan (admin). Lead & kontak dipindah; bisa dibatalkan. */
export function usePelangganGabung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyGabung) => rpc(klienBrowser(), "web_pipeline_pelanggan_gabung", { p: body as unknown as Json }),
    onSuccess: (detail) => segarkanPelanggan(qc, detail),
  });
}

/** Batalkan satu penggabungan (admin): pelanggan asal pulih dengan lead & kontaknya. */
export function usePelangganGabungBatal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gabungId: number) =>
      rpc(klienBrowser(), "web_pipeline_pelanggan_gabung_batal", { p: { gabung_id: gabungId } }),
    onSuccess: (detail) => segarkanPelanggan(qc, detail),
  });
}

/** Tandai saran dobel sebagai "bukan dobel" (admin). Hasil = saran terkini. */
export function usePelangganBukanDobel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { alasan: AlasanDobel; ids: string[] }) =>
      rpc(klienBrowser(), "web_pipeline_pelanggan_dobel_abaikan", { p: body as unknown as Json }),
    onSuccess: (dobel) => {
      qc.setQueryData(kunci.pipelinePelangganDobel, dobel);
      return qc.invalidateQueries({ queryKey: [...kunci.semuaPipelinePelanggan, "detail"] });
    },
  });
}

// -------------------------------------------------------------------- kategori papan pribadi
export type BodyKategoriSimpan =
  | { aksi: "buat"; nama: string }
  | { aksi: "ganti_nama"; id: string; nama: string }
  | { aksi: "hapus"; id: string }
  | { aksi: "urut"; ids: string[] };

/** Tambah / ganti nama / hapus / urutkan kategori sendiri. Server mengembalikan keadaan papan terkini → jadi cache. */
export function useKategoriSimpan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BodyKategoriSimpan) =>
      rpc(klienBrowser(), "web_pipeline_kategori_simpan", { p: body as unknown as Json }),
    onSuccess: (papan) => qc.setQueryData(kunci.pipelineKategori, papan),
  });
}

const KUNCI_PINDAH = ["pipeline-kategori-pindah"] as const;

/**
 * Pindahkan lead ke kategori (null = "Tanpa kategori"). Optimistis: posisi di cache langsung diubah supaya kartu
 * tidak "melompat balik" selama menyimpan. Data server dimuat ulang hanya saat pindah TERAKHIR yang sedang berjalan
 * selesai (berhasil atau gagal) — jadi seret cepat beruntun tidak saling menimpa, dan gagal = kembali ke data server.
 */
export function useKategoriPindah() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: KUNCI_PINDAH,
    mutationFn: (body: { lead_id: string; kategori_id: string | null }) =>
      rpc(klienBrowser(), "web_pipeline_kategori_pindah", { p: body as unknown as Json }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: kunci.pipelineKategori });
      qc.setQueryData<PapanKategori>(kunci.pipelineKategori, (lama) => {
        if (!lama) return lama;
        const posisi = { ...lama.posisi };
        if (body.kategori_id) posisi[body.lead_id] = body.kategori_id;
        else delete posisi[body.lead_id];
        return { ...lama, posisi };
      });
    },
    onSettled: () =>
      qc.isMutating({ mutationKey: KUNCI_PINDAH }) === 1
        ? qc.invalidateQueries({ queryKey: kunci.pipelineKategori })
        : undefined,
  });
}

/**
 * Ganti sales (pemilik) satu atau banyak lead sekaligus; pemilik null = tanpa pemilik. Semua-atau-tidak di server.
 * Pemilik tampil di daftar, detail, ringkasan per sales, dan log pelanggan → semua dimuat ulang.
 */
export function useGantiSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lead_ids: string[]; pemilik: number | null }) =>
      rpc(klienBrowser(), "web_pipeline_ganti_sales", { p: body as unknown as Json }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: kunci.semuaPipelineDaftar }),
        qc.invalidateQueries({ queryKey: kunci.semuaPipelineLead }),
        qc.invalidateQueries({ queryKey: kunci.semuaPipelineRingkas }),
        qc.invalidateQueries({ queryKey: kunci.semuaPipelineDasbor }),
        qc.invalidateQueries({ queryKey: kunci.semuaPipelinePelanggan }),
      ]),
  });
}
