-- 26 · Pipeline: database pelanggan & log repeat order (20261017120000_pipeline_pelanggan, permintaan Hannes 17 Okt).
-- Kunci nama & nama semu, daftar/detail pelanggan (statistik, log lead/order, penyamaran peran 'baca'), label repeat
-- (order_sebelumnya), cari pelanggan di form Lead baru, ubah pelanggan, saran dobel + "bukan dobel", gabung manual +
-- batal (termasuk rantai A→B→C), dan gabung otomatis data lama (uji kering vs jalankan). Data lead TIDAK boleh berubah
-- selain pelanggan_id-nya.
-- Aktor: budi (owner/admin), citra (rep RSG), dodi (baca), eka (rep MCE).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;

-- ------------------------------------------------------------ kunci nama & nama semu
select uji.sama(public.pipeline_nama_kunci('PT. Berkah Nidatama'), 'berkahnidatama', 'kunci: "PT." di depan dibuang');
select uji.sama(public.pipeline_nama_kunci('berkah nidatama, PT'), 'berkahnidatama', 'kunci: ", PT" di belakang dibuang');
select uji.sama(public.pipeline_nama_kunci('CV Berkah Nida-Tama'), 'berkahnidatama', 'kunci: CV + tanda hubung');
select uji.sama(public.pipeline_nama_kunci('PT.Sumatera Kartindo'), 'sumaterakartindo', 'kunci: "PT." tanpa spasi');
select uji.sama(public.pipeline_nama_kunci('PT Terang Dunia Internusa Tbk'), 'terangduniainternusa', 'kunci: Tbk di belakang dibuang');
select uji.sama(public.pipeline_nama_kunci('PTPN Nusantara'), 'ptpnnusantara', 'kunci: "PTPN" bukan bentuk usaha (tetap)');
select uji.sama(public.pipeline_nama_kunci('UD. Ando Jaya'), 'andojaya', 'kunci: UD');
select uji.sama(public.pipeline_nama_kunci(' - '), null::text, 'kunci: "-" → null');
select uji.cek(public.pipeline_nama_semu('-') and public.pipeline_nama_semu('Perorangan') and public.pipeline_nama_semu('PRIBADI')
  and public.pipeline_nama_semu('(Tanpa nama perusahaan)') and public.pipeline_nama_semu('PT') and public.pipeline_nama_semu('12345')
  and public.pipeline_nama_semu(null), 'nama semu dikenali (-, Perorangan, PRIBADI, (Tanpa nama perusahaan), PT, angka, null)');
select uji.cek(not public.pipeline_nama_semu('PT BKI') and not public.pipeline_nama_semu('Hermanto Norita'),
  'nama asli (singkatan, nama orang) bukan semu');

-- ------------------------------------------------------------ hak
select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pipeline_nama_kunci', 'pipeline_nama_semu', 'pipeline_pelanggan_akhir', 'pipeline_pelanggan_stat',
                       'j_pipeline_pelanggan_ringkas', 'pipeline_pelanggan_pic', 'inti_pipeline_pelanggan_daftar',
                       'inti_pipeline_pelanggan', 'inti_pipeline_pelanggan_ubah', 'pipeline_pelanggan_gabung_satu',
                       'inti_pipeline_pelanggan_gabung', 'inti_pipeline_pelanggan_gabung_batal', 'pipeline_dobel_kelompok',
                       'inti_pipeline_pelanggan_dobel', 'inti_pipeline_pelanggan_dobel_abaikan',
                       'pipeline_pelanggan_gabung_otomatis', 'inti_pipeline_pelanggan_cari')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'pembantu & inti pelanggan (termasuk gabung otomatis) tidak bisa dipanggil role API');
select uji.cek((select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   and not has_function_privilege('service_role', p.oid, 'EXECUTE')
                   and not has_function_privilege('anon', p.oid, 'EXECUTE') and p.prosecdef
                   and coalesce(p.proconfig, '{}') @> array['search_path=""']) and count(*) = 7
                  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'web\_pipeline\_pelanggan%'
                   and p.proname <> 'web_pipeline_pelanggan_cari'),
  '7 web_pipeline_pelanggan* baru: authenticated saja, SECURITY DEFINER, search_path kosong');
