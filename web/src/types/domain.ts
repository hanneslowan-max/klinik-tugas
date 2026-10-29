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

/** Kategori pekerjaan (daftar bersama, diatur owner di Admin → Kategori). */
export type KategoriKerja = { id: string; nama: string };

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
  /** kategori pekerjaan (Ads, Konten, …); null = tanpa kategori */
  kategori_kerja: KategoriKerja | null;
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

/** Asal notifikasi: tim (anggota mengetik di web) | agent (akun bot / lewat token API; aturan SQL notif_dari_agent). */
export type DariNotif = "tim" | "agent";

export type Notifikasi = {
  id: number;
  jenis: "assign" | "mention" | "komentar";
  /** tertutup = kartu di space privat yang tidak bisa dilihat penerima (nama & cuplikan disamarkan) */
  task: { id: string; name: string; deleted: boolean; tertutup?: boolean } | null;
  actor: (AnggotaRingkas & { role?: Peran }) | null;
  cuplikan: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
  dari: DariNotif;
  /** pemicunya lewat token API; true + aktor bukan bot = agent memakai token milik anggota */
  lewat_api: boolean;
};

/** belum = TOTAL belum dibaca (angka lonceng) = belum_tim + belum_agent; dari = saringan tab (null = semua). */
export type DaftarNotif = {
  belum: number;
  belum_tim: number;
  belum_agent: number;
  dari: DariNotif | null;
  items: Notifikasi[];
};

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

// ==================================================================== Pipeline (sales)
// Bentuk JSON dari fungsi web_pipeline_* (supabase/migrations/20261011120100/120200/120300).
export type PeranPipeline = "admin" | "rep" | "baca";
export type TahapLead = "BARU" | "PENAWARAN" | "ORDER" | "BATAL" | "DIALIHKAN";
export type SumberLead =
  | "Google Ads" | "Meta Ads" | "Website organik" | "Instagram/TikTok organik"
  | "WA langsung" | "Telepon" | "Referral" | "Repeat order" | "Lainnya";
export type ProdukLead =
  | "Roda" | "Pallet Mesh" | "Airport Trolley" | "Shopping Cart"
  | "Lemari Arsip" | "Material Handling" | "Locker" | "Lainnya";
export type SatuanItem = "unit" | "set" | "pcs";
export type JenisAktivitas = "Telepon" | "WA" | "Email" | "Visit" | "Kirim penawaran" | "Catatan" | "Catatan impor";
/** "Order dibatalkan" khusus aksi batal_order (order yang dibatalkan customer, 20261014130000) — bukan pilihan Batal biasa. */
export type AlasanBatal =
  | "Harga" | "Stok/waktu kirim" | "Spesifikasi tidak cocok" | "Tidak ada respon"
  | "Beli di tempat lain" | "Proyek batal/ditunda" | "Lainnya" | "Order dibatalkan";
export type JenisPelanggan = "perusahaan" | "perorangan";
/**
 * Kelas bukti sumber lead dari chat WA 0878 (diisi agent, pola tetap; 20261021120000) = public.pipeline_sumber_bukti_kelas().
 * Label tampilan: BUKTI_SUMBER di features/pipeline/konstanta.ts.
 */
export type KelasBuktiSumber =
  | "situs-rh" | "situs-oy" | "web-rh" | "ga-rh" | "web-oy" | "ga-oy" | "meta"
  | "lastri" | "katalog-wa" | "xs-pm" | "tidur" | "tanpa-sinyal";

/** Hasil web_pipeline_saya: gerbang menu & layar (§6). kode_sp = kode SP aktor sendiri (pratinjau No SP). */
/** Status pembayaran order (revisi #7). */
export type StatusBayar = "BELUM" | "DP" | "LUNAS";

export type PipelineSaya = { peran: PeranPipeline | null; boleh_ringkas: boolean; kode_sp: string | null };

export type ItemLead = {
  id: number;
  produk: ProdukLead;
  qty: number;
  satuan: SatuanItem;
  spesifikasi: string | null;
  periksa?: boolean;
};

