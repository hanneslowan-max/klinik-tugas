-- 37 · Klik iklan → ORDER (20261108120000_iklan_klik.sql): skema & hak (tanpa akses langsung, tanpa kolom data
-- pribadi), x_iklan_klik_catat (validasi kode/domain/panjang/waktu/halaman, idempoten kiriman ganda, tabrakan kode → 409,
-- retensi 90 hari oportunistik), x_iklan_unggah (pencocokan ORDER ↔ klik: batas 90 hari, SP sebelum klik, konversi
-- sebelum klik digeser, ditunda bila di masa depan, gbraid/wbraid dilewati, 1 baris per lead), ringkasan admin/baca
-- (web_ & x_) dan perawatan x_rawat_iklan_klik (owner/bot, scope impor).
-- Aktor: budi 100000001 (owner), citra 100000002 (rep), dodi 100000003 (baca), eka 900000000001 (tanpa akses),
-- bot 900000000002.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from public.iklan_klik;   -- DB lokal bisa berisi kiriman uji manual; semua dibatalkan di akhir berkas
insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG'), (100000003, 'baca', null)
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.pipeline_akses where member_id = 900000000001;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000371', 900000000002, 'bot baca (uji 37)', 'rtk_b371', uji.sha('rtk_uji37_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000372', 900000000002, 'bot impor (uji 37)', 'rtk_b372', uji.sha('rtk_uji37_impor'), 'impor'),
  ('b0b0b0b0-0000-4000-8000-000000000373', 100000002, 'citra baca (uji 37)', 'rtk_b373', uji.sha('rtk_uji37_citra'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000374', 100000002, 'citra impor (uji 37)', 'rtk_b374', uji.sha('rtk_uji37_citra_i'), 'impor');

create function pg_temp.catat(p jsonb) returns text language sql as $$ select format('select public.x_iklan_klik_catat(%L::jsonb)', p) $$;
grant execute on function pg_temp.catat(jsonb) to public;
create function pg_temp.klik(p_kode text, p_id text default 'Cj0KCQiAuji37abcdefgh_BwE') returns jsonb language sql as $$
  select jsonb_build_object('kode', p_kode, 'id_klik', p_id, 'jenis_id', 'gclid',
                            'domain', case when p_kode like 'GA-OY-%' then 'palletmeshindonesia.com' else 'rodahammerindo.com' end,
                            'halaman', '/Product/casters/')
$$;
grant execute on function pg_temp.klik(text, text) to public;

-- ------------------------------------------------------------ skema & hak
select uji.cek((select relrowsecurity from pg_class where oid = 'public.iklan_klik'::regclass), 'RLS aktif di iklan_klik');
select uji.cek(not has_table_privilege('authenticated', 'public.iklan_klik', 'SELECT')
               and not has_table_privilege('anon', 'public.iklan_klik', 'SELECT')
               and not has_table_privilege('service_role', 'public.iklan_klik', 'SELECT')
               and not has_table_privilege('service_role', 'public.iklan_klik', 'INSERT'),
  'iklan_klik tanpa akses langsung role API mana pun (hanya lewat fungsi)');
select uji.sama((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
                  where table_schema = 'public' and table_name = 'iklan_klik'),
  array['kode', 'id_klik', 'jenis_id', 'waktu_klik', 'domain', 'halaman', 'dibuat_pada'],
  'kolom iklan_klik: tanpa IP / user agent / cookie / nama / telepon');
select uji.cek(has_function_privilege('service_role', 'public.x_iklan_klik_catat(jsonb)', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_iklan_unggah()', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_iklan_ringkas(bigint)', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_rawat_iklan_klik(bigint, boolean)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_iklan_klik_catat(jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_iklan_unggah()', 'EXECUTE')
               and has_function_privilege('authenticated', 'public.web_iklan_ringkas()', 'EXECUTE')
               and not has_function_privilege('anon', 'public.web_iklan_ringkas()', 'EXECUTE')
               and not has_function_privilege('service_role', 'public.web_iklan_ringkas()', 'EXECUTE'),
  'x_iklan_* service_role, web_iklan_ringkas authenticated, anon tanpa hak');
select uji.cek(not exists (
  select 1 from unnest(array['public.inti_iklan_klik_catat(jsonb)', 'public.inti_iklan_unggah()', 'public.inti_iklan_ringkas()',
                             'public.inti_iklan_klik_bersih(boolean)']::regprocedure[]) f
   where has_function_privilege('service_role', f::oid, 'EXECUTE') or has_function_privilege('authenticated', f::oid, 'EXECUTE')
      or has_function_privilege('anon', f::oid, 'EXECUTE')),
  'inti_iklan_* internal (tanpa EXECUTE role API)');

-- ------------------------------------------------------------ catat klik: jalur sah (Edge = service_role)
select uji.jadi_service();
select uji.simpan('c1', public.x_iklan_klik_catat('{"kode":" ga-rh-7k3f ","id_klik":"Cj0KCQiAuji37abcdefgh_BwE","jenis_id":"GCLID",
  "waktu_klik":"2026-01-01T00:00:00Z","domain":"www.RodaHammerindo.com","halaman":"/Product/casters/?gclid=Cj0KCQ&utm_source=x#atas"}'::jsonb
  || jsonb_build_object('waktu_klik', to_char(now() - interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:SSOF'))));
reset role;
select uji.sama(uji.ambil('c1'), '{"baru":true}'::jsonb, 'klik baru → {"baru":true}');
select uji.sama((select jsonb_build_object('kode', kode, 'id', id_klik, 'jenis', jenis_id, 'domain', domain, 'halaman', halaman)
                   from public.iklan_klik where kode = 'GA-RH-7K3F'),
  '{"kode":"GA-RH-7K3F","id":"Cj0KCQiAuji37abcdefgh_BwE","jenis":"gclid","domain":"rodahammerindo.com","halaman":"/Product/casters/"}'::jsonb,
  'dinormalkan: kode huruf besar, id_klik apa adanya, jenis huruf kecil, www dibuang, query string & fragmen dibuang');
select uji.cek((select abs(extract(epoch from waktu_klik - (now() - interval '10 minutes'))) < 1 from public.iklan_klik where kode = 'GA-RH-7K3F'),
  'waktu_klik dari kiriman (ISO dengan zona)');

select uji.jadi_service();
select uji.simpan('c2', public.x_iklan_klik_catat(pg_temp.klik('GA-RH-7K3F')));
select uji.simpan('c3', public.x_iklan_klik_catat(pg_temp.klik('GA-OY-AB12') - 'halaman'));
reset role;
select uji.sama(uji.ambil('c2'), '{"baru":false}'::jsonb, 'kiriman ganda (kode + id_klik sama) → idempoten, {"baru":false}');
select uji.sama((select count(*)::int from public.iklan_klik), 2, 'kiriman ganda tidak menambah baris');
select uji.sama((select halaman || ' ' || domain from public.iklan_klik where kode = 'GA-OY-AB12'), '/ palletmeshindonesia.com',
  'halaman kosong → "/" ; GA-OY ↔ palletmeshindonesia.com');
select uji.cek((select abs(extract(epoch from waktu_klik - now())) < 1 from public.iklan_klik where kode = 'GA-OY-AB12'),
  'waktu_klik kosong → now()');

select uji.jadi_service();
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-7K3F', 'EAIaIQobChMIlainorang12')), 'PT409', 'kode sama, id_klik beda (tabrakan) → 409',
  'buat kode baru', 'KONFLIK_001');
reset role;
select uji.sama((select id_klik from public.iklan_klik where kode = 'GA-RH-7K3F'), 'Cj0KCQiAuji37abcdefgh_BwE',
  'tabrakan tidak mengubah baris pertama');

-- validasi (semua PT400, tidak ada yang tertulis)
select uji.jadi_service();
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-7K3')), 'PT400', 'kode 3 karakter → 400', 'GA-RH-XXXX', 'INPUT_001');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-7K3FX')), 'PT400', 'kode 5 karakter → 400', 'GA-RH-XXXX');
select uji.galat(pg_temp.catat(pg_temp.klik('WEB-RH')), 'PT400', 'kode organik WEB-RH → 400', 'GA-RH-XXXX');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-XX-7K3F')), 'PT400', 'awalan domain tak dikenal → 400', 'GA-RH-XXXX');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-7K-F')), 'PT400', 'karakter bukan huruf/angka → 400', 'GA-RH-XXXX');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAA') || '{"domain":"contoh.com"}'), 'PT400', 'domain asing → 400', 'domain harus');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAA') || '{"domain":"rodahammerindo.com.evil.id"}'), 'PT400', 'domain menyerupai → 400', 'domain harus');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAA') || '{"domain":"palletmeshindonesia.com"}'), 'PT400',
  'GA-RH dikirim dari palletmesh → 400', 'tidak cocok dengan domain');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAA', repeat('a', 201))), 'PT400', 'id_klik 201 karakter → 400', 'id_klik');
