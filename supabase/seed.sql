-- seed.sql — DATA SINTETIS untuk dev/tes LOKAL (dijalankan `supabase db reset`).
-- Semua nama, email, ID dan isi kartu PALSU. BUKAN data RHJ / pelanggan. Jangan dimuat ke project cloud.
-- Password akun di bawah ('rahasia-dev-123') = dev lokal saja.
--
-- Isi: 1 workspace (dari migrasi), 2 space ("Ruang Uji A" sumber clickup, "Ruang Uji B" sumber app),
-- 2 folder (1 hidden), 5 list (1 folder-less, 1 tidak_ditagih), 26 tugas (open/closed/arsip/subtask/
-- telat/hari ini/≤3hk/tanpa due/BERSYARAT/CADANGAN/dihapus/dibuka ulang), komentar + balasan + mention,
-- lampiran, 5 anggota (1 owner, 3 member, 1 bot). Tanggal due RELATIF terhadap hari ini WIB saat seed.

-- ------------------------------------------------------------ pembantu sesi (hilang saat sesi selesai)
create function pg_temp.due(n integer) returns timestamptz language sql stable as $$
  select ((public.hari_ini_wib() + n)::text || ' 12:00:00+07')::timestamptz   -- 12:00 WIB = gaya clickup.mjs
$$;
create function pg_temp.lalu(hari integer) returns timestamptz language sql stable as $$
  select now() - make_interval(days => hari)
$$;

-- ------------------------------------------------------------ akun Auth lokal (dev lokal saja)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous)
select
  '00000000-0000-0000-0000-000000000000'::uuid, u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('rahasia-dev-123', extensions.gen_salt('bf')),       -- dev lokal saja
  now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nama', u.nama),
  now(), now(), '', '', '', '', '', '', '', '', false, false
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'budi.uji@contoh.test',  'Budi Santoso (uji)'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'citra.uji@contoh.test', 'Citra Lestari (uji)'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'dodi.uji@contoh.test',  'Dodi Pratama (uji)'),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'eka.uji@contoh.test',   'Eka Wulandari (uji)')
) as u(id, email, nama);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.email like '%.uji@contoh.test';

-- ------------------------------------------------------------ anggota (3 bergaya impor ClickUp, 1 baru, 1 bot)
insert into public.members (id, auth_user_id, username, email, clickup_email, nama, initials, color, role) values
  (100000001,    '11111111-1111-4111-8111-111111111111', 'budi santoso',  'budi.uji@contoh.test',  'budi.uji@contoh.test',  'Budi Santoso (uji)',  'BS', '#7b68ee', 'owner'),
  (100000002,    '22222222-2222-4222-8222-222222222222', 'citra lestari', 'citra.uji@contoh.test', 'citra.uji@contoh.test', 'Citra Lestari (uji)', 'CL', '#e5484d', 'member'),
  (100000003,    '33333333-3333-4333-8333-333333333333', 'dodi pratama',  'dodi.uji@contoh.test',  'dodi.uji@contoh.test',  'Dodi Pratama (uji)',  'DP', '#30a46c', 'member'),
  (900000000001, '44444444-4444-4444-8444-444444444444', 'eka wulandari', 'eka.uji@contoh.test',   null,                    'Eka Wulandari (uji)', 'EW', '#f76b15', 'member'),
  (900000000002, null,                                   'claude (agent)', null,                   null,                    'Claude (agent) uji',  'CA', '#8e8c99', 'bot');
-- ID eksplisit di rentang sequence → majukan sequence supaya anggota baru tidak bentrok
select setval('public.members_id_seq', (select max(id) from public.members where id >= 900000000000));

-- ============================================================ BAGIAN 1: data bergaya impor ClickUp
select set_config('app.sumber', 'impor', false);
select set_config('app.actor_id', '900000000002', false);

insert into public.spaces (id, name, private, archived, orderindex, sumber, synced_at) values
  ('1100340000900001', 'Ruang Uji A', false, false, 0, 'clickup', now());

