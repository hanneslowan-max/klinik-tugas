-- 19 · Pipeline: kategori papan PRIBADI per pengguna (web_pipeline_kategori / _simpan / _pindah).
-- Pribadi = kategori & penempatan hanya milik pembuatnya (RLS + fungsi), tidak mengubah data lead.
-- Aktor seed: budi (owner → admin implisit), citra (rep), dodi (baca), eka (tanpa akses Pipeline).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- ------------------------------------------------------------ data: akses + 2 lead
insert into public.pipeline_akses (member_id, peran) values (100000002, 'rep'), (100000003, 'baca');
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujikat1', 'PT Uji Kategori');
insert into public.lead (id, pelanggan_id, sumber, pemilik) values
  ('ldujikat1', 'plujikat1', 'Google Ads', 100000002),
  ('ldujikat2', 'plujikat1', 'Referral', null);
select uji.konteks(null, null);

-- ------------------------------------------------------------ citra (rep)
select uji.jadi('22222222-2222-4222-8222-222222222222');

select uji.sama(public.web_pipeline_kategori(), '{"kategori": [], "posisi": {}}'::jsonb, 'awal: papan kosong');

select uji.simpan('a', public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"Hot"}'));
select uji.sama(jsonb_array_length(uji.ambil('a')->'kategori'), 1, 'buat: 1 kategori');
select uji.simpan('k1', (uji.ambil('a')->'kategori'->0));
select uji.cek((uji.ambil('k1')->>'id') ~ '^pk[0-9a-z]{8}$', 'buat: id berpola pk + 8');

select uji.simpan('a', public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"  Nunggu    PO  "}'));
select uji.simpan('k2', (uji.ambil('a')->'kategori'->1));
select uji.sama(uji.ambil('k2')->>'nama', 'Nunggu PO', 'buat: nama dirapikan (spasi ganda & tepi)');
select uji.cek((uji.ambil('k2')->>'urutan')::int > (uji.ambil('k1')->>'urutan')::int, 'buat: kategori baru di ujung kanan');

select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"hot"}')$$,
  'PT409', 'buat: nama kembar (beda huruf besar/kecil) ditolak', 'sudah ada', 'KONFLIK_001');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"   "}')$$,
  'PT400', 'buat: nama kosong ditolak', 'wajib', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'buat', 'nama', repeat('x', 41))),
  'PT400', 'buat: nama > 40 karakter ditolak', '40', 'INPUT_001');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"lompat"}')$$,
  'PT400', 'aksi tak dikenal ditolak', null, 'INPUT_001');

-- ganti nama
select uji.simpan('a', public.web_pipeline_kategori_simpan(jsonb_build_object('aksi', 'ganti_nama', 'id', uji.ambil('k1')->>'id', 'nama', 'Prioritas')));
select uji.sama(uji.ambil('a')->'kategori'->0->>'nama', 'Prioritas', 'ganti_nama: nama baru tersimpan');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'ganti_nama', 'id', uji.ambil('k1')->>'id', 'nama', 'nunggu po')),
  'PT409', 'ganti_nama: ke nama kategori lain ditolak', null, 'KONFLIK_001');
select uji.jalan(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'ganti_nama', 'id', uji.ambil('k1')->>'id', 'nama', 'PRIORITAS')),
  'ganti_nama: ubah huruf besar/kecil nama sendiri boleh');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"ganti_nama","id":"pktidakada","nama":"X"}')$$,
  'PT404', 'ganti_nama: kategori tak ada → 404', null, 'ITEM_013');

-- pindah lead
select uji.jalan(format('select public.web_pipeline_kategori_pindah(%L)', jsonb_build_object('lead_id', 'ldujikat1', 'kategori_id', uji.ambil('k1')->>'id')),
  'pindah: lead → kategori');
