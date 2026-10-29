-- 34 · Pipeline: Dasbor Tahap 1 (20261029130000, brief Hannes 29 Okt). Hari kerja Senin–Sabtu, bendera per lead
-- (disentuh ≤1 hari kerja, BARU tanpa catatan, basis 90 hari, diam), angka bagian 1–4 untuk admin, tampilan sales
-- "milik saya" (tanpa angka sales lain; satu-satunya angka tim = omzet tim), dan id lead di balik angka.
-- Hari ini dipatok Kamis 29 Okt 2026 (app.hari_ini). Minggu Okt 2026: 4, 11, 18, 25.
-- Aktor: budi (owner → penuh), citra (rep RSG), eka (rep MCE), dodi (baca → penuh).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

select set_config('app.hari_ini', '2026-10-29', true);

-- ------------------------------------------------------------ hari kerja: rumus tertutup = hitung manual
select uji.sama((
  select count(*)::int from generate_series(date '2026-10-01', date '2026-10-21', interval '1 day') a,
                             generate_series(-3, 20) n
   where public.pipeline_hk_antara(a::date, a::date + n) is distinct from
         (select count(*)::int from generate_series(a::date + 1, a::date + n, interval '1 day') d where extract(isodow from d) <> 7)),
  0, 'pipeline_hk_antara = hitung manual Senin–Sabtu (21 tanggal awal × selisih −3…20 hari)');
select uji.sama(public.pipeline_hk_antara('2026-09-30', '2026-10-31'), 27, 'Oktober 2026: 27 hari kerja (Senin–Sabtu)');
select uji.sama(public.pipeline_hk_antara('2026-09-30', '2026-10-28'), 24, 's/d kemarin (28 Okt): 24 hari kerja (= mockup)');
select uji.sama(public.pipeline_hk_antara('2026-10-29', '2026-10-29'), 0, 'umur hari kerja lead masuk hari ini = 0');
select uji.sama(array[public.pipeline_hk_berikut('2026-10-23'), public.pipeline_hk_berikut('2026-10-24'), public.pipeline_hk_berikut('2026-10-25')],
  array['2026-10-24', '2026-10-26', '2026-10-26']::date[], 'hari kerja berikut: Jumat→Sabtu, Sabtu→Senin, Minggu→Senin');

-- ------------------------------------------------------------ data uji
insert into public.pipeline_akses (member_id, peran, kode_sp) values
  (100000002, 'rep', 'RSG'), (100000003, 'baca', null), (900000000001, 'rep', 'MCE')
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujids1', 'PT Uji Dasbor');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi) values
  ('ldujids1',  'plujids1', 'Google Ads',  100000002,    'BARU',      '2026-10-27', null, null, null),
  ('ldujids2',  'plujids1', 'WA langsung', 100000002,    'BARU',      '2026-10-24', null, null, null),   -- Sabtu
  ('ldujids3',  'plujids1', 'Telepon',     100000002,    'BARU',      '2026-10-20', null, null, null),
  ('ldujids4',  'plujids1', 'Referral',    100000002,    'PENAWARAN', '2026-10-29', null, null, null),   -- hari ini
  ('ldujids5',  'plujids1', 'Google Ads',  100000002,    'ORDER',     '2026-09-10', '9701/RSG/X/2026', '2026-10-05', 50000000),
  ('ldujids6',  'plujids1', 'Telepon',     100000002,    'ORDER',     '2026-09-01', '9702/RSG/IX/2026', '2026-09-15', 20000000),
  ('ldujids7',  'plujids1', 'Lainnya',     100000002,    'BARU',      '2026-06-01', null, null, null),   -- > 90 hari
  ('ldujids8',  'plujids1', 'Google Ads',  900000000001, 'BARU',      '2026-10-28', null, null, null),
  ('ldujids9',  'plujids1', 'Referral',    900000000001, 'ORDER',     '2026-10-01', '9703/MCE/X/2026', '2026-10-20', 30000000),
  ('ldujids10', 'plujids1', 'Lainnya',     null,         'BARU',      '2026-10-15', null, null, null),
  ('ldujids11', 'plujids1', 'Lainnya',     900000000001, 'ORDER',     '2026-07-01', '9704/MCE/VII/2026', '2026-07-20', 9000000);