insert into public.folders (id, space_id, name, hidden, archived, orderindex, sumber, synced_at) values
  ('1100340000900011', '1100340000900001', 'Eksekusi Uji', false, false, 0, 'clickup', now()),
  ('1100340000900012', '1100340000900001', 'hidden',       true,  false, 1, 'clickup', now());

insert into public.lists (id, space_id, folder_id, name, orderindex, tidak_ditagih, sumber, synced_at) values
  ('1100340000900101', '1100340000900001', '1100340000900011', 'Fase Uji 1',          0, false, 'clickup', now()),
  ('1100340000900102', '1100340000900001', '1100340000900011', 'Fase Uji 2',          1, false, 'clickup', now()),
  ('1100340000900103', '1100340000900001', '1100340000900011', 'Di luar periode uji', 2, true,  'clickup', now()),
  ('1100340000900104', '1100340000900001', '1100340000900012', 'Follow-up Uji',       0, false, 'clickup', now());

insert into public.list_statuses (list_id, status, type, orderindex, color, clickup_status_id)
select l.id, s.status, s.type, s.ord, s.color, 'sc' || l.id || '_' || s.ord
from public.lists l
cross join (values ('to do', 'open', 0, '#d3d3d3'), ('in progress', 'custom', 1, '#4194f6'),
                   ('complete', 'closed', 9, '#6bc950')) as s(status, type, ord, color)
where l.sumber = 'clickup';
insert into public.list_statuses (list_id, status, type, orderindex, color, clickup_status_id) values
  ('1100340000900102', 'review', 'custom', 2, '#f9d900', 'sc1100340000900102_2r');

insert into public.tasks
  (id, list_id, parent_id, name, markdown, description_plain, desc_unreadable, status, priority,
   due_at, due_has_time, creator_id, created_at, updated_at, closed_at, done_at, archived,
   clickup_url, sumber, synced_at)
