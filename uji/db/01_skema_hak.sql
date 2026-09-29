-- 01 · Skema, hak akses dasar, data awal, bucket Storage, ID & constraint.
begin;
\ir _bantu.sql

-- ---------------------------------------------------------------- tabel & RLS
select uji.sama(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname = any (array['workspace','members','spaces','folders','lists','list_statuses','tasks',
        'task_assignees','comments','comment_mentions','attachments','activity','notifications','api_tokens',
        'hari_libur','app_settings','sync_runs','sync_raw','idem'])),
  19, '19 tabel kontrak §2 ada');

select uji.cek(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  'RLS ON di semua tabel public');

select uji.cek(not exists (
  select 1 from pg_policies p
   where p.schemaname = 'public' and p.cmd <> 'SELECT'),
  'tidak ada policy INSERT/UPDATE/DELETE di public (tulis hanya lewat fungsi)');

-- ---------------------------------------------------------------- grant
select uji.cek(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')
     and has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  'anon tidak punya hak apa pun pada tabel/view public');

select uji.cek(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
          or has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'))),
  'anon/authenticated tidak punya hak sequence');

select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'anon tidak bisa EXECUTE fungsi public mana pun');

select uji.cek(not exists (
  select 1 from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
          or has_table_privilege('service_role', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'))),
  'authenticated & service_role tanpa hak tulis langsung ke tabel');

select uji.cek(not has_table_privilege('authenticated', 'public.idem', 'SELECT'), 'idem tertutup untuk authenticated');
select uji.cek(not has_column_privilege('authenticated', 'public.api_tokens', 'token_hash', 'SELECT'),
  'api_tokens.token_hash tidak bisa di-SELECT authenticated');
select uji.cek(has_column_privilege('authenticated', 'public.api_tokens', 'prefix', 'SELECT'),
  'metadata api_tokens terbuka per kolom (dibatasi policy owner)');

select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(api|x|impor)_'
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'fungsi api_/x_/impor_ (bila ada) tidak bisa dipanggil authenticated/anon');

select uji.cek(not has_function_privilege('authenticated',
  'public.catat_activity(text,text,jsonb,jsonb,jsonb,timestamptz,text,bigint,timestamptz,boolean)', 'EXECUTE'),
  'catat_activity internal (tidak bisa dipanggil klien)');
select uji.cek(not has_function_privilege('authenticated', 'public.lempar(text,text,text)', 'EXECUTE'),
  'lempar internal');
select uji.cek(has_function_privilege('authenticated', 'public.is_member()', 'EXECUTE')
           and has_function_privilege('authenticated', 'public.hari_kerja(date,date)', 'EXECUTE'),
  'pembantu RLS/hitung bisa dipanggil authenticated');

select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not (coalesce(p.proconfig, '{}') @> array['search_path=""'])),
  'semua SECURITY DEFINER memakai search_path = ''''');

-- ---------------------------------------------------------------- data awal
select uji.sama((select name from public.workspace where id = '1100340000004525'),
  'Roda Hammerindo Workspace', 'workspace default');
select uji.sama((select value from public.app_settings where key = 'mode'), '"cermin"'::jsonb, 'mode default cermin');
select uji.sama((select value #>> '{}' from public.app_settings where key = 'app_base_url'),
  'https://tugas.palletmeshindonesia.com', 'app_base_url default');
select uji.galat($$update public.app_settings set value = '"campur"' where key = 'mode'$$, '23514',
  'mode hanya cermin/utama');

-- ---------------------------------------------------------------- Storage
select uji.cek((select not public from storage.buckets where id = 'lampiran'), 'bucket lampiran private');
select uji.sama((select file_size_limit from storage.buckets where id = 'lampiran'), 26214400::bigint,
  'bucket lampiran 25 MB');
select uji.cek((select allowed_mime_types @> array['image/png','image/jpeg','image/webp','image/gif','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain']
    from storage.buckets where id = 'lampiran'), 'allowlist MIME lengkap');
select uji.cek((select not (allowed_mime_types && array['image/svg+xml','text/html'])
    from storage.buckets where id = 'lampiran'), 'SVG/HTML tidak di allowlist');
select uji.sama((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'lampiran:%'), 2, '2 policy Storage lampiran (baca, unggah)');
select uji.sama(public.lampiran_task_dari_path('t/rt12345678/abc.png'), 'rt12345678', 'task_id dari path');
select uji.cek(public.lampiran_task_dari_path('t/../x.png') is null and public.lampiran_task_dari_path('x/rt1/a.png') is null,
  'path aneh ditolak');

-- ---------------------------------------------------------------- ID
select uji.cek(public.id_baru('rt', 8) ~ '^rt[0-9a-z]{8}$', 'id_baru(rt,8) berpola rt + 8 base36');
select uji.cek(public.id_baru('rc', 10) ~ '^rc[0-9a-z]{10}$', 'id_baru(rc,10) berpola rc + 10 base36');
select uji.sama((select count(distinct public.id_baru('rt', 8))::int from generate_series(1, 500)), 500,
  '500 id_baru unik');
select uji.galat($$select public.id_baru('x', 0)$$, 'PT400', 'id_baru menolak panjang 0');

select uji.konteks('ui', 100000001);
insert into public.members (username, nama, role) values ('anggota baru uji', 'Anggota Baru', 'member');
select uji.cek((select id >= 900000000000 from public.members where username = 'anggota baru uji'),
  'member baru dapat id dari sequence >= 900000000000');

insert into public.lists (space_id, name) values ('rsujib0001', 'List baru uji');
select uji.cek((select id ~ '^rl[0-9a-z]{8}$' from public.lists where name = 'List baru uji'), 'list baru id rl + 8');
select uji.sama(
  (select string_agg(s.status || ':' || s.type, ',' order by s.orderindex) from public.list_statuses s
     join public.lists l on l.id = s.list_id where l.name = 'List baru uji'),
  'to do:open,in progress:custom,complete:closed', 'list app baru otomatis dapat status default');
select uji.cek((select public.status_list_valid(id) from public.lists where name = 'List baru uji'),
  'status_list_valid: list default sah');

insert into public.tasks (list_id, name) select id, 'Tugas id otomatis' from public.lists where name = 'List baru uji';
select uji.cek((select id ~ '^rt[0-9a-z]{8}$' and status = 'to do' and status_type = 'open'
    from public.tasks where name = 'Tugas id otomatis'),
  'tugas baru: id rt + 8, status default = status open pertama');

select uji.galat($$insert into public.tasks (id, list_id, name) values ('z8r3palsu1', 'rlujib0001', 'x')$$,
  '23514', 'tugas sumber app tidak boleh ber-ID gaya ClickUp');

select uji.konteks('impor', 900000000002);
insert into public.lists (id, space_id, folder_id, name, sumber)
  values ('1100340000999901', '1100340000900001', null, 'List impor tanpa status', 'clickup');
select uji.sama((select count(*)::int from public.list_statuses where list_id = '1100340000999901'), 0,
  'list impor tidak diberi status default');

-- komentar: balasan hanya ke top-level di tugas yang sama
select uji.konteks('ui', 100000001);
select uji.galat($$insert into public.comments (task_id, parent_id, text) values ('rtujib0001', 'rcujib000002', 'balas ke balasan')$$,
  'PT400', 'balasan ke balasan ditolak', 'top-level');
select uji.galat($$insert into public.comments (task_id, parent_id, text) values ('rtujib0002', 'rcujib000001', 'induk beda tugas')$$,
  'PT400', 'induk komentar dari tugas lain ditolak');

rollback;
