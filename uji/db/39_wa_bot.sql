-- 39 · Bot WA 0878 luar jam (20261110180000_wa_bot.sql): skema & hak (skema wa tertutup, tanpa isi chat), jam kerja &
-- [HARI] (hari libur, libur panjang), webhook (antrean 10 mnt, pesan beruntun → satu antrean, dobel/terbalik, sales dari HP
-- → batal, teks otomatis aplikasi bukan sales, jam kerja, daftar diam, stop → wa.diam, reaksi/stiker/tes), ambil (saklar
-- mati, jam kerja 08.05, sales membalas, chat berjalan, jendela 24 jam, batas 3/periode & 4/24 jam, proses macet diambil
-- ulang), hasil (kirim + biaya, tunda ≤ 3, tolak/gagal + pemutus), peringatan 3 jam, jaga, ringkas/saklar/diam (owner/bot,
-- scope), retensi, picu tanpa Vault. Nomor tiruan 6281200000xxx. Waktu dari p.sekarang (jalur uji; produksi now()).
-- Aktor: budi 100000001 (owner), citra 100000002 (member), bot 900000000002.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log; delete from wa.kejadian; delete from wa.diam; delete from wa.peringatan;
delete from wa.kata_manusia;
update wa.pengaturan set saklar = 'mati', saklar_alasan = 'awal';
-- batas 100/24 jam (migrasi 20261110220000, revisi Hannes 10 Nov malam); logika batas di bawah diuji dengan 3/4.
select uji.cek((select maks_per_periode = 100 and maks_per_24jam = 100 from wa.pengaturan), 'batas terpasang 100/periode & 100/24 jam');
select uji.galat($$update wa.pengaturan set maks_per_24jam = 101$$, '23514', 'batas 24 jam > 100 ditolak constraint');
update wa.pengaturan set maks_per_periode = 3, maks_per_24jam = 4;
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000391', 900000000002, 'bot tulis (uji 39)', 'rtk_b391', uji.sha('rtk_uji39_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000392', 900000000002, 'bot baca (uji 39)', 'rtk_b392', uji.sha('rtk_uji39_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000393', 100000002, 'citra tulis (uji 39)', 'rtk_b393', uji.sha('rtk_uji39_citra'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000394', 100000001, 'budi baca (uji 39)', 'rtk_b394', uji.sha('rtk_uji39_budi'), 'baca');

-- panggil pintu sebagai service_role (Edge)
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

-- ------------------------------------------------------------ skema & hak
select uji.cek(not has_schema_privilege('anon', 'wa', 'USAGE') and not has_schema_privilege('authenticated', 'wa', 'USAGE')
               and not has_schema_privilege('service_role', 'wa', 'USAGE'), 'skema wa tanpa USAGE untuk role API');