values
  -- Fase Uji 1
  ('z8r3uj0001', '1100340000900101', null, 'Y7 · Uji ringkasan kampanye iklan',
   E'Tujuan: ringkasan uji.\n\nCara dicek: SEMI\nSelesai kalau: tautan draf ada di komentar.', null, false,
   'in progress', 2, pg_temp.due(-3), false, 100000001, pg_temp.lalu(20), pg_temp.lalu(1), null, null, false,
   'https://app.clickup.com/t/z8r3uj0001', 'clickup', now()),
  ('z8r3uj0002', '1100340000900101', null, 'P15 · Uji halaman produk contoh', 'Isi contoh.', null, false,
   'to do', 3, pg_temp.due(0), false, 100000001, pg_temp.lalu(15), pg_temp.lalu(3), null, null, false,
   'https://app.clickup.com/t/z8r3uj0002', 'clickup', now()),
  ('z8r3uj0003', '1100340000900101', null, 'FX-PM-Uji', null, null, false,
   'to do', null, pg_temp.due(1), false, 100000001, pg_temp.lalu(10), pg_temp.lalu(10), null, null, false,
   'https://app.clickup.com/t/z8r3uj0003', 'clickup', now()),
  ('z8r3uj0004', '1100340000900101', null, 'A3 · Uji artikel panduan contoh', 'Draf artikel uji.', null, false,
   'to do', 3, pg_temp.due(2), false, 100000001, pg_temp.lalu(9), pg_temp.lalu(2), null, null, false,
   'https://app.clickup.com/t/z8r3uj0004', 'clickup', now()),
  ('z8r3uj0005', '1100340000900101', null, 'D2 · Uji rekap data mingguan', 'Rekap uji.', null, false,
   'complete', 3, pg_temp.due(-1), false, 100000001, pg_temp.lalu(12), pg_temp.lalu(2), pg_temp.lalu(2), pg_temp.lalu(2), false,
   'https://app.clickup.com/t/z8r3uj0005', 'clickup', now()),
  ('z8r3uj0006', '1100340000900101', null, 'Y9 · Uji kartu parkir tanpa due', null, null, false,
   'to do', 4, null, false, 100000001, pg_temp.lalu(30), pg_temp.lalu(8), null, null, false,
   'https://app.clickup.com/t/z8r3uj0006', 'clickup', now()),
  ('z8r3uj0007', '1100340000900101', 'z8r3uj0001', 'Y7a · Uji sub-tugas draf', null, null, false,
   'to do', null, pg_temp.due(3), false, 100000002, pg_temp.lalu(5), pg_temp.lalu(5), null, null, false,
   'https://app.clickup.com/t/z8r3uj0007', 'clickup', now()),
  ('z8r3uj0008', '1100340000900101', null, 'W4 · Uji kartu diarsipkan', null, null, false,
   'complete', null, pg_temp.due(-20), false, 100000001, pg_temp.lalu(40), pg_temp.lalu(18), pg_temp.lalu(19), pg_temp.lalu(19), true,
   'https://app.clickup.com/t/z8r3uj0008', 'clickup', now()),
  ('z8r3uj0009', '1100340000900101', null, 'H2 · Uji BERSYARAT menunggu keputusan', 'MENUNGGU: keputusan pemilik.', null, false,
   'to do', null, pg_temp.due(-2), false, 100000001, pg_temp.lalu(7), pg_temp.lalu(7), null, null, false,
   'https://app.clickup.com/t/z8r3uj0009', 'clickup', now()),
  ('z8r3uj0010', '1100340000900101', null, 'C3 · Uji telat lama', null, null, false,
   'in progress', 1, pg_temp.due(-8), false, 100000001, pg_temp.lalu(25), pg_temp.lalu(9), null, null, false,
   'https://app.clickup.com/t/z8r3uj0010', 'clickup', now()),
  -- Fase Uji 2
  ('z8r3uj0011', '1100340000900102', null, 'P16 · Uji review konten', null, null, false,
   'review', 2, pg_temp.due(1), false, 100000001, pg_temp.lalu(6), pg_temp.lalu(1), null, null, false,
   'https://app.clickup.com/t/z8r3uj0011', 'clickup', now()),
  ('z8r3uj0012', '1100340000900102', null, 'S1 · Uji jadwal sosial', null, null, false,
   'complete', 3, pg_temp.due(-5), false, 100000001, pg_temp.lalu(14), pg_temp.lalu(5), pg_temp.lalu(5), pg_temp.lalu(5), false,
   'https://app.clickup.com/t/z8r3uj0012', 'clickup', now()),
  ('z8r3uj0013', '1100340000900102', null, 'F2 · Uji due dengan jam', null, null, false,
   'to do', null, ((public.hari_ini_wib())::text || ' 15:30:00+07')::timestamptz, true, 100000001, pg_temp.lalu(4), pg_temp.lalu(4), null, null, false,
   'https://app.clickup.com/t/z8r3uj0013', 'clickup', now()),
  ('z8r3uj0014', '1100340000900102', null, 'Y8 · Uji deskripsi tak terbaca', 'Teks polos dari blok sinkron (uji).', 'Teks polos dari blok sinkron (uji).', true,
   'to do', null, pg_temp.due(4), false, 100000001, pg_temp.lalu(3), pg_temp.lalu(3), null, null, false,
   'https://app.clickup.com/t/z8r3uj0014', 'clickup', now()),
  ('z8r3uj0015', '1100340000900102', null, 'A4 · Uji CADANGAN ide', null, null, false,
   'to do', 4, pg_temp.due(2), false, 100000001, pg_temp.lalu(3), pg_temp.lalu(3), null, null, false,
   'https://app.clickup.com/t/z8r3uj0015', 'clickup', now()),
  -- Di luar periode (tidak ditagih)
  ('z8r3uj0016', '1100340000900103', null, 'A9 · Uji di luar periode', null, null, false,
   'to do', null, pg_temp.due(-10), false, 100000001, pg_temp.lalu(60), pg_temp.lalu(30), null, null, false,
   'https://app.clickup.com/t/z8r3uj0016', 'clickup', now()),
  ('z8r3uj0017', '1100340000900103', null, '01 · Uji kontrak contoh', null, null, false,
   'to do', null, pg_temp.due(6), false, 100000001, pg_temp.lalu(50), pg_temp.lalu(50), null, null, false,
   'https://app.clickup.com/t/z8r3uj0017', 'clickup', now()),
  -- Follow-up (folder hidden)
  ('z8r3uj0018', '1100340000900104', null, '[Claude] Citra · follow-up r12 PT Contoh Satu — rak uji', null, null, false,
   'to do', 2, pg_temp.due(0), false, 100000001, pg_temp.lalu(2), pg_temp.lalu(2), null, null, false,
   'https://app.clickup.com/t/z8r3uj0018', 'clickup', now()),
  ('z8r3uj0019', '1100340000900104', null, 'M2 · Uji follow-up ditutup', null, null, false,
   'complete', null, pg_temp.due(-4), false, 100000001, pg_temp.lalu(9), pg_temp.lalu(4), pg_temp.lalu(4), pg_temp.lalu(4), false,
   'https://app.clickup.com/t/z8r3uj0019', 'clickup', now()),
  ('z8r3uj0020', '1100340000900104', null, 'R3 · Uji penawaran contoh', null, null, false,
   'in progress', 3, pg_temp.due(1), false, 100000001, pg_temp.lalu(6), pg_temp.lalu(1), null, null, false,
   'https://app.clickup.com/t/z8r3uj0020', 'clickup', now());

