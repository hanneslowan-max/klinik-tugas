-- 08 · Izin hapus (kontrak §3): hapus/pulihkan/purge tugas hanya owner (bot tidak pernah);
-- edit komentar hanya penulis; hapus komentar penulis/owner. Berlaku untuk sumber ui/api.
begin;
\ir _bantu.sql

-- ---------------------------------------------------------------- tugas
select uji.konteks('ui', 100000002);                                   -- Citra (member)
select uji.galat($$update public.tasks set deleted_at = now() where id = 'rtujib0006'$$, 'PT403',
  'member: hapus lunak tugas ditolak', 'Hanya owner', 'HAPUS_OWNER');
select uji.galat($$delete from public.tasks where id = 'rtujib0006'$$, 'PT403', 'member: purge tugas ditolak', null, 'HAPUS_OWNER');
select uji.galat($$update public.tasks set deleted_at = null where id = 'rtujib0004'$$, 'PT403',
  'member: pulihkan tugas ditolak', null, 'HAPUS_OWNER');

select uji.konteks('api', 900000000002);                               -- bot lewat API
select uji.galat($$update public.tasks set deleted_at = now() where id = 'rtujib0006'$$, 'PT403',
  'bot (api): hapus tugas ditolak', null, 'HAPUS_OWNER');
select uji.galat($$delete from public.tasks where id = 'rtujib0006'$$, 'PT403', 'bot (api): purge ditolak', null, 'HAPUS_OWNER');
select uji.jalan($$update public.tasks set name = 'L6 · diubah bot' where id = 'rtujib0006'$$,
  'bot (api): ubah biasa tetap boleh (bukan hapus)');

update public.members set aktif = false where id = 100000001;
select uji.konteks('ui', 100000001);
select uji.galat($$update public.tasks set deleted_at = now() where id = 'rtujib0006'$$, 'PT403',
  'owner nonaktif: hapus ditolak', null, 'HAPUS_OWNER');
update public.members set aktif = true where id = 100000001;

select uji.konteks('ui', 100000001);                                   -- Budi (owner)
select uji.jalan($$update public.tasks set deleted_at = now() where id = 'rtujib0006'$$, 'owner: hapus lunak diizinkan');
select uji.jalan($$update public.tasks set deleted_at = null where id = 'rtujib0006'$$, 'owner: pulihkan diizinkan');
select uji.jalan($$update public.tasks set deleted_at = null where id = 'rtujib0004'$$, 'owner: pulihkan tugas seed diizinkan');
insert into public.tasks (id, list_id, name) values ('rtizin0001', 'rlujib0001', 'Akan di-purge owner');
select uji.jalan($$delete from public.tasks where id = 'rtizin0001'$$, 'owner: purge diizinkan');

select uji.konteks('sinkron', 900000000002);
select uji.jalan($$update public.tasks set deleted_at = now() where id = 'z8r3uj0006'$$,
  'sinkron: tandai hilang di ClickUp tidak butuh owner');

-- ---------------------------------------------------------------- komentar
select uji.konteks('ui', 100000002);                                   -- Citra menulis
insert into public.comments (id, task_id, text) values ('rcizin00001', 'rtujib0001', 'komentar Citra');
select uji.jalan($$update public.comments set text = 'komentar Citra (edit)' where id = 'rcizin00001'$$,
  'penulis: edit komentar sendiri diizinkan');

select uji.konteks('ui', 100000003);                                   -- Dodi (bukan penulis)
select uji.galat($$update public.comments set text = 'diubah Dodi' where id = 'rcizin00001'$$, 'PT403',
  'bukan penulis: edit komentar ditolak', 'Hanya penulis', 'ACCESS_001');
select uji.galat($$update public.comments set deleted_at = now() where id = 'rcizin00001'$$, 'PT403',
  'bukan penulis & bukan owner: hapus komentar ditolak', 'penulis atau owner');

select uji.konteks('ui', 100000001);                                   -- Budi (owner, bukan penulis)
select uji.galat($$update public.comments set text = 'diubah owner' where id = 'rcizin00001'$$, 'PT403',
  'owner bukan penulis: edit komentar tetap ditolak');
select uji.jalan($$update public.comments set deleted_at = now() where id = 'rcizin00001'$$,
  'owner: hapus komentar orang lain diizinkan');

select uji.konteks('ui', 100000002);
insert into public.comments (id, task_id, text) values ('rcizin00002', 'rtujib0001', 'komentar Citra kedua');
select uji.jalan($$update public.comments set deleted_at = now() where id = 'rcizin00002'$$,
  'penulis: hapus komentar sendiri diizinkan');

rollback;
