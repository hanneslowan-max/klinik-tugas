-- 38 · Sinkron dari luar (20261110120000_pipeline_sinkron_luar.sql): SP ERP → ORDER (x_pipeline_order_erp) dan chat WA
-- 0878 → lead otomatis (x_pipeline_lead_otomatis), tautan idempoten pipeline_tautan_luar, audit x_pipeline_tautan.
-- Diuji: skema & hak (tanpa akses tabel, tanpa nomor/nama di tautan), scope & peran (bot/owner ya; rep, token baca tidak),
-- WA: dibuat / sudah_ada (tidak menulis) / lead_terbuka_ada (aktivitas "Chat WA baru" sekali per tanggal) / lead baru
-- bila lead lama tertutup + pelanggan dipakai ulang, bukti sumber, validasi (semua-atau-tidak per item);
-- ERP: dilewati_bukan_online, cocok No SP / HP lead terbuka (utamakan pemilik sales SP) / lead baru (Repeat order /
-- Lainnya, produk dijumlah), sidik sama → tidak_berubah tanpa aktivitas, sidik berubah → hanya kolom berbeda, SP batal →
-- order batal, aktif lagi → 409, batal belum tertaut → dilewati_batal, validasi; batch per item (item gagal dibatalkan
-- sendiri). Aktor: budi 100000001 (owner), citra 100000002 (rep RSG = "Riksa"), dodi 100000003 (rep MCE = "Michael"),
-- eka 900000000001 (tanpa akses), bot 900000000002. Nomor HP fiktif 0811-0003-8xxx.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG'), (100000003, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.pipeline_akses where member_id = 900000000001;
delete from public.pipeline_tautan_luar;   -- DB lokal bisa berisi kiriman uji manual; dibatalkan di akhir berkas
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000381', 900000000002, 'bot tulis (uji 38)', 'rtk_b381', uji.sha('rtk_uji38_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000382', 900000000002, 'bot baca (uji 38)', 'rtk_b382', uji.sha('rtk_uji38_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000383', 100000002, 'citra tulis (uji 38)', 'rtk_b383', uji.sha('rtk_uji38_citra'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000384', 100000001, 'budi tulis (uji 38)', 'rtk_b384', uji.sha('rtk_uji38_budi'), 'tulis');

-- panggil x_ sebagai service_role (Edge) dengan header token; peran dikembalikan sesudahnya
create function pg_temp.erp(p jsonb, p_aktor bigint default 900000000002, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000381')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  v := public.x_pipeline_order_erp(p_aktor, p);
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
create function pg_temp.wa(p jsonb, p_aktor bigint default 900000000002, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000381')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  v := public.x_pipeline_lead_otomatis(p_aktor, p);
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
create function pg_temp.tautan(p jsonb, p_aktor bigint default 900000000002, p_tok uuid default 'b0b0b0b0-0000-4000-8000-000000000382')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform uji.jadi_service(); perform uji.token(p_tok);
  v := public.x_pipeline_tautan(p_aktor, p);
  perform uji.token(null); execute 'reset role';
  return v;
end $$;
create function pg_temp.hari(n int) returns text language sql as $$ select to_char(public.hari_ini_wib() - n, 'YYYY-MM-DD') $$;
create function pg_temp.kunci(p_kode text, n int) returns text language sql as $$ select format('wa:%s:%s', p_kode, pg_temp.hari(n)) $$;
-- SQL untuk uji.galat
create function pg_temp.q_erp(p jsonb) returns text language sql as $$ select format('select pg_temp.erp(%L::jsonb)', p) $$;
create function pg_temp.q_wa(p jsonb) returns text language sql as $$ select format('select pg_temp.wa(%L::jsonb)', p) $$;
-- payload sah
create function pg_temp.sp(p_so text, p_sp text, p_nilai bigint, p_hari int default 0) returns jsonb language sql as $$
  select jsonb_build_object('erp_so_id', p_so, 'no_sp', p_sp, 'tanggal_sp', pg_temp.hari(p_hari), 'nilai', p_nilai)
$$;
create function pg_temp.chat(p_kode text, p_hp text, p_hari int default 0) returns jsonb language sql as $$
  select jsonb_build_object('kunci_luar', pg_temp.kunci(p_kode, p_hari), 'hp', p_hp, 'sumber', 'Meta Ads')
$$;
create function pg_temp.n_akt(p_lead text) returns int language sql as $$ select count(*)::int from public.lead_aktivitas where lead_id = p_lead $$;
create function pg_temp.lead(p_id text) returns public.lead language sql as $$ select l from public.lead l where l.id = p_id $$;
grant execute on all functions in schema pg_temp to public;

-- ------------------------------------------------------------ skema & hak
select uji.cek((select relrowsecurity from pg_class where oid = 'public.pipeline_tautan_luar'::regclass), 'RLS aktif di pipeline_tautan_luar');
select uji.cek(not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r
                            where has_table_privilege(r, 'public.pipeline_tautan_luar', 'SELECT')
                               or has_table_privilege(r, 'public.pipeline_tautan_luar', 'INSERT')),
  'pipeline_tautan_luar tanpa akses langsung role API (hanya lewat fungsi)');
select uji.sama((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
                  where table_schema = 'public' and table_name = 'pipeline_tautan_luar'),
  array['kunci_luar', 'jenis', 'lead_id', 'sidik', 'cara', 'hasil_akhir', 'dibuat_pada', 'diubah_pada'],
  'kolom tautan: tanpa nomor HP / nama pelanggan');
select uji.cek(has_function_privilege('service_role', 'public.x_pipeline_order_erp(bigint, jsonb)', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_pipeline_lead_otomatis(bigint, jsonb)', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_pipeline_tautan(bigint, jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_pipeline_order_erp(bigint, jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.x_pipeline_lead_otomatis(bigint, jsonb)', 'EXECUTE'),
  'x_pipeline_order_erp / _lead_otomatis / _tautan hanya service_role');
select uji.cek(not exists (
  select 1 from unnest(array['public.inti_pipeline_order_erp(jsonb)', 'public.inti_pipeline_lead_otomatis(jsonb)',
                             'public.inti_pipeline_tautan(jsonb)', 'public.pipeline_luar_banyak(jsonb, text)',
                             'public.pipeline_erp_terapkan(text, text, date, bigint, text, boolean, bigint, text)',
                             'public.pipeline_sales_dari_sp(text, text)', 'public.pipeline_luar_teks(jsonb, text, int)',
                             'public.pipeline_luar_hp(jsonb, boolean)', 'public.pipeline_luar_kunci(jsonb, text[], text)',
                             'public.pipeline_produk_baku(text)', 'public.pipeline_sumber_sah()', 'public.pipeline_produk_sah()']::regprocedure[]) f
   where has_function_privilege('service_role', f::oid, 'EXECUTE') or has_function_privilege('authenticated', f::oid, 'EXECUTE')
      or has_function_privilege('anon', f::oid, 'EXECUTE')),
  'inti_/pembantu sinkron internal (tanpa EXECUTE role API)');
select uji.cek((select array_agg(x order by x) from unnest(public.pipeline_sumber_sah()) x)
               = (select array_agg(x order by x) from unnest(array['Google Ads', 'Meta Ads', 'Website organik', 'Instagram/TikTok organik',
                    'WA langsung', 'Telepon', 'Referral', 'Repeat order', 'Lainnya']) x)
  and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'lead_sumber_check') like '%Instagram/TikTok organik%',
  'pipeline_sumber_sah = daftar CHECK lead.sumber');

