-- 29 · Pipeline: jadwal FU berikutnya otomatis = hari ini + 2 hari kerja saat "Catat follow-up" tanpa rencana
-- (20261020120000_pipeline_fu_otomatis, IMP-PIP-261015-1, ACC Hannes 20 Okt). Isian manual menang; lead tertutup
-- (ORDER/BATAL/DIALIHKAN) tidak dijadwalkan; hari kerja = Senin–Jumat bukan hari_libur; "hari ini" = WIB.
-- Aktor: budi (owner/admin), citra (rep RSG, pemilik lead uji).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.hari_libur where tanggal between '2026-10-19' and '2026-11-06';
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujifu1', 'PT Uji FU Otomatis');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi, alasan_batal, dialihkan_ke, nilai_penawaran) values
  ('ldujifu1', 'plujifu1', 'Google Ads', 100000002, 'BARU', null, null, null, null, null, null),
  ('ldujifu2', 'plujifu1', 'WA langsung', 100000002, 'PENAWARAN', null, null, null, null, null, 15000000),
  ('ldujifu3', 'plujifu1', 'Telepon', 100000002, 'ORDER', '9801/RSG/X/2026', '2026-10-15', 2000000, null, null, null),
  ('ldujifu4', 'plujifu1', 'Referral', 100000002, 'BATAL', null, null, null, 'Harga', null, null),
  ('ldujifu5', 'plujifu1', 'Lainnya', 100000002, 'DIALIHKAN', null, null, null, null, 'Cabang Surabaya', null),
  ('ldujifu6', 'plujifu1', 'Google Ads', null, 'BARU', null, null, null, null, null, null);
insert into public.lead_item (lead_id, produk, qty) values
  ('ldujifu1', 'Roda', 4), ('ldujifu2', 'Pallet Mesh', 20), ('ldujifu3', 'Roda', 2),
  ('ldujifu4', 'Roda', 2), ('ldujifu5', 'Roda', 2), ('ldujifu6', 'Roda', 2);
select uji.konteks(null, null);

-- ------------------------------------------------------------ pembantu: hitung hari kerja
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-19', 2), date '2026-10-21', 'Senin 19/10 + 2 hari kerja = Rabu 21/10');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-21', 2), date '2026-10-23', 'Rabu + 2 = Jumat');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-22', 2), date '2026-10-26', 'Kamis 22/10 + 2 = Senin 26/10 (lewati Sabtu/Minggu)');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-23', 2), date '2026-10-27', 'Jumat 23/10 + 2 = Selasa 27/10');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-24', 2), date '2026-10-27', 'Sabtu 24/10 + 2 = Selasa 27/10');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-25', 2), date '2026-10-27', 'Minggu 25/10 + 2 = Selasa 27/10');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-19', 0), date '2026-10-19', 'n = 0 → tanggal itu sendiri');
select uji.cek(public.pipeline_tambah_hari_kerja(null, 2) is null, 'tanggal NULL → NULL');
-- konsisten dengan public.hari_kerja (definisi hari kerja aplikasi)
select uji.cek(not exists (
  select 1 from generate_series(date '2026-10-01', date '2026-12-31', interval '1 day') g(d)
   where public.hari_kerja(g.d::date, public.pipeline_tambah_hari_kerja(g.d::date, 2)) <> 2),
  'Okt–Des 2026: hari_kerja(d, hasil) = 2 untuk setiap tanggal awal');
-- "hari ini" WIB: Jumat 23/10 18:00 UTC = Sabtu 24/10 01:00 WIB → Selasa 27/10
select uji.sama(public.pipeline_tambah_hari_kerja(public.wib_date(timestamptz '2026-10-23 18:00:00+00'), 2), date '2026-10-27',
  'zona Asia/Jakarta: Jumat 18:00 UTC sudah Sabtu WIB → Selasa');
insert into public.hari_libur (tanggal, nama) values ('2026-10-21', 'Libur uji');
select uji.sama(public.pipeline_tambah_hari_kerja('2026-10-19', 2), date '2026-10-22', 'tanggal di hari_libur dilewati (Senin → Kamis bila Rabu libur)');
delete from public.hari_libur where tanggal = '2026-10-21';

-- ------------------------------------------------------------ hak: pembantu internal
select uji.cek(not has_function_privilege('anon', 'public.pipeline_tambah_hari_kerja(date, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_tambah_hari_kerja(date, integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.pipeline_tambah_hari_kerja(date, integer)', 'EXECUTE'),
  'pipeline_tambah_hari_kerja tidak bisa dipanggil role API');
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_fu_catat(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_fu_catat(jsonb)', 'EXECUTE'),
  'hak fu_catat tetap: inti internal, web_ untuk authenticated');

-- ------------------------------------------------------------ catat FU: rep pemilik, hari ini dipatok Kamis 22/10
select set_config('app.hari_ini', '2026-10-22', true);
select uji.jadi('22222222-2222-4222-8222-222222222222');   -- citra

