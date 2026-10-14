-- 24 · Pipeline: nilai penawaran WAJIB > 0 saat "Kirim penawaran" (20261014120000, keputusan Hannes 14 Okt).
-- Aktor: budi (owner/admin), citra (rep, kode SP RSG).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujinp1', 'PT Uji Nilai Penawaran', 'Bekasi');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap) values
  ('ldujinp1', 'plujinp1', 'Google Ads', 100000002, 'BARU'),
  ('ldujinp2', 'plujinp1', 'Website organik', 100000002, 'BARU');
insert into public.lead_item (lead_id, produk, qty) values ('ldujinp1', 'Pallet Mesh', 40), ('ldujinp2', 'Roda', 8);
select uji.konteks(null, null);

select uji.jadi('22222222-2222-4222-8222-222222222222');   -- citra (rep pemilik)

select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujinp1","aksi":"penawaran"}')$q$,
  'PT400', 'penawaran tanpa nilai ditolak', 'Nilai penawaran wajib');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujinp1","aksi":"penawaran","nilai_penawaran":"0"}')$q$,
  'PT400', 'penawaran nilai 0 ditolak', 'Nilai penawaran wajib');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujinp1","aksi":"penawaran","nilai_penawaran":""}')$q$,
  'PT400', 'penawaran nilai kosong ditolak', 'Nilai penawaran wajib');

select uji.simpan('np1', public.web_pipeline_tahap('{"lead_id":"ldujinp1","aksi":"penawaran","nilai_penawaran":"24500000"}'));
select uji.sama((select tahap from public.lead where id = 'ldujinp1'), 'PENAWARAN', 'tahap jadi PENAWARAN');
select uji.sama((select nilai_penawaran from public.lead where id = 'ldujinp1'), 24500000::bigint, 'nilai tersimpan');
select uji.cek((select tanggal_penawaran from public.lead where id = 'ldujinp1') is not null, 'tanggal penawaran terisi');

-- penawaran ulang tanpa angka baru: memakai nilai lama (> 0)
select uji.simpan('np2', public.web_pipeline_tahap('{"lead_id":"ldujinp1","aksi":"penawaran"}'));
select uji.sama((select nilai_penawaran from public.lead where id = 'ldujinp1'), 24500000::bigint, 'penawaran ulang pakai nilai lama');

-- aksi lain tidak terpengaruh
select uji.simpan('bt', public.web_pipeline_tahap('{"lead_id":"ldujinp2","aksi":"batal","alasan_batal":"Tidak ada respon"}'));
select uji.sama((select tahap from public.lead where id = 'ldujinp2'), 'BATAL', 'batal tetap jalan tanpa nilai penawaran');

rollback;
