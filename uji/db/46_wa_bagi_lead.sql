-- 46 · Lead Anvil langsung saat chat dibagi (20261111190000_wa_bagi_lead.sql, keputusan Hannes 11 Nov 2026): setelan lead +
-- lead_aktor, nilai_ambil (baru ditugaskan / tunggu jatuh tempo), x_wa_bagi_lead buat (lead nyata lewat
-- inti_pipeline_lead_otomatis, pemilik = sales ditunjuk) / terbuka / bukan / tunggu (+ nilai ulang dari webhook) / gagal,
-- daftar & setelan memuat status lead, picu_bagi. Nomor tiruan 6281200000xxx.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.uji; delete from wa.penugasan;
update wa.bagi_setel set aktif = true, luar_jam = true, sales = '{100000002,100000003}', jeda_detik = 60, hari_baru = 7,
                         lead_aktif = false, lead_aktor = null, lead_sejak = null;
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.pipeline_akses (member_id, peran, kode_sp, ditambah_oleh) values (100000002, 'rep', 'CTR', 100000001), (100000003, 'rep', 'DDP', 100000001)
  on conflict (member_id) do update set peran = excluded.peran;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000461', 900000000002, 'bot tulis (uji 46)', 'rtk_b461', uji.sha('rtk_uji46_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000462', 900000000002, 'bot baca (uji 46)', 'rtk_b462', uji.sha('rtk_uji46_baca'), 'baca');

