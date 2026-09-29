-- 14 · (review R2) Privasi space mengikuti ClickUp: space privat hanya terlihat anggotanya (space_anggota) +
-- owner/bot; kartu di dalamnya juga terlihat oleh assignee kartu itu. Berlaku untuk RLS (select langsung),
-- Storage, fungsi web_* (authenticated) dan api_*/x_* (service_role, per p_aktor). Setelan privasi_space
-- "abaikan" = semua anggota melihat semua.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

create function uji.budi() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function uji.citra() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function uji.dodi() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
create function uji.eka() returns uuid language sql immutable as $$ select '44444444-4444-4444-8444-444444444444'::uuid $$;
-- jumlah baris terlihat (RLS berlaku bila dipanggil sebagai authenticated)
create function uji.n(p_sql text) returns int language plpgsql as $$
declare n int; begin execute p_sql into n; return n; end $$;
grant execute on all functions in schema uji to public;

-- ---------------------------------------------------------------- data: space privat app (Budi owner)
-- Citra = anggota space. Dodi = bukan anggota, tapi assignee rtujipriv01. Eka = bukan anggota, tanpa tugas.
select uji.konteks('ui', 100000001);
insert into public.spaces (id, name, private) values ('rsujipriv01', 'Ruang Privat Uji', true);
insert into public.lists (id, space_id, name) values ('rlujipriv01', 'rsujipriv01', 'List Privat Uji');
insert into public.space_anggota (space_id, member_id) values ('rsujipriv01', 100000002);
insert into public.tasks (id, list_id, name, due_at) values
  ('rtujipriv01', 'rlujipriv01', 'Privat satu ditugaskan ke Dodi', '2026-09-20 12:00+07'),
  ('rtujipriv02', 'rlujipriv01', 'Privat dua rahasia', '2026-09-20 12:00+07');
insert into public.task_assignees (task_id, member_id) values ('rtujipriv01', 100000003), ('rtujipriv02', 100000002);
insert into public.comments (id, task_id, text) values
  ('rcujipriv001', 'rtujipriv01', 'komentar di kartu Dodi'),
  ('rcujipriv002', 'rtujipriv02', 'komentar rahasia');
insert into public.attachments (id, task_id, title, storage_path, mimetype) values
  ('7a000000-0000-4000-8000-000000000001', 'rtujipriv02', 'rahasia.png',
   't/rtujipriv02/7a000000-0000-4000-8000-000000000001-rahasia.png', 'image/png');
insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujipriv02/7a000000-0000-4000-8000-000000000001-rahasia.png');
-- Citra menyebut Dodi & Eka di kartu rahasia → notifikasi ke orang yang tidak bisa melihat kartunya
select uji.konteks('ui', 100000002);
insert into public.comments (id, task_id, text) values ('rcujipriv003', 'rtujipriv02', '@dodi pratama @eka wulandari lihat ini');
insert into public.comment_mentions (comment_id, member_id) values ('rcujipriv003', 100000003), ('rcujipriv003', 900000000001);
select uji.konteks(null, null);
update public.app_settings set value = '[]' where key = 'tenggat_folder_ids';     -- [] = semua folder (termasuk list tanpa folder)
select uji.sama((select value from public.app_settings where key = 'privasi_space'), '"tegakkan"'::jsonb,
  'setelan default privasi_space = tegakkan');

-- ---------------------------------------------------------------- RLS: Eka (bukan anggota, tanpa tugas)
select uji.jadi(uji.eka());
select uji.cek(not public.lihat_semua(), 'Eka (member): lihat_semua false');
select uji.sama(uji.n($$select count(*) from public.spaces where id = 'rsujipriv01'$$), 0, 'Eka: space privat tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.space_anggota where space_id = 'rsujipriv01'$$), 0, 'Eka: anggota space privat tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.lists where id = 'rlujipriv01'$$), 0, 'Eka: list privat tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.list_statuses where list_id = 'rlujipriv01'$$), 0, 'Eka: status list privat tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$), 0, 'Eka: tugas space privat tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.task_assignees where task_id like 'rtujipriv%'$$), 0, 'Eka: assignee tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.comments where task_id like 'rtujipriv%'$$), 0, 'Eka: komentar tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.comment_mentions where comment_id like 'rcujipriv%'$$), 0, 'Eka: mention tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.attachments where task_id like 'rtujipriv%'$$), 0, 'Eka: lampiran tidak terlihat');
select uji.sama(uji.n($$select count(*) from public.activity where task_id like 'rtujipriv%'$$), 0, 'Eka: riwayat tidak terlihat');
select uji.sama(uji.n($$select count(*) from storage.objects where name like 't/rtujipriv02/%'$$), 0, 'Eka: objek Storage tidak terlihat');
select uji.cek(uji.n($$select count(*) from public.tasks where id like 'z8r3uj%' or id like 'rtujib%'$$) = 26
               and uji.n($$select count(*) from public.spaces where id in ('1100340000900001', 'rsujib0001')$$) = 2,
  'Eka: data space seed (tidak privat) tetap terlihat');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujipriv02/eka.png')$$,
  '42501', 'Eka: unggah ke kartu privat ditolak');
