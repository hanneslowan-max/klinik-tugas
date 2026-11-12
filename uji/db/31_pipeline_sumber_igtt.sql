-- 31 · Pipeline: pilihan Sumber lead "Instagram/TikTok organik" (20261021140000_pipeline_sumber_igtt, permintaan Hannes
-- 21 Okt 2026: chat dari akun organik IG/TikTok Bu Lastri, sapaan "Halo Bu Lastri"; iklan tetap "Meta Ads").
-- CHECK lead.sumber diganti superset: nilai baru diterima di semua jalur (buat lead, ubah lead, ringkasan per sumber),
-- 8 nilai lama tetap sah, nilai asal-asalan (ejaan lain, huruf kecil, "Tiktok") tetap ditolak tanpa mengubah data,
-- tepat SATU CHECK di kolom sumber (bernama lead_sumber_check), dan migrasi aman dijalankan ulang.
-- Aktor: budi (owner/admin), citra (rep, kode SP RSG).
-- Nomor 31: nomor 30 dipakai PR #23 (30_pipeline_sumber_bukti.sql).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;

-- CHECK yang hanya menyangkut kolom sumber (nama + definisi)
create function pg_temp.cek_sumber() returns table (nama text, def text) language sql as $$
  select c.conname::text, pg_get_constraintdef(c.oid)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'sumber'
   where c.conrelid = 'public.lead'::regclass and c.contype = 'c' and c.conkey = array[a.attnum]
$$;

-- ------------------------------------------------------------ bentuk constraint
select uji.sama((select count(*)::int from pg_temp.cek_sumber()), 1, 'tepat satu CHECK di kolom lead.sumber');
select uji.sama((select nama from pg_temp.cek_sumber()), 'lead_sumber_check', 'CHECK bernama lead_sumber_check');
select uji.cek((select def from pg_temp.cek_sumber()) like '%''Instagram/TikTok organik''%', 'CHECK memuat Instagram/TikTok organik');
select uji.cek((select c.convalidated from pg_constraint c where c.conrelid = 'public.lead'::regclass and c.conname = 'lead_sumber_check'),
  'CHECK tervalidasi (semua baris yang ada sah)');

-- migrasi dijalankan ulang (idempoten): tetap satu constraint, definisi sama
select uji.simpan('def0', to_jsonb((select def from pg_temp.cek_sumber())));
\ir ../../supabase/migrations/20261021140000_pipeline_sumber_igtt.sql
select uji.sama((select count(*)::int from pg_temp.cek_sumber()), 1, 'jalan ulang migrasi: tetap satu CHECK sumber');
select uji.sama(to_jsonb((select def from pg_temp.cek_sumber())), uji.ambil('def0'), 'jalan ulang migrasi: definisi sama');

-- ------------------------------------------------------------ 9 nilai sah diterima (8 lama + baru)
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujiigt1', 'PT Uji Sumber IGTT');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap)
select 'ldujiigt' || lpad(n::text, 2, '0'), 'plujiigt1', s, 100000002, 'BARU'
  from unnest(array['Google Ads', 'Meta Ads', 'Website organik', 'Instagram/TikTok organik', 'WA langsung', 'Telepon',
                    'Referral', 'Repeat order', 'Lainnya']) with ordinality as t(s, n);
insert into public.lead_item (lead_id, produk, qty) select id, 'Roda', 1 from public.lead where id like 'ldujiigt%';
select uji.konteks(null, null);
select uji.sama((select count(distinct sumber)::int from public.lead where id like 'ldujiigt%'), 9,
  'insert langsung: 9 nilai sumber (8 lama + Instagram/TikTok organik) diterima');

-- ------------------------------------------------------------ nilai asal-asalan tetap ditolak (insert langsung)
select uji.galat($q$insert into public.lead (pelanggan_id, sumber) values ('plujiigt1', 'Tiktok')$q$,
  '23514', 'sumber "Tiktok" ditolak', 'lead_sumber_check');
select uji.galat($q$insert into public.lead (pelanggan_id, sumber) values ('plujiigt1', 'instagram/tiktok organik')$q$,
  '23514', 'sumber huruf kecil ditolak (persis, peka huruf)', 'lead_sumber_check');
select uji.galat($q$insert into public.lead (pelanggan_id, sumber) values ('plujiigt1', 'Instagram organik')$q$,
  '23514', 'sumber "Instagram organik" (ejaan lain) ditolak', 'lead_sumber_check');
select uji.galat($q$insert into public.lead (pelanggan_id, sumber) values ('plujiigt1', 'Instagram/TikTok organik ')$q$,
  '23514', 'sumber dengan spasi di ujung ditolak', 'lead_sumber_check');
select uji.galat($q$insert into public.lead (pelanggan_id, sumber) values ('plujiigt1', 'Instagram/TikTok Ads')$q$,
  '23514', 'sumber "Instagram/TikTok Ads" ditolak (iklan = Meta Ads)', 'lead_sumber_check');

-- ------------------------------------------------------------ jalur web rep: buat & ubah lead
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('baru', public.web_pipeline_lead_buat(
  '{"sumber":"Instagram/TikTok organik","pelanggan":{"nama":"PT Uji IGTT Web"},"items":[{"produk":"Pallet Mesh","qty":3}]}'));
select uji.sama(uji.ambil('baru') ->> 'sumber', 'Instagram/TikTok organik', 'rep: web_pipeline_lead_buat dengan Instagram/TikTok organik jalan');
select uji.galat($q$select public.web_pipeline_lead_buat('{"sumber":"TikTok","pelanggan":{"nama":"PT Uji IGTT Salah"},"items":[{"produk":"Roda","qty":1}]}')$q$,
  '23514', 'rep: web_pipeline_lead_buat dengan sumber asal-asalan ditolak', 'lead_sumber_check');
reset role;
select uji.sama((select count(*)::int from public.pelanggan where nama = 'PT Uji IGTT Salah'), 0,
  'buat lead yang ditolak tidak meninggalkan pelanggan');

select uji.simpan('lead05', to_jsonb((select l from public.lead l where l.id = 'ldujiigt05')) - 'cari');   -- WA langsung
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.web_pipeline_lead_ubah('{"lead_id":"ldujiigt05","sumber":"IG/TikTok organik"}')$q$,
  '23514', 'rep: ubah sumber ke nilai asal-asalan ditolak', 'lead_sumber_check');
reset role;
select uji.sama(to_jsonb((select l from public.lead l where l.id = 'ldujiigt05')) - 'cari', uji.ambil('lead05'),
  'ubah yang ditolak tidak mengubah lead');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama(public.web_pipeline_lead_ubah('{"lead_id":"ldujiigt05","sumber":"Instagram/TikTok organik"}') ->> 'sumber',
  'Instagram/TikTok organik', 'rep: ubah sumber WA langsung → Instagram/TikTok organik jalan');
select uji.sama(public.web_pipeline_lead(uji.ambil('baru') ->> 'id') ->> 'sumber',
  'Instagram/TikTok organik', 'rep: detail lead menampilkan sumber baru');
reset role;

-- ------------------------------------------------------------ ringkasan per sumber
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('ringkas', public.web_pipeline_ringkas('{}'));
reset role;
select uji.sama(
  (select (e ->> 'leads')::int from jsonb_array_elements(uji.ambil('ringkas') -> 'per_sumber') e
    where e ->> 'sumber' = 'Instagram/TikTok organik'),
  (select count(*)::int from public.lead where sumber = 'Instagram/TikTok organik'),
  'ringkasan per_sumber memuat baris Instagram/TikTok organik dengan jumlah lead yang benar');

rollback;
