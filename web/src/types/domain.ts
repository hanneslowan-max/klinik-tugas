// Tipe domain = bentuk JSON hasil fungsi web_* (supabase/migrations/20260929110400_a2_web.sql).
// Argumen fungsi ada di types/database.ts (hasil `supabase gen types`); hasilnya jsonb, jadi dipetakan di sini.

export type IdAnggota = number;

export type Peran = "owner" | "member" | "bot";
export type ModeAplikasi = "cermin" | "utama";
export type Sumber = "app" | "clickup";
export type TipeStatus = "open" | "custom" | "done" | "closed";
export type KategoriDue = "telat" | "hari_ini" | "tiga_hk" | "nanti" | "tanpa_due";
export type Prioritas = 1 | 2 | 3 | 4;

/** Anggota ringkas (assignee, penulis, aktor). */
export type AnggotaRingkas = {
  id: IdAnggota;
  username: string;
  nama?: string | null;
  color?: string | null;
  initials?: string | null;
  aktif?: boolean;
};

export type Profil = {
  mode: ModeAplikasi;
  owner: boolean;
  member: {
    id: IdAnggota;
    nama: string | null;
    role: Peran;
    aktif: boolean;
    color: string | null;
    email: string | null;
    initials: string | null;
    username: string;
    harus_ganti_password: boolean;
  } | null;
  /** tanggal WIB hari ini 'YYYY-MM-DD' (dari server) */
  hari_ini: string;
  notif_belum: number;
  app_base_url: string;
  anggota_aktif: boolean;
};

export type Anggota = {
  id: IdAnggota;
  username: string;
  nama: string | null;
  role: Peran;
  aktif: boolean;
  color: string | null;
  email: string | null;
  initials: string | null;
  punya_akun: boolean;
  clickup_email: string | null;
  impor_clickup: boolean;
  harus_ganti_password: boolean;
};

export type StatusList = {
  status: string;
  type: TipeStatus;
  color: string | null;
  orderindex: number;
};

/** Baris tugas (daftar, Tugas Saya, cari, sub-tugas, hasil mutasi) = public.j_baris. */
export type Tugas = {
  id: string;
  url: string;
  name: string;
  versi: number;
  list: { id: string; name: string; tidak_ditagih: boolean };
  space_id: string;
  folder_id: string | null;
  parent_id: string | null;
  status: string;
  status_type: TipeStatus;
  status_color: string | null;
  selesai: boolean;
  archived: boolean;
  priority: Prioritas | null;
  due_at: string | null;
  due_wib: string | null;
  due_has_time: boolean;
  start_at: string | null;
  kategori_due: KategoriDue | null;
  assignees: AnggotaRingkas[];
  comment_count: number;
  last_comment_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deleted_at: string | null;
  orderindex: number | string | null;
  sumber: Sumber;
  menunggu_keputusan: boolean;
};

export type TugasSaya = {
  tanggal: string;
  member: { id: IdAnggota; nama: string | null; username: string } | null;
  telat: Tugas[];
  hari_ini: Tugas[];
  tiga_hk: Tugas[];
  nanti: Tugas[];
  tanpa_due: Tugas[];
  menunggu_keputusan?: Tugas[];
  tidak_ditagih?: Tugas[];
};

export type HitunganList = { arsip: number; telat: number; selesai: number; terbuka: number; menunggu: number };

export type ListStruktur = {
  id: string;
  name: string;
  sumber: Sumber;
  archived: boolean;
  folder_id: string | null;
  orderindex: number;
  tidak_ditagih: boolean;
  statuses: StatusList[];
  hitungan: HitunganList;
};

export type FolderStruktur = {
  id: string;
  name: string;
  hidden: boolean;
  sumber: Sumber;
  archived: boolean;
  orderindex: number;
  lists: ListStruktur[];
};

export type SpaceStruktur = {
  id: string;
  name: string;
  sumber: Sumber;
  private: boolean;
  archived: boolean;
  orderindex: number;
  anggota: IdAnggota[];
  folders: FolderStruktur[];
  lists: ListStruktur[];
};

export type Struktur = { hari_ini: string; spaces: SpaceStruktur[] };

/** List datar dengan konteks space/folder (untuk pemilih list, remah). */
export type ListDatar = ListStruktur & { space: SpaceStruktur; folder: FolderStruktur | null; label: string };

export type DaftarList = {
  list: {
    id: string;
    name: string;
    sumber: Sumber;
    archived: boolean;
    space_id: string;
    folder_id: string | null;
    statuses: StatusList[];
    boleh_ubah: boolean;
    tidak_ditagih: boolean;
  };
  tasks: Tugas[];
};

export type Lampiran = {
  id: string;
  task_id: string;
  comment_id: string | null;
  title: string | null;
  extension: string | null;
  mimetype: string | null;
  size: number | null;
  storage_path: string | null;
  clickup_url: string | null;
  status_salin: "ok" | "gagal" | "tautan_saja" | null;
  sumber: Sumber;
  uploaded_by: { id: IdAnggota; username: string } | null;
  created_at: string;
  deleted_at: string | null;
};

export type BagianKomentar =
  | { text: string; type?: undefined }
  | { type: "tag"; user: { id: IdAnggota; username: string; color?: string | null; email?: string | null; initials?: string | null } };

