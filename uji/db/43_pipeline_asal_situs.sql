-- 43 · Pipeline: kartu "Asal lead per situs" (20261111150000_pipeline_asal_situs). Pemetaan sumber_bukti → kelompok
-- (situs Hammerindo / Palletmesh / Meta / lainnya berkode / WA tanpa kode / belum ada bukti) + jalur organik vs Google Ads,
-- saringan produk & rentang, akses (admin/baca penuh, rep miliknya, tanpa akses 403), id di balik angka (predikat sama),
-- x_ untuk agent (token baca). Hari ini dipatok Rabu 11 Nov 2026.
-- Data uji Pallet Mesh 21 Okt–11 Nov MENIRU angka cek manual 11 Nov (rhj-brain deliverables/ads/SUMBER-LEAD-PM-PER-SITUS-11Nov.md):
-- 63 lead = situs RH 12 (WEB-RH 6, GA-RH 6; 2 order Rp4.747.500) · situs OY 1 (GA-OY) · Meta 34 · WA tanpa kode 15 (2 order
-- Rp24.214.818) · belum ada bukti 1 (order Rp7.260.000). Pelanggan & nomor fiktif.
-- Aktor: budi (owner → penuh), citra (rep RSG, pemilik semua lead situs RH), eka (rep MCE), dodi (baca), bot 900000000002.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

select set_config('app.hari_ini', '2026-11-11', true);

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000431', 900000000002, 'bot baca (uji 43)', 'rtk_b431', uji.sha('rtk_uji43_baca'), 'baca');

-- ------------------------------------------------------------ data uji
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujas1', 'PT Uji Asal Situs');
-- 63 lead Pallet Mesh di rentang: n = 1..63 → ldujas01..ldujas63
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk)
select 'ldujas' || lpad(n::text, 2, '0'), 'plujas1', 'WA langsung',
       case when n <= 12 then 100000002 else 900000000001 end, 'BARU',
       case when n <= 6 then date '2026-10-21' + n            -- web-rh 22–27 Okt
            when n <= 12 then date '2026-11-01' + (n - 7)      -- ga-rh 1–6 Nov
            when n = 13 then date '2026-11-05'                 -- ga-oy
            when n <= 47 then date '2026-11-01' + (n % 10)     -- meta (semua Nov)
            when n = 62 then date '2026-11-11'                 -- tanpa-sinyal, hari ini (untuk uji "sampai")
            when n <= 62 then date '2026-10-21' + (n - 48)     -- tanpa-sinyal 21 Okt–3 Nov
            else date '2026-10-30' end                         -- belum ada bukti
  from generate_series(1, 63) n;
-- noise: di luar rentang / produk lain / tanpa item
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk) values
  ('ldujasn1', 'plujas1', 'Google Ads', 900000000001, 'BARU', '2026-10-20'),   -- PM web-oy SEBELUM 21 Okt
  ('ldujasn2', 'plujas1', 'Website organik', 100000002, 'BARU', '2026-11-02'), -- Roda web-rh (ORDER di bawah)
  ('ldujasn3', 'plujas1', 'Lainnya', 900000000001, 'BARU', '2026-11-03'),      -- Roda + Lainnya, xs-pm
  ('ldujasn4', 'plujas1', 'Instagram/TikTok organik', 900000000001, 'BARU', '2026-11-04'); -- tanpa item, lastri
insert into public.lead_item (lead_id, produk, qty)
select 'ldujas' || lpad(n::text, 2, '0'), 'Pallet Mesh', 1 + n % 5 from generate_series(1, 63) n;
insert into public.lead_item (lead_id, produk, qty) values
  ('ldujas13', 'Roda', 4), ('ldujasn1', 'Pallet Mesh', 2), ('ldujasn2', 'Roda', 8), ('ldujasn3', 'Roda', 1), ('ldujasn3', 'Lainnya', 1);
