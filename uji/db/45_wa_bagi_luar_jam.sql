-- 45 · Pembagian seketika untuk chat LUAR JAM (20261111180000_wa_bagi_luar_jam.sql, keputusan Hannes 11 Nov 2026):
-- setelan luar_jam (bawaan false), calon dari chat malam/akhir pekan bila true, tanda luar_jam di pengumuman.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.uji; delete from wa.penugasan;
update wa.bagi_setel set aktif = true, luar_jam = false, sales = '{100000002,100000003}', jeda_detik = 60, hari_baru = 7;
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000451', 900000000002, 'bot tulis (uji 45)', 'rtk_b451', uji.sha('rtk_uji45_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000452', 900000000002, 'bot baca (uji 45)', 'rtk_b452', uji.sha('rtk_uji45_baca'), 'baca');

create function pg_temp.svc(fn text, p jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service();
  execute format('select public.%I($1)', fn) using p into v;
  execute 'reset role';
  return v;
end $$;
create function pg_temp.setel(p jsonb, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000451') returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  select public.x_wa_bagi_setel(900000000002, p) into v;
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
create function pg_temp.msk(p_id text, p_nomor text, t text) returns jsonb language plpgsql as $$
declare v_items jsonb := jsonb_build_array(jsonb_build_object('id_pesan', p_id, 'arah', 'masuk', 'asal', 'cloud_api', 'nomor', p_nomor,
      'percakapan', 'conv-' || p_nomor, 'waktu', (t || '+07')::timestamptz, 'jenis', 'text'));
begin
  perform pg_temp.svc('x_wa_webhook', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', v_items));
  return pg_temp.svc('x_wa_bagi_calon', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', v_items));
end $$;
grant execute on all functions in schema pg_temp to public;

select uji.sama(pg_temp.setel('{}', 'b0b0b0b0-0000-4000-8000-000000000452')->>'luar_jam', 'false', 'bawaan luar_jam false');
select uji.sama(pg_temp.msk('wamid.b45.a1', '6281200000801', '2026-11-12 19:00')->'lewat'->>'luar_jam', '1', 'luar_jam false → chat malam dilewati');
select uji.galat($$select pg_temp.setel('{"luar_jam":true}', 'b0b0b0b0-0000-4000-8000-000000000452')$$, 'PT403', 'ubah luar_jam pakai token baca → 403');
select uji.sama(pg_temp.setel('{"luar_jam":true}')->>'luar_jam', 'true', 'setel luar_jam true');
select uji.cek((select luar_jam and aktif from wa.bagi_setel), 'tersimpan, aktif tetap');
select uji.sama((pg_temp.msk('wamid.b45.b1', '6281200000802', '2026-11-12 19:00')->>'calon')::int, 1, 'malam hari kerja → calon');
select uji.sama((pg_temp.msk('wamid.b45.b2', '6281200000803', '2026-11-14 10:00')->>'calon')::int, 1, 'Sabtu → calon');
select uji.sama((pg_temp.msk('wamid.b45.b3', '6281200000804', '2026-11-13 09:00')->>'calon')::int, 1, 'jam kerja tetap calon');
create temp table h1 as select pg_temp.svc('x_wa_bagi_hasil', jsonb_build_object('sekarang', '2026-11-14 10:02+07'::timestamptz, 'items',
  (select jsonb_agg(jsonb_build_object('id', id, 'keputusan', 'tugaskan') order by id) from wa.penugasan where status = 'calon'))) j;
select uji.cek((select jsonb_array_length(j->'umum') = 3 and (j->'umum'->0->>'luar_jam')::boolean and (j->'umum'->1->>'luar_jam')::boolean
                       and not (j->'umum'->2->>'luar_jam')::boolean from h1), 'hasil: tanda luar_jam per penugasan');
update wa.penugasan set diumumkan_pada = null, percobaan_umum = 1, ditugaskan_pada = now() where nomor = '6281200000802';
create temp table a1 as select pg_temp.svc('x_wa_bagi_ambil', jsonb_build_object('sekarang', now())) j;
select uji.cek((select j->'umum'->0->>'nomor' = '6281200000802' and (j->'umum'->0->>'luar_jam')::boolean from a1), 'ambil (ulang umum): tanda luar_jam');
select uji.sama(pg_temp.setel('{"luar_jam":false}')->>'luar_jam', 'false', 'luar_jam bisa dimatikan lagi');

rollback;
