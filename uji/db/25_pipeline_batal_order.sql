-- 25 · Pipeline: Batalkan order (20261014130000, revisi Hannes 14 Okt: "customer bisa membatalkan setelah terjadi order").
-- web_pipeline_tahap aksi 'batal_order': lead ORDER → BATAL dengan alasan TERTULIS wajib (5–500 karakter sesudah trim),
-- data order tetap tersimpan, jejak riwayat tahap + aktivitas, hak (rep pemilik / admin), penjaga aksi lain di lead ORDER,
-- dan dampaknya ke daftar (tab Order/Batal) & Ringkasan (dibandingkan sebelum/sesudah, jadi data sisa tidak berpengaruh).
-- Aktor: budi (owner/admin), citra (rep, kode SP RSG), dodi (baca), eka (rep lain, kode SP MCE).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama, kota) values ('plujibo1', 'PT Uji Batal Order', 'Sidoarjo');
-- bo1 = order citra (DP, rencana FU); bo2 = order eka (lunas); bo3 & bo8 = order impor tanpa pemilik.
-- Lead order masuk Juni (kohort win-rate sudah matang), SP Oktober 2026.
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi, no_po,
  bayar_status, bayar_dp, tanggal_dp, tanggal_lunas, nilai_penawaran, fu_berikutnya) values
  ('ldujibo1', 'plujibo1', 'Google Ads', 100000002, 'ORDER', '2026-06-02', '9901/RSG/X/2026', '2026-10-05', 25000000, 'PO/UJI/BO-1',
   'DP', 5000000, '2026-10-06', null, 24000000, '2026-11-03'),
  ('ldujibo2', 'plujibo1', 'Referral', 900000000001, 'ORDER', '2026-06-03', '9902/MCE/X/2026', '2026-10-06', 7000000, null,
   'LUNAS', null, null, '2026-10-08', null, null),
  ('ldujibo3', 'plujibo1', 'Telepon', null, 'ORDER', '2026-06-04', '9903/RSG/X/2026', '2026-10-07', 3000000, null,
   'BELUM', null, null, null, null, null),
  ('ldujibo8', 'plujibo1', 'Telepon', null, 'ORDER', '2026-06-05', '9904/RSG/X/2026', '2026-10-08', 2000000, null,
   'BELUM', null, null, null, null, null);
-- bo4 = penawaran citra; bo5–bo7 = lead BARU citra
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, nilai_penawaran) values
  ('ldujibo4', 'plujibo1', 'Website organik', 100000002, 'PENAWARAN', '2026-10-01', 5000000),
  ('ldujibo5', 'plujibo1', 'WA langsung', 100000002, 'BARU', '2026-10-01', null),
  ('ldujibo6', 'plujibo1', 'Telepon', 100000002, 'BARU', '2026-10-01', null),
  ('ldujibo7', 'plujibo1', 'Google Ads', 100000002, 'BARU', '2026-10-01', null);
insert into public.lead_item (lead_id, produk, qty) values ('ldujibo1', 'Pallet Mesh', 40), ('ldujibo2', 'Roda', 8);
select uji.konteks(null, null);

-- baris lead TANPA kolom yang memang berubah saat batal order (termasuk fu_berikutnya: dikosongkan) → pembanding:
-- data order, pemilik, dst. harus utuh
create function pg_temp.baris(p_id text) returns jsonb language sql as $$
  select to_jsonb(l) - array['tahap', 'alasan_batal', 'alasan_batal_lain', 'diperbarui_pada', 'diam_sejak', 'fu_berikutnya'] from public.lead l where l.id = p_id
$$;
create function pg_temp.batal(p_lead text, p_alasan text) returns text language sql as $$
  select format('select public.web_pipeline_tahap(%L)', jsonb_build_object('lead_id', p_lead, 'aksi', 'batal_order', 'alasan', p_alasan))
