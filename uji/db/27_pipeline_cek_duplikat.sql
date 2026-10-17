-- 26 · Pipeline: peringatan lead dobel per nomor WA/telepon (20261015120000, IMP-CMO-261015-1, ACC Hannes 15 Okt).
-- web_pipeline_cek_duplikat(p_telepon): normalisasi (08… / 628… / +62 8… / spasi-strip-titik / 8…), tanpa cocok,
-- nomor pendek diabaikan, maks 5 terbaru dulu + total, lintas pelanggan (nama "-"), dan hak (admin/rep saja; 'baca',
-- tanpa akses, anon, service_role ditolak; inti_ internal). Fungsi baca: tidak mengubah data.
-- Aktor: budi (owner/admin), citra (rep, RSG), dodi (baca), eka (TANPA akses Pipeline di tes ini).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- ------------------------------------------------------------ hak & search_path
select uji.cek(has_function_privilege('authenticated', 'public.web_pipeline_cek_duplikat(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.web_pipeline_cek_duplikat(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.web_pipeline_cek_duplikat(text)', 'EXECUTE'),
  'web_pipeline_cek_duplikat hanya authenticated');
select uji.cek(not has_function_privilege('authenticated', 'public.inti_pipeline_cek_duplikat(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.inti_pipeline_cek_duplikat(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.inti_pipeline_cek_duplikat(text)', 'EXECUTE'),
  'inti_pipeline_cek_duplikat tidak bisa dipanggil role API');
select uji.cek((select bool_and(coalesce(p.proconfig, '{}') @> array['search_path=""'] and p.prosecdef)
                  from pg_proc p where p.oid in ('public.web_pipeline_cek_duplikat(text)'::regprocedure,
                                                 'public.inti_pipeline_cek_duplikat(text)'::regprocedure)),
  'web_/inti_pipeline_cek_duplikat: SECURITY DEFINER dengan search_path kosong');

-- ------------------------------------------------------------ data uji (dibatalkan di akhir)
insert into public.pipeline_akses (member_id, peran, kode_sp) values (100000002, 'rep', 'RSG'), (100000003, 'baca', null)
on conflict (member_id) do update set peran = excluded.peran, kode_sp = excluded.kode_sp;
delete from public.pipeline_akses where member_id = 900000000001;   -- eka: tanpa akses Pipeline
select uji.konteks('ui', 100000001);
-- dua pelanggan bernama "-" (kasus Okt) dengan nomor yang SAMA, disimpan ternormalisasi seperti fungsi simpan/impor
insert into public.pelanggan (id, nama, kota) values
  ('plujidup1', '-', null), ('plujidup2', '-', 'Gresik'), ('plujidup3', 'PT Uji Dobel Lain', 'Surabaya'),
  ('plujidup4', 'PT Uji Banyak Lead', null), ('plujidup5', 'CV Uji Nomor Pendek', null);
insert into public.kontak (id, pelanggan_id, nama, telepon, telepon_tampil) values
  ('ktujidup1', 'plujidup1', 'Pak Andi Uji', public.pipeline_telp_norm('0812-9900-1122'), '0812-9900-1122'),
  ('ktujidup2', 'plujidup2', null,           public.pipeline_telp_norm('+62 812 9900 1122'), '+62 812 9900 1122'),
  ('ktujidup3', 'plujidup3', 'Bu Sari Uji',  public.pipeline_telp_norm('0813 7700 3344'), '0813 7700 3344'),
  ('ktujidup4', 'plujidup4', 'Pak Banyak',   public.pipeline_telp_norm('0857 1100 2200'), '0857 1100 2200'),
  ('ktujidup5', 'plujidup5', 'Pendek',       public.pipeline_telp_norm('1234567'), '1234567');
insert into public.lead (id, kode, pelanggan_id, kontak_id, sumber, pemilik, tahap, tanggal_masuk) values
  ('ldujidup1', 'UJD-001', 'plujidup1', 'ktujidup1', 'WA langsung', 100000002, 'PENAWARAN', '2026-10-02'),
  ('ldujidup2', 'UJD-002', 'plujidup2', 'ktujidup2', 'Google Ads',  null,      'BARU',      '2026-10-09'),
  ('ldujidup3', 'UJD-003', 'plujidup3', 'ktujidup3', 'Meta Ads',    100000002, 'BARU',      '2026-10-05'),
  ('ldujidup9', 'UJD-009', 'plujidup1', null,        'WA langsung', 100000002, 'BARU',      '2026-10-11'),  -- tanpa kontak: tak ikut
  ('ldujidupp', 'UJD-PDK', 'plujidup5', 'ktujidup5', 'Lainnya',     null,      'BARU',      '2026-10-01');