insert into public.task_assignees (task_id, member_id, added_at) values
  ('z8r3uj0001', 100000002, pg_temp.lalu(20)), ('z8r3uj0001', 100000003, pg_temp.lalu(10)),
  ('z8r3uj0002', 100000003, pg_temp.lalu(15)),
  ('z8r3uj0003', 100000002, pg_temp.lalu(10)),
  ('z8r3uj0004', 100000003, pg_temp.lalu(9)),
  ('z8r3uj0005', 100000002, pg_temp.lalu(12)),
  ('z8r3uj0006', 100000002, pg_temp.lalu(30)),
  ('z8r3uj0007', 100000002, pg_temp.lalu(5)),
  ('z8r3uj0008', 100000003, pg_temp.lalu(40)),
  ('z8r3uj0009', 100000001, pg_temp.lalu(7)),
  ('z8r3uj0010', 100000003, pg_temp.lalu(25)),
  ('z8r3uj0011', 100000002, pg_temp.lalu(6)), ('z8r3uj0011', 100000003, pg_temp.lalu(6)),
  ('z8r3uj0012', 100000002, pg_temp.lalu(14)),
  ('z8r3uj0013', 100000003, pg_temp.lalu(4)),
  ('z8r3uj0014', 100000002, pg_temp.lalu(3)),
  ('z8r3uj0015', 100000003, pg_temp.lalu(3)),
  ('z8r3uj0016', 100000003, pg_temp.lalu(60)),
  ('z8r3uj0017', 100000003, pg_temp.lalu(50)),
  ('z8r3uj0018', 100000002, pg_temp.lalu(2)),
  ('z8r3uj0019', 100000002, pg_temp.lalu(9)),
  ('z8r3uj0020', 100000002, pg_temp.lalu(6));