-- ------------------------------------------------------------ hak panggil
select uji.galat($$select pg_temp.wa(pg_temp.chat('K-hak001', '081100038001'), 900000000002, 'b0b0b0b0-0000-4000-8000-000000000382')$$,
  'PT403', 'lead-otomatis dengan token baca → 403 scope', 'Scope');
select uji.galat($$select pg_temp.erp(pg_temp.sp('hak1', '001/RSG/XI/2026', 1000), 100000002, 'b0b0b0b0-0000-4000-8000-000000000383')$$,
  'PT403', 'order-erp oleh rep (citra, token tulis sendiri) → 403', 'agent atau admin');
select uji.galat($$select pg_temp.wa(pg_temp.chat('K-hak001', '081100038001'), 100000002, 'b0b0b0b0-0000-4000-8000-000000000383')$$,
  'PT403', 'lead-otomatis oleh rep → 403');
select uji.galat($$select pg_temp.tautan('{}', 100000002, 'b0b0b0b0-0000-4000-8000-000000000383')$$,
  'PT403', 'tautan oleh rep → 403');
select uji.sama((select count(*)::int from public.pipeline_tautan_luar), 0, 'panggilan ditolak tidak menulis tautan');

-- ------------------------------------------------------------ WA: lead otomatis dibuat
select uji.simpan('w1', pg_temp.wa(jsonb_build_object(
  'kunci_luar', pg_temp.kunci('K-a1b2c3', 0), 'hp', '+62 811-0003-8001', 'sumber', 'Meta Ads', 'pelanggan', ' PT  Fiktif Satu ',
  'kontak_nama', 'Bu Uji', 'kota', 'Surabaya', 'kebutuhan', 'Pallet mesh untuk gudang', 'pemilik', 100000002,
  'alasan_pemilik', 'balasan', 'sumber_bukti', 'meta', 'sumber_bukti_kode', 'pm-06',
  'chat_pada', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
  'produk', jsonb_build_array(jsonb_build_object('produk', 'pallet mesh', 'qty', 20), jsonb_build_object('produk', 'Roda', 'satuan', 'set')))));
select uji.sama(uji.ambil('w1') ->> 'status', 'dibuat', 'WA baru → status dibuat');
select uji.simpan('w1id', to_jsonb(uji.ambil('w1') ->> 'lead_id'));
select uji.sama((select jsonb_build_object('sumber', l.sumber, 'pemilik', l.pemilik, 'tahap', l.tahap, 'tanggal_masuk', l.tanggal_masuk,
                   'kebutuhan', l.kebutuhan, 'pelanggan', pg.nama, 'kota', pg.kota, 'telepon', k.telepon, 'kontak', k.nama,
                   'bukti', l.sumber_bukti, 'bukti_kode', l.sumber_bukti_kode, 'dibuat_oleh', l.dibuat_oleh)
                   from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id join public.kontak k on k.id = l.kontak_id
                  where l.id = uji.ambil('w1id') #>> '{}'),
  jsonb_build_object('sumber', 'Meta Ads', 'pemilik', 100000002, 'tahap', 'BARU', 'tanggal_masuk', public.hari_ini_wib(),
    'kebutuhan', 'Pallet mesh untuk gudang', 'pelanggan', 'PT Fiktif Satu', 'kota', 'Surabaya', 'telepon', '6281100038001',
    'kontak', 'Bu Uji', 'bukti', 'meta', 'bukti_kode', 'PM-06', 'dibuat_oleh', 900000000002),
  'lead WA: sumber, pemilik, tanggal masuk = tanggal kunci, pelanggan/kontak dirapikan, HP 62…, bukti sumber terisi');
select uji.sama((select jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan, 'spes', i.spesifikasi) order by i.id)
                   from public.lead_item i where i.lead_id = uji.ambil('w1id') #>> '{}'),
  '[{"produk":"Pallet Mesh","qty":20,"satuan":"unit","spes":null},{"produk":"Roda","qty":1,"satuan":"set","spes":"(qty belum pasti)"}]'::jsonb,
  'produk dibakukan; qty kosong → 1 + "(qty belum pasti)"');
