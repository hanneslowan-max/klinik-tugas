-- 11 · Endpoint tambahan x_*: activity, search, resolve, tenggat (B10/B5, tanggal dipatok), sensus, export.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- ================================================================ x_activity
select uji.jadi_service();
select uji.simpan('act', public.x_activity(900000000002, 'rtujib0003'));
select uji.cek(jsonb_typeof(uji.ambil('act')) = 'array' and jsonb_array_length(uji.ambil('act')) >= 3, 'x_activity: array');
select uji.sama(uji.kunci(uji.ambil('act') -> 0),
  array['aktor','aktor_assignee','at','at_awal','catatan','dari','id','jenis','ke','lengkap','snapshot','sumber'],
  'x_activity: kunci baris');
select uji.sama(uji.ambil('act') #>> '{0,jenis}', 'dibuat', 'x_activity: urut waktu (dibuat dulu)');
select uji.cek((select a #>> '{aktor,username}' = 'eka wulandari' and a -> 'snapshot' ? 'komentar_terakhir'
                   and a ->> 'at' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
                from jsonb_array_elements(uji.ambil('act')) a where a ->> 'jenis' = 'status'),
  'x_activity: status ditutup + aktor + snapshot + at ISO UTC');
select uji.cek((select bool_and((x -> 'aktor') = 'null' or x -> 'aktor' ? 'username')
                from jsonb_array_elements(public.x_activity(900000000002, 'z8r3uj0005')) x)
               and exists (select 1 from jsonb_array_elements(public.x_activity(900000000002, 'z8r3uj0005')) x
                            where x ->> 'jenis' = 'ditutup_impor' and (x -> 'aktor') = 'null' and not (x ->> 'lengkap')::boolean),
  'x_activity impor: ditutup_impor aktor null, lengkap false');
select uji.cek(jsonb_array_length(public.x_activity(900000000002, 'rtujib0004')) > 0, 'x_activity tugas terhapus tetap bisa');
select uji.galat($$select public.x_activity(900000000002, 'tidakada')$$, 'PT404', 'x_activity: tak ada → 404', null, 'ITEM_013');

-- ================================================================ x_search
select uji.simpan('s1', public.x_search(900000000002, 'Y7'));
select uji.sama(uji.ambil('s1') #>> '{0,id}', 'z8r3uj0001', 'x_search "Y7": kode di awal nama paling atas');
select uji.cek(uji.ambil('s1') @> '[{"id":"z8r3uj0007"}]', 'x_search "Y7": Y7a ikut (cocok nama)');
select uji.sama(uji.kunci(uji.ambil('s1') -> 0),
  array['assignees','due_wib','id','list','name','space_id','status','status_type','updated','url'], 'x_search: kunci ringkas');
select uji.cek(uji.ambil('s1') #> '{0,assignees}' = '["citra lestari","dodi pratama"]'::jsonb
               and uji.ambil('s1') #> '{0,list}' = '{"id":"1100340000900101","name":"Fase Uji 1"}'::jsonb,
  'x_search: assignees username, list {id,name}');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(public.x_search(900000000002, 'https://app.clickup.com/t/z8r3uj0005')) x),
  array['z8r3uj0005'], 'x_search URL ClickUp: kartu complete tetap ketemu (ID persis)');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(public.x_search(900000000002, 'blok sinkron')) x),
  array['z8r3uj0014'], 'x_search: cocok isi deskripsi');
select uji.cek(not public.x_search(900000000002, 'Uji rekap') @> '[{"id":"z8r3uj0005"}]'
               and public.x_search(900000000002, 'Uji rekap', null, true) @> '[{"id":"z8r3uj0005"}]',
  'x_search: kartu selesai hanya dengan include_closed');
select uji.sama((select count(*)::int from jsonb_array_elements(public.x_search(900000000002, 'Latihan', '1100340000900001')) x), 0,
  'x_search: filter space');
select uji.cek(not public.x_search(900000000002, 'Latihan', null, true) @> '[{"id":"rtujib0004"}]', 'x_search: terhapus tidak tampil');
select uji.sama(jsonb_array_length(public.x_search(900000000002, '100%_tidak_ada')), 0, 'x_search: wildcard LIKE di-escape');
select uji.galat($$select public.x_search(900000000002, '  ')$$, 'PT400', 'x_search kosong → 400');