select uji.sama(public.web_pipeline_kategori()->'posisi'->>'ldujikat1', uji.ambil('k1')->>'id', 'pindah: posisi tercatat');
select uji.jalan(format('select public.web_pipeline_kategori_pindah(%L)', jsonb_build_object('lead_id', 'ldujikat1', 'kategori_id', uji.ambil('k2')->>'id')),
  'pindah: lead → kategori lain (upsert)');
select uji.sama(public.web_pipeline_kategori()->'posisi'->>'ldujikat1', uji.ambil('k2')->>'id', 'pindah: posisi diperbarui');
select uji.jalan($$select public.web_pipeline_kategori_pindah('{"lead_id":"ldujikat1","kategori_id":null}')$$, 'pindah: ke Tanpa kategori');
select uji.cek(not (public.web_pipeline_kategori()->'posisi' ? 'ldujikat1'), 'pindah null: penempatan dihapus');
select uji.galat($$select public.web_pipeline_kategori_pindah('{"lead_id":"ldujikat1","kategori_id":"pktidakada"}')$$,
  'PT404', 'pindah: kategori tak ada → 404', 'Kategori', 'ITEM_013');
select uji.galat(format('select public.web_pipeline_kategori_pindah(%L)', jsonb_build_object('lead_id', 'ldtidakada', 'kategori_id', uji.ambil('k1')->>'id')),
  'PT404', 'pindah: lead tak ada → 404', 'Lead', 'ITEM_013');
-- lead milik siapa pun boleh disusun di papan sendiri (tidak mengubah lead)
select uji.jalan(format('select public.web_pipeline_kategori_pindah(%L)', jsonb_build_object('lead_id', 'ldujikat2', 'kategori_id', uji.ambil('k1')->>'id')),
  'pindah: lead tanpa pemilik boleh disusun');
select uji.sama((select tahap from public.lead where id = 'ldujikat2'), 'BARU', 'pindah: tahap lead tidak berubah');

-- urut
select uji.simpan('a', public.web_pipeline_kategori_simpan(jsonb_build_object('aksi', 'urut', 'ids', jsonb_build_array(uji.ambil('k2')->>'id', uji.ambil('k1')->>'id'))));
select uji.sama(uji.ambil('a')->'kategori'->0->>'id', uji.ambil('k2')->>'id', 'urut: urutan baru tersimpan');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'urut', 'ids', jsonb_build_array(uji.ambil('k1')->>'id'))),
  'PT409', 'urut: daftar tidak lengkap ditolak', null, 'KONFLIK_001');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'urut', 'ids', jsonb_build_array(uji.ambil('k1')->>'id', uji.ambil('k1')->>'id'))),
  'PT409', 'urut: id dobel ditolak', null, 'KONFLIK_001');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"urut","ids":"x"}')$$,
  'PT400', 'urut: ids bukan array ditolak', null, 'INPUT_001');

select uji.sama((select count(*)::int from public.pipeline_kategori), 2, 'RLS: citra hanya melihat 2 kategorinya');
reset role;

-- ------------------------------------------------------------ dodi (baca): papan sendiri, terpisah dari citra
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(public.web_pipeline_kategori(), '{"kategori": [], "posisi": {}}'::jsonb, 'pribadi: dodi tidak melihat papan citra');
select uji.sama((select count(*)::int from public.pipeline_kategori), 0, 'RLS: dodi tidak melihat baris kategori citra');
select uji.sama((select count(*)::int from public.pipeline_kategori_lead), 0, 'RLS: dodi tidak melihat penempatan citra');
select uji.galat(format('select public.web_pipeline_kategori_pindah(%L)', jsonb_build_object('lead_id', 'ldujikat1', 'kategori_id', uji.ambil('k1')->>'id')),
  'PT404', 'pribadi: dodi tak bisa memakai kategori citra', 'Kategori', 'ITEM_013');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'hapus', 'id', uji.ambil('k1')->>'id')),
  'PT404', 'pribadi: dodi tak bisa menghapus kategori citra', null, 'ITEM_013');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'ganti_nama', 'id', uji.ambil('k1')->>'id', 'nama', 'Dibajak')),
  'PT404', 'pribadi: dodi tak bisa mengganti nama kategori citra', null, 'ITEM_013');
