-- 10 · Fungsi API tulis (service_role): create/update (body persis clickup.mjs), delete (owner saja), komentar &
-- balasan (+mention), move (pemetaan status), idempotensi, scope token, mode cermin.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- token: bot tulis, bot baca, owner tulis
insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 900000000002, 'bot tulis', 'rtk_t1', uji.sha('rtk_t1'), 'tulis'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 900000000002, 'bot baca', 'rtk_t2', uji.sha('rtk_t2'), 'baca'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 100000001, 'owner tulis', 'rtk_t3', uji.sha('rtk_t3'), 'tulis');

-- ms seperti clickup.mjs toMs('YYYY-MM-DD') = 12:00 WIB
create function uji.toms(d date) returns bigint language sql immutable as $$
  select floor(extract(epoch from (d::text || ' 12:00:00+07')::timestamptz) * 1000)::bigint
$$;
grant execute on function uji.toms(date) to public;

-- ================================================================ create
select uji.jadi_service();
select uji.token('bbbbbbbb-0000-4000-8000-000000000001');
select uji.simpan('buat', public.api_create_task(900000000002, 'rlujib0001', jsonb_build_object(
  'name', '[Claude] Uji API buat', 'markdown_description', E'Deskripsi **md**\n\nSelesai kalau: ada tautan.',
  'assignees', jsonb_build_array(100000002, 900000000001), 'due_date', uji.toms('2026-10-05'), 'due_date_time', false,
  'priority', 2, 'status', 'in progress')));
select uji.sama(uji.kunci(uji.ambil('buat')), uji.kunci_task(), 'create: hasil = task json (kunci kontrak)');
select uji.cek((select j ->> 'id' ~ '^rt[0-9a-z]{8}$' and j ->> 'name' = '[Claude] Uji API buat'
                   and j #>> '{status,status}' = 'in progress' and j #>> '{priority,id}' = '2'
                   and j ->> 'due_date' = uji.toms('2026-10-05')::text and (j ->> 'due_date_time')::boolean = false
                   and (j #>> '{creator,id}')::bigint = 900000000002
                from (select uji.ambil('buat') j) x), 'create: id rt…, nama, status, prioritas, due ms, creator = bot');
select uji.sama((select array_agg((a ->> 'id')::bigint) from jsonb_array_elements(uji.ambil('buat') -> 'assignees') a),
  array[100000002, 900000000001]::bigint[], 'create: assignees');
select uji.cek((select due_wib = '2026-10-05' and not due_has_time and markdown like 'Deskripsi **md**%' and sumber = 'app'
                from public.tasks where id = uji.ambil('buat') ->> 'id'), 'create: due_wib 5/10, markdown tersimpan');
select uji.cek((select sumber = 'api' and actor_id = 900000000002 and token_id = 'bbbbbbbb-0000-4000-8000-000000000001' and lengkap
                from uji.akt(uji.ambil('buat') ->> 'id', 'dibuat')), 'activity dibuat: sumber api, aktor bot, token_id');
select uji.sama((select count(*)::int from public.notifications where task_id = uji.ambil('buat') ->> 'id' and jenis = 'assign'), 2,
  'create: notifikasi assign ke 2 assignee');
select uji.sama((select count(*)::int from public.activity where task_id = uji.ambil('buat') ->> 'id' and jenis = 'assignee_tambah'), 2,
  'create: activity assignee_tambah ×2');

-- validasi
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","status":"tidak ada"}')$$,
  'PT400', 'status tak dikenal → 400', 'Status "tidak ada" tidak ada di list', 'INPUT_001');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","assignees":[999]}')$$,
  'PT400', 'assignee tak dikenal → 400', 'Assignee tidak dikenal: 999', 'INPUT_001');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","assignees":[900000000002]}')$$,
  'PT400', 'assignee bot → 400 (bot bukan anggota tim)');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"   "}')$$, 'PT400', 'nama kosong → 400');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"markdown_description":"x"}')$$, 'PT400', 'tanpa nama → 400');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","priority":5}')$$, 'PT400', 'prioritas 5 → 400');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","due_date":"besok"}')$$, 'PT400', 'due tak valid → 400');
