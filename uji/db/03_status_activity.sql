-- 03 · Status tutup/buka ulang, snapshot, activity per field, updated_at/versi, impor/sinkron.
begin;
\ir _bantu.sql

create function uji.n_act(p_task text, p_jenis text) returns int language sql as $$
  select count(*)::int from public.activity where task_id = p_task and jenis = p_jenis
$$;
create function uji.akt(p_task text, p_jenis text) returns public.activity language sql as $$
  select a from public.activity a where a.task_id = p_task and a.jenis = p_jenis order by a.id desc limit 1
$$;

-- ================================================================ A. jalur UI: buat → tutup → buka ulang
select uji.konteks('ui', 100000002);                                  -- Citra
insert into public.tasks (id, list_id, name, due_at) values
  ('rtstat0001', 'rlujib0001', 'Uji status', '2026-10-01 12:00:00+07');
select uji.cek((select status = 'to do' and status_type = 'open' and creator_id = 100000002
                   and created_at = now() and updated_at = now() and versi = 1 and closed_at is null
                   and first_closed_at is null and reopen_count = 0
                from public.tasks where id = 'rtstat0001'),
  'buat (ui): status default, creator = aktor, created_at/updated_at = now(), versi 1');
select uji.cek((select sumber = 'ui' and actor_id = 100000002 and lengkap and ke->>'name' = 'Uji status'
                from uji.akt('rtstat0001', 'dibuat')), 'activity dibuat (ui, aktor Citra, lengkap)');

insert into public.task_assignees (task_id, member_id) values ('rtstat0001', 100000002);
select uji.cek((select aktor_assignee and ke->>'username' = 'citra lestari'
                from uji.akt('rtstat0001', 'assignee_tambah')), 'assignee_tambah + aktor_assignee = true');

insert into public.comments (id, task_id, text) values ('rcstat00001', 'rtstat0001', 'Hasil: https://contoh.test/hasil');
select uji.konteks('ui', 100000003);                                  -- Dodi membalas
insert into public.comments (id, task_id, parent_id, text) values ('rcstat00002', 'rtstat0001', 'rcstat00001', 'Oke, sudah saya cek angkanya.');
select uji.konteks('ui', 100000002);
insert into public.attachments (task_id, title, mimetype, size, storage_path)
  values ('rtstat0001', 'bukti.png', 'image/png', 1000, 't/rtstat0001/bukti.png');

-- tutup (nama status beda huruf besar → dinormalkan)
update public.tasks set status = 'Complete' where id = 'rtstat0001';
select uji.cek((select status = 'complete' and status_type = 'closed' and closed_at = now() and done_at = now()
                   and first_closed_at = now() and reopen_count = 0
                from public.tasks where id = 'rtstat0001'),
  'tutup: status dinormalkan, closed_at/done_at/first_closed_at terisi');
select uji.cek((select dari = '{"status":"to do","type":"open"}'::jsonb and ke = '{"status":"complete","type":"closed"}'::jsonb
                   and actor_id = 100000002 and aktor_assignee and sumber = 'ui'
                from uji.akt('rtstat0001', 'status')), 'activity status: dari/ke, aktor, aktor_assignee');
select uji.cek((select snapshot ?& array['komentar','balasan','lampiran','ada_url','komentar_terakhir']
                from uji.akt('rtstat0001', 'status')), 'snapshot berisi kunci kontrak');
select uji.cek((select (snapshot->>'komentar')::int = 1 and (snapshot->>'balasan')::int = 1
                   and (snapshot->>'lampiran')::int = 1 and (snapshot->>'ada_url')::boolean
                   and snapshot #>> '{komentar_terakhir,user}' = 'dodi pratama'
                   and snapshot #>> '{komentar_terakhir,teks200}' = 'Oke, sudah saya cek angkanya.'
                   and snapshot #>> '{komentar_terakhir,date}' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
                from uji.akt('rtstat0001', 'status')), 'snapshot: 1 komentar, 1 balasan, 1 lampiran, ada URL, komentar terakhir');
