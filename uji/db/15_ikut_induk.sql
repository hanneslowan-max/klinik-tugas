-- 15 · (review R3) Sub-tugas ikut induk: hapus lunak / pulihkan dan arsip / buka arsip menurun ke semua turunan
-- (ui/api/sistem), sehingga kartu yatim tidak muncul di daftar/agenda/tenggat sebagai "telat" dan purge tidak
-- pernah menghapus permanen kartu yang masih aktif. Impor/sinkron: hanya anak buatan app yang ikut.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

create function uji.budi() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function uji.citra() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
grant execute on all functions in schema uji to public;

-- ---------------------------------------------------------------- data: induk → anak → cucu (+ anak dihapus/diarsip sendiri)
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name, due_at) values ('rtujiind01', 'rlujib0001', 'Induk uji R3', '2026-09-21 12:00+07');
insert into public.tasks (id, list_id, parent_id, name, due_at) values
  ('rtujiind02', 'rlujib0001', 'rtujiind01', 'Anak uji R3', '2026-09-21 12:00+07'),
  ('rtujiind04', 'rlujib0001', 'rtujiind01', 'Anak dihapus sendiri', null),
  ('rtujiind05', 'rlujib0001', 'rtujiind01', 'Anak diarsip sendiri', null);
insert into public.tasks (id, list_id, parent_id, name, due_at) values
  ('rtujiind03', 'rlujib0001', 'rtujiind02', 'Cucu uji R3', '2026-09-21 12:00+07');
insert into public.task_assignees (task_id, member_id) values ('rtujiind02', 100000002), ('rtujiind03', 100000002);
update public.tasks set deleted_at = now() - interval '1 day' where id = 'rtujiind04';   -- trigger memakai now(); geser lewat impor di bawah
select uji.konteks('impor', 900000000002);
update public.tasks set deleted_at = now() - interval '1 day' where id = 'rtujiind04';
update public.tasks set archived = true, archived_at = now() - interval '1 day' where id = 'rtujiind05';
select uji.konteks(null, null);
update public.app_settings set value = '[]' where key = 'tenggat_folder_ids';
select set_config('app.hari_ini', '2026-09-29', true);

-- ---------------------------------------------------------------- hapus induk (web, owner) → turunan ikut ke Sampah
select uji.jadi(uji.budi());
select uji.cek((public.web_hapus('rtujiind01') ->> 'deleted_at') is not null, 'owner: web_hapus induk');
reset role;
select uji.cek((select bool_and(deleted_at = (select deleted_at from public.tasks where id = 'rtujiind01') and deleted_by = 100000001)
                from public.tasks where id in ('rtujiind02', 'rtujiind03')),
  'anak & cucu ikut ke Sampah (deleted_at & deleted_by sama dengan induk)');
select uji.cek((select deleted_at < now() from public.tasks where id = 'rtujiind04'), 'anak yang sudah dihapus sendiri tidak ditimpa');
select uji.cek((select catatan = 'ikut induk rtujiind01' and sumber = 'ui' from uji.akt('rtujiind02', 'hapus'))
               and (select catatan = 'ikut induk rtujiind02' from uji.akt('rtujiind03', 'hapus'))
               and (select catatan is null from uji.akt('rtujiind01', 'hapus')),
  'activity hapus turunan: catatan "ikut induk <id>"');

select uji.jadi_service();
select uji.cek(not (public.api_list_tasks(900000000002, 'rlujib0001', 0, true, true))::text ~ 'rtujiind0[123]',
  'api_list_tasks (subtasks, include_closed): turunan induk terhapus tidak muncul');
