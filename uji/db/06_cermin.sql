-- 06 · Penjaga mode cermin: baris sumber='clickup' hanya boleh diubah bila app.sumber in ('impor','sinkron').
begin;
\ir _bantu.sql

select uji.sama(public.mode_app(), 'cermin', 'mode awal = cermin');

-- ---------------------------------------------------------------- ui / api / sistem ditolak (PT409 CERMIN_001)
select uji.konteks('ui', 100000002);
select uji.galat($$update public.tasks set name = 'diubah ui' where id = 'z8r3uj0002'$$, 'PT409',
  'ui: ubah tugas ClickUp ditolak', 'Mode cermin: data ClickUp hanya-baca sampai cutover', 'CERMIN_001');
select uji.galat($$update public.tasks set status = 'complete' where id = 'z8r3uj0002'$$, 'PT409', 'ui: tutup tugas ClickUp ditolak');
select uji.galat($$update public.tasks set deleted_at = now() where id = 'z8r3uj0002'$$, 'PT409', 'ui: hapus lunak tugas ClickUp ditolak');
select uji.galat($$delete from public.tasks where id = 'z8r3uj0006'$$, 'PT409', 'ui: purge tugas ClickUp ditolak');
select uji.galat($$insert into public.tasks (id, list_id, name, sumber) values ('z8r3palsu2', '1100340000900101', 'x', 'clickup')$$,
  'PT409', 'ui: membuat baris sumber clickup ditolak');
select uji.galat($$insert into public.task_assignees (task_id, member_id) values ('z8r3uj0002', 100000002)$$,
  'PT409', 'ui: tambah assignee kartu ClickUp ditolak');
select uji.galat($$delete from public.task_assignees where task_id = 'z8r3uj0002'$$, 'PT409', 'ui: hapus assignee kartu ClickUp ditolak');
select uji.galat($$insert into public.comments (task_id, text) values ('z8r3uj0002', 'komentar di kartu ClickUp')$$,
  'PT409', 'ui: komentar baru di kartu ClickUp ditolak');
select uji.galat($$update public.comments set text = 'edit' where id = '90180000000001'$$, 'PT409', 'ui: edit komentar ClickUp ditolak');
select uji.galat($$update public.comments set deleted_at = now() where id = '90180000000001'$$, 'PT409', 'ui: hapus komentar ClickUp ditolak');
select uji.galat($$insert into public.comment_mentions (comment_id, member_id) values ('90180000000001', 100000003)$$,
  'PT409', 'ui: mention di komentar ClickUp ditolak');
select uji.galat($$insert into public.attachments (task_id, title) values ('z8r3uj0002', 'x.pdf')$$,
  'PT409', 'ui: lampiran di kartu ClickUp ditolak');
select uji.galat($$update public.attachments set deleted_at = now() where id = 'cu-lampiran-uji-0001'$$,
  'PT409', 'ui: hapus lampiran ClickUp ditolak');
select uji.galat($$update public.lists set name = 'ganti' where id = '1100340000900101'$$, 'PT409', 'ui: ubah list ClickUp ditolak');
select uji.galat($$update public.folders set name = 'ganti' where id = '1100340000900011'$$, 'PT409', 'ui: ubah folder ClickUp ditolak');
select uji.galat($$update public.spaces set name = 'ganti' where id = '1100340000900001'$$, 'PT409', 'ui: ubah space ClickUp ditolak');
select uji.galat($$insert into public.list_statuses (list_id, status, type) values ('1100340000900101', 'baru', 'custom')$$,
  'PT409', 'ui: tambah status di list ClickUp ditolak');

select uji.konteks('api', 900000000002);
select uji.galat($$update public.tasks set name = 'diubah api' where id = 'z8r3uj0002'$$, 'PT409', 'api: ubah tugas ClickUp ditolak');
select uji.galat($$insert into public.comments (task_id, text) values ('z8r3uj0002', 'komentar api')$$, 'PT409', 'api: komentar di kartu ClickUp ditolak');
select uji.konteks('sistem', null);
select uji.galat($$update public.tasks set name = 'diubah sistem' where id = 'z8r3uj0002'$$, 'PT409', 'sistem: ubah tugas ClickUp ditolak');

-- ---------------------------------------------------------------- data app bebas saat cermin
select uji.konteks('ui', 100000002);
select uji.jalan($$update public.tasks set name = 'L1 · diubah saat cermin' where id = 'rtujib0001'$$, 'ui: ubah tugas app diizinkan');
select uji.jalan($$insert into public.comments (task_id, text) values ('rtujib0001', 'komentar app')$$, 'ui: komentar di tugas app diizinkan');
select uji.jalan($$insert into public.tasks (list_id, name) values ('rlujib0001', 'Tugas app baru saat cermin')$$, 'ui: buat tugas app diizinkan');
select uji.jalan($$update public.lists set name = 'Latihan Uji (ganti)' where id = 'rlujib0001'$$, 'ui: ubah list app diizinkan');

-- ---------------------------------------------------------------- impor & sinkron diizinkan
select uji.konteks('impor', 900000000002);
select uji.jalan($$update public.tasks set name = 'P15 · diubah impor', updated_at = '2026-09-28 08:00+07' where id = 'z8r3uj0002'$$,
  'impor: ubah tugas ClickUp diizinkan');
select uji.jalan($$insert into public.comments (id, task_id, author_id, text, created_at, sumber)
                   values ('90189999999999', 'z8r3uj0002', 100000003, 'komentar impor', '2026-09-28 07:00+07', 'clickup')$$,
  'impor: komentar ClickUp baru diizinkan');
select uji.cek((select comment_count = 1 and last_comment_at = '2026-09-28 07:00+07' from public.tasks where id = 'z8r3uj0002'),
  'impor: penghitung komentar kartu ClickUp ikut diperbarui');
select uji.sama((select count(*)::int from public.notifications where comment_id = '90189999999999'), 0,
  'impor: komentar tidak membuat notifikasi');
select uji.konteks('sinkron', 900000000002);
select uji.jalan($$insert into public.task_assignees (task_id, member_id) values ('z8r3uj0002', 100000002)$$,
  'sinkron: tambah assignee kartu ClickUp diizinkan');
select uji.jalan($$update public.lists set name = 'Fase Uji 1 (ganti ClickUp)' where id = '1100340000900101'$$,
  'sinkron: ubah list ClickUp diizinkan');

-- ---------------------------------------------------------------- mode utama: kartu ClickUp bisa diubah dari UI
select uji.mode('utama');
select uji.sama(public.mode_app(), 'utama', 'mode diubah ke utama');
select uji.konteks('ui', 100000002);
select uji.jalan($$update public.tasks set name = 'diubah ui (utama)' where id = 'z8r3uj0002'$$, 'utama: ui ubah tugas ClickUp diizinkan');
select uji.jalan($$insert into public.comments (task_id, text) values ('z8r3uj0002', 'komentar ui (utama)')$$,
  'utama: ui komentar di kartu ClickUp diizinkan');
select uji.jalan($$insert into public.task_assignees (task_id, member_id) values ('z8r3uj0002', 900000000001)$$,
  'utama: ui tambah assignee kartu ClickUp diizinkan');

rollback;