-- ================================================================ x_resolve
select uji.sama(public.x_resolve(900000000002, 'z8r3uj0001'),
  '{"type":"task","id":"z8r3uj0001","url":"https://tugas.palletmeshindonesia.com/t/z8r3uj0001"}'::jsonb, 'resolve ID tugas');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/t/z8r3uj0002?x=1') ->> 'id', 'z8r3uj0002', 'resolve URL ClickUp');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/t/1100340000004525/z8r3uj0003') ->> 'id', 'z8r3uj0003',
  'resolve URL ClickUp /t/<team>/<id>');
select uji.sama(public.x_resolve(900000000002, 'https://tugas.palletmeshindonesia.com/t/rtujib0001/') ->> 'id', 'rtujib0001', 'resolve URL app');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/li/1100340000900101'),
  '{"type":"list","id":"1100340000900101","url":"https://tugas.palletmeshindonesia.com/l/1100340000900101"}'::jsonb, 'resolve URL list ClickUp');
select uji.sama(public.x_resolve(900000000002, '1100340000900011') ->> 'type', 'folder', 'resolve ID folder');
select uji.sama(public.x_resolve(900000000002, '1100340000900001') ->> 'type', 'space', 'resolve ID space');
select uji.sama(public.x_resolve(900000000002, '100000002') ->> 'type', 'member', 'resolve ID anggota');
select uji.sama(public.x_resolve(900000000002, '90180000000001'),
  '{"type":"comment","id":"90180000000001","url":"https://tugas.palletmeshindonesia.com/t/z8r3uj0001#c-90180000000001"}'::jsonb,
  'resolve ID komentar');
select uji.galat($$select public.x_resolve(900000000002, 'z8r3tidakada')$$, 'PT404', 'resolve tak ada → 404', null, 'ITEM_013');

-- ================================================================ x_tenggat (tanggal dipatok: Jumat 2 Okt 2026)
reset role;
select uji.konteks('ui', 100000001);
insert into public.spaces (id, name) values ('rsujtengg1', 'Ruang tenggat uji');
insert into public.folders (id, space_id, name) values ('rfujtengg1', 'rsujtengg1', 'Eksekusi tenggat uji');
insert into public.lists (id, space_id, folder_id, name) values ('rlujtengg1', 'rsujtengg1', 'rfujtengg1', 'Fase tenggat');
insert into public.lists (id, space_id, folder_id, name, tidak_ditagih) values ('rlujtengg2', 'rsujtengg1', 'rfujtengg1', 'Di luar periode', true);
insert into public.lists (id, space_id, name) values ('rlujtengg3', 'rsujtengg1', 'List di luar folder');
create function pg_temp.t(p_id text, p_list text, p_nama text, p_due date, p_ass bigint[], p_status text default 'to do')
returns void language plpgsql as $$
begin
  insert into public.tasks (id, list_id, name, status, due_at)
  values (p_id, p_list, p_nama, p_status, case when p_due is not null then (p_due::text || ' 12:00+07')::timestamptz end);
  insert into public.task_assignees (task_id, member_id) select p_id, x from unnest(p_ass) x;
end $$;
select pg_temp.t('rtujteng01', 'rlujtengg1', 'T1 telat 7', '2026-09-25', array[100000002]::bigint[]);
select pg_temp.t('rtujteng02', 'rlujtengg1', 'T2 telat 1 bersama', '2026-10-01', array[100000002, 100000003]::bigint[]);
select pg_temp.t('rtujteng03', 'rlujtengg1', 'T3 hari ini', '2026-10-02', array[100000003]::bigint[]);
select pg_temp.t('rtujteng04', 'rlujtengg1', 'T4 Sabtu', '2026-10-03', array[100000002]::bigint[]);
select pg_temp.t('rtujteng05', 'rlujtengg1', 'T5 Senin', '2026-10-05', array[100000002]::bigint[]);
select pg_temp.t('rtujteng06', 'rlujtengg1', 'T6 Rabu', '2026-10-07', array[100000003]::bigint[]);
select pg_temp.t('rtujteng07', 'rlujtengg1', 'T7 Kamis', '2026-10-08', array[100000003]::bigint[]);
select pg_temp.t('rtujteng08', 'rlujtengg1', 'T8 · BERSYARAT uji', '2026-09-30', array[100000002]::bigint[]);
select pg_temp.t('rtujteng09', 'rlujtengg1', 'T9 selesai', '2026-09-28', array[100000002]::bigint[], 'complete');
select pg_temp.t('rtujteng10', 'rlujtengg1', 'T10 parkir', null, array[100000002]::bigint[]);
select pg_temp.t('rtujteng11', 'rlujtengg2', 'T11 tidak ditagih', '2026-09-20', array[100000002]::bigint[]);
select pg_temp.t('rtujteng12', 'rlujtengg1', 'T12 tanpa assignee', '2026-10-01', '{}'::bigint[]);
select pg_temp.t('rtujteng13', 'rlujtengg1', 'T13 arsip', '2026-09-29', array[100000002]::bigint[]);
update public.tasks set archived = true where id = 'rtujteng13';
select pg_temp.t('rtujteng14', 'rlujtengg3', 'T14 di luar folder', '2026-09-29', array[100000002]::bigint[]);
select pg_temp.t('rtujtenb' || g, 'rlujtengg1', 'Beban ' || g, '2026-10-09', array[900000000001]::bigint[]) from generate_series(1, 8) g;
select pg_temp.t('rtujtenc' || g, 'rlujtengg1', 'Beban pas ' || g, '2026-10-09', array[100000003]::bigint[]) from generate_series(1, 7) g;

