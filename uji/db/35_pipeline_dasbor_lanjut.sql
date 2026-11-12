-- 35 · Pipeline: Dasbor Tahap 2 (20261029140000). Biaya iklan (tabel + tulis agent/admin: validasi, ganti-penuh per
-- tanggal/platform, idempoten, hak), bagian 5–10 untuk admin/baca, kartu sales (bayar & rapikan) hanya miliknya, dan
-- metrik id baru (predikat = angka). Hari ini dipatok Kamis 29 Okt 2026.
-- Aktor: budi (owner → penuh), citra (rep RSG), eka (rep MCE), dodi (baca), bot 900000000002 (token tulis/baca).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

select set_config('app.hari_ini', '2026-10-29', true);

insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000351', 900000000002, 'bot tulis (uji 35)', 'rtk_b351', uji.sha('rtk_uji35_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000352', 900000000002, 'bot baca (uji 35)', 'rtk_b352', uji.sha('rtk_uji35_baca'), 'baca');

-- ------------------------------------------------------------ data uji
-- pl1 = pelanggan lama (order Agu) · pl2 = nama "-" · pl3 = pelanggan tidur (order Mar) · pl4 = order pertama
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values
  ('plujil1', 'PT Uji Lanjut'), ('plujil2', '-'), ('plujil3', 'CV Uji Tidur'), ('plujil4', 'PT Uji Baru');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi, bayar_status, alasan_batal) values
  ('ldujil1',  'plujil2', 'Google Ads',   100000002,    'BARU',  '2026-10-05', null, null, null, null, null),
  ('ldujil2',  'plujil1', 'Lainnya',      100000002,    'BATAL', '2026-10-02', null, null, null, null, 'Harga'),
  ('ldujil3',  'plujil1', 'Google Ads',   100000002,    'ORDER', '2026-10-03', '9801/RSG/X/2026', '2026-10-10', 10000000, null, null),
  ('ldujil4',  'plujil4', 'WA langsung',  900000000001, 'ORDER', '2026-10-06', '9802/MCE/X/2026', '2026-10-12', 20000000, null, null),
  ('ldujil5',  'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-05', null, null, null, null, null),
  ('ldujil6',  'plujil1', 'Telepon',      900000000001, 'ORDER', '2026-08-01', '9803/MCE/VIII/2026', '2026-08-15', 5000000, 'BELUM', null),
  ('ldujil7',  'plujil1', 'Lainnya',      null,         'BARU',  '2026-10-20', null, null, null, null, null),
  ('ldujil8',  'plujil1', 'Repeat order', 100000002,    'BARU',  '2026-10-21', null, null, null, null, null),
  ('ldujil9',  'plujil3', 'Referral',     100000002,    'ORDER', '2026-03-01', '9804/RSG/III/2026', '2026-03-10', 7000000, null, null),
  ('ldujil10', 'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-01', null, null, null, null, 'Tidak ada respon'),
  ('ldujil11', 'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-01', null, null, null, null, 'Tidak ada respon'),
  ('ldujil12', 'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-01', null, null, null, null, 'Tidak ada respon'),
  ('ldujil13', 'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-01', null, null, null, null, 'Tidak ada respon'),
  ('ldujil14', 'plujil1', 'Lainnya',      900000000001, 'BATAL', '2026-09-01', null, null, null, null, 'Tidak ada respon');
-- status bayar: trigger mengisi ORDER baru dengan BELUM → l3 dikembalikan ke null (order lama "belum dicatat")
update public.lead set bayar_status = 'LUNAS', tanggal_lunas = tanggal_sp where id in ('ldujil4', 'ldujil9');
update public.lead set bayar_status = null where id = 'ldujil3';
insert into public.lead_item (lead_id, produk, qty) values
  ('ldujil1', 'Pallet Mesh', 2), ('ldujil2', 'Roda', 1), ('ldujil3', 'Roda', 2), ('ldujil3', 'Pallet Mesh', 1),
  ('ldujil4', 'Pallet Mesh', 50), ('ldujil7', 'Airport Trolley', 1);
