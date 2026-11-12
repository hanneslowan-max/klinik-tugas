-- 20 · Notifikasi "Dari tim" / "Dari agent" (revisi #2, migrasi 20261013160000_notif_pisah_agent).
-- Aturan (notif_dari_agent): agent = pemicu lewat token API (notifications.sumber = 'api') ATAU aktor role 'bot';
-- selain itu tim. web_notif/web_notif_baca menerima p_dari opsional; bentuk lama (tanpa p_dari) tetap sama.
-- Penerima uji = Dodi (notifikasi seed Dodi dihapus dulu di transaksi ini supaya hitungan pasti; di-rollback).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

create function uji.dodi() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
-- id item (urut seperti hasil) dan nilai 'dari' unik di hasil web_notif
create function uji.ids_notif(j jsonb) returns bigint[] language sql immutable as $$
  select coalesce(array_agg((i ->> 'id')::bigint order by o), '{}') from jsonb_array_elements(j -> 'items') with ordinality x(i, o)
$$;
create function uji.dari_notif(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct i ->> 'dari'), '{}') from jsonb_array_elements(j -> 'items') i
$$;
grant execute on all functions in schema uji to public;

-- ================================================================ hak & kontrak fungsi
select uji.sama((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('web_notif', 'web_notif_baca')), 2,
  'tepat satu web_notif & satu web_notif_baca (tanpa overload ganda → PostgREST tidak PGRST203)');
select uji.cek(to_regprocedure('public.web_notif(integer,text)') is not null
               and to_regprocedure('public.web_notif_baca(bigint[],text)') is not null,
  'signature baru: web_notif(integer,text), web_notif_baca(bigint[],text)');
