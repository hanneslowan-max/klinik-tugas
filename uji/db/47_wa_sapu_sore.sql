-- 47 · Sapu sore 17.10 (20261111200000_wa_sapu_sore.sql, keputusan Hannes 11 Nov 2026): antre sapu (jatuh tempo sekarang,
-- lewat nomor diam/antrean aktif/sudah disapu), inti_ambil: sapu tidak kena 'chat_berjalan' tapi tetap 'sales_membalas',
-- item memuat sapu, setelan & hak, picu_sapu (aktif + saklar kirim + hari kerja), cron. Nomor tiruan 6281200000xxx.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.uji; delete from wa.peringatan;
update wa.pengaturan set saklar = 'kirim', saklar_alasan = 'manual', maks_per_periode = 3, maks_per_24jam = 4;
update wa.sapu_setel set aktif = false, jam_mulai = '16:00', terakhir = null, terakhir_hasil = null;
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000471', 900000000002, 'bot tulis (uji 47)', 'rtk_b471', uji.sha('rtk_uji47_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000472', 900000000002, 'bot baca (uji 47)', 'rtk_b472', uji.sha('rtk_uji47_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000473', 100000002, 'citra (uji 47)', 'rtk_b473', uji.sha('rtk_uji47_citra'), 'tulis');

create function pg_temp.svc(fn text, p jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service();
  execute format('select public.%I($1)', fn) using p into v;
  execute 'reset role';
  return v;
end $$;
create function pg_temp.setel(p jsonb, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000471', p_aktor bigint default 900000000002)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  select public.x_wa_sapu_setel(p_aktor, p) into v;
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
-- pesan jam kerja (log), t = WIB
create function pg_temp.msk(p_id text, p_nomor text, t text, p_arah text default 'masuk', p_asal text default 'cloud_api') returns jsonb language sql as $$
  select pg_temp.svc('x_wa_webhook', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', jsonb_build_array(jsonb_build_object(
    'id_pesan', p_id, 'arah', p_arah, 'asal', p_asal, 'nomor', p_nomor, 'percakapan', 'conv-' || p_nomor, 'waktu', (t || '+07')::timestamptz, 'jenis', 'text'))))