export type ItemLeadRingkas = { produk: ProdukLead; qty: number; satuan: SatuanItem };

export type AktivitasLead = {
  id: number;
  waktu: string;
  oleh: IdAnggota | null;
  jenis: JenisAktivitas;
  hasil: string | null;
  rencana_berikutnya: string | null;
};

export type RiwayatTahapLead = { dari: TahapLead | null; ke: TahapLead; waktu: string };
/** Pergantian pemilik (sales) lead: Ganti sales, Klaim, klaim otomatis saat ORDER (29 Okt 2026). */
export type RiwayatPemilikLead = {
  dari: IdAnggota | null;
  dari_nama: string | null;
  ke: IdAnggota | null;
  ke_nama: string | null;
  oleh: IdAnggota | null;
  oleh_nama: string | null;
  waktu: string;
};
/** Sales yang sah sebagai pemilik lead (web_pipeline_sales): owner, atau akses Pipeline admin/rep. */
export type SalesPipeline = { id: IdAnggota; username: string; nama: string | null; peran: PeranPipeline; kode_sp: string | null };
/** Hasil web_pipeline_ganti_sales. */
export type HasilGantiSales = { diubah: number; sama: number; pemilik: IdAnggota | null; pemilik_nama: string | null };

/** Nama & telepon null bila disamarkan (peran 'baca' / Yosie, §6). */
export type KontakLead = { id: string; nama: string | null; telepon: string | null; jabatan: string | null };
export type PelangganLead = { id: string; nama: string; jenis: JenisPelanggan; kota: string | null };

/** Baris ringkas daftar lead = public.j_pipeline_lead_ringkas. */
export type LeadRingkas = {
  id: string;
  kode: string;
  tahap: TahapLead;
  sumber: SumberLead;
  pelanggan: string;
  kota: string | null;
  pemilik: IdAnggota | null;
  pemilik_nama: string | null;
  /** kode SP pemilik (RSG/MCE) — pratinjau No SP di dialog Data order */
  pemilik_kode_sp: string | null;
  tanggal_masuk: string;
  diam_hari: number;
  fu_berikutnya: string | null;
  nilai_transaksi: number | null;
  no_sp: string | null;
  tanggal_sp: string | null;
  /** No PO dari customer (terpisah dari No SP RHJ) */
  no_po: string | null;
  /** null = order lama yang status bayarnya belum dicatat (atau lead belum ORDER) */
  bayar_status: StatusBayar | null;
  bayar_dp: number | null;
  tanggal_dp: string | null;
  tanggal_lunas: string | null;
  periksa: boolean;
  pelanggan_id: string;
  /** jumlah lead LAIN pelanggan yang sama yang sudah ORDER dan masuk lebih dulu (> 0 = repeat, 20261017120000) */
  order_sebelumnya: number;
  produk: ItemLeadRingkas[];
  /** bukti sumber dari chat WA (agent, hanya-baca; 20261021120000) — sama dengan LeadDetail */
  sumber_bukti: KelasBuktiSumber | null;
  sumber_bukti_kode: string | null;
  sumber_bukti_chat_pada: string | null;
  sumber_bukti_diisi_pada: string | null;
};

