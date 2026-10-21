-- 30 · Pipeline: bukti sumber lead dari chat WA (20261021120000_pipeline_sumber_bukti, Kapso Fase 1, ACC Hannes 21 Okt).
-- x_pipeline_sumber_bukti_set (scope tulis, aktor ber-peran Pipeline 'admin': owner/bot/admin) menulis 4 kolom bukti
-- tanpa menyentuh `sumber` atau kolom lain; idempoten; semua-atau-tidak; validasi kelas/kode/waktu/lead. Jalur tulis
-- sales/web tidak bisa mengubah kolom bukti (diabaikan, hak tabel, penjaga trigger). Fungsi baca detail & daftar memuat
-- 4 field baru, bentuk lain tetap. Aktor: budi (owner), citra (rep RSG, pemilik lead uji), dodi (baca), eka (tanpa
-- akses), bot 900000000002.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG'), (100000003, 'baca', null)
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.pipeline_akses where member_id = 900000000001;   -- eka: tanpa akses Pipeline
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000001', 900000000002, 'bot tulis (uji 30)', 'rtk_b301', uji.sha('rtk_uji30_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000002', 900000000002, 'bot baca (uji 30)', 'rtk_b302', uji.sha('rtk_uji30_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000003', 100000002, 'citra tulis (uji 30)', 'rtk_b303', uji.sha('rtk_uji30_citra'), 'tulis');

select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujibkt1', 'PT Uji Bukti Sumber', 'Sidoarjo');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi, catatan, fu_berikutnya) values
  ('ldujibkt1', 'plujibkt1', 'WA langsung', 100000002, 'BARU', null, null, null, 'catatan sales', '2026-10-23'),
  ('ldujibkt2', 'plujibkt1', 'Google Ads', 100000002, 'PENAWARAN', null, null, null, null, null),
  ('ldujibkt3', 'plujibkt1', 'Website organik', 100000002, 'ORDER', '9801/RSG/X/2026', '2026-10-05', 4000000, null, null),
  ('ldujibkt4', 'plujibkt1', 'Referral', null, 'BARU', null, null, null, null, null);
insert into public.lead_item (lead_id, produk, qty) values ('ldujibkt1', 'Roda', 4), ('ldujibkt2', 'Pallet Mesh', 20),
  ('ldujibkt3', 'Roda', 8), ('ldujibkt4', 'Locker', 2);
insert into public.lead_aktivitas (lead_id, jenis, hasil, rencana_berikutnya, oleh, waktu) values
  ('ldujibkt1', 'WA', 'tanya harga', '2026-10-23', 100000002, now() - interval '3 days');
select uji.konteks(null, null);
-- diperbarui_pada lama (≠ now() transaksi ini) supaya terlihat bila fungsi bukti ikut menyentuhnya
alter table public.lead disable trigger pipeline_lead_sebelum;
update public.lead set diperbarui_pada = timestamptz '2026-10-01 09:00+07' where id like 'ldujibkt%';
alter table public.lead enable trigger pipeline_lead_sebelum;

-- isi lead di luar 4 kolom bukti (termasuk sumber, diperbarui_pada, diam_sejak, fu_berikutnya, cari)
create function pg_temp.sisa(p_id text) returns jsonb language sql as $$
  select to_jsonb(l) - array['sumber_bukti', 'sumber_bukti_kode', 'sumber_bukti_chat_pada', 'sumber_bukti_diisi_pada']
    from public.lead l where l.id = p_id
$$;
create function pg_temp.bukti(p_id text) returns jsonb language sql as $$
  select jsonb_build_object('bukti', l.sumber_bukti, 'kode', l.sumber_bukti_kode,
    'chat_pada', public.iso_utc(l.sumber_bukti_chat_pada), 'diisi_pada', public.iso_utc(l.sumber_bukti_diisi_pada))
    from public.lead l where l.id = p_id
$$;
create function pg_temp.jejak() returns jsonb language sql as $$
  select jsonb_build_array((select count(*) from public.lead_aktivitas), (select count(*) from public.lead_riwayat_tahap),
    (select jsonb_agg(to_jsonb(l) order by l.id) from public.lead l where l.id like 'ldujibkt%'))