select uji.cek(not has_table_privilege('authenticated', 'public.pelanggan_gabung', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.pelanggan_gabung', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.pelanggan_dobel_abaikan', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.pelanggan_dobel_abaikan', 'SELECT,INSERT,UPDATE,DELETE')
  and (select relrowsecurity from pg_class where oid = 'public.pelanggan_gabung'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.pelanggan_dobel_abaikan'::regclass),
  'tabel log gabung & abaikan: RLS ON, tertutup untuk klien');

-- ------------------------------------------------------------ data uji
-- Berkah (3 ejaan, 1 tanpa kota) → kelompok 'nama'; Joko (2 nama semu, nomor sama, beda format) → 'telepon' semu;
-- Sinar/Bandara (nama beda, nomor sama) → 'telepon' (TIDAK otomatis); Asiaparts (salah ketik) → 'mirip'; Rantai A/B/C.
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota, jenis) values
  ('plujipg01', 'PT. Berkah Nidatama', null, 'perusahaan'),
  ('plujipg02', 'berkah nidatama, PT', 'Samarinda', 'perusahaan'),
  ('plujipg03', 'CV Berkah Nida-Tama', 'Jakarta Utara', 'perusahaan'),
  ('plujipg04', '-', 'Bekasi', 'perorangan'),
  ('plujipg05', 'Perorangan', null, 'perorangan'),
  ('plujipg06', 'PT Asiaparts Indotech', 'Tangerang', 'perusahaan'),
  ('plujipg07', 'PT. Asiaparts Indotect', null, 'perusahaan'),
  ('plujipg08', 'PT Sinar Uji Abadi', 'Wamena', 'perusahaan'),
  ('plujipg09', 'CV Bandara Uji Baliem', 'Wamena', 'perusahaan'),
  ('plujipg11', 'PT Rantai Uji Satu', 'Surabaya', 'perusahaan'),
  ('plujipg12', 'PT Rantai Uji Dua', 'Malang', 'perusahaan'),
  ('plujipg13', 'PT Rantai Uji Tiga', null, 'perusahaan'),
  ('plujipg14', 'PT Tanpa Lead Uji', null, 'perusahaan');
insert into public.kontak (id, pelanggan_id, nama, telepon, telepon_tampil) values
  ('ktujipg01', 'plujipg01', 'Ibu Rina Uji', '6281200000001', '0812-0000-0001'),
  ('ktujipg02', 'plujipg02', 'Pak Andi Uji', '6281200000002', '0812-0000-0002'),
  ('ktujipg04', 'plujipg04', 'Pak Joko Uji', '6281211112222', '0812-1111-2222'),
  ('ktujipg05', 'plujipg05', 'Joko Uji', '6281211112222', '+62 812 1111 2222'),
  ('ktujipg08', 'plujipg08', 'Pak Yosua Uji', '6281355556666', '0813-5555-6666'),
  ('ktujipg09', 'plujipg09', 'Yosua Uji', '6281355556666', '0813-5555-6666'),
  ('ktujipg11', 'plujipg11', 'Rantai Satu', '6281777700011', null);
-- Berkah: 01 = order Jan + order Jun (repeat), 02 = order Mar, 03 = lead BARU Okt. Joko: 04 order, 05 BARU.
insert into public.lead (id, kode, pelanggan_id, kontak_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujipg01', 'UPG-001', 'plujipg01', 'ktujipg01', 'Google Ads', 100000002, 'ORDER', '2026-01-05', '9801/RSG/I/2026', '2026-01-10', 10000000),
  ('ldujipg02', 'UPG-002', 'plujipg02', 'ktujipg02', 'WA langsung', 100000002, 'ORDER', '2026-03-02', '9802/RSG/III/2026', '2026-03-12', 5000000),
  ('ldujipg03', 'UPG-003', 'plujipg01', 'ktujipg01', 'Website organik', 900000000001, 'ORDER', '2026-06-01', '9803/MCE/VI/2026', '2026-06-11', 7000000),
  ('ldujipg04', 'UPG-004', 'plujipg03', null, 'Google Ads', 100000002, 'BARU', '2026-10-01', null, null, null),
  ('ldujipg05', 'UPG-005', 'plujipg04', 'ktujipg04', 'Telepon', 100000002, 'ORDER', '2026-02-01', '9805/RSG/II/2026', '2026-02-03', 2000000),
  ('ldujipg06', 'UPG-006', 'plujipg05', 'ktujipg05', 'WA langsung', 100000002, 'BARU', '2026-09-20', null, null, null),
  ('ldujipg07', 'UPG-007', 'plujipg06', null, 'Google Ads', 900000000001, 'PENAWARAN', '2026-09-01', null, null, null),
  ('ldujipg08', 'UPG-008', 'plujipg07', null, 'Google Ads', 900000000001, 'BATAL', '2026-08-01', null, null, null),
  ('ldujipg09', 'UPG-009', 'plujipg08', 'ktujipg08', 'Referral', 100000002, 'ORDER', '2026-04-01', '9809/RSG/IV/2026', '2026-04-02', 3000000),
  ('ldujipg10', 'UPG-010', 'plujipg09', 'ktujipg09', 'Referral', 100000002, 'BARU', '2026-09-01', null, null, null),
  ('ldujipg11', 'UPG-011', 'plujipg11', 'ktujipg11', 'Telepon', 100000002, 'BARU', '2026-09-02', null, null, null),
  ('ldujipg12', 'UPG-012', 'plujipg12', null, 'Telepon', 100000002, 'BARU', '2026-09-03', null, null, null),
  ('ldujipg13', 'UPG-013', 'plujipg13', null, 'Telepon', 100000002, 'BARU', '2026-09-04', null, null, null);
update public.lead set alasan_batal = 'Harga' where id = 'ldujipg08';
insert into public.lead_item (lead_id, produk, qty) values
  ('ldujipg01', 'Pallet Mesh', 40), ('ldujipg02', 'Roda', 8), ('ldujipg03', 'Pallet Mesh', 20), ('ldujipg04', 'Lemari Arsip', 2),
  ('ldujipg05', 'Roda', 4), ('ldujipg06', 'Roda', 2);
select uji.konteks(null, null);

-- pembanding: baris lead tanpa kolom yang memang boleh berubah saat gabung
create function pg_temp.baris_lead() returns jsonb language sql as $$
  select jsonb_object_agg(l.id, to_jsonb(l) - array['pelanggan_id', 'diperbarui_pada', 'cari']) from public.lead l where l.id like 'ldujipg%'
$$;
select uji.simpan('lead0', pg_temp.baris_lead());
create function pg_temp.item(p_daftar jsonb, p_id text) returns jsonb language sql as $$
  select e from jsonb_array_elements(p_daftar -> 'items') e where e ->> 'id' = p_id
$$;
create function pg_temp.ids(p_daftar jsonb) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}') from jsonb_array_elements(p_daftar -> 'items') e where e ->> 'id' like 'plujipg%'
$$;
create function pg_temp.ids_urut(p_daftar jsonb) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'id' order by n), '{}') from jsonb_array_elements(p_daftar -> 'items') with ordinality x(e, n) where e ->> 'id' like 'plujipg%'
$$;
create function pg_temp.cari_ids(p jsonb) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'id' order by n), '{}') from jsonb_array_elements(p) with ordinality x(e, n) where e ->> 'id' like 'plujipg%'
$$;
grant execute on function pg_temp.item(jsonb, text), pg_temp.ids(jsonb), pg_temp.ids_urut(jsonb), pg_temp.cari_ids(jsonb) to authenticated;