$$;
create function pg_temp.daftar(p_tab text, p_q text default null) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}')
    from jsonb_array_elements(public.web_pipeline_daftar(jsonb_build_object('tab', p_tab, 'q', p_q)) -> 'items') e
   where e ->> 'id' like 'ldujibo%'
$$;
-- angka Ringkasan yang terdampak (bulan SP 2026-10, bulan lead masuk 2026-06, win-rate, per alasan batal)
create function pg_temp.rk() returns jsonb language sql as $$
  with r as materialized (select public.web_pipeline_ringkas('{}') j),
  b as (select e from r, jsonb_array_elements(r.j -> 'bulan') e)
  select jsonb_build_object(
    'order_dibatalkan', coalesce((select (e ->> 'jumlah')::int from r, jsonb_array_elements(r.j -> 'per_alasan_batal') e
                                   where e ->> 'alasan' = 'Order dibatalkan'), 0),
    'order_okt', coalesce((select (e ->> 'order')::int from b where e ->> 'bulan' = '2026-10'), 0),
    'omzet_okt', coalesce((select (e ->> 'omzet_total')::bigint from b where e ->> 'bulan' = '2026-10'), 0),
    'batal_jun', coalesce((select (e ->> 'batal')::int from b where e ->> 'bulan' = '2026-06'), 0),
    'wr_order', (select (r.j -> 'win_rate' -> 'semua' ->> 'order')::int from r),
    'wr_batal', (select (r.j -> 'win_rate' -> 'semua' ->> 'batal')::int from r))
$$;
create function pg_temp.selisih(lama jsonb, baru jsonb) returns jsonb language sql as $$
  select jsonb_object_agg(k, (baru ->> k)::bigint - (lama ->> k)::bigint) from jsonb_object_keys(baru) k
$$;
grant execute on function pg_temp.batal(text, text), pg_temp.daftar(text, text), pg_temp.rk() to authenticated;

select uji.simpan('snap1', pg_temp.baris('ldujibo1'));
select uji.simpan('snap2', pg_temp.baris('ldujibo2'));
select uji.simpan('snap3', pg_temp.baris('ldujibo3'));
select uji.cek(uji.ambil('snap1') ?& array['no_sp', 'tanggal_sp', 'nilai_transaksi', 'no_po', 'bayar_status', 'bayar_dp', 'tanggal_dp',
    'tanggal_lunas', 'pemilik'] and uji.ambil('snap1') ->> 'no_sp' = '9901/RSG/X/2026'
  and uji.ambil('snap2') ->> 'bayar_status' = 'LUNAS' and uji.ambil('snap3') ->> 'no_sp' = '9903/RSG/X/2026',
  'pembanding awal memuat data order (No SP, tanggal, nominal, No PO, pembayaran, pemilik)');
select uji.simpan('n1', jsonb_build_object(
  'riwayat', (select count(*) from public.lead_riwayat_tahap where lead_id = 'ldujibo1'),
  'aktivitas', (select count(*) from public.lead_aktivitas where lead_id = 'ldujibo1')));

-- ------------------------------------------------------------ keadaan awal
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('rk0', pg_temp.rk());
select uji.sama(pg_temp.daftar('order'), array['ldujibo1', 'ldujibo2', 'ldujibo3', 'ldujibo8'], 'awal: tab Order memuat keempat order');
select uji.sama(pg_temp.daftar('batal'), array[]::text[], 'awal: tab Batal kosong');

-- ------------------------------------------------------------ penjaga: lead ORDER hanya keluar lewat 'batal_order'
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"penawaran","nilai_penawaran":"30000000"}')$q$,
  'PT409', 'lead ORDER: aksi penawaran ditolak (admin pun)', 'Lead sudah ORDER', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"order","no_sp":"9911/RSG/X/2026","tanggal_sp":"2026-10-05","nilai_transaksi":"1000000"}')$q$,
  'PT409', 'lead ORDER: aksi order ulang ditolak', 'Lead sudah ORDER', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"batal","alasan_batal":"Harga"}')$q$,
  'PT409', 'lead ORDER: batal biasa (tanpa alasan tertulis) ditolak', 'Batalkan order', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"alihkan","dialihkan_ke":"Cabang Surabaya"}')$q$,
  'PT409', 'lead ORDER: alihkan ditolak', 'Lead sudah ORDER', 'KONFLIK_001');