-- RLS menilai anggota sesi JWT, bukan app.actor_id yang mungkin tersisa di transaksi (mis. milik owner)
select set_config('app.actor_id', '100000001', true);
select uji.cek(not public.lihat_semua() and uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 0,
  'Eka: app.actor_id owner yang tersisa tidak membuka RLS (penilai = sesi JWT)');
select set_config('app.actor_id', '', true);
select uji.galat($$select public.penilai()$$, '42501', 'penilai() internal (tidak bisa dipanggil klien)');
select uji.cek(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                             and p.proname in ('lihat_semua', 'space_terlihat', 'list_tertutup', 'tugas_tertutup')
                             and p.proargtypes::text ~ '\m20\M'),
  'pembantu privasi yang terbuka untuk klien tidak menerima parameter anggota (tidak bisa menanyakan hak orang lain)');

-- ---------------------------------------------------------------- RLS: Dodi (assignee rtujipriv01 saja)
reset role;
select uji.jadi(uji.dodi());
select uji.sama(uji.n($$select count(*) from public.spaces where id = 'rsujipriv01'$$), 0, 'Dodi: space privat tidak terlihat');
select uji.sama((select array_agg(id order by id) from public.tasks where id like 'rtujipriv%'), array['rtujipriv01'],
  'Dodi: hanya kartu privat yang ditugaskan kepadanya');
select uji.sama((select array_agg(id order by id) from public.comments where task_id like 'rtujipriv%'), array['rcujipriv001'],
  'Dodi: komentar kartunya saja');
select uji.cek(uji.n($$select count(*) from public.activity where task_id = 'rtujipriv01'$$) > 0
               and uji.n($$select count(*) from public.activity where task_id = 'rtujipriv02'$$) = 0,
  'Dodi: riwayat kartunya terlihat, kartu rahasia tidak');

-- ---------------------------------------------------------------- RLS: Citra (anggota space) & Budi (owner)
reset role;
select uji.jadi(uji.citra());
select uji.cek(uji.n($$select count(*) from public.spaces where id = 'rsujipriv01'$$) = 1
               and uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 2
               and uji.n($$select count(*) from public.comments where task_id like 'rtujipriv%'$$) = 3
               and uji.n($$select count(*) from public.comment_mentions where comment_id = 'rcujipriv003'$$) = 2
               and uji.n($$select count(*) from storage.objects where name like 't/rtujipriv02/%'$$) = 1,
  'Citra (anggota space): semua isi space privat terlihat');
select uji.jalan($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujipriv02/citra.png')$$,
  'Citra: unggah ke kartu privat diizinkan');
reset role;
select uji.jadi(uji.budi());
select uji.cek(public.lihat_semua() and uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 2,
  'Budi (owner): lihat_semua, semua kartu privat terlihat');
reset role;