select uji.sama((select string_agg(a.jenis || '|' || a.hasil, ' / ') from public.lead_aktivitas a where a.lead_id = uji.ambil('w1id') #>> '{}'),
  'WA|Lead otomatis dari WA 0878 (agent), pemilik: citra lestari (ditebak dari nama sales di balasan)',
  'aktivitas pertama: "Lead otomatis dari WA 0878 (agent), pemilik: <alasan>"');
select uji.sama((select jsonb_build_object('jenis', jenis, 'cara', cara, 'hasil', hasil_akhir) from public.pipeline_tautan_luar
                  where kunci_luar = pg_temp.kunci('K-a1b2c3', 0)),
  '{"jenis":"wa","cara":"baru","hasil":"dibuat"}'::jsonb, 'tautan wa tercatat (cara baru)');

-- kunci sama → sudah_ada, tidak menulis apa pun
select uji.simpan('n1', jsonb_build_array((select count(*) from public.lead), (select count(*) from public.lead_aktivitas),
  (select count(*) from public.pipeline_tautan_luar)));
select uji.simpan('w2', pg_temp.wa(jsonb_build_object('kunci_luar', pg_temp.kunci('K-a1b2c3', 0), 'hp', '081100038999', 'sumber', 'Telepon')));
select uji.sama(uji.ambil('w2') - 'pemilik', jsonb_build_object('status', 'sudah_ada', 'lead_id', uji.ambil('w1id') #>> '{}',
  'kode', uji.ambil('w1') ->> 'kode'), 'kunci_luar sama → sudah_ada + lead yang sama (isi lain diabaikan)');
select uji.sama(jsonb_build_array((select count(*) from public.lead), (select count(*) from public.lead_aktivitas),
  (select count(*) from public.pipeline_tautan_luar)), uji.ambil('n1'), 'sudah_ada tidak menulis lead/aktivitas/tautan');

-- nomor sama, kunci lain (chat besok/kemarin) → lead terbuka ada; aktivitas sekali per tanggal
select uji.simpan('w3', pg_temp.wa(pg_temp.chat('K-a1b2c3', '0811 0003 8001', 1)));
select uji.sama(uji.ambil('w3') - 'pemilik', jsonb_build_object('status', 'lead_terbuka_ada', 'lead_id', uji.ambil('w1id') #>> '{}',
  'kode', uji.ambil('w1') ->> 'kode', 'aktivitas_baru', true), 'nomor punya lead BARU → lead_terbuka_ada, tidak dibuat dobel');
select uji.simpan('w4', pg_temp.wa(pg_temp.chat('K-zz9999', '6281100038001', 1)));
select uji.sama((uji.ambil('w4') ->> 'aktivitas_baru')::boolean, false, 'kunci lain, tanggal sama → aktivitas tidak dobel');
select uji.sama((select count(*)::int from public.lead_aktivitas where lead_id = uji.ambil('w1id') #>> '{}'
                   and jenis = 'WA' and hasil = format('Chat WA baru %s (agent)', to_char(public.hari_ini_wib() - 1, 'DD-MM-YYYY'))),
  1, 'aktivitas "Chat WA baru <DD-MM-YYYY> (agent)" tepat satu');
select uji.sama((select count(*)::int from public.lead l join public.kontak k on k.id = l.kontak_id where k.telepon = '6281100038001'),
  1, 'tetap satu lead untuk nomor itu');

-- lead lama tertutup → lead baru, pelanggan dipakai ulang; pemilik kosong
select uji.konteks('ui', 100000001);
update public.lead set tahap = 'BATAL', alasan_batal = 'Tidak ada respon' where id = uji.ambil('w1id') #>> '{}';
select uji.konteks(null, null);
select uji.simpan('w5', pg_temp.wa(pg_temp.chat('K-a1b2c3', '081100038001', 2) || '{"pelanggan":"Nama Lain"}'));
select uji.sama(uji.ambil('w5') ->> 'status', 'dibuat', 'lead lama BATAL → lead baru dibuat');
select uji.cek((select l.pelanggan_id = (select pelanggan_id from public.lead where id = uji.ambil('w1id') #>> '{}')
                       and l.pemilik is null and l.tanggal_masuk = public.hari_ini_wib() - 2
                  from public.lead l where l.id = uji.ambil('w5') ->> 'lead_id'),
  'lead baru memakai pelanggan lama bernomor sama (nama kiriman diabaikan), pemilik kosong, tanggal masuk dari kunci');
select uji.sama((select hasil from public.lead_aktivitas where lead_id = uji.ambil('w5') ->> 'lead_id'),
  'Lead otomatis dari WA 0878 (agent), pemilik: belum ditentukan', 'pemilik null → "belum ditentukan"');
select uji.cek((select l.sumber_bukti is null from public.lead l where l.id = uji.ambil('w5') ->> 'lead_id'), 'tanpa sumber_bukti → kolom bukti kosong');

-- pemilik giliran / pelanggan_lama; owner boleh memanggil
select uji.simpan('w6', pg_temp.wa(pg_temp.chat('K-b00001', '081100038002') || '{"pemilik":"100000003","alasan_pemilik":"giliran","pelanggan":""}',
  100000001, 'b0b0b0b0-0000-4000-8000-000000000384'));
select uji.cek((select l.pemilik = 100000003 and pg.nama = '-' from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id
                 where l.id = uji.ambil('w6') ->> 'lead_id')
  and (select hasil like '%pemilik: dodi pratama (bergiliran)' from public.lead_aktivitas where lead_id = uji.ambil('w6') ->> 'lead_id'),
  'owner boleh; pemilik id teks diterima; pelanggan kosong → "-"; label giliran');

-- validasi WA (tidak ada yang ditulis)
select uji.simpan('n2', jsonb_build_array((select count(*) from public.lead), (select count(*) from public.pipeline_tautan_luar)));
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v1', '081100038010')), 'PT400', 'kode chat terlalu pendek → 400', 'kunci_luar wajib');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010', -1)), 'PT400', 'tanggal kunci besok → 400', 'masa depan');
select uji.galat(pg_temp.q_wa(jsonb_build_object('kunci_luar', 'wa:K-v00001:2026-13-01', 'hp', '081100038010', 'sumber', 'Meta Ads')),
  'PT400', 'tanggal kunci tidak valid → 400', 'tidak valid');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '0811')), 'PT400', 'hp terlalu pendek → 400', 'hp tidak sah');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') - 'hp'), 'PT400', 'hp kosong → 400', 'hp wajib');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"sumber":"Instagram"}'), 'PT400', 'sumber tidak sah → 400', 'sumber wajib');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"produk":[{"produk":"Kursi"}]}'), 'PT400', 'produk di luar PRODUK → 400', 'produk[0]');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"produk":[{"produk":"Roda","qty":0}]}'), 'PT400', 'qty 0 → 400', 'qty harus > 0');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"produk":[{"produk":"Roda","satuan":"kg"}]}'), 'PT400', 'satuan tidak sah → 400', 'satuan');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"pemilik":900000000001,"alasan_pemilik":"giliran"}'),
  'PT400', 'pemilik tanpa akses Pipeline (eka) → 400', 'sales aktif');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"pemilik":900000000002,"alasan_pemilik":"giliran"}'),
  'PT400', 'pemilik bot → 400', 'sales aktif');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"pemilik":100000002}'), 'PT400', 'pemilik tanpa alasan → 400', 'alasan_pemilik wajib');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"alasan_pemilik":"giliran"}'), 'PT400', 'alasan tanpa pemilik → 400', 'hanya bersama');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"pemilik":100000002,"alasan_pemilik":"tebak"}'), 'PT400', 'alasan tidak sah → 400', 'alasan_pemilik harus');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"telepon":"0811"}'), 'PT400', 'kunci tidak dikenal → 400', 'kunci tidak dikenal: telepon');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"kebutuhan":12}'), 'PT400', 'kebutuhan bukan teks → 400', 'harus teks');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || jsonb_build_object('kebutuhan', repeat('x', 501))), 'PT400', 'kebutuhan > 500 → 400', 'maksimal 500');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"sumber_bukti_kode":"PM-06"}'), 'PT400', 'kode bukti tanpa kelas → 400', 'hanya bersama sumber_bukti');
