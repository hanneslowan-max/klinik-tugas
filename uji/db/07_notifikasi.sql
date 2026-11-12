-- 07 · Notifikasi (trigger): assign / mention / komentar. Hanya sumber ui/api, tidak ke aktor sendiri,
-- tidak ke bot/anggota nonaktif, satu notifikasi per (anggota, komentar) — mention menimpa 'komentar'.
begin;
\ir _bantu.sql

create function uji.notif(p_member bigint, p_task text, p_jenis text, p_comment text default null) returns int
language sql as $$
  select count(*)::int from public.notifications n
   where n.member_id = p_member and n.task_id = p_task and n.jenis = p_jenis
     and (p_comment is null or n.comment_id = p_comment)
$$;

-- Budi (owner) membuat kartu
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name) values ('rtnotif001', 'rlujib0001', 'Uji notifikasi');

-- ---------------------------------------------------------------- assign
insert into public.task_assignees (task_id, member_id) values ('rtnotif001', 100000002);
select uji.cek((select count(*) = 1 and bool_and(actor_id = 100000001) from public.notifications
                 where member_id = 100000002 and task_id = 'rtnotif001' and jenis = 'assign'),
  'assign: Citra dapat notifikasi assign dari Budi');
insert into public.task_assignees (task_id, member_id) values ('rtnotif001', 100000001);
select uji.sama(uji.notif(100000001, 'rtnotif001', 'assign'), 0, 'assign diri sendiri: tidak ada notifikasi');
insert into public.task_assignees (task_id, member_id) values ('rtnotif001', 900000000002);
select uji.sama(uji.notif(900000000002, 'rtnotif001', 'assign'), 0, 'assign bot: tidak ada notifikasi');
update public.members set aktif = false where id = 900000000001;
insert into public.task_assignees (task_id, member_id) values ('rtnotif001', 900000000001);
select uji.sama(uji.notif(900000000001, 'rtnotif001', 'assign'), 0, 'assign anggota nonaktif: tidak ada notifikasi');
update public.members set aktif = true where id = 900000000001;

-- ---------------------------------------------------------------- komentar Budi → assignee (Citra, Eka)
insert into public.comments (id, task_id, text) values ('rcnotif0001', 'rtnotif001', 'Mulai dikerjakan ya.');
select uji.sama(uji.notif(100000002, 'rtnotif001', 'komentar', 'rcnotif0001'), 1, 'komentar: assignee Citra dapat notifikasi');
select uji.sama(uji.notif(900000000001, 'rtnotif001', 'komentar', 'rcnotif0001'), 1, 'komentar: assignee Eka dapat notifikasi');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0001' and member_id = 100000001), 0,
  'komentar: penulis (Budi) tidak dapat notifikasi sendiri');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0001' and member_id = 900000000002), 0,
  'komentar: bot tidak dapat notifikasi');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0001'), 2,
  'komentar Budi: tepat 2 penerima (Citra, Eka)');

-- ---------------------------------------------------------------- komentar Dodi + mention Citra
select uji.konteks('ui', 100000003);
insert into public.comments (id, task_id, text) values ('rcnotif0002', 'rtnotif001', '@citra lestari cek bagian dua');
insert into public.comment_mentions (comment_id, member_id) values ('rcnotif0002', 100000002);
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0002' and member_id = 100000002), 1,
  'mention: Citra hanya dapat SATU notifikasi untuk komentar itu');
select uji.sama(uji.notif(100000002, 'rtnotif001', 'mention', 'rcnotif0002'), 1, 'mention: jenis notifikasi Citra = mention');
select uji.sama(uji.notif(100000001, 'rtnotif001', 'komentar', 'rcnotif0002'), 1,
  'komentar: pembuat kartu & pengomentar sebelumnya (Budi) dapat notifikasi');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0002' and member_id = 100000003), 0,
  'komentar: Dodi (penulis) tidak dapat notifikasi');

insert into public.comments (id, task_id, text) values ('rcnotif0003', 'rtnotif001', '@dodi pratama catatan untuk diri sendiri');
insert into public.comment_mentions (comment_id, member_id) values ('rcnotif0003', 100000003);
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0003' and member_id = 100000003), 0,
  'mention diri sendiri: tidak ada notifikasi');

-- mention orang yang bukan assignee/pengomentar → tetap dapat (mention)
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name) values ('rtnotif002', 'rlujib0001', 'Uji mention saja');
insert into public.comments (id, task_id, text) values ('rcnotif0004', 'rtnotif002', '@eka wulandari lihat ini');
insert into public.comment_mentions (comment_id, member_id) values ('rcnotif0004', 900000000001);
select uji.sama(uji.notif(900000000001, 'rtnotif002', 'mention', 'rcnotif0004'), 1, 'mention: yang disebut (bukan assignee) dapat notifikasi');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0004'), 1,
  'mention: tidak ada penerima lain di kartu tanpa assignee/pengomentar lain');

-- ---------------------------------------------------------------- balasan Citra → pengomentar sebelumnya + assignee
select uji.konteks('ui', 100000002);
insert into public.comments (id, task_id, parent_id, text) values ('rcnotif0005', 'rtnotif001', 'rcnotif0002', 'Siap, sudah dicek.');
select uji.sama(
  (select string_agg(member_id::text, ',' order by member_id) from public.notifications where comment_id = 'rcnotif0005'),
  '100000001,100000003,900000000001',
  'balasan Citra: Budi (pembuat/pengomentar), Dodi (pengomentar), Eka (assignee); tanpa Citra & bot');

-- ---------------------------------------------------------------- sumber api ikut, sistem/impor tidak
select uji.konteks('api', 900000000002);
insert into public.comments (id, task_id, text) values ('rcnotif0006', 'rtnotif001', '[Claude] ringkasan harian');
select uji.cek((select count(*) > 0 and bool_and(actor_id = 900000000002) from public.notifications where comment_id = 'rcnotif0006'),
  'api: komentar bot membuat notifikasi (aktor = bot)');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0006' and member_id = 900000000002), 0,
  'api: bot tidak menerima notifikasi komentarnya sendiri');

select uji.konteks('sistem', null);
insert into public.comments (id, task_id, author_id, text) values ('rcnotif0007', 'rtnotif001', 100000001, 'catatan sistem');
select uji.sama((select count(*)::int from public.notifications where comment_id = 'rcnotif0007'), 0,
  'sistem: tidak membuat notifikasi');
insert into public.task_assignees (task_id, member_id) values ('rtnotif002', 100000003);
select uji.sama(uji.notif(100000003, 'rtnotif002', 'assign'), 0, 'sistem: assign tidak membuat notifikasi');

rollback;
