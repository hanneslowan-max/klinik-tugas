-- Performa daftar Pipeline (revisi "loading terasa lambat", Okt 2026). ADITIF & aman di produksi yang sedang jalan;
-- kontrak JSON web_pipeline_daftar TIDAK berubah (dijaga uji/db/23_pipeline_daftar_cepat.sql: keluaran lama vs baru
-- identik pada ±2.000 lead). Bisa dipasang sebelum/sesudah deploy web (urutan bebas).
--
-- Masalah: inti_pipeline_daftar membangun tiap baris dengan j_pipeline_lead_ringkas(x) per lead — fungsi SQL
-- SECURITY DEFINER + SET search_path tidak di-inline, jadi tiap lead = satu eksekusi fungsi (+ hari_ini_wib() per
-- baris). Owner/admin/baca melihat SEMUA lead (±2.008): 250–300 ms hangat, 430–560 ms dingin per muat & refetch.
-- Kini satu kueri set-based (j_pipeline_lead_ringkas_banyak): ±70–110 ms.
--
-- PERHATIAN (perawatan): field ringkas lead kini ada di DUA tempat — j_pipeline_lead_ringkas (per lead, tetap dipakai
-- di tempat lain) dan j_pipeline_lead_ringkas_banyak (daftar). Menambah/mengubah field = ubah KEDUANYA; tes 23
-- memastikan bentuknya sama. Daftar field disalin dari versi final 20261013150000_pipeline_order.sql.
-- Hanya dua fungsi ini yang diubah (draf penulisan ulang ringkasan & fungsi baca tugas sengaja tidak diikutkan).

-- ============================================================ baris ringkas lead, set-based (bentuk = j_pipeline_lead_ringkas)
create or replace function public.j_pipeline_lead_ringkas_banyak(p_ids text[])
returns table (n bigint, id text, j jsonb)
language sql stable security definer set search_path = '' as $$
  with h as materialized (select public.hari_ini_wib() as hari),     -- sekali, bukan per baris
  u as (select x.id, x.n from unnest(p_ids) with ordinality as x(id, n)),
  it as (select i.lead_id,
                jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan) order by i.id) as produk
           from u join public.lead_item i on i.lead_id = u.id
          group by i.lead_id)
  select u.n, l.id, jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tahap', l.tahap, 'sumber', l.sumber,
    'pelanggan', pg.nama, 'kota', pg.kota, 'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp,
    'tanggal_masuk', l.tanggal_masuk, 'diam_hari', greatest(0, h.hari - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'nilai_transaksi', l.nilai_transaksi, 'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'no_po', l.no_po,
    'bayar_status', l.bayar_status, 'bayar_dp', l.bayar_dp, 'tanggal_dp', l.tanggal_dp, 'tanggal_lunas', l.tanggal_lunas,
    'periksa', l.periksa,
    'produk', coalesce(it.produk, '[]'::jsonb))
  from u
    join public.lead l on l.id = u.id
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
    left join it on it.lead_id = l.id
    cross join h
$$;

-- ============================================================ daftar (= versi 20261013150000, hanya ekspresi 'items' yang diganti)
create or replace function public.inti_pipeline_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_tab text := coalesce(nullif(p->>'tab', ''), 'semua');
  v_pemilik bigint := nullif(p->>'pemilik', '')::bigint;
  v_q text := nullif(btrim(coalesce(p->>'q', '')), '');
  v_pola text;
  v_ids text[];
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  -- % dan _ dari pengguna dicari apa adanya (bukan wildcard)
  v_pola := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select array_agg(l.id order by
           case when l.diam_sejak is null then 1 else 0 end, l.diam_sejak asc, l.id)
    into v_ids
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
  where (v_pemilik is null or l.pemilik = v_pemilik)
    and (v_tab <> 'diam'      or (l.tahap in ('BARU', 'PENAWARAN') and l.diam_sejak < now() - interval '7 days'))
    and (v_tab <> 'fu'        or (l.tahap in ('BARU', 'PENAWARAN') and l.fu_berikutnya is not null and l.fu_berikutnya <= public.hari_ini_wib()))
    and (v_tab <> 'pm'        or (l.tahap in ('BARU', 'PENAWARAN') and exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh')))
    and (v_tab <> 'penawaran' or l.tahap = 'PENAWARAN')
    and (v_tab <> 'order'     or l.tahap = 'ORDER')
    and (v_tab <> 'batal'     or l.tahap = 'BATAL')
    and (v_tab <> 'periksa'   or l.periksa)
    and (v_q is null
         or pg.nama ilike v_pola or l.kode ilike v_pola or l.no_sp ilike v_pola or l.no_po ilike v_pola
         or l.cari @@ plainto_tsquery('simple'::regconfig, v_q)
         or exists (select 1 from public.lead_item i
                     where i.lead_id = l.id and (i.produk ilike v_pola or i.spesifikasi ilike v_pola))
         or (v_peran in ('admin', 'rep') and exists (select 1 from public.kontak k
                     where (k.id = l.kontak_id or k.pelanggan_id = l.pelanggan_id) and k.nama ilike v_pola)));
  return jsonb_build_object(
    'total', coalesce(array_length(v_ids, 1), 0),
    -- (performa) satu kueri set-based untuk semua baris; dulu j_pipeline_lead_ringkas(x) per lead (SECURITY DEFINER +
    -- SET → tidak di-inline, hari_ini_wib() per baris): ±250–560 ms untuk 2.008 lead.
    'items', (select coalesce(jsonb_agg(b.j order by b.n), '[]'::jsonb)
              from public.j_pipeline_lead_ringkas_banyak(coalesce(v_ids, '{}'::text[])) b));
end; $$;

-- ============================================================ hak (fail-closed, pola 20261013121000): pembantu baru internal
revoke all on function public.j_pipeline_lead_ringkas_banyak(text[]) from public, anon, authenticated, service_role;
