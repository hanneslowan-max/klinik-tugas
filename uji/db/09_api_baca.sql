-- 09 · Fungsi API baca (service_role): hak EXECUTE, token, user/team, hierarki, list tugas (paginasi & filter),
-- task json gaya ClickUp v2, komentar & balasan.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- ================================================================ hak EXECUTE (kontrak §4)
select uji.cek(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(api|x|impor)_'
     and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  'semua api_/x_/impor_ bisa dipanggil service_role');
select uji.cek(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(api|x|impor)_'
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'api_/x_/impor_ tidak bisa dipanggil authenticated/anon');
select uji.cek(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^web_'
     and (not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  'web_* hanya authenticated');
select uji.sama((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^web_'), 56,
  '56 fungsi web_* (kontrak §7: 33 + 11 web_pipeline_* + 3 web_pipeline_kategori* + web_pipeline_order_ubah + web_pipeline_cek_duplikat + 7 web_pipeline_pelanggan*)');
select uji.sama((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname ~ '^(api|x|impor)_'), 36,
  '36 fungsi api_/x_/impor_ (kontrak §6 + x_admin_akun + x_lampiran_catat + x_rawat_lampiran + 5 x_pipeline_*)');
select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('mulai_api', 'mulai_web', 'j_task', 'j_comment', 'inti_buat_tugas', 'inti_ubah_tugas',
                       'inti_komentar', 'inti_lampiran_catat', 'inti_rawat_lampiran', 'komentar_parts', 'muat_tasks',
                       'tenggat_hitung', 'cari_tugas', 'idem_ambil')
     and (has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'pembantu internal A2 tidak bisa dipanggil role API');
select uji.cek(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(api|x|impor|web)_'
     and not (p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'])),
  'semua api_/x_/impor_/web_ SECURITY DEFINER + search_path kosong');

-- ================================================================ token
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 900000000002, 'bot baca', 'rtk_uji1', uji.sha('rtk_rahasia_baca'), 'baca'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 900000000002, 'bot dicabut', 'rtk_uji2', uji.sha('rtk_rahasia_cabut'), 'tulis');
update public.api_tokens set revoked_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000002';

select uji.jadi_service();
select uji.sama(public.api_token_cek(uji.sha('rtk_rahasia_baca')),
  '{"member_id":900000000002,"scope":"baca","token_id":"aaaaaaaa-0000-4000-8000-000000000001","role":"bot"}'::jsonb,
  'api_token_cek: token sah → {member_id, scope, token_id, role}');
select uji.cek((select last_used_at = now() from public.api_tokens where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'api_token_cek mengisi last_used_at');
select uji.cek(public.api_token_cek(uji.sha('rtk_rahasia_cabut')) is null, 'token dicabut → null');
select uji.cek(public.api_token_cek(uji.sha('rtk_tidak_ada')) is null, 'token tak dikenal → null');
select uji.cek(public.api_token_cek('bukan-hash') is null, 'hash tak berformat → null');

-- konteks aktor & header token
select uji.galat($$select public.api_user(123)$$, 'PT401', 'aktor tak dikenal → PT401', null, 'OAUTH_019');
select uji.token('aaaaaaaa-0000-4000-8000-000000000002');
select uji.galat($$select public.api_user(900000000002)$$, 'PT401', 'header token dicabut → PT401', null, 'OAUTH_019');
select uji.token('aaaaaaaa-0000-4000-8000-000000000001');
select uji.galat($$select public.api_user(100000001)$$, 'PT401', 'token milik anggota lain → PT401');
select uji.jalan($$select public.api_user(900000000002)$$, 'token baca: baca diizinkan');
select uji.sama(current_setting('app.token_id', true), 'aaaaaaaa-0000-4000-8000-000000000001', 'app.token_id diset dari header');
select uji.token(null);
reset role;
update public.members set aktif = false where id = 100000003;
select uji.jadi_service();
select uji.galat($$select public.api_user(100000003)$$, 'PT401', 'anggota nonaktif → PT401');
reset role;
update public.members set aktif = true where id = 100000003;

-- ================================================================ user / team
select uji.jadi_service();
select uji.sama(public.api_user(100000001),
  '{"user":{"id":100000001,"username":"budi santoso","email":"budi.uji@contoh.test","color":"#7b68ee","initials":"BS","profilePicture":null}}'::jsonb,
  'api_user: member json persis');
select uji.simpan('team', public.api_team(900000000002));
select uji.sama(jsonb_array_length(uji.ambil('team') -> 'teams'), 1, 'api_team: 1 workspace');
select uji.sama(uji.ambil('team') #>> '{teams,0,id}', '1100340000004525', 'api_team: id workspace');
select uji.sama(uji.kunci(uji.ambil('team') #> '{teams,0}'), array['avatar','color','id','members','name'], 'api_team: kunci tim');
-- dihitung dari anggota seed saja (DB bersama bisa berisi anggota fixture area lain)
select uji.sama((select count(*)::int from jsonb_array_elements(uji.ambil('team') #> '{teams,0,members}') m
                  where (m -> 'user' ->> 'id')::bigint in (100000001, 100000002, 100000003, 900000000001)), 4,
  'api_team: 4 anggota seed (bot tidak masuk)');
select uji.cek(not (uji.ambil('team') #> '{teams,0,members}') @> '[{"user":{"id":900000000002}}]', 'api_team: bot tidak ada');
select uji.sama((select (m -> 'user' ->> 'role')::int from jsonb_array_elements(uji.ambil('team') #> '{teams,0,members}') m
                  where (m -> 'user' ->> 'id')::bigint = 100000001), 1, 'api_team: owner role 1');
select uji.sama((select (m -> 'user' ->> 'role')::int from jsonb_array_elements(uji.ambil('team') #> '{teams,0,members}') m
                  where (m -> 'user' ->> 'id')::bigint = 100000002), 3, 'api_team: member role 3');

-- ================================================================ hierarki
select uji.simpan('spaces', public.api_spaces(900000000002, false));
select uji.cek((uji.ambil('spaces') -> 'spaces') @> '[{"id":"1100340000900001"},{"id":"rsujib0001"}]'
               and not exists (select 1 from jsonb_array_elements(uji.ambil('spaces') -> 'spaces') s where (s ->> 'archived')::boolean),
  'api_spaces: 2 space seed aktif, tanpa arsip');
select uji.sama(uji.kunci(uji.ambil('spaces') #> '{spaces,0}'),
  array['archived','features','id','multiple_assignees','name','private','statuses'], 'api_spaces: kunci space');
select uji.cek(not exists (select 1 from jsonb_array_elements(public.api_spaces(900000000002, true) -> 'spaces') s
                            where not (s ->> 'archived')::boolean or s ->> 'id' in ('1100340000900001', 'rsujib0001')),
  'api_spaces archived=true: hanya space arsip (seed tidak punya)');

select uji.simpan('folders', public.api_space_folders(900000000002, '1100340000900001', false));
select uji.sama(jsonb_array_length(uji.ambil('folders') -> 'folders'), 2, 'api_space_folders: 2 folder termasuk hidden');
select uji.sama(uji.kunci(uji.ambil('folders') #> '{folders,0}'),
  array['archived','hidden','id','lists','name','orderindex','override_statuses','space','statuses','task_count'],
  'api_space_folders: kunci folder');
select uji.cek((select bool_or((f ->> 'hidden')::boolean) from jsonb_array_elements(uji.ambil('folders') -> 'folders') f),
  'api_space_folders: folder hidden ikut');
select uji.sama((select f ->> 'task_count' from jsonb_array_elements(uji.ambil('folders') -> 'folders') f
                  where f ->> 'id' = '1100340000900011'), '16', 'task_count string (tidak termasuk arsip)');
select uji.sama((select jsonb_array_length(f -> 'lists') from jsonb_array_elements(uji.ambil('folders') -> 'folders') f
                  where f ->> 'id' = '1100340000900011'), 3, 'folder berisi 3 list');
select uji.galat($$select public.api_space_folders(900000000002, 'tidak-ada', false)$$, 'PT404', 'space tak ada → 404', null, 'ITEM_013');

select uji.sama((select array_agg(l ->> 'id') from jsonb_array_elements(public.api_space_lists(900000000002, 'rsujib0001', false) -> 'lists') l),
  array['rlujib0001'], 'api_space_lists: list tanpa folder');
select uji.sama(jsonb_array_length(public.api_space_lists(900000000002, '1100340000900001', false) -> 'lists'), 0,
  'api_space_lists: space yang semua list-nya di folder → kosong');

select uji.simpan('flists', public.api_folder_lists(900000000002, '1100340000900011', false));
select uji.sama(jsonb_array_length(uji.ambil('flists') -> 'lists'), 3, 'api_folder_lists: 3 list');
select uji.sama(uji.kunci(uji.ambil('flists') #> '{lists,0}'),
  array['archived','assignee','content','due_date','folder','id','name','orderindex','override_statuses','permission_level',
        'priority','space','start_date','status','task_count'], 'list json: kunci kontrak');
select uji.sama(uji.ambil('flists') #> '{lists,0,folder}',
  '{"id":"1100340000900011","name":"Eksekusi Uji","hidden":false,"access":true}'::jsonb, 'list json: folder');
select uji.sama(jsonb_typeof(uji.ambil('flists') #> '{lists,0,task_count}'), 'number', 'list json: task_count angka');
select uji.galat($$select public.api_folder_lists(900000000002, 'x', false)$$, 'PT404', 'folder tak ada → 404');

select uji.simpan('list', public.api_list(900000000002, '1100340000900102'));
select uji.sama((select array_agg(s ->> 'status' order by (s ->> 'orderindex')::int) from jsonb_array_elements(uji.ambil('list') -> 'statuses') s),
  array['to do','in progress','review','complete'], 'api_list: statuses terurut');
select uji.sama(uji.kunci(uji.ambil('list') #> '{statuses,0}'), array['color','id','orderindex','status','type'], 'api_list: kunci status');
select uji.sama(public.api_list(900000000002, 'rlujib0001') -> 'folder',
  '{"id":"rlujib0001-hidden","name":"hidden","hidden":true,"access":true}'::jsonb, 'list tanpa folder: folder semu hidden');
select uji.galat($$select public.api_list(900000000002, 'x')$$, 'PT404', 'list tak ada → 404', 'List tidak ditemukan', 'ITEM_013');

-- ================================================================ api_list_tasks: filter
select uji.sama((select array_agg(t ->> 'id' order by t ->> 'id')
                   from jsonb_array_elements(public.api_list_tasks(900000000002, '1100340000900101') -> 'tasks') t),
  array['z8r3uj0001','z8r3uj0002','z8r3uj0003','z8r3uj0004','z8r3uj0006','z8r3uj0009','z8r3uj0010'],
  'default: tanpa closed, tanpa subtask, tanpa arsip');
select uji.cek((public.api_list_tasks(900000000002, '1100340000900101') ->> 'last_page')::boolean, 'last_page true bila ≤100');
select uji.sama(jsonb_array_length(public.api_list_tasks(900000000002, '1100340000900101', 0, true) -> 'tasks'), 8,
  'include_closed=true: + kartu complete');
select uji.sama(jsonb_array_length(public.api_list_tasks(900000000002, '1100340000900101', 0, false, true) -> 'tasks'), 8,
  'subtasks=true: + sub-tugas');
select uji.sama((select array_agg(t ->> 'id') from jsonb_array_elements(
                   public.api_list_tasks(900000000002, '1100340000900101', 0, true, true, true) -> 'tasks') t),
  array['z8r3uj0008'], 'archived=true: hanya arsip');
select uji.sama(jsonb_array_length(public.api_list_tasks(900000000002, '1100340000900101', 0, false, false, true) -> 'tasks'), 0,
  'archived=true tanpa include_closed: arsip yang complete ikut terbuang');
select uji.sama(
  (select array_agg(t ->> 'id' order by t ->> 'id') from jsonb_array_elements(
     public.api_list_tasks(900000000002, '1100340000900101', 0, true, true, false, false,
       (select uji.ms(updated_at)::bigint from public.tasks where id = 'z8r3uj0002')) -> 'tasks') t),
  (select array_agg(id order by id) from public.tasks where list_id = '1100340000900101' and not archived
      and updated_at > (select updated_at from public.tasks where id = 'z8r3uj0002')),
  'date_updated_gt: hanya yang diubah sesudahnya (tegas >)');
select uji.cek(not ((public.api_list_tasks(900000000002, 'rlujib0001', 0, true, true) -> 'tasks') @> '[{"id":"rtujib0004"}]'),
  'tugas terhapus selalu dibuang');
select uji.cek(not (public.api_list_tasks(900000000002, '1100340000900101') #> '{tasks,0}') ? 'markdown_description',
  'tanpa p_md: markdown_description tidak ada');
select uji.cek((public.api_list_tasks(900000000002, '1100340000900101', 0, false, false, false, true) #> '{tasks,0}') ? 'markdown_description',
  'p_md=true: markdown_description ada');
select uji.galat($$select public.api_list_tasks(900000000002, 'x')$$, 'PT404', 'list tak ada → 404');
select uji.galat($$select public.api_list_tasks(900000000002, 'rlujib0001', -1)$$, 'PT400', 'page negatif → 400');

-- ================================================================ api_list_tasks: paginasi 100 & urutan stabil
reset role;
select uji.konteks('ui', 100000001);
insert into public.tasks (list_id, name) select 'rlujib0001', format('Paginasi %s', lpad(g::text, 3, '0')) from generate_series(1, 205) g;
select uji.jadi_service();
select uji.simpan('p0', public.api_list_tasks(900000000002, 'rlujib0001', 0, true, true));
select uji.simpan('p1', public.api_list_tasks(900000000002, 'rlujib0001', 1, true, true));
select uji.simpan('p2', public.api_list_tasks(900000000002, 'rlujib0001', 2, true, true));
select uji.sama(jsonb_array_length(uji.ambil('p0') -> 'tasks'), 100, 'halaman 0: 100 tugas');
select uji.cek(not (uji.ambil('p0') ->> 'last_page')::boolean, 'halaman 0: last_page false');
select uji.sama(jsonb_array_length(uji.ambil('p1') -> 'tasks'), 100, 'halaman 1: 100 tugas');
select uji.sama(jsonb_array_length(uji.ambil('p2') -> 'tasks'),
  (select count(*)::int - 200 from public.tasks where list_id = 'rlujib0001' and deleted_at is null), 'halaman 2: sisanya');
select uji.cek((uji.ambil('p2') ->> 'last_page')::boolean, 'halaman 2: last_page true');
select uji.sama((select count(distinct t ->> 'id')::int from uji.hasil h, jsonb_array_elements(h.j -> 'tasks') t
                  where h.k in ('p0', 'p1', 'p2')),
  (select count(*)::int from public.tasks where list_id = 'rlujib0001' and deleted_at is null),
  'gabungan halaman = semua tugas, tanpa dobel');
select uji.sama(
  (select array_agg(t.value ->> 'id' order by h.k, t.ord) from uji.hasil h,
          jsonb_array_elements(h.j -> 'tasks') with ordinality t(value, ord) where h.k in ('p0', 'p1', 'p2')),
  (select array_agg(id order by created_at desc, id) from public.tasks where list_id = 'rlujib0001' and deleted_at is null),
  'urutan = created_at desc, id asc (stabil lintas halaman)');
select uji.sama(jsonb_array_length(public.api_list_tasks(900000000002, 'rlujib0001', 3, true, true) -> 'tasks'), 0,
  'halaman lewat akhir: kosong');

-- ================================================================ task json
select uji.simpan('t1', public.api_task(900000000002, 'z8r3uj0001', false));
select uji.sama(uji.kunci(uji.ambil('t1') - 'attachments'), uji.kunci_task(), 'task json: himpunan kunci kontrak §6');
select uji.cek(uji.ambil('t1') ? 'attachments' and not uji.ambil('t1') ? 'markdown_description',
  'api_task: attachments ada; tanpa p_md tidak ada markdown_description');
select uji.sama(uji.kunci(public.api_task(900000000002, 'z8r3uj0001', true) - 'attachments' - 'markdown_description'),
  uji.kunci_task(), 'api_task p_md: kunci sama + markdown_description');
select uji.sama(public.api_task(900000000002, 'z8r3uj0001', true) ->> 'markdown_description',
  (select markdown from public.tasks where id = 'z8r3uj0001'), 'markdown_description = markdown');
select uji.cek((select (j ->> 'custom_id') is null and (j ->> 'custom_item_id')::int = 0 and j -> 'tags' = '[]'
                   and j -> 'checklists' = '[]' and j -> 'custom_fields' = '[]' and j -> 'dependencies' = '[]'
                   and j -> 'linked_tasks' = '[]' and j -> 'watchers' = '[]' and j -> 'group_assignees' = '[]'
                   and j -> 'locations' = '[]' and j -> 'points' = 'null' and j -> 'time_estimate' = 'null'
                   and j -> 'sharing' = '{"public":false}' and j ->> 'permission_level' = 'create'
                from (select uji.ambil('t1') j) x), 'kunci netral berisi nilai netral');
select uji.sama(uji.ambil('t1') -> 'status',
  '{"id":"sc1100340000900101_1","status":"in progress","color":"#4194f6","orderindex":1,"type":"custom"}'::jsonb,
  'status json {id,status,color,orderindex:int,type}');
select uji.sama(uji.ambil('t1') -> 'priority', '{"id":"2","priority":"high","color":"#ffcc00","orderindex":"2"}'::jsonb,
  'priority json');
select uji.cek((select jsonb_typeof(j -> 'date_created') = 'string' and j ->> 'date_created' ~ '^[0-9]{13}$'
                   and j ->> 'date_created' = uji.ms(t.created_at) and j ->> 'date_updated' = uji.ms(t.updated_at)
                   and j ->> 'due_date' = uji.ms(t.due_at) and (j -> 'date_closed') = 'null'
                   and (j ->> 'due_date_time')::boolean = false and (j -> 'start_date') = 'null'
                from (select uji.ambil('t1') j) x, public.tasks t where t.id = 'z8r3uj0001'),
  'tanggal = string ms (date_created/updated/due), date_closed null');
select uji.cek((select public.wib_date(uji.dari_ms((uji.ambil('t1') ->> 'due_date')::bigint)) = due_wib
                  from public.tasks where id = 'z8r3uj0001'), 'due_date ms → tanggal WIB = due_wib');
select uji.sama(uji.ambil('t1') ->> 'orderindex', '0', 'orderindex string');
select uji.sama(uji.ambil('t1') -> 'creator',
  '{"id":100000001,"username":"budi santoso","color":"#7b68ee","email":"budi.uji@contoh.test","profilePicture":null}'::jsonb,
  'creator json');
select uji.sama((select array_agg((a ->> 'id')::bigint order by (a ->> 'id')::bigint) from jsonb_array_elements(uji.ambil('t1') -> 'assignees') a),
  array[100000002, 100000003]::bigint[], 'assignees = member json (id int)');
select uji.sama(uji.kunci(uji.ambil('t1') #> '{assignees,0}'), array['color','email','id','initials','profilePicture','username'],
  'assignee: kunci member json');
select uji.sama(uji.ambil('t1') ->> 'url', 'https://tugas.palletmeshindonesia.com/t/z8r3uj0001', 'url = app_base_url/t/<id>');
select uji.sama(uji.ambil('t1') ->> 'team_id', '1100340000004525', 'team_id');
select uji.sama(uji.ambil('t1') -> 'list', '{"id":"1100340000900101","name":"Fase Uji 1","access":true}'::jsonb, 'list {id,name,access}');
select uji.cek(uji.ambil('t1') -> 'project' = uji.ambil('t1') -> 'folder'
               and uji.ambil('t1') -> 'folder' = '{"id":"1100340000900011","name":"Eksekusi Uji","hidden":false,"access":true}'::jsonb,
  'project = folder {id,name,hidden,access}');
select uji.sama(uji.ambil('t1') -> 'space', '{"id":"1100340000900001"}'::jsonb, 'space {id}');
select uji.cek(uji.ambil('t1') -> 'parent' = 'null' and uji.ambil('t1') -> 'top_level_parent' = 'null', 'tugas induk: parent null');
select uji.cek((select j ->> 'parent' = 'z8r3uj0001' and j ->> 'top_level_parent' = 'z8r3uj0001'
                from (select public.api_task(900000000002, 'z8r3uj0007') j) x), 'sub-tugas: parent & top_level_parent');
select uji.cek((select j -> 'folder' = '{"id":"rlujib0001-hidden","name":"hidden","hidden":true,"access":true}'::jsonb
                   and j -> 'priority' = '{"id":"3","priority":"normal","color":"#6fddff","orderindex":"3"}'::jsonb
                from (select public.api_task(900000000002, 'rtujib0001') j) x), 'tugas di list tanpa folder: folder semu');
select uji.cek((select j ->> 'date_closed' = uji.ms(t.closed_at) and j ->> 'date_done' = uji.ms(t.done_at)
                   and j #>> '{status,type}' = 'closed'
                from (select public.api_task(900000000002, 'z8r3uj0005') j) x, public.tasks t where t.id = 'z8r3uj0005'),
  'kartu complete: date_closed/date_done ms');
select uji.cek((select (j ->> 'archived')::boolean from (select public.api_task(900000000002, 'z8r3uj0008') j) x),
  'kartu arsip tetap bisa dibuka (archived true)');
select uji.cek((select j ->> 'markdown_description' = '' and j ->> 'text_content' = 'Teks polos dari blok sinkron (uji).'
                from (select public.api_task(900000000002, 'z8r3uj0014', true) j) x),
  'deskripsi tak terbaca: markdown_description "" + text_content teks polos (gaya ClickUp)');
select uji.galat($$select public.api_task(900000000002, 'rtujib0004')$$, 'PT404', 'tugas terhapus → 404', 'Tugas tidak ditemukan', 'ITEM_013');
select uji.galat($$select public.api_task(900000000002, 'tidakada')$$, 'PT404', 'tugas tak ada → 404');

-- lampiran di api_task
select uji.simpan('t5', public.api_task(900000000002, 'z8r3uj0005'));
select uji.sama(jsonb_array_length(uji.ambil('t5') -> 'attachments'), 1, 'api_task: 1 lampiran');
select uji.sama(uji.kunci(uji.ambil('t5') #> '{attachments,0}'),
  array['clickup_url','date','deleted','extension','hidden','id','is_folder','mimetype','orientation','parent_id','resolved_comments',
        'size','source','storage_path','thumbnail_large','thumbnail_small','title','total_comments','type','url','user','version'],
  'lampiran json: kunci kontrak');
select uji.cek((select a ->> 'id' = 'cu-lampiran-uji-0001' and (a ->> 'size')::int = 2048 and a ->> 'parent_id' = 'z8r3uj0005'
                   and (a -> 'url') = 'null' and a ->> 'clickup_url' = 'https://contoh.test/lampiran/rekap-uji.csv'
                   and (a #>> '{user,id}')::bigint = 100000002 and a ->> 'date' ~ '^[0-9]{13}$'
                from (select uji.ambil('t5') #> '{attachments,0}' a) x), 'lampiran json: nilai');
select uji.sama(jsonb_array_length(public.api_task(900000000002, 'z8r3uj0001') -> 'attachments'), 1,
  'lampiran komentar ikut di attachments tugas');

-- ================================================================ komentar & balasan
select uji.simpan('c1', public.api_task_comments(900000000002, 'z8r3uj0001'));
select uji.sama((select array_agg(c ->> 'id' order by ord) from jsonb_array_elements(uji.ambil('c1') -> 'comments') with ordinality x(c, ord)),
  array['90180000000003', '90180000000001'], 'api_task_comments: top-level saja, terbaru dulu');
select uji.sama(uji.kunci(uji.ambil('c1') #> '{comments,0}'),
  array['assignee','comment','comment_text','date','group_assignee','id','reactions','reply_count','resolved','user'],
  'comment json: kunci kontrak (+ resolved netral)');
select uji.cek((select (c ->> 'reply_count')::int = 1 and jsonb_typeof(c -> 'reply_count') = 'number'
                   and c ->> 'date' = (select uji.ms(created_at) from public.comments where id = '90180000000001')
                   and c #>> '{user,username}' = 'citra lestari' and c -> 'comment' = '[{"text":"Draf pertama sudah ada di https://contoh.test/draf-uji"}]'
                from jsonb_array_elements(uji.ambil('c1') -> 'comments') c where c ->> 'id' = '90180000000001'),
  'komentar: reply_count int, date ms, user, parts');
select uji.sama((select (c ->> 'reply_count')::int from jsonb_array_elements(uji.ambil('c1') -> 'comments') c
                  where c ->> 'id' = '90180000000003'), 0, 'komentar tanpa balasan: reply_count 0');
select uji.simpan('r1', public.api_comment_replies(900000000002, '90180000000001'));
select uji.sama((select array_agg(c ->> 'id') from jsonb_array_elements(uji.ambil('r1') -> 'comments') c),
  array['90180000000002'], 'api_comment_replies: balasan');
select uji.cek(not (uji.ambil('r1') #> '{comments,0}') ? 'reply_count', 'balasan tanpa reply_count');
select uji.cek(uji.ambil('r1') #>> '{comments,0,comment,0,type}' = 'tag'
               and uji.ambil('r1') #>> '{comments,0,comment,0,user,username}' = 'citra lestari', 'parts mention {type:tag,user}');
select uji.sama(jsonb_array_length(public.api_task_comments(900000000002, 'z8r3uj0002') -> 'comments'), 0, 'tanpa komentar: []');
reset role;
select uji.konteks('ui', 100000003);
insert into public.comments (id, task_id, parent_id, text) values ('rcujiurut01', 'rtujib0001', 'rcujib000001', 'balasan kedua');
select uji.jadi_service();
select uji.sama((select array_agg(c ->> 'id' order by ord) from jsonb_array_elements(
                   public.api_comment_replies(900000000002, 'rcujib000001') -> 'comments') with ordinality x(c, ord)),
  array['rcujib000002', 'rcujiurut01'], 'balasan terlama dulu');
reset role;
select uji.konteks('ui', 100000003);
update public.comments set deleted_at = now() where id = 'rcujiurut01';
select uji.jadi_service();
select uji.sama(jsonb_array_length(public.api_comment_replies(900000000002, 'rcujib000001') -> 'comments'), 1,
  'balasan terhapus tidak tampil');
select uji.sama((select (c ->> 'reply_count')::int from jsonb_array_elements(public.api_task_comments(900000000002, 'rtujib0001') -> 'comments') c
                  where c ->> 'id' = 'rcujib000001'), 1, 'reply_count tidak menghitung balasan terhapus');
select uji.galat($$select public.api_task_comments(900000000002, 'rtujib0004')$$, 'PT404', 'komentar tugas terhapus → 404');
select uji.galat($$select public.api_comment_replies(900000000002, 'tidakada')$$, 'PT404', 'komentar tak ada → 404');

-- tanpa hak: authenticated/anon ditolak
reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.api_task(100000002, 'z8r3uj0001')$$, '42501', 'authenticated: api_task ditolak');
select uji.galat($$select public.api_token_cek('x')$$, '42501', 'authenticated: api_token_cek ditolak');
reset role;
select uji.jadi_anon();
select uji.galat($$select public.api_user(100000001)$$, '42501', 'anon: api_user ditolak');
reset role;

rollback;