select uji.galat(pg_temp.q_wa(pg_temp.chat('K-v00001', '081100038010') || '{"sumber_bukti":"meta","sumber_bukti_kode":"GA-OY-7K3F"}'),
  'PT400', 'kode bukti tidak cocok kelas (aturan x_pipeline_sumber_bukti_set) → 400 dan lead tidak tertinggal', 'kelas meta');
select uji.sama(jsonb_build_array((select count(*) from public.lead), (select count(*) from public.pipeline_tautan_luar)), uji.ambil('n2'),
  'semua kiriman WA tidak sah: tidak ada lead/tautan tertulis');

-- ------------------------------------------------------------ WA batch: per item
select uji.simpan('wb', pg_temp.wa(jsonb_build_object('items', jsonb_build_array(
  pg_temp.chat('K-c00001', '081100038020'),
  pg_temp.chat('K-c00002', '081100038021') || '{"produk":[{"produk":"Kursi"}]}',
  pg_temp.chat('K-c00001', '081100038020')))));
select uji.sama(uji.ambil('wb') - 'items', '{"diproses":3,"ok":2,"gagal":1,"per_status":{"dibuat":1,"gagal":1,"sudah_ada":1}}'::jsonb,
  'batch: ringkasan diproses/ok/gagal/per_status');
select uji.sama((select jsonb_agg(jsonb_build_object('i', e ->> 'i', 'ok', e -> 'ok', 's', coalesce(e ->> 'status', e ->> 'status_http'))
                   order by (e ->> 'i')::int) from jsonb_array_elements(uji.ambil('wb') -> 'items') e),
  '[{"i":"0","ok":true,"s":"dibuat"},{"i":"1","ok":false,"s":"400"},{"i":"2","ok":true,"s":"sudah_ada"}]'::jsonb,
  'batch: hasil per item urut; item ganda dalam satu panggilan → sudah_ada');