select uji.cek(not exists (select 1 from pg_class c where c.relnamespace = 'wa'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  'RLS ON di semua tabel wa');
select uji.sama((select count(*)::int from pg_class c where c.relnamespace = 'wa'::regnamespace and c.relkind = 'r'), 12, '12 tabel wa (+ pengetahuan 20261111100000, + uji 20261111130000, + bagi_setel/penugasan 20261111170000)');
select uji.cek(not exists (select 1 from pg_class c, unnest(array['anon', 'authenticated', 'service_role']) r(rol)
                 where c.relnamespace = 'wa'::regnamespace and c.relkind in ('r', 'S')
                   and (has_table_privilege(r.rol, c.oid, 'SELECT') or has_table_privilege(r.rol, c.oid, 'INSERT'))),
  'tabel/sequence wa tanpa hak role API');
select uji.cek(not exists (select 1 from information_schema.columns where table_schema = 'wa' and table_name = 'log'
                             and column_name ~ '(isi|pesan_teks|nomor$|nama|konten|content|body)'),
  'wa.log tanpa kolom isi chat / nomor / nama (hanya nomor_hash + teks_bot)');
select uji.cek((select bool_and(has_function_privilege('service_role', f::oid, 'EXECUTE') and not has_function_privilege('anon', f::oid, 'EXECUTE')
                                and not has_function_privilege('authenticated', f::oid, 'EXECUTE'))
                  from unnest(array['public.x_wa_webhook(jsonb)', 'public.x_wa_ambil(jsonb)', 'public.x_wa_hasil(jsonb)',
                                    'public.x_wa_jaga(jsonb)', 'public.x_wa_peringatan(jsonb)', 'public.x_wa_ringkas(bigint,jsonb)',
                                    'public.x_wa_saklar(bigint,jsonb)', 'public.x_wa_diam(bigint,jsonb)']::regprocedure[]) f),
  '8 x_wa_* hanya service_role');
select uji.cek(not exists (select 1 from pg_proc p where p.pronamespace = 'wa'::regnamespace
                 and (has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'fungsi wa.* internal');
select uji.sama((select saklar from wa.pengaturan), 'mati', 'saklar default mati');
select uji.sama((select model from wa.pengaturan), 'claude-sonnet-5-5', 'model default');
select uji.sama((select count(*)::int from wa.kata_manusia), 0, 'kata_manusia isi awal kosong');
select uji.cek((select count(*) = 3 from cron.job where jobname in ('wa-proses', 'wa-jaga', 'wa-rawat')), 'cron wa-proses/jaga/rawat terjadwal');
select uji.cek(wa.picu('proses') is null and wa.picu('jaga') is null, 'picu tanpa secret Vault → tidak memanggil apa pun');

-- ------------------------------------------------------------ jam kerja & [HARI]
select uji.cek(not wa.jam_kerja('2026-11-06 19:00+07') and wa.jam_kerja('2026-11-06 16:59+07') and not wa.jam_kerja('2026-11-09 07:59+07')
               and wa.jam_kerja('2026-11-09 08:00+07') and not wa.jam_kerja('2026-11-07 10:00+07'), 'jam kerja Sen–Jum 08.00–17.00');
select uji.sama(wa.label_hari('2026-11-06 19:00+07'), 'Senin pagi', '[HARI] Jumat 19.00 → Senin pagi');
select uji.sama(wa.label_hari('2026-11-07 10:00+07'), 'Senin pagi', '[HARI] Sabtu → Senin pagi');
select uji.sama(wa.label_hari('2026-11-08 21:00+07'), 'Senin pagi', '[HARI] Minggu malam → Senin pagi');
select uji.sama(wa.label_hari('2026-11-10 18:00+07'), 'besok pagi', '[HARI] Selasa 18.00 → besok pagi');
select uji.sama(wa.label_hari('2026-11-09 05:00+07'), 'pagi ini mulai jam 08.00', '[HARI] Senin 05.00 → pagi ini');
insert into public.hari_libur (tanggal, nama) values ('2026-11-12', 'Libur uji');
select uji.sama(wa.label_hari('2026-11-11 19:00+07'), 'Jumat pagi', '[HARI] malam sebelum libur (Rabu, Kamis libur) → Jumat pagi');
select uji.sama(wa.label_hari('2026-11-12 10:00+07'), 'Jumat pagi', '[HARI] di hari libur → hari kerja berikutnya');
select uji.cek(not wa.jam_kerja('2026-11-12 10:00+07'), 'hari libur = luar jam');
insert into public.hari_libur (tanggal, nama) select d::date, 'Libur panjang uji' from generate_series('2026-11-16'::date, '2026-11-24'::date, '1 day') d;
select uji.sama(wa.label_hari('2026-11-13 19:00+07'), 'Rabu 25 November pagi', '[HARI] libur panjang ≥ 7 hari → hari + tanggal');
delete from public.hari_libur where tanggal between '2026-11-01' and '2026-12-31';

-- ------------------------------------------------------------ webhook: antrean
select pg_temp.msk('wamid.uji.1', '6281200000101', '2026-11-06 19:00');
select uji.sama((select pg_temp.wib(jatuh_tempo) || ' ' || periode || ' ' || status from wa.antrean where nomor = '6281200000101'),
  '2026-11-06 19:10 2026-11-09 tunggu', 'Jumat 19.00 → antrean jatuh tempo 19.10, periode Senin');
select pg_temp.msk('wamid.uji.' || i, '6281200000101', '2026-11-06 19:0' || i) from generate_series(2, 5) i;
select uji.sama((select count(*)::int || ' ' || max(jumlah_pesan) || ' ' || pg_temp.wib(max(jatuh_tempo)) from wa.antrean where nomor = '6281200000101'),
  '1 5 2026-11-06 19:10', '5 pesan beruntun → 1 antrean, jatuh tempo tetap 19.10');
select pg_temp.msk('wamid.uji.6', '6281200000101', '2026-11-06 19:09');
select uji.sama((select pg_temp.wib(jatuh_tempo) from wa.antrean where nomor = '6281200000101'), '2026-11-06 19:11',
  'pesan di menit 9 → jatuh tempo 2 menit sesudah pesan terakhir');
select uji.cek((select count(*) = 6 from wa.log where arah = 'masuk' and nomor_hash = wa.hash_nomor('6281200000101') and id_pesan like 'wamid.uji.%'),
  'log masuk 6 baris (metadata, nomor di-hash)');
select uji.cek((select bool_and(nomor_hash ~ '^[0-9a-f]{64}$' and nomor_hash <> encode(extensions.digest('6281200000101', 'sha256'), 'hex')) from wa.log where nomor_hash is not null),
  'nomor_hash = HMAC berkunci (bukan sha256 polos)');

-- dobel / terbalik
select uji.sama(pg_temp.msk('wamid.uji.d1', '6281200000102', '2026-11-07 10:05', '{}', 'idem-1')->>'dobel', 'false', 'kunci idem baru diproses');
select uji.sama(pg_temp.msk('wamid.uji.d1', '6281200000102', '2026-11-07 10:05', '{}', 'idem-1')->>'dobel', 'true', 'kunci idem sama → dobel');
select uji.sama(pg_temp.msk('wamid.uji.d1', '6281200000102', '2026-11-07 10:05', '{}', 'idem-2')->>'dobel', 'true', 'id pesan sama, kunci lain → dobel');
select pg_temp.msk('wamid.uji.d0', '6281200000102', '2026-11-07 10:00');   -- datang terlambat, lebih tua
select uji.sama((select pg_temp.wib(pesan_pertama_pada) || ' ' || pg_temp.wib(jatuh_tempo) || ' ' || jumlah_pesan from wa.antrean where nomor = '6281200000102'),
  '2026-11-07 10:00 2026-11-07 10:10 2', 'urutan terbalik → pesan pertama & jatuh tempo mengikuti pesan tertua');

-- sales dari HP
select pg_temp.msk('wamid.uji.s1', '6281200000102', '2026-11-07 10:03', '{"otomatis":true}', null, 'keluar', 'business_app');
select uji.sama(pg_temp.st('6281200000102'), 'tunggu', 'teks otomatis aplikasi (A1/A2) bukan balasan sales');
select pg_temp.msk('wamid.uji.s2', '6281200000102', '2026-11-07 10:06', '{}', null, 'keluar', 'business_app');
select uji.sama(pg_temp.st('6281200000102'), 'batal:sales_membalas', 'sales membalas dari HP dalam 10 menit → batal');
select pg_temp.msk('wamid.uji.s3', '6281200000102', '2026-11-07 10:07', '{}', null, 'keluar', 'cloud_api');
select uji.sama((select arah from wa.log where id_pesan = 'wamid.uji.s3'), 'keluar_api', 'kiriman cloud_api dicatat keluar_api (bukan sales)');

-- jam kerja / diam / stop / reaksi
select pg_temp.msk('wamid.uji.j1', '6281200000103', '2026-11-09 10:00');
select uji.cek(pg_temp.aid('6281200000103') is null and (select alasan from wa.log where id_pesan = 'wamid.uji.j1') = 'jam_kerja',
  'pesan jam kerja → tanpa antrean');
insert into wa.diam (nomor, alasan) values ('6281200000104', 'internal');
select pg_temp.msk('wamid.uji.i1', '6281200000104', '2026-11-07 20:00');
select uji.cek(pg_temp.aid('6281200000104') is null and (select keputusan || ' ' || alasan from wa.log where id_pesan = 'wamid.uji.i1') = 'diam daftar_diam:internal',
  'nomor internal → diam');
select pg_temp.msk('wamid.uji.t1', '6281200000105', '2026-11-07 20:00');
select pg_temp.msk('wamid.uji.t2', '6281200000105', '2026-11-07 20:01', '{"stop":true}');
select uji.cek((select alasan from wa.diam where nomor = '6281200000105') = 'minta_berhenti' and pg_temp.st('6281200000105') = 'batal:minta_berhenti',
  '"stop" → wa.diam + antrean batal');
select pg_temp.msk('wamid.uji.r1', '6281200000106', '2026-11-07 20:00', '{}', null, 'masuk', 'cloud_api', 'reaction');
select pg_temp.msk('wamid.uji.r2', '6281200000106', '2026-11-07 20:01', '{}', null, 'masuk', 'cloud_api', 'sticker');
select pg_temp.msk('wamid.uji.r3', '6281200000106', '2026-11-07 20:02', '{"tes":true}');
select uji.cek(pg_temp.aid('6281200000106') is null
               and (select string_agg(alasan, ',' order by id) from wa.log where nomor_hash = wa.hash_nomor('6281200000106')) = 'reaksi,stiker,tes',
  'reaksi / stiker / tes → tanpa antrean');
select pg_temp.msk('wamid.uji.h1', '6281200000107', '2026-11-07 20:00', '{}', null, 'masuk', 'history_sync');
select uji.cek(not exists (select 1 from wa.log where id_pesan = 'wamid.uji.h1'), 'history_sync dilewati');
select uji.galat($$select pg_temp.svc('x_wa_webhook', '{"items":"x"}')$$, 'PT400', 'items bukan array → 400');

-- ------------------------------------------------------------ ambil: aturan saat jatuh tempo
select uji.sama((pg_temp.ambil('2026-11-06 19:12')->'batal'->>'saklar_mati')::int, 1, 'saklar mati → batal saklar_mati (tanpa kiriman)');
select uji.sama(pg_temp.st('6281200000101'), 'batal:saklar_mati', 'antrean batal saklar_mati');
update wa.pengaturan set saklar = 'kirim';
select pg_temp.bersih();

-- Senin 07.55 → 08.05 → jam kerja
select pg_temp.msk('wamid.uji.m1', '6281200000111', '2026-11-09 07:55');
select uji.sama((select pg_temp.wib(jatuh_tempo) from wa.antrean where nomor = '6281200000111'), '2026-11-09 08:05', 'Senin 07.55 → jatuh tempo 08.05');
select uji.sama(jsonb_array_length(pg_temp.ambil('2026-11-09 08:00')->'items'), 0, 'belum jatuh tempo → tidak diambil');
select pg_temp.ambil('2026-11-09 08:05');
select uji.sama(pg_temp.st('6281200000111'), 'batal:jam_kerja', '08.05 sudah jam kerja → batal');

-- jalur normal: Jumat 19.00 form situs
select pg_temp.msk('wamid.uji.f1', '6281200000112', '2026-11-06 19:00');
create temp table a1 as select pg_temp.ambil('2026-11-06 19:10') j;
select uji.cek((select jsonb_array_length(j->'items') = 1 and j->'items'->0->>'hari' = 'Senin pagi' and j->'items'->0->>'nomor' = '6281200000112'
                       and (j->'items'->0->>'bot_periode')::int = 0 and (j->'items'->0->>'sisa')::int = 3 from a1),
  'jatuh tempo → diambil: [HARI] Senin pagi, sisa 3');
select uji.sama(pg_temp.st('6281200000112'), 'proses', 'status proses');
select uji.sama(jsonb_array_length(pg_temp.ambil('2026-11-06 19:11')->'items'), 0, 'sedang diproses → tidak diambil dua kali');
select pg_temp.msk('wamid.uji.f2', '6281200000112', '2026-11-06 19:10');
select uji.sama((select alasan from wa.log where id_pesan = 'wamid.uji.f2'), 'sedang_diproses', 'pesan saat diproses tidak membuka antrean kedua');
select uji.sama(pg_temp.hasil(pg_temp.aid('6281200000112'), 'kirim', '2026-11-06 19:10',
  '{"id_pesan":"wamid.bot.1","teks_bot":"Terima kasih ... (pesan otomatis)","token_masuk":1500,"token_keluar":120,"model":"claude-sonnet-5-5"}')->>'status',
  'selesai', 'hasil kirim → selesai');
select uji.cek((select arah = 'keluar_bot' and biaya_usd = 0.004200 and teks_bot like '%(pesan otomatis)' and periode = '2026-11-09'
                  from wa.log where id_pesan = 'wamid.bot.1'), 'log keluar_bot: biaya 1500×$2 + 120×$10 per juta = $0.0042');
select uji.galat($$select pg_temp.hasil(pg_temp.aid('6281200000112'), 'kirim', '2026-11-06 19:10', '{"id_pesan":"x","teks_bot":"y"}')$$,
  'PT409', 'hasil kedua untuk antrean selesai → 409');
-- webhook .sent dari kiriman bot sendiri datang belakangan → dilewati
select pg_temp.msk('wamid.bot.1', '6281200000112', '2026-11-06 19:10', '{"otomatis":true}', null, 'keluar', 'cloud_api');
select uji.sama((select count(*)::int from wa.log where id_pesan = 'wamid.bot.1'), 1, 'echo .sent kiriman bot tidak menggandakan log');

-- batas 3 per periode
select pg_temp.msk('wamid.uji.f3', '6281200000112', '2026-11-06 20:00');
select uji.sama((select pg_temp.wib(jatuh_tempo) from wa.antrean where nomor = '6281200000112' and status = 'tunggu'), '2026-11-06 20:02',
  'sudah ada pesan bot di periode → balasan berikutnya 2 menit sesudah pesan terakhir');
select pg_temp.ambil('2026-11-06 20:02');
select pg_temp.hasil(pg_temp.aid('6281200000112'), 'kirim', '2026-11-06 20:02', '{"id_pesan":"wamid.bot.2","teks_bot":"b (pesan otomatis)"}');
select pg_temp.msk('wamid.uji.f4', '6281200000112', '2026-11-06 21:00');
select pg_temp.ambil('2026-11-06 21:02');
select pg_temp.hasil(pg_temp.aid('6281200000112'), 'kirim', '2026-11-06 21:02', '{"id_pesan":"wamid.bot.3","teks_bot":"c (pesan otomatis)"}');
select pg_temp.msk('wamid.uji.f5', '6281200000112', '2026-11-06 22:00');
select uji.sama((pg_temp.ambil('2026-11-06 22:02')->'batal'->>'batas_periode')::int, 1, 'pesan bot ke-4 di periode → batal batas_periode');
-- sesudah sales membalas, jatah dihitung ulang
select pg_temp.msk('wamid.uji.f6', '6281200000112', '2026-11-07 09:00', '{}', null, 'keluar', 'business_app');
select pg_temp.msk('wamid.uji.f8', '6281200000112', '2026-11-08 21:00');
select uji.sama((pg_temp.ambil('2026-11-08 21:10')->'items'->0->>'bot_periode')::int, 0, 'sesudah sales membalas: hitungan batas mulai lagi');
select pg_temp.hasil(pg_temp.aid('6281200000112'), 'batal', '2026-11-08 21:10', '{"alasan":"uji"}');

-- jendela 24 jam (aturan Meta)
select pg_temp.msk('wamid.uji.w1', '6281200000117', '2026-11-07 10:00');
select pg_temp.ambil('2026-11-08 10:30');
select uji.sama(pg_temp.st('6281200000117'), 'batal:jendela_24jam', 'diambil > 24 jam sesudah pesan terakhir → batal jendela_24jam');

-- chat berjalan: sales mengirim < 24 jam sebelum pesan pertama
select pg_temp.msk('wamid.uji.c1', '6281200000113', '2026-11-06 16:00', '{}', null, 'keluar', 'business_app');
select pg_temp.msk('wamid.uji.c2', '6281200000113', '2026-11-06 19:00');
select pg_temp.ambil('2026-11-06 19:10');
select uji.sama(pg_temp.st('6281200000113'), 'batal:chat_berjalan', 'sales mengirim 3 jam sebelumnya → batal chat_berjalan');

-- batas 4 per 24 jam (lintas periode): 3 pesan Kamis malam (periode Jumat) + 1 Jumat 17.40 (periode Senin) → ke-5 batal
select pg_temp.bersih();
select pg_temp.msk('wamid.uji.b1', '6281200000114', '2026-11-05 19:00');
select pg_temp.ambil('2026-11-05 19:10'), pg_temp.hasil(pg_temp.aid('6281200000114'), 'kirim', '2026-11-05 19:10', '{"id_pesan":"wamid.bot.b1","teks_bot":"x (pesan otomatis)"}');
select pg_temp.msk('wamid.uji.b2', '6281200000114', '2026-11-05 20:30');
select pg_temp.ambil('2026-11-05 20:32'), pg_temp.hasil(pg_temp.aid('6281200000114'), 'kirim', '2026-11-05 20:32', '{"id_pesan":"wamid.bot.b2","teks_bot":"x (pesan otomatis)"}');
select pg_temp.msk('wamid.uji.b3', '6281200000114', '2026-11-05 21:30');
select pg_temp.ambil('2026-11-05 21:32'), pg_temp.hasil(pg_temp.aid('6281200000114'), 'kirim', '2026-11-05 21:32', '{"id_pesan":"wamid.bot.b3","teks_bot":"x (pesan otomatis)"}');
select pg_temp.msk('wamid.uji.b4', '6281200000114', '2026-11-06 17:30');
select uji.sama((select pg_temp.wib(jatuh_tempo) from wa.antrean where id = pg_temp.aid('6281200000114')), '2026-11-06 17:40', 'periode baru → tunda awal 10 menit lagi');
select pg_temp.ambil('2026-11-06 17:40'), pg_temp.hasil(pg_temp.aid('6281200000114'), 'kirim', '2026-11-06 17:40', '{"id_pesan":"wamid.bot.b4","teks_bot":"x (pesan otomatis)"}');
select uji.sama((select count(*)::int from wa.log where keputusan = 'kirim' and nomor_hash = wa.hash_nomor('6281200000114')), 4, '4 pesan bot terkirim');
select pg_temp.msk('wamid.uji.b5', '6281200000114', '2026-11-06 18:30');
select uji.sama((pg_temp.ambil('2026-11-06 18:40')->'batal'->>'batas_24jam')::int, 1, 'pesan bot ke-5 dalam 24 jam → batal batas_24jam');

-- proses macet > 5 menit diambil ulang
select pg_temp.bersih();
select pg_temp.msk('wamid.uji.p1', '6281200000115', '2026-11-07 10:00');
select pg_temp.ambil('2026-11-07 10:10');
select uji.sama(jsonb_array_length(pg_temp.ambil('2026-11-07 10:14')->'items'), 0, 'proses < 5 menit tidak diambil ulang');
select uji.sama(jsonb_array_length(pg_temp.ambil('2026-11-07 10:16')->'items'), 1, 'proses macet > 5 menit diambil ulang');

-- tunda maks 3
select uji.sama(pg_temp.hasil(pg_temp.aid('6281200000115'), 'tunda', '2026-11-07 10:16', '{"alasan":"kapso_baca_503"}')->>'status', 'tunggu', 'tunda 1 → tunggu');
select uji.sama((select pg_temp.wib(jatuh_tempo) || ' ' || percobaan from wa.antrean where id = pg_temp.aid('6281200000115')), '2026-11-07 10:18 1', 'tunda: +2 menit');
select pg_temp.ambil('2026-11-07 10:18'), pg_temp.hasil(pg_temp.aid('6281200000115'), 'tunda', '2026-11-07 10:18');
select pg_temp.ambil('2026-11-07 10:20');
select uji.sama(pg_temp.hasil(pg_temp.aid('6281200000115'), 'tunda', '2026-11-07 10:20')->>'status', 'batal', 'tunda ke-3 → batal tunda_habis');

-- diam_nomor dari cek ulang (stop terbaca lewat API)
select pg_temp.msk('wamid.uji.q1', '6281200000116', '2026-11-07 10:00');
select pg_temp.ambil('2026-11-07 10:10');
select pg_temp.hasil(pg_temp.aid('6281200000116'), 'diam', '2026-11-07 10:10', '{"alasan":"minta_berhenti","diam_nomor":"minta_berhenti"}');
select uji.sama((select alasan from wa.diam where nomor = '6281200000116'), 'minta_berhenti', 'diam_nomor → wa.diam');

-- ------------------------------------------------------------ pemutus
select pg_temp.bersih();
select pg_temp.msk('wamid.uji.v' || i, '628120000012' || i, '2026-11-07 10:00') from generate_series(1, 3) i;
select pg_temp.ambil('2026-11-07 10:10');
select pg_temp.hasil(pg_temp.aid('628120000012' || i), 'tolak', '2026-11-07 10:10', '{"alasan":"validator: harga","teks_bot":"Rp 1 (pesan otomatis)"}') from generate_series(1, 2) i;
select uji.sama((select saklar from wa.pengaturan), 'kirim', '2 tolak → saklar tetap kirim');
select uji.sama(pg_temp.hasil(pg_temp.aid('6281200000123'), 'tolak', '2026-11-07 10:10', '{"alasan":"validator: harga","teks_bot":"Rp 1 (pesan otomatis)"}')->>'pemutus',
  'true', 'tolak ke-3 hari ini → pemutus');
select uji.sama((select saklar || ' ' || saklar_alasan from wa.pengaturan), 'mati pemutus', 'saklar mati (alasan pemutus)');
select uji.cek((select teks_bot from wa.log where keputusan = 'tolak' limit 1) like 'Rp%', 'teks bot yang ditolak disimpan untuk QA');
update wa.pengaturan set saklar = 'kirim', saklar_alasan = 'manual';
select pg_temp.bersih();
select pg_temp.msk('wamid.uji.g' || i, '628120000013' || i, '2026-11-07 10:00') from generate_series(1, 5) i;
select pg_temp.ambil('2026-11-07 10:10');
select pg_temp.hasil(pg_temp.aid('628120000013' || i), 'gagal', '2026-11-07 10:10', '{"alasan":"kapso_429 (3x)"}') from generate_series(1, 4) i;
select uji.sama((select saklar from wa.pengaturan), 'kirim', '4 gagal → saklar tetap kirim');
select pg_temp.hasil(pg_temp.aid('6281200000135'), 'gagal', '2026-11-07 10:10', '{"alasan":"kapso_429 (3x)"}');
select uji.sama((select saklar || ' ' || saklar_alasan from wa.pengaturan), 'mati pemutus', 'gagal ke-5 dalam 1 jam → pemutus');

-- ------------------------------------------------------------ jaga & peringatan
create temp table jg as select pg_temp.svc('x_wa_jaga', '{"sekarang":"2026-11-07T10:20:00+07:00"}') j;
select uji.cek((select (j->>'gagal')::int = 5 and j->>'saklar_alasan' = 'pemutus' and (j->>'akhir_pekan')::boolean and j->>'gagal_alasan' like 'kapso_429%' from jg),
  'jaga: gagal 15 menit, pemutus, akhir pekan');
update wa.pengaturan set saklar = 'kirim', saklar_alasan = 'manual';
select pg_temp.msk('wamid.uji.k1', '6281200000141', '2026-11-07 10:00');
select uji.sama((pg_temp.svc('x_wa_jaga', '{"sekarang":"2026-11-07T10:21:00+07:00"}')->>'macet')::int, 1, 'jaga: chat > 20 menit belum dibalas → macet');
select uji.sama(pg_temp.svc('x_wa_peringatan', '{"kunci":"gagal","sekarang":"2026-11-07T10:00:00+07:00"}')->>'kirim', 'true', 'peringatan pertama → kirim');
select uji.sama(pg_temp.svc('x_wa_peringatan', '{"kunci":"gagal","sekarang":"2026-11-07T12:59:00+07:00"}')->>'kirim', 'false', 'masalah sama < 3 jam → tidak kirim');
select uji.sama(pg_temp.svc('x_wa_peringatan', '{"kunci":"tolak","sekarang":"2026-11-07T12:59:00+07:00"}')->>'kirim', 'true', 'masalah lain → kirim');
select uji.sama(pg_temp.svc('x_wa_peringatan', '{"kunci":"gagal","sekarang":"2026-11-07T13:00:00+07:00"}')->>'kirim', 'true', '≥ 3 jam → kirim lagi');

-- ------------------------------------------------------------ admin: ringkas / saklar / diam
create temp table rk as select pg_temp.adm('x_wa_ringkas', '{"hari":90}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000392') j;
select uji.cek((select (j->>'gagal')::int = 5 and (j->>'tolak')::int >= 0 and j ? 'per_alasan' and j ? 'biaya_usd' and j->>'saklar' = 'kirim' from rk),
  'ringkas (bot, scope baca)');
select uji.cek((select position('62812' in j::text) = 0 from rk), 'ringkas tanpa nomor');
select uji.cek(pg_temp.adm('x_wa_ringkas', '{}', 100000001, 'b0b0b0b0-0000-4000-8000-000000000394') ? 'masuk', 'ringkas (owner) ok');
select uji.galat($$select pg_temp.adm('x_wa_ringkas', '{}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000393')$$, 'PT403', 'ringkas member → 403');
select uji.galat($$select pg_temp.adm('x_wa_ringkas', '{"hari":0}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000392')$$, 'PT400', 'ringkas hari 0 → 400');
select uji.galat($$select pg_temp.adm('x_wa_saklar', '{"status":"mati"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000392')$$, 'PT403', 'saklar dengan token baca → 403 scope');
select uji.galat($$select pg_temp.adm('x_wa_saklar', '{"status":"mati"}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000393')$$, 'PT403', 'saklar oleh member → 403');
select uji.galat($$select pg_temp.adm('x_wa_saklar', '{"status":"nyala"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')$$, 'PT400', 'saklar status salah → 400');
select uji.sama(pg_temp.adm('x_wa_saklar', '{"status":"mati"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')->>'saklar', 'mati', 'saklar mati (bot)');
select uji.sama((select saklar_alasan || ' ' || saklar_diubah_oleh from wa.pengaturan), 'manual 900000000002', 'saklar manual tercatat pengubahnya');
select uji.sama(pg_temp.adm('x_wa_diam', '{"nomor":"0812-0000-0151","alasan":"ekspedisi"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')->>'nomor',
  '6281200000151', 'diam: nomor dinormalkan 08… → 62…');
select uji.galat($$select pg_temp.adm('x_wa_diam', '{"nomor":"12","alasan":"internal"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')$$, 'PT400', 'diam nomor tidak sah → 400');
select uji.galat($$select pg_temp.adm('x_wa_diam', '{"nomor":"081200000151","alasan":"teman"}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')$$, 'PT400', 'diam alasan tidak sah → 400');
select uji.sama(pg_temp.adm('x_wa_diam', '{"nomor":"081200000151","hapus":true}', 900000000002, 'b0b0b0b0-0000-4000-8000-000000000391')->>'dihapus',
  'true', 'diam: hapus');

-- ------------------------------------------------------------ retensi
insert into wa.antrean (nomor, periode, pesan_pertama_pada, pesan_terakhir_pada, tempo_dasar, jatuh_tempo, status, dibuat_pada)
values ('6281200000161', '2026-10-01', now() - interval '9 days', now() - interval '9 days', now(), now(), 'selesai', now() - interval '8 days');
insert into wa.log (waktu, arah, keputusan, dicatat_pada) values (now() - interval '100 days', 'sistem', 'catat', now() - interval '91 days');
select uji.cek((wa.rawat()->>'antrean')::int >= 1, 'retensi: wa.rawat menghapus antrean lama');
select uji.cek(not exists (select 1 from wa.antrean where nomor = '6281200000161')
               and not exists (select 1 from wa.log where dicatat_pada < now() - interval '90 days'), 'retensi: antrean > 7 hari, log > 90 hari terhapus');

rollback;