select uji.jalan(pg_temp.catat(pg_temp.klik('GA-RH-AAAA', repeat('a', 200))), 'id_klik 200 karakter → diterima');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB', 'test')), 'PT400', 'id_klik terlalu pendek ("test") → 400', 'id_klik');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB', 'Cj0KCQ<script>abc')), 'PT400', 'id_klik berkarakter aneh → 400', 'id_klik');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"jenis_id":"fbclid"}'), 'PT400', 'jenis_id asing → 400', 'jenis_id');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"waktu_klik":"2026-11-08 10:00:00"}'), 'PT400', 'waktu tanpa zona → 400', 'dengan zona');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || jsonb_build_object('waktu_klik', to_char(now() + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SSOF'))),
  'PT400', 'waktu di masa depan → 400', 'di luar rentang');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || jsonb_build_object('waktu_klik', to_char(now() - interval '4 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'))),
  'PT400', 'waktu > 3 hari lalu → 400', 'di luar rentang');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"halaman":"https://rodahammerindo.com/x"}'), 'PT400', 'halaman URL penuh → 400', 'halaman');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"halaman":"/a b"}'), 'PT400', 'halaman berspasi → 400', 'halaman');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"ip":"1.2.3.4"}'), 'PT400', 'kunci tak dikenal (ip) → 400', 'Kunci tidak dikenal: ip');
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-AAAB') || '{"id_klik":12345678901}'), 'PT400', 'id_klik angka (bukan teks) → 400', 'harus teks');
select uji.galat(pg_temp.catat('[]'::jsonb), 'PT400', 'body array → 400', 'Body harus objek');
select uji.jalan(pg_temp.catat(pg_temp.klik('GA-RH-AAAC') || jsonb_build_object('halaman', '/' || repeat('x', 400))), 'halaman 401 karakter → dipotong, diterima');
reset role;
select uji.sama((select char_length(halaman) from public.iklan_klik where kode = 'GA-RH-AAAC'), 300, 'halaman dipotong 300 karakter');
select uji.sama((select count(*)::int from public.iklan_klik where kode = 'GA-RH-AAAB'), 0, 'kiriman tidak sah tidak menulis apa pun');
select uji.galat($$insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain) values ('GA-OY-ZZZZ', 'Cj0KCQiAabcdef', 'gclid', now(), 'rodahammerindo.com')$$,
  '23514', 'CHECK tabel: kode GA-OY dengan domain rodahammerindo.com ditolak');