select uji.galat(pg_temp.batal('ldtidakada', 'Customer batal'), 'PT404', 'batal order: lead tidak ada → 404', 'tidak ditemukan', 'ITEM_013');
reset role;

-- ------------------------------------------------------------ validasi alasan (citra = rep pemilik bo1)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"batal_order"}')$q$,
  'PT400', 'alasan tidak dikirim ditolak', 'Alasan pembatalan wajib ditulis (minimal 5 karakter)', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', null), 'PT400', 'alasan null ditolak', 'minimal 5 karakter', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', ''), 'PT400', 'alasan kosong ditolak', 'minimal 5 karakter', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', E' \t\r\n  \n\t'), 'PT400', 'alasan hanya spasi/tab/baris baru ditolak', 'minimal 5 karakter', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', 'abcd'), 'PT400', 'alasan 4 karakter ditolak', 'minimal 5 karakter', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', E'  abcd \r\n'), 'PT400', 'alasan 4 karakter sesudah trim ditolak (tepi tidak ikut dihitung)',
  'minimal 5 karakter', 'INPUT_001');
select uji.galat(pg_temp.batal('ldujibo1', repeat('x', 501)), 'PT400', 'alasan 501 karakter ditolak', 'maksimal 500 karakter', 'INPUT_001');
reset role;

-- ------------------------------------------------------------ hak
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat(pg_temp.batal('ldujibo1', 'Customer batal'), 'PT403', 'peran baca: tidak bisa membatalkan order', 'akses tulis', 'ACCESS_001');
reset role;
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.galat(pg_temp.batal('ldujibo1', 'Customer batal'), 'PT403', 'rep lain (eka): order milik citra ditolak', 'rep lain', 'ACCESS_001');
select uji.galat(pg_temp.batal('ldujibo3', 'Customer batal'), 'PT403', 'rep (eka): order TANPA pemilik ditolak (Klaim dulu)',
  'Hanya rep pemilik lead atau admin yang bisa membatalkan order', 'ACCESS_001');
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat(pg_temp.batal('ldujibo2', 'Customer batal'), 'PT403', 'rep lain (citra): order milik eka ditolak', 'rep lain', 'ACCESS_001');
select uji.galat(pg_temp.batal('ldujibo3', 'Customer batal'), 'PT403', 'rep (citra): order TANPA pemilik ditolak (Klaim dulu)',
  'Hanya rep pemilik lead atau admin', 'ACCESS_001');
select uji.galat(pg_temp.batal('ldujibo4', 'Customer batal'), 'PT409', 'lead PENAWARAN milik sendiri: batal order ditolak',
  'Batalkan order hanya untuk lead berstatus ORDER', 'KONFLIK_001');
select uji.galat(pg_temp.batal('ldujibo5', 'Customer batal'), 'PT409', 'lead BARU milik sendiri: batal order ditolak', 'hanya untuk lead berstatus ORDER', 'KONFLIK_001');
select uji.galat($q$select public.inti_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"batal_order","alasan":"Customer batal"}')$q$,
  '42501', 'authenticated: inti_pipeline_tahap tidak bisa dipanggil langsung');
reset role;
select uji.jadi_anon();
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"batal_order","alasan":"Customer batal"}')$q$,
  '42501', 'anon: web_pipeline_tahap (batal order) ditolak');
reset role;
select uji.jadi_service();
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo1","aksi":"batal_order","alasan":"Customer batal"}')$q$,
  '42501', 'service_role: web_pipeline_tahap (batal order) ditolak');