-- order: RH 2 (2.500.000 + 2.247.500), tanpa kode 2 (20.000.000 + 4.214.818), belum ada bukti 1 (7.260.000), Roda RH 1 (1.000.000)
update public.lead l set tahap = 'ORDER', no_sp = x.sp, tanggal_sp = x.tgl, nilai_transaksi = x.nilai
  from (values ('ldujas01', '9431/RSG/X/2026',  date '2026-10-28', 2500000),
               ('ldujas07', '9432/RSG/XI/2026', date '2026-11-04', 2247500),
               ('ldujas48', '9433/MCE/X/2026',  date '2026-10-25', 20000000),
               ('ldujas49', '9434/MCE/X/2026',  date '2026-10-29', 4214818),
               ('ldujas63', '9435/MCE/XI/2026', date '2026-11-02', 7260000),
               ('ldujasn2', '9436/RSG/XI/2026', date '2026-11-06', 1000000)) x(id, sp, tgl, nilai)
 where l.id = x.id;
-- bukti sumber agent (jalur sah lewat bendera transaksi)
select set_config('app.sumber_bukti_tulis', 'ya', true);
update public.lead l set sumber_bukti = x.kelas, sumber_bukti_diisi_pada = now()
  from (select 'ldujas' || lpad(n::text, 2, '0') id,
               case when n <= 6 then 'web-rh' when n <= 12 then 'ga-rh' when n = 13 then 'ga-oy'
                    when n <= 47 then 'meta' when n <= 62 then 'tanpa-sinyal' end kelas
          from generate_series(1, 62) n
        union all values ('ldujasn1', 'web-oy'), ('ldujasn2', 'web-rh'), ('ldujasn3', 'xs-pm'), ('ldujasn4', 'lastri')) x
 where l.id = x.id;
select set_config('app.sumber_bukti_tulis', '', true);
select uji.konteks(null, null);
select uji.sama((select count(*)::int from public.lead where id not like 'ldujas%'), 0, 'prasyarat: hanya lead uji di DB');
select uji.sama((select count(*)::int from public.lead where id ~ '^ldujas[0-9]{2}$' and tahap = 'ORDER'), 5, 'prasyarat: 5 order PM');