insert into public.lead_item (lead_id, produk, qty) values
  ('ldujids1', 'Pallet Mesh', 30), ('ldujids2', 'Roda', 4), ('ldujids3', 'Pallet Mesh', 1), ('ldujids4', 'Locker', 2),
  ('ldujids5', 'Pallet Mesh', 10), ('ldujids6', 'Roda', 8), ('ldujids7', 'Pallet Mesh', 1), ('ldujids8', 'Roda', 1),
  ('ldujids9', 'Locker', 3), ('ldujids10', 'Pallet Mesh', 5), ('ldujids11', 'Pallet Mesh', 25);
-- sentuhan: ds1 WA Rabu 28 (≤ hari kerja berikut Rabu 28) · ds2 masuk Sabtu, WA Senin 26 (Minggu dilewati) ·
-- ds8 hanya Catatan impor (tidak dihitung) · ds4 BARU → PENAWARAN hari ini (transisi tahap)
insert into public.lead_aktivitas (lead_id, waktu, oleh, jenis, hasil) values
  ('ldujids1', '2026-10-28 09:00+07', 100000002, 'WA', 'tanya qty'),
  ('ldujids2', '2026-10-26 10:00+07', 100000002, 'WA', 'kirim katalog'),
  ('ldujids8', '2026-10-28 08:00+07', null, 'Catatan impor', 'impor');
insert into public.lead_riwayat_tahap (lead_id, dari, ke, waktu, oleh) values
  ('ldujids4', 'BARU', 'PENAWARAN', '2026-10-29 08:00+07', 100000002);
-- turunan dipatok (trigger aktivitas mengubahnya ke waktu sungguhan)
update public.lead l set diam_sejak = v.diam::timestamptz, fu_berikutnya = v.fu
  from (values ('ldujids1', '2026-10-28 12:00+00', date '2026-10-29'), ('ldujids2', '2026-10-26 12:00+00', date '2026-10-27'),
               ('ldujids3', '2026-10-10 12:00+00', null), ('ldujids4', '2026-10-29 12:00+00', null),
               ('ldujids7', '2026-06-01 12:00+00', null), ('ldujids8', '2026-10-28 12:00+00', date '2026-11-02'),
               ('ldujids10', '2026-09-01 12:00+00', null)) as v(id, diam, fu)
 where l.id = v.id;
select uji.konteks(null, null);
-- tes ini memakai data sendiri saja: lead lain (bila ada) disembunyikan dengan menggeser hari ini tidak cukup,
-- jadi angka diperiksa terhadap lead uji (seed tidak punya lead Pipeline).
select uji.sama((select count(*)::int from public.lead where id not like 'ldujids%'), 0, 'prasyarat: hanya lead uji di DB');