/** Detail lead penuh = public.j_pipeline_lead. */
export type LeadDetail = {
  id: string;
  kode: string;
  tanggal_masuk: string;
  tahap: TahapLead;
  sumber: SumberLead;
  pemilik: IdAnggota | null;
  pemilik_nama: string | null;
  pemilik_kode_sp: string | null;
  dialihkan_ke: string | null;
  kebutuhan: string | null;
  catatan: string | null;
  catatan_impor: string | null;
  nilai_penawaran: number | null;
  tanggal_penawaran: string | null;
  no_sp: string | null;
  tanggal_sp: string | null;
  nilai_transaksi: number | null;
  no_po: string | null;
  bayar_status: StatusBayar | null;
  bayar_dp: number | null;
  tanggal_dp: string | null;
  tanggal_lunas: string | null;
  /** siapa & kapan data pembayaran terakhir diubah */
  bayar_diubah_oleh_nama: string | null;
  bayar_diubah_pada: string | null;
  alasan_batal: AlasanBatal | null;
  /** teks alasan "Lainnya", atau alasan tertulis saat order dibatalkan (alasan_batal = "Order dibatalkan") */
  alasan_batal_lain: string | null;
  periksa: boolean;
  periksa_sebab: string | null;
  ref_sheet: string | null;
  diam_sejak: string | null;
  diam_hari: number;
  /** rencana FU terbaru (YYYY-MM-DD); kosong saat catat FU di lead BARU/PENAWARAN → server isi +2 hari kerja */
  fu_berikutnya: string | null;
  dibuat_pada: string;
  pelanggan: PelangganLead;
  kontak: KontakLead | null;
  items: ItemLead[];
  aktivitas: AktivitasLead[];
  riwayat_tahap: RiwayatTahapLead[];
  riwayat_pemilik: RiwayatPemilikLead[];
  /**
   * Bukti sumber dari chat WA 0878, diisi agent lewat x_pipeline_sumber_bukti_set (20261021120000). Terpisah dari
   * `sumber` isian sales; hanya-baca di web. Semua null = belum ada bukti. kode mis. "GA-OY-7K3F" / "PM-06";
   * chat_pada = pesan pertama pelanggan di chat itu (ISO).
   */
  sumber_bukti: KelasBuktiSumber | null;
  sumber_bukti_kode: string | null;
  sumber_bukti_chat_pada: string | null;
  sumber_bukti_diisi_pada: string | null;
};

export type DaftarLead = { total: number; items: LeadRingkas[] };

/** Hasil web_pipeline_pelanggan_cari (dedup saat input lead baru). */
export type PelangganCari = {
  id: string;
  nama: string;
  kota: string | null;
  jenis: JenisPelanggan;
  /** nama pengisi ("-", "Perorangan", …) — tampilkan nama PIC */
  semu: boolean;
  jml_lead: number;
  jml_order: number;
  order_terakhir: string | null;
  kontak: { id: string; nama: string | null; telepon: string | null }[];
};

/** Satu lead lain dengan nomor WA/telepon yang sama (web_pipeline_cek_duplikat). */
export type LeadDuplikat = {
  id: string;
  kode: string;
  pelanggan: string;
  tahap: TahapLead;
  pemilik: IdAnggota | null;
  /** sales pemilik lead (username Anvil) */
  pemilik_nama: string | null;
  /** nama PIC di pihak pelanggan (kontak) */
  kontak_nama: string | null;
  tanggal_masuk: string;
  dibuat_pada: string;
};

/** Hasil web_pipeline_cek_duplikat: maks 5 lead terbaru + total. Nomor < 8 digit diabaikan (telepon null, items kosong). */
export type CekDuplikatTelepon = { telepon: string | null; total: number; items: LeadDuplikat[] };

// -------------------------------------------------------------------- database pelanggan (20261017120000)
/** Kartu pelanggan (daftar, saran) = public.j_pipeline_pelanggan_ringkas. pic null untuk peran 'baca'. */
export type PelangganRingkas = {
  id: string;
  nama: string;
  semu: boolean;
  jenis: JenisPelanggan;
  kota: string | null;
  pic: string | null;
  jml_lead: number;
  jml_order: number;
  jml_batal: number;
  jml_aktif: number;
  nilai_order: number;
  lead_pertama: string | null;
  lead_terakhir: string | null;
  /** tanggal order = tanggal SP (atau tanggal masuk bila SP kosong) */
  order_pertama: string | null;
  order_terakhir: string | null;
  produk: ProdukLead[];
};

export type DaftarPelanggan = { total: number; items: PelangganRingkas[] };
export type SaringPelanggan = "semua" | "order" | "repeat" | "aktif";
export type UrutPelanggan = "terakhir" | "order" | "nilai" | "nama";
export type AlasanDobel = "nama" | "telepon" | "mirip";