-- ------------------------------------------------------------ hak
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_asal_situs(jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.x_pipeline_asal_situs(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.x_pipeline_asal_situs(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_asal_situs(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_asal_situs(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_asal_situs(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_asal_lead(date, date, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.pipeline_asal_lead(date, date, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_asal_saring(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_dasbor_ids(jsonb)', 'EXECUTE'),
  'hak: web_ → authenticated, x_ → service_role, inti/pembantu internal');
select uji.sama((select count(*)::int from pg_proc p where p.oid in (
    'public.inti_pipeline_asal_situs(jsonb)'::regprocedure, 'public.web_pipeline_asal_situs(jsonb)'::regprocedure,
    'public.x_pipeline_asal_situs(bigint, jsonb)'::regprocedure, 'public.pipeline_asal_lead(date, date, text)'::regprocedure,
    'public.pipeline_asal_saring(jsonb)'::regprocedure, 'public.inti_pipeline_dasbor_ids(jsonb)'::regprocedure)
    and p.prosecdef and p.proconfig = array['search_path=""']), 6, 'fungsi: SECURITY DEFINER + search_path kosong');
select uji.sama(jsonb_build_array(public.pipeline_asal_kelompok('web-rh'), public.pipeline_asal_kelompok('situs-rh'),
    public.pipeline_asal_kelompok('ga-oy'), public.pipeline_asal_kelompok('meta'), public.pipeline_asal_kelompok('katalog-wa'),
    public.pipeline_asal_kelompok('tidur'), public.pipeline_asal_kelompok('tanpa-sinyal'), public.pipeline_asal_kelompok(null),
    public.pipeline_asal_jalur('situs-oy'), public.pipeline_asal_jalur('ga-rh'), public.pipeline_asal_jalur('meta')),
  '["situs_rh","situs_rh","situs_oy","meta","lain","lain","tanpa_kode","belum","organik","google_ads",null]'::jsonb,
  'pemetaan kelas bukti → kelompok & jalur');
select uji.cek((select bool_and(public.pipeline_asal_kelompok(k) <> 'belum') from unnest(public.pipeline_sumber_bukti_kelas()) k),
  'setiap kelas bukti yang sah punya kelompok (tidak jatuh ke "belum")');

-- ------------------------------------------------------------ admin (budi): Pallet Mesh, rentang bawaan = 21 Okt s/d hari ini
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('pm', public.web_pipeline_asal_situs('{"produk":"Pallet Mesh"}'));
select uji.sama(uji.ambil('pm') - 'kelompok', '{"cakupan":"semua","produk":"Pallet Mesh","sejak":"2026-10-21","sampai":"2026-11-11",
  "bukti_sejak":"2026-10-21","hari_ini":"2026-11-11","total":{"lead":63,"order":5,"nilai":36222318}}'::jsonb,
  'PM 21 Okt–11 Nov: 63 lead, 5 order (rentang bawaan = sejak bukti dicatat)');
select uji.sama(uji.ambil('pm') -> 'kelompok', '[
  {"kelompok":"situs_rh","lead":12,"order":2,"nilai":4747500,
   "kelas":[{"kelas":"ga-rh","lead":6,"order":1,"nilai":2247500},{"kelas":"web-rh","lead":6,"order":1,"nilai":2500000}],
   "jalur":[{"jalur":"organik","lead":6,"order":1,"nilai":2500000},{"jalur":"google_ads","lead":6,"order":1,"nilai":2247500}]},
  {"kelompok":"situs_oy","lead":1,"order":0,"nilai":0,"kelas":[{"kelas":"ga-oy","lead":1,"order":0,"nilai":0}],
   "jalur":[{"jalur":"organik","lead":0,"order":0,"nilai":0},{"jalur":"google_ads","lead":1,"order":0,"nilai":0}]},
  {"kelompok":"meta","lead":34,"order":0,"nilai":0,"kelas":[{"kelas":"meta","lead":34,"order":0,"nilai":0}]},
  {"kelompok":"lain","lead":0,"order":0,"nilai":0,"kelas":[]},
  {"kelompok":"tanpa_kode","lead":15,"order":2,"nilai":24214818,"kelas":[{"kelas":"tanpa-sinyal","lead":15,"order":2,"nilai":24214818}]},
  {"kelompok":"belum","lead":1,"order":1,"nilai":7260000,"kelas":[{"kelas":null,"lead":1,"order":1,"nilai":7260000}]}]'::jsonb,
  'PM: kelompok = angka cek manual 11 Nov (RH 12 = 6 organik + 6 Google Ads, 2 order Rp4.747.500; OY 1; Meta 34; tanpa kode 15; belum 1)');
select uji.sama((select sum((k ->> 'lead')::int)::int from jsonb_array_elements(uji.ambil('pm') -> 'kelompok') k), 63,
  'jumlah baris kelompok = total lead');

-- semua produk: noise produk lain & tanpa item ikut; lead sebelum 21 Okt tidak
select uji.simpan('all', public.web_pipeline_asal_situs('{}'));
select uji.sama(jsonb_build_object('total', uji.ambil('all') -> 'total', 'produk', uji.ambil('all') -> 'produk',
    'rh', (select jsonb_build_array(k -> 'lead', k -> 'order', k -> 'nilai', k #> '{jalur,0,lead}') from jsonb_array_elements(uji.ambil('all') -> 'kelompok') k where k ->> 'kelompok' = 'situs_rh'),
    'oy', (select k -> 'lead' from jsonb_array_elements(uji.ambil('all') -> 'kelompok') k where k ->> 'kelompok' = 'situs_oy'),
    'lain', (select k -> 'kelas' from jsonb_array_elements(uji.ambil('all') -> 'kelompok') k where k ->> 'kelompok' = 'lain')),
  '{"total":{"lead":66,"order":6,"nilai":37222318},"produk":null,"rh":[13,3,5747500,7],"oy":1,
    "lain":[{"kelas":"lastri","lead":1,"order":0,"nilai":0},{"kelas":"xs-pm","lead":1,"order":0,"nilai":0}]}'::jsonb,
  'Semua produk: + Roda web-rh (order), xs-pm, lastri tanpa item; web-oy 20 Okt di luar rentang');
select uji.sama(public.web_pipeline_asal_situs('{"produk":"Semua"}') - 'hari_ini', uji.ambil('all') - 'hari_ini', 'produk "Semua" = tanpa saringan');
-- produk Roda: lead multi-produk ikut di tiap produknya
select uji.sama((select jsonb_object_agg(k ->> 'kelompok', k -> 'lead') from jsonb_array_elements(public.web_pipeline_asal_situs('{"produk":"Roda"}') -> 'kelompok') k
                  where (k ->> 'lead')::int > 0),
  '{"situs_rh":1,"situs_oy":1,"lain":1}'::jsonb, 'produk Roda: lead punya item Roda (PM+Roda ikut)');
-- rentang eksplisit: bulan Oktober saja · sampai kemarin (lead hari ini tidak ikut) · sebelum 21 Okt
select uji.sama((select jsonb_object_agg(k ->> 'kelompok', k -> 'lead') from jsonb_array_elements(
                   public.web_pipeline_asal_situs('{"produk":"Pallet Mesh","sejak":"2026-10-01","sampai":"2026-10-31"}') -> 'kelompok') k),
  '{"situs_rh":6,"situs_oy":1,"meta":0,"lain":0,"tanpa_kode":11,"belum":1}'::jsonb,
  'PM Oktober: web-oy 20 Okt ikut (rentang mulai 1 Okt), ga-rh/meta Nov tidak');
select uji.sama(public.web_pipeline_asal_situs('{"produk":"Pallet Mesh","sampai":"2026-11-10"}') #> '{total,lead}', '62'::jsonb,
  'sampai 10 Nov: lead 11 Nov tidak ikut');

-- id di balik angka: predikat sama dengan angka
select uji.sama(jsonb_build_array(
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"situs_rh","produk":"Pallet Mesh"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"situs_rh","jalur":"google_ads","produk":"Pallet Mesh"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"meta","produk":"Pallet Mesh"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"tanpa_kode","produk":"Pallet Mesh","sampai":"2026-11-10"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","produk":"Pallet Mesh"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"situs_oy","sejak":"2026-10-01","sampai":"2026-10-31"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","produk":"Pallet Mesh","pemilik":"900000000001"}') ->> 'total')::int),
  '[12,6,34,14,63,66,1,51]'::jsonb, 'ids asal_situs: total = angka kartu (kelompok, jalur, produk, rentang, pemilik)');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"situs_rh","jalur":"organik","produk":"Pallet Mesh"}') -> 'ids',
  '["ldujas06","ldujas05","ldujas04","ldujas03","ldujas02","ldujas01"]'::jsonb, 'ids organik RH: web-rh, urut tanggal masuk terbaru');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"belum","produk":"Pallet Mesh"}') -> 'ids',
  '["ldujas63"]'::jsonb, 'ids belum ada bukti');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"situs-rh"}')$$, 'PT400', 'ids: kelompok tak dikenal', 'kelompok', 'INPUT_001');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"meta","jalur":"organik"}')$$, 'PT400', 'ids: jalur hanya untuk kelompok situs', 'jalur', 'INPUT_001');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","jalur":"tiktok","kelompok":"situs_oy"}')$$, 'PT400', 'ids: jalur tak dikenal', 'jalur', 'INPUT_001');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","produk":"Kursi"}')$$, 'PT400', 'ids: produk tak dikenal', 'produk', 'INPUT_001');