-- ------------------------------------------------------------ hak
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_dasbor(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_dasbor_lead(date, date, date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.pipeline_hk_antara(date, date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_dasbor(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_dasbor_ids(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_dasbor(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.web_pipeline_dasbor_ids(jsonb)', 'EXECUTE'),
  'hak: pembantu & inti internal; web_ hanya authenticated');

-- ------------------------------------------------------------ admin (budi): dasbor penuh
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('a', public.web_pipeline_dasbor('{}'));
select uji.sama(uji.ambil('a') ->> 'peran', 'penuh', 'owner: peran penuh');
select uji.sama(uji.ambil('a') -> 'skor', '{"omzet":80000000,"order":2,"omzet_pm":50000000,"order_pm":1,"omzet_lalu":20000000,
  "order_lalu":1,"lead_masuk":7,"lead_masuk_lalu":2,"sentuh_cepat":2,"sentuh_basis":6}'::jsonb,
  'skor: omzet/order (tanggal SP), porsi PM, pembanding 1–29 Sep, lead masuk, disentuh ≤1 hk');
select uji.sama((uji.ambil('a') ->> 'omzet_tim')::bigint, 80000000::bigint, 'omzet tim');
select uji.sama(uji.ambil('a') -> 'per_sales', jsonb_build_array(
    jsonb_build_object('pemilik', 100000002, 'nama', 'citra lestari', 'omzet', 50000000, 'order', 1),
    jsonb_build_object('pemilik', 900000000001, 'nama', 'eka wulandari', 'omzet', 30000000, 'order', 1)),
  'per sales: omzet & order, urut omzet');
select uji.sama(uji.ambil('a') -> 'win_pm', '{"order":1,"lead":2}'::jsonb, 'win rate PM: lead PM umur ≥90 hari');
select uji.sama((select e from jsonb_array_elements(uji.ambil('a') -> 'kesehatan') e where (e ->> 'pemilik')::bigint = 100000002) - 'nama',
  '{"pemilik":100000002,"terbuka90":4,"sentuh_cepat":2,"sentuh_basis":3,"fu_hari_ini":1,"fu_telat":1,"tanpa_jadwal":2,
    "baru_tanpa_catatan":1,"diam_0_7":3,"diam_8_14":0,"diam_15_30":1,"diam_31":0,"lama":1,"fu_tercatat":2}'::jsonb,
  'kesehatan citra: semua kolom');
select uji.sama((select e from jsonb_array_elements(uji.ambil('a') -> 'kesehatan') e where (e ->> 'pemilik')::bigint = 900000000001) - 'nama',
  '{"pemilik":900000000001,"terbuka90":1,"sentuh_cepat":0,"sentuh_basis":2,"fu_hari_ini":0,"fu_telat":0,"tanpa_jadwal":0,
    "baru_tanpa_catatan":0,"diam_0_7":1,"diam_8_14":0,"diam_15_30":0,"diam_31":0,"lama":0,"fu_tercatat":0}'::jsonb,
  'kesehatan eka: Catatan impor tidak dihitung sentuhan; umur 1 hk belum "BARU tanpa catatan"');
select uji.sama((select e from jsonb_array_elements(uji.ambil('a') -> 'kesehatan') e where e -> 'pemilik' = 'null'::jsonb) - 'nama',
  '{"pemilik":null,"terbuka90":1,"sentuh_cepat":0,"sentuh_basis":1,"fu_hari_ini":0,"fu_telat":0,"tanpa_jadwal":1,
    "baru_tanpa_catatan":1,"diam_0_7":0,"diam_8_14":0,"diam_15_30":0,"diam_31":1,"lama":0,"fu_tercatat":null}'::jsonb,
  'kesehatan tanpa pemilik (baris terakhir)');
select uji.sama(uji.ambil('a') -> 'kesehatan' -> -1 -> 'pemilik', 'null'::jsonb, 'tanpa pemilik di urutan terakhir');
select uji.sama(uji.ambil('a') -> 'corong', '[
  {"bulan":"2026-07","total":1,"ORDER":1,"PENAWARAN":0,"BARU":0,"DIALIHKAN":0,"BATAL":0},
  {"bulan":"2026-08","total":0,"ORDER":0,"PENAWARAN":0,"BARU":0,"DIALIHKAN":0,"BATAL":0},
  {"bulan":"2026-09","total":2,"ORDER":2,"PENAWARAN":0,"BARU":0,"DIALIHKAN":0,"BATAL":0},
  {"bulan":"2026-10","total":7,"ORDER":1,"PENAWARAN":1,"BARU":5,"DIALIHKAN":0,"BATAL":0}]'::jsonb,
  'corong 4 bulan (tahap sekarang)');
select uji.sama(uji.ambil('a') -> 'siklus', '{"sejak":"2026-08-01","lead_penawaran":{"n":1,"median":0},"penawaran_order":{"n":0,"median":null}}'::jsonb,
  'siklus: transisi tahap saja, sampel kecil tetap dikirim (web memutuskan "belum bisa dihitung")');