select uji.jadi_service();
select uji.simpan('tg', public.x_tenggat(900000000002, '2026-10-02', 'rfujtengg1'));
select uji.sama(uji.kunci(uji.ambil('tg')), array['beban','folder_ids','h1_sampai','per_anggota','ringkas','tanggal'], 'x_tenggat: kunci');
select uji.cek(uji.ambil('tg') ->> 'tanggal' = '2026-10-02' and uji.ambil('tg') ->> 'h1_sampai' = '2026-10-05',
  'Jumat: h1 sampai Senin');
select uji.sama(uji.ambil('tg') -> 'ringkas', '{"telat":3,"hari_ini":1,"tiga_hk":3,"h1":2,"menunggu_keputusan":1}'::jsonb,
  'ringkas: telat 3 (T1,T2,T12), hari ini 1, ≤3hk 3 (T4,T5,T6), h1 2 (Sab,Sen), menunggu 1');
create function pg_temp.anggota(p_id bigint) returns jsonb language sql as $$
  select a from jsonb_array_elements(uji.ambil('tg') -> 'per_anggota') a where (a #>> '{member,id}')::bigint = p_id
$$;
select uji.sama(uji.kunci(pg_temp.anggota(100000002)), array['h1','hari_ini','member','menunggu_keputusan','telat','tiga_hk'],
  'per_anggota: kunci');
select uji.sama((select array_agg(x ->> 'id' || ':' || (x ->> 'lewat_hari') order by o) from jsonb_array_elements(pg_temp.anggota(100000002) -> 'telat') with ordinality e(x, o)),
  array['rtujteng01:7', 'rtujteng02:1'], 'Citra telat: paling lama dulu, lewat_hari kalender');
select uji.sama((select array_agg(x ->> 'id' || ':' || (x ->> 'sisa_hk') order by o) from jsonb_array_elements(pg_temp.anggota(100000002) -> 'tiga_hk') with ordinality e(x, o)),
  array['rtujteng04:0', 'rtujteng05:1'], 'Citra ≤3hk: Sabtu sisa 0, Senin sisa 1');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(pg_temp.anggota(100000002) -> 'h1') x),
  array['rtujteng04', 'rtujteng05'], 'Citra H-1 (Jumat → Sab–Sen)');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(pg_temp.anggota(100000002) -> 'menunggu_keputusan') x),
  array['rtujteng08'], 'BERSYARAT → menunggu_keputusan (bukan telat)');
select uji.cek(not (pg_temp.anggota(100000002) -> 'telat') @> '[{"id":"rtujteng08"}]', 'BERSYARAT tidak di telat');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(pg_temp.anggota(100000003) -> 'telat') x),
  array['rtujteng02'], 'kartu bersama muncul di tiap assignee');
select uji.sama((select array_agg(x ->> 'id') from jsonb_array_elements(pg_temp.anggota(100000003) -> 'hari_ini') x),
  array['rtujteng03'], 'Dodi hari ini');
select uji.sama((select array_agg(x ->> 'id' || ':' || (x ->> 'sisa_hk')) from jsonb_array_elements(pg_temp.anggota(100000003) -> 'tiga_hk') x),
  array['rtujteng06:3'], 'Dodi ≤3hk: Rabu sisa 3 (Kamis sisa 4 tidak)');
select uji.cek((select a -> 'member' = 'null' and a -> 'telat' @> '[{"id":"rtujteng12"}]'
                from jsonb_array_elements(uji.ambil('tg') -> 'per_anggota') a where a -> 'member' = 'null'),
  'tanpa assignee: entri member null');
select uji.cek(not (uji.ambil('tg')::text ~ 'rtujteng(09|10|11|13|14)'),
  'dikecualikan: selesai, parkir, list tidak_ditagih, arsip, di luar folder cakupan');