-- riwayat BATAL (riwayat insert dari trigger dibuang; waktu dipatok): l2 oleh citra 20 Okt (2 FU sebelum, 1 sesudah) ·
-- l5 status impor 12 Okt (dari null) · l10–l14 eka 26 Okt
delete from public.lead_riwayat_tahap where lead_id like 'ldujil%';
insert into public.lead_riwayat_tahap (lead_id, dari, ke, waktu, oleh) values
  ('ldujil2', 'BARU', 'BATAL', '2026-10-20 10:00+07', 100000002),
  ('ldujil5', null, 'BATAL', '2026-10-12 09:00+07', 100000001);
insert into public.lead_riwayat_tahap (lead_id, dari, ke, waktu, oleh)
  select x, 'BARU', 'BATAL', '2026-10-26 11:00+07', 900000000001 from unnest(array['ldujil10','ldujil11','ldujil12','ldujil13','ldujil14']) x;
insert into public.lead_aktivitas (lead_id, waktu, oleh, jenis, hasil) values
  ('ldujil2', '2026-10-05 09:00+07', 100000002, 'WA', 'tanya'),
  ('ldujil2', '2026-10-10 09:00+07', 100000002, 'Telepon', 'follow up'),
  ('ldujil2', '2026-10-25 09:00+07', 100000002, 'Catatan', 'sesudah batal: tidak dihitung'),
  ('ldujil10', '2026-09-02 09:00+07', null, 'Catatan impor', 'impor: tidak dihitung');
-- bukti sumber agent (jalur sah lewat bendera transaksi)
select set_config('app.sumber_bukti_tulis', 'ya', true);
update public.lead set sumber_bukti = 'ga-rh', sumber_bukti_kode = 'GA-RH', sumber_bukti_diisi_pada = now() where id = 'ldujil1';
select set_config('app.sumber_bukti_tulis', '', true);
select uji.konteks(null, null);
select uji.sama((select count(*)::int from public.lead where id not like 'ldujil%'), 0, 'prasyarat: hanya lead uji di DB');
select uji.sama((select array_agg(public.wib_date(r.waktu)::text order by r.lead_id) from (
    select distinct on (lead_id) lead_id, waktu from public.lead_riwayat_tahap where ke = 'BATAL' and lead_id in ('ldujil2', 'ldujil5', 'ldujil10')
     order by lead_id, waktu desc, id desc) r),
  array['2026-10-26', '2026-10-20', '2026-10-12'], 'prasyarat: riwayat BATAL terakhir l10 26 Okt, l2 20 Okt, l5 12 Okt');