select uji.sama(uji.ambil('a') #>> '{pm,terbesar,id}', 'ldujids1', 'PM terbesar = qty 30');
select uji.sama((uji.ambil('a') -> 'pm') - 'terbesar', '{"terbuka":4,"qty":37,"diam30":2,"terbuka_bernilai":0,"nilai":0}'::jsonb,
  'PM terbuka (semua umur): 4 lead, 37 unit, 2 diam >30 hari');
select uji.sama((select jsonb_agg(e - 'nama' - 'bernilai' - 'nilai') from jsonb_array_elements(uji.ambil('a') -> 'pm_sales') e),
  '[{"pemilik":100000002,"terbuka":3,"qty":32,"diam30":1},{"pemilik":null,"terbuka":1,"qty":5,"diam30":1}]'::jsonb,
  'PM per sales + tanpa pemilik');
select uji.sama((select array_agg(e ->> 'id') from jsonb_array_elements(uji.ambil('a') -> 'pm_teratas') e),
  array['ldujids1', 'ldujids10', 'ldujids3'], 'PM teratas: urut qty, diam ≤120 hari (lead 150 hari tidak ikut)');
select uji.sama(uji.ambil('a') -> 'pm_win_qty', '{"kecil":{"order":0,"lead":1},"besar":{"order":1,"lead":1}}'::jsonb, 'win PM per qty');
select uji.sama(uji.ambil('a') -> 'pm_qty_terisi', '{"lebih_1":4,"lead":6}'::jsonb, 'kualitas qty PM (semua umur)');
select uji.cek(not uji.ambil('a') ? 'fu_hari_ini', 'penuh: tanpa tabel FU hari ini sales');

-- id lead di balik angka (admin)
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"terbuka90","pemilik":"tanpa"}') -> 'ids', '["ldujids10"]'::jsonb,
  'ids: tanpa pemilik');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"terbuka90","pemilik":900000000001}') -> 'ids', '["ldujids8"]'::jsonb,
  'ids: per sales');
select uji.sama((public.web_pipeline_dasbor_ids('{"metrik":"terbuka90"}') ->> 'total')::int, 6, 'ids: semua pemilik');
select uji.sama((select array_agg(x order by x) from jsonb_array_elements_text(public.web_pipeline_dasbor_ids('{"metrik":"sentuh_cepat"}') -> 'ids') x),
  array['ldujids1', 'ldujids2'], 'ids: disentuh ≤1 hari kerja (Sabtu → Senin)');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"baru_tanpa_catatan","pemilik":100000002}') -> 'ids', '["ldujids3"]'::jsonb,
  'ids: BARU tanpa catatan');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"diam_31","pemilik":"tanpa"}') -> 'ids', '["ldujids10"]'::jsonb, 'ids: diam >30');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"lama","pemilik":100000002}') -> 'ids', '["ldujids7"]'::jsonb, 'ids: terbuka lama');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"omzet"}')$$, 'PT400', 'ids: metrik tak dikenal', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"terbuka90","pemilik":"budi"}')$$, 'PT400', 'ids: pemilik tak sah',
  null, 'INPUT_001');