select uji.sama(uji.kunci(pg_temp.anggota(100000002) #> '{telat,0}'),
  array['due_wib','id','komentar_terakhir','lewat_hari','list','name','status','url'], 'item tenggat: kunci');
select uji.sama(uji.ambil('tg') -> 'beban',
  '[{"member":{"id":900000000001,"username":"eka wulandari"},"due_wib":"2026-10-09","jumlah":8}]'::jsonb,
  'beban B5: hanya >7 (8 muncul, 7 tidak)');
select uji.cek(not exists (select 1 from jsonb_array_elements(uji.ambil('tg') -> 'per_anggota') a
                            where (a #>> '{member,id}')::bigint = 900000000001),
  'anggota tanpa kartu di kategori mana pun tidak didaftar');

select uji.simpan('tg2', public.x_tenggat(900000000002, '2026-09-30', 'rfujtengg1'));
select uji.cek(uji.ambil('tg2') ->> 'h1_sampai' = '2026-10-01', 'Rabu: h1 = besok');
select uji.sama((uji.ambil('tg2') #>> '{ringkas,h1}')::int, 2, 'Rabu: h1 = kartu due Kamis (T2, T12)');
select uji.sama((select x -> 'lewat_hari' from jsonb_array_elements(uji.ambil('tg2') -> 'per_anggota') a,
                        jsonb_array_elements(a -> 'menunggu_keputusan') x where x ->> 'id' = 'rtujteng08'), 'null'::jsonb,
  'menunggu_keputusan belum lewat due: lewat_hari null');
select uji.sama((select (x ->> 'lewat_hari')::int from jsonb_array_elements(pg_temp.anggota(100000002) -> 'menunggu_keputusan') x), 2,
  'menunggu_keputusan lewat due: lewat_hari hari kalender');

reset role;
update public.app_settings set value = '["rfujtengg1"]' where key = 'tenggat_folder_ids';
select uji.jadi_service();
select uji.sama(public.x_tenggat(900000000002, '2026-10-02') -> 'ringkas', uji.ambil('tg') -> 'ringkas',
  'cakupan dari app_settings.tenggat_folder_ids');
reset role;
insert into public.hari_libur (tanggal, nama) values ('2026-10-05', 'Libur uji');
select uji.jadi_service();
select uji.sama((select x ->> 'sisa_hk' from jsonb_array_elements(
                   (select a -> 'tiga_hk' from jsonb_array_elements(public.x_tenggat(900000000002, '2026-10-02') -> 'per_anggota') a
                     where (a #>> '{member,id}')::bigint = 100000003)) x where x ->> 'id' = 'rtujteng06'), '2',
  'hari libur mengurangi sisa hari kerja');
select uji.sama(jsonb_array_length(public.x_tenggat(900000000002, '2026-10-02', 'folder-tak-ada') -> 'per_anggota'), 0,
  'folder tak ada: kosong');

-- ================================================================ x_sensus
select uji.simpan('sen', public.x_sensus(900000000002));
create function pg_temp.sensus(p_list text, p_sumber text default null) returns jsonb language sql as $$
  select l from jsonb_array_elements(case when p_sumber is null then uji.ambil('sen') else uji.ambil('sen_cu') end -> 'lists') l
   where l ->> 'list_id' = p_list
$$;
select uji.sama(uji.kunci(pg_temp.sensus('1100340000900101')),
  array['archived','archived_list','assignee_links','attachments_comment','attachments_task','closed','comments_top','deleted',
        'folder_id','list_id','name','open','replies','reply_count_sum','sha_ids_comments','sha_ids_tasks','space_id','subtasks',
        'tasks_total'], 'x_sensus: kunci per list');
select uji.sama(pg_temp.sensus('1100340000900101') - array['name','space_id','folder_id','archived_list','sha_ids_tasks','sha_ids_comments','list_id'],
  '{"tasks_total":10,"open":8,"closed":2,"archived":1,"deleted":0,"subtasks":1,"comments_top":4,"replies":1,"reply_count_sum":1,
    "attachments_task":1,"attachments_comment":1,"assignee_links":11}'::jsonb, 'x_sensus Fase Uji 1: angka');
select uji.sama(pg_temp.sensus('1100340000900101') ->> 'sha_ids_tasks',
  uji.sha('z8r3uj0001,z8r3uj0002,z8r3uj0003,z8r3uj0004,z8r3uj0005,z8r3uj0006,z8r3uj0007,z8r3uj0008,z8r3uj0009,z8r3uj0010'),
  'sha_ids_tasks = sha256 id terurut dipisah koma');
select uji.sama(pg_temp.sensus('1100340000900101') ->> 'sha_ids_comments',
  uji.sha('90180000000001,90180000000002,90180000000003,90180000000004,90180000000005'), 'sha_ids_comments');
select uji.cek((select (l ->> 'tasks_total')::int = 5 and (l ->> 'deleted')::int = 1 from (select pg_temp.sensus('rlujib0001') l) x),
  'x_sensus: terhapus tidak dihitung di total, dihitung di deleted');
select uji.sama((uji.ambil('sen') #>> '{total,tasks_total}')::int,
  (select count(*)::int from public.tasks where deleted_at is null), 'x_sensus total.tasks_total');
select uji.simpan('sen_cu', public.x_sensus(900000000002, 'clickup'));
select uji.sama((pg_temp.sensus('rlujib0001', 'clickup') ->> 'tasks_total')::int, 0, 'x_sensus sumber clickup: tugas app tidak dihitung');
select uji.sama((select sum((l ->> 'tasks_total')::int)::int from jsonb_array_elements(uji.ambil('sen_cu') -> 'lists') l
                  where l ->> 'space_id' = '1100340000900001'), 20, 'x_sensus clickup: 20 kartu impor seed (space seed)');
select uji.galat($$select public.x_sensus(900000000002, 'lain')$$, 'PT400', 'x_sensus sumber salah → 400');

-- ================================================================ x_export
reset role;
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('cccccccc-0000-4000-8000-000000000001', 900000000002, 'bot baca', 'rtk_e1', uji.sha('rtk_e1'), 'baca'),
  ('cccccccc-0000-4000-8000-000000000002', 900000000002, 'bot impor', 'rtk_e2', uji.sha('rtk_e2'), 'impor');
select uji.jadi_service();
select uji.simpan('exp', public.x_export(900000000002));
select uji.sama(uji.kunci(uji.ambil('exp')),
  array['activity','api_tokens','app_settings','attachments','comment_mentions','comments','folders','hari_libur','list_statuses',
        'lists','members','meta','notifications','space_anggota','spaces','sync_raw','sync_runs','task_assignees','tasks','workspace'],
  'x_export: semua tabel data (tanpa idem; + space_anggota review R2)');
select uji.galat($$select public.x_export(100000002)$$, 'PT403', 'x_export oleh member (bukan owner/bot) → 403 (review R2)',
  null, 'ACCESS_001');
select uji.cek(not uji.ambil('exp')::text like '%token_hash%', 'x_export: tanpa token_hash');
select uji.sama(jsonb_array_length(uji.ambil('exp') -> 'api_tokens'), 2, 'x_export: metadata token ada');
select uji.cek(not (uji.ambil('exp') #> '{tasks,0}') ? 'cari', 'x_export: kolom turunan cari dibuang');
select uji.sama(jsonb_array_length(uji.ambil('exp') -> 'tasks'), (select count(*)::int from public.tasks), 'x_export: semua tugas (termasuk terhapus)');
select uji.sama(jsonb_array_length(uji.ambil('exp') -> 'activity'), (select count(*)::int from public.activity), 'x_export: semua activity');
select uji.token('cccccccc-0000-4000-8000-000000000001');
select uji.galat($$select public.x_export(900000000002)$$, 'PT403', 'x_export dengan token baca → 403');
select uji.token('cccccccc-0000-4000-8000-000000000002');
select uji.jalan($$select public.x_export(900000000002)$$, 'x_export dengan token impor boleh');
select uji.token(null);

-- ================================================================ x_admin_akun
select uji.galat($$select public.x_admin_akun(100000002, 900000000001, '44444444-4444-4444-8444-444444444444', 'x@contoh.test')$$,
  'PT403', 'x_admin_akun: bukan owner → 403');
select uji.galat($$select public.x_admin_akun(100000001, 900000000002, '44444444-4444-4444-8444-444444444444', 'x@contoh.test')$$,
  'PT400', 'x_admin_akun: bot tidak punya akun');
select uji.cek((select j ->> 'email' = 'eka.baru@contoh.test' and (j ->> 'harus_ganti_password')::boolean
                from (select public.x_admin_akun(100000001, 900000000001, '44444444-4444-4444-8444-444444444444', 'eka.baru@contoh.test') j) x),
  'x_admin_akun: owner menautkan akun + wajib ganti password');
select uji.galat($$select public.x_admin_akun(100000001, 100000003, '44444444-4444-4444-8444-444444444444', 'dodi.lain@contoh.test')$$,
  'PT409', 'x_admin_akun: akun login sudah dipakai anggota lain → 409', null, 'KONFLIK_001');
reset role;

rollback;