-- ------------------------------------------------------------ label repeat di baris ringkas lead
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg01') ->> 'order_sebelumnya')::int, 0, 'repeat: order pertama Berkah → 0');
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg03') ->> 'order_sebelumnya')::int, 1, 'repeat: order kedua pelanggan yang sama → 1');
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg04') ->> 'order_sebelumnya')::int, 0,
  'repeat: ejaan lain (pelanggan terpisah, belum digabung) → 0');
select uji.sama(public.j_pipeline_lead_ringkas('ldujipg03') ->> 'pelanggan_id', 'plujipg01', 'ringkas lead membawa pelanggan_id');
-- urutan order = tanggal SP, bukan tanggal masuk: lead Jan yang baru order Jun adalah order KEDUA bila lead Mar sudah
-- order Apr. Lead non-order dihitung terhadap order yang terjadi sampai tanggal ia masuk.
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujipg15', 'PT Urutan Order Uji');
insert into public.lead (id, kode, pelanggan_id, sumber, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujipg15', 'UPG-015', 'plujipg15', 'Telepon', 'ORDER', '2026-01-02', '9815/RSG/VI/2026', '2026-06-15', 1000000),
  ('ldujipg16', 'UPG-016', 'plujipg15', 'Telepon', 'ORDER', '2026-03-01', '9816/RSG/IV/2026', '2026-04-01', 1000000),
  ('ldujipg17', 'UPG-017', 'plujipg15', 'Telepon', 'BARU', '2026-05-01', null, null, null),
  ('ldujipg18', 'UPG-018', 'plujipg15', 'Telepon', 'BARU', '2026-03-31', null, null, null);
select uji.konteks(null, null);
select uji.sama(array[(public.j_pipeline_lead_ringkas('ldujipg16') ->> 'order_sebelumnya')::int,
                      (public.j_pipeline_lead_ringkas('ldujipg15') ->> 'order_sebelumnya')::int,
                      (public.j_pipeline_lead_ringkas('ldujipg17') ->> 'order_sebelumnya')::int,
                      (public.j_pipeline_lead_ringkas('ldujipg18') ->> 'order_sebelumnya')::int],
  array[0, 1, 1, 0], 'repeat: urut tanggal SP (order Apr = ke-1, order Jun = ke-2); lead BARU Mei → 1, lead BARU 31 Mar → 0');
select uji.sama((select array_agg((b.j ->> 'order_sebelumnya')::int order by b.n)
                   from public.j_pipeline_lead_ringkas_banyak(array['ldujipg16', 'ldujipg15', 'ldujipg17', 'ldujipg18']) b),
  array[0, 1, 1, 0], 'repeat: _banyak sama');
delete from public.lead where pelanggan_id = 'plujipg15';
delete from public.pelanggan where id = 'plujipg15';
select uji.sama((select count(*)::int from public.j_pipeline_lead_ringkas_banyak(array(select id from public.lead where id like 'ldujipg%')) b
                  where b.j is distinct from public.j_pipeline_lead_ringkas(b.id)), 0, '_banyak = j_pipeline_lead_ringkas (field baru ikut)');

-- ------------------------------------------------------------ daftar pelanggan
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('d_admin', public.web_pipeline_pelanggan_daftar('{}'));
select uji.sama(pg_temp.ids(uji.ambil('d_admin')), array['plujipg01','plujipg02','plujipg03','plujipg04','plujipg05','plujipg06',
  'plujipg07','plujipg08','plujipg09','plujipg11','plujipg12','plujipg13','plujipg14'], 'daftar: semua pelanggan (termasuk tanpa lead)');
select uji.sama(pg_temp.item(uji.ambil('d_admin'), 'plujipg01') - array['produk', 'kota'],
  jsonb_build_object('id', 'plujipg01', 'nama', 'PT. Berkah Nidatama', 'semu', false, 'jenis', 'perusahaan', 'pic', 'Ibu Rina Uji',
    'jml_lead', 2, 'jml_order', 2, 'jml_batal', 0, 'jml_aktif', 0, 'nilai_order', 17000000, 'lead_pertama', '2026-01-05',
    'lead_terakhir', '2026-06-01', 'order_pertama', '2026-01-10', 'order_terakhir', '2026-06-11'),
  'daftar: statistik pelanggan (lead, order, nilai, tanggal order dari SP, PIC)');
select uji.sama(pg_temp.item(uji.ambil('d_admin'), 'plujipg01') -> 'produk', '["Pallet Mesh"]'::jsonb, 'daftar: produk unik');
select uji.cek(pg_temp.item(uji.ambil('d_admin'), 'plujipg04') @> '{"semu": true, "pic": "Pak Joko Uji"}'
  and pg_temp.item(uji.ambil('d_admin'), 'plujipg14') @> '{"jml_lead": 0, "jml_order": 0, "lead_terakhir": null}',
  'daftar: perorangan nama semu membawa PIC; pelanggan tanpa lead = 0');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"saring":"repeat"}')), array['plujipg01'], 'saring repeat: ≥2 order');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"saring":"order"}')), array['plujipg01','plujipg02','plujipg04','plujipg08'],
  'saring order: ≥1 order');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"saring":"aktif"}')),
  array['plujipg03','plujipg05','plujipg06','plujipg09','plujipg11','plujipg12','plujipg13'], 'saring aktif: ada lead BARU/PENAWARAN');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"berkah nidatama"}')), array['plujipg01','plujipg02','plujipg03'],
  'cari: kunci nama menemukan semua ejaan');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"0812 1111 2222"}')), array['plujipg04','plujipg05'],
  'cari (admin): nomor HP format lain');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"rina uji"}')), array['plujipg01'], 'cari (admin): nama PIC');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"wamena"}')), array['plujipg08','plujipg09'], 'cari: kota');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"100%_"}')), array[]::text[], 'cari: % dan _ bukan wildcard');