select uji.sama((select versi from public.tasks where id = 'rtstat0001'), 2,
  'versi naik 1 saat status berubah (assignee di tugas yang dibuat di transaksi yang sama tidak menyentuh versi)');

-- buka ulang
update public.tasks set status = 'to do' where id = 'rtstat0001';
select uji.cek((select closed_at is null and done_at is null and reopen_count = 1 and first_closed_at = now()
                from public.tasks where id = 'rtstat0001'),
  'buka ulang: closed_at/done_at dikosongkan, reopen_count 1, first_closed_at tetap');
select uji.cek((select dari->>'type' = 'closed' and ke->>'status' = 'to do' and snapshot is null
                from uji.akt('rtstat0001', 'buka_ulang')), 'activity buka_ulang (tanpa snapshot)');
select uji.galat($$update public.tasks set status = 'selesai' where id = 'rtstat0001'$$, 'PT400',
  'status tak dikenal di list ditolak', 'tidak ada di list', 'INPUT_001');

-- ================================================================ B. impor: tanggal ClickUp dipertahankan
select uji.konteks('impor', 900000000002);
insert into public.tasks (id, list_id, name, status, creator_id, created_at, updated_at, closed_at, done_at, sumber, synced_at)
values ('z8r3stat01', '1100340000900101', 'Uji impor selesai', 'complete', 100000001,
        '2026-08-20 09:00:00+07', '2026-09-01 10:00:00+07', '2026-09-01 10:00:00+07', '2026-09-01 10:00:00+07',
        'clickup', '2026-09-27 05:45:00+07');
select uji.cek((select clickup_id = 'z8r3stat01' and updated_at = '2026-09-01 10:00:00+07'
                   and created_at = '2026-08-20 09:00:00+07' and closed_at = '2026-09-01 10:00:00+07'
                   and first_closed_at = '2026-09-01 10:00:00+07'
                from public.tasks where id = 'z8r3stat01'),
  'impor: created/updated/closed verbatim, clickup_id otomatis, first_closed_at = closed_at');
select uji.cek((select at = '2026-08-20 09:00:00+07' and actor_id = 100000001 and not lengkap and sumber = 'impor'
                from uji.akt('z8r3stat01', 'dibuat')), 'impor: activity dibuat (aktor = creator, lengkap=false, at = created_at)');
select uji.cek((select at = '2026-09-01 10:00:00+07' and actor_id is null and not lengkap
                from uji.akt('z8r3stat01', 'ditutup_impor')), 'impor: activity ditutup_impor (aktor null, at = closed_at)');

-- mode utama → UI boleh buka ulang & tutup lagi; first_closed_at tetap tanggal ClickUp
select uji.mode('utama');
select uji.konteks('ui', 100000001);
update public.tasks set status = 'to do' where id = 'z8r3stat01';
update public.tasks set status = 'complete' where id = 'z8r3stat01';
select uji.cek((select first_closed_at = '2026-09-01 10:00:00+07' and closed_at = now() and reopen_count = 1
                   and updated_at = now() and versi = 3
                from public.tasks where id = 'z8r3stat01'),
  'tutup ulang: first_closed_at tetap yang pertama, closed_at baru, updated_at = now(), versi 3');
select uji.mode('cermin');

-- ================================================================ C. impor/sinkron atas baris yang sudah ada
select uji.konteks('sinkron', 900000000002);
select set_config('app.at_awal', '2026-09-28 05:45:00+07', true);
update public.tasks set name = 'P15 · Uji halaman produk (diubah di ClickUp)',
                        updated_at = '2026-09-28 08:00:00+07', synced_at = now()
 where id = 'z8r3uj0002';
select uji.cek((select updated_at = '2026-09-28 08:00:00+07' and versi = 2 from public.tasks where id = 'z8r3uj0002'),
  'sinkron: updated_at = nilai ClickUp (bukan now()), versi naik');
