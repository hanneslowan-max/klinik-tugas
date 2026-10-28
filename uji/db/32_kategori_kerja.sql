-- 32 · Kategori pekerjaan per tugas (28 Okt 2026): daftar bersama (owner atur), hitungan Jelajah, isi per kategori
-- lintas list, atur kategori tugas (boleh di mode cermin, tanpa naik versi, tercatat di Riwayat), kunci body
-- `kategori` di web_buat_tugas & API v2, privasi space.
-- Seed: Ads = z8r3uj0001 (telat), z8r3uj0006 (tanpa due), z8r3uj0005 (selesai); SEO = z8r3uj0002 (hari ini),
-- z8r3uj0004, z8r3uj0010 (telat); Konten = rtujib0001; Pipeline kosong.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

create function uji.kat(p_nama text) returns text language sql stable as $$
  select id from public.kategori_kerja where nama = p_nama $$;
grant execute on all functions in schema uji to public;

-- ------------------------------------------------------------ tabel & hak
select uji.sama((select array_agg(nama order by urutan) from public.kategori_kerja), array['Ads','Konten','SEO','Pipeline'],
  'awal: Ads, Konten, SEO, Pipeline (urut)');
select uji.cek((select bool_and(id ~ '^kk[0-9a-z]{8}$') from public.kategori_kerja), 'id berpola kk + 8');
select uji.jadi_anon();
select uji.galat($$select count(*) from public.kategori_kerja$$, '42501', 'anon tidak bisa membaca kategori_kerja');
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');                       -- citra (member)
select uji.sama((select count(*)::int from public.kategori_kerja), 4, 'anggota bisa membaca daftar kategori (RLS)');
select uji.galat($$insert into public.kategori_kerja (nama) values ('Liar')$$, '42501', 'anggota tidak bisa menulis tabel langsung');
select uji.galat($$update public.tasks set kategori_id = null where id = 'z8r3uj0001'$$, '42501',
  'anggota tidak bisa mengubah tasks langsung');

-- ------------------------------------------------------------ Jelajah: hitungan per kategori
select uji.simpan('j', public.web_kategori_kerja());
select uji.sama((select array_agg(e ->> 'nama' order by o) from jsonb_array_elements(uji.ambil('j') -> 'kategori') with ordinality a(e, o)),
  array['Ads','Konten','SEO','Pipeline'], 'web_kategori_kerja: urut kategori');
select uji.sama((select e -> 'hitungan' from jsonb_array_elements(uji.ambil('j') -> 'kategori') e where e ->> 'nama' = 'Ads'),
  '{"terbuka":2,"telat":1,"selesai":1}'::jsonb, 'Ads: 2 terbuka, 1 telat, 1 selesai');
select uji.sama((select e -> 'hitungan' from jsonb_array_elements(uji.ambil('j') -> 'kategori') e where e ->> 'nama' = 'SEO'),
  '{"terbuka":3,"telat":1,"selesai":0}'::jsonb, 'SEO: 3 terbuka, 1 telat');
select uji.sama((select e -> 'hitungan' from jsonb_array_elements(uji.ambil('j') -> 'kategori') e where e ->> 'nama' = 'Pipeline'),
  '{"terbuka":0,"telat":0,"selesai":0}'::jsonb, 'Pipeline kosong = nol semua');
select uji.cek((uji.ambil('j') #>> '{tanpa,terbuka}')::int > 0, 'tanpa kategori: ada tugas terbuka');

-- ------------------------------------------------------------ isi satu kategori
select uji.simpan('a', public.web_tugas_kategori(uji.kat('Ads')));
select uji.sama(uji.ambil('a') -> 'kategori', jsonb_build_object('id', uji.kat('Ads'), 'nama', 'Ads'), 'isi Ads: kepala kategori');
select uji.sama((select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(uji.ambil('a') -> 'tasks') x),
  array['z8r3uj0001','z8r3uj0006'], 'isi Ads: hanya tugas terbuka, lintas list');
select uji.sama(uji.ambil('a') -> 'tasks' -> -1 ->> 'id', 'z8r3uj0006', 'isi Ads: tanpa due di akhir');
select uji.sama((uji.ambil('a') ->> 'jumlah_selesai')::int, 1, 'isi Ads: jumlah selesai');
select uji.cek(uji.ambil('a') -> 'selesai' = 'null'::jsonb, 'isi Ads: daftar selesai tidak dikirim bila tidak diminta');
select uji.sama(uji.ambil('a') #> '{tasks,0,kategori_kerja}', jsonb_build_object('id', uji.kat('Ads'), 'nama', 'Ads'),
  'baris: kategori_kerja {id, nama}');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(public.web_tugas_kategori(uji.kat('Ads'), true) -> 'selesai') x),
  array['z8r3uj0005'], 'isi Ads + selesai: tugas selesai ikut');