select uji.sama(pg_temp.ids_urut(public.web_pipeline_pelanggan_daftar('{"urut":"order","saring":"order"}')),
  array['plujipg01','plujipg02','plujipg08','plujipg04'], 'urut order: jumlah order lalu nilai');
select uji.sama((pg_temp.ids_urut(public.web_pipeline_pelanggan_daftar('{"urut":"nama","q":"rantai uji"}'))),
  array['plujipg12','plujipg11','plujipg13'], 'urut nama (abjad)');
select uji.galat($q$select public.web_pipeline_pelanggan_daftar('{"saring":"aneh"}')$q$, 'PT400', 'saringan tak dikenal ditolak', 'Saringan', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_daftar('{"urut":"aneh"}')$q$, 'PT400', 'urutan tak dikenal ditolak', 'Urutan', 'INPUT_001');
reset role;

select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.simpan('d_baca', public.web_pipeline_pelanggan_daftar('{}'));
select uji.cek(pg_temp.item(uji.ambil('d_baca'), 'plujipg01') ->> 'nama' = 'PT. Berkah Nidatama'
  and pg_temp.item(uji.ambil('d_baca'), 'plujipg01') -> 'pic' = 'null'::jsonb
  and pg_temp.item(uji.ambil('d_baca'), 'plujipg04') -> 'pic' = 'null'::jsonb, 'baca: daftar tanpa PIC');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"0812 1111 2222"}')), array[]::text[], 'baca: tidak bisa cari lewat nomor HP');
select uji.sama(pg_temp.ids(public.web_pipeline_pelanggan_daftar('{"q":"rina uji"}')), array[]::text[], 'baca: tidak bisa cari lewat nama PIC');
reset role;

-- ------------------------------------------------------------ detail pelanggan
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('p01', public.web_pipeline_pelanggan('plujipg01'));
select uji.sama((uji.ambil('p01') -> 'ringkas') - 'produk', jsonb_build_object('jml_lead', 2, 'jml_order', 2, 'jml_batal', 0, 'jml_aktif', 0,
  'nilai_order', 17000000, 'lead_pertama', '2026-01-05', 'lead_terakhir', '2026-06-01', 'order_pertama', '2026-01-10',
  'order_terakhir', '2026-06-11', 'jeda_order_hari', 152), 'detail: ringkasan + jeda rata-rata antar order (hari)');
select uji.sama((select array_agg(e ->> 'id' order by n) from jsonb_array_elements(uji.ambil('p01') -> 'leads') with ordinality x(e, n)),
  array['ldujipg03', 'ldujipg01'], 'detail: log lead terbaru dulu');
select uji.sama((select array_agg((e ->> 'order_sebelumnya')::int order by n) from jsonb_array_elements(uji.ambil('p01') -> 'leads') with ordinality x(e, n)),
  array[1, 0], 'detail: tiap lead membawa order_sebelumnya');
select uji.cek(uji.ambil('p01') -> 'kontak' @> '[{"id":"ktujipg01","nama":"Ibu Rina Uji","telepon":"0812-0000-0001","jml_lead":2}]'
  and uji.ambil('p01') @> '{"kontak_disembunyikan": false, "boleh_ubah": true, "boleh_gabung": true}', 'detail admin: kontak + hak');
select uji.sama((select jsonb_object_agg(e ->> 'id', e ->> 'alasan') from jsonb_array_elements(uji.ambil('p01') -> 'mungkin_sama') e),
  '{"plujipg02":"nama","plujipg03":"nama"}'::jsonb, 'detail admin: mungkin sama (nama sama)');
select uji.sama((select jsonb_object_agg(e ->> 'id', e ->> 'alasan') from jsonb_array_elements(public.web_pipeline_pelanggan('plujipg06') -> 'mungkin_sama') e),
  '{"plujipg07":"mirip"}'::jsonb, 'detail admin: mungkin sama (nama mirip / salah ketik)');
select uji.sama((select jsonb_object_agg(e ->> 'id', e ->> 'alasan') from jsonb_array_elements(public.web_pipeline_pelanggan('plujipg04') -> 'mungkin_sama') e),
  '{"plujipg05":"telepon"}'::jsonb, 'detail admin: mungkin sama (nomor HP sama, nama semu)');