-- ---------------------------------------------------------------- fungsi web_* (Dodi)
select uji.jadi(uji.dodi());
select uji.cek(not (public.web_struktur() -> 'spaces') @> '[{"id":"rsujipriv01"}]', 'Dodi web_struktur: tanpa space privat');
select uji.galat($$select public.web_daftar('rlujipriv01')$$, 'PT404', 'Dodi web_daftar list privat → 404');
select uji.galat($$select public.web_detail('rtujipriv02')$$, 'PT404', 'Dodi web_detail kartu rahasia → 404');
select uji.cek((public.web_detail('rtujipriv01') #>> '{task,id}') = 'rtujipriv01', 'Dodi web_detail kartunya sendiri → boleh');
select uji.cek((public.web_tugas_saya() -> 'telat') @> '[{"id":"rtujipriv01"}]', 'Dodi web_tugas_saya: kartu privat miliknya tampil');
select uji.cek(not (public.web_tugas_saya(100000002))::text like '%rtujipriv02%', 'Dodi melihat Tugas Saya Citra: kartu rahasia disaring');
select uji.cek(not (public.web_cari('Privat'))::text like '%rtujipriv02%'
               and (public.web_cari('Privat') -> 'hasil') @> '[{"id":"rtujipriv01"}]', 'Dodi web_cari: kartu rahasia tidak muncul');
select uji.galat($$select public.web_komentar('rtujipriv02', 'nyusup', null, null)$$, 'PT404', 'Dodi web_komentar kartu rahasia → 404');
select uji.galat($$select public.web_komentar(null, 'balas', 'rcujipriv002', null)$$, 'PT404', 'Dodi balas komentar rahasia → 404');
select uji.galat($$select public.web_ubah_tugas('rtujipriv02', '{"name":"x"}', 1)$$, 'PT404', 'Dodi web_ubah_tugas rahasia → 404');
select uji.galat($$select public.web_urut('rtujipriv02', null, 1)$$, 'PT404', 'Dodi web_urut rahasia → 404');
select uji.galat($$select public.web_arsip('rtujipriv02', true)$$, 'PT404', 'Dodi web_arsip rahasia → 404');
select uji.galat($$select public.web_buat_tugas('rlujipriv01', '{"name":"x"}')$$, 'PT404', 'Dodi web_buat_tugas di list privat → 404');
select uji.galat($$select public.web_pindah('rtujib0001', 'rlujipriv01')$$, 'PT404', 'Dodi web_pindah ke list privat → 404');
select uji.galat($$select public.web_komentar_edit('rcujipriv002', 'x')$$, 'PT404', 'Dodi web_komentar_edit rahasia → 404');
select uji.galat($$select public.web_lampiran_hapus('7a000000-0000-4000-8000-000000000001')$$, 'PT404', 'Dodi web_lampiran_hapus rahasia → 404');
select uji.cek((select bool_and(i #>> '{task,name}' = '(kartu di space privat)' and (i #>> '{task,tertutup}')::boolean
                                and i -> 'cuplikan' = 'null')
                from jsonb_array_elements(public.web_notif(50) -> 'items') i where i #>> '{task,id}' = 'rtujipriv02')
               and (public.web_notif(50))::text not like '%rahasia%',
  'Dodi web_notif: notifikasi mention di kartu rahasia disamarkan (nama & cuplikan)');
select uji.cek(not (public.web_tenggat())::text like '%rtujipriv02%' and (public.web_tenggat())::text like '%rtujipriv01%',
  'Dodi web_tenggat: kartu rahasia tidak ikut');
reset role;

-- ---------------------------------------------------------------- fungsi api_* / x_* (service_role)
select uji.jadi_service();
select uji.cek(not (public.api_spaces(100000003) -> 'spaces') @> '[{"id":"rsujipriv01"}]'
               and (public.api_spaces(900000000002) -> 'spaces') @> '[{"id":"rsujipriv01"}]'
               and (public.api_spaces(100000002) -> 'spaces') @> '[{"id":"rsujipriv01"}]',
  'api_spaces: privat untuk anggota space & bot, tidak untuk non-anggota');
select uji.galat($$select public.api_space_lists(100000003, 'rsujipriv01')$$, 'PT404', 'api_space_lists non-anggota → 404');
select uji.galat($$select public.api_list(100000003, 'rlujipriv01')$$, 'PT404', 'api_list non-anggota → 404');
select uji.galat($$select public.api_list_tasks(100000003, 'rlujipriv01')$$, 'PT404', 'api_list_tasks non-anggota → 404');
select uji.sama(jsonb_array_length(public.api_list_tasks(900000000002, 'rlujipriv01') -> 'tasks'), 2, 'api_list_tasks bot: semua kartu');
select uji.sama(public.api_task(100000003, 'rtujipriv01') ->> 'id', 'rtujipriv01', 'api_task kartu privat milik aktor → boleh');
select uji.galat($$select public.api_task(100000003, 'rtujipriv02')$$, 'PT404', 'api_task kartu rahasia → 404');
select uji.galat($$select public.api_task_comments(100000003, 'rtujipriv02')$$, 'PT404', 'api_task_comments rahasia → 404');
select uji.galat($$select public.api_comment_replies(100000003, 'rcujipriv002')$$, 'PT404', 'api_comment_replies rahasia → 404');
select uji.galat($$select public.api_create_comment(100000003, 'rtujipriv02', '{"comment_text":"x"}')$$, 'PT404', 'api_create_comment rahasia → 404');
select uji.galat($$select public.api_create_reply(100000003, 'rcujipriv002', '{"comment_text":"x"}')$$, 'PT404', 'api_create_reply rahasia → 404');
select uji.galat($$select public.api_update_task(100000003, 'rtujipriv02', '{"name":"x"}')$$, 'PT404', 'api_update_task rahasia → 404');
select uji.galat($$select public.api_create_task(100000003, 'rlujipriv01', '{"name":"x"}')$$, 'PT404', 'api_create_task list privat → 404');
select uji.galat($$select public.api_move_task(100000003, 'rtujib0001', 'rlujipriv01')$$, 'PT404', 'api_move_task ke list privat → 404');
select uji.galat($$select public.x_activity(100000003, 'rtujipriv02')$$, 'PT404', 'x_activity rahasia → 404');
select uji.cek(jsonb_array_length(public.x_activity(100000003, 'rtujipriv01')) > 0, 'x_activity kartu milik aktor → boleh');
select uji.galat($$select public.x_resolve(100000003, 'rtujipriv02')$$, 'PT404', 'x_resolve kartu rahasia → 404');
select uji.galat($$select public.x_resolve(100000003, 'rlujipriv01')$$, 'PT404', 'x_resolve list privat → 404');
select uji.galat($$select public.x_resolve(100000003, 'rsujipriv01')$$, 'PT404', 'x_resolve space privat → 404');
select uji.galat($$select public.x_resolve(100000003, 'rcujipriv002')$$, 'PT404', 'x_resolve komentar rahasia → 404');
select uji.sama(public.x_resolve(100000002, 'rtujipriv02') ->> 'id', 'rtujipriv02', 'x_resolve anggota space → boleh');
select uji.cek(not (public.x_search(100000003, 'Privat', null, true))::text like '%rtujipriv02%'
               and (public.x_search(900000000002, 'Privat', null, true))::text like '%rtujipriv02%',
  'x_search: kartu rahasia hanya untuk yang berhak');
select uji.cek(not (public.x_tenggat(100000003))::text like '%rtujipriv02%'
               and (public.x_tenggat(900000000002))::text like '%rtujipriv02%',
  'x_tenggat: kartu rahasia hanya untuk yang berhak (bot routine melihat semua)');
select uji.cek(not (public.x_sensus(100000003) -> 'lists') @> '[{"list_id":"rlujipriv01"}]'
               and (public.x_sensus(900000000002) -> 'lists') @> '[{"list_id":"rlujipriv01"}]',
  'x_sensus: list privat hanya untuk yang berhak');
select uji.galat($$select public.x_export(100000002)$$, 'PT403', 'x_export anggota space (bukan owner/bot) tetap 403', null, 'ACCESS_001');
reset role;

-- ---------------------------------------------------------------- admin: atur anggota space (owner)
select uji.jadi(uji.budi());
select uji.cek((select j -> 'anggota' = '[{"id":900000000001,"sumber":"app"}]'
                from (select public.web_admin_struktur_simpan('{"jenis":"space","id":"rsujipriv01","anggota":[900000000001]}') j) x),
  'admin: anggota space diganti (himpunan penuh) → Eka');
select uji.galat($$select public.web_admin_struktur_simpan('{"jenis":"space","id":"rsujipriv01","anggota":[424242]}')$$,
  'PT400', 'admin: anggota tak dikenal → 400');
reset role;
select uji.jadi(uji.eka());
select uji.cek(uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 2
               and (public.web_struktur() -> 'spaces') @> '[{"id":"rsujipriv01","anggota":[900000000001]}]',
  'Eka setelah ditambahkan: space privat terlihat');
reset role;
select uji.jadi(uji.citra());
select uji.cek(uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 1,
  'Citra setelah dikeluarkan: hanya kartu yang ditugaskan kepadanya');
reset role;

-- ---------------------------------------------------------------- setelan "abaikan" = semua lihat semua
update public.app_settings set value = '"abaikan"' where key = 'privasi_space';
select uji.jadi(uji.dodi());
select uji.cek(public.lihat_semua() and uji.n($$select count(*) from public.tasks where id like 'rtujipriv%'$$) = 2
               and (public.web_detail('rtujipriv02') #>> '{task,id}') = 'rtujipriv02',
  'privasi_space abaikan: member melihat space privat');
reset role;
select uji.galat($$update public.app_settings set value = '"campur"' where key = 'privasi_space'$$, '23514',
  'privasi_space hanya tegakkan/abaikan');

rollback;
