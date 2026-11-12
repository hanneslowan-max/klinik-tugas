-- 15 · Lampiran via API (x_lampiran_catat): catat baris lampiran setelah berkas ada di Storage. Aturan mode cermin
-- (kartu ClickUp tak bisa dilampiri) & atribusi pengunggah ditegakkan trigger lampiran_sebelum, jadi berlaku sama
-- untuk service role. Seed mode = cermin.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

select uji.jadi_service();

-- Berkas "terunggah" ke Storage untuk kartu app rtujib0001 (metadata mime+size seperti objek asli).
select uji.jalan($$insert into storage.objects (bucket_id, name, metadata)
  values ('lampiran', 't/rtujib0001/api-uji.png', jsonb_build_object('mimetype','image/png','size',1234))$$,
  'seed objek Storage kartu app');

-- Catat lampiran atas nama owner budi (100000001).
select uji.simpan('a', public.x_lampiran_catat(100000001, 'rtujib0001', null, 't/rtujib0001/api-uji.png', 'Gambar uji', null, null));
select uji.sama(uji.ambil('a') ->> 'mimetype', 'image/png', 'x_lampiran_catat: mimetype dari metadata Storage');
select uji.sama(uji.ambil('a') ->> 'size', '1234', 'x_lampiran_catat: size dari metadata Storage');
select uji.sama(uji.ambil('a') ->> 'title', 'Gambar uji', 'x_lampiran_catat: title dipakai');
select uji.sama((uji.ambil('a') -> 'uploaded_by') ->> 'id', '100000001', 'x_lampiran_catat: pengunggah = aktor');
select uji.sama(uji.ambil('a') ->> 'sumber', 'app', 'x_lampiran_catat: sumber app');
select uji.cek((select count(*)::int from public.attachments where storage_path = 't/rtujib0001/api-uji.png' and deleted_at is null) = 1,
  'x_lampiran_catat: 1 baris attachment tercatat');

-- Idempoten per storage_path: panggil lagi → baris yang sama (bukan duplikat).
select uji.sama((public.x_lampiran_catat(100000001, 'rtujib0001', null, 't/rtujib0001/api-uji.png', 'nama lain', null, null)) ->> 'id',
  uji.ambil('a') ->> 'id', 'x_lampiran_catat: idempoten per path');

-- Path tidak sesuai tugas → 400.
select uji.galat($$select public.x_lampiran_catat(100000001, 'rtujib0001', null, 't/rtujib0002/x.png', null, null, null)$$,
  'PT400', 'x_lampiran_catat: path wajib t/<task>/<nama>', null, 'INPUT_001');

-- Berkas belum di Storage → 400.
select uji.galat($$select public.x_lampiran_catat(100000001, 'rtujib0001', null, 't/rtujib0001/belum.png', null, null, null)$$,
  'PT400', 'x_lampiran_catat: berkas belum terunggah', null, 'INPUT_001');

-- Tugas tak ada / tak terlihat → 404.
select uji.galat($$select public.x_lampiran_catat(100000001, 'tidakada', null, 't/tidakada/x.png', null, null, null)$$,
  'PT404', 'x_lampiran_catat: tugas tak ada → 404', null, 'ITEM_013');

-- Anggota nonaktif / tak dikenal (mulai_api) → 401.
select uji.galat($$select public.x_lampiran_catat(123456789, 'rtujib0001', null, 't/rtujib0001/x.png', null, null, null)$$,
  'PT401', 'x_lampiran_catat: aktor tak dikenal → 401', null, 'OAUTH_019');

-- Mode cermin: lampiran ke kartu ClickUp ditolak trigger (CERMIN_001).
select uji.jalan($$insert into storage.objects (bucket_id, name, metadata)
  values ('lampiran', 't/z8r3uj0001/api-cu.png', jsonb_build_object('mimetype','image/png','size','10'))$$,
  'seed objek Storage kartu ClickUp');
select uji.galat($$select public.x_lampiran_catat(100000001, 'z8r3uj0001', null, 't/z8r3uj0001/api-cu.png', null, null, null)$$,
  'PT409', 'x_lampiran_catat: kartu ClickUp saat cermin ditolak', null, 'CERMIN_001');

rollback;