select uji.cek(not exists (
  select 1 from pg_proc p
   where p.oid in ('public.web_notif(integer,text)'::regprocedure, 'public.web_notif_baca(bigint[],text)'::regprocedure)
     and (not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  'web_notif & web_notif_baca: hanya authenticated');
select uji.cek(not exists (
  select 1 from pg_proc p
   where p.oid in ('public.notif_dari_agent(text,text)'::regprocedure, 'public.notif_sebelum()'::regprocedure)
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  'pembantu notif_dari_agent & notif_sebelum: tidak bisa dipanggil role API');
select uji.cek((select bool_and(coalesce(p.proconfig, '{}') @> array['search_path=""']) from pg_proc p
                 where p.oid in ('public.web_notif(integer,text)'::regprocedure, 'public.web_notif_baca(bigint[],text)'::regprocedure,
                                 'public.notif_sebelum()'::regprocedure)),
  'fungsi SECURITY DEFINER baru memakai search_path kosong');

-- ================================================================ aturan klasifikasi (tabel kebenaran)
select uji.sama(
  (select array_agg(public.notif_dari_agent(s, r) order by i)
     from (values (1, 'api', 'member'), (2, 'api', 'owner'), (3, 'ui', 'bot'), (4, null, 'bot'), (5, 'api', null),
                  (6, 'ui', 'member'), (7, 'ui', 'owner'), (8, null, 'member'), (9, null, null), (10, 'ui', null)) v(i, s, r)),
  array[true, true, true, true, true, false, false, false, false, false],
  'notif_dari_agent: api ATAU bot = agent; ui/null + manusia/tanpa aktor = tim');

-- ================================================================ data
delete from public.notifications where member_id = 100000003;        -- Dodi mulai bersih (rollback di akhir)

-- Budi (web) membuat kartu & menugaskan Dodi → assign, sumber ui (tim)
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name) values ('rtnpisah01', 'rlujib0001', 'Uji pisah notifikasi');
insert into public.task_assignees (task_id, member_id) values ('rtnpisah01', 100000003);
select uji.sama((select sumber from public.notifications where member_id = 100000003 and jenis = 'assign' and task_id = 'rtnpisah01'),
  'ui', 'trigger: notifikasi dari web tercatat sumber ui');

-- Eka (web) berkomentar → komentar ke Dodi (assignee), tim
select uji.konteks('ui', 900000000001);
insert into public.comments (id, task_id, text) values ('rcnpisah001', 'rtnpisah01', 'Eka: bahan sudah datang');

-- bot "claude (agent)" lewat API → agent
select uji.konteks('api', 900000000002);
insert into public.comments (id, task_id, text) values ('rcnpisah002', 'rtnpisah01', '[Claude] ringkasan harian');
select uji.sama((select sumber from public.notifications where member_id = 100000003 and comment_id = 'rcnpisah002'),
  'api', 'trigger: notifikasi dari token API tercatat sumber api');

-- agent memakai token milik MANUSIA (Citra) → tetap agent (lewat API)
select uji.konteks('api', 100000002);
insert into public.comments (id, task_id, text) values ('rcnpisah003', 'rtnpisah01', 'catatan otomatis atas nama Citra');

-- sumber lain (sistem) tidak membuat notifikasi lewat trigger A1; sisipan langsung tanpa sumber ui/api → null
select uji.konteks('sistem', 100000001);
insert into public.notifications (member_id, task_id, jenis, actor_id) values (100000002, 'rtnpisah01', 'assign', 100000001);
select uji.sama((select sumber from public.notifications where member_id = 100000002 and task_id = 'rtnpisah01' and jenis = 'assign'
                  order by id desc limit 1), null::text, 'trigger: sumber selain ui/api → null (jatuh ke aturan role)');
select uji.konteks(null, null);

-- ================================================================ Dodi: bentuk lama (tanpa p_dari)
select uji.jadi(uji.dodi());
select uji.simpan('semua', public.web_notif(10));                        -- posisional, seperti 13_web
select uji.cek(uji.ambil('semua') ?& array['belum', 'items', 'belum_tim', 'belum_agent', 'dari'],
  'web_notif lama: kunci lama + kunci baru (belum_tim, belum_agent, dari)');
select uji.sama(uji.ambil('semua') -> 'dari', 'null'::jsonb, 'web_notif lama: dari = null (semua)');
select uji.sama((uji.ambil('semua') ->> 'belum')::int, 4, 'web_notif lama: belum = TOTAL 4 (assign + 3 komentar)');
select uji.sama((uji.ambil('semua') ->> 'belum_tim')::int, 2, 'belum_tim = 2 (assign Budi, komentar Eka)');
select uji.sama((uji.ambil('semua') ->> 'belum_agent')::int, 2, 'belum_agent = 2 (bot, token milik Citra)');
select uji.sama((public.web_saya() ->> 'notif_belum')::int, 4, 'lonceng (web_saya.notif_belum) tetap TOTAL');
select uji.sama(jsonb_array_length(uji.ambil('semua') -> 'items'), 4, 'web_notif lama: semua kelompok bercampur');
select uji.cek((select bool_and(i ?& array['id', 'jenis', 'task', 'actor', 'created_at', 'read_at', 'cuplikan', 'comment_id',
                                           'dari', 'lewat_api'])
                from jsonb_array_elements(uji.ambil('semua') -> 'items') i),
  'item: kunci lama + dari, lewat_api');
select uji.sama(uji.dari_notif(public.web_notif(p_limit => 100)), array['agent', 'tim'], 'web_notif(p_limit =>) bernama tetap jalan');

-- ================================================================ tab
select uji.simpan('tim', public.web_notif(100, 'tim'));
select uji.simpan('agent', public.web_notif(100, 'agent'));
select uji.sama(uji.ambil('tim') ->> 'dari', 'tim', 'tab tim: dari = tim');
select uji.sama(uji.dari_notif(uji.ambil('tim')), array['tim'], 'tab tim: hanya item tim');
select uji.sama(jsonb_array_length(uji.ambil('tim') -> 'items'), 2, 'tab tim: 2 item');
select uji.sama(uji.dari_notif(uji.ambil('agent')), array['agent'], 'tab agent: hanya item agent');
select uji.sama(jsonb_array_length(uji.ambil('agent') -> 'items'), 2, 'tab agent: 2 item');
select uji.cek((uji.ambil('tim') ->> 'belum')::int = 4 and (uji.ambil('tim') ->> 'belum_agent')::int = 2
               and (uji.ambil('agent') ->> 'belum_tim')::int = 2,
  'tiap tab tetap membawa hitungan semua kelompok (angka tab & lonceng)');
select uji.cek((select bool_and(i #>> '{actor,role}' in ('owner', 'member')) from jsonb_array_elements(uji.ambil('tim') -> 'items') i),
  'tab tim: aktor manusia');
select uji.cek(exists (select 1 from jsonb_array_elements(uji.ambil('agent') -> 'items') i
                        where i #>> '{actor,id}' = '900000000002' and i #>> '{actor,role}' = 'bot'
                          and (i ->> 'lewat_api')::boolean and i ->> 'cuplikan' like '[Claude]%'),
  'tab agent: komentar bot (actor.role bot, lewat_api, cuplikan)');
select uji.cek(exists (select 1 from jsonb_array_elements(uji.ambil('agent') -> 'items') i
                        where i #>> '{actor,id}' = '100000002' and i #>> '{actor,role}' = 'member' and (i ->> 'lewat_api')::boolean),
  'tab agent: token API milik manusia tetap agent (lewat_api true, aktor Citra)');
select uji.cek((select bool_and(not (i ->> 'lewat_api')::boolean) from jsonb_array_elements(uji.ambil('tim') -> 'items') i),
  'tab tim: tidak ada yang lewat API');
select uji.sama(uji.dari_notif(public.web_notif(100, ' AGENT ')), array['agent'], 'p_dari dinormalkan (spasi & huruf besar)');
select uji.sama(jsonb_array_length(public.web_notif(100, '') -> 'items'), 4, 'p_dari kosong = semua (perilaku lama)');
select uji.galat($$select public.web_notif(10, 'xyz')$$, 'PT400', 'web_notif p_dari salah ditolak', 'tim', 'INPUT_001');
select uji.galat($$select public.web_notif_baca(null, 'bot')$$, 'PT400', 'web_notif_baca p_dari salah ditolak', null, 'INPUT_001');
reset role;

-- ================================================================ limit per tab: 3 notifikasi agent lebih baru
select uji.konteks('api', 900000000002);
insert into public.comments (id, task_id, text) values
  ('rcnpisah004', 'rtnpisah01', '[Claude] a'), ('rcnpisah005', 'rtnpisah01', '[Claude] b'), ('rcnpisah006', 'rtnpisah01', '[Claude] c');
select uji.konteks(null, null);
select uji.jadi(uji.dodi());
select uji.sama(public.web_notif(1) #>> '{items,0,dari}', 'agent', 'tanpa p_dari: item terbaru = agent');
select uji.sama(public.web_notif(1, 'tim') #>> '{items,0,dari}', 'tim', 'limit per tab: web_notif(1, tim) tetap berisi item tim');
select uji.sama(jsonb_array_length(public.web_notif(3, 'tim') -> 'items'), 2, 'limit per tab: tab tim tidak terdesak notifikasi agent');
select uji.sama((public.web_notif(1, 'tim') ->> 'belum_agent')::int, 5, 'belum_agent = 5 sesudah 3 komentar bot');
select uji.cek(uji.ids_notif(public.web_notif(100, 'agent'))
               = (select array_agg(i order by i desc) from unnest(uji.ids_notif(public.web_notif(100, 'agent'))) i),
  'tab agent: urut terbaru dulu');

-- ================================================================ tandai dibaca per tab
select uji.sama((public.web_notif_baca(array[(public.web_notif(1, 'tim') #>> '{items,0,id}')::bigint], 'agent') ->> 'dibaca')::int, 0,
  'web_notif_baca(id tim, agent): irisan kosong → tidak ada yang ditandai');
select uji.sama((public.web_notif_baca(null, 'agent') ->> 'dibaca')::int, 5, 'tandai semua (tab agent): 5 dibaca');
select uji.simpan('s1', public.web_notif(100));
select uji.cek((uji.ambil('s1') ->> 'belum_agent')::int = 0 and (uji.ambil('s1') ->> 'belum_tim')::int = 2
               and (uji.ambil('s1') ->> 'belum')::int = 2,
  'sesudah tandai agent: tim tetap 2 belum dibaca, total 2');
select uji.sama((public.web_notif_baca(array[(public.web_notif(1, 'tim') #>> '{items,0,id}')::bigint]) ->> 'dibaca')::int, 1,
  'bentuk lama web_notif_baca(array[id]) tetap jalan');
select uji.sama((public.web_notif_baca(p_ids => null) ->> 'dibaca')::int, 1, 'bentuk lama web_notif_baca(null): sisanya');
select uji.sama((public.web_notif(10) ->> 'belum')::int, 0, 'semua dibaca: belum = 0');
reset role;
select uji.cek((select count(*) > 0 from public.notifications where member_id <> 100000003 and read_at is null),
  'web_notif_baca per tab tidak menyentuh notifikasi orang lain');

-- ================================================================ privasi: kartu tertutup tetap disamarkan di tab agent
select uji.konteks('ui', 100000001);
insert into public.spaces (id, name, private) values ('rsnpisah01', 'Ruang Privat Notif', true);
insert into public.lists (id, space_id, name) values ('rlnpisah01', 'rsnpisah01', 'List Privat Notif');
insert into public.space_anggota (space_id, member_id) values ('rsnpisah01', 100000002);
insert into public.tasks (id, list_id, name) values ('rtnpisah02', 'rlnpisah01', 'Kartu rahasia-bot');
select uji.konteks('api', 900000000002);
insert into public.comments (id, task_id, text) values ('rcnpisah007', 'rtnpisah02', '@dodi pratama isi rahasia-bot');
insert into public.comment_mentions (comment_id, member_id) values ('rcnpisah007', 100000003);
select uji.konteks(null, null);
select uji.jadi(uji.dodi());
select uji.simpan('priv', public.web_notif(50, 'agent'));
select uji.cek((select bool_and(i #>> '{task,name}' = '(kartu di space privat)' and (i #>> '{task,tertutup}')::boolean
                                and i -> 'cuplikan' = 'null' and i ->> 'jenis' = 'mention')
                  from jsonb_array_elements(uji.ambil('priv') -> 'items') i where i #>> '{task,id}' = 'rtnpisah02')
               and exists (select 1 from jsonb_array_elements(uji.ambil('priv') -> 'items') i where i #>> '{task,id}' = 'rtnpisah02')
               and uji.ambil('priv')::text not like '%rahasia%',
  'tab agent: mention bot di kartu space privat disamarkan (nama & cuplikan)');
reset role;

-- ================================================================ role lain
select uji.jadi_anon();
select uji.galat($$select public.web_notif(10, 'agent')$$, '42501', 'anon: web_notif ditolak');
reset role;
select uji.jadi_service();
select uji.galat($$select public.web_notif_baca(null, 'tim')$$, '42501', 'service_role: web_notif_baca tidak di-grant');
reset role;

rollback;