-- ------------------------------------------------------------ skema & hak
select uji.cek((select relrowsecurity from pg_class where oid = 'public.iklan_biaya'::regclass)
  and not has_table_privilege('anon', 'public.iklan_biaya', 'SELECT')
  and not has_table_privilege('authenticated', 'public.iklan_biaya', 'SELECT')
  and not has_table_privilege('authenticated', 'public.iklan_biaya', 'INSERT')
  and not has_table_privilege('authenticated', 'public.iklan_biaya', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.iklan_biaya', 'DELETE')
  and not has_table_privilege('service_role', 'public.iklan_biaya', 'INSERT'),
  'iklan_biaya: RLS aktif; pengguna web tanpa akses langsung (baca lewat dasbor, tulis lewat fungsi)');
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_dasbor_lanjut(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_biaya_iklan_set(jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.x_pipeline_biaya_iklan_set(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.x_pipeline_biaya_iklan_set(bigint, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_dasbor_lanjut(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_biaya_iklan_set(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_dasbor_lanjut(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.inti_pipeline_biaya_iklan_set(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_dasbor_batal(date, date)', 'EXECUTE'),
  'hak: web_ → authenticated, x_ → service_role, inti/pembantu internal');
select uji.sama((select count(*)::int from pg_proc p where p.oid in (
    'public.inti_pipeline_biaya_iklan_set(jsonb)'::regprocedure, 'public.inti_pipeline_dasbor_lanjut(jsonb)'::regprocedure,
    'public.web_pipeline_dasbor_lanjut(jsonb)'::regprocedure, 'public.web_pipeline_biaya_iklan_set(jsonb)'::regprocedure,
    'public.x_pipeline_biaya_iklan_set(bigint, jsonb)'::regprocedure, 'public.pipeline_dasbor_batal(date, date)'::regprocedure)
    and p.prosecdef and p.proconfig = array['search_path=""']), 6, 'fungsi baru: SECURITY DEFINER + search_path kosong');

-- ------------------------------------------------------------ biaya iklan: agent (bot, token tulis)
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000351');
select uji.simpan('b1', public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[
  {"tanggal":"2026-10-01","platform":"google","campaign":"General Roda","biaya":100000,"klik":10,"konversi":2.5},
  {"tanggal":"2026-10-01","platform":"Google","campaign":"  Pallet   Mesh ","biaya":50000,"klik":5,"tayang":900,"konversi":1},
  {"tanggal":"2026-10-05","platform":"google","campaign":"General Roda","biaya":120000.5,"klik":12},
  {"tanggal":"2026-10-02","platform":"meta","campaign":"PM-06","biaya":30000,"klik":3}]}'));
select uji.sama(uji.ambil('b1'), '{"diproses":4,"baru":4,"diubah":0,"sama":0,"dihapus":0,"dari":"2026-10-01","sampai":"2026-10-05"}'::jsonb,
  'agent: 4 baris baru (platform & spasi campaign dirapikan)');
-- kirim ulang sama = tidak ada perubahan
select uji.sama(public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[
  {"tanggal":"2026-10-05","platform":"google","campaign":"General Roda","biaya":120000.5,"klik":12}]}') - 'dari' - 'sampai',
  '{"diproses":1,"baru":0,"diubah":0,"sama":1,"dihapus":0}'::jsonb, 'idempoten: kirim ulang sama → sama');
-- tarik ulang 1 Okt google tanpa "Pallet Mesh" → baris itu dihapus; General Roda diperbarui
select uji.sama(public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[
  {"tanggal":"2026-10-01","platform":"google","campaign":"General Roda","biaya":100000,"klik":11,"konversi":2.5}]}') - 'dari' - 'sampai',
  '{"diproses":1,"baru":0,"diubah":1,"sama":0,"dihapus":1}'::jsonb, 'payload = keadaan lengkap (tanggal, platform): campaign hilang dihapus');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-30","platform":"google","campaign":"X","biaya":1}]}')$$,
  'PT400', 'tanggal masa depan ditolak', 'di luar rentang', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"tiktok","campaign":"X","biaya":1}]}')$$,
  'PT400', 'platform tak dikenal ditolak', 'platform', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":-5}]}')$$,
  'PT400', 'biaya negatif ditolak', 'biaya', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":"1000"}]}')$$,
  'PT400', 'biaya teks ditolak', 'biaya', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1,"klik":1.5}]}')$$,
  'PT400', 'klik pecahan ditolak', 'klik', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1,"cpc":2}]}')$$,
  'PT400', 'kunci tak dikenal ditolak', 'cpc', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1},
  {"tanggal":"2026-10-01","platform":"google","campaign":"x","biaya":2}]}')$$, 'PT400', 'campaign ganda (beda huruf) ditolak', 'ganda', 'INPUT_001');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[]}')$$, 'PT400', 'items kosong ditolak', null, 'INPUT_001');
-- satu item tidak sah → tidak ada yang ditulis
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-03","platform":"google","campaign":"Baru","biaya":1},
  {"tanggal":"2026-10-03","platform":"google","campaign":"Rusak","biaya":-1}]}')$$, 'PT400', 'semua-atau-tidak', null, 'INPUT_001');
-- token baca tidak boleh menulis
select uji.token('b0b0b0b0-0000-4000-8000-000000000352');
select uji.galat($$select public.x_pipeline_biaya_iklan_set(900000000002, '{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1}]}')$$,
  'PT403', 'token baca tidak bisa menulis biaya', null, null);
reset role;
select uji.token(null);
select uji.sama((select count(*)::int from public.iklan_biaya where campaign in ('Baru', 'Rusak', 'X')), 0, 'payload gagal tidak meninggalkan baris');
select uji.sama((select jsonb_agg(jsonb_build_array(tanggal, platform, campaign, biaya, klik, tayang, konversi, diisi_oleh) order by tanggal, platform, campaign)
                   from public.iklan_biaya),
  '[["2026-10-01","google","General Roda",100000.00,11,0,2.50,900000000002],
    ["2026-10-02","meta","PM-06",30000.00,3,0,0.00,900000000002],
    ["2026-10-05","google","General Roda",120000.50,12,0,0.00,900000000002]]'::jsonb, 'isi tabel biaya sesudah tarik ulang');

