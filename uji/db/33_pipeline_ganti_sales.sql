-- 33 · Pipeline: Ganti sales (20261029120000, revisi Hannes 29 Okt: ubah PIC sales + pindah massal).
-- web_pipeline_ganti_sales({lead_ids, pemilik}): satu/banyak lead, semua-atau-tidak; admin semua lead, rep hanya lead
-- miliknya / tanpa pemilik; tujuan = sales sah (owner / akses admin-rep aktif). Riwayat pemilik dicatat trigger untuk
-- SETIAP pergantian (termasuk Klaim). web_pipeline_sales = pilihan tujuan.
-- Aktor: budi (owner → admin), citra (rep RSG), eka (rep MCE), dodi (baca), bot claude (bukan sales).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujigs1', 'PT Uji Ganti Sales');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujigs1', 'plujigs1', 'Google Ads', 100000002, 'BARU', null, null, null),
  ('ldujigs2', 'plujigs1', 'Telepon', 100000002, 'PENAWARAN', null, null, null),
  ('ldujigs3', 'plujigs1', 'Referral', 900000000001, 'BARU', null, null, null),
  ('ldujigs4', 'plujigs1', 'WA langsung', null, 'BARU', null, null, null),
  ('ldujigs5', 'plujigs1', 'Google Ads', 100000002, 'ORDER', '9801/RSG/X/2026', '2026-10-20', 4000000);
insert into public.lead_item (lead_id, produk, qty)
  select id, 'Roda', 1 from public.lead where id like 'ldujigs%';
select uji.konteks(null, null);

create function pg_temp.pemilik(p_id text) returns bigint language sql as $$ select pemilik from public.lead where id = p_id $$;
create function pg_temp.n_riwayat() returns int language sql as $$
  select count(*)::int from public.lead_riwayat_pemilik where lead_id like 'ldujigs%' $$;
grant execute on all functions in schema pg_temp to public;

-- ------------------------------------------------------------ hak & tabel
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_ganti_sales(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_sales_sah(bigint)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_ganti_sales(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_sales()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_ganti_sales(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_sales()', 'EXECUTE'),
  'hak: inti & pembantu internal; web_ hanya authenticated');
select uji.cek((select relrowsecurity from pg_class where oid = 'public.lead_riwayat_pemilik'::regclass)
  and not has_table_privilege('authenticated', 'public.lead_riwayat_pemilik', 'INSERT')
  and not has_table_privilege('service_role', 'public.lead_riwayat_pemilik', 'UPDATE'),
  'lead_riwayat_pemilik: RLS ON, tanpa hak tulis langsung');

-- ------------------------------------------------------------ pilihan sales
select uji.jadi('22222222-2222-4222-8222-222222222222');                       -- citra (rep)
select uji.simpan('s', public.web_pipeline_sales());
select uji.sama((select array_agg((e ->> 'id')::bigint order by (e ->> 'id')::bigint) from jsonb_array_elements(uji.ambil('s')) e),
  array[100000001, 100000002, 900000000001]::bigint[], 'web_pipeline_sales: owner + rep (tanpa baca, tanpa bot)');
select uji.sama((select e ->> 'kode_sp' from jsonb_array_elements(uji.ambil('s')) e where (e ->> 'id')::bigint = 900000000001), 'MCE',
  'web_pipeline_sales: memuat kode SP');
select uji.jadi('33333333-3333-4333-8333-333333333333');                       -- dodi (baca) boleh melihat pilihan
select uji.jalan($$select public.web_pipeline_sales()$$, 'web_pipeline_sales: peran baca boleh');
reset role;
delete from public.pipeline_akses where member_id = 100000003;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_sales()$$, 'PT403', 'web_pipeline_sales: tanpa akses Pipeline ditolak', null, 'ACCESS_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":100000002}')$$, 'PT403',
  'ganti sales: tanpa akses Pipeline ditolak', null, 'ACCESS_001');
reset role;
insert into public.pipeline_akses (member_id, peran) values (100000003, 'baca');
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":100000002}')$$, 'PT403',
  'ganti sales: peran baca ditolak', 'akses tulis', 'ACCESS_001');

-- ------------------------------------------------------------ rep: lead sendiri / tanpa pemilik saja
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('h', public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs1"],"pemilik":900000000001}'));
select uji.sama(uji.ambil('h'), '{"diubah":1,"sama":0,"pemilik":900000000001,"pemilik_nama":"eka wulandari"}'::jsonb,
  'rep: lead sendiri → rep lain');
reset role;
select uji.sama(pg_temp.pemilik('ldujigs1'), 900000000001::bigint, 'lead pindah ke eka');
select uji.sama((select jsonb_build_object('dari', dari, 'ke', ke, 'oleh', oleh) from public.lead_riwayat_pemilik where lead_id = 'ldujigs1'),
  '{"dari":100000002,"ke":900000000001,"oleh":100000002}'::jsonb, 'riwayat: dari citra ke eka oleh citra');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs1"],"pemilik":100000002}')$$, 'PT403',
  'rep: tidak bisa mengambil kembali lead yang sudah milik rep lain', (select kode from public.lead where id = 'ldujigs1'), 'ACCESS_001');
-- semua-atau-tidak: satu lead asing → seluruh batch ditolak, lead sendiri tidak ikut berubah
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs2","ldujigs3"],"pemilik":null}')$$, 'PT403',
  'rep: batch berisi lead rep lain ditolak seluruhnya', 'milik sales lain', 'ACCESS_001');
