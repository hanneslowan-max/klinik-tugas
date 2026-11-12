-- 12 · Pemuat impor/sinkron: impor_batch per jenis (payload gaya ClickUp), idempoten (hash), activity sintetis
-- (tanpa mengarang transisi), induk tertunda, sinkron → activity lengkap=false + at_awal, tandai hilang, run.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('dddddddd-0000-4000-8000-000000000001', 900000000002, 'bot impor', 'rtk_i1', uji.sha('rtk_i1'), 'impor'),
  ('dddddddd-0000-4000-8000-000000000002', 900000000002, 'bot tulis', 'rtk_i2', uji.sha('rtk_i2'), 'tulis');

select uji.jadi_service();
select uji.token('dddddddd-0000-4000-8000-000000000002');
select uji.galat($$select public.impor_batch(900000000002, 'workspace', '[]')$$, 'PT403', 'token tulis: impor ditolak', null, 'ACCESS_001');
select uji.token('dddddddd-0000-4000-8000-000000000001');
select uji.galat($$select public.impor_batch(900000000002, 'tasks', '[]', 'lain')$$, 'PT400', 'p_mode tak dikenal → 400');
select uji.galat($$select public.impor_batch(900000000002, 'entah', '[]')$$, 'PT400', 'jenis tak dikenal → 400');
select uji.galat($$select public.impor_batch(900000000002, 'tasks', '{}')$$, 'PT400', 'p_rows bukan array → 400');

-- ================================================================ workspace & members
select uji.sama(public.impor_batch(900000000002, 'workspace', '[{"id":"1100340000004525","name":"Roda Hammerindo Workspace"}]') - 'gagal',
  '{"jenis":"workspace","mode":"impor","inserted":0,"updated":0,"unchanged":1}'::jsonb, 'workspace sama → unchanged');
select uji.sama((public.impor_batch(900000000002, 'workspace', '[{"id":"1100340000004525","name":"Workspace Uji Baru"}]') ->> 'updated')::int, 1,
  'workspace nama beda → updated');