select uji.cek(public.web_pipeline_pelanggan('plujipg04') -> 'pelanggan' @> '{"semu": true, "pic": "Pak Joko Uji"}', 'detail: PIC untuk nama semu');
select uji.galat($q$select public.web_pipeline_pelanggan('pltidakada')$q$, 'PT404', 'detail: pelanggan tak ada → 404', 'tidak ditemukan', 'ITEM_013');
reset role;

select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek(public.web_pipeline_pelanggan('plujipg01') @> '{"mungkin_sama": [], "boleh_ubah": true, "boleh_gabung": false}',
  'detail rep: tanpa saran gabung, boleh ubah, tidak boleh gabung');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.simpan('p01b', public.web_pipeline_pelanggan('plujipg01'));
select uji.cek(uji.ambil('p01b') @> '{"kontak": [], "kontak_disembunyikan": true, "mungkin_sama": [], "boleh_ubah": false, "boleh_gabung": false}'
  and uji.ambil('p01b') -> 'pelanggan' -> 'pic' = 'null'::jsonb and jsonb_array_length(uji.ambil('p01b') -> 'leads') = 2,
  'detail baca: kontak & PIC disembunyikan, log lead tetap terlihat');
reset role;
select uji.jadi_anon();
select uji.galat($q$select public.web_pipeline_pelanggan('plujipg01')$q$, '42501', 'anon: web_pipeline_pelanggan ditolak');
reset role;
select uji.jadi_service();
select uji.galat($q$select public.web_pipeline_pelanggan_daftar('{}')$q$, '42501', 'service_role: web_pipeline_pelanggan_daftar ditolak');
reset role;

-- ------------------------------------------------------------ anggota TANPA akses Pipeline (peran NULL): semua ditolak
-- (20261017130000: dulu `peran not in (…)` meloloskan NULL di ubah & cari)
delete from public.pipeline_akses where member_id = 900000000001;
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","nama":"Diubah tanpa akses"}')$q$, 'PT403',
  'tanpa akses: ubah pelanggan ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_cari('berkah')$q$, 'PT403', 'tanpa akses: cari pelanggan ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_cari('0812-1111-2222')$q$, 'PT403', 'tanpa akses: cari lewat nomor HP ditolak',
  'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_daftar('{}')$q$, 'PT403', 'tanpa akses: daftar ditolak', 'akses Pipeline', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan('plujipg01')$q$, 'PT403', 'tanpa akses: detail ditolak', 'akses Pipeline', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel()$q$, 'PT403', 'tanpa akses: saran dobel ditolak', 'Hanya admin', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg07"]}')$q$, 'PT403',
  'tanpa akses: gabung ditolak', 'Hanya admin', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel_abaikan('{"alasan":"mirip","ids":["plujipg06","plujipg07"]}')$q$, 'PT403',
  'tanpa akses: bukan dobel ditolak', 'Hanya admin', 'ACCESS_001');
reset role;
select uji.sama((select nama from public.pelanggan where id = 'plujipg13'), 'PT Rantai Uji Tiga', 'tanpa akses: nama pelanggan tidak berubah');
insert into public.pipeline_akses (member_id, peran, kode_sp) values (900000000001, 'rep', 'MCE');

-- ------------------------------------------------------------ cari pelanggan (form Lead baru)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('c1', public.web_pipeline_pelanggan_cari('PT Berkah Nidatama'));
select uji.sama(pg_temp.cari_ids(uji.ambil('c1')), array['plujipg01','plujipg02','plujipg03'], 'cari: kunci sama, urut order terbanyak');
select uji.cek(uji.ambil('c1') -> 0 @> '{"id":"plujipg01","jml_lead":2,"jml_order":2,"order_terakhir":"2026-06-11","semu":false}'
  and uji.ambil('c1') -> 0 -> 'kontak' @> '[{"id":"ktujipg01","telepon":"0812-0000-0001"}]', 'cari: membawa jumlah lead/order & kontak');
select uji.sama(pg_temp.cari_ids(public.web_pipeline_pelanggan_cari('Perorangan')), array[]::text[], 'cari: nama semu tidak disarankan lewat nama');
select uji.sama(pg_temp.cari_ids(public.web_pipeline_pelanggan_cari('0812-1111-2222')), array['plujipg04','plujipg05'],
  'cari: nomor HP menemukan perorangan bernama semu (order dulu)');
select uji.sama(pg_temp.cari_ids(public.web_pipeline_pelanggan_cari('nidatam')), array['plujipg01','plujipg02','plujipg03'], 'cari: sebagian nama');
reset role;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) select 'plujipgx' || g, 'PT Banyak Uji ' || g from generate_series(1, 20) g;
select uji.konteks(null, null);
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama(jsonb_array_length(public.web_pipeline_pelanggan_cari('banyak uji')), 15, 'cari: dibatasi 15 hasil');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($q$select public.web_pipeline_pelanggan_cari('berkah')$q$, 'PT403', 'cari: peran baca ditolak (seperti dulu)', 'akses tulis', 'ACCESS_001');
reset role;
delete from public.pelanggan where id like 'plujipgx%';

-- ------------------------------------------------------------ ubah pelanggan
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek(public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","kota":" Gresik ","catatan":"pelanggan lama"}') -> 'pelanggan'
  @> '{"nama":"PT Rantai Uji Tiga","kota":"Gresik","catatan":"pelanggan lama"}', 'ubah (rep): kota & catatan, nama tetap');
