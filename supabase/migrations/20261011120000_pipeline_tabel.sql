-- Modul Pipeline (sales Riksa & Michael) — Langkah 2. Pengganti Google Sheet "Customer Pipeline".
-- ADITIF: tabel/fungsi/RLS baru; TIDAK menyentuh tabel tugas yang sudah ada. Rancangan:
-- rhj-brain/deliverables/pipeline-anvil/RANCANGAN-MODUL-PIPELINE.md (keputusan K1–K11 final).
-- File ini = skema data + RLS + trigger. Fungsi tulis (§3) & ringkasan (§4) di migrasi berikutnya.
--
-- Konvensi ikut docs/KONTRAK-DB.md: id teks via id_baru(prefix,len); RLS ON semua tabel; policy SELECT saja,
-- semua tulis lewat fungsi SECURITY DEFINER (mulai_web/mulai_api set app.actor_id); grant fail-closed.

-- ============================================================ akses modul
-- Siapa melihat modul Pipeline + perannya. Owner selalu admin (implisit). Diisi owner lewat fungsi admin
-- (bukan di migrasi — supaya berlaku sama di DB lokal uji & produksi). peran: admin | rep | baca.
create table public.pipeline_akses (
  member_id     bigint primary key references public.members (id) on delete cascade,
  peran         text not null check (peran in ('admin', 'rep', 'baca')),
  ditambah_oleh bigint references public.members (id),
  ditambah_pada timestamptz not null default now()
);

-- ============================================================ pelanggan & kontak
create table public.pelanggan (
  id          text primary key default public.id_baru('pl', 8),
  nama        text not null,
  jenis       text not null default 'perusahaan' check (jenis in ('perusahaan', 'perorangan')),
  kota        text,
  catatan     text,
  dibuat_oleh bigint references public.members (id),
  dibuat_pada timestamptz not null default now(),
  cari        tsvector,
  constraint pelanggan_nama_isi check (length(btrim(nama)) > 0),
  constraint pelanggan_id_pola check (id ~ '^pl[0-9a-z]+$')
);
create index pelanggan_cari_idx on public.pelanggan using gin (cari);
create index pelanggan_nama_trgm_idx on public.pelanggan using gin (nama extensions.gin_trgm_ops);

create table public.kontak (
  id             text primary key default public.id_baru('kt', 8),
  pelanggan_id   text not null references public.pelanggan (id) on delete cascade,
  nama           text,
  telepon        text,                    -- ternormalisasi 62… (digit saja)
  telepon_tampil text,                     -- bentuk asli untuk ditampilkan (0812-…)
  jabatan        text,
  dibuat_pada    timestamptz not null default now(),
  constraint kontak_id_pola check (id ~ '^kt[0-9a-z]+$')
);
create index kontak_pelanggan_idx on public.kontak (pelanggan_id);
create index kontak_telepon_idx on public.kontak (telepon) where telepon is not null;

-- ============================================================ lead (1 peluang = 1 baris INPUT lama)
create sequence public.lead_kode_seq as bigint start with 1 minvalue 1;

create table public.lead (
  id              text primary key default public.id_baru('ld', 8),
  kode            text not null unique default ('L-' || lpad(nextval('public.lead_kode_seq')::text, 5, '0')),
  tanggal_masuk   date not null default public.hari_ini_wib(),
  pelanggan_id    text not null references public.pelanggan (id),
  kontak_id       text references public.kontak (id),
  sumber          text not null check (sumber in (
                    'Google Ads', 'Meta Ads', 'Website organik', 'WA langsung', 'Telepon',
                    'Referral', 'Repeat order', 'Lainnya')),
  pemilik         bigint references public.members (id),       -- anggota Anvil (Riksa/Michael/…) atau NULL
  dialihkan_ke    text,                                        -- K9: teks bebas (nama sales/cabang tujuan)
  tahap           text not null default 'BARU' check (tahap in ('BARU', 'PENAWARAN', 'ORDER', 'BATAL', 'DIALIHKAN')),
  kebutuhan       text,
  catatan         text,
  catatan_impor   text,                                        -- teks F (Status) asli saat impor
  nilai_penawaran bigint check (nilai_penawaran is null or nilai_penawaran >= 0),
  tanggal_penawaran date,                                      -- otomatis saat masuk PENAWARAN (trigger)
  no_sp           text,
  tanggal_sp      date,
  nilai_transaksi bigint check (nilai_transaksi is null or nilai_transaksi >= 0),
  alasan_batal    text check (alasan_batal is null or alasan_batal in (
                    'Harga', 'Stok/waktu kirim', 'Spesifikasi tidak cocok', 'Tidak ada respon',
                    'Beli di tempat lain', 'Proyek batal/ditunda', 'Lainnya')),
  alasan_batal_lain text,
  periksa         boolean not null default false,              -- impor: butuh diperiksa manusia (§7)
  periksa_sebab   text,
  ref_sheet       text,                                        -- impor: no. baris sheet (mis. r1983)
  diam_sejak      timestamptz,                                 -- turunan: aktivitas terakhir (trigger)
  fu_berikutnya   date,                                        -- turunan: rencana FU terbaru (trigger) → tab "Follow up hari ini"
  dibuat_oleh     bigint references public.members (id),
  dibuat_pada     timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  cari            tsvector,
  constraint lead_id_pola check (id ~ '^ld[0-9a-z]+$')
);
-- SP unik untuk input baru (yang bersih). Baris impor bertanda periksa dikecualikan (dobel historis diizinkan
-- masuk dengan tanda PERIKSA; keunikan input baru ditegakkan lagi di fungsi tulis §3).
create unique index lead_no_sp_uniq on public.lead (no_sp) where no_sp is not null and not periksa;
create index lead_pemilik_idx on public.lead (pemilik) where pemilik is not null;
create index lead_tahap_idx on public.lead (tahap);
create index lead_tanggal_masuk_idx on public.lead (tanggal_masuk);
create index lead_tanggal_sp_idx on public.lead (tanggal_sp) where tanggal_sp is not null;
create index lead_pelanggan_idx on public.lead (pelanggan_id);
create index lead_diam_idx on public.lead (diam_sejak);
create index lead_fu_idx on public.lead (fu_berikutnya) where fu_berikutnya is not null;
create index lead_periksa_idx on public.lead (periksa) where periksa;
create index lead_cari_idx on public.lead using gin (cari);