select uji.simpan('m1', public.impor_batch(900000000002, 'members', '[
  {"user":{"id":312000001,"username":"Uji Impor Satu","email":"satu@contoh.test","color":"#111111","initials":"US","role":3,"profilePicture":null}},
  {"user":{"id":312000002,"username":null,"email":"dua@contoh.test","color":"#222222","initials":"D"}},
  {"id":312000003,"username":"uji keluar","email":"tiga@contoh.test","aktif":false},
  {"user":{"id":312000004,"username":"budi santoso"}},
  {"user":{"id":"bukan-angka"}}]'));
select uji.cek((uji.ambil('m1') ->> 'inserted')::int = 3 and jsonb_array_length(uji.ambil('m1') -> 'gagal') = 2,
  'members: 3 masuk, 2 gagal (username bentrok, id bukan angka)');
select uji.cek((select username = 'Uji Impor Satu' and clickup_email = 'satu@contoh.test' and email is null and role = 'member' and aktif
                   and auth_user_id is null from public.members where id = 312000001),
  'members: username verbatim, email ClickUp → clickup_email (bukan email login), role member');
select uji.sama((select username from public.members where id = 312000002), 'dua@contoh.test', 'username null → fallback email');
select uji.cek((select not aktif from public.members where id = 312000003), 'members: aktif=false dipakai saat insert');
select uji.sama((public.impor_batch(900000000002, 'members', '[{"user":{"id":312000001,"username":"Uji Impor Satu","email":"satu@contoh.test","color":"#111111","initials":"US"}}]') ->> 'unchanged')::int,
  1, 'members: sama → unchanged');
reset role;
update public.members set aktif = false, email = 'login.satu@contoh.test' where id = 312000001;
select uji.jadi_service();
select uji.sama((public.impor_batch(900000000002, 'members', '[{"user":{"id":312000001,"username":"Uji Impor Satu","email":"satu@contoh.test","color":"#333333","initials":"US"}}]') ->> 'updated')::int,
  1, 'members: warna beda → updated');
select uji.cek((select color = '#333333' and role = 'member' and not aktif and email = 'login.satu@contoh.test' from public.members where id = 312000001),
  'members: impor tidak menyentuh role/aktif/email login');
reset role;
update public.members set aktif = true, email = null where id = 312000001;

-- (review R1) impor tidak boleh membuat owner, menyentuh owner/bot, atau anggota buatan app (id ≥ 900000000000)
update public.members set role = 'owner' where id = 312000001;
select uji.jadi_service();
select uji.simpan('m2', public.impor_batch(900000000002, 'members', '[
  {"id":777000001,"username":"penyusup","role":"owner"},
  {"id":900000000001,"username":"eka-diganti"},
  {"id":900000000002,"username":"bot-diganti"},
  {"id":100000001,"username":"budi-diganti","color":"#000000"},
  {"user":{"id":312000001,"username":"Satu Diganti","color":"#444444"}}]'));
select uji.cek((select role = 'member' from public.members where id = 777000001),
  'R1 members: role dari baris diabaikan, anggota impor baru selalu member');
select uji.cek((select username = 'eka wulandari' from public.members where id = 900000000001)
               and (select username = 'claude (agent)' from public.members where id = 900000000002),
  'R1 members: anggota buatan app (id ≥ 900000000000) tidak disentuh');
select uji.cek((select jsonb_array_length(j -> 'gagal') = 2 and j -> 'gagal' @> '[{"id":"900000000001"},{"id":"900000000002"}]'
                from (select uji.ambil('m2') j) x), 'R1 members: id rentang app → gagal (KONFLIK)');
select uji.cek((select username = 'budi santoso' and color = '#7b68ee' and role = 'owner' from public.members where id = 100000001)
               and (select username = 'Uji Impor Satu' and color = '#333333' from public.members where id = 312000001),
  'R1 members: baris owner tidak disentuh impor (username/warna tetap)');
select uji.cek((select (j ->> 'inserted')::int = 1 and (j ->> 'updated')::int = 0 and (j ->> 'unchanged')::int = 2
                   and j -> 'dilindungi' = '[100000001, 312000001]'
                from (select uji.ambil('m2') j) x), 'R1 members: owner dihitung unchanged + dilaporkan di dilindungi (bukan gagal)');
select uji.galat($$insert into public.members (id, username) values (777000002, 'x')$$, '42501',
  'service_role tetap tanpa hak tulis langsung ke members');
reset role;
update public.members set role = 'member' where id = 312000001;
select uji.jadi_service();

-- ================================================================ struktur
select uji.simpan('sp', public.impor_batch(900000000002, 'spaces', '[{"id":"1100340000800001","name":"Ruang Impor","private":false,"archived":false,"color":"#abcdef"}]'));
select uji.sama((uji.ambil('sp') ->> 'inserted')::int, 1, 'spaces: insert');
select uji.sama((public.impor_batch(900000000002, 'folders', '[
  {"id":"1100340000800011","name":"Folder Impor","hidden":false,"space":{"id":"1100340000800001"},"orderindex":0},
  {"id":"1100340000800012","name":"hidden","hidden":true,"space":{"id":"1100340000800001"},"orderindex":1}]') ->> 'inserted')::int,
  2, 'folders: 2 insert (termasuk hidden), space dari objek space');
select uji.simpan('li', public.impor_batch(900000000002, 'lists', '[
  {"id":"1100340000800101","name":"List Impor A","folder":{"id":"1100340000800011"},"space":{"id":"1100340000800001"},"orderindex":0,"content":""},
  {"id":"1100340000800102","name":"List Impor B","folder_id":null,"space_id":"1100340000800001","orderindex":1},
  {"id":"1100340000800103","name":"List Impor C","folder":{"id":"1100340000800012"},"space":{"id":"1100340000800001"}}]'));
select uji.sama((uji.ambil('li') ->> 'inserted')::int, 3, 'lists: 3 insert');
select uji.cek((select folder_id is null and sumber = 'clickup' from public.lists where id = '1100340000800102')
               and (select folder_id = '1100340000800011' from public.lists where id = '1100340000800101'),
  'lists: folder dari objek folder / folder_id null');
select uji.sama((select count(*)::int from public.list_statuses where list_id = '1100340000800101'), 0, 'list impor tanpa status default');
select uji.sama(public.impor_batch(900000000002, 'lists', '[{"id":"1100340000800101","name":"List Impor A","folder":{"id":"1100340000800011"},"space":{"id":"1100340000800001"},"orderindex":0,"content":""}]') - 'gagal',
  '{"jenis":"lists","mode":"impor","inserted":0,"updated":0,"unchanged":1}'::jsonb, 'lists: ulang → unchanged');
select uji.sama((public.impor_batch(900000000002, 'spaces', '[{"id":"rsujib0001","name":"bentrok"}]') #>> '{gagal,0,err}'),
  'ID rsujib0001 bentrok dengan data buatan app', 'struktur: ID milik app → gagal (bukan menimpa)');

select uji.simpan('st', public.impor_batch(900000000002, 'list_statuses', '[
  {"list_id":"1100340000800101","statuses":[
     {"id":"scA1","status":"to do","type":"open","orderindex":0,"color":"#d3d3d3"},
     {"id":"scA2","status":"in progress","type":"custom","orderindex":1,"color":"#4194f6"},
     {"id":"scA3","status":"complete","type":"closed","orderindex":2,"color":"#6bc950"}]},
  {"list_id":"1100340000800102","status":"open","type":"open","orderindex":0,"id":"scB1"},
  {"list_id":"1100340000800102","status":"Closed","type":"closed","orderindex":1,"id":"scB2"},
  {"list_id":"1100340000800103","status":"to do","type":"open","orderindex":0},
  {"list_id":"1100340000800103","status":"complete","type":"closed","orderindex":1}]'));
select uji.sama((uji.ambil('st') ->> 'inserted')::int, 7, 'list_statuses: 7 insert (bentuk statuses[] dan baris)');
select uji.sama((public.impor_batch(900000000002, 'list_statuses', '[{"list_id":"1100340000800101","statuses":[
     {"id":"scA1","status":"to do","type":"open","orderindex":0,"color":"#d3d3d3"},
     {"id":"scA2","status":"in progress","type":"custom","orderindex":1,"color":"#4194f6"},
     {"id":"scA3","status":"complete","type":"closed","orderindex":2,"color":"#6bc950"}]}]') ->> 'unchanged')::int,
  3, 'list_statuses: ulang → unchanged');

-- ================================================================ tasks (payload ClickUp mentah)
create function pg_temp.tugas_p1(p_status text, p_nama text, p_due text, p_updated text, p_closed text, p_ass jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'z8r3im0001', 'name', p_nama, 'list', jsonb_build_object('id', '1100340000800101'),
    'status', jsonb_build_object('status', p_status, 'type', 'custom'), 'markdown_description', 'Isi **md**',
    'text_content', 'Isi md', 'description', 'Isi md', 'priority', jsonb_build_object('id', '2', 'priority', 'high'),
    'due_date', p_due, 'date_created', '1758000000000', 'date_updated', p_updated, 'date_closed', p_closed,
    'date_done', p_closed, 'creator', jsonb_build_object('id', 312000001), 'assignees', p_ass,
    'url', 'https://app.clickup.com/t/z8r3im0001', 'parent', null, 'archived', false,
    'orderindex', '3.00000000000000000000000000000000', 'tags', '[]'::jsonb, 'checklists', '[]'::jsonb,
    'custom_fields', '[]'::jsonb)
$$;
select uji.simpan('P1', pg_temp.tugas_p1('in progress', 'IM1 · Impor induk', '1759381200000', '1759000000000', null,
                                        '[{"id":312000001},{"id":312000002}]'));
select uji.simpan('batch1', jsonb_build_array(
  -- sub-tugas SEBELUM induknya di array (urutan kedalaman harus menanganinya)
  '{"id":"z8r3im0002","name":"IM2 · Sub selesai","list":{"id":"1100340000800101"},"status":{"status":"complete","type":"closed"},
    "parent":"z8r3im0001","date_created":"1758100000000","date_updated":"1759100000000","date_closed":"1759100000000",
    "date_done":"1759100000000","creator":{"id":312000002},"assignees":[{"id":312000002}],"url":"https://app.clickup.com/t/z8r3im0002",
    "tags":[{"name":"uji","tag_fg":"#fff"}]}'::jsonb,
  uji.ambil('P1'),
  '{"id":"z8r3im0003","name":"IM3 · Sub induk belum ada","list":{"id":"1100340000800101"},"status":{"status":"to do"},
    "parent":"z8r3im0099","date_created":"1758200000000","date_updated":"1758200000000","creator":{"id":312000001},"assignees":[]}'::jsonb,
  '{"id":"z8r3im0004","name":"IM4 · Deskripsi tak terbaca","list":{"id":"1100340000800101"},"status":{"status":"to do"},
    "markdown_description":"","text_content":"Teks blok sinkron","date_created":"1758300000000","date_updated":"1758300000000",
    "creator":{"id":312000001},"assignees":[]}'::jsonb,
  '{"id":"z8r3im0005","name":"IM5 · List belum ada","list":{"id":"1100340000899999"},"status":{"status":"to do"},
    "date_created":"1758300000000","creator":{"id":312000001}}'::jsonb,
  '{"id":"z8r3im0006","name":"IM6 · Assignee belum diimpor","list":{"id":"1100340000800101"},"status":{"status":"to do"},
    "date_created":"1758300000000","creator":{"id":312000001},"assignees":[{"id":55555}]}'::jsonb));
select uji.simpan('act0', to_jsonb((select coalesce(max(id), 0) from public.activity)));
select uji.simpan('t1', public.impor_batch(900000000002, 'tasks', uji.ambil('batch1')));
select uji.cek((select (j ->> 'inserted')::int = 3 and (j ->> 'updated')::int = 0 and (j ->> 'unchanged')::int = 0
                from (select uji.ambil('t1') j) x), 'tasks: 3 insert (induk + sub + deskripsi tak terbaca)');
select uji.sama(uji.ambil('t1') -> 'tertunda', '[{"id":"z8r3im0003","parent_id":"z8r3im0099"}]'::jsonb,
  'tasks: induk belum ada → tertunda (tidak ditulis)');
select uji.sama((select array_agg(g ->> 'id' order by g ->> 'id') from jsonb_array_elements(uji.ambil('t1') -> 'gagal') g),
  array['z8r3im0005', 'z8r3im0006'], 'tasks: list/assignee belum diimpor → gagal per baris, sisanya tetap masuk');
select uji.cek((select sumber = 'clickup' and clickup_id = id and name = 'IM1 · Impor induk' and markdown = 'Isi **md**'
                   and description_plain = 'Isi md' and status = 'in progress' and priority = 2
                   and uji.ms(created_at) = '1758000000000' and uji.ms(updated_at) = '1759000000000'
                   and uji.ms(due_at) = '1759381200000' and due_wib = public.wib_date(due_at) and creator_id = 312000001
                   and clickup_url = 'https://app.clickup.com/t/z8r3im0001' and orderindex = 3 and extra = '{}'
                   and clickup_hash ~ '^[0-9a-f]{64}$' and synced_at = now()
                from public.tasks where id = 'z8r3im0001'), 'tasks: nilai ClickUp verbatim (tanggal ms, creator, url, hash)');
select uji.sama((select array_agg(member_id order by member_id) from public.task_assignees where task_id = 'z8r3im0001'),
  array[312000001, 312000002]::bigint[], 'tasks: assignees dari payload');
select uji.cek((select parent_id = 'z8r3im0001' and status_type = 'closed' and uji.ms(closed_at) = '1759100000000'
                   and uji.ms(first_closed_at) = '1759100000000' and extra = '{"tags":[{"name":"uji","tag_fg":"#fff"}]}'
                from public.tasks where id = 'z8r3im0002'), 'sub-tugas: parent, closed_at verbatim, tags → extra');
select uji.cek((select desc_unreadable and markdown = 'Teks blok sinkron' from public.tasks where id = 'z8r3im0004'),
  'markdown kosong + teks ada → desc_unreadable, markdown = teks polos');
-- activity sintetis
select uji.cek((select sumber = 'impor' and actor_id = 312000001 and not lengkap and at = uji.dari_ms(1758000000000)
                from uji.akt('z8r3im0001', 'dibuat')), 'activity dibuat: aktor = creator, at = date_created, lengkap false');
select uji.cek((select actor_id is null and at = uji.dari_ms(1759100000000) and not lengkap from uji.akt('z8r3im0002', 'ditutup_impor')),
  'activity ditutup_impor: aktor null, at = date_closed');
select uji.sama((select count(*)::int from public.activity where id > (uji.ambil('act0') #>> '{}')::bigint), 4,
  'impor awal: hanya dibuat ×3 + ditutup_impor ×1 (tanpa assignee/induk karangan)');
select uji.sama((select count(*)::int from public.notifications where task_id like 'z8r3im%'), 0, 'impor: tanpa notifikasi');

-- idempoten
select uji.simpan('act1', to_jsonb((select max(id) from public.activity)));
select uji.simpan('t1b', public.impor_batch(900000000002, 'tasks', uji.ambil('batch1')));
select uji.cek((select (j ->> 'inserted')::int = 0 and (j ->> 'updated')::int = 0 and (j ->> 'unchanged')::int = 3
                from (select uji.ambil('t1b') j) x), 'impor ulang: semua unchanged');
select uji.sama((select count(*)::int from public.activity where id > (uji.ambil('act1') #>> '{}')::bigint), 0,
  'impor ulang: tidak ada activity baru');
select uji.cek((select uji.ms(updated_at) = '1759000000000' and versi = 1 from public.tasks where id = 'z8r3im0001'),
  'impor ulang: updated_at & versi tidak berubah');

-- induk tertunda: pass kedua
select uji.simpan('t2', public.impor_batch(900000000002, 'tasks', '[{"id":"z8r3im0099","name":"IM99 · Induk datang belakangan",
  "list":{"id":"1100340000800101"},"status":{"status":"to do"},"date_created":"1757000000000","creator":{"id":312000001}}]'));
select uji.sama((uji.ambil('t2') ->> 'inserted')::int, 1, 'pass 2: induk masuk');
select uji.simpan('t3', public.impor_batch(900000000002, 'tasks', jsonb_build_array(uji.ambil('batch1') -> 2)));
select uji.cek((uji.ambil('t3') ->> 'inserted')::int = 1 and uji.ambil('t3') -> 'tertunda' = '[]', 'pass 2: baris tertunda masuk');
select uji.cek((select parent_id = 'z8r3im0099' from public.tasks where id = 'z8r3im0003')
               and uji.n_act('z8r3im0003', 'induk') = 0 and uji.n_act('z8r3im0003', 'dibuat') = 1,
  'pass 2: parent terisi tanpa activity induk karangan');

-- ================================================================ sinkron: perubahan → activity per field lengkap=false
select uji.simpan('act2', to_jsonb((select max(id) from public.activity)));
select uji.simpan('s1', public.impor_batch(900000000002, 'tasks',
  jsonb_build_array(pg_temp.tugas_p1('complete', 'IM1 · Impor induk (ganti nama)', '1759467600000', '1759300000000', '1759290000000',
                                     '[{"id":312000001}]')),
  'sinkron', '2026-09-28 05:45:00+07'));
select uji.sama((uji.ambil('s1') ->> 'updated')::int, 1, 'sinkron: 1 updated');
select uji.sama((select array_agg(jenis order by jenis) from public.activity where id > (uji.ambil('act2') #>> '{}')::bigint),
  array['assignee_hapus','due','nama','status'], 'sinkron: activity per field yang berubah');
select uji.cek((select bool_and(sumber = 'sinkron' and actor_id is null and not lengkap and at_awal = '2026-09-28 05:45:00+07')
                from public.activity where id > (uji.ambil('act2') #>> '{}')::bigint),
  'sinkron: sumber sinkron, aktor null, lengkap false, at_awal = sinkron sebelumnya');
select uji.cek((select at = uji.dari_ms(1759290000000) and snapshot ? 'komentar_terakhir' from uji.akt('z8r3im0001', 'status')),
  'sinkron: status ditutup pakai date_closed ClickUp + snapshot');
select uji.cek((select uji.ms(updated_at) = '1759300000000' and uji.ms(closed_at) = '1759290000000' and status_type = 'closed'
                   and name = 'IM1 · Impor induk (ganti nama)' from public.tasks where id = 'z8r3im0001'),
  'sinkron: nilai ClickUp verbatim (updated_at, closed_at)');
select uji.sama((select count(*)::int from public.notifications where task_id like 'z8r3im%'), 0, 'sinkron: tanpa notifikasi');
select uji.simpan('s2', public.impor_batch(900000000002, 'tasks',
  jsonb_build_array(pg_temp.tugas_p1('in progress', 'IM1 · Impor induk (ganti nama)', '1759467600000', '1759400000000', null,
                                     '[{"id":312000001}]')), 'sinkron'));
select uji.cek((select reopen_count = 1 and closed_at is null and status_type = 'custom' from public.tasks where id = 'z8r3im0001')
               and (select at_awal is not null and actor_id is null from uji.akt('z8r3im0001', 'buka_ulang')),
  'sinkron: dibuka ulang → buka_ulang, reopen_count 1, at_awal = synced_at lama');

-- task_assignees (himpunan penuh per tugas)
select uji.simpan('ta', public.impor_batch(900000000002, 'task_assignees',
  '[{"task_id":"z8r3im0001","member_id":312000001},{"task_id":"z8r3im0001","member_id":312000002},{"task_id":"z8r3im0004","member_ids":[]}]',
  'sinkron'));
select uji.cek((uji.ambil('ta') ->> 'inserted')::int = 1 and (uji.ambil('ta') ->> 'dihapus')::int = 0,
  'task_assignees: tambah yang kurang');
select uji.cek((select sumber = 'sinkron' and not lengkap from uji.akt('z8r3im0001', 'assignee_tambah')), 'task_assignees sinkron: activity');

-- ================================================================ comments
select uji.simpan('c1', public.impor_batch(900000000002, 'comments', '[
  {"id":"90189000000002","task_id":"z8r3im0001","parent_id":"90189000000001","comment_text":"balasan impor",
   "comment":[{"text":"balasan impor"}],"user":{"id":312000001},"date":"1759200100000","reply_count":"0"},
  {"id":"90189000000001","task_id":"z8r3im0001","comment_text":"@Uji Impor Satu halo","user":{"id":312000002},"date":"1759200000000",
   "comment":[{"type":"tag","user":{"id":312000001,"username":"Uji Impor Satu"}},{"text":" halo"}],"reply_count":"1"},
  {"id":"90189000000003","task_id":"z8r3im0001","parent_id":"90189000000099","comment_text":"induk hilang","user":{"id":312000001},"date":"1759200200000"},
  {"id":"90189000000004","task_id":"z8r3im9999","comment_text":"tugas tak ada","user":{"id":312000001},"date":"1759200200000"}]'));
select uji.cek((select (j ->> 'inserted')::int = 2 and j -> 'tertunda' = '[{"id":"90189000000003","parent_id":"90189000000099"}]'
                   and jsonb_array_length(j -> 'gagal') = 1 from (select uji.ambil('c1') j) x),
  'comments: top-level dulu lalu balasan; induk hilang → tertunda; tugas tak ada → gagal');
select uji.cek((select sumber = 'clickup' and uji.ms(created_at) = '1759200000000' and author_id = 312000002
                   and body_json #>> '{0,type}' = 'tag' from public.comments where id = '90189000000001'),
  'comments: tanggal & penulis verbatim, parts disimpan');
select uji.sama((select array_agg(member_id) from public.comment_mentions where comment_id = '90189000000001'),
  array[312000001]::bigint[], 'comments: mention dari parts tag');
select uji.cek((select comment_count = 2 and uji.ms(last_comment_at) = '1759200100000' from public.tasks where id = 'z8r3im0001'),
  'comments: comment_count & last_comment_at (termasuk balasan)');
select uji.cek(uji.n_act('z8r3im0001', 'komentar') = 0, 'comments impor: tanpa activity komentar (baris komentar = riwayat)');
select uji.sama((select count(*)::int from public.notifications where comment_id like '9018900%'), 0, 'comments impor: tanpa notifikasi');
select uji.sama((public.impor_batch(900000000002, 'comments', '[{"id":"90189000000001","task_id":"z8r3im0001","comment_text":"@Uji Impor Satu halo","user":{"id":312000002},"date":"1759200000000",
   "comment":[{"type":"tag","user":{"id":312000001,"username":"Uji Impor Satu"}},{"text":" halo"}]}]') ->> 'unchanged')::int, 1,
  'comments: ulang → unchanged');
select uji.sama((public.impor_batch(900000000002, 'comments', '[{"id":"90189000000001","task_id":"z8r3im0001","comment_text":"halo (diedit di ClickUp)","user":{"id":312000002},"date":"1759200000000",
   "comment":[{"text":"halo (diedit di ClickUp)"}]}]', 'sinkron') ->> 'updated')::int, 1, 'comments: teks berubah → updated');
select uji.cek((select sumber = 'sinkron' and not lengkap and dari ->> 'teks' = '@Uji Impor Satu halo' from uji.akt('z8r3im0001', 'komentar_edit'))
               and not exists (select 1 from public.comment_mentions where comment_id = '90189000000001'),
  'comments sinkron: komentar_edit + mention diperbarui (himpunan penuh)');

-- ================================================================ attachments
select uji.simpan('a1', public.impor_batch(900000000002, 'attachments', '[
  {"id":"cuattim00001","parent_id":"z8r3im0001","title":"rekap.csv","extension":"csv","mimetype":"text/csv","size":1234,
   "url":"https://contoh.test/rekap.csv","date":"1759200000000","user":{"id":312000001}},
  {"id":"cuattim00002","task_id":"z8r3im0001","comment_id":"90189000000001","title":"bukti.png","extension":"png","mimetype":"image/png",
   "size":"999","url":"https://contoh.test/bukti.png","date":"1759200000000","user":{"id":312000002}}]'));
select uji.sama((uji.ambil('a1') ->> 'inserted')::int, 2, 'attachments: 2 insert (tugas & komentar)');
select uji.cek((select status_salin = 'tautan_saja' and storage_path is null and clickup_url = 'https://contoh.test/rekap.csv'
                   and uploaded_by = 312000001 and uji.ms(created_at) = '1759200000000'
                from public.attachments where id = 'cuattim00001'), 'attachments: tautan saja sebelum disalin');
select uji.sama((public.impor_batch(900000000002, 'attachments', '[{"id":"cuattim00001","parent_id":"z8r3im0001","title":"rekap.csv",
   "extension":"csv","mimetype":"text/csv","size":1234,"url":"https://contoh.test/rekap.csv","date":"1759200000000","user":{"id":312000001},
   "storage_path":"t/z8r3im0001/cuattim00001-rekap.csv","status_salin":"ok"}]') ->> 'updated')::int, 1,
  'attachments: storage_path diisi setelah salin → updated');
select uji.cek((select status_salin = 'ok' and storage_path = 't/z8r3im0001/cuattim00001-rekap.csv' from public.attachments where id = 'cuattim00001'),
  'attachments: status ok + path');
select uji.sama((public.impor_batch(900000000002, 'attachments', '[{"id":"cuattim00001","parent_id":"z8r3im0001","title":"rekap.csv",
   "extension":"csv","mimetype":"text/csv","size":1234,"url":"https://contoh.test/rekap.csv","date":"1759200000000","user":{"id":312000001}}]') ->> 'unchanged')::int, 1,
  'attachments: kirim ulang tanpa storage_path → path lama dipertahankan (unchanged)');

-- ================================================================ sync_raw
select uji.sama((public.impor_batch(900000000002, 'sync_raw', '[{"entity":"task","id":"z8r3im0001","payload":{"id":"z8r3im0001","a":1}}]') ->> 'inserted')::int,
  1, 'sync_raw: insert');
select uji.sama((public.impor_batch(900000000002, 'sync_raw', '[{"entity":"task","id":"z8r3im0001","payload":{"id":"z8r3im0001","a":1}}]') ->> 'unchanged')::int,
  1, 'sync_raw: payload sama → unchanged');
select uji.sama((public.impor_batch(900000000002, 'sync_raw', '[{"entity":"task","id":"z8r3im0001","payload":{"id":"z8r3im0001","a":2}}]') ->> 'updated')::int,
  1, 'sync_raw: payload beda → updated');

-- ================================================================ list_statuses: ganti nama & hapus
select uji.simpan('st2', public.impor_batch(900000000002, 'list_statuses', '[{"list_id":"1100340000800101","statuses":[
     {"id":"scA1","status":"to do","type":"open","orderindex":0,"color":"#d3d3d3"},
     {"id":"scA2","status":"sedang jalan","type":"custom","orderindex":1,"color":"#4194f6"},
     {"id":"scA3","status":"complete","type":"closed","orderindex":2,"color":"#6bc950"}]},
  {"list_id":"1100340000800102","status":"open","type":"open","orderindex":0,"id":"scB1"}]', 'sinkron'));
select uji.cek((select status = 'sedang jalan' from public.tasks where id = 'z8r3im0001') and uji.n_act('z8r3im0001', 'status') = 1,
  'list_statuses: ganti nama (id status sama) → tugas ikut, tanpa activity status palsu');
select uji.cek((uji.ambil('st2') ->> 'dihapus')::int = 1
               and not exists (select 1 from public.list_statuses where list_id = '1100340000800102' and status = 'Closed'),
  'list_statuses: status tak dipakai & tidak dikirim → dihapus');

-- ================================================================ tandai hilang
select uji.galat($$select public.impor_tandai_hilang(900000000002, 'tasks', '{}')$$, 'PT400', 'hilang: ids kosong tanpa lingkup → 400');
select uji.galat($$select public.impor_tandai_hilang(900000000002, 'lists', '{x}')$$, 'PT400', 'hilang: jenis tak didukung → 400');
select uji.simpan('h1', public.impor_tandai_hilang(900000000002, 'tasks', array['z8r3im0001', 'z8r3im0002', 'z8r3im0004', 'z8r3im0099'],
  'sinkron', '{"list_ids":["1100340000800101"]}'));
select uji.sama(uji.ambil('h1'), '{"jenis":"tasks","ditandai":1,"ids":["z8r3im0003"]}'::jsonb, 'hilang: hanya kartu yang tak ada lagi (lingkup list)');
select uji.cek((select deleted_at is not null and deleted_by is null from public.tasks where id = 'z8r3im0003')
               and (select sumber = 'sinkron' and not lengkap from uji.akt('z8r3im0003', 'hilang_di_clickup')),
  'hilang: soft delete + activity hilang_di_clickup');
select uji.cek(not exists (select 1 from public.tasks where id like 'z8r3uj%' and deleted_at is not null), 'hilang: lingkup melindungi list lain');
select uji.simpan('t4', public.impor_batch(900000000002, 'tasks', jsonb_build_array(uji.ambil('batch1') -> 2), 'sinkron'));
select uji.cek((select deleted_at is null from public.tasks where id = 'z8r3im0003') and uji.n_act('z8r3im0003', 'pulih') = 1,
  'muncul lagi di ClickUp → dipulihkan + activity pulih');
select uji.simpan('h2', public.impor_tandai_hilang(900000000002, 'comments', array['90189000000001'], 'sinkron', '{"task_ids":["z8r3im0001"]}'));
select uji.sama(uji.ambil('h2') -> 'ids', '["90189000000002"]'::jsonb, 'hilang komentar: balasan yang tak ada lagi');
select uji.cek((select catatan = 'hilang di ClickUp' from uji.akt('z8r3im0001', 'komentar_hapus'))
               and (select comment_count = 1 from public.tasks where id = 'z8r3im0001'), 'hilang komentar: activity + penghitung turun');
select uji.sama(public.impor_tandai_hilang(900000000002, 'attachments', array['cuattim00001'], 'sinkron', '{"task_ids":["z8r3im0001"]}') -> 'ids',
  '["cuattim00002"]'::jsonb, 'hilang lampiran');

-- ================================================================ (review R1) impor tidak menyentuh data buatan app
-- Semua di mode cermin (default seed): sumber impor lolos penjaga cermin, jadi pemuat sendiri yang wajib menolak.
select uji.simpan('r1st', public.impor_batch(900000000002, 'list_statuses', '[{"list_id":"rlujib0001","statuses":[
  {"status":"to do","type":"closed","orderindex":0},{"status":"in progress","type":"closed","orderindex":1},
  {"status":"complete","type":"closed","orderindex":2}]}]', 'sinkron'));
select uji.cek((select (j ->> 'updated')::int = 0 and (j ->> 'inserted')::int = 0 and (j ->> 'dihapus')::int = 0
                   and jsonb_array_length(j -> 'gagal') = 3 and j #>> '{gagal,0,err}' like 'List rlujib0001 buatan app%'
                from (select uji.ambil('r1st') j) x), 'R1 list_statuses list app → gagal per baris, tanpa perubahan');
select uji.sama((select string_agg(status || ':' || type, ',' order by orderindex) from public.list_statuses where list_id = 'rlujib0001'),
  'to do:open,in progress:custom,complete:closed', 'R1 list_statuses: status list app utuh');
select uji.cek(not exists (select 1 from public.activity a join public.tasks t on t.id = a.task_id
                            where t.list_id = 'rlujib0001' and a.jenis = 'status' and a.sumber = 'sinkron'),
  'R1 list_statuses: tanpa activity status sinkron di tugas app');
select uji.cek((public.impor_batch(900000000002, 'list_statuses', '[{"list_id":"1100340000999999","status":"x","type":"open"}]')
                #>> '{gagal,0,err}') like '%belum diimpor%', 'R1 list_statuses list tak ada → gagal per baris (bukan eksepsi batch)');

select uji.simpan('r1ta', public.impor_batch(900000000002, 'task_assignees',
  '[{"task_id":"rtujib0001","member_ids":[312000001]}]', 'sinkron'));
select uji.cek(uji.ambil('r1ta') #>> '{gagal,0,err}' like 'Tugas rtujib0001 buatan app%'
               and (select array_agg(member_id order by member_id) from public.task_assignees where task_id = 'rtujib0001')
                   = array[100000003, 900000000001]::bigint[],
  'R1 task_assignees tugas app → gagal, assignee tetap');
select uji.simpan('r1tb', public.impor_batch(900000000002, 'task_assignees',
  '[{"task_id":"z8r3im0001","member_ids":[312000001,900000000002]},{"task_id":"z8r3im0004","member_ids":[900000000001]}]', 'sinkron'));
select uji.cek((select jsonb_array_length(j -> 'gagal') = 2 and (j ->> 'inserted')::int = 0 and (j ->> 'dihapus')::int = 0
                from (select uji.ambil('r1tb') j) x)
               and (select array_agg(member_id order by member_id) from public.task_assignees where task_id = 'z8r3im0001')
                   = array[312000001, 312000002]::bigint[],
  'R1 task_assignees kartu ClickUp: bot / anggota buatan app ditolak (tanpa perubahan)');
select uji.simpan('r1tc', public.impor_batch(900000000002, 'task_assignees',
  '[{"task_id":"z8r3im0004","member_ids":[312000003]}]', 'sinkron'));
select uji.cek(jsonb_array_length(uji.ambil('r1tc') -> 'gagal') = 0
               and exists (select 1 from public.task_assignees where task_id = 'z8r3im0004' and member_id = 312000003),
  'R1 task_assignees kartu ClickUp: eks-anggota nonaktif tetap sah (riwayat ClickUp)');

select uji.simpan('r1cm', public.impor_batch(900000000002, 'comment_mentions', '[{"comment_id":"rcujib000001","member_ids":[]}]'));
select uji.cek(uji.ambil('r1cm') #>> '{gagal,0,err}' like 'Komentar rcujib000001 buatan app%' and (uji.ambil('r1cm') ->> 'updated')::int = 0
               and exists (select 1 from public.comment_mentions where comment_id = 'rcujib000001' and member_id = 900000000001),
  'R1 comment_mentions komentar app → gagal, mention tetap');

select uji.simpan('r1c', public.impor_batch(900000000002, 'comments', '[
  {"id":"90189000000701","task_id":"rtujib0001","comment_text":"masuk ke tugas app","user":{"id":312000001},"date":"1759200000000"},
  {"id":"90189000000702","task_id":"rtujib0001","parent_id":"rcujib000001","comment_text":"balas komentar app","user":{"id":312000001},"date":"1759200000000"}]'));
select uji.cek((uji.ambil('r1c') ->> 'inserted')::int = 0 and jsonb_array_length(uji.ambil('r1c') -> 'gagal') = 2
               and not exists (select 1 from public.comments where id in ('90189000000701', '90189000000702')),
  'R1 comments ke tugas/komentar app → gagal');
select uji.simpan('r1a', public.impor_batch(900000000002, 'attachments', '[
  {"id":"cuattim00701","task_id":"rtujib0001","title":"x.csv","url":"https://contoh.test/x.csv","date":"1759200000000","user":{"id":312000001}},
  {"id":"cuattim00702","task_id":"rtujib0003","comment_id":"rcujib000003","title":"y.csv","url":"https://contoh.test/y.csv"}]'));
select uji.cek((uji.ambil('r1a') ->> 'inserted')::int = 0 and jsonb_array_length(uji.ambil('r1a') -> 'gagal') = 2,
  'R1 attachments ke tugas/komentar app → gagal');

select uji.simpan('r1t', public.impor_batch(900000000002, 'tasks', jsonb_build_array(
  jsonb_build_object('id', 'z8r3im0701', 'name', 'ClickUp di list app', 'list', jsonb_build_object('id', 'rlujib0001'),
    'status', jsonb_build_object('status', 'to do'), 'creator', jsonb_build_object('id', 312000001)),
  jsonb_build_object('id', 'z8r3im0702', 'name', 'ClickUp di bawah induk app', 'list', jsonb_build_object('id', '1100340000800101'),
    'parent', 'rtujib0001', 'status', jsonb_build_object('status', 'to do'), 'creator', jsonb_build_object('id', 312000001)),
  jsonb_build_object('id', 'z8r3im0703', 'name', 'ClickUp assignee bot', 'list', jsonb_build_object('id', '1100340000800101'),
    'status', jsonb_build_object('status', 'to do'), 'creator', jsonb_build_object('id', 312000001),
    'assignees', jsonb_build_array(jsonb_build_object('id', 900000000002))))));
select uji.cek((uji.ambil('r1t') ->> 'inserted')::int = 0 and jsonb_array_length(uji.ambil('r1t') -> 'gagal') = 3
               and not exists (select 1 from public.tasks where id like 'z8r3im07%'),
  'R1 tasks: ke list app / di bawah induk app / assignee bot → gagal');

select uji.simpan('r1s', public.impor_batch(900000000002, 'folders',
  '[{"id":"1100340000800711","name":"Folder di space app","space":{"id":"rsujib0001"}}]'));
select uji.cek(uji.ambil('r1s') #>> '{gagal,0,err}' like '%buatan app%', 'R1 folders ke space app → gagal');
select uji.simpan('r1l', public.impor_batch(900000000002, 'lists',
  '[{"id":"1100340000800712","name":"List di space app","space_id":"rsujib0001","folder_id":null}]'));
select uji.cek(uji.ambil('r1l') #>> '{gagal,0,err}' like '%buatan app%', 'R1 lists ke space app → gagal');

-- (review R2) anggota space privat dari payload `members` → space_anggota sumber clickup (himpunan penuh)
select uji.simpan('r2sp', public.impor_batch(900000000002, 'spaces', '[{"id":"1100340000800002","name":"Ruang Privat Impor",
  "private":true,"members":[{"user":{"id":312000001}},{"user":{"id":312000002}},{"user":{"id":312999999}}]}]'));
select uji.sama((select array_agg(member_id || ':' || sumber order by member_id) from public.space_anggota where space_id = '1100340000800002'),
  array['312000001:clickup', '312000002:clickup'], 'R2 spaces: members → space_anggota (id tak dikenal dilewati)');
reset role;
insert into public.space_anggota (space_id, member_id, sumber) values ('1100340000800002', 100000003, 'app');
select uji.jadi_service();
select uji.token('dddddddd-0000-4000-8000-000000000001');
select uji.simpan('r2sp2', public.impor_batch(900000000002, 'spaces', '[{"id":"1100340000800002","name":"Ruang Privat Impor",
  "private":true,"members":[{"user":{"id":312000002}}]}]', 'sinkron'));
select uji.cek((uji.ambil('r2sp2') ->> 'updated')::int = 1
               and (select array_agg(member_id || ':' || sumber order by member_id) from public.space_anggota where space_id = '1100340000800002')
                   = array['100000003:app', '312000002:clickup'],
  'R2 spaces sinkron: anggota ClickUp dibuang/ditambah, anggota app (owner) tetap; dihitung updated');
select uji.sama((public.impor_batch(900000000002, 'spaces', '[{"id":"1100340000800002","name":"Ruang Privat Impor",
  "private":true}]', 'sinkron') ->> 'unchanged')::int, 1, 'R2 spaces tanpa kunci members → anggota tidak disentuh (unchanged)');

-- ================================================================ run sinkron
select uji.simpan('run', public.impor_run_mulai(900000000002, 'penuh'));
select uji.cek((select (j ->> 'id')::bigint > 0 and j ->> 'mode' = 'penuh' and j ->> 'at_awal' is not null
                from (select uji.ambil('run') j) x), 'run mulai: id + at_awal = run selesai sebelumnya');
select uji.simpan('run2', public.impor_run_selesai(900000000002, (uji.ambil('run') ->> 'id')::bigint,
  '{"tasks":{"inserted":5}}', '{"lists":3}', '[]', '[]'));
select uji.cek((select finished_at is not null and counts = '{"tasks":{"inserted":5}}' from public.sync_runs
                where id = (uji.ambil('run') ->> 'id')::bigint), 'run selesai: finished_at + counts');
select uji.sama((public.impor_run_mulai(900000000002, 'akhir') ->> 'at_awal'), uji.ambil('run') ->> 'started_at',
  'run berikutnya: at_awal = started_at run terakhir yang selesai');
select uji.galat($$select public.impor_run_mulai(900000000002, 'lain')$$, 'PT400', 'run mode salah → 400');
select uji.galat($$select public.impor_run_selesai(900000000002, 999999)$$, 'PT404', 'run tak ada → 404');
select uji.token(null);

-- mode cermin tidak menghalangi impor; tanpa hak impor untuk authenticated
reset role;
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.galat($$select public.impor_batch(100000001, 'tasks', '[]')$$, '42501', 'authenticated (owner): impor_batch ditolak');
reset role;

rollback;