select uji.cek((uji.ambil('wb') #>> '{items,1,err}') like 'items[1]: produk[0]%' and uji.ambil('wb') #>> '{items,1,ECODE}' = 'INPUT_001',
  'item gagal: err menyebut items[i] + ECODE');
select uji.sama((select count(*)::int from public.lead l join public.kontak k on k.id = l.kontak_id where k.telepon = '6281100038021'), 0,
  'item gagal dibatalkan sendiri (tidak ada lead/kontak tertinggal)');
select uji.galat(pg_temp.q_wa('{"items":[]}'), 'PT400', 'batch kosong → 400', 'minimal 1');
select uji.galat(pg_temp.q_wa(jsonb_build_object('items', (select jsonb_agg(pg_temp.chat('K-d' || lpad(g::text, 5, '0'), '081100038030')) from generate_series(1, 101) g))),
  'PT400', 'batch > 100 → 400', 'Maksimal 100');
select uji.galat(pg_temp.q_wa('{"items":[{}],"dry":true}'), 'PT400', 'kunci lain di amplop batch → 400', 'kunci tidak dikenal: dry');

-- ------------------------------------------------------------ ERP: data awal
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujierp1', 'PT Uji ERP', 'Jakarta'), ('plujierp2', 'CV Uji Lama', 'Bekasi');
insert into public.kontak (id, pelanggan_id, telepon, telepon_tampil) values
  ('ktujierp1', 'plujierp1', '6281100038101', '0811-0003-8101'),
  ('ktujierp2', 'plujierp2', '6281100038102', '0811-0003-8102'),
  ('ktujierp3', 'plujierp2', '6281100038103', '0811-0003-8103');
insert into public.lead (id, pelanggan_id, kontak_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi, fu_berikutnya) values
  -- sales sudah mengisi SP 0901/RSG di Anvil (kasus a)
  ('ldujierp1', 'plujierp1', 'ktujierp1', 'WA langsung', 100000002, 'ORDER', public.hari_ini_wib() - 10, '0901/RSG/XI/2026', public.hari_ini_wib() - 3, 5000000, null),
  -- dua lead terbuka bernomor 8102: milik dodi (lebih baru) & citra (lebih lama) → SP citra memilih milik citra (kasus b)
  ('ldujierp2', 'plujierp2', 'ktujierp2', 'Meta Ads', 100000002, 'PENAWARAN', public.hari_ini_wib() - 9, null, null, null, public.hari_ini_wib() + 2),
  ('ldujierp3', 'plujierp2', 'ktujierp2', 'Google Ads', 100000003, 'BARU', public.hari_ini_wib() - 2, null, null, null, null),
  -- nomor 8103: lead terbuka TANPA pemilik → diambil sales SP
  ('ldujierp4', 'plujierp2', 'ktujierp3', 'Referral', null, 'BARU', public.hari_ini_wib() - 5, null, null, null, null),
  -- nomor 8101 pernah ORDER (ldujierp1) → SP baru tanpa lead terbuka = "Repeat order"
  ('ldujierp5', 'plujierp1', 'ktujierp1', 'Telepon', 100000002, 'BATAL', public.hari_ini_wib() - 30, null, null, null, null);
update public.lead set alasan_batal = 'Harga' where id = 'ldujierp5';
insert into public.lead_item (lead_id, produk, qty) values ('ldujierp1', 'Roda', 8), ('ldujierp2', 'Pallet Mesh', 20),
  ('ldujierp3', 'Roda', 4), ('ldujierp4', 'Locker', 2), ('ldujierp5', 'Roda', 1);
select uji.konteks(null, null);

-- ------------------------------------------------------------ ERP: sales lain dilewati
select uji.simpan('n3', jsonb_build_array((select count(*) from public.lead), (select count(*) from public.lead_aktivitas),
  (select count(*) from public.pipeline_tautan_luar)));
select uji.sama(pg_temp.erp(pg_temp.sp('so-x1', '0007/XYZ/XI/2026', 900000) || '{"sales":"Citra","hp":"081100038102"}'),
  '{"status":"dilewati_bukan_online","lead_id":null,"kode":null}'::jsonb,
  'kode SP sales lain (XYZ) → dilewati_bukan_online walau nama/HP cocok tim online');
select uji.sama(pg_temp.erp(pg_temp.sp('so-x2', 'SP-77', 900000) || '{"sales":"Budi"}') ->> 'status', 'dilewati_bukan_online',
  'No SP tanpa kode + nama sales bukan tim online → dilewati');
select uji.sama(pg_temp.erp(pg_temp.sp('so-x3', '0008/xyz/xi/2026', 0) || '{"batal":true}') ->> 'status', 'dilewati_bukan_online',
  'SP batal sales lain → dilewati');
select uji.sama(jsonb_build_array((select count(*) from public.lead), (select count(*) from public.lead_aktivitas),
  (select count(*) from public.pipeline_tautan_luar)), uji.ambil('n3'), 'dilewati: tidak menulis apa pun');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-x4', 'SP-77', 900000) || '{"sales":"citra"}'), 'PT400',
  'No SP tanpa kode + nama sales tim online → No SP wajib berpola (400)', 'No SP tidak sesuai pola');

-- ------------------------------------------------------------ ERP (a): No SP sama dengan lead Anvil
select uji.simpan('e1', pg_temp.erp(pg_temp.sp('so-a1', ' 0901/rsg/xi/2026 ', 5000000, 3)));
select uji.sama(uji.ambil('e1'), '{"status":"tidak_berubah","lead_id":"ldujierp1","kode":null,"cara":"no_sp"}'::jsonb
  || jsonb_build_object('kode', (select kode from public.lead where id = 'ldujierp1')),
  '(a) No SP sama + data sama → tertaut, tidak_berubah');