-- produk per lead (bisa >1); qty WAJIB semua produk (K5)
create table public.lead_item (
  id            bigint generated always as identity primary key,
  lead_id       text not null references public.lead (id) on delete cascade,
  produk        text not null check (produk in (
                  'Roda', 'Pallet Mesh', 'Airport Trolley', 'Shopping Cart', 'Lemari Arsip',
                  'Material Handling', 'Locker', 'Lainnya')),
  qty           numeric not null check (qty > 0),
  satuan        text not null default 'unit' check (satuan in ('unit', 'set', 'pcs')),
  spesifikasi   text,
  periksa       boolean not null default false,                -- impor: H bukan PM tapi teks sebut "pallet" (§7)
  periksa_sebab text
);
create index lead_item_lead_idx on public.lead_item (lead_id);
create index lead_item_produk_idx on public.lead_item (produk);

-- riwayat follow-up (pengganti kolom M + N sheet)
create table public.lead_aktivitas (
  id                bigint generated always as identity primary key,
  lead_id           text not null references public.lead (id) on delete cascade,
  waktu             timestamptz not null default now(),
  oleh              bigint references public.members (id),
  jenis             text not null check (jenis in (
                      'Telepon', 'WA', 'Email', 'Visit', 'Kirim penawaran', 'Catatan', 'Catatan impor')),
  hasil             text,
  rencana_berikutnya date,
  dibuat_pada       timestamptz not null default now()
);
create index lead_aktivitas_lead_idx on public.lead_aktivitas (lead_id, waktu desc);

-- riwayat tahap (diisi trigger otomatis) → siklus penjualan & win-rate per tahap
create table public.lead_riwayat_tahap (
  id      bigint generated always as identity primary key,
  lead_id text not null references public.lead (id) on delete cascade,
  dari    text,
  ke      text not null,
  waktu   timestamptz not null default now(),
  oleh    bigint references public.members (id)
);
create index lead_riwayat_tahap_lead_idx on public.lead_riwayat_tahap (lead_id, waktu);

-- ============================================================ trigger (turunan + riwayat)
-- BEFORE lead: created/updated, dibuat_oleh, diam_sejak awal, tanggal_penawaran otomatis, tsvector cari.
create or replace function public.pipeline_lead_sebelum()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.dibuat_pada := now();
    new.diperbarui_pada := now();
    new.dibuat_oleh := coalesce(new.dibuat_oleh, public.aktor());
    new.diam_sejak := coalesce(new.diam_sejak, now());
  else
    new.dibuat_pada := old.dibuat_pada;
    new.dibuat_oleh := old.dibuat_oleh;
    new.diperbarui_pada := now();
  end if;
  if new.tahap = 'PENAWARAN' and new.tanggal_penawaran is null then
    new.tanggal_penawaran := public.hari_ini_wib();
  end if;
  new.cari := to_tsvector('simple'::regconfig,
    coalesce(new.kode, '') || ' ' || coalesce(new.no_sp, '') || ' ' ||
    coalesce(new.kebutuhan, '') || ' ' || coalesce(new.catatan, ''));
  return new;
end; $$;

-- AFTER lead: catat perubahan tahap (dan tahap awal saat dibuat) ke lead_riwayat_tahap.
create or replace function public.pipeline_lead_sesudah()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_riwayat_tahap (lead_id, dari, ke, oleh) values (new.id, null, new.tahap, public.aktor());
  elsif new.tahap is distinct from old.tahap then
    insert into public.lead_riwayat_tahap (lead_id, dari, ke, oleh) values (new.id, old.tahap, new.tahap, public.aktor());
  end if;
  return null;
