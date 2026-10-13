-- 23 · Performa daftar Pipeline (20261013170000_pipeline_daftar_cepat): j_pipeline_lead_ringkas_banyak WAJIB berbentuk
-- sama dengan j_pipeline_lead_ringkas, dan web_pipeline_daftar versi set-based WAJIB identik (jsonb =) dengan versi
-- lama (20261013150000) pada volume seperti produksi (±2.000 lead) untuk admin (owner), rep, dan baca — semua tab
-- utama, pencarian, dan saringan pemilik. Pembantu baru tidak boleh dipanggil role API.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- ------------------------------------------------------------ hak & search_path
select uji.cek(not has_function_privilege('authenticated', 'public.j_pipeline_lead_ringkas_banyak(text[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.j_pipeline_lead_ringkas_banyak(text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.j_pipeline_lead_ringkas_banyak(text[])', 'EXECUTE'),
  'j_pipeline_lead_ringkas_banyak tidak bisa dipanggil role API');
select uji.cek((select coalesce(p.proconfig, '{}') @> array['search_path=""'] and p.prosecdef
                  from pg_proc p where p.oid = 'public.j_pipeline_lead_ringkas_banyak(text[])'::regprocedure),
  'j_pipeline_lead_ringkas_banyak: SECURITY DEFINER dengan search_path kosong');
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_daftar(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_daftar(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.inti_pipeline_daftar(jsonb)', 'EXECUTE'),
  'hak web_/inti_pipeline_daftar tidak berubah');

-- ------------------------------------------------------------ volume (±2.000 lead, dibatalkan di akhir)
insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null)
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota, jenis)
select 'plujicpt' || lpad(g::text, 4, '0'), 'PT Uji Cepat ' || g || ' Sejahtera', (array['Surabaya','Jakarta','Bandung','Semarang', null])[1 + g % 5], 'perusahaan'
from generate_series(1, 1500) g;
insert into public.kontak (id, pelanggan_id, nama) values ('ktujicpt1', 'plujicpt0007', 'Ibu Ratna Uji Cepat');
insert into public.lead (id, kode, pelanggan_id, sumber, pemilik, tahap, diam_sejak, fu_berikutnya, nilai_transaksi, no_sp, tanggal_sp,
                         no_po, periksa, tanggal_masuk)
select 'ldujicpt' || lpad(g::text, 5, '0'), 'UJC-' || lpad(g::text, 5, '0'), 'plujicpt' || lpad((1 + g % 1500)::text, 4, '0'),
       (array['Google Ads','Meta Ads','Website organik','WA langsung'])[1 + g % 4],
       (array[100000001, 100000002, 100000003, null]::bigint[])[1 + g % 4],
       (array['BARU','PENAWARAN','ORDER','BATAL'])[1 + g % 4],
       case when g % 11 <> 0 then now() - (g % 90) * interval '1 day' end,
       case when g % 3 = 0 then public.hari_ini_wib() - 5 + (g % 10) end,
       case when g % 4 = 2 then 1000000 + g * 1000 end,
       case when g % 4 = 2 then g || '/RSG/X/2026' end,
       case when g % 4 = 2 then public.hari_ini_wib() - (g % 200) end,
       case when g % 8 = 2 then 'PO/UJC/' || g end,
       g % 13 = 0,
       public.hari_ini_wib() - (g % 365)
from generate_series(1, 2008) g;
insert into public.lead_item (lead_id, produk, qty, satuan, spesifikasi)
select 'ldujicpt' || lpad((1 + g % 2008)::text, 5, '0'), (array['Pallet Mesh','Roda','Airport Trolley'])[1 + g % 3], 1 + g % 20, 'unit',
       case when g % 50 = 0 then 'galvanis uji cepat' end
from generate_series(1, 3000) g;
select uji.konteks(null, null);

-- ------------------------------------------------------------ bentuk baris: _banyak = j_pipeline_lead_ringkas (semua lead)
select uji.sama(
  (select count(*)::int from public.j_pipeline_lead_ringkas_banyak(array(select id from public.lead order by id)) b
    where b.j is distinct from public.j_pipeline_lead_ringkas(b.id)),
  0, '_banyak = j_pipeline_lead_ringkas untuk setiap lead');