select uji.sama(pg_temp.n_akt('ldujierp1'), 0, '(a) data sama → tanpa aktivitas');
select uji.simpan('e1b', pg_temp.erp(pg_temp.sp('so-a1', '0901/RSG/XI/2026', 5000000, 3)));
select uji.sama(uji.ambil('e1b') ->> 'status', 'tidak_berubah', 'kirim ulang (sidik sama) → tidak_berubah');
select uji.simpan('e1c', pg_temp.erp(pg_temp.sp('so-a1', '0901/RSG/XI/2026', 5500000, 3) || '{"no_po":"PO-UJI-1"}'));
select uji.sama(uji.ambil('e1c') ->> 'status', 'diperbarui', 'nilai + No PO berubah di ERP → diperbarui');
select uji.cek((select nilai_transaksi = 5500000 and no_po = 'PO-UJI-1' and tahap = 'ORDER' from public.lead where id = 'ldujierp1'),
  'lead: nilai & No PO mengikuti ERP');
select uji.sama((select string_agg(hasil, ' / ') from public.lead_aktivitas where lead_id = 'ldujierp1'),
  'Data order diubah: Nominal Rp5.000.000 → Rp5.500.000; No PO — → PO-UJI-1', 'satu aktivitas "Data order diubah" (jalur inti_pipeline_order_ubah)');
select uji.simpan('e1d', pg_temp.erp(pg_temp.sp('so-a1', '0901/RSG/XI/2026', 5500000, 3) || '{"no_po":"PO-UJI-1"}'));
select uji.cek(uji.ambil('e1d') ->> 'status' = 'tidak_berubah' and pg_temp.n_akt('ldujierp1') = 1, 'kirim ulang → tidak dobel aktivitas');
select uji.simpan('e1e', pg_temp.erp(pg_temp.sp('so-a1', '0901/RSG/XI/2026', 5500000, 3)));
select uji.cek(uji.ambil('e1e') ->> 'status' = 'tidak_berubah' and (select no_po from public.lead where id = 'ldujierp1') = 'PO-UJI-1',
  'No PO kosong di ERP → No PO Anvil tidak dihapus (sidik berubah, lead tidak)');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-a2', '0901/RSG/XI/2026', 5500000, 3)), 'PT409', 'No SP sama dari SP ERP lain → 409', 'tertaut ke SP ERP lain');

-- ------------------------------------------------------------ ERP (b): lead terbuka bernomor sama
select uji.simpan('e2', pg_temp.erp(pg_temp.sp('so-b1', '0010/RSG/XI/2026', 12500000, 1) || '{"hp":"0811-0003-8102","sales":"Michael"}'));
select uji.sama(uji.ambil('e2') - 'kode', '{"status":"diperbarui","lead_id":"ldujierp2","cara":"hp"}'::jsonb,
  '(b) dua lead terbuka bernomor sama → pilih milik sales SP (kode RSG = citra) walau lead dodi lebih baru');
select uji.cek((select tahap = 'ORDER' and no_sp = '0010/RSG/XI/2026' and tanggal_sp = public.hari_ini_wib() - 1 and nilai_transaksi = 12500000
                       and pemilik = 100000002 and bayar_status = 'BELUM' and fu_berikutnya = public.hari_ini_wib() + 2
                  from public.lead where id = 'ldujierp2'),
  '(b) lead jadi ORDER: No SP/tanggal/nilai dari ERP, bayar BELUM, rencana FU dipertahankan');
select uji.sama((select hasil from public.lead_aktivitas where lead_id = 'ldujierp2'),
  format('SP 0010/RSG/XI/2026 dari ERP (otomatis): Rp12.500.000, tanggal SP %s; dicocokkan dengan lead terbuka bernomor WA sama',
         to_char(public.hari_ini_wib() - 1, 'DD-MM-YYYY')), '(b) aktivitas "SP <no_sp> dari ERP (otomatis)"');
select uji.sama((select tahap from public.lead where id = 'ldujierp3'), 'BARU', '(b) lead lain bernomor sama tidak disentuh');

select uji.simpan('e3', pg_temp.erp(pg_temp.sp('so-b2', '0011/MCE/XI/2026', 750000) || '{"hp":"081100038103"}'));
select uji.cek(uji.ambil('e3') ->> 'lead_id' = 'ldujierp4'
  and (select pemilik = 100000003 and tahap = 'ORDER' from public.lead where id = 'ldujierp4')
  and (select count(*) = 1 from public.lead_riwayat_pemilik where lead_id = 'ldujierp4' and dari is null and ke = 100000003 and oleh = 900000000002),
  '(b) lead terbuka tanpa pemilik → pemilik = sales SP (MCE = dodi), tercatat di riwayat pemilik');

-- ------------------------------------------------------------ ERP (c): lead baru
select uji.simpan('e4', pg_temp.erp(pg_temp.sp('so-c1', '0012/RSG/XI/2026', 3000000, 4) || jsonb_build_object(
  'hp', '081100038101', 'pelanggan', 'Diabaikan', 'items', jsonb_build_array(
    jsonb_build_object('deskripsi', 'Roda PU 4 inch', 'qty', 4, 'jenis', 'roda'),
    jsonb_build_object('deskripsi', 'Roda  PU 5 inch', 'qty', '2', 'produk', 'RODA'),
    jsonb_build_object('deskripsi', 'Ongkir', 'qty', 1, 'jenis', 'Jasa'),
    jsonb_build_object('deskripsi', 'Baris nol', 'qty', 0, 'jenis', 'Roda')), 'produk', jsonb_build_array('Roda', 'Locker'))));