select uji.simpan('d', public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"Prioritas"}'));
select uji.sama(jsonb_array_length(uji.ambil('d')->'kategori'), 1, 'pribadi: dodi (baca) boleh buat kategori sendiri, nama sama dengan milik citra');
select uji.galat($$insert into public.pipeline_kategori (member_id, nama) values (100000003, 'langsung')$$,
  '42501', 'tulis langsung ke tabel ditolak (hanya lewat fungsi)');
reset role;

-- ------------------------------------------------------------ eka (tanpa akses) & anon
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat($$select public.web_pipeline_kategori()$$, 'PT403', 'tanpa akses Pipeline → 403', null, 'ACCESS_001');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"X"}')$$, 'PT403', 'tanpa akses: buat → 403', null, 'ACCESS_001');
select uji.sama((select count(*)::int from public.pipeline_kategori), 0, 'RLS: tanpa akses tidak melihat baris');
reset role;
select uji.jadi_anon();
select uji.galat($$select public.web_pipeline_kategori()$$, '42501', 'anon: tidak bisa memanggil fungsi');
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.inti_pipeline_kategori()$$, '42501', 'authenticated: inti_ tidak bisa dipanggil langsung');
reset role;

select uji.cek(not exists (
  select 1 from unnest(array['public.pipeline_kategori', 'public.pipeline_kategori_lead']::regclass[]) t
   where has_table_privilege('authenticated', t, 'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('service_role', t, 'INSERT,UPDATE,DELETE,TRUNCATE')),
  'fail-closed: authenticated & service_role tanpa hak tulis langsung ke tabel kategori');
select uji.cek(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ 'pipeline_kategori'
     and p.proname !~ '^web_'
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  'fail-closed: pembantu & inti_ kategori tidak bisa dipanggil role API');

-- ------------------------------------------------------------ integritas (postgres): FK komposit
select uji.galat(format($$insert into public.pipeline_kategori_lead (member_id, lead_id, kategori_id) values (100000003, 'ldujikat1', %L)$$, uji.ambil('k1')->>'id'),
  '23503', 'FK komposit: penempatan wajib ke kategori milik anggota yang sama');

-- ------------------------------------------------------------ hapus: penempatan ikut hilang, lead tetap
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('a', public.web_pipeline_kategori_simpan(jsonb_build_object('aksi', 'hapus', 'id', uji.ambil('k1')->>'id')));
select uji.sama(jsonb_array_length(uji.ambil('a')->'kategori'), 1, 'hapus: tinggal 1 kategori');
select uji.cek(not (uji.ambil('a')->'posisi' ? 'ldujikat2'), 'hapus: lead di kategori itu kembali ke Tanpa kategori');
select uji.cek(exists (select 1 from public.lead where id = 'ldujikat2'), 'hapus: lead tetap ada');
select uji.galat(format('select public.web_pipeline_kategori_simpan(%L)', jsonb_build_object('aksi', 'hapus', 'id', uji.ambil('k1')->>'id')),
  'PT404', 'hapus: kategori sudah terhapus → 404', null, 'ITEM_013');

-- batas jumlah: sudah 1, tambah 29 → 30; ke-31 ditolak
select uji.jalan($$select public.web_pipeline_kategori_simpan(jsonb_build_object('aksi', 'buat', 'nama', 'K' || g)) from generate_series(1, 29) g$$,
  'batas: sampai 30 kategori boleh');
select uji.galat($$select public.web_pipeline_kategori_simpan('{"aksi":"buat","nama":"ke-31"}')$$,
  'PT400', 'batas: kategori ke-31 ditolak', 'Maksimal 30', 'INPUT_001');
reset role;

rollback;