select uji.cek((select sumber = 'sinkron' and not lengkap and actor_id is null and at_awal = '2026-09-28 05:45:00+07'
                   and ke = to_jsonb('P15 · Uji halaman produk (diubah di ClickUp)'::text)
                from uji.akt('z8r3uj0002', 'nama')), 'sinkron: activity nama (lengkap=false, aktor null, at_awal)');

update public.tasks set updated_at = '2026-09-28 09:00:00+07' where id = 'z8r3uj0002';
select uji.cek((select updated_at = '2026-09-28 09:00:00+07' and versi = 2 from public.tasks where id = 'z8r3uj0002'),
  'sinkron: hanya date_updated berubah → updated_at ikut, versi tetap');

update public.tasks set status = 'complete', closed_at = '2026-09-28 09:30:00+07', done_at = '2026-09-28 09:30:00+07'
 where id = 'z8r3uj0002';
select uji.cek((select at = '2026-09-28 09:30:00+07' and sumber = 'sinkron' and snapshot is not null
                from uji.akt('z8r3uj0002', 'status')), 'sinkron: tutup tercatat pada jam date_closed ClickUp + snapshot');
select uji.cek((select closed_at = '2026-09-28 09:30:00+07' and first_closed_at = '2026-09-28 09:30:00+07'
                from public.tasks where id = 'z8r3uj0002'), 'sinkron: closed_at verbatim, first_closed_at terisi');

update public.tasks set deleted_at = now() where id = 'z8r3uj0003';
select uji.sama(uji.n_act('z8r3uj0003', 'hilang_di_clickup'), 1, 'sinkron: hapus lunak → activity hilang_di_clickup');

insert into public.task_assignees (task_id, member_id) values ('z8r3uj0004', 100000002);
select uji.cek((select sumber = 'sinkron' and not lengkap from uji.akt('z8r3uj0004', 'assignee_tambah')),
  'sinkron: assignee_tambah tercatat (lengkap=false)');
select uji.sama((select count(*)::int from public.notifications where task_id = 'z8r3uj0004'), 0,
  'sinkron: tidak membuat notifikasi');

select uji.konteks('impor', 900000000002);
insert into public.task_assignees (task_id, member_id) values ('z8r3uj0006', 100000003);
select uji.sama(uji.n_act('z8r3uj0006', 'assignee_tambah'), 0, 'impor awal: assignee tidak dicatat sebagai kejadian');

-- ================================================================ D. updated_at, versi, penghitung komentar
select uji.konteks('ui', 100000001);
create temp table sebelum as select updated_at, versi, comment_count from public.tasks where id = 'rtujib0006';
grant select on sebelum to public;

insert into public.comments (id, task_id, text) values ('rcstat00003', 'rtujib0006', 'Komentar tidak menaikkan updated_at');
select uji.cek((select t.updated_at = s.updated_at and t.versi = s.versi and t.comment_count = s.comment_count + 1
                   and t.last_comment_at = now()
                from public.tasks t, sebelum s where t.id = 'rtujib0006'),
  'komentar baru: updated_at & versi tetap, comment_count +1, last_comment_at = waktu komentar');

update public.tasks set orderindex = 12345 where id = 'rtujib0006';
select uji.cek((select t.updated_at = s.updated_at and t.versi = s.versi from public.tasks t, sebelum s where t.id = 'rtujib0006'),
  'ubah orderindex saja: updated_at & versi tetap');

insert into public.task_assignees (task_id, member_id) values ('rtujib0006', 100000003);
select uji.cek((select t.updated_at = now() and t.versi = s.versi + 1 from public.tasks t, sebelum s where t.id = 'rtujib0006'),
  'tambah assignee (ui): updated_at = now(), versi +1');