reset role;
select uji.sama(pg_temp.pemilik('ldujigs2'), 100000002::bigint, 'batch ditolak: lead citra tetap milik citra');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('h', public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs2","ldujigs4","ldujigs2"],"pemilik":null}'));
select uji.sama(uji.ambil('h') - 'pemilik_nama', '{"diubah":1,"sama":1,"pemilik":null}'::jsonb,
  'rep: lepas lead sendiri + lead tanpa pemilik (sudah null = sama; id ganda dihitung sekali)');
reset role;
select uji.sama(pg_temp.n_riwayat(), 2, 'riwayat: hanya yang benar-benar berubah dicatat');

-- ------------------------------------------------------------ validasi tujuan & masukan
select uji.jadi('11111111-1111-4111-8111-111111111111');                       -- budi (owner = admin)
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":100000003}')$$, 'PT400',
  'tujuan peran baca ditolak', 'admin/rep', 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":900000000002}')$$, 'PT400',
  'tujuan bot ditolak', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":424242}')$$, 'PT400',
  'tujuan tak dikenal ditolak', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":{"id":1}}')$$, 'PT400',
  'pemilik bukan id ditolak', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"]}')$$, 'PT400',
  'kunci pemilik wajib', 'pemilik wajib', 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"pemilik":100000002}')$$, 'PT400', 'lead_ids wajib', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":[],"pemilik":100000002}')$$, 'PT400', 'lead_ids kosong ditolak',
  'minimal 1', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_ganti_sales(%L)',
    jsonb_build_object('lead_ids', (select jsonb_agg('ld' || g) from generate_series(1, 501) g), 'pemilik', 100000002)),
  'PT400', 'maks. 500 lead', '500', 'INPUT_001');
select uji.galat($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4","ldtidakada"],"pemilik":100000002}')$$, 'PT404',
  'lead tak dikenal → 404 (batch batal)', null, 'ITEM_013');
reset role;
select uji.cek(pg_temp.pemilik('ldujigs4') is null, 'batch 404: lead lain tidak berubah');

-- ------------------------------------------------------------ admin: pindah massal (lead siapa pun, tahap apa pun)
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('h', public.web_pipeline_ganti_sales(
  '{"lead_ids":["ldujigs1","ldujigs2","ldujigs3","ldujigs4","ldujigs5"],"pemilik":"100000002"}'));
select uji.sama(uji.ambil('h'), '{"diubah":4,"sama":1,"pemilik":100000002,"pemilik_nama":"citra lestari"}'::jsonb,
  'admin: 5 lead (lead rep lain, tanpa pemilik, ORDER) → citra; yang sudah milik citra = sama');
reset role;
select uji.sama((select count(*)::int from public.lead where id like 'ldujigs%' and pemilik = 100000002), 5, 'semua lead milik citra');
select uji.sama((select no_sp from public.lead where id = 'ldujigs5'), '9801/RSG/X/2026', 'ORDER: No SP tidak berubah');
select uji.sama(pg_temp.n_riwayat(), 6, 'riwayat: +4 baris');
select uji.cek((select bool_and(oleh = 100000001) from public.lead_riwayat_pemilik
                 where lead_id like 'ldujigs%' and ke = 100000002 and id > (select min(id) + 1 from public.lead_riwayat_pemilik
                                                                             where lead_id like 'ldujigs%')),
  'riwayat pindah massal: oleh budi');

-- ------------------------------------------------------------ klaim juga tercatat
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.jalan($$select public.web_pipeline_ganti_sales('{"lead_ids":["ldujigs4"],"pemilik":null}')$$, 'admin: lepas pemilik');
select uji.jadi('44444444-4444-4444-8444-444444444444');                       -- eka (rep) klaim
select uji.simpan('k', public.web_pipeline_lead_ubah('{"lead_id":"ldujigs4","klaim":true}'));
select uji.sama((uji.ambil('k') -> 'riwayat_pemilik' -> -1) - 'waktu',
  '{"dari":null,"dari_nama":null,"ke":900000000001,"ke_nama":"eka wulandari","oleh":900000000001,"oleh_nama":"eka wulandari"}'::jsonb,
  'Klaim tercatat di riwayat_pemilik (detail lead)');
select uji.sama(jsonb_array_length(uji.ambil('k') -> 'riwayat_pemilik'), 3, 'detail lead: semua riwayat pemilik lead itu (urut waktu)');

-- ------------------------------------------------------------ baca riwayat: rep/admin via RLS, baca via detail tersamar
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama((select count(*)::int from public.lead_riwayat_pemilik where lead_id like 'ldujigs%'), pg_temp.n_riwayat(),
  'RLS: rep membaca riwayat pemilik');
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama((select count(*)::int from public.lead_riwayat_pemilik), 0, 'RLS: peran baca tidak membaca tabel mentah');
select uji.cek(jsonb_array_length(public.web_pipeline_lead('ldujigs4') -> 'riwayat_pemilik') = 3,
  'peran baca: riwayat pemilik tampil di detail (nama sales tidak disamarkan)');
select uji.jadi_anon();
select uji.galat($$select count(*) from public.lead_riwayat_pemilik$$, '42501', 'anon: tanpa akses');
reset role;

rollback;