select uji.galat($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","nama":"  "}')$q$, 'PT400', 'ubah: nama kosong ditolak', 'Nama pelanggan wajib', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","jenis":"koperasi"}')$q$, 'PT400', 'ubah: jenis tak sah', 'Jenis', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_pelanggan_ubah(%L)', jsonb_build_object('pelanggan_id', 'plujipg13', 'nama', repeat('x', 201))),
  'PT400', 'ubah: nama >200 ditolak', 'terlalu panjang', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"pltidakada","kota":"x"}')$q$, 'PT404', 'ubah: tak ada → 404', 'tidak ditemukan', 'ITEM_013');
select uji.jalan($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","kota":""}')$q$, 'ubah: kota dikosongkan lagi');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($q$select public.web_pipeline_pelanggan_ubah('{"pelanggan_id":"plujipg13","kota":"x"}')$q$, 'PT403', 'ubah: baca ditolak', 'akses tulis', 'ACCESS_001');
reset role;
select uji.sama((select kota from public.pelanggan where id = 'plujipg13'), null::text, 'ubah: kota kosong → null');

-- ------------------------------------------------------------ saran dobel
select uji.jadi('11111111-1111-4111-8111-111111111111');
create function pg_temp.kel() returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(e ->> 'kunci', (select jsonb_agg(a ->> 'id' order by a ->> 'id') from jsonb_array_elements(e -> 'anggota') a)), '{}')
    from jsonb_array_elements(public.web_pipeline_pelanggan_dobel() -> 'kelompok') e
   where e ->> 'kunci' like '%plujipg%'
$$;
grant execute on function pg_temp.kel() to authenticated;
select uji.sama(pg_temp.kel(), jsonb_build_object(
  'nama:plujipg01,plujipg02,plujipg03', jsonb_build_array('plujipg01','plujipg02','plujipg03'),
  'telepon:plujipg04,plujipg05', jsonb_build_array('plujipg04','plujipg05'),
  'telepon:plujipg08,plujipg09', jsonb_build_array('plujipg08','plujipg09'),
  'mirip:plujipg06,plujipg07', jsonb_build_array('plujipg06','plujipg07')), 'saran dobel: nama, telepon (semu & beda nama), mirip');
select uji.cek((select e -> 'anggota' -> 0 @> '{"id":"plujipg01","telepon":["0812-0000-0001"]}'
                  from jsonb_array_elements(public.web_pipeline_pelanggan_dobel() -> 'kelompok') e where e ->> 'alasan' = 'nama' and e ->> 'kunci' like '%plujipg01%'),
  'saran dobel: anggota pertama = lead terbanyak, membawa nomor HP');
select uji.jalan($q$select public.web_pipeline_pelanggan_dobel_abaikan('{"alasan":"telepon","ids":["plujipg09","plujipg08"]}')$q$,
  'bukan dobel: Sinar/Bandara ditandai');
select uji.cek(not (pg_temp.kel() ? 'telepon:plujipg08,plujipg09'), 'bukan dobel: kelompok hilang dari saran');
select uji.sama(public.web_pipeline_pelanggan('plujipg08') -> 'mungkin_sama', '[]'::jsonb, 'bukan dobel: hilang juga dari detail');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel_abaikan('{"alasan":"telepon","ids":["plujipg08"]}')$q$, 'PT400',
  'bukan dobel: minimal 2 pelanggan', 'Minimal 2', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel_abaikan('{"alasan":"lain","ids":["plujipg08","plujipg09"]}')$q$, 'PT400',
  'bukan dobel: alasan tak sah', 'Alasan', 'INPUT_001');
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel()$q$, 'PT403', 'saran dobel: rep ditolak', 'Hanya admin', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_pelanggan_dobel_abaikan('{"alasan":"mirip","ids":["plujipg06","plujipg07"]}')$q$, 'PT403',
  'bukan dobel: rep ditolak', 'Hanya admin', 'ACCESS_001');
reset role;

-- ------------------------------------------------------------ gabung otomatis (data lama)
select uji.galat($q$select public.pipeline_pelanggan_gabung_otomatis(100000002, false)$q$, 'PT400', 'otomatis: aktor bukan owner ditolak',
  'harus owner', 'INPUT_001');
select uji.simpan('oto0', public.pipeline_pelanggan_gabung_otomatis(100000001, false));
select uji.cek(uji.ambil('oto0') @> '{"dijalankan": false, "kelompok": 2, "pelanggan_digabung": 3, "lead_dipindah": 3}'
  and (uji.ambil('oto0') #>> '{sesudah,pelanggan}')::int = (uji.ambil('oto0') #>> '{sebelum,pelanggan}')::int - 3
  and uji.ambil('oto0') #>> '{sesudah,lead}' = uji.ambil('oto0') #>> '{sebelum,lead}',
  'otomatis uji kering: 2 kelompok (nama Berkah, telepon Joko), 3 pelanggan, 3 lead, jumlah lead tetap');
select uji.sama((select count(*)::int from public.pelanggan where id like 'plujipg%'), 13, 'otomatis uji kering: tidak ada yang berubah');
select uji.sama((select count(*)::int from public.pelanggan_gabung), 0, 'otomatis uji kering: tanpa log');
select uji.sama((select jsonb_agg(r - 'jml_lead' order by r ->> 'alasan') from jsonb_array_elements(uji.ambil('oto0') -> 'rincian') r),
  '[{"alasan":"nama","ke_id":"plujipg01","ke":"PT. Berkah Nidatama","dari":["berkah nidatama, PT","CV Berkah Nida-Tama"]},
    {"alasan":"telepon","ke_id":"plujipg04","ke":"-","dari":["Perorangan"]}]'::jsonb,
  'otomatis: tujuan = lead/order terbanyak; Sinar/Bandara (nomor sama, nama beda) & Asiaparts (mirip) TIDAK otomatis');