-- rep & baca tidak bisa menulis; admin (owner) lewat web_ bisa
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_pipeline_biaya_iklan_set('{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1}]}')$$,
  'PT403', 'rep tidak bisa menulis biaya', null, 'ACCESS_001');
select uji.galat($$select count(*) from public.iklan_biaya$$, '42501', 'rep: tabel biaya tidak bisa dibaca langsung', null, null);
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_biaya_iklan_set('{"items":[{"tanggal":"2026-10-01","platform":"google","campaign":"X","biaya":1}]}')$$,
  'PT403', 'peran baca tidak bisa menulis biaya', null, 'ACCESS_001');
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.sama(public.web_pipeline_biaya_iklan_set('{"items":[{"tanggal":"2026-09-30","platform":"google","campaign":"General Roda","biaya":40000}]}')
  -> 'baru', '1'::jsonb, 'owner: tempel CSV lewat web_ (bulan lalu)');
reset role;

-- ------------------------------------------------------------ admin (budi): bagian 5–10
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('a', public.web_pipeline_dasbor_lanjut('{}'));
select uji.sama(uji.ambil('a') ->> 'peran', 'penuh', 'owner: peran penuh');
select uji.sama(uji.ambil('a') -> 'sumber', '[
  {"sumber":"Google Ads","lead":2,"order":1,"omzet":10000000},
  {"sumber":"Lainnya","lead":2,"order":0,"omzet":0},
  {"sumber":"WA langsung","lead":1,"order":1,"omzet":20000000},
  {"sumber":"Repeat order","lead":1,"order":0,"omzet":0},
  {"sumber":"Meta Ads","lead":0,"order":0,"omzet":0},
  {"sumber":"Website organik","lead":0,"order":0,"omzet":0},
  {"sumber":"Instagram/TikTok organik","lead":0,"order":0,"omzet":0},
  {"sumber":"Telepon","lead":0,"order":0,"omzet":0},
  {"sumber":"Referral","lead":0,"order":0,"omzet":0}]'::jsonb, 'sumber: lead masuk Okt per isian sales, semua sumber (nol ikut)');
select uji.sama(uji.ambil('a') -> 'bukti', '[{"kelas":"ga-rh","lead":1},{"kelas":null,"lead":5}]'::jsonb, 'bukti sumber chat WA (null terakhir)');
select uji.sama((uji.ambil('a') -> 'iklan') - 'diisi_pada', '{"sampai":"2026-10-05",
  "google":{"biaya":220000.50,"klik":23,"konversi":2.50},
  "lead_google":{"lead":2,"order":1,"omzet":10000000},
  "kampanye":[{"platform":"google","campaign":"General Roda","biaya":220000.50,"klik":23,"konversi":2.50,"sampai":"2026-10-05"},
              {"platform":"meta","campaign":"PM-06","biaya":30000.00,"klik":3,"konversi":0.00,"sampai":"2026-10-02"}]}'::jsonb,
  'iklan: biaya Google 1–5 Okt (hari terakhir data), lead Google Ads di rentang sama, per campaign; Sep tidak ikut');
select uji.sama(uji.ambil('a') -> 'bayar', jsonb_build_array(
    jsonb_build_object('pemilik', 100000002, 'nama', 'citra lestari', 'order', 1, 'nilai', 10000000, 'kosong', 1, 'belum', 0, 'dp', 0, 'tua', 0),
    jsonb_build_object('pemilik', 900000000001, 'nama', 'eka wulandari', 'order', 1, 'nilai', 5000000, 'kosong', 0, 'belum', 1, 'dp', 0, 'tua', 1)),
  'bayar: order SP 90 hari terakhir bukan LUNAS (LUNAS & SP lama tidak ikut)');
select uji.sama(uji.ambil('a') -> 'batal', '{"lead":6,"fu_kurang2":5,"impor":1,
  "alasan":[{"alasan":"Tidak ada respon","lead":5},{"alasan":"Harga","lead":1}],
  "lonjakan":[{"tanggal":"2026-10-26","pemilik":900000000001,"nama":"eka wulandari","lead":5}]}'::jsonb,
  'batal Okt: status impor tidak dihitung; FU sesudah batal & Catatan impor tidak dihitung; lonjakan ≥5/sales/hari');