select uji.galat($$select public.api_task(900000000002, 'rtujiind02')$$, 'PT404', 'api_task anak dari induk terhapus → 404');
select uji.cek(not (public.x_tenggat(900000000002, '2026-09-29'))::text ~ 'rtujiind0', 'x_tenggat: turunan tidak ditagih sebagai telat');
select uji.cek(not (public.x_search(900000000002, 'uji R3', null, true))::text ~ 'rtujiind0', 'x_search: turunan tidak muncul');
reset role;
select uji.jadi(uji.citra());
select uji.cek(not (public.web_tugas_saya())::text ~ 'rtujiind0', 'web_tugas_saya Citra: anak/cucu yatim tidak muncul');
select uji.cek(not (public.web_daftar('rlujib0001', true))::text ~ 'rtujiind0', 'web_daftar: turunan tidak muncul');
reset role;

-- pulihkan anak saat induk masih di Sampah → 409; pulihkan induk → turunan yang ikut terhapus kembali
select uji.jadi(uji.budi());
select uji.galat($$select public.web_pulihkan('rtujiind02')$$, 'PT409', 'pulihkan anak saat induk di Sampah → 409',
  'Induk tugas ini ada di Sampah', 'KONFLIK_001');
select uji.cek((public.web_pulihkan('rtujiind01') -> 'deleted_at') = 'null', 'owner: pulihkan induk');
reset role;
select uji.cek((select bool_and(deleted_at is null and deleted_by is null) from public.tasks where id in ('rtujiind02', 'rtujiind03'))
               and (select deleted_at is not null from public.tasks where id = 'rtujiind04'),
  'pulihkan induk: anak & cucu yang ikut terhapus pulih; anak yang dihapus sendiri tetap di Sampah');
select uji.cek((select catatan = 'ikut induk rtujiind01' from uji.akt('rtujiind02', 'pulih')), 'activity pulih turunan: catatan ikut induk');

-- ---------------------------------------------------------------- arsip induk → turunan ikut diarsip
select uji.jadi(uji.citra());
select uji.cek((public.web_arsip('rtujiind01', true) ->> 'archived')::boolean, 'member: web_arsip induk');
reset role;
select uji.cek((select bool_and(archived and archived_at = (select archived_at from public.tasks where id = 'rtujiind01'))
                from public.tasks where id in ('rtujiind02', 'rtujiind03')),
  'arsip induk: anak & cucu ikut diarsip');
select uji.jadi_service();
select uji.cek(not (public.api_list_tasks(900000000002, 'rlujib0001', 0, true, true))::text ~ 'rtujiind0',
  'api_list_tasks (archived=false): turunan induk arsip tidak muncul');
reset role;
select uji.jadi(uji.citra());
select uji.galat($$select public.web_arsip('rtujiind02', false)$$, 'PT409', 'buka arsip anak saat induk diarsip → 409',
  'diarsip', 'KONFLIK_001');
select uji.galat($$select public.web_buat_tugas('rlujib0001', '{"name":"anak baru di induk arsip","parent_id":"rtujiind01"}')$$,
  'PT409', 'buat sub-tugas di bawah induk arsip → 409', 'diarsip', 'KONFLIK_001');
select uji.cek(not (public.web_arsip('rtujiind01', false) ->> 'archived')::boolean, 'member: buka arsip induk');
reset role;
select uji.cek((select bool_and(not archived and archived_at is null) from public.tasks where id in ('rtujiind02', 'rtujiind03'))
               and (select archived from public.tasks where id = 'rtujiind05'),
  'buka arsip induk: turunan yang ikut diarsip terbuka lagi; anak yang diarsip sendiri tetap arsip');

-- ---------------------------------------------------------------- jalur API: api_delete_task juga menurun
select uji.jadi_service();
select uji.cek(public.api_delete_task(100000001, 'rtujiind02') = '{}'::jsonb, 'api_delete_task (owner) anak');
reset role;
select uji.cek((select deleted_at is not null and deleted_by = 100000001 from public.tasks where id = 'rtujiind03')
               and (select sumber = 'api' and catatan = 'ikut induk rtujiind02' from uji.akt('rtujiind03', 'hapus')),
  'api_delete_task: cucu ikut ke Sampah (sumber api)');