select uji.galat($$select public.api_create_task(900000000002, 'tidakada', '{"name":"x"}')$$, 'PT404', 'list tak ada → 404', null, 'ITEM_013');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x","parent":"z8r3uj0001"}')$$,
  'PT400', 'induk di list lain → 400');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '["bukan objek"]')$$, 'PT400', 'body bukan objek → 400');

-- variasi body
select uji.simpan('buat2', public.api_create_task(900000000002, 'rlujib0001',
  '{"name":"Uji due tanggal","due_date":"2026-10-07","status":"COMPLETE","parent":"rtujib0001"}'));
select uji.cek((select due_at = '2026-10-07 12:00+07' and not due_has_time and status = 'complete' and status_type = 'closed'
                   and closed_at is not null and parent_id = 'rtujib0001'
                from public.tasks where id = uji.ambil('buat2') ->> 'id'),
  'create: due YYYY-MM-DD = 12:00 WIB, status beda huruf dinormalkan, parent');
select uji.cek((select (j ->> 'status') is not null and j #>> '{status,status}' = 'to do'
                from (select public.api_create_task(900000000002, 'rlujib0001', '{"name":"Uji status default"}') j) x),
  'create tanpa status → status open pertama');
select uji.simpan('berjam', public.api_create_task(900000000002, 'rlujib0001', jsonb_build_object(
  'name', 'Uji due berjam', 'due_date', (uji.toms('2026-10-08') + 3600000)::text, 'due_date_time', true)));
select uji.cek((select due_at = uji.dari_ms(uji.toms('2026-10-08') + 3600000) and due_has_time
                from public.tasks where id = uji.ambil('berjam') ->> 'id'), 'create: due ms string + due_date_time true');
select uji.simpan('dicu', public.api_create_task(900000000002, '1100340000900101', '{"name":"Tugas app di list ClickUp"}'));
select uji.cek((select sumber = 'app' from public.tasks where id = uji.ambil('dicu') ->> 'id'),
  'mode cermin: tugas app baru di list ClickUp diizinkan');

-- idempotensi
select uji.simpan('idem1', public.api_create_task(900000000002, 'rlujib0001', '{"name":"Uji idem"}', 'kunci-idem-1'));
select uji.simpan('idem2', public.api_create_task(900000000002, 'rlujib0001', '{"name":"Uji idem"}', 'kunci-idem-1'));
select uji.cek(uji.ambil('idem1') ->> 'id' = uji.ambil('idem2') ->> 'id', 'idem: kunci sama → hasil sama');
select uji.sama((select count(*)::int from public.tasks where name = 'Uji idem'), 1, 'idem: hanya 1 tugas dibuat');
select uji.cek(public.api_create_task(900000000002, 'rlujib0001', '{"name":"Uji idem"}', 'kunci-idem-2') ->> 'id'
               <> uji.ambil('idem1') ->> 'id', 'idem: kunci lain → tugas baru');

-- ================================================================ scope token
select uji.token('bbbbbbbb-0000-4000-8000-000000000002');
select uji.galat($$select public.api_create_task(900000000002, 'rlujib0001', '{"name":"x"}')$$, 'PT403',
  'token baca: create ditolak', 'Scope token "baca" tidak cukup', 'ACCESS_001');
select uji.galat($$select public.api_update_task(900000000002, 'rtujib0001', '{"name":"x"}')$$, 'PT403', 'token baca: update ditolak');
select uji.galat($$select public.api_create_comment(900000000002, 'rtujib0001', '{"comment_text":"x"}')$$, 'PT403', 'token baca: komentar ditolak');
select uji.galat($$select public.api_move_task(900000000002, 'rtujib0001', 'rlujib0001')$$, 'PT403', 'token baca: move ditolak');
select uji.jalan($$select public.api_task(900000000002, 'rtujib0001')$$, 'token baca: GET task boleh');
select uji.token('00000000-0000-4000-8000-00000000abcd');
select uji.galat($$select public.api_task(900000000002, 'rtujib0001')$$, 'PT401', 'token id tak dikenal → 401');
select uji.token('bbbbbbbb-0000-4000-8000-000000000001');