select uji.sama(uji.ambil('a') -> 'kualitas', '{"lead":6,"nama_kosong":1,"sumber_lainnya":2,"tanpa_bukti":5,"order":2,
  "order_tanpa_bayar":1,"dobel":{"pelanggan":1,"lead":2}}'::jsonb, 'kualitas data Okt');
select uji.sama(uji.ambil('a') -> 'produk', '[
  {"produk":"Pallet Mesh","lead":2,"order":1,"omzet":20000000,"gabungan":[]},
  {"produk":"Roda","lead":2,"order":1,"omzet":10000000,"gabungan":[]},
  {"produk":"Lainnya","lead":2,"order":0,"omzet":0,"gabungan":["Airport Trolley"]}]'::jsonb,
  'produk pertama: lead masuk & order SP Okt; produk kecil digabung ke Lainnya');
select uji.sama(uji.ambil('a') -> 'pelanggan_lama', '{"order":1,"omzet":10000000}'::jsonb, 'order dari pelanggan yang sudah pernah order');
select uji.sama(uji.ambil('a') -> 'tidur', '{"pernah":3,"tidur":1,"nilai":7000000}'::jsonb, 'pelanggan tidur >90 hari tanpa lead terbuka');
select uji.sama(jsonb_build_object('n', jsonb_array_length(uji.ambil('a') -> 'minggu'),
    'awal', uji.ambil('a') #> '{minggu,0,mulai}', 'akhir', uji.ambil('a') -> 'minggu' -> -1,
    'agu10', uji.ambil('a') -> 'minggu' -> 1, 'agu31', uji.ambil('a') -> 'minggu' -> 4,
    'okt5', uji.ambil('a') -> 'minggu' -> 9, 'okt12', uji.ambil('a') -> 'minggu' -> 10),
  '{"n":13,"awal":"2026-08-03","akhir":{"mulai":"2026-10-26","sampai":"2026-10-29","lead":0,"order":0},
    "agu10":{"mulai":"2026-08-10","sampai":"2026-08-16","lead":0,"order":1},
    "agu31":{"mulai":"2026-08-31","sampai":"2026-09-06","lead":6,"order":0},
    "okt5":{"mulai":"2026-10-05","sampai":"2026-10-11","lead":2,"order":1},
    "okt12":{"mulai":"2026-10-12","sampai":"2026-10-18","lead":0,"order":1}}'::jsonb,
  'tren 13 minggu (Senin), minggu berjalan s/d hari ini');
select uji.sama(uji.ambil('a') -> 'harian', '{"bulan":[{"tgl":10,"omzet":10000000},{"tgl":12,"omzet":20000000}],"lalu":[]}'::jsonb,
  'omzet harian Okt & Sep (kumulatif dihitung web)');
select uji.cek(not (uji.ambil('a') ?| array['bayar_saya', 'rapikan']), 'penuh: tanpa kartu sales');

-- konsistensi angka ↔ daftar id (metrik baru)
select uji.sama(jsonb_build_object(
    'bayar', public.web_pipeline_dasbor_ids('{"metrik":"bayar_belum_lunas"}') -> 'ids',
    'bayar_eka', public.web_pipeline_dasbor_ids('{"metrik":"bayar_belum_lunas","pemilik":900000000001}') -> 'ids',
    'tanpa_bayar', public.web_pipeline_dasbor_ids('{"metrik":"order_tanpa_bayar"}') -> 'ids',
    'nama', public.web_pipeline_dasbor_ids('{"metrik":"nama_kosong"}') -> 'ids',
    'lainnya', public.web_pipeline_dasbor_ids('{"metrik":"sumber_lainnya"}') -> 'ids',
    'batal_masuk', public.web_pipeline_dasbor_ids('{"metrik":"batal_masuk"}') -> 'ids',
    'dobel', public.web_pipeline_dasbor_ids('{"metrik":"lead_dobel"}') -> 'ids',
    'pm_tanpa_nilai', public.web_pipeline_dasbor_ids('{"metrik":"pm_tanpa_nilai"}') -> 'ids',
    'dibatalkan_tanpa', public.web_pipeline_dasbor_ids('{"metrik":"dibatalkan","pemilik":"tanpa"}') -> 'ids'),
  '{"bayar":["ldujil3","ldujil6"],"bayar_eka":["ldujil6"],"tanpa_bayar":["ldujil3"],"nama":["ldujil1"],
    "lainnya":["ldujil7","ldujil2"],"batal_masuk":["ldujil2"],"dobel":["ldujil8","ldujil7"],"pm_tanpa_nilai":["ldujil1"],
    "dibatalkan_tanpa":[]}'::jsonb, 'ids metrik baru: isi & urutan');