-- lead aktif BARU, rencana tidak dikirim → otomatis Senin 26/10
select uji.simpan('a1', public.web_pipeline_fu_catat('{"lead_id":"ldujifu1","jenis":"Telepon","hasil":"belum diangkat"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu1'), date '2026-10-26', 'BARU tanpa rencana → fu_berikutnya = Kamis + 2 hari kerja (Senin 26/10)');
select uji.sama((select rencana_berikutnya from public.lead_aktivitas where lead_id = 'ldujifu1' order by id desc limit 1), date '2026-10-26',
  'tanggal otomatis tersimpan di riwayat aktivitas');
select uji.sama(uji.ambil('a1') ->> 'fu_berikutnya', '2026-10-26', 'JSON hasil memuat fu_berikutnya otomatis');

-- rencana string kosong ("" dari form) diperlakukan sama dengan tidak diisi
select uji.simpan('a2', public.web_pipeline_fu_catat('{"lead_id":"ldujifu2","jenis":"WA","hasil":"minta revisi","rencana_berikutnya":""}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu2'), date '2026-10-26', 'PENAWARAN, rencana "" → otomatis Senin 26/10');

-- isian manual menang (lebih awal maupun lebih lambat dari tanggal otomatis)
select uji.simpan('m1', public.web_pipeline_fu_catat('{"lead_id":"ldujifu1","jenis":"WA","rencana_berikutnya":"2026-10-23"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu1'), date '2026-10-23', 'manual besok (23/10) menang atas otomatis');
select uji.simpan('m2', public.web_pipeline_fu_catat('{"lead_id":"ldujifu2","jenis":"Telepon","rencana_berikutnya":"2026-11-10"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu2'), date '2026-11-10', 'manual 10/11 menang atas otomatis');

-- FU berikutnya tanpa rencana menimpa rencana lama dengan jadwal otomatis baru (rencana FU terbaru menang)
select set_config('app.hari_ini', '2026-10-23', true);   -- Jumat
select uji.simpan('a3', public.web_pipeline_fu_catat('{"lead_id":"ldujifu1","jenis":"Visit"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu1'), date '2026-10-27', 'FU Jumat 23/10 tanpa rencana → Selasa 27/10');

-- lead tertutup: tanpa rencana → tetap tidak dijadwalkan
select uji.simpan('t1', public.web_pipeline_fu_catat('{"lead_id":"ldujifu3","jenis":"Catatan","hasil":"barang dikirim"}'));
select uji.cek((select fu_berikutnya is null from public.lead where id = 'ldujifu3')
  and (select rencana_berikutnya is null from public.lead_aktivitas where lead_id = 'ldujifu3' order by id desc limit 1),
  'ORDER tanpa rencana → tidak dijadwalkan');
select uji.simpan('t2', public.web_pipeline_fu_catat('{"lead_id":"ldujifu4","jenis":"WA","hasil":"sudah beli di tempat lain"}'));
select uji.cek((select fu_berikutnya is null from public.lead where id = 'ldujifu4'), 'BATAL tanpa rencana → tidak dijadwalkan');
select uji.simpan('t3', public.web_pipeline_fu_catat('{"lead_id":"ldujifu5","jenis":"Telepon"}'));
select uji.cek((select fu_berikutnya is null from public.lead where id = 'ldujifu5'), 'DIALIHKAN tanpa rencana → tidak dijadwalkan');
-- lead tertutup dengan isian manual: isian manual tetap dipakai (perilaku lama)
select uji.simpan('t4', public.web_pipeline_fu_catat('{"lead_id":"ldujifu3","jenis":"Telepon","rencana_berikutnya":"2026-11-02"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu3'), date '2026-11-02', 'ORDER + rencana manual → manual tetap dipakai');

-- lead aktif tanpa pemilik (rep boleh mencatat FU, pipeline_boleh_ubah) → otomatis juga
select uji.simpan('a4', public.web_pipeline_fu_catat('{"lead_id":"ldujifu6","jenis":"Telepon"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu6'), date '2026-10-27', 'lead tanpa pemilik, rep → Selasa 27/10');

-- admin/owner juga kena aturan yang sama; tanggal di hari_libur (Senin 26/10) dilewati
select uji.konteks(null, null);
reset role;
insert into public.hari_libur (tanggal, nama) values ('2026-10-26', 'Libur uji');
select uji.jadi('11111111-1111-4111-8111-111111111111');   -- budi
select uji.simpan('o1', public.web_pipeline_fu_catat('{"lead_id":"ldujifu2","jenis":"Telepon"}'));
select uji.sama((select fu_berikutnya from public.lead where id = 'ldujifu2'), date '2026-10-28',
  'admin, Jumat 23/10, Senin 26/10 libur → Rabu 28/10 (menimpa rencana manual lama 10/11: FU terbaru menang)');

rollback;