create function pg_temp.svc(fn text, p jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service();
  execute format('select public.%I($1)', fn) using p into v;
  execute 'reset role';
  return v;
end $$;
create function pg_temp.setel(p jsonb, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000461') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  select public.x_wa_bagi_setel(900000000002, p) into v;
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
create function pg_temp.msk(p_id text, p_nomor text, t timestamptz) returns jsonb language plpgsql as $$
declare v_items jsonb := jsonb_build_array(jsonb_build_object('id_pesan', p_id, 'arah', 'masuk', 'asal', 'cloud_api', 'nomor', p_nomor,
      'percakapan', 'conv-' || p_nomor, 'waktu', t, 'jenis', 'text'));
begin
  perform pg_temp.svc('x_wa_webhook', jsonb_build_object('sekarang', t, 'items', v_items));
  return pg_temp.svc('x_wa_bagi_calon', jsonb_build_object('sekarang', t, 'items', v_items));
end $$;
-- chat masuk sekarang + langsung ditugaskan (giliran)
create function pg_temp.baru(p_nomor text, p_menit int default 2) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  perform pg_temp.msk('wamid.b46.' || p_nomor || '.' || p_menit, p_nomor, now() - make_interval(mins => p_menit));
  select max(id) into v_id from wa.penugasan where nomor = p_nomor;
  perform pg_temp.svc('x_wa_bagi_hasil', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', v_id, 'keputusan', 'tugaskan'))));
  return v_id;
end $$;
create function pg_temp.lead(p jsonb) returns jsonb language sql as $$ select pg_temp.svc('x_wa_bagi_lead', p) $$;
create function pg_temp.ls(p_id bigint) returns text language sql as $$
  select coalesce(lead_status, '-') || coalesce(':' || lead_jenis, '') from wa.penugasan where id = p_id
$$;
create function pg_temp.kunci(p_kode text) returns text language sql as $$
  select 'wa:K-' || p_kode || ':' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
$$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------- hak & setelan
select uji.cek(has_function_privilege('service_role', 'public.x_wa_bagi_lead(jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_wa_bagi_lead(jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_wa_bagi_nilai_ambil(jsonb)', 'EXECUTE'), 'fungsi lead hanya service_role');
select uji.galat($$select pg_temp.setel('{"lead":true}')$$, 'PT400', 'lead tanpa lead_aktor → 400');
select uji.galat($$select pg_temp.setel('{"lead_aktor":100000002}')$$, 'PT400', 'lead_aktor member biasa → 400');
select uji.galat($$select pg_temp.setel('{"lead":true,"lead_aktor":900000000002}', 'b0b0b0b0-0000-4000-8000-000000000462')$$, 'PT403', 'token baca → 403');
-- penugasan SEBELUM lead aktif tidak dinilai
select pg_temp.baru('6281200000900', 10);
update wa.penugasan set ditugaskan_pada = now() - interval '10 minutes' where nomor = '6281200000900';
create temp table s1 as select pg_temp.setel('{"lead":true,"lead_aktor":900000000002}') j;
select uji.cek((select (j->>'lead')::boolean and j->>'lead_aktor' = '900000000002' from s1), 'setel lead aktif + aktor');
select uji.cek((select lead_sejak is not null from wa.bagi_setel), 'lead_sejak tercatat');
select uji.sama(jsonb_array_length(pg_temp.svc('x_wa_bagi_nilai_ambil', '{}')->'items'), 0, 'penugasan sebelum lead aktif tidak dinilai');

-- ---------------------------------------------------------------- buat
create temp table p1 as select pg_temp.baru('6281200000901') id;
create temp table n1 as select pg_temp.svc('x_wa_bagi_nilai_ambil', '{}') j;
select uji.cek((select jsonb_array_length(j->'items') = 1 and j->'items'->0->>'nomor' = '6281200000901'
                       and j->'items'->0->>'pemilik' = '100000003' from n1), 'nilai_ambil: penugasan baru ditugaskan');
create temp table r1 as select pg_temp.lead(jsonb_build_object('id', (select id from p1), 'keputusan', 'buat', 'jenis', 'calon_pembeli',
  'alasan', 'tanya pallet mesh', 'lead', jsonb_build_object('kunci_luar', pg_temp.kunci('aa0901'), 'sumber', 'Google Ads',
    'pelanggan', 'PT Uji Lead', 'kontak_nama', 'Nama Tiruan',
    'produk', '[{"produk":"Pallet Mesh","qty":20,"satuan":"unit","spesifikasi":"1200x1000"}]'::jsonb,
    'kebutuhan', 'Pallet mesh untuk gudang', 'sumber_bukti', 'ga-oy', 'sumber_bukti_kode', 'GA-OY-7K3F',
    'chat_pada', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'hp', '6289999999999', 'pemilik', 100000002))) j;
select uji.cek((select j->>'status' = 'dibuat' and j->>'kode' ~ '^L-\d+$' from r1), 'buat → lead dibuat, kode L-');
select uji.cek((select l.pemilik = 100000003 and l.sumber = 'Google Ads' and l.tahap = 'BARU' and k.telepon = '6281200000901'
                  from public.lead l join public.kontak k on k.id = l.kontak_id where l.kode = (select j->>'kode' from r1)),
               'lead: pemilik = sales ditunjuk, hp = nomor penugasan (hp/pemilik dari Edge diabaikan), sumber');
select uji.cek((select exists (select 1 from public.pipeline_tautan_luar t where t.kunci_luar = pg_temp.kunci('aa0901') and t.jenis = 'wa')),
               'tautan kunci_luar dicatat (routine per jam tidak membuat ulang)');
select uji.sama(pg_temp.ls((select id from p1)), 'dibuat:calon_pembeli', 'status lead dibuat');
select uji.cek((select lead_kode = (select j->>'kode' from r1) from wa.penugasan where id = (select id from p1)), 'lead_kode tersimpan');
select uji.sama(pg_temp.lead(jsonb_build_object('id', (select id from p1), 'keputusan', 'bukan'))->>'status', 'dibuat', 'sudah dibuat → final, tidak diubah');
select uji.sama(jsonb_array_length(pg_temp.svc('x_wa_bagi_nilai_ambil', '{}')->'items'), 0, 'sesudah dibuat tidak dinilai lagi');

-- terbuka: nomor punya lead BARU → lead_terbuka_ada
insert into public.pelanggan (id, nama, kota) values ('plujild1', 'PT Uji Terbuka', 'Bekasi');
insert into public.kontak (id, pelanggan_id, telepon, telepon_tampil) values ('ktujild1', 'plujild1', '6281200000902', '0812-0000-0902');
create temp table p2 as select pg_temp.baru('6281200000902') id;
-- (calon dibuat sebelum lead ada; lead ditambahkan sesudahnya, seperti sales mencatat sendiri di menit yang sama)
insert into public.lead (id, pelanggan_id, kontak_id, sumber, pemilik, tahap) values ('ldujild1', 'plujild1', 'ktujild1', 'WA langsung', 100000003, 'BARU');
create temp table r2 as select pg_temp.lead(jsonb_build_object('id', (select id from p2), 'keputusan', 'buat',
  'lead', jsonb_build_object('kunci_luar', pg_temp.kunci('aa0902'), 'sumber', 'WA langsung'))) j;
select uji.cek((select j->>'status' = 'terbuka' and j->>'kode' = (select kode from public.lead where id = 'ldujild1') from r2), 'lead terbuka ada → terbuka + kode lead lama');

-- ---------------------------------------------------------------- tunggu + nilai ulang dari webhook
create temp table p3 as select pg_temp.baru('6281200000903') id;
select uji.sama(pg_temp.lead(jsonb_build_object('id', (select id from p3), 'keputusan', 'tunggu', 'jenis', 'lain', 'alasan', 'sapaan saja'))->>'status', 'tunggu', 'tunggu');
select uji.cek(not exists (select 1 from jsonb_array_elements(pg_temp.svc('x_wa_bagi_nilai_ambil', '{}')->'items') e where (e->>'id')::bigint = (select id from p3)),
               'tunggu tanpa pesan baru → tidak dinilai');
select pg_temp.msk('wamid.b46.903.b', '6281200000903', now() - interval '2 minutes');
select uji.cek((select lead_nilai_berikut is not null and lead_nilai_berikut <= now() from wa.penugasan where id = (select id from p3)),
               'pesan baru (webhook) → dijadwalkan nilai ulang 1 menit');
select uji.cek(exists (select 1 from jsonb_array_elements(pg_temp.svc('x_wa_bagi_nilai_ambil', '{}')->'items') e where (e->>'id')::bigint = (select id from p3)
                        and (e->>'percobaan')::int = 1), 'nilai ulang diambil (percobaan 1)');
select uji.sama(pg_temp.lead(jsonb_build_object('id', (select id from p3), 'keputusan', 'bukan', 'jenis', 'pemasok_jasa'))->>'status', 'bukan', 'bukan pembeli');
select uji.sama(pg_temp.ls((select id from p3)), 'bukan:pemasok_jasa', 'status bukan + jenis');
select pg_temp.msk('wamid.b46.903.c', '6281200000903', now() - interval '1 minute');
select uji.cek((select lead_nilai_berikut is null from wa.penugasan where id = (select id from p3)), 'bukan → pesan baru tidak menjadwalkan ulang');

-- ---------------------------------------------------------------- gagal
create temp table p4 as select pg_temp.baru('6281200000904') id;
select uji.sama(pg_temp.lead(jsonb_build_object('id', (select id from p4), 'keputusan', 'gagal', 'sementara', true, 'alasan', 'ai_http_529'))->>'status', 'tunggu', 'gagal sementara → tunggu, ulang 5 menit');
select uji.cek((select lead_nilai_berikut > now() + interval '4 minutes' from wa.penugasan where id = (select id from p4)), 'jadwal ulang 5 menit');
select pg_temp.lead(jsonb_build_object('id', (select id from p4), 'keputusan', 'gagal', 'sementara', true)) from generate_series(1, 3);
select uji.sama(pg_temp.ls((select id from p4)), 'gagal', 'gagal ≥ 4x → gagal final');
create temp table p5 as select pg_temp.baru('6281200000905') id;
select uji.sama(pg_temp.lead(jsonb_build_object('id', (select id from p5), 'keputusan', 'gagal', 'sementara', false, 'alasan', 'ai_menolak'))->>'status', 'gagal', 'gagal tetap → gagal');
-- isi lead tidak sah → galat ditangkap, status gagal
create temp table p6 as select pg_temp.baru('6281200000906') id;
create temp table r6 as select pg_temp.lead(jsonb_build_object('id', (select id from p6), 'keputusan', 'buat',
  'lead', jsonb_build_object('kunci_luar', 'salah', 'sumber', 'WA langsung'))) j;
select uji.cek((select j->>'status' = 'gagal' and j->>'galat' ~ 'kunci_luar' from r6), 'lead tidak sah → gagal + galat');
select uji.cek((select lead_alasan ~ '^lead: ' from wa.penugasan where id = (select id from p6)), 'galat dicatat di lead_alasan');
select uji.galat(format($$select pg_temp.lead('{"id":%s,"keputusan":"x"}')$$, (select id from p4)), 'PT400', 'keputusan tidak dikenal → 400');
select uji.sama(pg_temp.lead('{"id":999999,"keputusan":"buat"}')->>'status', 'tidak_ada', 'id tidak ada → tidak_ada');
select uji.galat($$select pg_temp.lead('{"keputusan":"buat"}')$$, 'PT400', 'tanpa id → 400');

-- ---------------------------------------------------------------- daftar, setelan, picu
create function pg_temp.daftar() returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token('b0b0b0b0-0000-4000-8000-000000000462');
  select public.x_wa_bagi_daftar(900000000002, '{"hari":3}') into v;
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
grant execute on function pg_temp.daftar() to public;
create temp table d2 as select pg_temp.daftar() j;
select uji.cek((select exists (select 1 from jsonb_array_elements(j->'items') e where e->>'nomor' = '6281200000901' and e->>'lead_status' = 'dibuat'
                                and e->>'lead_kode' ~ '^L-') from d2), 'daftar memuat lead_status & lead_kode');
create temp table s2 as select pg_temp.setel('{}') j;
select uji.cek((select (j->'hari_ini'->'lead'->>'dibuat')::int >= 1 and (j->'hari_ini'->'lead'->>'gagal')::int >= 2 from s2), 'setelan: hitungan lead hari ini');
create temp table p7 as select pg_temp.baru('6281200000907') id;
select uji.cek(exists (select 1 from wa.penugasan x, wa.bagi_setel s where s.lead_aktif and x.id = (select id from p7) and x.lead_status is null), 'penugasan baru belum dinilai');
select uji.cek(wa.picu_bagi() is null, 'picu tanpa Vault → null (kondisi lead dihitung tanpa galat)');
select uji.sama(pg_temp.setel('{"lead":false}')->>'lead', 'false', 'lead bisa dimatikan');
select uji.sama(jsonb_array_length(pg_temp.svc('x_wa_bagi_nilai_ambil', '{}')->'items'), 0, 'lead mati → tidak ada yang dinilai');

rollback;
