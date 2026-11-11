-- 41 · Halaman web Bot WA (20261111120000_wa_web.sql, keputusan Hannes 11 Nov 2026): web_wa_ringkas / web_wa_log /
-- web_wa_saklar / web_wa_pengetahuan_daftar. Hak: owner ok, member 403, anon tidak bisa eksekusi; keluaran tanpa nomor
-- telepon (hanya 8 karakter awal hash) dan tanpa isi chat pelanggan; tidak ada fungsi web_* untuk SIMPAN pengetahuan
-- (simpan lewat Edge /x/admin/wa-pengetahuan supaya validator bot tidak bisa dilewati).
-- Aktor: budi 1111… (owner), citra 2222… (member).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

delete from wa.antrean; delete from wa.log;
insert into wa.antrean (nomor, percakapan, periode, pesan_pertama_pada, pesan_terakhir_pada, tempo_dasar, jatuh_tempo, status)
values ('6281200000401', 'conv_uji_web_1', '2026-11-12', now() - interval '1 hour', now() - interval '1 hour',
        now() - interval '50 minutes', now() - interval '50 minutes', 'selesai');
insert into wa.log (waktu, arah, keputusan, alasan, nomor_hash, id_pesan, antrean_id, periode, teks_bot, token_masuk, token_keluar, biaya_usd, model)
select now() - make_interval(mins => i), case when i % 3 = 0 then 'masuk' else 'keluar_bot' end,
       case when i % 3 = 0 then 'catat' when i % 3 = 1 then 'kirim' else 'tolak' end,
       case when i % 3 = 2 then 'validator: harga' end,
       repeat('ab', 32), 'wamid.uji.web.' || i, (select id from wa.antrean where percakapan = 'conv_uji_web_1'), '2026-11-12',
       case when i % 3 <> 0 then 'Selamat malam Bapak/Ibu. Sales kami membalas besok pagi.' || chr(10) || '(pesan otomatis)' end,
       case when i % 3 <> 0 then 1000 end, case when i % 3 <> 0 then 80 end, case when i % 3 <> 0 then 0.0028 end,
       case when i % 3 <> 0 then 'claude-sonnet-5-5' end
  from generate_series(1, 60) i;

-- hak eksekusi
select uji.cek((select bool_and(has_function_privilege('authenticated', f::oid, 'EXECUTE') and not has_function_privilege('anon', f::oid, 'EXECUTE')
                                and not has_function_privilege('service_role', f::oid, 'EXECUTE'))
                  from unnest(array['public.web_wa_ringkas(jsonb)', 'public.web_wa_log(jsonb)', 'public.web_wa_saklar(jsonb)',
                                    'public.web_wa_pengetahuan_daftar()']::regprocedure[]) f),
  '4 web_wa_* hanya authenticated');
select uji.cek(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^web_wa_pengetahuan_(simpan|ubah|tambah)'),
  'tidak ada web_* simpan pengetahuan (validator lewat Edge)');

-- owner
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('r', public.web_wa_ringkas('{"hari":7}'));
select uji.cek((uji.ambil('r')->>'kirim')::int = 20 and (uji.ambil('r')->>'tolak')::int = 20 and uji.ambil('r') ? 'terakhir_webhook',
  'owner: ringkas 7 hari (20 kirim, 20 tolak)');
select uji.simpan('l1', public.web_wa_log('{"batas":25}'));
select uji.cek(jsonb_array_length(uji.ambil('l1')->'items') = 25 and (uji.ambil('l1')->>'berikut') is not null, 'log: halaman 25 + penanda berikut');
select uji.cek((uji.ambil('l1')->'items'->0->>'nomor') = 'abababab' and (uji.ambil('l1')->'items'->0->>'percakapan') = 'conv_uji_web_1',
  'log: nomor = 8 karakter hash, id percakapan Kapso ikut');
select uji.cek(not (uji.ambil('l1')::text ~ '6281200000401') and not (uji.ambil('l1')::text ~ repeat('ab', 32)),
  'log: tanpa nomor telepon dan tanpa hash utuh');
select uji.simpan('l2', public.web_wa_log(jsonb_build_object('batas', 25, 'sebelum', (uji.ambil('l1')->>'berikut')::bigint)));
select uji.cek((uji.ambil('l2')->'items'->0->>'id')::bigint < (uji.ambil('l1')->>'berikut')::bigint
               and jsonb_array_length(uji.ambil('l2')->'items') = 25, 'log: halaman 2 sesudah penanda');
select uji.simpan('l3', public.web_wa_log('{"keputusan":"tolak","batas":100}'));
select uji.cek(jsonb_array_length(uji.ambil('l3')->'items') = 20 and (uji.ambil('l3')->>'berikut') is null
               and (select bool_and(x->>'keputusan' = 'tolak') from jsonb_array_elements(uji.ambil('l3')->'items') x),
  'log: saring keputusan tolak (20, habis)');
select uji.sama(jsonb_array_length(public.web_wa_log('{"alasan":"validator","batas":100}')->'items'), 20, 'log: saring awalan alasan');
select uji.sama(jsonb_array_length(public.web_wa_log('{"alasan":"%","batas":100}')->'items'), 0, 'log: % di alasan tidak jadi wildcard');
select uji.galat($$select public.web_wa_log('{"keputusan":"x"}')$$, 'PT400', 'keputusan tidak dikenal → 400');
select uji.galat($$select public.web_wa_log('{"batas":500}')$$, 'PT400', 'batas > 100 → 400');
select uji.galat($$select public.web_wa_log('{"hari":0}')$$, 'PT400', 'hari 0 → 400');
select uji.sama((public.web_wa_saklar('{"status":"kirim","catatan":"uji web"}')->>'saklar'), 'kirim', 'owner: saklar kirim');
select uji.sama((public.web_wa_saklar('{"status":"mati"}')->>'saklar'), 'mati', 'owner: saklar mati lagi');
select uji.galat($$select public.web_wa_saklar('{"status":"nyala"}')$$, 'PT400', 'status saklar salah → 400');
select uji.cek(jsonb_array_length(public.web_wa_pengetahuan_daftar()) >= 3, 'owner: daftar pengetahuan (≥ 3 fakta isi awal)');
reset role;
select uji.cek((select saklar_diubah_oleh = 100000001 and saklar_catatan is null from wa.pengaturan), 'saklar: aktor = owner web');
select uji.cek(exists (select 1 from wa.log where alasan = 'saklar kirim oleh 100000001'), 'saklar dari web tercatat di log');

-- member biasa
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_wa_ringkas()$$, 'PT403', 'member: ringkas → 403');
select uji.galat($$select public.web_wa_log()$$, 'PT403', 'member: log → 403');
select uji.galat($$select public.web_wa_saklar('{"status":"kirim"}')$$, 'PT403', 'member: saklar → 403');
select uji.galat($$select public.web_wa_pengetahuan_daftar()$$, 'PT403', 'member: pengetahuan → 403');
reset role;
select uji.sama((select saklar from wa.pengaturan), 'mati', 'saklar tetap mati sesudah percobaan member');

-- anon
select uji.jadi_anon();
select uji.galat($$select public.web_wa_ringkas()$$, '42501', 'anon: tidak bisa eksekusi');
reset role;

rollback;