-- rem global: > 1000 baris baru dalam 1 jam → 429 untuk kode baru; kirim ulang kode yang sudah ada tetap idempoten
insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain)
select 'GA-RH-' || lpad(upper(to_hex(i)), 4, '0'), 'Cj0KCQiArem' || lpad(i::text, 6, '0'), 'gclid', now(), 'rodahammerindo.com'
  from generate_series(4096, 4096 + 1000) i;
select uji.jadi_service();
select uji.galat(pg_temp.catat(pg_temp.klik('GA-RH-ZZZZ')), 'PT429', 'rem global: > 1000 klik baru per jam → 429', 'Terlalu banyak', 'APP_002');
select uji.sama(public.x_iklan_klik_catat(pg_temp.klik('GA-RH-7K3F')), '{"baru":false}'::jsonb, 'rem global: kiriman ulang kode lama tetap 204/idempoten');
reset role;
delete from public.iklan_klik where id_klik like 'Cj0KCQiArem%';

-- retensi oportunistik: baris > 90 hari ikut terhapus saat ada kiriman baru
insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain) values
  ('GA-RH-OLD1', 'Cj0KCQiAlama000001', 'gclid', now() - interval '91 days', 'rodahammerindo.com');
select uji.jadi_service();
select uji.jalan(pg_temp.catat(pg_temp.klik('GA-OY-NEW1')), 'kiriman baru');
reset role;
select uji.sama((select count(*)::int from public.iklan_klik where kode = 'GA-RH-OLD1'), 0, 'klik > 90 hari terhapus oleh kiriman berikutnya');

