-- 22 · Pipeline: data order (revisi #3–#7) — web_pipeline_order_ubah (nominal, No SP, tanggal SP, No PO, pembayaran
-- Belum/DP/Lunas), status bayar awal, field baru di JSON, dan pencarian daftar yang diperluas (PIC, produk, No SP, No PO).
-- Aktor: budi (owner/admin), citra (rep, kode SP RSG), dodi (baca), eka (rep lain, kode SP MCE).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujiord1', 'PT Uji Order Sentosa', 'Surabaya');
insert into public.kontak (id, pelanggan_id, nama, telepon) values ('ktujiord1', 'plujiord1', 'Bapak Hartono Uji', '6281234567890');
-- lama1 = order LAMA (sudah ORDER sebelum migrasi; status bayar tidak diketahui); baru1 = lead BARU milik citra
insert into public.lead (id, pelanggan_id, kontak_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujiord1', 'plujiord1', 'ktujiord1', 'Google Ads', 100000002, 'BARU', null, null, null),
  ('ldujiord2', 'plujiord1', null, 'Referral', 900000000001, 'BARU', null, null, null);
update public.lead set bayar_status = null where id in ('ldujiord1', 'ldujiord2');
insert into public.lead_item (lead_id, produk, qty, spesifikasi) values
  ('ldujiord1', 'Pallet Mesh', 40, 'ukuran 1200x1000 galvanis'), ('ldujiord2', 'Roda', 8, null);
select uji.konteks(null, null);

-- ------------------------------------------------------------ status bayar awal (trigger)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('o', public.web_pipeline_tahap(jsonb_build_object('lead_id', 'ldujiord1', 'aksi', 'order', 'nomor', '41',
  'tanggal_sp', public.hari_ini_wib() - 3, 'nilai_transaksi', 10000000)));
select uji.sama(uji.ambil('o') ->> 'bayar_status', 'BELUM', 'lead yang menjadi ORDER otomatis bayar_status BELUM');
select uji.cek((uji.ambil('o') ->> 'no_sp') ~ '^41/RSG/', 'order: No SP dibangun dari nomor + kode SP pemilik');
reset role;
select uji.cek((select bayar_status is null from public.lead where id = 'ldujiord2'), 'lead non-ORDER tetap tanpa status bayar');

-- ------------------------------------------------------------ ubah data order (citra = pemilik)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('o', public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nilai_transaksi":12500000,"no_po":"  PO/HRT/  2026/117 "}'));
select uji.sama((uji.ambil('o') ->> 'nilai_transaksi')::bigint, 12500000::bigint, 'ubah: nominal order tersimpan');
select uji.sama(uji.ambil('o') ->> 'no_po', 'PO/HRT/ 2026/117', 'ubah: No PO dirapikan (tepi & spasi ganda)');
select uji.cek((uji.ambil('o') ->> 'no_sp') ~ '^41/RSG/', 'ubah tanpa nomor: No SP tidak disentuh');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nilai_transaksi":0}')$$,
  'PT400', 'ubah: nominal 0 ditolak', 'Nominal order', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_order_ubah(%L)', jsonb_build_object('lead_id', 'ldujiord1', 'tanggal_sp', public.hari_ini_wib() + 1)),
  'PT400', 'ubah: tanggal SP masa depan ditolak', 'masa depan', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_order_ubah(%L)', jsonb_build_object('lead_id', 'ldujiord1', 'no_po', repeat('x', 61))),
  'PT400', 'ubah: No PO > 60 karakter ditolak', '60', 'INPUT_001');
-- No SP dibangun ulang dari nomor + tanggal SP baru (bulan romawi & tahun mengikuti tanggal)
select uji.simpan('o', public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nomor":"77","tanggal_sp":"2026-01-15"}'));
select uji.sama(uji.ambil('o') ->> 'no_sp', '77/RSG/I/2026', 'ubah: No SP = nomor/KODE/ROMAWI/TAHUN dari tanggal SP');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","no_sp":"SP-77"}')$$,
  'PT400', 'ubah: No SP teks bebas di luar pola ditolak', 'pola', 'INPUT_001');
select uji.sama(public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","no_po":""}') ->> 'no_po', null, 'ubah: No PO kosong = dihapus');

-- ------------------------------------------------------------ pembayaran
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"DP"}')$$,
  'PT400', 'DP tanpa nominal ditolak', 'Nominal DP', 'INPUT_001');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"DP","bayar_dp":12500000}')$$,
  'PT400', 'DP >= nominal order ditolak (tandai Lunas)', 'Lunas', 'INPUT_001');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"SEBAGIAN"}')$$,
  'PT400', 'status bayar tak dikenal ditolak', null, 'INPUT_001');
select uji.simpan('o', public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"DP","bayar_dp":5000000}'));
select uji.cek(uji.ambil('o') ->> 'bayar_status' = 'DP' and (uji.ambil('o') ->> 'bayar_dp')::bigint = 5000000
  and uji.ambil('o') ->> 'tanggal_dp' = public.hari_ini_wib()::text, 'DP: nominal tersimpan, tanggal DP default hari ini');
select uji.sama(uji.ambil('o') ->> 'bayar_diubah_oleh_nama', 'citra lestari', 'DP: jejak siapa yang mencatat');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nilai_transaksi":4000000}')$$,
  'PT400', 'nominal order tidak boleh turun di bawah DP yang sudah dibayar', 'DP', 'INPUT_001');
select uji.galat(format('select public.web_pipeline_order_ubah(%L)', jsonb_build_object('lead_id', 'ldujiord1', 'bayar_status', 'LUNAS', 'tanggal_lunas', public.hari_ini_wib() + 1)),
  'PT400', 'tanggal lunas masa depan ditolak', 'masa depan', 'INPUT_001');