reset role;
select uji.cek((select bool_and(tahap = 'ORDER') from public.lead where id in ('ldujibo1', 'ldujibo2', 'ldujibo3', 'ldujibo8'))
  and (select count(*) from public.lead_riwayat_tahap where lead_id = 'ldujibo1') = (uji.ambil('n1') ->> 'riwayat')::bigint
  and (select count(*) from public.lead_aktivitas where lead_id = 'ldujibo1') = (uji.ambil('n1') ->> 'aktivitas')::bigint,
  'semua percobaan yang ditolak tidak mengubah tahap maupun jejak');

-- ------------------------------------------------------------ berhasil: citra membatalkan ordernya sendiri
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('b1', public.web_pipeline_tahap(jsonb_build_object('lead_id', 'ldujibo1', 'aksi', 'batal_order',
  'alasan', E'  \r\n\tCustomer membatalkan PO:\r\nproyek gudang ditunda ke 2027 \r\n  ')));
select uji.sama(uji.ambil('b1') ->> 'tahap', 'BATAL', 'citra (rep pemilik): order dibatalkan → tahap BATAL');
select uji.sama(uji.ambil('b1') ->> 'alasan_batal', 'Order dibatalkan', 'kategori alasan batal = "Order dibatalkan"');
select uji.sama(uji.ambil('b1') ->> 'alasan_batal_lain', E'Customer membatalkan PO:\nproyek gudang ditunda ke 2027',
  'alasan tertulis dirapikan: spasi/tab/baris baru di tepi dibuang, CRLF → LF, baris baru di tengah tetap');
select uji.cek(uji.ambil('b1') ->> 'no_sp' = '9901/RSG/X/2026' and (uji.ambil('b1') ->> 'nilai_transaksi')::bigint = 25000000
  and uji.ambil('b1') ->> 'no_po' = 'PO/UJI/BO-1' and uji.ambil('b1') ->> 'bayar_status' = 'DP'
  and (uji.ambil('b1') ->> 'pemilik')::bigint = 100000002, 'JSON hasil: data order & pemilik tetap tampil');
select uji.sama(uji.ambil('b1') -> 'aktivitas' -> 0 ->> 'hasil', E'Order dibatalkan. Alasan: Customer membatalkan PO:\nproyek gudang ditunda ke 2027',
  'JSON hasil: aktivitas teratas = catatan pembatalan berisi alasan');
select uji.cek(uji.ambil('b1') -> 'riwayat_tahap' -> -1 @> '{"dari":"ORDER","ke":"BATAL"}', 'JSON hasil: riwayat tahap terakhir ORDER → BATAL');
reset role;
select uji.sama(pg_temp.baris('ldujibo1'), uji.ambil('snap1'),
  'data order (No SP, tanggal SP, nominal, No PO, DP & tanggal DP), pemilik, penawaran & FU tidak disentuh');
select uji.cek((select tahap = 'BATAL' and alasan_batal = 'Order dibatalkan'
  and alasan_batal_lain = E'Customer membatalkan PO:\nproyek gudang ditunda ke 2027' from public.lead where id = 'ldujibo1'), 'tabel: tahap & alasan tersimpan');
select uji.sama((select count(*) from public.lead_riwayat_tahap where lead_id = 'ldujibo1'), (uji.ambil('n1') ->> 'riwayat')::bigint + 1,
  'jejak: tepat satu baris riwayat tahap baru');
select uji.sama((select format('%s→%s oleh %s', dari, ke, oleh) from public.lead_riwayat_tahap where lead_id = 'ldujibo1' order by id desc limit 1),
  'ORDER→BATAL oleh 100000002', 'jejak: riwayat ORDER → BATAL oleh citra');
select uji.sama((select count(*) from public.lead_aktivitas where lead_id = 'ldujibo1'), (uji.ambil('n1') ->> 'aktivitas')::bigint + 1,
  'jejak: tepat satu aktivitas baru');
select uji.cek((select a.jenis = 'Catatan' and a.oleh = 100000002 and a.rencana_berikutnya is null
    and a.hasil = E'Order dibatalkan. Alasan: Customer membatalkan PO:\nproyek gudang ditunda ke 2027'
  from public.lead_aktivitas a where a.lead_id = 'ldujibo1' order by a.id desc limit 1),
  'jejak: aktivitas Catatan (pelaku citra, teks alasan, tanpa rencana FU)');