-- komentar impor (ID numerik bergaya ClickUp, palsu); balasan menunjuk komentar top-level
insert into public.comments (id, task_id, parent_id, author_id, text, body_json, created_at, sumber, synced_at) values
  ('90180000000001', 'z8r3uj0001', null, 100000002,
   'Draf pertama sudah ada di https://contoh.test/draf-uji',
   '[{"text":"Draf pertama sudah ada di https://contoh.test/draf-uji"}]', pg_temp.lalu(2), 'clickup', now()),
  ('90180000000002', 'z8r3uj0001', '90180000000001', 100000001,
   '@citra lestari tolong cek angka di halaman 2',
   '[{"type":"tag","user":{"id":100000002,"username":"citra lestari","email":"citra.uji@contoh.test","color":"#e5484d","initials":"CL"}},{"text":" tolong cek angka di halaman 2"}]',
   pg_temp.lalu(1), 'clickup', now()),
  ('90180000000003', 'z8r3uj0001', null, 100000003,
   'Bagian kedua menyusul besok.', '[{"text":"Bagian kedua menyusul besok."}]', pg_temp.lalu(1), 'clickup', now()),
  ('90180000000004', 'z8r3uj0005', null, 100000002,
   'Selesai, rekap ada di lampiran.', '[{"text":"Selesai, rekap ada di lampiran."}]', pg_temp.lalu(2), 'clickup', now()),
  ('90180000000005', 'z8r3uj0010', null, 100000001,
   'Ditahan dulu sampai data masuk.', '[{"text":"Ditahan dulu sampai data masuk."}]', pg_temp.lalu(9), 'clickup', now()),
  ('90180000000006', 'z8r3uj0018', null, 100000002,
   'Sudah dihubungi, menunggu balasan.', '[{"text":"Sudah dihubungi, menunggu balasan."}]', pg_temp.lalu(1), 'clickup', now());

insert into public.comment_mentions (comment_id, member_id) values ('90180000000002', 100000002);

insert into public.attachments
  (id, task_id, comment_id, title, extension, mimetype, size, storage_path, clickup_url, status_salin,
   uploaded_by, created_at, sumber, synced_at)
values
  ('cu-lampiran-uji-0001', 'z8r3uj0005', null, 'rekap-uji.csv', 'csv', 'text/csv', 2048, null,
   'https://contoh.test/lampiran/rekap-uji.csv', 'tautan_saja', 100000002, pg_temp.lalu(2), 'clickup', now()),
  ('cu-lampiran-uji-0002', 'z8r3uj0001', '90180000000001', 'draf-uji.pdf', 'pdf', 'application/pdf', 51200, null,
   'https://contoh.test/lampiran/draf-uji.pdf', 'gagal', 100000002, pg_temp.lalu(2), 'clickup', now());

-- ============================================================ BAGIAN 2: data buatan app (lewat jalur UI)
select set_config('app.sumber', 'ui', false);
select set_config('app.actor_id', '100000001', false);           -- Budi (owner)

insert into public.spaces (id, name, orderindex) values ('rsujib0001', 'Ruang Uji B', 1);
-- list tanpa folder; status default (to do / in progress / complete) diisi trigger
insert into public.lists (id, space_id, folder_id, name, orderindex) values
  ('rlujib0001', 'rsujib0001', null, 'Latihan Uji', 0);

insert into public.tasks (id, list_id, parent_id, name, markdown, priority, due_at) values
  ('rtujib0001', 'rlujib0001', null, 'L1 · Latihan tugas baru',
   E'Contoh deskripsi **markdown**.\n\nSelesai kalau: ada tautan hasil.', 3, pg_temp.due(1)),
  ('rtujib0002', 'rlujib0001', null, 'L2 · Latihan ditutup lalu dibuka ulang', null, null, pg_temp.due(2)),
  ('rtujib0003', 'rlujib0001', null, 'L3 · Latihan selesai dengan bukti', null, 2, pg_temp.due(0)),
  ('rtujib0004', 'rlujib0001', null, 'L4 · Latihan terhapus', null, null, pg_temp.due(5)),
  ('rtujib0006', 'rlujib0001', null, 'L6 · Latihan tanpa due', null, 4, null);
insert into public.tasks (id, list_id, parent_id, name, due_at) values
  ('rtujib0005', 'rlujib0001', 'rtujib0001', 'L5 · Latihan sub-tugas', pg_temp.due(3));