-- bulan
select uji.simpan('s', public.web_pipeline_dasbor('{"bulan":"2026-09"}'));
select uji.sama(jsonb_build_object('batas', uji.ambil('s') -> 'batas', 'batas_lalu', uji.ambil('s') -> 'batas_lalu',
    'omzet', uji.ambil('s') #> '{skor,omzet}', 'lead', uji.ambil('s') #> '{skor,lead_masuk}'),
  '{"batas":"2026-09-30","batas_lalu":"2026-08-31","omzet":20000000,"lead":2}'::jsonb, 'bulan selesai: sebulan penuh vs Agu penuh');
select uji.galat($$select public.web_pipeline_dasbor('{"bulan":"2026-11"}')$$, 'PT400', 'bulan belum berjalan ditolak', null, 'INPUT_001');
select uji.galat($$select public.web_pipeline_dasbor('{"bulan":"2026-13"}')$$, 'PT400', 'bulan tak sah ditolak', 'YYYY-MM', 'INPUT_001');

-- ------------------------------------------------------------ baca (dodi) = penuh seperti Ringkasan
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.sama(public.web_pipeline_dasbor('{}') -> 'skor', uji.ambil('a') -> 'skor', 'peran baca: dasbor penuh');

-- ------------------------------------------------------------ sales (citra): milik saya
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('r', public.web_pipeline_dasbor('{}'));
select uji.sama(uji.ambil('r') ->> 'peran', 'sales', 'rep: peran sales');
select uji.sama((uji.ambil('r') ->> 'saya')::bigint, 100000002::bigint, 'rep: saya = citra');
select uji.sama(uji.ambil('r') -> 'skor', '{"omzet":50000000,"order":1,"omzet_pm":50000000,"order_pm":1,"omzet_lalu":20000000,
  "order_lalu":1,"lead_masuk":4,"lead_masuk_lalu":2,"sentuh_cepat":2,"sentuh_basis":3}'::jsonb, 'rep: skor hanya miliknya');
select uji.sama((uji.ambil('r') ->> 'omzet_tim')::bigint, 80000000::bigint, 'rep: satu-satunya angka tim = omzet tim');
select uji.sama(jsonb_array_length(uji.ambil('r') -> 'kesehatan'), 1, 'rep: satu baris kesehatan');
select uji.sama((uji.ambil('r') #>> '{kesehatan,0,pemilik}')::bigint, 100000002::bigint, 'rep: baris kesehatan miliknya');
select uji.sama((uji.ambil('r') -> 'pm') - 'terbesar', '{"terbuka":3,"qty":32,"diam30":1,"terbuka_bernilai":0,"nilai":0}'::jsonb, 'rep: PM miliknya');
select uji.cek(not (uji.ambil('r') ?| array['per_sales', 'win_pm', 'corong', 'siklus', 'pm_sales', 'pm_teratas', 'pm_win_qty', 'pm_qty_terisi']),
  'rep: tanpa bagian tim/sales lain (per sales, win rate, corong, siklus, PM per sales)');
select uji.sama((select array_agg(e ->> 'id') from jsonb_array_elements(uji.ambil('r') -> 'fu_hari_ini') e), array['ldujids1'],
  'rep: tabel FU hari ini (baris lead ringkas)');
select uji.cek(not uji.ambil('r')::text ~ '(ldujids8|ldujids9|ldujids10|ldujids11|eka wulandari|900000000001)',
  'rep: tidak ada lead/nama/id sales lain di seluruh hasil');
-- ids: pemilik dari parameter diabaikan → tetap lead miliknya
select uji.sama((select array_agg(x order by x) from jsonb_array_elements_text(
    public.web_pipeline_dasbor_ids('{"metrik":"terbuka90","pemilik":900000000001}') -> 'ids') x),
  array['ldujids1', 'ldujids2', 'ldujids3', 'ldujids4'], 'rep: ids pemilik lain → tetap lead miliknya');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"terbuka90","pemilik":"tanpa"}') -> 'ids' ? 'ldujids10', false,
  'rep: ids tanpa pemilik tidak bisa diintip');
select uji.sama(public.web_pipeline_dasbor_ids('{"metrik":"fu_telat"}') -> 'ids', '["ldujids2"]'::jsonb, 'rep: ids FU telat');

-- sales tanpa lead tetap mendapat barisnya sendiri (nol), bukan baris orang lain
reset role;
insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000003, 'rep', 'DDP')
on conflict (member_id) do update set peran = 'rep', kode_sp = 'DDP';
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.simpan('d', public.web_pipeline_dasbor('{}'));
select uji.sama(jsonb_build_object('n', jsonb_array_length(uji.ambil('d') -> 'kesehatan'), 'pemilik', uji.ambil('d') #> '{kesehatan,0,pemilik}',
    'terbuka', uji.ambil('d') #> '{kesehatan,0,terbuka90}', 'omzet', uji.ambil('d') #> '{skor,omzet}', 'fu', uji.ambil('d') -> 'fu_hari_ini'),
  '{"n":1,"pemilik":100000003,"terbuka":0,"omzet":0,"fu":[]}'::jsonb, 'rep tanpa lead: baris nol miliknya');

-- ------------------------------------------------------------ tanpa akses
reset role;
delete from public.pipeline_akses where member_id = 100000003;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.galat($$select public.web_pipeline_dasbor('{}')$$, 'PT403', 'tanpa akses Pipeline: dasbor ditolak', null, 'ACCESS_001');
select uji.galat($$select public.web_pipeline_dasbor_ids('{"metrik":"terbuka90"}')$$, 'PT403', 'tanpa akses: ids ditolak', null, 'ACCESS_001');
reset role;

rollback;
