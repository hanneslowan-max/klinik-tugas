-- Modul Pipeline — Ganti sales (revisi Hannes 29 Okt 2026: "belum ada fitur edit untuk ubah PIC sales" + "sekalian
-- pindah massal"). Sebelumnya pemilik lead hanya terisi otomatis (pembuat lead, Klaim lead tanpa pemilik, atau aktor
-- yang memindah lead tanpa pemilik ke ORDER) dan tidak bisa dipindah, oleh admin sekalipun.
--
-- * web_pipeline_ganti_sales({lead_ids:[..], pemilik: id|null}): pindahkan SATU atau BANYAK lead ke sales lain
--   (null = tanpa pemilik). Semua-atau-tidak, maks. 500 lead. Hak per lead sama dengan ubah lead (pipeline_boleh_ubah):
--   admin semua lead; rep hanya lead miliknya sendiri atau tanpa pemilik (rep tidak bisa mengambil lead rep lain).
--   Tujuan harus sales aktif: owner, atau anggota akses Pipeline peran admin/rep (bukan 'baca', bukan bot).
--   Tahap apa pun (termasuk ORDER): No SP yang sudah ada tidak berubah; kode SP pemilik baru dipakai untuk SP berikutnya.
-- * web_pipeline_sales(): daftar sales yang sah sebagai tujuan (untuk pilihan di web).
-- * Riwayat: tabel lead_riwayat_pemilik (dari, ke, oleh, waktu) diisi trigger SETIAP kali pemilik berubah — termasuk
--   Klaim & klaim otomatis saat ORDER — dan tampil di Riwayat detail lead (j_pipeline_lead.riwayat_pemilik).
--
-- Konvensi ikut modul Pipeline: RLS ON + policy SELECT (boleh_pipeline_penuh, sama dengan lead_riwayat_tahap), tulis
-- hanya lewat fungsi/trigger SECURITY DEFINER, grant fail-closed (web_ → authenticated saja).

-- ============================================================ tabel riwayat
create table public.lead_riwayat_pemilik (
  id      bigint generated always as identity primary key,
  lead_id text not null references public.lead (id) on delete cascade,
  dari    bigint references public.members (id),
  ke      bigint references public.members (id),
  waktu   timestamptz not null default now(),
  oleh    bigint references public.members (id)
);
create index lead_riwayat_pemilik_lead_idx on public.lead_riwayat_pemilik (lead_id, waktu);

alter table public.lead_riwayat_pemilik enable row level security;
create policy baca_pipeline on public.lead_riwayat_pemilik for select to authenticated
  using ((select public.boleh_pipeline_penuh()));

revoke all on public.lead_riwayat_pemilik from public, anon, authenticated, service_role;
grant select on public.lead_riwayat_pemilik to authenticated, service_role;
revoke all on sequence public.lead_riwayat_pemilik_id_seq from public, anon, authenticated, service_role;

-- ============================================================ trigger: catat setiap pergantian pemilik
create or replace function public.pipeline_lead_pemilik_sesudah()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pemilik is distinct from old.pemilik then
    insert into public.lead_riwayat_pemilik (lead_id, dari, ke, oleh) values (new.id, old.pemilik, new.pemilik, public.aktor());
  end if;
  return null;
end; $$;
create trigger pipeline_lead_pemilik_sesudah after update of pemilik on public.lead
  for each row execute function public.pipeline_lead_pemilik_sesudah();