$$;
-- panggil fungsi bukti sebagai service_role (Edge), aktor & token tertentu; hasil disimpan ke uji.hasil
create function pg_temp.set_sql(p_aktor bigint, p jsonb) returns text language sql as $$
  select format('select public.x_pipeline_sumber_bukti_set(%s, %L::jsonb)', p_aktor, p)
$$;
grant execute on function pg_temp.set_sql(bigint, jsonb) to public;
select uji.simpan('sisa1', pg_temp.sisa('ldujibkt1'));
select uji.simpan('sisa2', pg_temp.sisa('ldujibkt2'));
select uji.simpan('n0', jsonb_build_object('akt', (select count(*) from public.lead_aktivitas), 'rt', (select count(*) from public.lead_riwayat_tahap)));

-- ------------------------------------------------------------ skema & hak
select uji.sama((select array_agg(column_name::text || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-') order by column_name)
                   from information_schema.columns
                  where table_schema = 'public' and table_name = 'lead' and column_name like 'sumber\_bukti%'),
  array['sumber_bukti:text:YES:-', 'sumber_bukti_chat_pada:timestamp with time zone:YES:-',
        'sumber_bukti_diisi_pada:timestamp with time zone:YES:-', 'sumber_bukti_kode:text:YES:-'],
  '4 kolom bukti di lead: nullable, tanpa default (null)');
select uji.cek((select count(*) = 0 from public.lead where sumber_bukti is not null or sumber_bukti_kode is not null
                  or sumber_bukti_chat_pada is not null or sumber_bukti_diisi_pada is not null),
  'lead lama/baru tanpa bukti: semua kolom bukti null');
select uji.sama(public.pipeline_sumber_bukti_kelas(),
  array['situs-rh', 'situs-oy', 'web-rh', 'ga-rh', 'web-oy', 'ga-oy', 'meta', 'lastri', 'katalog-wa', 'xs-pm', 'tidur', 'tanpa-sinyal'],
  'allowlist kelas bukti (satu tempat: pipeline_sumber_bukti_kelas) = keluaran kapso-catat.py');
select uji.cek(has_function_privilege('service_role', 'public.x_pipeline_sumber_bukti_set(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.x_pipeline_sumber_bukti_set(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.x_pipeline_sumber_bukti_set(bigint, jsonb)', 'EXECUTE'),
  'x_pipeline_sumber_bukti_set: hanya service_role');
select uji.cek(not exists (
  select 1 from unnest(array['public.inti_pipeline_sumber_bukti_set(jsonb)', 'public.pipeline_sumber_bukti_kelas()',
                             'public.pipeline_lead_sumber_bukti()']::regprocedure[]) f
   where has_function_privilege('service_role', f::oid, 'EXECUTE') or has_function_privilege('authenticated', f::oid, 'EXECUTE')
      or has_function_privilege('anon', f::oid, 'EXECUTE')),
  'inti_, daftar kelas, dan fungsi trigger bukti internal (tanpa EXECUTE role API)');
select uji.cek((select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""']
                  from pg_proc p where p.oid = 'public.x_pipeline_sumber_bukti_set(bigint, jsonb)'::regprocedure),
  'x_pipeline_sumber_bukti_set: SECURITY DEFINER + search_path kosong');
select uji.cek(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'web\_%bukti%'),
  'tidak ada web_* untuk bukti (sales tidak mengisi bukti)');

-- ------------------------------------------------------------ jalur sah: bot (routine) lewat Edge, token tulis
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000001');
select uji.simpan('s1', public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[
  {"lead_id":"ldujibkt1","bukti":"situs-rh","kode":null,"chat_pada":"2026-10-16T10:32:00+07:00"},
  {"lead_id":"ldujibkt2","bukti":"ga-oy","kode":" ga-oy-7k3f ","chat_pada":"2026-10-15T01:05:00Z"}]}'));
reset role;
select uji.token(null);
select uji.sama(uji.ambil('s1'),
  '{"diproses":2,"diubah":2,"sama":0,"items":[{"lead_id":"ldujibkt1","ok":true,"diubah":true},{"lead_id":"ldujibkt2","ok":true,"diubah":true}]}'::jsonb,
  'set 2 lead: hasil per item {lead_id, ok, diubah} + hitungan');