select uji.cek((select fu_berikutnya is null from public.lead where id = 'ldujibo1'), 'rencana FU (2026-11-03) dikosongkan: order batal tidak di-follow-up');

-- ------------------------------------------------------------ sesudah dibatalkan
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat(pg_temp.batal('ldujibo1', 'Batal sekali lagi'), 'PT409', 'batal order kedua kali ditolak (sudah BATAL)',
  'hanya untuk lead berstatus ORDER', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_order_ubah('{"lead_id":"ldujibo1","no_po":"PO-BARU"}')$q$,
  'PT409', 'data order lead yang dibatalkan tidak bisa diubah lagi', 'hanya untuk lead berstatus ORDER', 'KONFLIK_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo7","aksi":"order","nomor":"9901","tanggal_sp":"2026-10-10","nilai_transaksi":"1000000"}')$q$,
  'PT409', 'No SP order yang dibatalkan tetap terpakai (lead lain tidak bisa memakainya)', 'dipakai', 'KONFLIK_001');
reset role;

-- ------------------------------------------------------------ admin: order rep lain & order tanpa pemilik; batas panjang
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('b2', public.web_pipeline_tahap('{"lead_id":"ldujibo2","aksi":"batal_order","alasan":"Mahal"}'));
select uji.cek(uji.ambil('b2') ->> 'tahap' = 'BATAL' and uji.ambil('b2') ->> 'alasan_batal_lain' = 'Mahal',
  'admin: order milik rep lain bisa dibatalkan; alasan tepat 5 karakter diterima');
select uji.simpan('b3', public.web_pipeline_tahap(jsonb_build_object('lead_id', 'ldujibo3', 'aksi', 'batal_order',
  'alasan', '  ' || repeat('é', 500) || E'\n')));
select uji.cek(uji.ambil('b3') ->> 'tahap' = 'BATAL' and char_length(uji.ambil('b3') ->> 'alasan_batal_lain') = 500
  and uji.ambil('b3') ->> 'pemilik' is null, 'admin: order tanpa pemilik bisa dibatalkan; tepat 500 karakter (multibyte) sesudah trim diterima');
reset role;
select uji.sama(pg_temp.baris('ldujibo2'), uji.ambil('snap2'), 'order eka (lunas): data order, pembayaran & pemilik utuh');
select uji.sama(pg_temp.baris('ldujibo3'), uji.ambil('snap3'), 'order tanpa pemilik: data order utuh, pemilik tetap kosong');
select uji.sama((select format('%s→%s oleh %s', dari, ke, oleh) from public.lead_riwayat_tahap where lead_id = 'ldujibo2' order by id desc limit 1),
  'ORDER→BATAL oleh 100000001', 'jejak: pelaku riwayat = admin yang membatalkan');
select uji.cek((select a.oleh = 100000001 and a.hasil = 'Order dibatalkan. Alasan: Mahal' and a.rencana_berikutnya is null
  from public.lead_aktivitas a where a.lead_id = 'ldujibo2' order by a.id desc limit 1)
  and (select fu_berikutnya is null from public.lead where id = 'ldujibo2'), 'tanpa rencana FU: aktivitas tanpa rencana, FU tetap kosong');

-- ------------------------------------------------------------ order tanpa pemilik: rep Klaim dulu, lalu boleh membatalkan
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama((public.web_pipeline_lead_ubah('{"lead_id":"ldujibo8","klaim":true}') ->> 'pemilik')::bigint, 100000002::bigint,
  'citra meng-Klaim order tanpa pemilik');
select uji.sama(public.web_pipeline_tahap('{"lead_id":"ldujibo8","aksi":"batal_order","alasan":"Customer pindah supplier"}') ->> 'tahap',
  'BATAL', 'sesudah Klaim, rep pemilik bisa membatalkan order');
reset role;