-- ============================================================ detail lead (+ riwayat_pemilik)
-- = 20261021120000_pipeline_sumber_bukti.sql + kunci riwayat_pemilik.
create or replace function public.j_pipeline_lead(p_id text, p_mask boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tanggal_masuk', l.tanggal_masuk, 'tahap', l.tahap, 'sumber', l.sumber,
    'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp, 'dialihkan_ke', l.dialihkan_ke,
    'kebutuhan', l.kebutuhan, 'catatan', l.catatan, 'catatan_impor', l.catatan_impor,
    'nilai_penawaran', l.nilai_penawaran, 'tanggal_penawaran', l.tanggal_penawaran,
    'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'nilai_transaksi', l.nilai_transaksi,
    'no_po', l.no_po, 'bayar_status', l.bayar_status, 'bayar_dp', l.bayar_dp, 'tanggal_dp', l.tanggal_dp,
    'tanggal_lunas', l.tanggal_lunas, 'bayar_diubah_oleh_nama', mb.username, 'bayar_diubah_pada', public.iso_utc(l.bayar_diubah_pada),
    'alasan_batal', l.alasan_batal, 'alasan_batal_lain', l.alasan_batal_lain,
    'periksa', l.periksa, 'periksa_sebab', l.periksa_sebab, 'ref_sheet', l.ref_sheet,
    'diam_sejak', public.iso_utc(l.diam_sejak),
    'diam_hari', greatest(0, public.hari_ini_wib() - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'dibuat_pada', public.iso_utc(l.dibuat_pada),
    'sumber_bukti', l.sumber_bukti, 'sumber_bukti_kode', l.sumber_bukti_kode,
    'sumber_bukti_chat_pada', public.iso_utc(l.sumber_bukti_chat_pada),
    'sumber_bukti_diisi_pada', public.iso_utc(l.sumber_bukti_diisi_pada),
    'pelanggan', jsonb_build_object('id', pg.id, 'nama', pg.nama, 'jenis', pg.jenis, 'kota', pg.kota),
    'kontak', case when l.kontak_id is null then null else jsonb_build_object(
      'id', k.id,
      'nama', case when p_mask then null else k.nama end,
      'telepon', case when p_mask then null else coalesce(k.telepon_tampil, k.telepon) end,
      'jabatan', k.jabatan) end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'produk', i.produk, 'qty', i.qty, 'satuan', i.satuan,
        'spesifikasi', i.spesifikasi, 'periksa', i.periksa) order by i.id), '[]'::jsonb)
      from public.lead_item i where i.lead_id = l.id),
    'aktivitas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'waktu', public.iso_utc(a.waktu), 'oleh', a.oleh, 'jenis', a.jenis,
        'hasil', a.hasil, 'rencana_berikutnya', a.rencana_berikutnya) order by a.waktu desc, a.id desc), '[]'::jsonb)
      from public.lead_aktivitas a where a.lead_id = l.id),
    'riwayat_tahap', (select coalesce(jsonb_agg(jsonb_build_object(
        'dari', r.dari, 'ke', r.ke, 'waktu', public.iso_utc(r.waktu)) order by r.id), '[]'::jsonb)
      from public.lead_riwayat_tahap r where r.lead_id = l.id),
    -- ganti sales (29 Okt 2026): siapa memindah pemilik dari siapa ke siapa
    'riwayat_pemilik', (select coalesce(jsonb_agg(jsonb_build_object(
        'dari', rp.dari, 'dari_nama', md.username, 'ke', rp.ke, 'ke_nama', mk.username,
        'oleh', rp.oleh, 'oleh_nama', mo.username, 'waktu', public.iso_utc(rp.waktu)) order by rp.id), '[]'::jsonb)
      from public.lead_riwayat_pemilik rp
        left join public.members md on md.id = rp.dari
        left join public.members mk on mk.id = rp.ke
        left join public.members mo on mo.id = rp.oleh
     where rp.lead_id = l.id))
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.kontak k on k.id = l.kontak_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
    left join public.members mb on mb.id = l.bayar_diubah_oleh
  where l.id = p_id
$$;

-- ============================================================ sales yang sah sebagai pemilik
-- owner aktif, atau anggota aktif berakses Pipeline admin/rep (bukan 'baca'; bot tidak pernah jadi pemilik).
create or replace function public.pipeline_sales_sah(p_member bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
      left join public.pipeline_akses pa on pa.member_id = m.id
     where m.id = p_member and m.aktif and m.role <> 'bot'
       and (m.role = 'owner' or pa.peran in ('admin', 'rep')))
$$;