-- ================================================================ update (body persis clickup.mjs)
select uji.simpan('act0', to_jsonb((select max(id) from public.activity)));
select uji.simpan('ubah', public.api_update_task(900000000002, uji.ambil('buat') ->> 'id', jsonb_build_object(
  'name', '[Claude] Uji API ubah', 'markdown_description', 'Deskripsi baru', 'status', 'complete', 'due_date', null,
  'priority', 4, 'assignees', jsonb_build_object('add', jsonb_build_array(100000003), 'rem', jsonb_build_array(900000000001)))));
select uji.sama(uji.kunci(uji.ambil('ubah')), uji.kunci_task(), 'update: hasil = task json');
select uji.cek((select name = '[Claude] Uji API ubah' and markdown = 'Deskripsi baru' and status = 'complete' and status_type = 'closed'
                   and due_at is null and due_wib is null and priority = 4 and closed_at is not null
                from public.tasks where id = uji.ambil('buat') ->> 'id'), 'update: nama, deskripsi, status, due null (parkir), prioritas');
select uji.sama((select array_agg(member_id order by member_id) from public.task_assignees where task_id = uji.ambil('buat') ->> 'id'),
  array[100000002, 100000003]::bigint[], 'update: assignees add/rem');
select uji.sama((select array_agg(jenis order by jenis) from public.activity
                  where task_id = uji.ambil('buat') ->> 'id' and id > (uji.ambil('act0') #>> '{}')::bigint and sumber = 'api'),
  array['assignee_hapus','assignee_tambah','deskripsi','due','nama','prioritas','status'],
  'update: activity per field (sumber api)');
select uji.cek((select snapshot is not null and actor_id = 900000000002 and dari ->> 'status' = 'in progress'
                from uji.akt(uji.ambil('buat') ->> 'id', 'status')), 'update → complete: snapshot + aktor');
select uji.cek(uji.ambil('ubah') -> 'due_date' = 'null' and uji.ambil('ubah') #>> '{priority,priority}' = 'low',
  'update: due_date null, priority low di JSON');
select uji.simpan('x', public.api_update_task(900000000002, uji.ambil('buat') ->> 'id',
  jsonb_build_object('due_date', uji.toms('2026-10-09'), 'due_date_time', false)));
select uji.cek((select due_at = uji.dari_ms(uji.toms('2026-10-09')) and due_has_time = false and due_wib = '2026-10-09'
                from public.tasks where id = uji.ambil('buat') ->> 'id'), 'update: due baru');
select uji.simpan('x', public.api_update_task(900000000002, uji.ambil('buat') ->> 'id', '{"priority":null}'));
select uji.cek((select priority is null from public.tasks where id = uji.ambil('buat') ->> 'id'), 'update: priority null mengosongkan');
select uji.simpan('x', public.api_update_task(900000000002, uji.ambil('buat') ->> 'id', '{"archived":true}'));
select uji.cek((select archived and archived_at is not null from public.tasks where id = uji.ambil('buat') ->> 'id'),
  'update: archived true');
select uji.jalan(format($$select public.api_update_task(900000000002, %L, '{"archived":false}')$$, uji.ambil('buat') ->> 'id'),
  'update: archived false');
select uji.simpan('v0', to_jsonb((select versi from public.tasks where id = uji.ambil('buat') ->> 'id')));
select uji.simpan('x', public.api_update_task(900000000002, uji.ambil('buat') ->> 'id', '{}'));
select uji.sama((select versi from public.tasks where id = uji.ambil('buat') ->> 'id'), (uji.ambil('v0') #>> '{}')::int,
  'update body kosong: tidak mengubah apa pun (versi tetap)');
select uji.galat(format($$select public.api_update_task(900000000002, %L, '{"status":"entah"}')$$, uji.ambil('buat') ->> 'id'),
  'PT400', 'update: status tak dikenal → 400');
select uji.galat(format($$select public.api_update_task(900000000002, %L, '{"assignees":{"add":[424242],"rem":[]}}')$$, uji.ambil('buat') ->> 'id'),
  'PT400', 'update: add assignee tak dikenal → 400', 'Assignee tidak dikenal');
select uji.galat($$select public.api_update_task(900000000002, 'tidakada', '{"name":"x"}')$$, 'PT404', 'update: tugas tak ada → 404');
select uji.galat($$select public.api_update_task(900000000002, 'rtujib0004', '{"name":"x"}')$$, 'PT404', 'update: tugas terhapus → 404');
select uji.galat($$select public.api_update_task(900000000002, 'rtujib0001', '{"parent":"rtujib0005"}')$$, 'PT400',
  'update: induk melingkar ditolak', 'lingkaran');
select uji.galat($$select public.api_update_task(900000000002, 'z8r3uj0002', '{"name":"ubah kartu ClickUp"}')$$, 'PT409',
  'mode cermin: update kartu ClickUp → 409', 'Mode cermin: data ClickUp hanya-baca sampai cutover', 'CERMIN_001');

-- ================================================================ delete: hanya owner; bot & member ditolak
select uji.galat(format($$select public.api_delete_task(900000000002, %L)$$, uji.ambil('buat') ->> 'id'), 'PT403',
  'bot: delete → 403 HAPUS_OWNER', 'Hanya owner', 'HAPUS_OWNER');
select uji.token(null);
select uji.galat(format($$select public.api_delete_task(100000002, %L)$$, uji.ambil('buat') ->> 'id'), 'PT403',
  'member: delete → 403 HAPUS_OWNER', null, 'HAPUS_OWNER');
select uji.token('bbbbbbbb-0000-4000-8000-000000000003');
select uji.sama(public.api_delete_task(100000001, uji.ambil('buat') ->> 'id'), '{}'::jsonb, 'owner: delete → {}');
select uji.cek((select deleted_at = now() and deleted_by = 100000001 from public.tasks where id = uji.ambil('buat') ->> 'id'),
  'delete = hapus lunak (deleted_at, deleted_by owner)');
select uji.cek((select sumber = 'api' and actor_id = 100000001 from uji.akt(uji.ambil('buat') ->> 'id', 'hapus')), 'activity hapus');
select uji.galat(format($$select public.api_task(100000001, %L)$$, uji.ambil('buat') ->> 'id'), 'PT404', 'sesudah delete: GET → 404');
select uji.galat(format($$select public.api_delete_task(100000001, %L)$$, uji.ambil('buat') ->> 'id'), 'PT404', 'delete ulang → 404');
select uji.galat($$select public.api_delete_task(100000001, 'z8r3uj0006')$$, 'PT409', 'owner: delete kartu ClickUp saat cermin → 409');
select uji.token('bbbbbbbb-0000-4000-8000-000000000001');

-- ================================================================ komentar
select uji.simpan('kom', public.api_create_comment(900000000002, 'rtujib0001',
  '{"comment_text":"@citra lestari tolong cek ya, cc @eka wulandari.","notify_all":false}'));
select uji.sama(uji.kunci(uji.ambil('kom')), array['date','hist_id','id'], 'comment: hasil {id, hist_id, date}');
select uji.cek(uji.ambil('kom') ->> 'id' ~ '^rc[0-9a-z]{10}$' and uji.ambil('kom') ->> 'hist_id' = uji.ambil('kom') ->> 'id'
               and jsonb_typeof(uji.ambil('kom') -> 'date') = 'number',
  'comment: id rc…, hist_id = id, date angka ms');
select uji.cek((select (uji.ambil('kom') ->> 'date')::bigint = uji.ms(created_at)::bigint and author_id = 900000000002
                   and text = '@citra lestari tolong cek ya, cc @eka wulandari.'
                from public.comments where id = uji.ambil('kom') ->> 'id'), 'comment: tersimpan, penulis bot');
select uji.sama((select array_agg(member_id order by member_id) from public.comment_mentions where comment_id = uji.ambil('kom') ->> 'id'),
  array[100000002, 900000000001]::bigint[], 'mention @username persis → comment_mentions');
select uji.sama((select body_json from public.comments where id = uji.ambil('kom') ->> 'id'),
  '[{"type":"tag","user":{"id":100000002,"username":"citra lestari","email":"citra.uji@contoh.test","color":"#e5484d","initials":"CL"}},
    {"text":" tolong cek ya, cc "},
    {"type":"tag","user":{"id":900000000001,"username":"eka wulandari","email":"eka.uji@contoh.test","color":"#f76b15","initials":"EW"}},
    {"text":"."}]'::jsonb, 'parts: tag + teks');
select uji.cek((select count(*) = 1 and bool_and(jenis = 'mention' and actor_id = 900000000002) from public.notifications
                 where comment_id = uji.ambil('kom') ->> 'id' and member_id = 100000002), 'notifikasi mention ke Citra');
select uji.simpan('kom2', public.api_create_comment(900000000002, 'rtujib0001', '{"comment_text":"halo @citra lestarix dan @Citra Lestari"}'));
select uji.sama((select count(*)::int from public.comment_mentions where comment_id = uji.ambil('kom2') ->> 'id'), 0,
  'mention harus persis (tidak menempel huruf, peka huruf besar)');
select uji.cek((select sumber = 'api' and ke ->> 'id' = uji.ambil('kom') ->> 'id' from uji.akt('rtujib0001', 'komentar')) is not null,
  'activity komentar');
select uji.galat($$select public.api_create_comment(900000000002, 'rtujib0001', '{"comment_text":"  "}')$$, 'PT400', 'komentar kosong → 400');
select uji.galat($$select public.api_create_comment(900000000002, 'rtujib0001', '{"notify_all":false}')$$, 'PT400', 'tanpa comment_text → 400');
select uji.galat($$select public.api_create_comment(900000000002, 'tidakada', '{"comment_text":"x"}')$$, 'PT404', 'komentar: tugas tak ada → 404');
select uji.galat($$select public.api_create_comment(900000000002, 'z8r3uj0001', '{"comment_text":"x"}')$$, 'PT409',
  'mode cermin: komentar di kartu ClickUp → 409', null, 'CERMIN_001');
select uji.simpan('kidem', public.api_create_comment(900000000002, 'rtujib0002', '{"comment_text":"idem"}', 'k-kom-1'));
select uji.sama(public.api_create_comment(900000000002, 'rtujib0002', '{"comment_text":"idem"}', 'k-kom-1'), uji.ambil('kidem'),
  'komentar idem: hasil sama');
select uji.sama((select count(*)::int from public.comments where task_id = 'rtujib0002' and text = 'idem'), 1, 'komentar idem: 1 baris');

-- balasan
select uji.simpan('bls', public.api_create_reply(900000000002, 'rcujib000001', '{"comment_text":"balasan API","notify_all":false}'));
select uji.sama(uji.kunci(uji.ambil('bls')), array['date','hist_id','id'], 'reply: {id, hist_id, date}');
select uji.cek((select parent_id = 'rcujib000001' and task_id = 'rtujib0001' from public.comments where id = uji.ambil('bls') ->> 'id'),
  'reply: parent_id & task_id');
select uji.simpan('bls2', public.api_create_reply(900000000002, 'rcujib000002', '{"comment_text":"balas ke balasan"}'));
select uji.cek((select parent_id = 'rcujib000001' from public.comments where id = uji.ambil('bls2') ->> 'id'),
  'reply ke balasan → dipasang ke top-level');
select uji.galat($$select public.api_create_reply(900000000002, 'tidakada', '{"comment_text":"x"}')$$, 'PT404', 'reply: komentar tak ada → 404');
select uji.sama((select comment_count from public.tasks where id = 'rtujib0001'),
  (select count(*)::int from public.comments where task_id = 'rtujib0001' and deleted_at is null), 'comment_count ikut naik');

-- ================================================================ move: pemetaan status
reset role;
select uji.konteks('ui', 100000001);
insert into public.list_statuses (list_id, status, type, orderindex) values ('rlujib0001', 'review', 'custom', 5);
insert into public.lists (id, space_id, name) values ('rlujitujua1', 'rsujib0001', 'Tujuan satu'), ('rlujitujua2', 'rsujib0001', 'Tujuan dua');
delete from public.list_statuses where list_id in ('rlujitujua1', 'rlujitujua2');
insert into public.list_statuses (list_id, status, type, orderindex) values
  ('rlujitujua1', 'Antri', 'open', 0), ('rlujitujua1', 'Dikerjakan', 'custom', 1), ('rlujitujua1', 'Review', 'custom', 5),
  ('rlujitujua1', 'Selesai', 'closed', 9),
  ('rlujitujua2', 'Baru', 'open', 0), ('rlujitujua2', 'Beres', 'closed', 1);
insert into public.tasks (id, list_id, name, status) values
  ('rtujipind1', 'rlujib0001', 'Pindah review', 'review'),
  ('rtujipind2', 'rlujib0001', 'Pindah in progress', 'in progress'),
  ('rtujipind3', 'rlujib0001', 'Pindah complete', 'complete'),
  ('rtujipind4', 'rlujib0001', 'Pindah to do', 'to do'),
  ('rtujipind5', 'rlujib0001', 'Pindah ke dua', 'in progress');
insert into public.tasks (id, list_id, parent_id, name, status) values ('rtujipind6', 'rlujib0001', 'rtujipind1', 'Sub ikut pindah', 'in progress');
select uji.jadi_service();
select uji.token('bbbbbbbb-0000-4000-8000-000000000001');
select uji.simpan('mv1', public.api_move_task(900000000002, 'rtujipind1', 'rlujitujua1'));
select uji.sama(uji.kunci(uji.ambil('mv1')), uji.kunci_task(), 'move: hasil = task json');
select uji.cek(uji.ambil('mv1') #>> '{list,id}' = 'rlujitujua1' and uji.ambil('mv1') #>> '{status,status}' = 'Review',
  'move: nama status sama (beda huruf) → "Review"');
select uji.sama((select status from public.tasks where id = 'rtujipind6'), 'Dikerjakan', 'move: sub-tugas ikut pindah, status dipetakan');
select uji.sama((select list_id from public.tasks where id = 'rtujipind6'), 'rlujitujua1', 'move: sub-tugas ikut list baru');
select uji.sama(public.api_move_task(900000000002, 'rtujipind2', 'rlujitujua1') #>> '{status,status}', 'Dikerjakan',
  'move: nama tak ada → type sama (custom pertama)');
select uji.sama(public.api_move_task(900000000002, 'rtujipind3', 'rlujitujua1') #>> '{status,status}', 'Selesai',
  'move: complete → status closed di list tujuan');
select uji.sama(public.api_move_task(900000000002, 'rtujipind4', 'rlujitujua1') #>> '{status,status}', 'Antri', 'move: open → open');
select uji.sama(public.api_move_task(900000000002, 'rtujipind5', 'rlujitujua2') #>> '{status,status}', 'Baru',
  'move: type tak ada → status open pertama');
select uji.cek((select dari ->> 'id' = 'rlujib0001' and ke ->> 'id' = 'rlujitujua1' and sumber = 'api'
                from uji.akt('rtujipind1', 'pindah_list')), 'activity pindah_list dari/ke');
select uji.cek((select closed_at is not null and status_type = 'closed' from public.tasks where id = 'rtujipind3'),
  'move: kartu selesai tetap selesai');
select uji.galat($$select public.api_move_task(900000000002, 'rtujipind4', 'tidakada')$$, 'PT404', 'move: list tak ada → 404');
select uji.galat($$select public.api_move_task(900000000002, 'z8r3uj0002', 'rlujib0001')$$, 'PT409', 'move kartu ClickUp saat cermin → 409');
select uji.sama(public.api_move_task(900000000002, 'rtujipind4', 'rlujitujua1') #>> '{list,id}', 'rlujitujua1', 'move ke list sama: no-op');

-- mode utama: kartu ClickUp bisa diubah lewat API
reset role;
select uji.mode('utama');
select uji.jadi_service();
select uji.sama(public.api_update_task(900000000002, 'z8r3uj0002', '{"name":"P15 · diubah API (utama)"}') ->> 'name',
  'P15 · diubah API (utama)', 'mode utama: update kartu ClickUp diizinkan');
select uji.cek((public.api_create_comment(900000000002, 'z8r3uj0002', '{"comment_text":"komentar mode utama"}') ->> 'id') is not null,
  'mode utama: komentar di kartu ClickUp diizinkan');
select uji.token(null);
reset role;

rollback;