insert into public.task_assignees (task_id, member_id) values
  ('rtujib0001', 900000000001), ('rtujib0001', 100000003),
  ('rtujib0002', 900000000001),
  ('rtujib0003', 900000000001),
  ('rtujib0004', 100000002),
  ('rtujib0005', 900000000001),
  ('rtujib0006', 100000001);

-- Budi berkomentar + mention Eka → notifikasi mention (Eka) & komentar (Dodi)
insert into public.comments (id, task_id, text, body_json) values
  ('rcujib000001', 'rtujib0001', '@eka wulandari tolong mulai dari bagian pertama',
   '[{"type":"tag","user":{"id":900000000001,"username":"eka wulandari"}},{"text":" tolong mulai dari bagian pertama"}]');
insert into public.comment_mentions (comment_id, member_id) values ('rcujib000001', 900000000001);

-- Eka membalas → notifikasi ke Budi (pembuat & pengomentar) dan Dodi (assignee)
select set_config('app.actor_id', '900000000001', false);
insert into public.comments (id, task_id, parent_id, text, body_json) values
  ('rcujib000002', 'rtujib0001', 'rcujib000001', 'Siap, mulai hari ini.', '[{"text":"Siap, mulai hari ini."}]');

-- Eka memberi bukti lalu menutup L3 → snapshot berisi komentar_terakhir & ada_url
insert into public.comments (id, task_id, text, body_json) values
  ('rcujib000003', 'rtujib0003', 'Sudah selesai, hasil: https://contoh.test/hasil-uji',
   '[{"text":"Sudah selesai, hasil: https://contoh.test/hasil-uji"}]');
insert into public.attachments (id, task_id, comment_id, title, extension, mimetype, size, storage_path, status_salin) values
  ('6f1c2e8a-0000-4000-8000-000000000001', 'rtujib0003', 'rcujib000003', 'bukti-uji.png', 'png', 'image/png', 34567,
   't/rtujib0003/6f1c2e8a-0000-4000-8000-000000000001-bukti-uji.png', 'ok');
update public.tasks set status = 'complete' where id = 'rtujib0003';

-- L2 ditutup lalu dibuka ulang (reopen_count = 1)
update public.tasks set status = 'complete' where id = 'rtujib0002';
update public.tasks set status = 'to do'    where id = 'rtujib0002';

-- Budi (owner) menghapus lunak L4
select set_config('app.actor_id', '100000001', false);
update public.tasks set deleted_at = now() where id = 'rtujib0004';

-- Contoh riwayat sinkron (angka palsu)
insert into public.sync_runs (mode, started_at, finished_at, counts, census, diffs, errors) values
  ('uji', now() - interval '1 hour', now() - interval '55 minutes',
   '{"tasks":{"inserted":20,"updated":0,"unchanged":0}}', '{"lists":5}', '[]', '[]');

-- Kategori pekerjaan (28 Okt 2026): contoh pengelompokan Jelajah. Trigger riwayat dimatikan sebentar supaya seed
-- tidak menambah baris activity (tes riwayat lain tetap sama). ALTER butuh antrean trigger tertunda kosong.
set constraints all immediate;
alter table public.tasks disable trigger tasks_kategori_sesudah;
update public.tasks t set kategori_id = k.id
  from (values ('z8r3uj0001', 'Ads'), ('z8r3uj0005', 'Ads'), ('z8r3uj0006', 'Ads'),
               ('z8r3uj0002', 'SEO'), ('z8r3uj0004', 'SEO'), ('z8r3uj0010', 'SEO'),
               ('rtujib0001', 'Konten')) as v(id, nama)
  join public.kategori_kerja k on k.nama = v.nama
 where t.id = v.id;
alter table public.tasks enable trigger tasks_kategori_sesudah;

-- bersihkan konteks sesi
select set_config('app.sumber', '', false);
select set_config('app.actor_id', '', false);