-- ------------------------------------------------------------ detail, daftar & Ringkasan
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.simpan('d', public.web_pipeline_lead('ldujibo1'));
select uji.cek(uji.ambil('d') ->> 'tahap' = 'BATAL' and uji.ambil('d') ->> 'no_sp' = '9901/RSG/X/2026'
  and (uji.ambil('d') ->> 'nilai_transaksi')::bigint = 25000000 and uji.ambil('d') ->> 'alasan_batal' = 'Order dibatalkan'
  and uji.ambil('d') ->> 'alasan_batal_lain' like 'Customer membatalkan PO:%', 'detail lead (peran baca): data order & alasan pembatalan tetap tampil');
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(pg_temp.daftar('order'), array[]::text[], 'tab Order: order yang dibatalkan keluar');
select uji.sama(pg_temp.daftar('batal'), array['ldujibo1', 'ldujibo2', 'ldujibo3', 'ldujibo8'], 'tab Batal: order yang dibatalkan masuk');
select uji.sama(pg_temp.daftar('semua', '9901/RSG'), array['ldujibo1'], 'No SP order yang dibatalkan tetap bisa dicari');
select uji.simpan('r1', (select e from jsonb_array_elements(public.web_pipeline_daftar('{"tab":"batal"}') -> 'items') e where e ->> 'id' = 'ldujibo1'));
select uji.cek(uji.ambil('r1') ->> 'no_sp' = '9901/RSG/X/2026' and (uji.ambil('r1') ->> 'nilai_transaksi')::bigint = 25000000
  and uji.ambil('r1') ->> 'bayar_status' = 'DP', 'baris tab Batal tetap membawa data order');
select uji.simpan('rk1', pg_temp.rk());
reset role;
select uji.simpan('s1', pg_temp.selisih(uji.ambil('rk0'), uji.ambil('rk1')));
select uji.sama((uji.ambil('s1') ->> 'order_dibatalkan')::int, 4, 'Ringkasan per alasan batal: +4 "Order dibatalkan"');
select uji.cek((uji.ambil('s1') ->> 'order_okt')::int = -4 and (uji.ambil('s1') ->> 'omzet_okt')::bigint = -37000000,
  'Ringkasan bulan SP: jumlah order & omzet berkurang (hanya tahap ORDER yang dihitung)');
select uji.sama((uji.ambil('s1') ->> 'batal_jun')::int, 4, 'Ringkasan bulan lead masuk: terhitung batal');
select uji.cek((uji.ambil('s1') ->> 'wr_order')::int = -4 and (uji.ambil('s1') ->> 'wr_batal')::int = 4,
  'win-rate: pindah dari menang (ORDER) ke kalah/tak jadi');

-- ------------------------------------------------------------ order ulang (API) lead yang dibatalkan: alasan lama dikosongkan
select uji.jadi('44444444-4444-4444-8444-444444444444');
select uji.simpan('ro', public.web_pipeline_tahap(
  '{"lead_id":"ldujibo2","aksi":"order","no_sp":"9902/MCE/X/2026","tanggal_sp":"2026-10-06","nilai_transaksi":"7500000"}'));
select uji.cek(uji.ambil('ro') ->> 'tahap' = 'ORDER' and uji.ambil('ro') ->> 'alasan_batal' is null and uji.ambil('ro') ->> 'alasan_batal_lain' is null,
  'order ulang lead yang dibatalkan: alasan batal lama dikosongkan');
select uji.sama(uji.ambil('ro') ->> 'no_sp', '9902/MCE/X/2026', 'order ulang boleh memakai No SP miliknya sendiri');
reset role;
select uji.sama((select format('%s→%s oleh %s', dari, ke, oleh) from public.lead_riwayat_tahap where lead_id = 'ldujibo2' order by id desc limit 1),
  'BATAL→ORDER oleh 900000000001', 'jejak: riwayat BATAL → ORDER oleh eka');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(pg_temp.daftar('order'), array['ldujibo2'], 'tab Order: order ulang kembali tampil');