export type GabungPelanggan = {
  id: number;
  dari_id: string;
  dari_nama: string;
  jml_lead: number;
  jml_kontak: number;
  cara: "manual" | "otomatis";
  alasan: AlasanDobel | null;
  oleh_nama: string | null;
  waktu: string;
  dibatalkan_pada: string | null;
  dibatalkan_oleh_nama: string | null;
};

/** Hasil web_pipeline_pelanggan. Kontak kosong + kontak_disembunyikan untuk peran 'baca' (§6). */
export type PelangganDetail = {
  pelanggan: { id: string; nama: string; semu: boolean; jenis: JenisPelanggan; kota: string | null; catatan: string | null; pic: string | null };
  kontak: { id: string; nama: string | null; telepon: string | null; jabatan: string | null; jml_lead: number }[];
  kontak_disembunyikan: boolean;
  ringkas: {
    jml_lead: number;
    jml_order: number;
    jml_batal: number;
    jml_aktif: number;
    nilai_order: number;
    lead_pertama: string | null;
    lead_terakhir: string | null;
    order_pertama: string | null;
    order_terakhir: string | null;
    produk: ProdukLead[];
    /** rata-rata jarak antar order (hari), null bila < 2 order */
    jeda_order_hari: number | null;
  };
  /** semua lead pelanggan ini, terbaru dulu */
  leads: LeadRingkas[];
  gabung: GabungPelanggan[];
  /** saran pelanggan yang mungkin sama (admin saja) */
  mungkin_sama: (PelangganRingkas & { alasan: AlasanDobel })[];
  boleh_ubah: boolean;
  boleh_gabung: boolean;
};
/** Tautan lama ke pelanggan yang sudah digabung → id tujuannya. */
export type PelangganDigabung = { digabung_ke: string };

export type KelompokDobel = { kunci: string; alasan: AlasanDobel; anggota: (PelangganRingkas & { telepon: string[] })[] };
export type DaftarDobel = { total: number; kelompok: KelompokDobel[] };

/** win-rate kecil = public.pipeline_wr. */
export type WinRate = { order: number; batal: number; matang: number; rate: number | null };

export type RingkasBulanRep = { pemilik: IdAnggota | null; username: string | null; order: number; omzet: number };

export type RingkasBulan = {
  bulan: string;
  leads: number;
  pelanggan_baru: number;
  penawaran: number;
  order: number;
  batal: number;
  dialihkan: number;
  omzet_total: number;
  per_rep: RingkasBulanRep[];
};

export type RingkasPerSumber = { sumber: SumberLead; leads: number; order: number; omzet: number };
export type RingkasPerProduk = { produk: ProdukLead; leads: number; order: number; omzet: number };
export type RingkasPerAlasan = { alasan: string; jumlah: number };

/** Hasil web_pipeline_ringkas (§4). Breakdown per_* = keseluruhan (semua bulan). */
export type RingkasPipeline = {
  dasar: "sp" | "lead";
  bulan: RingkasBulan[];
  /** Kohort lead umur >= umur_matang_hari (metode routine Analisa Pipeline); menang = ORDER, "batal" = sisanya. */
  win_rate: {
    semua: WinRate; pm: WinRate; pm_kecil_lt20: WinRate; pm_besar_ge20: WinRate;
    pm_qty_belum_diisi?: number; umur_matang_hari?: number; definisi?: string;
  };
  siklus_hari_rata2: number | null;
  per_sumber: RingkasPerSumber[];
  per_produk: RingkasPerProduk[];
  per_alasan_batal: RingkasPerAlasan[];
};

// -------------------------------------------------------------------- akses modul (admin owner)
/** Satu baris akses Pipeline (web_pipeline_akses_daftar / _simpan). */
export type AksesPipelineRow = {
  member_id: IdAnggota;
  username: string;
  nama: string | null;
  role: Peran;
  aktif: boolean;
  peran: PeranPipeline;
  kode_sp: string | null;
};
/** Kandidat anggota yang bisa diberi akses (anggota aktif role 'member'). */
export type AnggotaPilihAkses = { id: IdAnggota; username: string; nama: string | null; role: Peran };
/** Hasil web_pipeline_akses_daftar: daftar akses saat ini + kandidat anggota. */
export type DaftarAksesPipeline = { akses: AksesPipelineRow[]; anggota: AnggotaPilihAkses[] };