update public.comments set text = 'Komentar sudah diedit' where id = 'rcstat00003';
select uji.cek((select c.edited_at = now() from public.comments c where c.id = 'rcstat00003'), 'edit komentar: edited_at = now()');
select uji.cek((select dari->>'teks' = 'Komentar tidak menaikkan updated_at' and ke->>'teks' = 'Komentar sudah diedit'
                from uji.akt('rtujib0006', 'komentar_edit')), 'activity komentar_edit menyimpan teks lama & baru');

update public.comments set deleted_at = now() where id = 'rcstat00003';
select uji.cek((select c.deleted_by = 100000001 from public.comments c where c.id = 'rcstat00003'), 'hapus komentar: deleted_by = aktor');
select uji.cek((select t.comment_count = s.comment_count from public.tasks t, sebelum s where t.id = 'rtujib0006'),
  'hapus komentar: comment_count kembali');
select uji.sama(uji.n_act('rtujib0006', 'komentar_hapus'), 1, 'activity komentar_hapus');

-- ================================================================ E. activity per field (UI)
insert into public.lists (id, space_id, name) values ('rlstat0002', 'rsujib0001', 'List status uji 2');
update public.tasks set due_at = '2026-10-02 12:00:00+07' where id = 'rtstat0001';
select uji.cek((select dari->>'wib' = '2026-10-01' and ke->>'wib' = '2026-10-02' and ke->>'has_time' = 'false'
                from uji.akt('rtstat0001', 'due')), 'activity due (dari/ke tanggal WIB)');
update public.tasks set start_at = '2026-09-30 08:00:00+07', start_has_time = true where id = 'rtstat0001';
select uji.sama(uji.n_act('rtstat0001', 'mulai'), 1, 'activity mulai');
update public.tasks set name = 'Uji status (ganti nama)' where id = 'rtstat0001';
select uji.cek((select dari = to_jsonb('Uji status'::text) from uji.akt('rtstat0001', 'nama')), 'activity nama');
update public.tasks set markdown = 'Deskripsi baru' where id = 'rtstat0001';
select uji.cek((select dari is null and ke = to_jsonb('Deskripsi baru'::text) from uji.akt('rtstat0001', 'deskripsi')),
  'activity deskripsi (dari/ke teks)');
update public.tasks set priority = 1 where id = 'rtstat0001';
select uji.cek((select dari is null and ke = '1'::jsonb from uji.akt('rtstat0001', 'prioritas')), 'activity prioritas');
update public.tasks set list_id = 'rlstat0002' where id = 'rtstat0001';
select uji.cek((select dari->>'name' = 'Latihan Uji' and ke->>'id' = 'rlstat0002' from uji.akt('rtstat0001', 'pindah_list')),
  'activity pindah_list');
update public.tasks set parent_id = 'rtujib0001' where id = 'rtstat0001';
select uji.sama(uji.n_act('rtstat0001', 'induk'), 1, 'activity induk (ganti parent)');
update public.tasks set archived = true where id = 'rtstat0001';
select uji.cek((select archived_at = now() from public.tasks where id = 'rtstat0001') and uji.n_act('rtstat0001', 'arsip') = 1,
  'arsip: archived_at terisi + activity arsip');
update public.tasks set archived = false where id = 'rtstat0001';
select uji.cek((select archived_at is null from public.tasks where id = 'rtstat0001') and uji.n_act('rtstat0001', 'pulih_arsip') = 1,
  'pulih arsip: archived_at kosong + activity pulih_arsip');
update public.tasks set deleted_at = now() where id = 'rtstat0001';
select uji.cek((select deleted_by = 100000001 from public.tasks where id = 'rtstat0001') and uji.n_act('rtstat0001', 'hapus') = 1,
  'hapus lunak: deleted_by = aktor + activity hapus');
update public.tasks set deleted_at = null where id = 'rtstat0001';
select uji.cek((select deleted_by is null from public.tasks where id = 'rtstat0001') and uji.n_act('rtstat0001', 'pulih') = 1,
  'pulihkan: deleted_by kosong + activity pulih');

