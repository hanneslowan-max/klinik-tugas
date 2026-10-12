"use client";

// Data & mutasi layar Admin (owner). Semua tulis lewat web_admin_* (cek owner di DB) atau Edge /x/admin/*.
// Admin selalu memakai data segar (web lama: muat ulang tiap tab dibuka) → staleTime 0 untuk kunci bersama.
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { KUNCI_LIBUR, KUNCI_PROFIL } from "@/features/profil/penyedia-profil";
import { edgeAdmin } from "@/lib/api/edge";
import { bungkusGalat, rpc } from "@/lib/api/rpc";
import { kunci } from "@/lib/kunci-query";
import { klienBrowser } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import type { Anggota, Peran, PeranPipeline, TipeStatus, TokenApi } from "@/types/domain";

/** Tandai basi & tunggu kunci yang sedang tampil selesai dimuat ulang (mutateAsync selesai sesudah data segar). */
function segarkan(qc: QueryClient, ...daftar: QueryKey[]) {
  return Promise.all(daftar.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Layar yang menampilkan struktur/status/nama list/hari kerja: struktur, daftar list, Tugas Saya, cari. */
const KUNCI_TUGAS: QueryKey[] = [kunci.struktur, kunci.semuaDaftar, kunci.semuaTugasSaya, kunci.semuaCari];

// ------------------------------------------------------------------ baca

export function useAnggotaAdmin() {
  return useQuery({ queryKey: kunci.anggota, queryFn: () => rpc(klienBrowser(), "web_anggota"), staleTime: 0 });
}

export function useStrukturAdmin() {
  return useQuery({ queryKey: kunci.struktur, queryFn: () => rpc(klienBrowser(), "web_struktur"), staleTime: 0 });
}

export function useTokenAdmin() {
  return useQuery({ queryKey: kunci.adminTokens, queryFn: () => rpc(klienBrowser(), "web_admin_tokens"), staleTime: 0 });
}

export function useSinkronAdmin() {
  return useQuery({ queryKey: kunci.adminSinkron, queryFn: () => rpc(klienBrowser(), "web_admin_sinkron"), staleTime: 0 });
}

export type HariLibur = { tanggal: string; nama: string };

async function muatLibur(): Promise<HariLibur[]> {
  const { data, error, status } = await klienBrowser().from("hari_libur").select("tanggal,nama").order("tanggal");
  if (error) throw bungkusGalat(error, status);
  return data ?? [];
}

export function useLiburAdmin() {
  return useQuery({ queryKey: kunci.adminLibur, queryFn: muatLibur, staleTime: 0 });
}

// ------------------------------------------------------------------ anggota

/** Isi web_admin_anggota_simpan: tanpa id = anggota baru; username tidak dikirim bila dikunci (impor ClickUp). */
export type DataAnggota = {
  id?: number;
  username?: string;
  nama: string;
  email: string;
  clickup_email: string;
  initials: string;
  color: string;
  role: Peran;
  aktif: boolean;
};

export function useSimpanAnggota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: DataAnggota) => rpc(klienBrowser(), "web_admin_anggota_simpan", { p: p as Json }),
    // profil ikut disegarkan (owner bisa mengubah nama/warna/inisial dirinya sendiri)
    onSuccess: () => segarkan(qc, kunci.anggota, KUNCI_PROFIL),
  });
}

/** Aktifkan login (akun baru) / setel ulang password lewat Edge /x/admin/akun|reset. */
export function useAkunAnggota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reset: boolean; anggota: Anggota; email: string; sandi: string }) =>
      v.reset
        ? edgeAdmin("reset", { member_id: v.anggota.id, password_sementara: v.sandi })
        : edgeAdmin("akun", { member_id: v.anggota.id, email: v.email, password_sementara: v.sandi }),
    onSuccess: () => segarkan(qc, kunci.anggota),
  });
}

// ------------------------------------------------------------------ status list & struktur

/** Status yang dikirim; nama_lama = ganti nama (tugas ikut pindah ke nama baru). */
export type StatusKirim = { status: string; type: TipeStatus; color: string; orderindex: number; nama_lama?: string };

export function useSimpanStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { list: string; statuses: StatusKirim[] }) =>
      rpc(klienBrowser(), "web_admin_status_simpan", { p_list: v.list, p_statuses: v.statuses as Json }),
    onSuccess: () => segarkan(qc, ...KUNCI_TUGAS),
  });
}

export type JenisStruktur = "space" | "folder" | "list";

/** Isi web_admin_struktur_simpan (tanpa hapus; arsipkan saja). */
export type DataStruktur = {
  jenis: JenisStruktur;
  id?: string;
  name?: string;
  space_id?: string;
  folder_id?: string;
  private?: boolean;
  hidden?: boolean;
  archived?: boolean;
  tidak_ditagih?: boolean;
};

export function useSimpanStruktur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: DataStruktur) => rpc(klienBrowser(), "web_admin_struktur_simpan", { p: p as Json }),
    onSuccess: () => segarkan(qc, ...KUNCI_TUGAS),
  });
}

// ------------------------------------------------------------------ hari libur

export function useSimpanLibur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: HariLibur | { tanggal: string; hapus: true }) =>
      rpc(klienBrowser(), "web_admin_libur_simpan", { p: p as Json }),
    // hari libur memengaruhi hitungan hari kerja (≤3 hk, sisa hk) di semua layar tugas
    onSuccess: () => segarkan(qc, kunci.adminLibur, KUNCI_LIBUR, kunci.semuaTugasSaya, kunci.semuaDaftar),
  });
}

// ------------------------------------------------------------------ token API

export function useBuatToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { member: number; nama: string; scope: TokenApi["scope"] }) =>
      rpc(klienBrowser(), "web_admin_token_buat", { p_member: v.member, p_nama: v.nama, p_scope: v.scope }),
    onSuccess: () => segarkan(qc, kunci.adminTokens),
  });
}

export function useCabutToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc(klienBrowser(), "web_admin_token_cabut", { p_id: id }),
    onSuccess: () => segarkan(qc, kunci.adminTokens),
  });
}

// ------------------------------------------------------------------ mode

export function useGantiMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "cermin" | "utama") => rpc(klienBrowser(), "web_admin_mode", { p_mode: mode }),
    // mode mengubah hak ubah di semua layar (kartu ClickUp terkunci/terbuka) → segarkan semuanya
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ------------------------------------------------------------------ akses modul Pipeline (owner)

/** Daftar akses Pipeline saat ini + kandidat anggota (web_pipeline_akses_daftar, owner-only). */
export function usePipelineAksesAdmin() {
  return useQuery({
    queryKey: kunci.pipelineAkses,
    queryFn: () => rpc(klienBrowser(), "web_pipeline_akses_daftar"),
    staleTime: 0,
  });
}

/** Simpan/ubah akses (hapus: true untuk mencabut). kode_sp dipakai membangun No SP (rep). */
export type DataAksesPipeline = {
  member_id: number;
  peran?: PeranPipeline;
  kode_sp?: string | null;
  hapus?: boolean;
};

export function useSimpanAksesPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: DataAksesPipeline) => rpc(klienBrowser(), "web_pipeline_akses_simpan", { p: p as Json }),
    // akses berubah → segarkan daftar akses + gerbang/menu Pipeline semua layar
    onSuccess: () => segarkan(qc, kunci.pipelineAkses, kunci.semuaPipeline),
  });
}