// -------------------------------------------------------------------- kategori papan pribadi
/** Satu kolom papan Pipeline buatan pengguna sendiri (pribadi, tidak terlihat pengguna lain). */
export type KategoriPipeline = { id: string; nama: string; urutan: number };
/** Hasil web_pipeline_kategori / _simpan: kategori urut + penempatan {lead_id: kategori_id}. Lead tanpa entri = "Tanpa kategori". */
export type PapanKategori = { kategori: KategoriPipeline[]; posisi: Record<string, string> };

// -------------------------------------------------------------------- kategori pekerjaan (Jelajah)
export type HitunganKategori = { terbuka: number; telat: number; selesai: number };
/** web_kategori_kerja: kategori urut + hitungan tugas terlihat; `tanpa` = tugas tanpa kategori. */
export type DaftarKategoriKerja = {
  hari_ini: string;
  kategori: (KategoriKerja & { urutan: number; hitungan: HitunganKategori })[];
  tanpa: HitunganKategori;
};
/** web_tugas_kategori: tugas terbuka satu kategori lintas list (+ yang terakhir selesai bila diminta). */
export type IsiKategori = {
  kategori: KategoriKerja | null;
  tanggal: string;
  tasks: Tugas[];
  jumlah_selesai: number;
  selesai: Tugas[] | null;
};
/** web_admin_kategori(_simpan): kategori + jumlah tugas (tidak terhapus). */
export type KategoriAdmin = KategoriKerja & { urutan: number; jumlah: number };

/** Peta nama fungsi web_* → bentuk hasilnya. */
export type HasilRpc = {
  web_saya: Profil;
  web_struktur: Struktur;
  web_tugas_saya: TugasSaya;
  web_kategori_kerja: DaftarKategoriKerja;
  web_tugas_kategori: IsiKategori;
  web_atur_kategori: Tugas;
  web_admin_kategori: KategoriAdmin[];
  web_admin_kategori_simpan: KategoriAdmin[];
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
  web_pipeline_saya: PipelineSaya;
  web_pipeline_daftar: DaftarLead;
  web_pipeline_lead: LeadDetail;
  web_pipeline_lead_buat: LeadDetail;
  web_pipeline_fu_catat: LeadDetail;
  web_pipeline_tahap: LeadDetail;
  web_pipeline_lead_ubah: LeadDetail;
  web_pipeline_order_ubah: LeadDetail;
  web_pipeline_pelanggan_cari: PelangganCari[];
  web_pipeline_cek_duplikat: CekDuplikatTelepon;
  web_pipeline_pelanggan_daftar: DaftarPelanggan;
  web_pipeline_pelanggan: PelangganDetail | PelangganDigabung;
  web_pipeline_pelanggan_ubah: PelangganDetail;
  web_pipeline_pelanggan_gabung: PelangganDetail;
  web_pipeline_pelanggan_gabung_batal: PelangganDetail;
  web_pipeline_pelanggan_dobel: DaftarDobel;
  web_pipeline_pelanggan_dobel_abaikan: DaftarDobel;
  web_pipeline_ringkas: RingkasPipeline;
  web_pipeline_akses_daftar: DaftarAksesPipeline;
  // simpan mengembalikan daftar akses terkini (tanpa nama/role/aktif); layar menyegar lewat _daftar.
  web_pipeline_akses_simpan: Pick<AksesPipelineRow, "member_id" | "username" | "peran" | "kode_sp">[];
  web_pipeline_kategori: PapanKategori;
  web_pipeline_kategori_simpan: PapanKategori;
  web_pipeline_kategori_pindah: { lead_id: string; kategori_id: string | null };
  web_pipeline_sales: SalesPipeline[];
  web_pipeline_ganti_sales: HasilGantiSales;
};