select uji.simpan('oto1', public.pipeline_pelanggan_gabung_otomatis(100000001, true));
select uji.sama(uji.ambil('oto1') - 'dijalankan', uji.ambil('oto0') - 'dijalankan', 'otomatis dijalankan: laporan = uji kering');
select uji.sama((select array_agg(id order by id) from public.pelanggan where id like 'plujipg%'),
  array['plujipg01','plujipg04','plujipg06','plujipg07','plujipg08','plujipg09','plujipg11','plujipg12','plujipg13','plujipg14'],
  'otomatis: sumber Berkah & Joko terhapus, sisanya utuh');
select uji.sama((select array_agg(id order by id) from public.lead where pelanggan_id = 'plujipg01'), array['ldujipg01','ldujipg02','ldujipg03','ldujipg04'],
  'otomatis: semua lead Berkah di satu pelanggan');
select uji.sama((select array_agg(id order by id) from public.kontak where pelanggan_id = 'plujipg04'), array['ktujipg04','ktujipg05'],
  'otomatis: kontak Joko ikut pindah');
select uji.sama((select kota from public.pelanggan where id = 'plujipg01'), 'Samarinda', 'otomatis: kota tujuan kosong diisi kota sumber');
select uji.sama((select jsonb_agg(jsonb_build_array(dari_id, ke_id, cara, alasan, oleh, ke_kota_diisi) order by dari_id) from public.pelanggan_gabung),
  '[["plujipg02","plujipg01","otomatis","nama",100000001,true],["plujipg03","plujipg01","otomatis","nama",100000001,false],
    ["plujipg05","plujipg04","otomatis","telepon",100000001,false]]'::jsonb, 'otomatis: log per sumber (cara, alasan, aktor)');
select uji.sama(pg_temp.baris_lead(), uji.ambil('lead0'), 'otomatis: data lead lain tidak berubah (hanya pelanggan_id)');
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg02') ->> 'order_sebelumnya')::int, 1, 'sesudah gabung: order Mar = repeat (sesudah order Jan)');
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg03') ->> 'order_sebelumnya')::int, 2, 'sesudah gabung: order Jun = order ke-3');
select uji.sama((public.j_pipeline_lead_ringkas('ldujipg04') ->> 'order_sebelumnya')::int, 3, 'sesudah gabung: lead baru Okt → 3 order sebelumnya');
select uji.simpan('oto2', public.pipeline_pelanggan_gabung_otomatis(100000001, true));
select uji.cek(uji.ambil('oto2') @> '{"kelompok": 0, "pelanggan_digabung": 0}', 'otomatis diulang: tidak ada lagi yang digabung (idempoten)');

select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(public.web_pipeline_pelanggan('plujipg02'), '{"digabung_ke":"plujipg01"}'::jsonb, 'tautan lama pelanggan yang digabung → tujuan');
select uji.cek((select bool_and(e @> '{"cara":"otomatis","alasan":"nama","oleh_nama":"budi santoso","dibatalkan_pada":null}')
                  and count(*) = 2 from jsonb_array_elements(public.web_pipeline_pelanggan('plujipg01') -> 'gabung') e),
  'detail: riwayat gabung tampil');
reset role;

-- ------------------------------------------------------------ batal gabung
select uji.simpan('g02', (select to_jsonb(g) from public.pelanggan_gabung g where dari_id = 'plujipg02'));
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat(format('select public.web_pipeline_pelanggan_gabung_batal(%L)', jsonb_build_object('gabung_id', uji.ambil('g02') ->> 'id')),
  'PT403', 'batal gabung: rep ditolak', 'Hanya admin', 'ACCESS_001');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('b02', public.web_pipeline_pelanggan_gabung_batal(jsonb_build_object('gabung_id', uji.ambil('g02') ->> 'id')));