select uji.simpan('o', public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"LUNAS"}'));
select uji.cek(uji.ambil('o') ->> 'bayar_status' = 'LUNAS' and uji.ambil('o') ->> 'tanggal_lunas' = public.hari_ini_wib()::text
  and (uji.ambil('o') ->> 'bayar_dp')::bigint = 5000000, 'LUNAS: tanggal lunas default hari ini, riwayat DP dipertahankan');
select uji.simpan('o', public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","bayar_status":"BELUM"}'));
select uji.cek(uji.ambil('o') ->> 'bayar_status' = 'BELUM' and uji.ambil('o') ->> 'bayar_dp' is null
  and uji.ambil('o') ->> 'tanggal_lunas' is null, 'BELUM (salah tandai): DP & tanggal dihapus');
-- ubah nominal saja tidak mengubah jejak pembayaran
select uji.simpan('jejak', to_jsonb((select bayar_diubah_pada::text from public.lead where id = 'ldujiord1')));
select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nilai_transaksi":13000000}');
select uji.sama(to_jsonb((select bayar_diubah_pada::text from public.lead where id = 'ldujiord1')), uji.ambil('jejak'),
  'ubah nominal saja: jejak pembayaran tidak berubah');
reset role;

-- ------------------------------------------------------------ hak & aturan
select uji.jadi('11111111-1111-4111-8111-111111111111');   -- owner: lolos cek hak, jadi aturan tahap yang diuji
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord2","no_po":"X"}')$$,
  'PT409', 'lead non-ORDER: data order ditolak', 'ORDER', 'KONFLIK_001');
reset role;
update public.lead set tahap = 'ORDER', no_sp = '5/RSG/X/2026', tanggal_sp = public.hari_ini_wib(), nilai_transaksi = 900000 where id = 'ldujiord2';
select uji.sama((select bayar_status from public.lead where id = 'ldujiord2'), 'BELUM', 'trigger: update tahap → ORDER memberi status BELUM');
update public.lead set bayar_status = null where id = 'ldujiord2';   -- tiru order lama (belum dicatat)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord2","no_po":"X"}')$$,
  'PT403', 'rep lain: order milik eka ditolak', 'rep lain', 'ACCESS_001');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","nomor":"5","tanggal_sp":"2026-10-01"}')$$,
  'PT409', 'No SP kembar dengan lead lain ditolak', 'dipakai', 'KONFLIK_001');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","no_po":"X"}')$$,
  'PT403', 'peran baca: tidak boleh mengubah order', null, 'ACCESS_001');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(public.web_pipeline_order_ubah('{"lead_id":"ldujiord2","bayar_status":"LUNAS","tanggal_lunas":"2026-10-02"}') ->> 'bayar_status',
  'LUNAS', 'owner: boleh mengubah order siapa pun (order lama → dicatat lunas)');
reset role;
select uji.jadi_anon();
select uji.galat($$select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1"}')$$, '42501', 'anon: tidak bisa memanggil web_pipeline_order_ubah');
reset role;

-- ------------------------------------------------------------ pencarian (#4) & field ringkas
select uji.jadi('11111111-1111-4111-8111-111111111111');
select public.web_pipeline_order_ubah('{"lead_id":"ldujiord1","no_po":"PO-HRT-117"}');
create function pg_temp.cari(q text, tab text default 'semua') returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}')
    from jsonb_array_elements(public.web_pipeline_daftar(jsonb_build_object('tab', tab, 'q', q)) -> 'items') e
   where e ->> 'id' like 'ldujiord%'
$$;
select uji.sama(pg_temp.cari('order sentosa'), array['ldujiord1', 'ldujiord2'], 'cari: nama perusahaan');
select uji.sama(pg_temp.cari('hartono'), array['ldujiord1', 'ldujiord2'], 'cari: nama PIC/customer (semua lead pelanggan itu)');
select uji.sama(pg_temp.cari('galvanis'), array['ldujiord1'], 'cari: spesifikasi produk');
select uji.sama(pg_temp.cari('roda'), array['ldujiord2'], 'cari: nama produk');
select uji.sama(pg_temp.cari('hrt-117'), array['ldujiord1'], 'cari: No PO sebagian');
select uji.sama(pg_temp.cari('5/RSG'), array['ldujiord2'], 'cari: No SP sebagian');
select uji.sama(pg_temp.cari('100%'), array[]::text[], 'cari: % dari pengguna bukan wildcard');
select uji.sama(pg_temp.cari(null, 'order'), array['ldujiord1', 'ldujiord2'], 'tab order: kedua order');
select uji.simpan('r', (select e from jsonb_array_elements(public.web_pipeline_daftar('{"tab":"order"}') -> 'items') e where e ->> 'id' = 'ldujiord1'));
select uji.cek(uji.ambil('r') ?& array['tanggal_sp', 'no_po', 'bayar_status', 'bayar_dp', 'tanggal_dp', 'tanggal_lunas'], 'baris ringkas memuat field order baru');
reset role;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(pg_temp.cari('hartono'), array[]::text[], 'baca: tidak bisa mencari nama PIC (PIC disamarkan untuknya)');
select uji.sama(pg_temp.cari('hrt-117'), array['ldujiord1'], 'baca: No PO tetap bisa dicari');
reset role;

-- ------------------------------------------------------------ hak fungsi
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_order_ubah(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_order_ubah(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_order_ubah(jsonb)', 'EXECUTE'), 'web_pipeline_order_ubah hanya authenticated');
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_order_ubah(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.inti_pipeline_order_ubah(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_lead_bayar_awal()', 'EXECUTE'), 'inti & trigger order internal');

rollback;