-- ---------------------------------------------------------------- purge
select uji.jadi(uji.budi());
select uji.simpan('pg', public.web_purge('rtujiind02'));
select uji.sama((select array_agg(x order by x) from jsonb_array_elements_text(uji.ambil('pg') -> 'purged') x),
  array['rtujiind02', 'rtujiind03'], 'purge anak: ikut cucu yang ikut di Sampah');
reset role;
-- keadaan lama/tidak konsisten (anak aktif di bawah induk di Sampah; hanya bisa lewat impor) → purge ditolak
select uji.konteks('ui', 100000001);
update public.tasks set deleted_at = now() where id = 'rtujiind01';
select uji.konteks('impor', 900000000002);
insert into public.tasks (id, list_id, parent_id, name, sumber) values ('rtujiind09', 'rlujib0001', 'rtujiind01', 'Anak aktif (data lama)', 'app');
select uji.konteks(null, null);
select uji.jadi(uji.budi());
select uji.galat($$select public.web_purge('rtujiind01')$$, 'PT409', 'purge induk yang masih punya sub-tugas aktif → 409',
  'sub-tugas aktif', 'KONFLIK_001');
reset role;
select uji.cek(exists (select 1 from public.tasks where id = 'rtujiind09' and deleted_at is null), 'purge ditolak: anak aktif utuh');

-- ---------------------------------------------------------------- sinkron: kartu ClickUp hilang → anak buatan app ikut
select uji.konteks('ui', 100000002);
insert into public.tasks (id, list_id, parent_id, name) values ('rtujiind10', '1100340000900101', 'z8r3uj0001', 'Sub-tugas app di kartu ClickUp');
select uji.konteks(null, null);
reset role;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('eeeeeeee-0000-4000-8000-000000000015', 900000000002, 'bot impor 15', 'rtk_15', uji.sha('rtk_15'), 'impor');
select uji.jadi_service();
select uji.token('eeeeeeee-0000-4000-8000-000000000015');
select uji.sama(public.impor_tandai_hilang(900000000002, 'tasks', array['z8r3uj0007'], 'sinkron', '{"task_ids":["z8r3uj0001","z8r3uj0007"]}') -> 'ids',
  '["z8r3uj0001"]'::jsonb, 'sinkron: induk ClickUp hilang');
reset role;
select uji.cek((select deleted_at is not null and deleted_by is null from public.tasks where id = 'rtujiind10')
               and (select sumber = 'sinkron' and catatan = 'ikut induk z8r3uj0001' from uji.akt('rtujiind10', 'hapus'))
               and uji.n_act('rtujiind10', 'hilang_di_clickup') = 0,
  'sinkron: anak buatan app ikut ke Sampah (activity hapus, bukan hilang_di_clickup)');
select uji.cek((select deleted_at is null from public.tasks where id = 'z8r3uj0007'),
  'sinkron: anak ClickUp TIDAK dikarang ikut hilang (mengikuti data ClickUp sendiri)');
select uji.jadi_service();
select uji.token('eeeeeeee-0000-4000-8000-000000000015');
select uji.sama((public.impor_batch(900000000002, 'tasks', jsonb_build_array(jsonb_build_object(
    'id', 'z8r3uj0001', 'name', 'Y7 · Uji ringkasan kampanye iklan', 'list', jsonb_build_object('id', '1100340000900101'),
    'status', jsonb_build_object('status', 'in progress'), 'creator', jsonb_build_object('id', 100000001),
    'assignees', jsonb_build_array(jsonb_build_object('id', 100000002), jsonb_build_object('id', 100000003)))), 'sinkron')
  ->> 'updated')::int, 1, 'sinkron: kartu ClickUp muncul lagi → dipulihkan');
reset role;
select uji.cek((select deleted_at is null from public.tasks where id = 'rtujiind10')
               and (select catatan = 'ikut induk z8r3uj0001' from uji.akt('rtujiind10', 'pulih')),
  'sinkron: anak buatan app ikut pulih bersama induk ClickUp');

rollback;