select uji.sama((public.web_pipeline_dasbor_ids('{"metrik":"tanpa_bukti","bulan":"2026-10"}') ->> 'total')::int, 12,
  'metrik lama tetap jalan (tanpa_bukti Okt = 11 tanpa-sinyal + 1 belum ada bukti)');

-- validasi saringan
select uji.galat($$select public.web_pipeline_asal_situs('{"produk":"Kursi"}')$$, 'PT400', 'produk tak dikenal ditolak', 'produk', 'INPUT_001');
select uji.galat($$select public.web_pipeline_asal_situs('{"sejak":"21-10-2026"}')$$, 'PT400', 'format tanggal salah ditolak', 'YYYY-MM-DD', 'INPUT_001');
select uji.galat($$select public.web_pipeline_asal_situs('{"sejak":"2026-02-30"}')$$, 'PT400', 'tanggal tidak ada ditolak', 'tidak sah', 'INPUT_001');
select uji.galat($$select public.web_pipeline_asal_situs('{"sejak":"2026-11-05","sampai":"2026-11-01"}')$$, 'PT400', 'sejak > sampai ditolak', 'sesudah', 'INPUT_001');
select uji.galat($$select public.web_pipeline_asal_situs('{"sejak":"2025-01-01","sampai":"2026-11-01"}')$$, 'PT400', 'rentang > 400 hari ditolak', '400', 'INPUT_001');

