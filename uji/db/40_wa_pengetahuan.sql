-- 40 · Bot WA 0878: fakta & contoh balasan di tabel wa.pengetahuan (20261111100000_wa_pengetahuan.sql, keputusan Hannes
-- 11 Nov 2026). Isi awal 3 fakta terkunci, hak (tabel tertutup, x_* hanya service_role, owner/bot saja), simpan/ubah/
-- nonaktif, batas aktif (fakta ≤ 30, contoh ≤ 8, minimal 1 fakta), aktif() untuk Edge.
-- Aktor: budi 100000001 (owner), citra 100000002 (member), bot 900000000002.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000401', 900000000002, 'bot tulis (uji 40)', 'rtk_b401', uji.sha('rtk_uji40_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000402', 900000000002, 'bot baca (uji 40)', 'rtk_b402', uji.sha('rtk_uji40_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000403', 100000002, 'citra tulis (uji 40)', 'rtk_b403', uji.sha('rtk_uji40_citra'), 'tulis');

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
create function pg_temp.simpan(p jsonb) returns jsonb language sql as $$
  select pg_temp.adm('x_wa_pengetahuan_simpan', p, 900000000002, 'b0b0b0b0-0000-4000-8000-000000000401');
$$;

-- isi awal & hak
select uji.sama((select count(*)::int from wa.pengetahuan where jenis = 'fakta' and aktif), 3, 'isi awal: 3 fakta terkunci aktif');
select uji.sama((select count(*)::int from wa.pengetahuan where jenis = 'contoh'), 0, 'isi awal: contoh kosong');
select uji.cek((select teks from wa.pengetahuan where urutan = 20) = 'Lemari arsip TIDAK bisa custom.', 'fakta lemari arsip sama dengan prompt lama');
select uji.cek(not has_table_privilege('service_role', 'wa.pengetahuan', 'SELECT') and not has_table_privilege('anon', 'wa.pengetahuan', 'SELECT')
               and not has_table_privilege('authenticated', 'wa.pengetahuan', 'SELECT'), 'wa.pengetahuan tanpa hak tabel role API');
select uji.cek((select bool_and(has_function_privilege('service_role', f::oid, 'EXECUTE') and not has_function_privilege('anon', f::oid, 'EXECUTE')
                                and not has_function_privilege('authenticated', f::oid, 'EXECUTE'))
                  from unnest(array['public.x_wa_pengetahuan_aktif(jsonb)', 'public.x_wa_pengetahuan_daftar(bigint,jsonb)',
                                    'public.x_wa_pengetahuan_simpan(bigint,jsonb)']::regprocedure[]) f),
  '3 x_wa_pengetahuan_* hanya service_role');
select uji.cek(not exists (select 1 from pg_proc p where p.pronamespace = 'wa'::regnamespace
                 and (has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'fungsi wa.* tetap internal');

-- aktif() untuk Edge
create temp table ak as select pg_temp.svc('x_wa_pengetahuan_aktif', '{}') j;
select uji.cek((select jsonb_array_length(j->'fakta') = 3 and jsonb_array_length(j->'contoh') = 0
                       and j->'fakta'->>1 = 'Lemari arsip TIDAK bisa custom.' from ak), 'aktif(): 3 fakta urut, 0 contoh');

-- simpan (bot tulis)
create temp table c1 as select pg_temp.simpan('{"jenis":"contoh","situasi":"Pelanggan tanya troli","teks":"Baik Bapak/Ibu, troli untuk barang apa?\n(pesan otomatis)","urutan":5}') j;
select uji.cek((select (j->>'id')::bigint > 0 and j->>'jenis' = 'contoh' and (j->>'aktif')::boolean from c1), 'contoh baru tersimpan, aktif');
select uji.cek((select oleh = 900000000002 from wa.pengetahuan where id = (select (j->>'id')::bigint from c1)), 'oleh = aktor bot');
select uji.galat($$select pg_temp.simpan('{"jenis":"contoh","teks":"tanpa situasi"}')$$, '23514', 'contoh tanpa situasi → ditolak');
select uji.galat($$select pg_temp.simpan('{"jenis":"fakta","situasi":"x y z","teks":"fakta dengan situasi"}')$$, '23514', 'fakta dengan situasi → ditolak');
select uji.galat($$select pg_temp.simpan('{"jenis":"lain","teks":"abc"}')$$, 'PT400', 'jenis salah → 400');
select uji.galat($$select pg_temp.simpan('{"jenis":"fakta"}')$$, 'PT400', 'teks kosong → 400');
select uji.galat($$select pg_temp.simpan('{"id":999999,"aktif":false}')$$, 'PT404', 'id tidak ada → 404');

-- ubah & nonaktif
select pg_temp.simpan(jsonb_build_object('id', (select (j->>'id')::bigint from c1), 'teks', 'Baik Bapak/Ibu, troli untuk barang apa dan bebannya berapa kg?'));
select uji.sama((select teks from wa.pengetahuan where id = (select (j->>'id')::bigint from c1)),
  'Baik Bapak/Ibu, troli untuk barang apa dan bebannya berapa kg?', 'ubah teks contoh');
select pg_temp.simpan(jsonb_build_object('id', (select (j->>'id')::bigint from c1), 'aktif', false));
select uji.sama(jsonb_array_length(pg_temp.svc('x_wa_pengetahuan_aktif', '{}')->'contoh'), 0, 'contoh nonaktif tidak masuk aktif()');
select uji.sama(jsonb_array_length(pg_temp.adm('x_wa_pengetahuan_daftar', '{}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000402')), 4,
  'daftar (bot baca) memuat aktif + nonaktif');

-- batas aktif
select uji.galat($$select pg_temp.simpan(jsonb_build_object('id', id, 'aktif', false)) from wa.pengetahuan where jenis = 'fakta' order by id$$,
  'PT400', 'menonaktifkan semua fakta → 400 (minimal 1 fakta)');
select uji.sama((select count(*)::int from wa.pengetahuan where jenis = 'fakta' and aktif), 3, 'fakta tetap 3 sesudah penolakan (transaksi dibatalkan)');
select pg_temp.simpan(jsonb_build_object('jenis', 'contoh', 'situasi', 'Situasi ' || i, 'teks', 'Contoh balasan ' || i)) from generate_series(1, 8) i;
select uji.galat($$select pg_temp.simpan('{"jenis":"contoh","situasi":"Situasi 9","teks":"Contoh 9"}')$$, 'PT400', 'contoh aktif ke-9 → 400');
select pg_temp.simpan(jsonb_build_object('jenis', 'fakta', 'teks', 'Fakta uji ' || i)) from generate_series(1, 27) i;
select uji.galat($$select pg_temp.simpan('{"jenis":"fakta","teks":"Fakta ke-31"}')$$, 'PT400', 'fakta aktif ke-31 → 400');

-- hak aktor
select uji.galat($$select pg_temp.adm('x_wa_pengetahuan_simpan', '{"jenis":"fakta","teks":"abc"}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000403')$$,
  'PT403', 'member → 403');
select uji.galat($$select pg_temp.adm('x_wa_pengetahuan_simpan', '{"jenis":"fakta","teks":"abc"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000402')$$,
  'PT403', 'token baca tidak bisa simpan → 403');

rollback;