select uji.simpan('t', public.web_tugas_kategori(null));
select uji.cek(uji.ambil('t') -> 'kategori' = 'null'::jsonb and uji.ambil('t') -> 'tasks' @> '[{"id":"z8r3uj0003"}]'
  and not uji.ambil('t') -> 'tasks' @> '[{"id":"z8r3uj0001"}]', 'tanpa kategori (null): tugas tanpa kategori saja');
select uji.cek(uji.ambil('t') #> '{tasks,0,kategori_kerja}' = 'null'::jsonb, 'baris tanpa kategori: kategori_kerja null');
select uji.cek(not uji.ambil('t')::text like '%z8r3uj0008%' and not uji.ambil('t')::text like '%rtujib0004%',
  'tanpa kategori: tugas diarsip & terhapus tidak tampil');
select uji.sama(public.web_tugas_kategori(''), uji.ambil('t'), 'tanpa kategori: kosong = null');
select uji.galat($$select public.web_tugas_kategori('kkbukanada')$$, 'PT404', 'kategori tak dikenal → 404', null, 'ITEM_013');

-- ------------------------------------------------------------ atur kategori: mode cermin, versi, riwayat
reset role;
select uji.mode('cermin');
select uji.simpan('v', (select to_jsonb(t) from public.tasks t where t.id = 'z8r3uj0003'));
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('b', public.web_atur_kategori('z8r3uj0003', uji.kat('Pipeline')));
select uji.sama(uji.ambil('b') -> 'kategori_kerja' ->> 'nama', 'Pipeline', 'atur: tugas ClickUp di mode cermin boleh (metadata app)');
select uji.sama((uji.ambil('b') ->> 'versi')::int, (uji.ambil('v') ->> 'versi')::int, 'atur: versi tidak naik');
select uji.sama(uji.ambil('b') ->> 'updated_at', public.iso_utc((uji.ambil('v') ->> 'updated_at')::timestamptz),
  'atur: updated_at tetap');
select uji.galat($$select public.web_ubah_tugas('z8r3uj0003', '{"name":"ganti"}', (select versi from public.tasks where id = 'z8r3uj0003'))$$,
  'PT409', 'mode cermin: field lain tetap ditolak', null, 'CERMIN_001');
reset role;
select uji.sama((select jsonb_build_object('dari', a.dari, 'ke', a.ke ->> 'nama', 'aktor', a.actor_id, 'sumber', a.sumber)
                   from public.activity a where a.task_id = 'z8r3uj0003' and a.jenis = 'kategori'),
  jsonb_build_object('dari', null, 'ke', 'Pipeline', 'aktor', 100000002, 'sumber', 'ui'), 'riwayat: kategori — → Pipeline oleh Citra');
select uji.mode('utama');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('b', public.web_atur_kategori('z8r3uj0003', null));
select uji.cek(uji.ambil('b') -> 'kategori_kerja' = 'null'::jsonb, 'atur null: kembali tanpa kategori');
select uji.sama(public.web_atur_kategori('z8r3uj0003', '') -> 'kategori_kerja', 'null'::jsonb, 'atur kosong: tanpa kategori (tanpa riwayat baru)');
reset role;
select uji.sama((select count(*)::int from public.activity a where a.task_id = 'z8r3uj0003' and a.jenis = 'kategori'), 2,
  'riwayat: 2 baris (isi lalu kosongkan; set sama tidak dicatat)');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_atur_kategori('z8r3uj0003', 'kkbukanada')$$, 'PT404', 'atur: kategori tak dikenal → 404', null, 'ITEM_013');
select uji.galat($$select public.web_atur_kategori('rtujib0004', null)$$, 'PT404', 'atur: tugas terhapus → 404', null, 'ITEM_013');
select uji.galat($$select public.web_atur_kategori('tidakada01', null)$$, 'PT404', 'atur: tugas tak ada → 404', null, 'ITEM_013');