insert into public.lead (id, kode, pelanggan_id, kontak_id, sumber, pemilik, tahap, tanggal_masuk)
select 'ldujidupb' || g, 'UJD-B0' || g, 'plujidup4', 'ktujidup4', 'Referral', 100000002,
       (array['BARU','PENAWARAN','ORDER','BATAL'])[1 + g % 4], date '2026-09-01' + g
from generate_series(1, 7) g;
select uji.konteks(null, null);
select uji.sama(public.pipeline_telp_norm('0812-9900-1122'), '6281299001122', 'data uji: nomor tersimpan ternormalisasi 62…');
create function pg_temp.jejak() returns jsonb language sql as $$
  select jsonb_build_array((select count(*) from public.lead), (select count(*) from public.kontak), (select count(*) from public.pelanggan),
    (select count(*) from public.lead_aktivitas), (select count(*) from public.lead_riwayat_tahap),
    (select max(diperbarui_pada) from public.lead))
$$;
select uji.simpan('jejak0', pg_temp.jejak());

-- ------------------------------------------------------------ rep (citra): normalisasi
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.simpan('d08', public.web_pipeline_cek_duplikat('081299001122'));
select uji.simpan('d62', public.web_pipeline_cek_duplikat('6281299001122'));
select uji.simpan('dplus', public.web_pipeline_cek_duplikat('+62 812-9900-1122'));
select uji.simpan('dspasi', public.web_pipeline_cek_duplikat(' 0812 9900 1122 '));
select uji.simpan('dstrip', public.web_pipeline_cek_duplikat('0812-9900-1122'));
select uji.simpan('dtitik', public.web_pipeline_cek_duplikat('+62.812.9900.1122'));
select uji.simpan('d8', public.web_pipeline_cek_duplikat('81299001122'));
select uji.simpan('dkurung', public.web_pipeline_cek_duplikat('(0812) 9900-1122'));
select uji.simpan('dbeda', public.web_pipeline_cek_duplikat('081299001199'));
select uji.simpan('dpendek', public.web_pipeline_cek_duplikat('1234567'));
select uji.simpan('dpendek2', public.web_pipeline_cek_duplikat('0812'));
select uji.simpan('dkosong', public.web_pipeline_cek_duplikat(''));
select uji.simpan('dnull', public.web_pipeline_cek_duplikat(null));
select uji.simpan('dhuruf', public.web_pipeline_cek_duplikat('belum ada nomor'));
select uji.simpan('dbanyak', public.web_pipeline_cek_duplikat('085711002200'));
reset role;

select uji.sama((select array_agg(e ->> 'kode') from jsonb_array_elements(uji.ambil('d08') -> 'items') e),
  array['UJD-002', 'UJD-001'], '08…: 2 lead lintas pelanggan "-" ditemukan, terbaru dulu');
select uji.sama((uji.ambil('d08') ->> 'total')::int, 2, '08…: total 2');
select uji.sama(uji.ambil('d08') ->> 'telepon', '6281299001122', '08…: nomor ternormalisasi dikembalikan');
select uji.sama(uji.ambil('d62'), uji.ambil('d08'), '628…: hasil sama dengan 08…');
select uji.sama(uji.ambil('dplus'), uji.ambil('d08'), '+62 8…-…: hasil sama dengan 08…');
select uji.sama(uji.ambil('dspasi'), uji.ambil('d08'), 'spasi (termasuk di tepi): hasil sama dengan 08…');
select uji.sama(uji.ambil('dstrip'), uji.ambil('d08'), 'strip: hasil sama dengan 08…');
select uji.sama(uji.ambil('dtitik'), uji.ambil('d08'), '+62 dengan titik: hasil sama dengan 08…');
select uji.sama(uji.ambil('d8'), uji.ambil('d08'), 'awalan 8 (tanpa 0/62): hasil sama dengan 08…');
select uji.sama(uji.ambil('dkurung'), uji.ambil('d08'), 'kurung + spasi + strip: hasil sama dengan 08…');