create temp table jml as select count(*) as n, (select versi from public.tasks where id = 'rtstat0001') as v
  from public.activity where task_id = 'rtstat0001';
update public.tasks set name = name, priority = priority where id = 'rtstat0001';
select uji.cek((select count(*) from public.activity where task_id = 'rtstat0001') = (select n from jml)
           and (select versi from public.tasks where id = 'rtstat0001') = (select v from jml),
  'update tanpa perubahan: tidak ada activity, versi tetap');

-- ================================================================ F. tipe status list berubah → status_type tugas ikut
update public.tasks set status = 'in progress' where id = 'rtstat0001';
update public.list_statuses set type = 'done' where list_id = 'rlstat0002' and status = 'in progress';
select uji.cek((select status_type = 'done' and closed_at = now() from public.tasks where id = 'rtstat0001'),
  'tipe status diubah jadi done → status_type tugas ikut + closed_at terisi');
update public.list_statuses set type = 'custom' where list_id = 'rlstat0002' and status = 'in progress';

-- ganti NAMA status (FK on update cascade) → tugas ikut, tanpa activity status palsu
create temp table jml_status as select uji.n_act('rtstat0001', 'status') + uji.n_act('rtstat0001', 'buka_ulang') as n;
update public.list_statuses set status = 'dikerjakan' where list_id = 'rlstat0002' and status = 'in progress';
select uji.cek((select status = 'dikerjakan' from public.tasks where id = 'rtstat0001')
           and uji.n_act('rtstat0001', 'status') + uji.n_act('rtstat0001', 'buka_ulang') = (select n from jml_status),
  'ganti nama status: tugas ikut, tidak dicatat sebagai perpindahan status');

-- ================================================================ G. kolom yang dikunci
select uji.galat($$update public.tasks set sumber = 'clickup' where id = 'rtujib0006'$$, 'PT409',
  'mode cermin: ui tidak bisa menjadikan tugas app bersumber clickup');
select uji.galat($$update public.tasks set clickup_id = 'palsu123' where id = 'rtujib0006'$$, 'PT400',
  'ui tidak bisa mengubah clickup_id');
select uji.mode('utama');
select uji.galat($$update public.tasks set sumber = 'clickup' where id = 'rtujib0006'$$, 'PT400',
  'mode utama: ui tetap tidak bisa mengubah sumber tugas');
select uji.mode('cermin');
select uji.galat($$update public.tasks set id = 'rtganti001' where id = 'rtujib0006'$$, 'PT400', 'ID tugas tidak bisa diubah');
update public.tasks set created_at = '2020-01-01', closed_at = '2020-01-01', reopen_count = 99, versi = 99,
                        status_type = 'closed', comment_count = comment_count where id = 'rtujib0005';
select uji.cek((select created_at <> '2020-01-01' and closed_at is null and reopen_count = 0 and versi = 1 and status_type = 'open'
                from public.tasks where id = 'rtujib0005'),
  'ui tidak bisa menimpa kolom turunan (created_at, closed_at, reopen_count, versi, status_type)');

-- ================================================================ H. purge: riwayat tetap ada
insert into public.tasks (id, list_id, name) values ('rtstat0003', 'rlujib0001', 'Akan di-purge');
insert into public.comments (task_id, text) values ('rtstat0003', 'komentar yang ikut terhapus');
delete from public.tasks where id = 'rtstat0003';
select uji.cek(not exists (select 1 from public.tasks where id = 'rtstat0003')
           and not exists (select 1 from public.comments where task_id = 'rtstat0003'),
  'purge: tugas & komentar terhapus (cascade)');
select uji.cek((select catatan = 'purge permanen' and dari->>'name' = 'Akan di-purge' from uji.akt('rtstat0003', 'hapus'))
           and uji.n_act('rtstat0003', 'dibuat') = 1,
  'purge: activity dibuat & hapus(purge) tetap tersimpan');

rollback;