-- ------------------------------------------------------------ baca (dodi) = penuh
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(public.web_pipeline_asal_situs('{"produk":"Pallet Mesh"}') - 'hari_ini', uji.ambil('pm') - 'hari_ini', 'peran baca: angka penuh');

-- ------------------------------------------------------------ rep (citra): hanya lead miliknya
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('r', public.web_pipeline_asal_situs('{"produk":"Pallet Mesh"}'));
select uji.sama(jsonb_build_object('cakupan', uji.ambil('r') -> 'cakupan', 'total', uji.ambil('r') -> 'total',
    'kel', (select jsonb_object_agg(k ->> 'kelompok', k -> 'lead') from jsonb_array_elements(uji.ambil('r') -> 'kelompok') k)),
  '{"cakupan":"saya","total":{"lead":12,"order":2,"nilai":4747500},
    "kel":{"situs_rh":12,"situs_oy":0,"meta":0,"lain":0,"tanpa_kode":0,"belum":0}}'::jsonb, 'rep: hanya lead miliknya');
select uji.sama((public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","kelompok":"meta","produk":"Pallet Mesh","pemilik":"900000000001"}') ->> 'total')::int,
  0, 'rep: ids pemilik lain diabaikan → tetap miliknya (lead Meta milik eka tidak terlihat)');
select uji.sama((public.web_pipeline_dasbor_ids('{"metrik":"asal_situs","produk":"Pallet Mesh"}') ->> 'total')::int, 12, 'rep: ids semua kelompok = miliknya');

-- ------------------------------------------------------------ agent (bot, token baca): x_ = angka web owner
reset role;
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000431');
select uji.sama(public.x_pipeline_asal_situs(900000000002, '{"produk":"Pallet Mesh"}') - 'hari_ini', uji.ambil('pm') - 'hari_ini',
  'x_pipeline_asal_situs (token baca bot) = angka kartu admin');
select uji.galat($$select public.x_pipeline_asal_situs(900000000002, '{"produk":"Kursi"}')$$, 'PT400', 'x_: produk tak dikenal ditolak', 'produk', 'INPUT_001');
select uji.token(null);
reset role;

-- ------------------------------------------------------------ tanpa akses
delete from public.pipeline_akses where member_id = 100000003;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_asal_situs('{}')$$, 'PT403', 'tanpa akses Pipeline: ditolak', null, 'ACCESS_001');
reset role;

rollback;