-- ------------------------------------------------------------ pencocokan ORDER ↔ klik
delete from public.iklan_klik;
insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain, halaman) values
  ('GA-RH-K001', 'gclid_rh_k001_xxxxxx', 'gclid',  now() - interval '10 days', 'rodahammerindo.com', '/'),
  ('GA-OY-K002', 'gclid_oy_k002_xxxxxx', 'gclid',  now() - interval '100 days', 'palletmeshindonesia.com', '/'),
  ('GA-OY-K003', 'gclid_oy_k003_xxxxxx', 'gclid',  now() - interval '100 days', 'palletmeshindonesia.com', '/'),
  ('GA-RH-K004', 'gclid_rh_k004_xxxxxx', 'gclid',  now() - interval '5 days', 'rodahammerindo.com', '/'),
  ('GA-RH-K005', 'gbraid_rh_k005_xxxxx', 'gbraid', now() - interval '6 days', 'rodahammerindo.com', '/'),
  ('GA-OY-K006', 'wbraid_oy_k006_xxxxx', 'wbraid', now() - interval '6 days', 'palletmeshindonesia.com', '/'),
  ('GA-RH-K007', 'gclid_rh_k007_xxxxxx', 'gclid',  now() - interval '4 days', 'rodahammerindo.com', '/'),
  ('GA-RH-K008', 'gclid_rh_k008_xxxxxx', 'gclid',  ((public.hari_ini_wib() - 3) + time '15:00') at time zone 'Asia/Jakarta', 'rodahammerindo.com', '/'),
  ('GA-RH-K009', 'gclid_rh_k009_xxxxxx', 'gclid',  now() - interval '2 days', 'rodahammerindo.com', '/'),
  ('GA-OY-K010', 'gclid_oy_k010_xxxxxx', 'gclid',  now() - interval '20 days', 'palletmeshindonesia.com', '/'),
  ('GA-RH-K011', 'gclid_rh_k011_xxxxxx', 'gclid',  now() - interval '3 days', 'rodahammerindo.com', '/');