select uji.sama(pg_temp.bukti('ldujibkt1'),
  jsonb_build_object('bukti', 'situs-rh', 'kode', null, 'chat_pada', '2026-10-16T03:32:00.000Z', 'diisi_pada', public.iso_utc(now())),
  'lead 1: kelas, kode null, chat_pada (+07:00 → UTC), diisi_pada = now()');
select uji.sama(pg_temp.bukti('ldujibkt2') - 'diisi_pada',
  '{"bukti":"ga-oy","kode":"GA-OY-7K3F","chat_pada":"2026-10-15T01:05:00.000Z"}'::jsonb,
  'lead 2: kode dirapikan (trim + huruf besar)');
select uji.sama(pg_temp.sisa('ldujibkt1'), uji.ambil('sisa1'),
  'lead 1: sumber "WA langsung" & semua kolom lain (diperbarui_pada, diam_sejak, fu_berikutnya, catatan) tidak berubah');
select uji.sama(pg_temp.sisa('ldujibkt2'), uji.ambil('sisa2'), 'lead 2: sumber "Google Ads" & kolom lain tidak berubah');
select uji.sama(jsonb_build_object('akt', (select count(*) from public.lead_aktivitas), 'rt', (select count(*) from public.lead_riwayat_tahap)),
  uji.ambil('n0'), 'tanpa baris lead_aktivitas / riwayat tahap (riwayat sales tidak dibanjiri)');
select uji.sama(coalesce(current_setting('app.sumber_bukti_tulis', true), ''), '', 'penanda tulis bukti dimatikan lagi sesudah fungsi');

-- ------------------------------------------------------------ idempoten
-- tandai waktu isi lama: panggilan dengan nilai sama TIDAK boleh menulis ulang
select set_config('app.sumber_bukti_tulis', 'ya', true);
update public.lead set sumber_bukti_diisi_pada = timestamptz '2026-10-17 08:00+07' where id in ('ldujibkt1', 'ldujibkt2');
select set_config('app.sumber_bukti_tulis', '', true);
select uji.simpan('s2', public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[
  {"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":"2026-10-16T03:32:00Z"},
  {"lead_id":"ldujibkt2","bukti":"ga-oy","kode":"GA-OY-7K3F","chat_pada":"2026-10-15T08:05:00+07:00"}]}'));
select uji.sama(uji.ambil('s2'),
  '{"diproses":2,"diubah":0,"sama":2,"items":[{"lead_id":"ldujibkt1","ok":true,"diubah":false},{"lead_id":"ldujibkt2","ok":true,"diubah":false}]}'::jsonb,
  'nilai sama (waktu sama dalam zona lain, kode tanpa kunci = null) → no-op');
select uji.cek((select bool_and(sumber_bukti_diisi_pada = timestamptz '2026-10-17 08:00+07') from public.lead where id in ('ldujibkt1', 'ldujibkt2')),
  'no-op: diisi_pada tidak ditulis ulang');
select uji.simpan('s3', public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[
  {"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":"2026-10-16T03:32:00Z"},
  {"lead_id":"ldujibkt2","bukti":"ga-oy","kode":"GA-OY-9Z9Z","chat_pada":"2026-10-15T08:05:00+07:00"}]}'));
select uji.cek((uji.ambil('s3') ->> 'diubah')::int = 1 and (uji.ambil('s3') ->> 'sama')::int = 1
  and uji.ambil('s3') -> 'items' -> 1 ->> 'diubah' = 'true',
  'satu kolom beda (kode) → hanya item itu diubah');
select uji.sama(pg_temp.bukti('ldujibkt2') ->> 'diisi_pada', public.iso_utc(now()), 'yang diubah: diisi_pada = now()');
select uji.sama(pg_temp.bukti('ldujibkt1') ->> 'diisi_pada', public.iso_utc(timestamptz '2026-10-17 08:00+07'), 'yang sama: diisi_pada tetap');
select uji.sama((public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[]}') ->> 'diproses')::int, 0, 'items kosong → 0 diproses');
-- kelas lain + hapus bukti (bukti null)
select uji.jalan(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt3","bukti":"meta","kode":"PM-06"},
  {"lead_id":"ldujibkt4","bukti":"tanpa-sinyal","chat_pada":"2026-10-20T09:00:00+07:00"}]}'),
  'kelas meta (kode PM-06, tanpa chat_pada) & tanpa-sinyal diterima');