select uji.sama(uji.ambil('e4') ->> 'status', 'dibuat', '(c) tanpa lead terbuka → lead baru dibuat');
select uji.cek((select l.sumber = 'Repeat order' and l.pelanggan_id = 'plujierp1' and l.kontak_id = 'ktujierp1' and l.pemilik = 100000002
                       and l.tahap = 'ORDER' and l.tanggal_masuk = public.hari_ini_wib() - 4 and not l.periksa
                  from public.lead l where l.id = uji.ambil('e4') ->> 'lead_id'),
  '(c) nomor pernah ORDER → sumber Repeat order; pelanggan & kontak lama dipakai; pemilik sales SP; tanggal masuk = tanggal SP');
select uji.sama((select jsonb_agg(jsonb_build_object('p', produk, 'q', qty, 's', spesifikasi) order by id) from public.lead_item
                  where lead_id = uji.ambil('e4') ->> 'lead_id'),
  '[{"p":"Roda","q":6,"s":"Roda PU 4 inch; Roda PU 5 inch"},{"p":"Lainnya","q":1,"s":"Ongkir"}]'::jsonb,
  '(c) produk: item.produk / item.jenis → kategori (produk atas >1 → Lainnya), qty dijumlah, baris qty 0 dilewati');
select uji.cek((select hasil like 'SP 0012/RSG/XI/2026 dari ERP (otomatis): Rp3.000.000, tanggal SP %; lead dibuat otomatis%'
                  from public.lead_aktivitas where lead_id = uji.ambil('e4') ->> 'lead_id'), '(c) aktivitas SP dari ERP');

select uji.simpan('e5', pg_temp.erp(pg_temp.sp('so-c2', '0013/MCE/XI/2026', 400000) || '{"hp":"081100038199","pelanggan":"PT Baru Fiktif","kota":"Medan"}'));
select uji.cek((select l.sumber = 'Lainnya' and pg.nama = 'PT Baru Fiktif' and pg.kota = 'Medan' and k.telepon = '6281100038199'
                       and l.pemilik = 100000003 and (select count(*) from public.lead_item i where i.lead_id = l.id) = 1
                  from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id join public.kontak k on k.id = l.kontak_id
                 where l.id = uji.ambil('e5') ->> 'lead_id'),
  '(c) nomor baru → sumber Lainnya, pelanggan baru, satu produk pengganti (Lainnya)');
select uji.simpan('e6', pg_temp.erp(pg_temp.sp('so-c3', '0014/RSG/XI/2026', 100000) || '{"sales":"riksa"}'));
select uji.cek(uji.ambil('e6') ->> 'status' = 'dibuat'
  and (select l.kontak_id is null and pg.nama = '-' from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id where l.id = uji.ambil('e6') ->> 'lead_id'),
  '(c) tanpa HP & pelanggan → lead tanpa kontak, pelanggan "-"');

-- ------------------------------------------------------------ ERP: pembaruan, nomor dibetulkan, batal
select uji.simpan('e7', pg_temp.erp(pg_temp.sp('so-b1', '0015/RSG/XI/2026', 12500000, 1) || '{"hp":"081100038102"}'));
select uji.cek(uji.ambil('e7') ->> 'status' = 'diperbarui' and (select no_sp from public.lead where id = 'ldujierp2') = '0015/RSG/XI/2026',
  'No SP dibetulkan di ERP → No SP lead tertaut ikut berubah');
select uji.simpan('e8', pg_temp.erp(pg_temp.sp('so-b1', '0015/RSG/XI/2026', 12500000, 1) || '{"batal":true}'));
select uji.cek(uji.ambil('e8') ->> 'status' = 'diperbarui'
  and (select tahap = 'BATAL' and alasan_batal = 'Order dibatalkan' and alasan_batal_lain = 'SP 0015/RSG/XI/2026 dibatalkan di ERP (sinkron otomatis)'
              and no_sp = '0015/RSG/XI/2026' and nilai_transaksi = 12500000 from public.lead where id = 'ldujierp2'),
  'SP batal di ERP → order batal di Anvil (alasan tertulis, data order dipertahankan)');
