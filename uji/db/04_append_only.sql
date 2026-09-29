-- 04 · activity append-only: tidak bisa UPDATE/DELETE/TRUNCATE oleh siapa pun (postgres, authenticated, service_role).
begin;
\ir _bantu.sql

create temp table awal as
  select count(*) as n, max(id) as maks, (select jenis from public.activity order by id limit 1) as jenis_pertama
  from public.activity;
grant select on awal to public;
select uji.cek((select n from awal) > 0, 'ada activity dari seed');

-- ---------------------------------------------------------------- pemilik tabel (postgres): trigger menolak
select uji.galat($$update public.activity set jenis = 'nama' where id = (select min(id) from public.activity)$$,
  'PT403', 'postgres: UPDATE activity ditolak trigger', 'append-only', 'ACCESS_001');
select uji.galat($$delete from public.activity where id = (select min(id) from public.activity)$$,
  'PT403', 'postgres: DELETE activity ditolak trigger', 'append-only');
select uji.galat($$truncate public.activity$$, 'PT403', 'postgres: TRUNCATE activity ditolak trigger');

-- ---------------------------------------------------------------- authenticated (member Citra): tidak punya hak
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek((select count(*) from public.activity) = (select n from awal), 'member bisa membaca activity');
select uji.galat($$update public.activity set catatan = 'ubah' where true$$, '42501', 'member: UPDATE activity ditolak');
select uji.galat($$delete from public.activity where true$$, '42501', 'member: DELETE activity ditolak');
select uji.galat($$insert into public.activity (task_id, sumber, jenis) values ('rtujib0001', 'ui', 'nama')$$,
  '42501', 'member: INSERT activity langsung ditolak (hanya trigger)');
select uji.galat($$truncate public.activity$$, '42501', 'member: TRUNCATE activity ditolak');
reset role;

-- ---------------------------------------------------------------- owner (Budi) juga tidak
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.galat($$update public.activity set catatan = 'ubah' where true$$, '42501', 'owner: UPDATE activity ditolak');
select uji.galat($$delete from public.activity where true$$, '42501', 'owner: DELETE activity ditolak');
reset role;

-- ---------------------------------------------------------------- service_role: baca saja
select uji.jadi_service();
select uji.cek((select count(*) from public.activity) = (select n from awal), 'service_role bisa membaca activity');
select uji.galat($$update public.activity set catatan = 'ubah' where true$$, '42501', 'service_role: UPDATE activity ditolak');
select uji.galat($$delete from public.activity where true$$, '42501', 'service_role: DELETE activity ditolak');
select uji.galat($$insert into public.activity (task_id, sumber, jenis) values ('rtujib0001', 'ui', 'nama')$$,
  '42501', 'service_role: INSERT activity langsung ditolak');
reset role;

-- ---------------------------------------------------------------- anon: tidak bisa apa-apa
select uji.jadi_anon();
select uji.galat($$select count(*) from public.activity$$, '42501', 'anon: SELECT activity ditolak');
select uji.galat($$delete from public.activity where true$$, '42501', 'anon: DELETE activity ditolak');
reset role;

select uji.cek((select count(*) from public.activity) = (select n from awal)
           and (select jenis from public.activity order by id limit 1) = (select jenis_pertama from awal),
  'isi activity tidak berubah setelah semua percobaan');

-- trigger tetap bisa menambah (jalur resmi)
select uji.konteks('ui', 100000001);
update public.tasks set priority = 2 where id = 'rtujib0006';
select uji.cek((select count(*) from public.activity) = (select n from awal) + 1, 'jalur trigger tetap bisa menambah activity');

rollback;