select uji.sama(pg_temp.bukti('ldujibkt3') - 'diisi_pada', '{"bukti":"meta","kode":"PM-06","chat_pada":null}'::jsonb, 'meta tersimpan');
select uji.sama(public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[{"lead_id":"ldujibkt3","bukti":null}]}') -> 'items' -> 0,
  '{"lead_id":"ldujibkt3","ok":true,"diubah":true}'::jsonb, 'bukti null → hapus bukti (diubah)');
select uji.sama(pg_temp.bukti('ldujibkt3'), '{"bukti":null,"kode":null,"chat_pada":null,"diisi_pada":null}'::jsonb,
  'hapus: keempat kolom kembali null');
select uji.sama(public.x_pipeline_sumber_bukti_set(900000000002, '{"items":[{"lead_id":"ldujibkt3","bukti":null}]}') ->> 'sama', '1',
  'hapus lagi → no-op');
select uji.jalan(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt3","bukti":"web-rh","kode":"WEB-RH"}]}'),
  'kode = nama kelas persis (WEB-RH untuk web-rh) diterima');

-- ------------------------------------------------------------ validasi (PT400 / PT404; tidak ada yang ditulis)
select uji.simpan('jejak1', pg_temp.jejak());
select uji.galat(pg_temp.set_sql(900000000002, '{}'), 'PT400', 'tanpa items ditolak', 'items wajib berupa array', 'INPUT_001');
select uji.galat($q$select public.x_pipeline_sumber_bukti_set(900000000002, null)$q$, 'PT400', 'body null ditolak', 'items wajib', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":{"lead_id":"ldujibkt1"}}'), 'PT400', 'items bukan array ditolak', 'items wajib', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[],"dry_run":true}'), 'PT400', 'kunci tingkat atas tak dikenal ditolak',
  'Kunci tidak dikenal: dry_run', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, (select jsonb_build_object('items', jsonb_agg(jsonb_build_object('lead_id', 'ldx' || g, 'bukti', 'lastri')))
                                              from generate_series(1, 201) g)),
  'PT400', '> 200 item ditolak', 'Maksimal 200 item per panggilan (dikirim 201)', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, (select jsonb_build_object('items', jsonb_agg(jsonb_build_object('lead_id', 'ldx' || g, 'bukti', 'lastri')))
                                              from generate_series(1, 200) g)),
  'PT404', 'tepat 200 item lolos batas (gagal di lead tak dikenal, bukan di batas)', 'items[0] (ldx1): lead tidak ditemukan', 'ITEM_013');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":["ldujibkt1"]}'), 'PT400', 'item bukan objek ditolak', 'items[0]: harus objek', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"lastri","kelas":"lastri"}]}'),
  'PT400', 'kunci item tak dikenal (salah ketik) ditolak', 'items[0]: kunci tidak dikenal: kelas', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"bukti":"lastri"}]}'), 'PT400', 'lead_id wajib', 'items[0]: lead_id wajib', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":123,"bukti":"lastri"}]}'), 'PT400', 'lead_id angka ditolak', 'lead_id wajib (teks)', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"lastri"},{"lead_id":"ldujibkt1","bukti":"meta"}]}'),
  'PT400', 'lead_id ganda dalam satu panggilan ditolak', 'items[1] (ldujibkt1): lead_id ganda', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1"}]}'), 'PT400', 'bukti wajib (kunci harus ada)',
  'items[0] (ldujibkt1): bukti wajib', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"google"}]}'), 'PT400', 'kelas tak dikenal ditolak',
  'kelas bukti tidak dikenal: "google"', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"Situs-RH"}]}'), 'PT400', 'kelas peka huruf besar',
  'kelas bukti tidak dikenal', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":1}]}'), 'PT400', 'bukti angka ditolak',
  'bukti harus teks atau null', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"meta","kode":"PM 06!"}]}'), 'PT400',
  'kode berkarakter terlarang ditolak', 'kode tidak sah: "PM 06!"', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"meta","kode":"PM-012345678901234567"}]}'), 'PT400',
  'kode > 20 karakter ditolak', 'kode tidak sah', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"xs-pm","kode":"X"}]}'), 'PT400',
  'kode 1 karakter ditolak', 'kode tidak sah', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"meta","kode":6}]}'), 'PT400',
  'kode angka (bukan teks) ditolak', 'kode harus teks atau null', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"tanpa-sinyal","kode":"WEB-RH"}]}'), 'PT400',
  'tanpa-sinyal dengan kode ditolak', 'kode harus kosong untuk bukti tanpa-sinyal', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":null,"kode":"WEB-RH"}]}'), 'PT400',
  'hapus bukti dengan kode ditolak', 'kode harus kosong untuk bukti null', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"ga-rh","kode":"GA-OY-7K3F"}]}'), 'PT400',
  'kode tidak cocok dengan kelas (ga-rh ↔ GA-OY-…) ditolak', 'tidak cocok dengan kelas ga-rh', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"web-oy","kode":"WEB-OYX"}]}'), 'PT400',
  'awalan kelas harus utuh (WEB-OYX bukan WEB-OY-…)', 'tidak cocok dengan kelas web-oy', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"meta","kode":"GA-RH"}]}'), 'PT400',
  'kode meta harus PM-/RD-', 'tidak cocok dengan kelas meta', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":"2026-10-16T10:32:00"}]}'), 'PT400',
  'chat_pada tanpa zona ditolak (cegah geser 7 jam)', 'chat_pada harus waktu ISO dengan zona', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":"16/10/2026 10:32"}]}'), 'PT400',
  'chat_pada bukan ISO ditolak', 'chat_pada harus waktu ISO dengan zona', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":"2026-13-45T10:00:00Z"}]}'), 'PT400',
  'chat_pada tanggal mustahil ditolak', 'chat_pada tidak valid', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, jsonb_build_object('items', jsonb_build_array(jsonb_build_object('lead_id', 'ldujibkt1',
    'bukti', 'situs-rh', 'chat_pada', to_char((now() + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))))), 'PT400',
  'chat_pada di masa depan ditolak', 'chat_pada tidak boleh di masa depan', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"situs-rh","chat_pada":20261016}]}'), 'PT400',
  'chat_pada angka ditolak', 'chat_pada harus teks ISO atau null', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt1","bukti":null,"chat_pada":"2026-10-16T10:32:00+07:00"}]}'), 'PT400',
  'hapus bukti dengan chat_pada ditolak', 'chat_pada harus kosong untuk bukti null', 'INPUT_001');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujitakada","bukti":"lastri"}]}'), 'PT404', 'lead tak dikenal → 404',
  'items[0] (ldujitakada): lead tidak ditemukan', 'ITEM_013');
