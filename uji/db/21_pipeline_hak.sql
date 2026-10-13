-- 21 · Pipeline: hak role API sesudah 20261013121000_pipeline_hak_ketat. Tabel/sequence Pipeline tertutup untuk tulis
-- langsung (juga service_role), web_pipeline_* hanya authenticated, x_pipeline_* hanya service_role, pembantu internal
-- (pipeline_wr, pipeline_akses_saya) tertutup — dan semua jalur yang dipakai aplikasi tetap jalan: Edge Function
-- (x_pipeline_*), web (baca, tulis, ringkas), RLS baca langsung untuk rep, penyamaran untuk peran 'baca'.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql
insert into public.pipeline_akses (member_id, peran) values (100000002, 'rep'), (100000003, 'baca') on conflict (member_id) do update set peran = excluded.peran;
select uji.konteks('ui', 100000001);
insert into public.pelanggan (id, nama) values ('plujihak1', 'PT Uji Hak');
insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap) values ('ldujihak1', 'plujihak1', 'Google Ads', 100000002, 'ORDER'), ('ldujihak2', 'plujihak1', 'Referral', 100000002, 'BATAL');
select uji.konteks(null, null);
-- service_role (Edge Function): x_pipeline_* tetap jalan, termasuk ringkas yang memakai pipeline_wr
select uji.jadi_service();
select uji.cek((public.x_pipeline_daftar(900000000002, '{}') ->> 'total')::int >= 2, 'service_role: x_pipeline_daftar jalan');
select uji.cek(public.x_pipeline_lead(900000000002, 'ldujihak1') ->> 'kode' is not null, 'service_role: x_pipeline_lead jalan');
select uji.cek(public.x_pipeline_ringkas(900000000002, '{}') -> 'win_rate' -> 'semua' ? 'rate', 'service_role: x_pipeline_ringkas (pipeline_wr) jalan');
select uji.galat($$insert into public.lead (pelanggan_id, sumber) values ('plujihak1', 'Lainnya')$$, '42501', 'service_role: INSERT langsung ke lead ditolak');
select uji.galat($$select nextval('public.lead_kode_seq')$$, '42501', 'service_role: sequence kode lead tertutup');
select uji.galat($$select public.web_pipeline_saya()$$, '42501', 'service_role: web_pipeline_* ditolak');
select uji.cek((select count(*) from public.lead where id like 'ldujihak%') = 2, 'service_role: SELECT tabel tetap boleh');
reset role;
-- owner (budi) via web: ringkas & daftar
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.cek(public.web_pipeline_ringkas('{}') -> 'win_rate' -> 'semua' ? 'rate', 'owner: web_pipeline_ringkas (pipeline_wr internal) jalan');
select uji.cek((public.web_pipeline_daftar('{}') ->> 'total')::int >= 2, 'owner: web_pipeline_daftar jalan');
select uji.galat($$select public.pipeline_wr(1, 1)$$, '42501', 'authenticated: pipeline_wr tidak bisa dipanggil langsung');
select uji.galat($$select public.pipeline_akses_saya()$$, '42501', 'authenticated: pipeline_akses_saya tidak bisa dipanggil langsung');
reset role;
-- rep (citra): RLS baca langsung tabel tetap jalan (policy memakai boleh_pipeline_penuh)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek((select count(*) from public.lead where id like 'ldujihak%') = 2, 'rep: SELECT lead lewat RLS tetap jalan');
select uji.galat($$update public.lead set catatan = 'x' where id = 'ldujihak1'$$, '42501', 'rep: UPDATE langsung ditolak');
reset role;
-- jalur tulis web tetap jalan (fungsi SECURITY DEFINER memakai sequence & tabel sebagai pemilik)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('baru', public.web_pipeline_lead_buat('{"sumber":"Google Ads","pelanggan":{"nama":"PT Uji Hak Tulis"},"items":[{"produk":"Roda","qty":2}]}'));
select uji.cek((uji.ambil('baru') ->> 'kode') ~ '^L-[0-9]{5,}$', 'rep: web_pipeline_lead_buat jalan (kode dari lead_kode_seq)');
select uji.cek(jsonb_array_length(public.web_pipeline_fu_catat(jsonb_build_object('lead_id', uji.ambil('baru') ->> 'id', 'jenis', 'Telepon', 'hasil', 'uji')) -> 'aktivitas') >= 1,
  'rep: web_pipeline_fu_catat jalan');
select uji.sama(public.web_pipeline_tahap(jsonb_build_object('lead_id', uji.ambil('baru') ->> 'id', 'aksi', 'penawaran')) ->> 'tahap', 'PENAWARAN',
  'rep: web_pipeline_tahap jalan (riwayat tahap via trigger)');
reset role;
-- baca (dodi): data mentah tetap tertutup oleh RLS
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.cek((select count(*) from public.lead) = 0, 'baca: SELECT langsung lead tetap 0 baris (RLS)');
select uji.cek((public.web_pipeline_daftar('{}') ->> 'total')::int >= 2, 'baca: web_pipeline_daftar tersamar tetap jalan');
reset role;
rollback;