$$;
create function pg_temp.antre(t text, p_items jsonb) returns jsonb language sql as $$
  select pg_temp.svc('x_wa_sapu_antre', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', p_items))
$$;
create function pg_temp.it(p_nomor text, a text, b text) returns jsonb language sql as $$
  select jsonb_build_object('nomor', p_nomor, 'percakapan', 'conv-' || p_nomor, 'pesan_pertama_pada', (a || '+07')::timestamptz,
                            'pesan_terakhir_pada', (b || '+07')::timestamptz, 'id_pesan_terakhir', 'wamid.x.' || p_nomor)
$$;
create function pg_temp.st(p_nomor text) returns text language sql as $$
  select status || coalesce(':' || alasan, '') from wa.antrean where id = (select max(id) from wa.antrean where nomor = p_nomor)
$$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------- hak & setelan
select uji.cek(has_function_privilege('service_role', 'public.x_wa_sapu_antre(jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_wa_sapu_antre(jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_wa_sapu_setel(bigint,jsonb)', 'EXECUTE'), 'fungsi sapu hanya service_role');
select uji.cek(not has_table_privilege('service_role', 'wa.sapu_setel', 'SELECT'), 'wa.sapu_setel tanpa hak tabel');
select uji.galat($$select pg_temp.setel('{}', 'b0b0b0b0-0000-4000-8000-000000000473', 100000002)$$, 'PT403', 'member → 403');
select uji.galat($$select pg_temp.setel('{"aktif":true}', 'b0b0b0b0-0000-4000-8000-000000000472')$$, 'PT403', 'token baca ubah → 403');
select uji.galat($$select pg_temp.setel('{"jalan":true}', 'b0b0b0b0-0000-4000-8000-000000000472')$$, 'PT403', 'token baca jalan → 403');
select uji.sama(pg_temp.setel('{}', 'b0b0b0b0-0000-4000-8000-000000000472')->>'jam_mulai', '16:00', 'lihat setelan (baca), bawaan 16:00');
select uji.galat($$select pg_temp.setel('{"jam_mulai":"17:30"}')$$, 'PT400', 'jam_mulai sesudah jam tutup → 400');
select uji.galat($$select pg_temp.setel('{"jam_mulai":"4pm"}')$$, 'PT400', 'jam_mulai tidak sah → 400');
create temp table s1 as select pg_temp.setel('{"aktif":true,"jam_mulai":"15:30"}') j;
select uji.cek((select (j->>'aktif')::boolean and j->>'jam_mulai' = '15:30' from s1), 'setel aktif + jam_mulai');
create temp table m1 as select pg_temp.svc('x_wa_sapu_mulai', jsonb_build_object('sekarang', '2026-11-12 17:10+07'::timestamptz)) j;
select uji.cek((select (j->>'aktif')::boolean and j->>'saklar' = 'kirim' and (j->>'sejak')::timestamptz = '2026-11-12 15:30+07'
                       and (j->>'sampai')::timestamptz = '2026-11-12 17:00+07' from m1), 'mulai: jendela 15:30–17:00 hari ini');

-- ---------------------------------------------------------------- antre
-- 701: chat baru jam kerja; 702: percakapan berjalan (sales membalas jam 15:00, pelanggan 16:20); 703: diam; 704: antrean aktif
select pg_temp.msk('wamid.s47.701a', '6281200000701', '2026-11-12 16:30');
select pg_temp.msk('wamid.s47.702a', '6281200000702', '2026-11-12 14:55');
select pg_temp.msk('wamid.s47.702s', '6281200000702', '2026-11-12 15:00', 'keluar', 'business_app');
select pg_temp.msk('wamid.s47.702b', '6281200000702', '2026-11-12 16:20');
insert into wa.diam (nomor, alasan) values ('6281200000703', 'pemasok');
select pg_temp.msk('wamid.s47.704a', '6281200000704', '2026-11-12 17:05');   -- luar jam → antrean biasa aktif
create temp table a1 as select pg_temp.antre('2026-11-12 17:10', jsonb_build_array(
  pg_temp.it('6281200000701', '2026-11-12 16:30', '2026-11-12 16:30'), pg_temp.it('6281200000702', '2026-11-12 16:20', '2026-11-12 16:20'),
  pg_temp.it('6281200000703', '2026-11-12 16:40', '2026-11-12 16:40'), pg_temp.it('6281200000704', '2026-11-12 16:45', '2026-11-12 16:45'),
  jsonb_build_object('nomor', '12', 'pesan_pertama_pada', 'x'))) j;
select uji.cek((select (j->>'antre')::int = 2 and j->'lewat'->>'daftar_diam' = '1' and j->'lewat'->>'antrean_aktif' = '1'
                       and j->'lewat'->>'tidak_sah' = '1' from a1), 'antre 2; lewat diam / antrean aktif / tidak sah');
select uji.cek((select sapu and status = 'tunggu' and jatuh_tempo = '2026-11-12 17:10+07' and periode = '2026-11-13'
                  from wa.antrean where nomor = '6281200000701'), 'baris sapu: tunggu, jatuh tempo sekarang, periode besok');
select uji.sama((pg_temp.antre('2026-11-12 17:20', jsonb_build_array(pg_temp.it('6281200000701', '2026-11-12 16:30', '2026-11-12 16:30')))->'lewat'->>'antrean_aktif'), '1',
                'antre ulang saat masih aktif → lewat');

-- ---------------------------------------------------------------- ambil: sapu tidak kena chat_berjalan
create temp table b1 as select pg_temp.svc('x_wa_ambil', jsonb_build_object('sekarang', '2026-11-12 17:11+07'::timestamptz)) j;
select uji.cek((select jsonb_array_length(j->'items') = 2 from b1)
               and (select bool_and((e->>'sapu')::boolean and e->>'hari' = 'besok pagi') from b1, jsonb_array_elements(j->'items') e), 'ambil: 2 item sapu (702 lolos walau sales membalas 15:00), [HARI] besok pagi');
-- pembanding: antrean biasa dengan sales membalas < 24 jam → chat_berjalan
insert into wa.antrean (nomor, periode, pesan_pertama_pada, pesan_terakhir_pada, tempo_dasar, jatuh_tempo)
values ('6281200000705', '2026-11-13', '2026-11-12 17:30+07', '2026-11-12 17:30+07', '2026-11-12 17:31+07', '2026-11-12 17:31+07');
select pg_temp.msk('wamid.s47.705s', '6281200000705', '2026-11-12 15:00', 'keluar', 'business_app');
select pg_temp.svc('x_wa_ambil', jsonb_build_object('sekarang', '2026-11-12 17:32+07'::timestamptz));
select uji.sama(pg_temp.st('6281200000705'), 'batal:chat_berjalan', 'antrean biasa tetap batal chat_berjalan');
-- sapu: sales membalas SESUDAH pesan pelanggan → sales_membalas
select pg_temp.msk('wamid.s47.706a', '6281200000706', '2026-11-12 16:50');
select pg_temp.antre('2026-11-12 17:10', jsonb_build_array(pg_temp.it('6281200000706', '2026-11-12 16:50', '2026-11-12 16:50')));
select pg_temp.msk('wamid.s47.706s', '6281200000706', '2026-11-12 17:12', 'keluar', 'business_app');
select pg_temp.svc('x_wa_ambil', jsonb_build_object('sekarang', '2026-11-12 17:13+07'::timestamptz));
select uji.sama(pg_temp.st('6281200000706'), 'batal:sales_membalas', 'sapu: sales membalas sesudah pesan → batal');
-- sudah disapu hari ini → tidak diantre ulang
update wa.antrean set status = 'selesai' where nomor = '6281200000701';
select uji.sama((pg_temp.antre('2026-11-12 17:40', jsonb_build_array(pg_temp.it('6281200000701', '2026-11-12 16:30', '2026-11-12 16:30')))->'lewat'->>'sudah_disapu'), '1',
                'sudah disapu hari ini → lewat');

-- ---------------------------------------------------------------- hasil, setelan, picu
select pg_temp.svc('x_wa_sapu_mulai', '{"hasil":{"ok":true,"belum_dibalas":3,"antre":2}}');
create temp table s2 as select pg_temp.setel('{}') j;
select uji.cek((select j->'terakhir_hasil'->>'antre' = '2' and j->>'terakhir' is not null and (j->'hari_ini'->>'antre')::int >= 3
                       and j::text !~ '62812000007' from s2), 'setelan: hasil terakhir + hitungan hari ini, tanpa nomor');
select uji.cek(wa.picu_sapu() is null, 'picu tanpa Vault → null');
update wa.pengaturan set saklar = 'mati';
select uji.cek(wa.picu_sapu() is null, 'picu: saklar mati → null');
select uji.cek(exists (select 1 from cron.job where jobname = 'wa-sapu' and schedule = '10 10 * * 1-5'), 'cron wa-sapu 17.10 WIB Sen–Jum');
select uji.sama(pg_temp.setel('{"aktif":false}')->>'aktif', 'false', 'sapu bisa dimatikan');

rollback;