-- bentuk baris
select uji.sama(uji.kunci(uji.ambil('d08') #> '{items,1}'),
  array['dibuat_pada', 'id', 'kode', 'kontak_nama', 'pelanggan', 'pemilik', 'pemilik_nama', 'tahap', 'tanggal_masuk'],
  'kunci baris: kode, pelanggan, tahap, pemilik/PIC, tanggal');
select uji.sama((uji.ambil('d08') #> '{items,1}') - 'dibuat_pada',
  jsonb_build_object('id', 'ldujidup1', 'kode', 'UJD-001', 'pelanggan', '-', 'tahap', 'PENAWARAN', 'pemilik', 100000002,
                     'pemilik_nama', 'citra lestari', 'kontak_nama', 'Pak Andi Uji', 'tanggal_masuk', '2026-10-02'),
  'isi baris: pelanggan "-", tahap, pemilik (sales), PIC kontak, tanggal masuk');
select uji.cek((uji.ambil('d08') #> '{items,0}' ->> 'pemilik') is null and (uji.ambil('d08') #> '{items,0}' ->> 'pemilik_nama') is null
  and (uji.ambil('d08') #> '{items,0}' ->> 'kontak_nama') is null, 'lead tanpa pemilik & kontak tanpa nama: null (bukan galat)');
select uji.cek((uji.ambil('d08') #> '{items,0}' ->> 'dibuat_pada') ~ '^\d{4}-\d\d-\d\dT', 'dibuat_pada ISO UTC');
select uji.cek(not (uji.ambil('d08') -> 'items') @> '[{"id":"ldujidup9"}]', 'lead pelanggan sama TANPA kontak bernomor tidak ikut');

-- tanpa cocok & nomor pendek/kosong diabaikan
select uji.sama(uji.ambil('dbeda'), jsonb_build_object('telepon', '6281299001199', 'total', 0, 'items', '[]'::jsonb),
  'nomor lain: tanpa cocok (total 0, items [])');
select uji.sama(uji.ambil('dpendek'), jsonb_build_object('telepon', null, 'total', 0, 'items', '[]'::jsonb),
  'nomor 7 digit diabaikan walau ada kontak bernomor sama');
select uji.sama(uji.ambil('dpendek2'), uji.ambil('dpendek'), '"0812" (pendek) diabaikan');
select uji.sama(uji.ambil('dkosong'), uji.ambil('dpendek'), 'string kosong diabaikan');
select uji.sama(uji.ambil('dnull'), uji.ambil('dpendek'), 'NULL diabaikan');
select uji.sama(uji.ambil('dhuruf'), uji.ambil('dpendek'), 'teks tanpa digit diabaikan');

-- batas 5, terbaru dulu, total tetap semua
select uji.sama((uji.ambil('dbanyak') ->> 'total')::int, 7, 'banyak lead: total = 7');
select uji.sama((select array_agg(e ->> 'kode') from jsonb_array_elements(uji.ambil('dbanyak') -> 'items') e),
  array['UJD-B07', 'UJD-B06', 'UJD-B05', 'UJD-B04', 'UJD-B03'], 'banyak lead: maks 5, tanggal masuk terbaru dulu');

-- ------------------------------------------------------------ owner/admin: sama dengan rep (tidak ada penyamaran di jalur tulis)
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('downer', public.web_pipeline_cek_duplikat('081299001122'));
reset role;
select uji.sama(uji.ambil('downer'), uji.ambil('d08'), 'owner: hasil sama dengan rep');

-- ------------------------------------------------------------ yang ditolak
select uji.jadi('33333333-3333-4333-8333-333333333333');   -- dodi (baca): telepon tersamar → tidak boleh cari lewat nomor
select uji.galat($q$select public.web_pipeline_cek_duplikat('081299001122')$q$, 'PT403', 'baca: ditolak', 'akses tulis Pipeline');
select uji.galat($q$select public.web_pipeline_cek_duplikat('0812')$q$, 'PT403', 'baca: ditolak juga untuk nomor pendek');
reset role;
select uji.jadi('44444444-4444-4444-8444-444444444444');   -- eka: tanpa akses Pipeline
select uji.galat($q$select public.web_pipeline_cek_duplikat('081299001122')$q$, 'PT403', 'tanpa akses Pipeline: ditolak');
select uji.galat($q$select public.inti_pipeline_cek_duplikat('081299001122')$q$, '42501', 'authenticated: inti_ tidak bisa dipanggil langsung');
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($q$select public.inti_pipeline_cek_duplikat('081299001122')$q$, '42501', 'rep: inti_ tidak bisa dipanggil langsung');
reset role;
select uji.jadi_anon();
select uji.galat($q$select public.web_pipeline_cek_duplikat('081299001122')$q$, '42501', 'anon: ditolak');
reset role;
select uji.jadi_service();
select uji.galat($q$select public.web_pipeline_cek_duplikat('081299001122')$q$, '42501', 'service_role: web_ ditolak');
reset role;

-- ------------------------------------------------------------ fungsi baca: tidak menulis apa pun
select uji.sama(pg_temp.jejak(), uji.ambil('jejak0'),
  'tidak ada lead/kontak/pelanggan/aktivitas/riwayat baru atau lead terubah sesudah pengecekan');

rollback;
