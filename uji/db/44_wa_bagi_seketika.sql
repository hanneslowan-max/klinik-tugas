-- 44 · Pembagian SEKETIKA chat WA baru jam kerja (20261111170000_wa_bagi_seketika.sql, keputusan Hannes 11 Nov 2026):
-- calon dari webhook (jam kerja, nomor tanpa jejak 7 hari, tanpa lead), ambil (jeda), hasil (giliran seimbang /
-- sales yang membalas / batal / tunda), umum (tanda terkirim + ulang), daftar & setelan (owner/bot), picu_bagi.
-- Nomor tiruan 6281200000xxx. Sales giliran = citra (100000002) lalu dodi (100000003).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.peringatan;
delete from wa.uji; delete from wa.penugasan;
update wa.pengaturan set saklar = 'mati', saklar_alasan = 'awal';
update wa.bagi_setel set aktif = false, sales = '{}', jeda_detik = 60, hari_baru = 7;
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000441', 900000000002, 'bot tulis (uji 44)', 'rtk_b441', uji.sha('rtk_uji44_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000442', 900000000002, 'bot baca (uji 44)', 'rtk_b442', uji.sha('rtk_uji44_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000443', 100000002, 'citra tulis (uji 44)', 'rtk_b443', uji.sha('rtk_uji44_citra'), 'tulis');

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
-- satu pesan: webhook lalu calon (urutan sama dengan Edge); t = waktu WIB 'YYYY-MM-DD HH24:MI'
create function pg_temp.msk(p_id text, p_nomor text, t text, p_tambah jsonb default '{}', p_arah text default 'masuk',
                            p_asal text default 'cloud_api', p_jenis text default 'text')
returns jsonb language plpgsql as $$
declare v_items jsonb := jsonb_build_array(jsonb_build_object('id_pesan', p_id, 'arah', p_arah, 'asal', p_asal, 'nomor', p_nomor,
      'percakapan', 'conv-' || p_nomor, 'waktu', (t || '+07')::timestamptz, 'jenis', p_jenis) || p_tambah);