select uji.sama(jsonb_build_array(
    (public.web_pipeline_dasbor_ids('{"metrik":"tanpa_bukti"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"dibatalkan"}') ->> 'total')::int,
    (public.web_pipeline_dasbor_ids('{"metrik":"dibatalkan","pemilik":900000000001}') ->> 'total')::int),
  jsonb_build_array((uji.ambil('a') #>> '{kualitas,tanpa_bukti}')::int, (uji.ambil('a') #>> '{batal,lead}')::int, 5),
  'ids total = angka dasbor (tanpa bukti, dibatalkan)');
select uji.sama((public.web_pipeline_dasbor_ids('{"metrik":"terbuka90"}') ->> 'total')::int, 3, 'metrik Tahap 1 tetap jalan');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"biaya"}')$$, 'PT400', 'ids: metrik tak dikenal', null, 'INPUT_001');

-- bulan lalu: biaya Sep (dari tempel owner) & tren ke minggu terakhir Sep
select uji.simpan('s', public.web_pipeline_dasbor_lanjut('{"bulan":"2026-09"}'));
select uji.sama(jsonb_build_object('sampai', uji.ambil('s') #> '{iklan,sampai}', 'biaya', uji.ambil('s') #> '{iklan,google,biaya}',
    'akhir', uji.ambil('s') -> 'minggu' -> -1, 'batal', uji.ambil('s') #> '{batal,lead}', 'lalu', uji.ambil('s') #> '{harian,lalu}'),
  '{"sampai":"2026-09-30","biaya":40000.00,"akhir":{"mulai":"2026-09-28","sampai":"2026-09-30","lead":0,"order":0},"batal":0,
    "lalu":[{"tgl":15,"omzet":5000000}]}'::jsonb, 'bulan Sep: biaya Sep, tren berakhir 30 Sep, pembanding Agu');

-- ------------------------------------------------------------ baca (dodi) = penuh
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(public.web_pipeline_dasbor_lanjut('{}') - 'hari_ini', uji.ambil('a') - 'hari_ini', 'peran baca: bagian 5–10 penuh');

-- ------------------------------------------------------------ sales (citra): hanya kartu miliknya
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('r', public.web_pipeline_dasbor_lanjut('{}'));
select uji.sama((select array_agg(k order by k) from jsonb_object_keys(uji.ambil('r')) k),
  array['bayar_saya', 'bulan', 'hari_ini', 'peran', 'rapikan', 'sejak_bayar'], 'rep: hanya kunci kartu sales (tanpa iklan/sumber/batal tim)');
select uji.sama(uji.ambil('r') -> 'bayar_saya', '{"order":1,"nilai":10000000,"kosong":1,"belum":0,"dp":0,"tua":0}'::jsonb,
  'rep: pembayaran order miliknya');
select uji.sama(uji.ambil('r') -> 'rapikan', '{"lead":4,"nama_kosong":1,"sumber_lainnya":1,"batal":1}'::jsonb,
  'rep: rapikan lead Okt miliknya');
select uji.cek(not uji.ambil('r')::text ~ '(eka wulandari|900000000001|ldujil)', 'rep: tanpa nama/id sales lain atau lead');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"dibatalkan","pemilik":900000000001}') -> 'ids', '["ldujil2"]'::jsonb,
  'rep: ids pemilik lain diabaikan → tetap miliknya');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"bayar_belum_lunas"}') -> 'ids', '["ldujil3"]'::jsonb, 'rep: ids bayar miliknya');

-- ------------------------------------------------------------ tanpa akses
reset role;
delete from public.pipeline_akses where member_id = 100000003;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_dasbor_lanjut('{}')$$, 'PT403', 'tanpa akses: dasbor lanjutan ditolak', null, 'ACCESS_001');
select uji.galat($$select public.web_pipeline_biaya_iklan_set('{"items":[]}')$$, 'PT403', 'tanpa akses: tulis biaya ditolak', null, 'ACCESS_001');
reset role;

rollback;