create or replace function public.inti_pipeline_sales()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'username', m.username, 'nama', m.nama,
           'peran', coalesce(pa.peran, 'admin'), 'kode_sp', pa.kode_sp) order by lower(m.username), m.id), '[]'::jsonb)
    from public.members m
    left join public.pipeline_akses pa on pa.member_id = m.id
   where public.pipeline_sales_sah(m.id)
$$;

-- Pindahkan lead ke sales lain. p = {lead_ids: [..], pemilik: id | null}. Hasil {diubah, sama, pemilik, pemilik_nama}.
create or replace function public.inti_pipeline_ganti_sales(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_ids   text[];
  v_ke    bigint;
  v_ada   integer;
  v_asing text;
  v_ubah  integer;
begin
  if coalesce(v_peran, '') not in ('admin', 'rep') then
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'lead_ids') is distinct from 'array' then
    perform public.lempar('PT400', 'lead_ids wajib berupa array id lead', 'INPUT_001');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from jsonb_array_elements_text(p -> 'lead_ids') as x;
  if cardinality(v_ids) = 0 then perform public.lempar('PT400', 'Pilih minimal 1 lead', 'INPUT_001'); end if;
  if cardinality(v_ids) > 500 then perform public.lempar('PT400', 'Maksimal 500 lead sekali pindah', 'INPUT_001'); end if;
  if not p ? 'pemilik' then
    perform public.lempar('PT400', 'pemilik wajib (null = tanpa pemilik)', 'INPUT_001');
  end if;
  if jsonb_typeof(p -> 'pemilik') not in ('null', 'number', 'string') or (p ->> 'pemilik') !~ '^[0-9]*$' then
    perform public.lempar('PT400', 'pemilik harus id anggota atau null', 'INPUT_001');
  end if;
  v_ke := nullif(p ->> 'pemilik', '')::bigint;
  if v_ke is not null and not public.pipeline_sales_sah(v_ke) then
    perform public.lempar('PT400', 'Sales tujuan harus anggota aktif dengan akses Pipeline admin/rep', 'INPUT_001');
  end if;

  -- kunci baris (urut id: dua pemindahan bersamaan tidak saling menunggu silang)
  perform 1 from public.lead l where l.id = any (v_ids) order by l.id for update;
  select count(*) into v_ada from public.lead l where l.id = any (v_ids);
  if v_ada <> cardinality(v_ids) then perform public.lempar('PT404', 'Lead tidak ditemukan', 'ITEM_013'); end if;
  if v_peran = 'rep' then
    select string_agg(l.kode, ', ' order by l.kode) into v_asing
      from public.lead l where l.id = any (v_ids) and l.pemilik is not null and l.pemilik <> public.aktor();
    if v_asing is not null then
      perform public.lempar('PT403', format('Lead %s milik sales lain; hanya admin yang bisa memindahkannya', v_asing), 'ACCESS_001');
    end if;
  end if;

  update public.lead set pemilik = v_ke where id = any (v_ids) and pemilik is distinct from v_ke;
  get diagnostics v_ubah = row_count;
  return jsonb_build_object('diubah', v_ubah, 'sama', cardinality(v_ids) - v_ubah, 'pemilik', v_ke,
    'pemilik_nama', (select m.username from public.members m where m.id = v_ke));
end; $$;

-- ============================================================ bungkus web_ (JWT)
create or replace function public.web_pipeline_sales() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.mulai_web();
  if public.pipeline_peran_aktor() is null then
    perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001');
  end if;
  return public.inti_pipeline_sales();
end; $$;
create or replace function public.web_pipeline_ganti_sales(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_ganti_sales(p); end; $$;

-- ============================================================ hak: pembantu & inti internal; web_ → authenticated
revoke all on function
  public.pipeline_lead_pemilik_sesudah(), public.pipeline_sales_sah(bigint), public.inti_pipeline_sales(),
  public.inti_pipeline_ganti_sales(jsonb), public.web_pipeline_sales(), public.web_pipeline_ganti_sales(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_sales(), public.web_pipeline_ganti_sales(jsonb) to authenticated;