-- semua-atau-tidak: item 0 sah, item 1 tidak → item 0 juga tidak tertulis
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt4","bukti":"katalog-wa"},{"lead_id":"ldujitakada","bukti":"lastri"}]}'),
  'PT404', 'satu item gagal → seluruh panggilan gagal', 'items[1] (ldujitakada)', 'ITEM_013');
select uji.sama(pg_temp.jejak(), uji.ambil('jejak1'), 'semua panggilan yang ditolak tidak mengubah lead/aktivitas/riwayat (item sah ikut batal)');

-- ------------------------------------------------------------ scope & aktor
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000002');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT403',
  'token scope baca → 403', null, 'ACCESS_001');
select uji.token('b0b0b0b0-0000-4000-8000-000000000001');
select uji.galat(pg_temp.set_sql(100000001, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT401',
  'token milik anggota lain dari p_aktor → 401', null, 'OAUTH_019');
select uji.token(null);
select uji.galat(pg_temp.set_sql(123, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT401', 'aktor tak dikenal → 401', null, 'OAUTH_019');
select uji.token('b0b0b0b0-0000-4000-8000-000000000003');
select uji.galat(pg_temp.set_sql(100000002, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT403',
  'rep (citra, token tulis): bukti bukan isian sales → 403', 'hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
select uji.galat(pg_temp.set_sql(100000002, '{"items":[{"lead_id":"ldujibkt1","bukti":"lastri"}]}'), 'PT403',
  'rep: lead miliknya sendiri pun ditolak', 'hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
select uji.token(null);
select uji.galat(pg_temp.set_sql(100000003, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT403', 'peran baca → 403',
  'hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
select uji.galat(pg_temp.set_sql(900000000001, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), 'PT403',
  'anggota tanpa akses Pipeline → 403', 'hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
select uji.sama(public.x_pipeline_sumber_bukti_set(100000001, '{"items":[{"lead_id":"ldujibkt4","bukti":"katalog-wa"}]}') ->> 'diubah', '1',
  'owner (admin implisit) boleh');
reset role;
insert into public.pipeline_akses (member_id, peran) values (900000000001, 'admin');
select uji.jadi_service();
select uji.sama(public.x_pipeline_sumber_bukti_set(900000000001, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}') ->> 'diubah', '1',
  'anggota ber-peran Pipeline admin boleh');
reset role;
delete from public.pipeline_akses where member_id = 900000000001;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), '42501',
  'authenticated: x_pipeline_sumber_bukti_set tidak bisa dipanggil');
select uji.galat($q$select public.inti_pipeline_sumber_bukti_set('{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}')$q$, '42501',
  'authenticated: inti_pipeline_sumber_bukti_set tidak bisa dipanggil');
reset role;
select uji.jadi_anon();
select uji.galat(pg_temp.set_sql(900000000002, '{"items":[{"lead_id":"ldujibkt4","bukti":"lastri"}]}'), '42501', 'anon: ditolak');
reset role;

-- ------------------------------------------------------------ jalur sales/web TIDAK bisa mengubah kolom bukti
select uji.simpan('b1', pg_temp.bukti('ldujibkt1'));
select uji.simpan('b3', pg_temp.bukti('ldujibkt3'));
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('u1', public.web_pipeline_lead_ubah('{"lead_id":"ldujibkt1","catatan":"diubah sales","sumber":"Google Ads",
  "sumber_bukti":"meta","sumber_bukti_kode":"PM-01","sumber_bukti_chat_pada":"2026-10-01T00:00:00Z","sumber_bukti_diisi_pada":null}'));
select uji.cek(uji.ambil('u1') ->> 'catatan' = 'diubah sales' and uji.ambil('u1') ->> 'sumber' = 'Google Ads'
  and uji.ambil('u1') ->> 'sumber_bukti' = 'situs-rh',
  'rep: ubah lead jalan (sumber sales boleh diubah), kunci bukti di payload diabaikan (hasil mutasi memuat bukti lama)');
select uji.jalan($q$select public.web_pipeline_fu_catat('{"lead_id":"ldujibkt1","jenis":"WA","hasil":"FU","sumber_bukti":"meta"}')$q$,
  'rep: catat FU dengan kunci bukti jalan');
select uji.jalan($q$select public.web_pipeline_tahap('{"lead_id":"ldujibkt1","aksi":"penawaran","nilai_penawaran":1500000,"sumber_bukti":"meta","sumber_bukti_kode":"PM-02"}')$q$,
  'rep: kirim penawaran dengan kunci bukti jalan');
select uji.jalan($q$select public.web_pipeline_order_ubah('{"lead_id":"ldujibkt3","no_po":"PO-BKT","sumber_bukti":null,"sumber_bukti_kode":null}')$q$,
  'rep: ubah data order dengan kunci bukti jalan');
select uji.simpan('baru', public.web_pipeline_lead_buat('{"sumber":"WA langsung","pelanggan_id":"plujibkt1","items":[{"produk":"Roda","qty":1}],
  "sumber_bukti":"situs-oy","sumber_bukti_kode":"WEB-OY","sumber_bukti_chat_pada":"2026-10-10T00:00:00Z","sumber_bukti_diisi_pada":"2026-10-10T00:00:00Z"}'));
select uji.cek(uji.ambil('baru') ? 'sumber_bukti' and uji.ambil('baru') ->> 'sumber_bukti' is null and uji.ambil('baru') ->> 'sumber_bukti_kode' is null
  and uji.ambil('baru') ->> 'sumber_bukti_chat_pada' is null and uji.ambil('baru') ->> 'sumber_bukti_diisi_pada' is null,
  'rep: lead baru dengan kunci bukti → bukti tetap null');
select uji.galat($q$update public.lead set sumber_bukti = 'meta' where id = 'ldujibkt1'$q$, '42501', 'rep: UPDATE langsung kolom bukti ditolak (hak tabel)');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.jalan($q$select public.web_pipeline_lead_ubah('{"lead_id":"ldujibkt3","catatan":"owner","sumber_bukti":"tidur"}')$q$,
  'owner lewat web: ubah lead dengan kunci bukti jalan (diabaikan)');
reset role;
select uji.sama(pg_temp.bukti('ldujibkt1'), uji.ambil('b1'), 'sesudah semua jalur web: bukti lead 1 tidak berubah');
select uji.sama(pg_temp.bukti('ldujibkt3'), uji.ambil('b3'), 'sesudah semua jalur web: bukti lead 3 tidak berubah');
select uji.cek((select sumber = 'Google Ads' and tahap = 'PENAWARAN' and catatan = 'diubah sales' from public.lead where id = 'ldujibkt1'),
  'perubahan sales sendiri (sumber, tahap, catatan) tetap tersimpan');
select uji.jadi_service();
select uji.galat($q$update public.lead set sumber_bukti_kode = 'PM-01' where id = 'ldujibkt1'$q$, '42501', 'service_role: UPDATE langsung ditolak (hak tabel)');
reset role;
-- penjaga trigger: SQL langsung sebagai pemilik tabel (tanpa penanda fungsi) pun ditolak
select uji.galat($q$update public.lead set sumber_bukti = 'meta', sumber_bukti_diisi_pada = now() where id = 'ldujibkt4'$q$, 'PT403',
  'penjaga: UPDATE kolom bukti di luar x_pipeline_sumber_bukti_set ditolak', 'Bukti sumber hanya diisi agent', 'ACCESS_001');
select uji.galat($q$update public.lead set sumber_bukti = null, sumber_bukti_kode = null, sumber_bukti_chat_pada = null, sumber_bukti_diisi_pada = null where id = 'ldujibkt1'$q$,
  'PT403', 'penjaga: menghapus bukti di luar fungsi ditolak', 'Bukti sumber hanya diisi agent', 'ACCESS_001');
select uji.galat($q$insert into public.lead (pelanggan_id, sumber, sumber_bukti, sumber_bukti_diisi_pada) values ('plujibkt1', 'Lainnya', 'lastri', now())$q$,
  'PT403', 'penjaga: INSERT lead berisi bukti ditolak', 'Bukti sumber hanya diisi agent', 'ACCESS_001');
select uji.jalan($q$update public.lead set catatan = 'koreksi manual' where id = 'ldujibkt1'$q$, 'penjaga: UPDATE kolom lain tetap boleh');
select uji.sama(pg_temp.bukti('ldujibkt1'), uji.ambil('b1'), 'UPDATE kolom lain tidak mengubah bukti');
-- CHECK sebagai lapis terakhir (penanda dinyalakan manual)
select set_config('app.sumber_bukti_tulis', 'ya', true);
select uji.galat($q$update public.lead set sumber_bukti = 'google' where id = 'ldujibkt1'$q$, '23514', 'CHECK: kelas di luar allowlist ditolak');
select uji.galat($q$update public.lead set sumber_bukti_kode = 'pm-06' where id = 'ldujibkt1'$q$, '23514', 'CHECK: kode huruf kecil ditolak');
select uji.galat(format('update public.lead set sumber_bukti_kode = %L where id = %L', 'PM-06', uji.ambil('baru') ->> 'id'), '23514',
  'CHECK: kode tanpa kelas ditolak (konsisten)');
select uji.galat($q$update public.lead set sumber_bukti_diisi_pada = null where id = 'ldujibkt1'$q$, '23514', 'CHECK: kelas tanpa diisi_pada ditolak');
select set_config('app.sumber_bukti_tulis', '', true);

-- ------------------------------------------------------------ baca: detail & daftar memuat 4 field (bentuk lain tetap)
select uji.jadi_service();
select uji.simpan('xl', public.x_pipeline_lead(900000000002, 'ldujibkt2'));
select uji.simpan('xd', public.x_pipeline_daftar(900000000002, '{"q":"PT Uji Bukti Sumber"}'));
reset role;
select uji.sama(uji.ambil('xl') - array['id', 'kode', 'tanggal_masuk', 'tahap', 'sumber', 'pemilik', 'pemilik_nama', 'pemilik_kode_sp',
    'dialihkan_ke', 'kebutuhan', 'catatan', 'catatan_impor', 'nilai_penawaran', 'tanggal_penawaran', 'no_sp', 'tanggal_sp',
    'nilai_transaksi', 'no_po', 'bayar_status', 'bayar_dp', 'tanggal_dp', 'tanggal_lunas', 'bayar_diubah_oleh_nama',
    'bayar_diubah_pada', 'alasan_batal', 'alasan_batal_lain', 'periksa', 'periksa_sebab', 'ref_sheet', 'diam_sejak', 'diam_hari',
    'fu_berikutnya', 'dibuat_pada', 'pelanggan', 'kontak', 'items', 'aktivitas', 'riwayat_tahap'],
  jsonb_build_object('sumber_bukti', 'ga-oy', 'sumber_bukti_kode', 'GA-OY-9Z9Z', 'sumber_bukti_chat_pada', '2026-10-15T01:05:00.000Z',
    'sumber_bukti_diisi_pada', public.iso_utc(now())),
  'x_pipeline_lead: kunci lama tetap + tepat 4 field bukti (waktu ISO UTC)');
select uji.cek((select bool_and(i ? 'sumber_bukti' and i ? 'sumber_bukti_kode' and i ? 'sumber_bukti_chat_pada' and i ? 'sumber_bukti_diisi_pada')
                  from jsonb_array_elements(uji.ambil('xd') -> 'items') i)
  and (uji.ambil('xd') ->> 'total')::int = 5,
  'x_pipeline_daftar: tiap baris memuat 4 field bukti');
select uji.sama((select array_agg(k order by k) from jsonb_array_elements(uji.ambil('xd') -> 'items') i, jsonb_object_keys(i) k
                  where i ->> 'id' = 'ldujibkt2'),
  (select array_agg(k order by k) from unnest(array['id', 'kode', 'tahap', 'sumber', 'pelanggan', 'kota', 'pemilik', 'pemilik_nama',
    'pemilik_kode_sp', 'tanggal_masuk', 'diam_hari', 'fu_berikutnya', 'nilai_transaksi', 'no_sp', 'tanggal_sp', 'no_po',
    'bayar_status', 'bayar_dp', 'tanggal_dp', 'tanggal_lunas', 'periksa', 'pelanggan_id', 'order_sebelumnya', 'produk',
    'sumber_bukti', 'sumber_bukti_kode', 'sumber_bukti_chat_pada', 'sumber_bukti_diisi_pada']) k),
  'baris daftar: 24 kunci lama + 4 field bukti');
select uji.sama((select i -> 'sumber_bukti_kode' from jsonb_array_elements(uji.ambil('xd') -> 'items') i where i ->> 'id' = 'ldujibkt2'),
  '"GA-OY-9Z9Z"'::jsonb, 'x_pipeline_daftar: nilai bukti terisi');
select uji.cek(public.j_pipeline_lead_ringkas('ldujibkt2') = (select b.j from public.j_pipeline_lead_ringkas_banyak(array['ldujibkt2']) b)
  and public.j_pipeline_lead_ringkas('ldujibkt3') = (select b.j from public.j_pipeline_lead_ringkas_banyak(array['ldujibkt3']) b),
  'j_pipeline_lead_ringkas = _banyak (field bukti di kedua fungsi)');
-- web: rep, baca (bukti bukan data tersamar), owner
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama(public.web_pipeline_lead('ldujibkt2') ->> 'sumber_bukti', 'ga-oy', 'web_pipeline_lead (rep): bukti terbaca');
select uji.cek((select bool_and(i ? 'sumber_bukti_diisi_pada') from jsonb_array_elements(public.web_pipeline_daftar('{"q":"PT Uji Bukti Sumber"}') -> 'items') i),
  'web_pipeline_daftar (rep): field bukti ada');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(public.web_pipeline_lead('ldujibkt2') ->> 'sumber_bukti_kode', 'GA-OY-9Z9Z',
  'web_pipeline_lead (baca): bukti tampil (bukan data tersamar)');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.cek(public.web_pipeline_lead('ldujibkt4') ? 'sumber_bukti_chat_pada'
  and (select i ->> 'sumber_bukti' from jsonb_array_elements(public.web_pipeline_daftar('{"q":"PT Uji Bukti Sumber"}') -> 'items') i
        where i ->> 'id' = 'ldujibkt4') = 'lastri',
  'web (owner): detail & daftar memuat bukti');
reset role;

rollback;