select uji.simpan('rk2', pg_temp.rk());
reset role;
select uji.simpan('s2', pg_temp.selisih(uji.ambil('rk1'), uji.ambil('rk2')));
select uji.cek((uji.ambil('s2') ->> 'order_dibatalkan')::int = -1 and (uji.ambil('s2') ->> 'order_okt')::int = 1
  and (uji.ambil('s2') ->> 'omzet_okt')::bigint = 7500000, 'Ringkasan: order ulang keluar dari "Order dibatalkan", masuk lagi ke order & omzet');

-- ------------------------------------------------------------ batal biasa (regresi + kategori khusus)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo5","aksi":"batal","alasan_batal":"Order dibatalkan"}')$q$,
  'PT400', 'batal biasa: kategori "Order dibatalkan" khusus tombol Batalkan order', 'khusus untuk tombol Batalkan order', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo5","aksi":"batal","alasan_batal":"Order dibatalkan","alasan_batal_lain":"Customer batal"}')$q$,
  'PT400', 'batal biasa: "Order dibatalkan" + teks tetap ditolak', 'khusus untuk tombol Batalkan order', 'INPUT_001');
select uji.simpan('bb', public.web_pipeline_tahap('{"lead_id":"ldujibo5","aksi":"batal","alasan_batal":"Harga"}'));
select uji.cek(uji.ambil('bb') ->> 'tahap' = 'BATAL' and uji.ambil('bb') ->> 'alasan_batal' = 'Harga' and uji.ambil('bb') ->> 'alasan_batal_lain' is null,
  'regresi: batal biasa (Harga) dari BARU tetap jalan');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo6","aksi":"batal"}')$q$,
  'PT400', 'regresi: batal tanpa kategori ditolak', 'Alasan batal wajib', 'INPUT_001');
select uji.galat($q$select public.web_pipeline_tahap('{"lead_id":"ldujibo6","aksi":"batal","alasan_batal":"Lainnya"}')$q$,
  'PT400', 'regresi: "Lainnya" tanpa teks ditolak', 'wajib diisi teks', 'INPUT_001');
select uji.sama(public.web_pipeline_tahap('{"lead_id":"ldujibo6","aksi":"batal","alasan_batal":"Lainnya","alasan_batal_lain":"Pindah ke supplier lokal"}')
  ->> 'alasan_batal_lain', 'Pindah ke supplier lokal', 'regresi: "Lainnya" + teks tetap jalan');
select uji.galat(pg_temp.batal('ldujibo5', 'Customer batal'), 'PT409', 'batal order pada lead BATAL biasa ditolak',
  'hanya untuk lead berstatus ORDER', 'KONFLIK_001');
reset role;

-- ------------------------------------------------------------ CHECK kategori alasan batal (langsung ke tabel, sebagai postgres)
select uji.jalan($$update public.lead set alasan_batal = 'Order dibatalkan' where id = 'ldujibo7'$$, 'CHECK: kategori "Order dibatalkan" sah');
select uji.jalan($$update public.lead set alasan_batal = 'Proyek batal/ditunda' where id = 'ldujibo7'$$, 'CHECK: kategori lama tetap sah');
select uji.galat($$update public.lead set alasan_batal = 'Dibatalkan customer' where id = 'ldujibo7'$$,
  '23514', 'CHECK: kategori di luar daftar ditolak', 'lead_alasan_batal_check');

-- ------------------------------------------------------------ hak fungsi
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_tahap(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_tahap(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_tahap(jsonb)', 'EXECUTE'), 'web_pipeline_tahap tetap hanya authenticated');
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_tahap(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.inti_pipeline_tahap(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.inti_pipeline_tahap(jsonb)', 'EXECUTE'),
  'inti_pipeline_tahap tetap internal (create or replace mempertahankan revoke)');
select uji.cek((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.inti_pipeline_tahap(jsonb)'::regprocedure),
  'inti_pipeline_tahap tetap SECURITY DEFINER dengan search_path kosong');

rollback;