select uji.cek(uji.ambil('b02') -> 'pelanggan' @> '{"id":"plujipg02","nama":"berkah nidatama, PT","kota":"Samarinda"}'
  and (uji.ambil('b02') #>> '{ringkas,jml_lead}')::int = 1, 'batal gabung: pelanggan asal pulih dengan leadnya');
select uji.galat(format('select public.web_pipeline_pelanggan_gabung_batal(%L)', jsonb_build_object('gabung_id', uji.ambil('g02') ->> 'id')),
  'PT409', 'batal gabung dua kali ditolak', 'sudah dibatalkan', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung_batal('{"gabung_id":"999999999"}')$q$, 'PT404', 'batal gabung: log tak ada', 'tidak ditemukan', 'ITEM_013');
reset role;
select uji.sama((select pelanggan_id from public.lead where id = 'ldujipg02'), 'plujipg02', 'batal gabung: lead kembali');
select uji.sama((select pelanggan_id from public.kontak where id = 'ktujipg02'), 'plujipg02', 'batal gabung: kontak kembali');
select uji.sama((select kota from public.pelanggan where id = 'plujipg01'), null::text, 'batal gabung: kota tujuan yang dulu diisi dikembalikan');
select uji.sama((select array_agg(id order by id) from public.lead where pelanggan_id = 'plujipg01'), array['ldujipg01','ldujipg03','ldujipg04'],
  'batal gabung: lead gabungan lain tetap di tujuan');
select uji.cek((select dibatalkan_pada is not null and dibatalkan_oleh = 100000001 from public.pelanggan_gabung where dari_id = 'plujipg02'),
  'batal gabung: log ditandai (siapa/kapan)');
select uji.sama(pg_temp.baris_lead(), uji.ambil('lead0'), 'batal gabung: data lead tetap');

-- ------------------------------------------------------------ gabung manual
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg07"]}')$q$, 'PT403',
  'gabung: rep ditolak', 'Hanya admin', 'ACCESS_001');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg07"]}')$q$, 'PT403',
  'gabung: baca ditolak', 'Hanya admin', 'ACCESS_001');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg06"]}')$q$, 'PT400',
  'gabung: tujuan = sumber ditolak', 'sama dengan', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":[]}')$q$, 'PT400',
  'gabung: tanpa sumber ditolak', 'minimal 1', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["pltidakada"]}')$q$, 'PT404',
  'gabung: sumber tak ada', 'tidak ditemukan', 'ITEM_013');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"pltidakada","dari_ids":["plujipg07"]}')$q$, 'PT404',
  'gabung: tujuan tak ada', 'tujuan tidak ditemukan', 'ITEM_013');
select uji.galat($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg07"],"alasan":"lain"}')$q$, 'PT400',
  'gabung: alasan tak sah', 'Alasan', 'INPUT_001');
select uji.simpan('m06', public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg06","dari_ids":["plujipg07"],"nama":"PT Asiaparts Indotech (Tangerang)","alasan":"mirip"}'));
select uji.cek(uji.ambil('m06') -> 'pelanggan' @> '{"id":"plujipg06","nama":"PT Asiaparts Indotech (Tangerang)"}'
  and (uji.ambil('m06') #>> '{ringkas,jml_lead}')::int = 2 and (uji.ambil('m06') #>> '{ringkas,jml_batal}')::int = 1
  and uji.ambil('m06') -> 'gabung' -> 0 @> '{"dari_id":"plujipg07","dari_nama":"PT. Asiaparts Indotect","cara":"manual","alasan":"mirip","jml_lead":1}',
  'gabung manual: lead pindah, nama tujuan diganti, log manual');
-- rantai: Satu → Dua, lalu Dua → Tiga; batalkan Satu → Dua → lead Satu kembali dari Tiga
select uji.jalan($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg12","dari_ids":["plujipg11"]}')$q$, 'rantai: Satu → Dua');
select uji.jalan($q$select public.web_pipeline_pelanggan_gabung('{"ke_id":"plujipg13","dari_ids":["plujipg12"]}')$q$, 'rantai: Dua → Tiga');
reset role;
select uji.sama(public.pipeline_pelanggan_akhir('plujipg11'), 'plujipg13', 'rantai: id akhir Satu = Tiga');
select uji.sama((select kota from public.pelanggan where id = 'plujipg13'), 'Malang', 'rantai: kota Tiga diisi dari Dua (yang terisi dari tujuan semula)');
select uji.simpan('g11', (select jsonb_build_object('gabung_id', id) from public.pelanggan_gabung where dari_id = 'plujipg11'));
select uji.simpan('g12', (select jsonb_build_object('gabung_id', id) from public.pelanggan_gabung where dari_id = 'plujipg12'));
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(public.web_pipeline_pelanggan('plujipg11'), '{"digabung_ke":"plujipg13"}'::jsonb, 'rantai: tautan lama Satu → Tiga');
select uji.jalan(format('select public.web_pipeline_pelanggan_gabung_batal(%L)', uji.ambil('g11')), 'rantai: batalkan Satu → Dua');
reset role;
select uji.sama((select array_agg(l.id || '@' || l.pelanggan_id order by l.id) from public.lead l where l.id in ('ldujipg11','ldujipg12','ldujipg13')),
  array['ldujipg11@plujipg11','ldujipg12@plujipg13','ldujipg13@plujipg13'], 'rantai: lead Satu kembali dari Tiga, lead Dua tetap di Tiga');
select uji.sama((select pelanggan_id from public.kontak where id = 'ktujipg11'), 'plujipg11', 'rantai: kontak Satu kembali');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.jalan(format('select public.web_pipeline_pelanggan_gabung_batal(%L)', uji.ambil('g12')), 'rantai: batalkan Dua → Tiga');
reset role;
select uji.sama((select array_agg(l.id || '@' || l.pelanggan_id order by l.id) from public.lead l where l.id in ('ldujipg11','ldujipg12','ldujipg13')),
  array['ldujipg11@plujipg11','ldujipg12@plujipg12','ldujipg13@plujipg13'], 'rantai: kembali seperti semula');
select uji.sama((select kota from public.pelanggan where id = 'plujipg13'), null::text, 'rantai: kota Tiga dikembalikan');
select uji.sama(pg_temp.baris_lead(), uji.ambil('lead0'), 'akhir: tidak ada data lead yang berubah selain pelanggan_id');
select uji.sama((select count(*)::int from public.lead where id like 'ldujipg%'), 13, 'akhir: tidak ada lead yang hilang');

rollback;