export type Komentar = {
  id: string;
  task_id: string;
  parent_id: string | null;
  text: string | null;
  body_json: BagianKomentar[] | null;
  author: AnggotaRingkas | null;
  sumber: Sumber;
  dihapus: boolean;
  mentions: IdAnggota[];
  lampiran: Lampiran[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type KomentarUtas = Komentar & { balasan: Komentar[] };

export type JejakTanggal = { wib: string | null; at: string | null; has_time: boolean } | null;

export type Snapshot = {
  komentar: number;
  balasan: number;
  lampiran: number;
  ada_url: boolean;
  komentar_terakhir: { user: string; date: string; teks200: string } | null;
};

export type Aktivitas = {
  id: number;
  at: string;
  at_awal: string | null;
  jenis: string;
  sumber: "ui" | "api" | "impor" | "sinkron" | "sistem";
  // bentuk dari/ke bergantung jenis (status, due, assignee, nama, deskripsi, …)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dari: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ke: any;
  aktor: { id: IdAnggota; username: string } | null;
  aktor_assignee: boolean | null;
  lengkap: boolean;
  catatan: string | null;
  snapshot: Snapshot | null;
};

export type AssigneeDetail = AnggotaRingkas & {
  added_at: string | null;
  beban: number | null;
  beban_lebih: boolean;
};

export type TugasDetail = Tugas & {
  markdown: string | null;
  description_plain: string | null;
  desc_unreadable: boolean;
  extra: {
    tags?: { name?: string; tag_bg?: string; tag_fg?: string }[];
    checklists?: ChecklistClickUp[];
    [kunci: string]: unknown;
  } | null;
  space: { id: string; name: string } | null;
  folder: { id: string; name: string; hidden: boolean } | null;
  statuses: StatusList[];
  creator: { id: IdAnggota; nama: string | null; username: string } | null;
  clickup_id: string | null;
  clickup_url: string | null;
  start_has_time: boolean;
  done_at: string | null;
  first_closed_at: string | null;
  archived_at: string | null;
  deleted_by: { id: IdAnggota; username: string } | null;
  reopen_count: number;
  synced_at: string | null;
};

export type ButirChecklist = {
  id?: string;
  name?: string | null;
  resolved?: boolean;
  orderindex?: number | string | null;
  children?: ButirChecklist[];
};
export type ChecklistClickUp = { id?: string; name?: string | null; items: ButirChecklist[] };

export type DetailTugas = {
  task: TugasDetail;
  boleh: { ubah: boolean; hapus: boolean; cermin: boolean };
  peringatan: { due_libur: string | null; beban_lebih: string[]; due_akhir_pekan: boolean };
  parent: { id: string; name: string; deleted: boolean } | null;
  assignees: AssigneeDetail[];
  subtasks: Tugas[];
  lampiran: Lampiran[];
  komentar: KomentarUtas[];
  activity: Aktivitas[];
};

export type HasilCari = {
  hasil: Tugas[];
  rujukan: { type: "list" | "folder" | "space" | "task"; id: string } | null;
};

export type Notifikasi = {
  id: number;
  jenis: "assign" | "mention" | "komentar";
  task: { id: string; name: string; deleted: boolean } | null;
  actor: AnggotaRingkas | null;
  cuplikan: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type DaftarNotif = { belum: number; items: Notifikasi[] };

export type TokenApi = {
  id: string;
  nama: string;
  prefix: string;
  scope: "baca" | "tulis" | "impor";
  member: { id: IdAnggota; username: string; role: Peran };
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type TokenBaru = {
  id: string;
  token: string;
  prefix: string;
  member_id: IdAnggota;
  nama: string;
  scope: TokenApi["scope"];
  created_at: string;
};

export type RunSinkron = {
  id: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  // counts/census/diffs/errors = catatan bebas importer (impor/sinkron.mjs)
  counts: Record<string, unknown> | null;
  census: Record<string, unknown> | null;
  diffs: unknown;
  errors: unknown;
};

export type DataSinkron = { mode: ModeAplikasi; runs: RunSinkron[] };

export type HasilPurge = { purged: string[]; storage_paths: string[] };

/** Hasil Edge /x/admin/purge: web_purge + objek Storage yang terhapus/tertinggal. */
export type HasilPurgeEdge = HasilPurge & { storage_dihapus?: string[]; storage_sisa?: string[] };

/** Peta nama fungsi web_* → bentuk hasilnya. */
export type HasilRpc = {
  web_saya: Profil;
  web_struktur: Struktur;
  web_tugas_saya: TugasSaya;
  web_daftar: DaftarList;
  web_detail: DetailTugas;
  web_cari: HasilCari;
  web_notif: DaftarNotif;
  web_notif_baca: { dibaca: number };
  web_anggota: Anggota[];
  web_tenggat: unknown;
  web_buat_tugas: Tugas;
  web_ubah_tugas: Tugas;
  web_urut: Tugas;
  web_pindah: Tugas;
  web_arsip: Tugas;
  web_hapus: Tugas;
  web_pulihkan: Tugas;
  web_purge: HasilPurge;
  web_komentar: Komentar;
  web_komentar_edit: Komentar;
  web_komentar_hapus: Komentar;
  web_lampiran_catat: Lampiran;
  web_lampiran_hapus: Lampiran;
  web_sudah_ganti_password: unknown;
  web_admin_anggota_simpan: Anggota;
  web_admin_status_simpan: unknown;
  web_admin_struktur_simpan: unknown;
  web_admin_libur_simpan: unknown;
  web_admin_mode: unknown;
  web_admin_token_buat: TokenBaru;
  web_admin_token_cabut: unknown;
  web_admin_tokens: TokenApi[];
  web_admin_sinkron: DataSinkron;
};