select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujiikl1', 'PT Uji Klik Iklan', 'Surabaya');
select set_config('app.sumber_bukti_tulis', 'ya', true);
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi, tanggal_masuk,
                         sumber_bukti, sumber_bukti_kode, sumber_bukti_diisi_pada) values
  -- 1 cocok biasa: klik 10 hari lalu, SP 5 hari lalu
  ('ldujiikl1', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9701/RSG/XI/2026', public.hari_ini_wib() - 5, 2972370, public.hari_ini_wib() - 9, 'ga-rh', 'GA-RH-K001', now()),
  -- 2 SP 95 hari sesudah klik → lewat batas 90 hari
  ('ldujiikl2', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9702/RSG/XI/2026', public.hari_ini_wib() - 5, 5000000, public.hari_ini_wib() - 99, 'ga-oy', 'GA-OY-K002', now()),
  -- 3 SP 80 hari sesudah klik (klik 100 hari lalu, belum dibersihkan) → masih masuk
  ('ldujiikl3', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9703/RSG/XI/2026', public.hari_ini_wib() - 20, 7500000, public.hari_ini_wib() - 99, 'ga-oy', 'GA-OY-K003', now()),
  -- 4 SP sebelum tanggal klik → bukan hasil klik itu
  ('ldujiikl4', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9704/RSG/XI/2026', public.hari_ini_wib() - 7, 1000000, public.hari_ini_wib() - 7, 'ga-rh', 'GA-RH-K004', now()),
  -- 5/6 gbraid & wbraid → dilewati, dihitung
  ('ldujiikl5', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9705/RSG/XI/2026', public.hari_ini_wib() - 1, 1100000, public.hari_ini_wib() - 6, 'ga-rh', 'GA-RH-K005', now()),
  ('ldujiikl6', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9706/RSG/XI/2026', public.hari_ini_wib() - 1, 1200000, public.hari_ini_wib() - 6, 'ga-oy', 'GA-OY-K006', now()),
  -- 7 belum ORDER (PENAWARAN) → tidak masuk CSV
  ('ldujiikl7', 'plujiikl1', 'Google Ads', 100000002, 'PENAWARAN', null, null, null, public.hari_ini_wib() - 4, 'ga-rh', 'GA-RH-K007', now()),
  -- 8 SP di hari klik, klik 15:00 WIB → waktu konversi = klik + 1 menit
  ('ldujiikl8', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9708/RSG/XI/2026', public.hari_ini_wib() - 3, 3300000, public.hari_ini_wib() - 3, 'ga-rh', 'GA-RH-K008', now()),
  -- 9 SP besok → ditunda (konversi di masa depan)
  ('ldujiikl9', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9709/RSG/XI/2026', public.hari_ini_wib() + 1, 900000, public.hari_ini_wib() - 2, 'ga-rh', 'GA-RH-K009', now()),
  -- 10 ORDER tanpa nilai transaksi → tidak masuk
  ('ldujiikla', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9710/RSG/XI/2026', public.hari_ini_wib() - 2, null, public.hari_ini_wib() - 19, 'ga-oy', 'GA-OY-K010', now()),
  -- 11 kode lama tanpa akhiran unik → tidak pernah cocok
  ('ldujiiklb', 'plujiikl1', 'Google Ads', 100000002, 'ORDER', '9711/RSG/XI/2026', public.hari_ini_wib() - 2, 800000, public.hari_ini_wib() - 2, 'ga-rh', 'GA-RH', now()),
  -- 12 kode unik yang TIDAK ada di iklan_klik (situs gagal mencatat) → lead_kode_tanpa_klik
  ('ldujiiklc', 'plujiikl1', 'Google Ads', 100000002, 'BARU', null, null, null, public.hari_ini_wib() - 1, 'ga-oy', 'GA-OY-ZZ99', now());
select set_config('app.sumber_bukti_tulis', '', true);
select uji.konteks(null, null);

select uji.jadi_service();
select uji.simpan('u1', public.x_iklan_unggah());
reset role;
select uji.sama((select jsonb_agg(b->>'lead_id' order by b->>'lead_id') from jsonb_array_elements(uji.ambil('u1')->'baris') b),
  '["ldujiikl1","ldujiikl3","ldujiikl8"]'::jsonb,
  'CSV: hanya ORDER gclid dalam 90 hari, SP ≥ tanggal klik, nilai terisi, waktu ≤ sekarang');
select uji.sama((select b - 'lead_id' from jsonb_array_elements(uji.ambil('u1')->'baris') b where b->>'lead_id' = 'ldujiikl1'),
  jsonb_build_object('kode', 'GA-RH-K001', 'id_klik', 'gclid_rh_k001_xxxxxx', 'nama', 'Order SP RH',
                     'waktu', to_char(public.hari_ini_wib() - 5, 'YYYY-MM-DD') || ' 12:00:00', 'nilai', 2972370),
  'baris RH: Order SP RH, tanggal SP 12:00:00 WIB, nilai = nilai_transaksi');
select uji.sama((select b->>'nama' from jsonb_array_elements(uji.ambil('u1')->'baris') b where b->>'lead_id' = 'ldujiikl3'), 'Order SP OY',
  'baris OY: Order SP OY (nama dari kode)');
select uji.sama((select b->>'waktu' from jsonb_array_elements(uji.ambil('u1')->'baris') b where b->>'lead_id' = 'ldujiikl8'),
  to_char(public.hari_ini_wib() - 3, 'YYYY-MM-DD') || ' 15:01:00', 'SP di hari klik sesudah 12:00 → waktu klik + 1 menit');
select uji.sama((uji.ambil('u1')->>'dilewati_braid')::int, 2, 'gbraid + wbraid dilewati dan dihitung');
select uji.sama((uji.ambil('u1')->>'ditunda')::int, 1, 'SP besok → ditunda (tidak dikirim sebelum waktunya)');
select uji.cek((select bool_and(b->>'waktu' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$') from jsonb_array_elements(uji.ambil('u1')->'baris') b),
  'format waktu yyyy-MM-dd HH:mm:ss');
select uji.sama((select jsonb_agg(b->>'lead_id') from jsonb_array_elements(uji.ambil('u1')->'baris') b),
  '["ldujiikl3","ldujiikl1","ldujiikl8"]'::jsonb, 'urut menurut waktu konversi');

-- lead diubah lagi (catatan / nilai) tetap satu baris
select uji.konteks('ui', 100000001);
update public.lead set catatan = 'diubah sesudah order', nilai_transaksi = 3000000 where id = 'ldujiikl1';
select uji.konteks(null, null);
select uji.jadi_service();
select uji.simpan('u2', public.x_iklan_unggah());
reset role;
select uji.sama((select count(*)::int from jsonb_array_elements(uji.ambil('u2')->'baris') b where b->>'lead_id' = 'ldujiikl1'), 1,
  'lead diubah lagi → tetap 1 baris (nilai terbaru)');
select uji.sama((select (b->>'nilai')::bigint from jsonb_array_elements(uji.ambil('u2')->'baris') b where b->>'lead_id' = 'ldujiikl1'),
  3000000::bigint, 'nilai mengikuti nilai_transaksi saat ini');

-- ORDER dibatalkan → hilang dari CSV
select uji.konteks('ui', 100000001);
update public.lead set tahap = 'BATAL', alasan_batal = 'Harga' where id = 'ldujiikl3';
select uji.konteks(null, null);
select uji.jadi_service();
select uji.simpan('u3', public.x_iklan_unggah());
reset role;
select uji.sama((select count(*)::int from jsonb_array_elements(uji.ambil('u3')->'baris') b where b->>'lead_id' = 'ldujiikl3'), 0,
  'order dibatalkan → tidak lagi di CSV');

-- ------------------------------------------------------------ ringkasan (admin/baca Pipeline)
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000371');
select uji.simpan('r1', public.x_iklan_ringkas(900000000002));
select uji.token('b0b0b0b0-0000-4000-8000-000000000373');
select uji.galat($$select public.x_iklan_ringkas(100000002)$$, 'PT403', 'rep (token sendiri) → 403', 'admin/baca');
select uji.token(null);
reset role;
select uji.sama(uji.ambil('r1')->'per_domain'->0->>'domain', 'rodahammerindo.com', 'per_domain[0] = RH');
-- RH 30 hari: K001, K004, K005, K007, K008, K009, K011 = 7 klik; K011 tanpa lead → di lead 6; ORDER: K001 (3jt), K004 (1jt),
-- K005 (1,1jt), K008 (3,3jt), K009 (0,9jt) = 5 order, nilai 9.300.000
select uji.sama(uji.ambil('r1')->'per_domain'->0->'h30',
  '{"klik":7,"braid":1,"kode_di_lead":6,"lead":6,"order":5,"nilai":9300000}'::jsonb, 'RH 30 hari: klik, braid, kode di lead, lead, order, nilai');
-- RH 7 hari: K004 (5h), K005 (6h), K007 (4h), K008 (3h WIB 15:00), K009 (2h), K011 (3h) = 6
select uji.sama(uji.ambil('r1')->'per_domain'->0->'h7',
  '{"klik":6,"braid":1,"kode_di_lead":5,"lead":5,"order":4,"nilai":6300000}'::jsonb, 'RH 7 hari');
-- OY 30 hari: K006 (wbraid, ORDER 1,2jt), K010 (ORDER tanpa nilai); K002/K003 (100 hari) di luar jendela
select uji.sama(uji.ambil('r1')->'per_domain'->1->'h30',
  '{"klik":2,"braid":1,"kode_di_lead":2,"lead":2,"order":2,"nilai":1200000}'::jsonb, 'OY 30 hari (klik > 30 hari tidak dihitung)');
select uji.sama((uji.ambil('r1')->>'lead_kode_tanpa_klik')::int, 1, 'lead ber-kode unik tanpa klik tercatat dihitung');
select uji.sama((uji.ambil('r1')->>'tersimpan')::int, 11, 'tersimpan = semua baris tabel');
select uji.sama(uji.ambil('r1')->'unggah', '{"baris":2,"dilewati_braid":2,"ditunda":1,"nilai":6300000}'::jsonb,
  'unggah: baris CSV saat ini, dilewati, ditunda, nilai');

select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.jalan($$select public.web_iklan_ringkas()$$, 'web: peran baca (dodi) boleh melihat');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_iklan_ringkas()$$, 'PT403', 'web: rep (citra) → 403');
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat($$select public.web_iklan_ringkas()$$, 'PT403', 'web: tanpa akses Pipeline (eka) → 403');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama((public.web_iklan_ringkas()->'per_domain'->0->'h30'->>'klik')::int, 7, 'web: owner melihat angka yang sama dengan x_');
reset role;

-- ------------------------------------------------------------ perawatan 90 hari (owner/bot, scope impor)
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000371');
select uji.galat($$select public.x_rawat_iklan_klik(900000000002)$$, 'PT403', 'token baca → 403 scope', 'Scope');
select uji.token('b0b0b0b0-0000-4000-8000-000000000374');
select uji.galat($$select public.x_rawat_iklan_klik(100000002)$$, 'PT403', 'anggota biasa (token impor sendiri) → 403', 'owner atau bot');
select uji.token('b0b0b0b0-0000-4000-8000-000000000372');
select uji.simpan('w1', public.x_rawat_iklan_klik(900000000002, true));
select uji.simpan('w2', public.x_rawat_iklan_klik(900000000002));
select uji.simpan('w3', public.x_rawat_iklan_klik(900000000002));
select uji.token(null);
reset role;
select uji.sama(uji.ambil('w1'), '{"hari":90,"dihapus":2,"dry":true}'::jsonb, 'dry: hitung 2 klik > 90 hari tanpa menghapus');
select uji.sama(uji.ambil('w2'), '{"hari":90,"dihapus":2,"dry":false}'::jsonb, 'hapus 2 klik > 90 hari');
select uji.sama(uji.ambil('w3'), '{"hari":90,"dihapus":0,"dry":false}'::jsonb, 'jalan ulang: tidak ada lagi yang dihapus');
select uji.sama((select count(*)::int from public.iklan_klik), 9, 'klik ≤ 90 hari tetap ada');

rollback;