select uji.sama(
  (select jsonb_agg(b.j order by b.n) from public.j_pipeline_lead_ringkas_banyak(array['ldujicpt00010', 'ldujicpt00003', 'ldujicpt00007']) b),
  jsonb_build_array(public.j_pipeline_lead_ringkas('ldujicpt00010'), public.j_pipeline_lead_ringkas('ldujicpt00003'),
                    public.j_pipeline_lead_ringkas('ldujicpt00007')),
  '_banyak: urutan mengikuti p_ids');
select uji.sama(uji.kunci((select b.j from public.j_pipeline_lead_ringkas_banyak(array['ldujicpt00001']) b)),
  uji.kunci(public.j_pipeline_lead_ringkas('ldujicpt00001')), '_banyak: kunci field sama');
select uji.sama((select count(*)::int from public.j_pipeline_lead_ringkas_banyak(array['ldtidakada'])), 0, '_banyak: id tak ada dilewati');
select uji.sama((select count(*)::int from public.j_pipeline_lead_ringkas_banyak('{}'::text[])), 0, '_banyak: daftar kosong');

-- ------------------------------------------------------------ keluaran lama vs baru identik
-- versi LAMA inti_pipeline_daftar (salinan persis 20261013150000) sebagai pg_temp, dijalankan sebagai postgres dengan
-- klaim JWT pengguna (penilai() membaca klaim, jadi peran Pipeline sama dengan saat dipanggil lewat web_).
create function pg_temp.daftar_lama(p jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
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
    'items', (select coalesce(jsonb_agg(public.j_pipeline_lead_ringkas(x)), '[]'::jsonb)
              from unnest(coalesce(v_ids, '{}')) as x));
end; $$;

create function pg_temp.banding(p_uid uuid, p jsonb) returns boolean language plpgsql as $$
declare v_lama jsonb; v_baru jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  v_lama := pg_temp.daftar_lama(p);
  v_baru := public.inti_pipeline_daftar(p);
  if v_lama is distinct from v_baru then
    raise notice 'BEDA % %: total lama % baru %', p_uid, p, v_lama -> 'total', v_baru -> 'total';
    return false;
  end if;
  return (v_baru ->> 'total')::int > 0 or p ? 'q';
end $$;

select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"semua"}'), 'admin (owner) · semua: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"fu"}'), 'admin · follow up: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"diam"}'), 'admin · diam: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"pm"}'), 'admin · pallet mesh: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"order"}'), 'admin · order: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"semua","q":"sejahtera 1"}'), 'admin · cari nama: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"semua","q":"ratna"}'), 'admin · cari PIC: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"order","q":"PO/UJC"}'), 'admin · order + cari No PO: identik');
select uji.cek(pg_temp.banding('11111111-1111-4111-8111-111111111111', '{"tab":"semua","q":"galvanis"}'), 'admin · cari spesifikasi: identik');
select uji.cek(pg_temp.banding('22222222-2222-4222-8222-222222222222', '{"tab":"semua","pemilik":100000002}'), 'rep · lead saya: identik');
select uji.cek(pg_temp.banding('22222222-2222-4222-8222-222222222222', '{"tab":"semua"}'), 'rep · semua: identik');
select uji.cek(pg_temp.banding('22222222-2222-4222-8222-222222222222', '{"tab":"penawaran","q":"jakarta"}'), 'rep · penawaran + cari kota: identik');
select uji.cek(pg_temp.banding('33333333-3333-4333-8333-333333333333', '{"tab":"semua"}'), 'baca · semua: identik');
select uji.cek(pg_temp.banding('33333333-3333-4333-8333-333333333333', '{"tab":"semua","q":"ratna"}'), 'baca · cari PIC (tidak boleh): identik');
select set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------ lewat jalur web_ sebagai authenticated
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('d', public.web_pipeline_daftar('{"tab":"semua","q":"UJC-00010"}'));
reset role;
select uji.sama((select e from jsonb_array_elements(uji.ambil('d') -> 'items') e where e ->> 'id' = 'ldujicpt00010'),
  public.j_pipeline_lead_ringkas('ldujicpt00010'), 'web_pipeline_daftar (rep, jalur web_) = baris ringkas');

rollback;