select uji.simpan('n4', to_jsonb(pg_temp.n_akt('ldujierp2')));
select uji.cek(pg_temp.erp(pg_temp.sp('so-b1', '0015/RSG/XI/2026', 12500000, 1) || '{"batal":true}') ->> 'status' = 'tidak_berubah'
  and pg_temp.n_akt('ldujierp2') = (uji.ambil('n4') #>> '{}')::int, 'batal dikirim ulang → tidak_berubah');
select uji.cek(pg_temp.erp(pg_temp.sp('so-b1', '0015/RSG/XI/2026', 9000000, 1) || '{"batal":true}') ->> 'status' = 'tidak_berubah'
  and (select nilai_transaksi from public.lead where id = 'ldujierp2') = 12500000, 'SP batal yang nilainya berubah → order batal tidak diubah');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-b1', '0015/RSG/XI/2026', 12500000, 1)), 'PT409', 'SP aktif lagi sesudah order batal (final) → 409',
  'periksa manual');
select uji.sama(pg_temp.erp(pg_temp.sp('so-d1', '0016/RSG/XI/2026', 100000) || '{"batal":true,"hp":"081100038188"}'),
  '{"status":"dilewati_batal","lead_id":null,"kode":null}'::jsonb, 'SP batal yang belum pernah tertaut → dilewati_batal (tidak menulis)');
select uji.cek(not exists (select 1 from public.pipeline_tautan_luar where kunci_luar = 'erp-sp:so-d1')
  and not exists (select 1 from public.kontak where telepon = '6281100038188'), 'dilewati_batal: tanpa tautan & lead');

-- ------------------------------------------------------------ ERP: validasi
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) - 'erp_so_id'), 'PT400', 'erp_so_id kosong → 400', 'erp_so_id wajib');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so v1', '0020/RSG/XI/2026', 100000)), 'PT400', 'erp_so_id berspasi → 400', 'erp_so_id tidak sah');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) - 'no_sp'), 'PT400', 'no_sp kosong → 400', 'no_sp wajib');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/13/2026', 100000)), 'PT400', 'no_sp tim online tidak berpola → 400', 'tidak sesuai pola');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000, -1)), 'PT400', 'tanggal SP besok → 400', 'masa depan');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"tanggal_sp":"10-11-2026"}'), 'PT400', 'tanggal bukan ISO → 400', 'YYYY-MM-DD');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 0)), 'PT400', 'nilai 0 untuk SP aktif → 400', 'nilai wajib > 0');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"nilai":-5}'), 'PT400', 'nilai negatif → 400', 'nilai wajib');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"batal":"ya"}'), 'PT400', 'batal bukan boolean → 400', 'batal harus');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"produk":"Kursi"}'), 'PT400', 'produk di luar PRODUK → 400', 'produk tidak dikenal');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"items":[{"qty":"dua"}]}'), 'PT400', 'qty item bukan angka → 400', 'items[0]: qty');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"items":[{"harga":1}]}'), 'PT400', 'kunci item tidak dikenal → 400', 'items[0]: kunci tidak dikenal');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"diskon":1}'), 'PT400', 'kunci SP tidak dikenal → 400', 'kunci tidak dikenal: diskon');
select uji.galat(pg_temp.q_erp(pg_temp.sp('so-v1', '0020/RSG/XI/2026', 100000) || '{"hp":"12"}'), 'PT400', 'hp tidak sah → 400', 'hp tidak sah');
select uji.cek(not exists (select 1 from public.pipeline_tautan_luar where kunci_luar = 'erp-sp:so-v1'), 'validasi gagal: tanpa tautan');

-- ------------------------------------------------------------ ERP batch (field `items` SP ≠ amplop batch)
select uji.simpan('eb', pg_temp.erp(jsonb_build_object('items', jsonb_build_array(
  pg_temp.sp('so-c3', '0014/RSG/XI/2026', 100000) || '{"sales":"riksa"}',
  pg_temp.sp('so-e2', '0021/MCE/XI/2026', 200000) || '{"items":[{"deskripsi":"Locker 6 pintu","qty":2,"jenis":"Locker"}]}',
  pg_temp.sp('so-e3', '0022/RSG/XI/2026', 0),
  pg_temp.sp('so-e4', '0023/ABC/XI/2026', 1)))));
select uji.sama(uji.ambil('eb') -> 'per_status', '{"dibuat":1,"gagal":1,"tidak_berubah":1,"dilewati_bukan_online":1}'::jsonb,
  'batch ERP: per_status');
select uji.cek((select produk = 'Locker' and qty = 2 from public.lead_item where lead_id = uji.ambil('eb') #>> '{items,1,lead_id}'),
  'batch ERP: `items` di dalam SP tetap dibaca sebagai baris barang');
select uji.cek(not exists (select 1 from public.pipeline_tautan_luar where kunci_luar = 'erp-sp:so-e3'), 'batch ERP: item gagal tidak menulis');

-- ------------------------------------------------------------ audit tautan
select uji.simpan('t1', pg_temp.tautan('{}'));
select uji.sama((uji.ambil('t1') ->> 'total')::int, (select count(*)::int from public.pipeline_tautan_luar), 'tautan: total = semua tautan 7 hari');
select uji.sama((select array_agg(k order by k) from jsonb_object_keys(uji.ambil('t1') #> '{items,0}') k),
  array['cara', 'dibuat_pada', 'diubah_pada', 'hasil_akhir', 'jenis', 'kode', 'kunci_luar', 'lead_id', 'no_sp', 'pemilik', 'pemilik_nama', 'tahap'],
  'tautan: bentuk item (tanpa nomor HP / nama pelanggan)');
select uji.cek(not (uji.ambil('t1')::text ~ '62811000381'), 'tautan: nomor HP tidak muncul di hasil');
select uji.sama((pg_temp.tautan('{"jenis":"wa"}') ->> 'total')::int, (select count(*)::int from public.pipeline_tautan_luar where jenis = 'wa'),
  'tautan: saring jenis wa');
select uji.sama(jsonb_array_length(pg_temp.tautan('{"batas":"2"}') -> 'items'), 2, 'tautan: batas');
select uji.sama((pg_temp.tautan(jsonb_build_object('sejak', pg_temp.hari(-1))) ->> 'total')::int, 0, 'tautan: sejak besok → 0');
select uji.galat($$select pg_temp.tautan('{"jenis":"sms"}')$$, 'PT400', 'tautan: jenis tidak sah → 400');
select uji.galat($$select pg_temp.tautan('{"sejak":"kemarin"}')$$, 'PT400', 'tautan: sejak tidak sah → 400');
select uji.galat($$select pg_temp.tautan('{"batas":5000}')$$, 'PT400', 'tautan: batas > 1000 → 400');
select uji.galat($$select pg_temp.tautan('{"q":"x"}')$$, 'PT400', 'tautan: parameter tidak dikenal → 400');

rollback;