-- ------------------------------------------------------------ privasi space
reset role;
select uji.konteks('ui', 100000001);
insert into public.spaces (id, name, private) values ('rsujikat01', 'Ruang Privat Kategori', true);
insert into public.lists (id, space_id, name) values ('rlujikat01', 'rsujikat01', 'List Privat Kategori');
insert into public.tasks (id, list_id, name, kategori_id) values ('rtujikat01', 'rlujikat01', 'Iklan rahasia', uji.kat('Ads'));
select uji.konteks(null, null);
select uji.jadi('33333333-3333-4333-8333-333333333333');                       -- dodi: bukan anggota space
select uji.cek(not public.web_tugas_kategori(uji.kat('Ads'))::text like '%rtujikat01%', 'privasi: kartu space privat tidak tampil');
select uji.sama((select (e #>> '{hitungan,terbuka}')::int from jsonb_array_elements(public.web_kategori_kerja() -> 'kategori') e
                  where e ->> 'nama' = 'Ads'), 2, 'privasi: hitungan tidak memuat kartu space privat');
select uji.galat($$select public.web_atur_kategori('rtujikat01', null)$$, 'PT404', 'privasi: atur kartu tak terlihat → 404');
select uji.jadi('11111111-1111-4111-8111-111111111111');                       -- budi (owner) melihat semua
select uji.sama((select (e #>> '{hitungan,terbuka}')::int from jsonb_array_elements(public.web_kategori_kerja() -> 'kategori') e
                  where e ->> 'nama' = 'Ads'), 3, 'owner: hitungan memuat kartu space privat');

-- ------------------------------------------------------------ admin (owner)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_admin_kategori()$$, 'PT403', 'admin: anggota biasa ditolak', null, 'ACCESS_001');
select uji.galat($$select public.web_admin_kategori_simpan('{"aksi":"buat","nama":"Website"}')$$, 'PT403',
  'admin simpan: anggota biasa ditolak', null, 'ACCESS_001');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama((select (e ->> 'jumlah')::int from jsonb_array_elements(public.web_admin_kategori()) e where e ->> 'nama' = 'Ads'), 4,
  'admin: jumlah tugas Ads (termasuk selesai & privat)');
select uji.simpan('d', public.web_admin_kategori_simpan('{"aksi":"buat","nama":"  Website   Teknis "}'));
select uji.sama(uji.ambil('d') -> -1 ->> 'nama', 'Website Teknis', 'buat: nama dirapikan, di urutan terakhir');
select uji.galat($$select public.web_admin_kategori_simpan('{"aksi":"buat","nama":"ads"}')$$, 'PT409', 'buat: nama kembar ditolak',
  'sudah ada', 'KONFLIK_001');
select uji.galat($$select public.web_admin_kategori_simpan('{"aksi":"buat","nama":" "}')$$, 'PT400', 'buat: nama kosong ditolak',
  'wajib', 'INPUT_001');
select uji.galat(format('select public.web_admin_kategori_simpan(%L)', jsonb_build_object('aksi', 'buat', 'nama', repeat('x', 41))),
  'PT400', 'buat: nama > 40 ditolak', '40', 'INPUT_001');
select uji.simpan('d', public.web_admin_kategori_simpan(jsonb_build_object('aksi', 'ganti_nama', 'id', uji.kat('Website Teknis'), 'nama', 'Web')));
select uji.cek(uji.ambil('d') @> '[{"nama":"Web"}]', 'ganti nama');
select uji.galat(format('select public.web_admin_kategori_simpan(%L)', jsonb_build_object('aksi', 'ganti_nama', 'id', uji.kat('Web'), 'nama', 'SEO')),
  'PT409', 'ganti nama: kembar ditolak', null, 'KONFLIK_001');
select uji.simpan('d', public.web_admin_kategori_simpan(jsonb_build_object('aksi', 'urut',
  'ids', jsonb_build_array(uji.kat('Web'), uji.kat('SEO'), uji.kat('Ads'), uji.kat('Konten'), uji.kat('Pipeline')))));
select uji.sama((select array_agg(e ->> 'nama' order by o) from jsonb_array_elements(uji.ambil('d')) with ordinality a(e, o)),
  array['Web','SEO','Ads','Konten','Pipeline'], 'urut: urutan baru');
select uji.galat(format('select public.web_admin_kategori_simpan(%L)', jsonb_build_object('aksi', 'urut', 'ids', jsonb_build_array(uji.kat('Web')))),
  'PT409', 'urut: daftar tidak lengkap ditolak', null, 'KONFLIK_001');
-- hapus: tugas kembali tanpa kategori, Riwayat menyebut nama kategori yang dihapus
select uji.simpan('kseo', to_jsonb(uji.kat('SEO')));
select uji.simpan('d', public.web_admin_kategori_simpan(jsonb_build_object('aksi', 'hapus', 'id', uji.kat('SEO'))));
select uji.cek(not uji.ambil('d')::text like '%"SEO"%', 'hapus: kategori hilang dari daftar');
reset role;
select uji.sama((select count(*)::int from public.tasks where id in ('z8r3uj0002','z8r3uj0004','z8r3uj0010') and kategori_id is null), 3,
  'hapus: tugasnya kembali tanpa kategori');
select uji.sama((select a.dari ->> 'nama' from public.activity a where a.task_id = 'z8r3uj0002' and a.jenis = 'kategori'), 'SEO',
  'hapus: riwayat tugas menyebut kategori lama');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.galat(format('select public.web_admin_kategori_simpan(%L)', jsonb_build_object('aksi', 'hapus', 'id', uji.ambil('kseo') #>> '{}')),
  'PT404', 'hapus lagi → 404', null, 'ITEM_013');
select uji.galat($$select public.web_admin_kategori_simpan('{"aksi":"lompat"}')$$, 'PT400', 'aksi tak dikenal ditolak', null, 'INPUT_001');

-- ------------------------------------------------------------ kunci body `kategori`: web_buat_tugas & API v2
select uji.simpan('w', public.web_buat_tugas('rlujib0001', jsonb_build_object('name', 'Tugas baru berkategori', 'kategori', uji.kat('Konten'))));
select uji.sama(uji.ambil('w') -> 'kategori_kerja' ->> 'nama', 'Konten', 'web_buat_tugas: kategori (id) langsung terpasang');
select uji.cek(public.web_buat_tugas('rlujib0001', '{"name":"Tanpa kategori"}') -> 'kategori_kerja' = 'null'::jsonb,
  'web_buat_tugas: tanpa kunci kategori = tanpa kategori');
reset role;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 900000000002, 'bot tulis', 'rtk_k1', uji.sha('rtk_k1'), 'tulis');
select uji.jadi_service();
select uji.token('bbbbbbbb-0000-4000-8000-0000000000c1');
select uji.simpan('c', public.api_create_task(900000000002, 'rlujib0001', '{"name":"[Claude] Uji kategori API","kategori":"  ads "}'));
select uji.sama((select k.nama from public.tasks t join public.kategori_kerja k on k.id = t.kategori_id where t.id = uji.ambil('c') ->> 'id'),
  'Ads', 'api_create_task: kategori by nama (tanpa beda huruf besar/kecil, spasi tepi dibuang)');
select uji.jalan(format('select public.api_update_task(900000000002, %L, %L)', uji.ambil('c') ->> 'id', '{"kategori":"Pipeline"}'),
  'api_update_task: hanya kunci kategori');
select uji.sama((select k.nama from public.tasks t join public.kategori_kerja k on k.id = t.kategori_id where t.id = uji.ambil('c') ->> 'id'),
  'Pipeline', 'api_update_task: kategori berganti');
select uji.jalan(format('select public.api_update_task(900000000002, %L, %L)', uji.ambil('c') ->> 'id', '{"name":"[Claude] Ganti nama saja"}'),
  'api_update_task: tanpa kunci kategori');
select uji.cek((select kategori_id is not null from public.tasks where id = uji.ambil('c') ->> 'id'), 'api_update_task: tanpa kunci → kategori tetap');
select uji.galat(format('select public.api_update_task(900000000002, %L, %L)', uji.ambil('c') ->> 'id', '{"kategori":"Liar"}'),
  'PT400', 'api: kategori tak dikenal → 400 (menyebut pilihan)', 'Pilihan: Web', 'INPUT_001');
select uji.galat(format('select public.api_update_task(900000000002, %L, %L)', uji.ambil('c') ->> 'id', '{"kategori":5}'),
  'PT400', 'api: kategori bukan teks → 400', null, 'INPUT_001');
select uji.jalan(format('select public.api_update_task(900000000002, %L, %L)', uji.ambil('c') ->> 'id', '{"kategori":null}'),
  'api_update_task: kategori null');
select uji.cek((select kategori_id is null from public.tasks where id = uji.ambil('c') ->> 'id'), 'api_update_task: kategori null → tanpa kategori');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"Batal","kategori":"Liar"}')$$,
  'PT400', 'api_create_task: kategori tak dikenal → seluruh pembuatan batal', null, 'INPUT_001');
reset role;
select uji.sama((select count(*)::int from public.tasks where name = 'Batal'), 0, 'api_create_task gagal: tidak ada tugas setengah jadi');

rollback;
