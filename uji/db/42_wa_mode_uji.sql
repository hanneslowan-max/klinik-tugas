-- 42 · Bot WA 0878 MODE UJI (20261111130000_wa_mode_uji.sql, keputusan Hannes 11 Nov 2026): saklar 'uji' hanya membalas
-- nomor di wa.uji, kapan saja (termasuk jam kerja); nomor lain batal saklar_uji; saklar kirim tidak berubah; pemutus aktif
-- di mode uji; x_wa_uji (owner/bot, nomor disamarkan); daftar kosong → saklar mati. Nomor tiruan 6281200000xxx.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.peringatan;
delete from wa.kata_manusia; delete from wa.uji;
update wa.pengaturan set saklar = 'mati', saklar_alasan = 'awal';
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000421', 900000000002, 'bot tulis (uji 42)', 'rtk_b421', uji.sha('rtk_uji42_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000422', 900000000002, 'bot baca (uji 42)', 'rtk_b422', uji.sha('rtk_uji42_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000423', 100000002, 'citra tulis (uji 42)', 'rtk_b423', uji.sha('rtk_uji42_citra'), 'tulis');

create function pg_temp.svc(fn text, p jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service();
  execute format('select public.%I($1)', fn) using p into v;
  execute 'reset role';
  return v;
end $$;
create function pg_temp.adm(fn text, p jsonb, p_aktor bigint, p_tok uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  execute format('select public.%I($1, $2)', fn) using p_aktor, p into v;
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
-- satu pesan webhook; t = waktu WIB 'YYYY-MM-DD HH24:MI'
create function pg_temp.msk(p_id text, p_nomor text, t text, p_tambah jsonb default '{}', p_kunci text default null,
                            p_arah text default 'masuk', p_asal text default 'cloud_api', p_jenis text default 'text')
returns jsonb language sql as $$
  select pg_temp.svc('x_wa_webhook', jsonb_build_object(
    'kunci_idem', p_kunci, 'sekarang', (t || '+07')::timestamptz,
    'items', jsonb_build_array(jsonb_build_object('id_pesan', p_id, 'arah', p_arah, 'asal', p_asal, 'nomor', p_nomor,
      'percakapan', 'conv-' || p_nomor, 'waktu', (t || '+07')::timestamptz, 'jenis', p_jenis) || p_tambah)))
$$;
create function pg_temp.ambil(t text) returns jsonb language sql as $$
  select pg_temp.svc('x_wa_ambil', jsonb_build_object('sekarang', (t || '+07')::timestamptz))
$$;
create function pg_temp.hasil(p_aid bigint, p_kep text, t text, p_tambah jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.svc('x_wa_hasil', jsonb_build_object('antrean_id', p_aid, 'keputusan', p_kep,
                                                      'sekarang', (t || '+07')::timestamptz) || p_tambah)
$$;
create function pg_temp.aid(p_nomor text) returns bigint language sql as $$
  select max(id) from wa.antrean where nomor = p_nomor
$$;
create function pg_temp.st(p_nomor text) returns text language sql as $$
  select status || coalesce(':' || alasan, '') from wa.antrean where id = pg_temp.aid(p_nomor)
$$;
create function pg_temp.wib(t timestamptz) returns text language sql as $$ select to_char(t at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') $$;
create function pg_temp.bersih() returns void language sql as $$
  delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.peringatan;
$$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.uji_api(p jsonb) returns jsonb language sql as $$
  select pg_temp.adm('x_wa_uji', p, 900000000002, 'b0b0b0b0-0000-4000-8000-000000000421')
$$;
create function pg_temp.saklar(s text) returns jsonb language sql as $$
  select pg_temp.adm('x_wa_saklar', jsonb_build_object('status', s), 900000000002, 'b0b0b0b0-0000-4000-8000-000000000421')
$$;
grant execute on all functions in schema pg_temp to public;

-- hak
select uji.cek(has_function_privilege('service_role', 'public.x_wa_uji(bigint,jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_wa_uji(bigint,jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_wa_uji(bigint,jsonb)', 'EXECUTE'), 'x_wa_uji hanya service_role');
select uji.cek(not has_table_privilege('service_role', 'wa.uji', 'SELECT'), 'wa.uji tanpa hak tabel');
select uji.galat($$select pg_temp.adm('x_wa_uji', '{}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000423')$$, 'PT403', 'member → 403');
select uji.galat($$select pg_temp.adm('x_wa_uji', '{}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000422')$$, 'PT403', 'token baca → 403');

-- saklar uji butuh daftar
select uji.galat($$select pg_temp.saklar('uji')$$, 'PT400', 'saklar uji tanpa nomor uji → 400');
create temp table d1 as select pg_temp.uji_api('{"nomor":"0812-0000-0501","catatan":"HP Hannes (tiruan)"}') j;
select uji.cek((select j->'nomor'->0->>'nomor' = '...0501' and j::text !~ '6281200000501' from d1), 'daftar uji: nomor disamarkan 4 digit');
select uji.galat($$select pg_temp.uji_api('{"nomor":"12"}')$$, 'PT400', 'nomor tidak sah → 400');
select uji.sama(pg_temp.saklar('uji')->>'saklar', 'uji', 'saklar uji → uji');

-- Rabu 11 Nov 13.00 (jam kerja): nomor uji diantrekan & diambil; nomor lain catat jam_kerja
select pg_temp.msk('wamid.uji42.a1', '6281200000501', '2026-11-11 13:00');
select pg_temp.msk('wamid.uji42.b1', '6281200000502', '2026-11-11 13:00');
select uji.sama(pg_temp.st('6281200000501'), 'tunggu', 'jam kerja + mode uji: nomor uji diantrekan');
select uji.cek(pg_temp.aid('6281200000502') is null, 'jam kerja + mode uji: nomor lain tidak diantrekan');
create temp table a1 as select pg_temp.ambil('2026-11-11 13:10') j;
select uji.cek((select jsonb_array_length(j->'items') = 1 and j->'items'->0->>'nomor' = '6281200000501'
                       and j->'items'->0->>'hari' = 'besok pagi' from a1), 'nomor uji diambil di jam kerja, [HARI] besok pagi');
select pg_temp.hasil(pg_temp.aid('6281200000501'), 'kirim', '2026-11-11 13:10', '{"id_pesan":"wamid.bot.uji42","teks_bot":"Halo\n(pesan otomatis)"}');
select uji.sama(pg_temp.st('6281200000501'), 'selesai:kirim', 'hasil kirim → selesai');

-- luar jam + mode uji: nomor lain diantrekan tapi batal saklar_uji
select pg_temp.msk('wamid.uji42.b2', '6281200000502', '2026-11-11 19:00');
select pg_temp.ambil('2026-11-11 19:10');
select uji.sama(pg_temp.st('6281200000502'), 'batal:saklar_uji', 'luar jam + mode uji: pelanggan biasa → batal saklar_uji');

-- pemutus aktif di mode uji
select pg_temp.msk('wamid.uji42.a' || i, '6281200000501', '2026-11-11 20:0' || i) from generate_series(2, 4) i;
select pg_temp.ambil('2026-11-11 20:20');
select pg_temp.hasil(pg_temp.aid('6281200000501'), 'tolak', '2026-11-11 20:20', '{"alasan":"validator: harga","teks_bot":"Rp 1"}');
insert into wa.log (waktu, arah, keputusan, alasan) values ('2026-11-11 20:21+07', 'sistem', 'tolak', 'uji'), ('2026-11-11 20:22+07', 'sistem', 'tolak', 'uji');
select pg_temp.msk('wamid.uji42.a9', '6281200000501', '2026-11-11 20:30');
select pg_temp.ambil('2026-11-11 20:40');
select pg_temp.hasil(pg_temp.aid('6281200000501'), 'tolak', '2026-11-11 20:40', '{"alasan":"validator: harga","teks_bot":"Rp 2"}');
select uji.sama((select saklar || ':' || saklar_alasan from wa.pengaturan), 'mati:pemutus', 'mode uji: tolak ≥ 3 hari ini → pemutus mematikan');

-- saklar kirim: nomor uji diperlakukan biasa (jam kerja tidak diantrekan)
select pg_temp.saklar('kirim');
select pg_temp.bersih();
select pg_temp.msk('wamid.uji42.c1', '6281200000501', '2026-11-12 10:00');
select uji.cek(pg_temp.aid('6281200000501') is null, 'saklar kirim + jam kerja: nomor uji tidak diantrekan (seperti pelanggan)');

-- hapus nomor terakhir saat saklar uji → saklar mati
select pg_temp.saklar('uji');
select uji.sama(jsonb_array_length(pg_temp.uji_api('{"nomor":"6281200000501","hapus":true}')->'nomor'), 0, 'hapus nomor uji');
select uji.sama((select saklar from wa.pengaturan), 'mati', 'daftar uji kosong → saklar mati');
select uji.galat($$select pg_temp.saklar('lain')$$, 'PT400', 'status saklar lain → 400');

rollback;
