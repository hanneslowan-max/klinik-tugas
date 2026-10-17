-- 28 · Pipeline: anggota Anvil TANPA akses Pipeline (peran NULL) ditolak di semua jalur tulis lead
-- (20261017140000_pipeline_hak_peran_null; temuan sampingan PR #14). Dulu `peran not in ('admin','rep')` meloloskan NULL:
-- lewat RPC langsung bisa membuat lead, mencatat FU / pindah tahap / ubah lead / data order pada lead TANPA pemilik, dan
-- mengatur rencana FU. Jalur sah (rep pemilik, admin/owner, bot API) tetap jalan; data tidak berubah oleh percobaan
-- yang ditolak. Aktor: budi (owner), citra (rep RSG), eka (TANPA akses Pipeline di tes ini).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.pipeline_akses where member_id = 900000000001;   -- eka: tanpa akses Pipeline
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujinul1', 'PT Uji Peran Null');
-- nul1 = lead TANPA pemilik (dulu bisa diubah siapa pun yang lolos cek peran); nul2 = ORDER tanpa pemilik; nul3 = milik citra
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujinul1', 'plujinul1', 'Google Ads', null, 'BARU', null, null, null),
  ('ldujinul2', 'plujinul1', 'Telepon', null, 'ORDER', '9701/RSG/X/2026', '2026-10-01', 1000000),
  ('ldujinul3', 'plujinul1', 'Referral', 100000002, 'BARU', null, null, null);
insert into public.lead_item (lead_id, produk, qty) values ('ldujinul1', 'Roda', 2), ('ldujinul2', 'Roda', 2), ('ldujinul3', 'Roda', 2);
select uji.konteks(null, null);

create function pg_temp.jejak() returns jsonb language sql as $$
  select jsonb_build_array(
    (select count(*) from public.lead), (select count(*) from public.pelanggan), (select count(*) from public.lead_aktivitas),
    (select count(*) from public.lead_riwayat_tahap),
    (select jsonb_agg(to_jsonb(l) - array['cari'] order by l.id) from public.lead l where l.id like 'ldujinul%'))
$$;
select uji.simpan('jejak0', pg_temp.jejak());

-- ------------------------------------------------------------ hak fungsi tidak berubah
select uji.cek(not has_function_privilege('authenticated', 'public.pipeline_boleh_ubah(bigint)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_lead_buat(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_fu_set(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.inti_pipeline_fu_set(jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.x_pipeline_fu_set(bigint, jsonb)', 'EXECUTE'),
  'pembantu & inti tetap internal; x_pipeline_fu_set tetap service_role');

-- ------------------------------------------------------------ tanpa akses: semua jalur tulis ditolak
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat($q$select public.web_pipeline_lead_buat('{"sumber":"Google Ads","pelanggan":{"nama":"PT Uji Peran Null Baru"},"items":[{"produk":"Roda","qty":1}]}')$q$,
  'PT403', 'tanpa akses: buat lead ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_fu_catat('{"lead_id":"ldujinul1","jenis":"Telepon","hasil":"uji"}')$q$,
  'PT403', 'tanpa akses: catat FU di lead tanpa pemilik ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujinul1","aksi":"penawaran","nilai_penawaran":"1000000"}')$q$,
  'PT403', 'tanpa akses: pindah tahap lead tanpa pemilik ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_lead_ubah('{"lead_id":"ldujinul1","klaim":true}')$q$,
  'PT403', 'tanpa akses: klaim lead tanpa pemilik ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_lead_ubah('{"lead_id":"ldujinul1","catatan":"diubah"}')$q$,
  'PT403', 'tanpa akses: ubah lead tanpa pemilik ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_order_ubah('{"lead_id":"ldujinul2","no_po":"PO-NULL"}')$q$,
  'PT403', 'tanpa akses: ubah data order tanpa pemilik ditolak', 'akses tulis', 'ACCESS_001');
select uji.galat($q$select public.web_pipeline_fu_catat('{"lead_id":"ldujinul3","jenis":"Telepon"}')$q$,
  'PT403', 'tanpa akses: lead milik rep lain ditolak', 'akses tulis', 'ACCESS_001');
reset role;
-- fu_set (jalur API): inti dengan aktor eka
select uji.konteks('api', 900000000001);
select uji.galat($q$select public.inti_pipeline_fu_set('{"items":[{"lead_id":"ldujinul1","tanggal":"2026-10-20"}]}')$q$,
  'PT403', 'tanpa akses: atur rencana FU ditolak', 'akses tulis', 'ACCESS_001');
select uji.konteks(null, null);
select uji.sama(pg_temp.jejak(), uji.ambil('jejak0'), 'percobaan yang ditolak tidak mengubah apa pun');

-- ------------------------------------------------------------ jalur sah tetap jalan
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek(public.web_pipeline_fu_catat('{"lead_id":"ldujinul3","jenis":"Telepon","hasil":"rep pemilik"}') -> 'aktivitas' @> '[{"hasil":"rep pemilik"}]',
  'rep: catat FU di lead sendiri jalan');
select uji.sama(public.web_pipeline_lead_ubah('{"lead_id":"ldujinul1","klaim":true}') ->> 'pemilik', '100000002', 'rep: klaim lead tanpa pemilik jalan');
select uji.cek((public.web_pipeline_lead_buat('{"sumber":"Google Ads","pelanggan":{"nama":"PT Uji Peran Null Rep"},"items":[{"produk":"Roda","qty":1}]}') ->> 'kode') ~ '^L-',
  'rep: buat lead jalan');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(public.web_pipeline_order_ubah('{"lead_id":"ldujinul2","no_po":"PO-OWNER"}') ->> 'no_po', 'PO-OWNER', 'owner: ubah data order tanpa pemilik jalan');
reset role;
select uji.konteks('api', 900000000002);   -- bot (routine) = admin
select uji.sama(public.inti_pipeline_fu_set('{"items":[{"lead_id":"ldujinul2","tanggal":"2026-10-20"}]}') ->> 'diset', '1', 'bot: atur rencana FU jalan');
select uji.konteks(null, null);

-- peran 'baca' tetap ditolak seperti sebelumnya
insert into public.pipeline_akses (member_id, peran) values (900000000001, 'baca');
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat($q$select public.web_pipeline_fu_catat('{"lead_id":"ldujinul1","jenis":"Telepon"}')$q$,
  'PT403', 'baca: catat FU tetap ditolak', 'akses tulis', 'ACCESS_001');
reset role;

rollback;