end; $$;

-- AFTER aktivitas: perbarui diam_sejak (aktivitas terakhir) di lead.
create or replace function public.pipeline_aktivitas_sesudah()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.lead
     set diam_sejak = greatest(coalesce(diam_sejak, new.waktu), new.waktu),
         fu_berikutnya = new.rencana_berikutnya   -- rencana FU terbaru menang (null = tak ada rencana)
   where id = new.lead_id;
  return null;
end; $$;

-- BEFORE pelanggan: tsvector cari (nama + kota).
create or replace function public.pipeline_pelanggan_sebelum()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.dibuat_pada := now();
    new.dibuat_oleh := coalesce(new.dibuat_oleh, public.aktor());
  else
    new.dibuat_pada := old.dibuat_pada;
    new.dibuat_oleh := old.dibuat_oleh;
  end if;
  new.cari := to_tsvector('simple'::regconfig, coalesce(new.nama, '') || ' ' || coalesce(new.kota, ''));
  return new;
end; $$;

create trigger pipeline_lead_sebelum before insert or update on public.lead
  for each row execute function public.pipeline_lead_sebelum();
create trigger pipeline_lead_sesudah after insert or update on public.lead
  for each row execute function public.pipeline_lead_sesudah();
create trigger pipeline_aktivitas_sesudah after insert on public.lead_aktivitas
  for each row execute function public.pipeline_aktivitas_sesudah();
create trigger pipeline_pelanggan_sebelum before insert or update on public.pelanggan
  for each row execute function public.pipeline_pelanggan_sebelum();

-- ============================================================ RLS
alter table public.pipeline_akses      enable row level security;
alter table public.pelanggan           enable row level security;
alter table public.kontak              enable row level security;
alter table public.lead                enable row level security;
alter table public.lead_item           enable row level security;
alter table public.lead_aktivitas      enable row level security;
alter table public.lead_riwayat_tahap  enable row level security;

-- Pembantu akses (SECURITY DEFINER; pakai penilai() = anggota JWT di web, aktor() di API). search_path kosong.
create or replace function public.pipeline_akses_saya()
returns text language sql stable security definer set search_path = '' as $$
  select pa.peran from public.pipeline_akses pa where pa.member_id = public.penilai()
$$;
-- Akses penuh (lihat data mentah incl. telepon/PIC): owner + rep/admin. 'baca' (Yosie) TIDAK; dia baca lewat
-- fungsi web_pipeline_* yang menyamarkan telepon & nama PIC (§6).
create or replace function public.boleh_pipeline_penuh()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner() or public.pipeline_akses_saya() in ('admin', 'rep')
$$;
-- Akses modul (termasuk 'baca'): untuk visibilitas menu & jalur baca tersamar.
create or replace function public.boleh_pipeline()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_owner() or public.pipeline_akses_saya() is not null
$$;

-- Policy SELECT: data mentah hanya untuk owner + rep/admin (Yosie/'baca' lewat fungsi tersamar).
create policy baca_pipeline on public.pelanggan          for select to authenticated using ((select public.boleh_pipeline_penuh()));
create policy baca_pipeline on public.kontak             for select to authenticated using ((select public.boleh_pipeline_penuh()));
create policy baca_pipeline on public.lead               for select to authenticated using ((select public.boleh_pipeline_penuh()));
create policy baca_pipeline on public.lead_item          for select to authenticated using ((select public.boleh_pipeline_penuh()));
create policy baca_pipeline on public.lead_aktivitas     for select to authenticated using ((select public.boleh_pipeline_penuh()));
create policy baca_pipeline on public.lead_riwayat_tahap for select to authenticated using ((select public.boleh_pipeline_penuh()));
-- Akses modul: owner lihat semua baris; anggota lihat baris sendiri.
create policy baca_pipeline on public.pipeline_akses for select to authenticated
  using ((select public.is_owner()) or member_id = (select public.member_saya()));

-- ============================================================ grant (fail-closed; RLS tetap menyaring)
grant select on
  public.pipeline_akses, public.pelanggan, public.kontak, public.lead,
  public.lead_item, public.lead_aktivitas, public.lead_riwayat_tahap
to authenticated;
grant select on
  public.pipeline_akses, public.pelanggan, public.kontak, public.lead,
  public.lead_item, public.lead_aktivitas, public.lead_riwayat_tahap
to service_role;

grant execute on function public.pipeline_akses_saya(), public.boleh_pipeline_penuh(), public.boleh_pipeline()
  to authenticated, service_role;
-- Fungsi trigger internal: tanpa EXECUTE untuk role API (dipanggil trigger milik postgres).
revoke all on function
  public.pipeline_lead_sebelum(), public.pipeline_lead_sesudah(),
  public.pipeline_aktivitas_sesudah(), public.pipeline_pelanggan_sebelum()
from public, anon, authenticated, service_role;