begin
  perform pg_temp.svc('x_wa_webhook', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', v_items));
  return pg_temp.svc('x_wa_bagi_calon', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', v_items));
end $$;
create function pg_temp.ambil(t text) returns jsonb language sql as $$
  select pg_temp.svc('x_wa_bagi_ambil', jsonb_build_object('sekarang', (t || '+07')::timestamptz))
$$;
create function pg_temp.hasil(t text, p_items jsonb) returns jsonb language sql as $$
  select pg_temp.svc('x_wa_bagi_hasil', jsonb_build_object('sekarang', (t || '+07')::timestamptz, 'items', p_items))
$$;
create function pg_temp.pid(p_nomor text) returns bigint language sql as $$
  select max(id) from wa.penugasan where nomor = p_nomor
$$;
create function pg_temp.st(p_nomor text) returns text language sql as $$
  select status || coalesce(':' || alasan, '') || coalesce(':' || pemilik, '') from wa.penugasan where id = pg_temp.pid(p_nomor)
$$;
create function pg_temp.tugas(t text, p_nomor text, p_tambah jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.hasil(t, jsonb_build_array(jsonb_build_object('id', pg_temp.pid(p_nomor), 'keputusan', 'tugaskan') || p_tambah))
$$;
create function pg_temp.setel(p jsonb, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000441', p_aktor bigint default 900000000002)
returns jsonb language sql as $$ select pg_temp.adm('x_wa_bagi_setel', p, p_aktor, p_tok) $$;
grant execute on all functions in schema pg_temp to public;

-- ---------------------------------------------------------------- hak
select uji.cek(has_function_privilege('service_role', 'public.x_wa_bagi_calon(jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_wa_bagi_calon(jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_wa_bagi_hasil(jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_wa_bagi_daftar(bigint,jsonb)', 'EXECUTE'),
               'fungsi bagi hanya service_role');
select uji.cek(not has_table_privilege('service_role', 'wa.penugasan', 'SELECT')
               and not has_table_privilege('authenticated', 'wa.bagi_setel', 'SELECT'), 'tabel bagi tanpa hak tabel');
select uji.galat($$select pg_temp.setel('{}', 'b0b0b0b0-0000-4000-8000-000000000443', 100000002)$$, 'PT403', 'member → 403');
select uji.galat($$select pg_temp.setel('{"aktif":true}', 'b0b0b0b0-0000-4000-8000-000000000442')$$, 'PT403', 'ubah setelan pakai token baca → 403');
select uji.sama(pg_temp.setel('{}', 'b0b0b0b0-0000-4000-8000-000000000442')->>'aktif', 'false', 'lihat setelan pakai token baca boleh; bawaan mati');
select uji.galat($$select pg_temp.setel('{"aktif":true}')$$, 'PT400', 'aktif tanpa sales → 400');
select uji.galat($$select pg_temp.setel('{"sales":[100000002, 999]}')$$, 'PT400', 'sales bukan anggota → 400');
select uji.galat($$select pg_temp.setel('{"sales":[100000002, 100000002]}')$$, 'PT400', 'sales dobel → 400');

-- ---------------------------------------------------------------- saklar mati: tidak ada calon
select uji.sama(pg_temp.msk('wamid.b44.m1', '6281200000601', '2026-11-12 09:00')->>'aktif', 'false', 'saklar mati → calon tidak dibuat');
select uji.cek(pg_temp.pid('6281200000601') is null, 'saklar mati → tanpa baris penugasan');
select uji.sama(pg_temp.ambil('2026-11-12 09:05')->>'aktif', 'false', 'ambil saat mati → aktif false');
delete from wa.log;

create temp table s1 as select pg_temp.setel('{"sales":[100000002, 100000003], "aktif":true}') j;
select uji.cek((select j->>'aktif' = 'true' and j->'sales'->0->>'nama' = 'Citra' and j->'sales'->1->>'nama' = 'Dodi' from s1),
               'setel aktif + 2 sales, nama panggilan kata pertama');

-- ---------------------------------------------------------------- calon
-- Kamis 12 Nov 09.00: chat baru → calon
select uji.sama((pg_temp.msk('wamid.b44.a1', '6281200000611', '2026-11-12 09:00')->>'calon')::int, 1, 'chat baru jam kerja → 1 calon');
select uji.sama(pg_temp.st('6281200000611'), 'calon', 'status calon');
-- pesan kedua nomor sama → tidak dobel
select uji.sama(pg_temp.msk('wamid.b44.a2', '6281200000611', '2026-11-12 09:00')->'lewat'->>'sudah_tercatat', '1', 'pesan kedua → sudah_tercatat');
select uji.sama((select count(*)::int from wa.penugasan where nomor = '6281200000611'), 1, 'satu baris per nomor');
-- luar jam / stiker / tes / nomor diam / nomor uji → lewat tanpa baris
select uji.sama(pg_temp.msk('wamid.b44.b1', '6281200000612', '2026-11-12 18:00')->'lewat'->>'luar_jam', '1', 'luar jam → lewat');
select uji.sama(pg_temp.msk('wamid.b44.c1', '6281200000613', '2026-11-12 09:01', '{}', 'masuk', 'cloud_api', 'sticker')->'lewat'->>'bukan_chat', '1', 'stiker → lewat');
select uji.sama(pg_temp.msk('wamid.b44.c2', '6281200000614', '2026-11-12 09:01', '{"tes":true}')->'lewat'->>'bukan_chat', '1', 'tes → lewat');
insert into wa.diam (nomor, alasan) values ('6281200000615', 'pemasok');
select uji.sama(pg_temp.msk('wamid.b44.d1', '6281200000615', '2026-11-12 09:01')->'lewat'->>'daftar_diam', '1', 'nomor diam → lewat');
insert into wa.uji (nomor) values ('6281200000616');
select uji.sama(pg_temp.msk('wamid.b44.d2', '6281200000616', '2026-11-12 09:01')->'lewat'->>'nomor_uji', '1', 'nomor uji → lewat');
select uji.cek((select count(*) from wa.penugasan where nomor in ('6281200000612', '6281200000613', '6281200000614', '6281200000615', '6281200000616')) = 0,
               'yang dilewati tidak membuat baris');
-- pesan keluar / pesan lama (> 1 jam)
select uji.cek(pg_temp.msk('wamid.b44.e1', '6281200000617', '2026-11-12 09:02', '{}', 'keluar', 'business_app')->>'calon' = '0', 'pesan keluar → bukan calon');
select uji.sama(pg_temp.svc('x_wa_bagi_calon', jsonb_build_object('sekarang', '2026-11-12 11:00+07'::timestamptz, 'items',
  jsonb_build_array(jsonb_build_object('id_pesan', 'wamid.b44.f1', 'arah', 'masuk', 'nomor', '6281200000618', 'waktu', '2026-11-12 09:00+07', 'jenis', 'text'))))->'lewat'->>'pesan_lama', '1',
  'pesan > 1 jam → pesan_lama');
-- percakapan berjalan: ada jejak wa.log 3 hari lalu (malam, luar jam)
select pg_temp.msk('wamid.b44.g0', '6281200000619', '2026-11-09 20:00');
select uji.sama(pg_temp.msk('wamid.b44.g1', '6281200000619', '2026-11-12 09:03')->'lewat'->>'percakapan_berjalan', '1', 'jejak 3 hari → percakapan_berjalan');
select uji.sama(pg_temp.st('6281200000619'), 'batal:percakapan_berjalan', 'dicatat batal (tidak dicek ulang)');
-- jejak 8 hari lalu → chat baru lagi
select pg_temp.msk('wamid.b44.h0', '6281200000620', '2026-11-03 20:00');
select uji.sama((pg_temp.msk('wamid.b44.h1', '6281200000620', '2026-11-12 09:03')->>'calon')::int, 1, 'jejak 9 hari lalu → calon');
-- lead terbuka bernomor sama → lead_ada; lead ORDER lama → calon
insert into public.pelanggan (id, nama, kota) values ('plujibg1', 'PT Uji Bagi', 'Jakarta');
insert into public.kontak (id, pelanggan_id, telepon, telepon_tampil) values
  ('ktujibg1', 'plujibg1', '6281200000621', '0812-0000-0621'), ('ktujibg2', 'plujibg1', '6281200000622', '0812-0000-0622');
insert into public.lead (id, pelanggan_id, kontak_id, sumber, pemilik, tahap, tanggal_masuk, dibuat_pada) values
  ('ldujibg1', 'plujibg1', 'ktujibg1', 'WA langsung', 100000002, 'PENAWARAN', '2026-09-01', '2026-09-01 10:00+07'),
  ('ldujibg2', 'plujibg1', 'ktujibg2', 'WA langsung', 100000002, 'ORDER', '2026-09-01', '2026-09-01 10:00+07');
-- dibuat_pada diisi trigger (now()); dimundurkan langsung tanpa trigger supaya jadi lead lama
set local session_replication_role = replica;
update public.lead set dibuat_pada = '2026-09-01 10:00+07' where id in ('ldujibg1', 'ldujibg2');
set local session_replication_role = origin;
select uji.sama(pg_temp.msk('wamid.b44.i1', '6281200000621', '2026-11-12 09:04')->'lewat'->>'lead_ada', '1', 'lead PENAWARAN → lead_ada');
select uji.sama((pg_temp.msk('wamid.b44.i2', '6281200000622', '2026-11-12 09:04')->>'calon')::int, 1, 'hanya lead ORDER lama → calon');

-- ---------------------------------------------------------------- ambil (jeda 60 dtk)
select uji.sama(jsonb_array_length(pg_temp.ambil('2026-11-12 09:00')->'items'), 0, 'belum lewat jeda → kosong');
create temp table a1 as select pg_temp.ambil('2026-11-12 09:06') j;
select uji.cek((select jsonb_array_length(j->'items') = 3 and j->'items'->0->>'nomor' = '6281200000611'
                       and j->>'hari_baru' = '7' and jsonb_array_length(j->'sales') = 2 from a1), 'ambil: 3 calon urut masuk, + sales & hari_baru');

-- ---------------------------------------------------------------- hasil: giliran seimbang
select uji.sama(pg_temp.tugas('2026-11-12 09:06', '6281200000611')->'umum'->0->>'pemilik_nama', 'Citra', 'giliran pertama → Citra (urutan setelan)');
select uji.sama(pg_temp.tugas('2026-11-12 09:06', '6281200000620')->'umum'->0->>'pemilik_nama', 'Dodi', 'giliran kedua → Dodi');
select uji.sama(pg_temp.st('6281200000611'), 'ditugaskan:giliran:100000002', 'tercatat ditugaskan giliran');
-- sales yang sudah membalas (dari Edge) menang, tidak dihitung ulang
select uji.sama(pg_temp.tugas('2026-11-12 09:06', '6281200000622', '{"sales":100000003}')->'umum'->0->>'pemilik_nama', 'Dodi', 'sales disebut → Dodi');
select uji.sama(pg_temp.st('6281200000622'), 'ditugaskan:sudah_membalas:100000003', 'alasan sudah_membalas');
-- sales di luar daftar diabaikan → giliran (Citra 1, Dodi 2 → Citra)
select pg_temp.msk('wamid.b44.j1', '6281200000623', '2026-11-12 09:10');
select uji.sama(pg_temp.tugas('2026-11-12 09:12', '6281200000623', '{"sales":100000001}')->'umum'->0->>'pemilik_nama', 'Citra', 'sales di luar daftar → giliran (paling sedikit)');
-- seri (2–2) → yang terakhir ditugaskan paling lama (Dodi 09.06 vs Citra 09.12) → Dodi
select pg_temp.msk('wamid.b44.j2', '6281200000624', '2026-11-12 09:20');
select uji.sama(pg_temp.tugas('2026-11-12 09:22', '6281200000624')->'umum'->0->>'pemilik_nama', 'Dodi', 'seri → yang paling lama tidak dapat');
-- batal / tunda / id tidak sah / bukan calon
select pg_temp.msk('wamid.b44.k1', '6281200000625', '2026-11-12 09:30');
select pg_temp.hasil('2026-11-12 09:31', jsonb_build_array(jsonb_build_object('id', pg_temp.pid('6281200000625'), 'keputusan', 'batal', 'alasan', 'sudah_dibalas')));
select uji.sama(pg_temp.st('6281200000625'), 'batal:sudah_dibalas', 'batal sudah_dibalas');
select pg_temp.msk('wamid.b44.k2', '6281200000626', '2026-11-12 09:30');
select pg_temp.hasil('2026-11-12 09:35', jsonb_build_array(jsonb_build_object('id', pg_temp.pid('6281200000626'), 'keputusan', 'tunda')));
select uji.sama(pg_temp.st('6281200000626'), 'calon', 'tunda < 15 menit → tetap calon');
select pg_temp.hasil('2026-11-12 09:46', jsonb_build_array(jsonb_build_object('id', pg_temp.pid('6281200000626'), 'keputusan', 'tunda')));
select uji.sama(pg_temp.st('6281200000626'), 'batal:kapso_gagal', 'tunda > 15 menit → batal kapso_gagal');
select uji.sama(jsonb_array_length(pg_temp.hasil('2026-11-12 09:46', '[{"id":"x","keputusan":"tugaskan"},{"id":999999,"keputusan":"tugaskan"}]')->'umum'), 0,
                'id tidak sah / tidak ada → diabaikan');
select uji.sama(jsonb_array_length(pg_temp.tugas('2026-11-12 09:47', '6281200000611')->'umum'), 0, 'sudah ditugaskan → tidak ditugaskan ulang');
select uji.galat($$select pg_temp.hasil('2026-11-12 09:47', '{"x":1}')$$, 'PT400', 'items bukan array → 400');

-- ---------------------------------------------------------------- umum (pengumuman)
select pg_temp.svc('x_wa_bagi_umum', jsonb_build_object('ids', jsonb_build_array(pg_temp.pid('6281200000611'), pg_temp.pid('6281200000620')), 'ok', true));
select uji.cek((select diumumkan_pada is not null from wa.penugasan where id = pg_temp.pid('6281200000611')), 'umum ok → diumumkan_pada terisi');
select pg_temp.svc('x_wa_bagi_umum', jsonb_build_object('ids', jsonb_build_array(pg_temp.pid('6281200000622')), 'ok', false));
create temp table a2 as select pg_temp.ambil(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')) j;
-- ditugaskan_pada tiruan (12 Nov) > 30 menit dari now() sungguhan → tidak diulang; ubah ke sekarang untuk cek ulang
update wa.penugasan set ditugaskan_pada = now() where id = pg_temp.pid('6281200000622');
create temp table a3 as select pg_temp.ambil(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')) j;
select uji.cek((select jsonb_array_length(j->'umum') = 1 and j->'umum'->0->>'nomor' = '6281200000622' and j->'umum'->0->>'pemilik_nama' = 'Dodi' from a3),
               'umum gagal → diulang lewat ambil');
update wa.penugasan set percobaan_umum = 5 where id = pg_temp.pid('6281200000622');
select uji.sama(jsonb_array_length((select pg_temp.ambil(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')))->'umum'), 0, 'gagal ≥ 5x → berhenti diulang');

-- ---------------------------------------------------------------- daftar & setelan
create temp table d1 as select pg_temp.adm('x_wa_bagi_daftar', '{"hari":3}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000442') j;
select uji.cek((select exists (select 1 from jsonb_array_elements(j->'items') e where e->>'nomor' = '6281200000611' and e->>'status' = 'ditugaskan'
                                and e->>'pemilik' = '100000002' and e->>'pemilik_nama' = 'Citra' and e->>'diumumkan' = 'true') from d1),
               'daftar memuat nomor, pemilik, tanda diumumkan');
select uji.galat($$select pg_temp.adm('x_wa_bagi_daftar', '{}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000443')$$, 'PT403', 'daftar: member → 403');
create temp table s2 as select pg_temp.setel('{}') j;
select uji.cek((select j::text !~ '62812000006' and (j->'hari_ini'->>'calon')::int >= 0 from s2), 'setelan: tanpa nomor');
select uji.sama(pg_temp.setel('{"jeda_detik":0}')->>'jeda_detik', '0', 'jeda bisa 0');
select uji.galat($$select pg_temp.setel('{"jeda_detik":5000}')$$, '23514', 'jeda > 900 → tolak (constraint)');

-- ---------------------------------------------------------------- picu_bagi
update wa.bagi_setel set aktif = false;
select uji.cek(wa.picu_bagi() is null, 'picu: mati → tidak memanggil');
update wa.bagi_setel set aktif = true;
insert into wa.penugasan (nomor, masuk_pada, status, dibuat_pada) values ('6281200000699', now() - interval '31 days', 'batal', now() - interval '31 days');
select wa.picu_bagi();
select uji.cek(not exists (select 1 from wa.penugasan where nomor = '6281200000699'), 'picu: retensi 30 hari');
select uji.cek(exists (select 1 from cron.job where jobname = 'wa-bagi' and schedule = '* * * * *'), 'cron wa-bagi tiap menit');

rollback;
