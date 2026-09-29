-- 16 · Perbaikan poles 29 Sep (P1–P6): tags/checklists/custom_fields kartu impor di task json (PR-1), anggota space
-- privat dari impor (jenis 'space_anggota'), allowlist MIME lampiran, normalisasi nama status Admin, kartu di
-- list/folder/space diarsip tidak masuk Tugas Saya/TENGGAT/beban, URL tampilan ClickUp di x_resolve & pencarian.
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

create function uji.budi() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function uji.citra() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function uji.dodi() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
-- semua ID kartu di hasil web_tugas_saya (semua grup)
create function uji.ids_saya(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}')
    from jsonb_each(j) k(kunci, v)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(k.v) = 'array' then k.v else '[]'::jsonb end) e
$$;
create function uji.ids(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}') from jsonb_array_elements(j) e
$$;
grant execute on all functions in schema uji to public;

insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('eeeeeeee-0000-4000-8000-000000000001', 900000000002, 'bot impor P', 'rtk_p1', uji.sha('rtk_p1'), 'impor');

-- ================================================================ hak pembantu baru
select uji.cek(not exists (
  select 1 from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('rujukan_urai', 'rujukan_wadah', 'muat_space_anggota', 'set_space_anggota_impor', 'list_diarsip')
     and (has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))),
  'pembantu baru (rujukan_urai, rujukan_wadah, muat_space_anggota, list_diarsip) tidak bisa dipanggil role API');
select uji.sama(
  (select array_agg(p.proname::text order by p.proname::text collate "C") from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname !~ '^(api|x|impor|web)_'
      and (has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  (select array_agg(x order by x collate "C") from unnest(array[
    'aktor', 'beban', 'boleh_unggah_lampiran', 'hari_ini_wib', 'hari_kerja', 'id_baru', 'is_member', 'is_owner', 'iso_utc',
    'lampiran_task_dari_path', 'lihat_semua', 'list_tertutup', 'member_saya', 'mode_app', 'space_terlihat',
    'status_list_valid', 'sumber_aktif', 'tugas_tertutup', 'wib_date']) x),
  'di luar api_/x_/impor_/web_ hanya 19 pembantu A1 (RLS/Storage) yang bisa dipanggil role API');

-- ================================================================ P1 (PR-1) tags/checklists/custom_fields kartu impor
select uji.jadi_service();
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.simpan('p1', public.impor_batch(900000000002, 'tasks', '[
  {"id":"z8r3pl0001","name":"P1 kartu bertag","list":{"id":"1100340000900101"},"status":{"status":"to do"},
   "creator":{"id":100000001},"date_created":"1790000000000","date_updated":"1790000000000","assignees":[{"id":100000002}],
   "tags":[{"name":"prioritas","tag_fg":"#ffffff","tag_bg":"#e50000","creator":100000001}],
   "checklists":[{"id":"cl-p1-1","task_id":"z8r3pl0001","name":"Langkah kerja","date_created":"1790000000000","orderindex":0,
     "creator":100000001,"resolved":1,"unresolved":1,"items":[
       {"id":"it-p1-1","name":"siapkan data","orderindex":0,"assignee":null,"resolved":true,"parent":null,"date_created":"1790000000000","children":[]},
       {"id":"it-p1-2","name":"kirim","orderindex":1,"assignee":null,"resolved":false,"parent":null,"date_created":"1790000000000","children":[]}]}],
   "custom_fields":[{"id":"cf-p1-1","name":"Nilai","type":"number","type_config":{},"date_created":"1","hide_from_guests":false,"required":false,"value":"5"},
                    {"id":"cf-p1-2","name":"Catatan","type":"text","type_config":{},"date_created":"1","hide_from_guests":false,"required":false}]},
  {"id":"z8r3pl0002","name":"P1 kartu tanpa tag","list":{"id":"1100340000900101"},"status":{"status":"to do"},
   "creator":{"id":100000001},"date_created":"1790000000000","date_updated":"1790000000000","assignees":[],
   "tags":[],"checklists":[],
   "custom_fields":[{"id":"cf-p1-2","name":"Catatan","type":"text","type_config":{},"date_created":"1","hide_from_guests":false,"required":false}]}]'));
select uji.cek((uji.ambil('p1') ->> 'inserted')::int = 2 and jsonb_array_length(uji.ambil('p1') -> 'gagal') = 0, 'P1 impor 2 kartu (tags/checklists/custom_fields)');
select uji.simpan('p1t', public.api_task(900000000002, 'z8r3pl0001'));
select uji.sama(uji.ambil('p1t') -> 'tags', '[{"name":"prioritas","tag_fg":"#ffffff","tag_bg":"#e50000","creator":100000001}]'::jsonb,
  'P1 api_task: tags kartu impor verbatim (bentuk ClickUp)');
select uji.cek(uji.ambil('p1t') #>> '{checklists,0,name}' = 'Langkah kerja' and jsonb_array_length(uji.ambil('p1t') #> '{checklists,0,items}') = 2
               and uji.ambil('p1t') #> '{checklists,0,items,0,resolved}' = 'true'::jsonb,
  'P1 api_task: checklists verbatim (item + resolved)');
select uji.sama(uji.ambil('p1t') #> '{checklists,0,items,1}',
  '{"id":"it-p1-2","name":"kirim","orderindex":1,"assignee":null,"resolved":false,"parent":null,"date_created":"1790000000000","children":[]}'::jsonb,
  'P1 checklist item: kunci bernilai null (assignee, parent) tetap ada');
select uji.cek(jsonb_array_length(uji.ambil('p1t') -> 'custom_fields') = 2 and uji.ambil('p1t') #>> '{custom_fields,0,value}' = '5',
  'P1 api_task: custom_fields tersimpan (ada nilai) → verbatim, termasuk field tanpa nilai');
select uji.sama(uji.kunci(uji.ambil('p1t') - 'attachments'), uji.kunci_task(), 'P1 api_task: tetap 40 kunci');
select uji.sama(public.api_task(900000000002, 'z8r3pl0002') -> 'tags', '[]'::jsonb, 'P1 kartu impor tanpa tag → tags []');
select uji.cek((select j -> 'checklists' = '[]'::jsonb and j -> 'custom_fields' = '[]'::jsonb
                  from (select public.api_task(900000000002, 'z8r3pl0002') j) x),
  'P1 kartu impor: custom_fields tanpa nilai tidak disimpan → []; checklists kosong → []');
select uji.sama((select t -> 'tags' from jsonb_array_elements(public.api_list_tasks(900000000002, '1100340000900101', 0, true) -> 'tasks') t
                  where t ->> 'id' = 'z8r3pl0001'), uji.ambil('p1t') -> 'tags', 'P1 api_list_tasks: tags sama dengan api_task');
select uji.sama((public.impor_batch(900000000002, 'tasks', jsonb_build_array((uji.ambil('p1t') - 'attachments') ||
                  '{"list":{"id":"1100340000900101"},"creator":{"id":100000001}}'::jsonb)) ->> 'gagal'), '[]',
  'P1 task json app dapat diimpor ulang tanpa galat (bentuk sama dengan payload ClickUp)');
reset role;
select uji.konteks('ui', 100000001);
update public.tasks set extra = '{"tags":[{"name":"palsu"}],"checklists":[{"id":"x"}],"custom_fields":[{"id":"y","value":1}]}'
 where id = 'rtujib0001';
select uji.jadi_service();
select uji.token(null);
select uji.cek((select j -> 'tags' = '[]'::jsonb and j -> 'checklists' = '[]'::jsonb and j -> 'custom_fields' = '[]'::jsonb
                  from (select public.api_task(900000000002, 'rtujib0001') j) x),
  'P1 kartu app: tags/checklists/custom_fields tetap [] walau extra berisi');

-- ================================================================ P2 anggota space privat (jenis 'space_anggota')
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.sama((public.impor_batch(900000000002, 'spaces', '[{"id":"1100340000800901","name":"Ruang Privat P2","private":true}]') ->> 'inserted')::int,
  1, 'P2 space privat ClickUp diimpor');
select uji.sama((public.impor_batch(900000000002, 'lists',
  '[{"id":"1100340000800911","name":"List Privat P2","space_id":"1100340000800901","folder_id":null}]') ->> 'inserted')::int,
  1, 'P2 list di space privat diimpor');
select uji.token(null);
select uji.cek(not (public.api_spaces(100000002) -> 'spaces') @> '[{"id":"1100340000800901"}]',
  'P2 sebelum space_anggota: member (Citra) tidak melihat space privat');
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.simpan('p2a', public.impor_batch(900000000002, 'space_anggota', '[
  {"space_id":"1100340000800901","member_ids":[100000003,100000002,900000000001,312999999]},
  {"space_id":"1100340000800999","member_ids":[100000002]},
  {"space_id":"rsujib0001","member_ids":[100000002]},
  {"space":{"id":"1100340000800901"}}]'));
select uji.sama(uji.ambil('p2a') - 'gagal' - 'dilewati',
  '{"jenis":"space_anggota","mode":"impor","inserted":1,"updated":0,"unchanged":0,"ditambah":2,"dibuang":0}'::jsonb,
  'P2 space_anggota: 1 space inserted, 2 anggota ditambah');
select uji.sama(uji.ambil('p2a') -> 'dilewati', '[{"space_id":"1100340000800901","ids":[312999999,900000000001]}]'::jsonb,
  'P2 anggota belum diimpor / rentang app → dilewati (dilaporkan)');
select uji.cek(jsonb_array_length(uji.ambil('p2a') -> 'gagal') = 3
               and uji.ambil('p2a') #>> '{gagal,0,err}' like '%belum diimpor%'
               and uji.ambil('p2a') #>> '{gagal,1,err}' like '%buatan app%'
               and uji.ambil('p2a') #>> '{gagal,2,err}' like '%member_ids wajib%',
  'P2 gagal per baris: space belum diimpor, space app, tanpa member_ids');
select uji.sama((select array_agg(member_id || ':' || sumber order by member_id) from public.space_anggota where space_id = '1100340000800901'),
  array['100000002:clickup', '100000003:clickup'], 'P2 space_anggota sumber clickup');
select uji.token(null);
select uji.cek((public.api_spaces(100000002) -> 'spaces') @> '[{"id":"1100340000800901"}]'
               and public.x_resolve(100000002, '1100340000800911') ->> 'type' = 'list',
  'P2 sesudah: anggota space privat melihat space & list-nya');
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.sama(public.impor_batch(900000000002, 'space_anggota',
  '[{"space_id":"1100340000800901","member_ids":[100000002,100000003]}]', 'sinkron') - 'gagal' - 'dilewati',
  '{"jenis":"space_anggota","mode":"sinkron","inserted":0,"updated":0,"unchanged":1,"ditambah":0,"dibuang":0}'::jsonb,
  'P2 idempoten: himpunan sama → unchanged');
reset role;
insert into public.space_anggota (space_id, member_id, sumber) values ('1100340000800901', 900000000001, 'app');
select uji.jadi_service();
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.simpan('p2c', public.impor_batch(900000000002, 'space_anggota',
  '[{"space_id":"1100340000800901","members":[{"user":{"id":100000002}}]}]', 'sinkron'));
select uji.cek((uji.ambil('p2c') ->> 'updated')::int = 1 and (uji.ambil('p2c') ->> 'dibuang')::int = 1
               and (select array_agg(member_id || ':' || sumber order by member_id) from public.space_anggota where space_id = '1100340000800901')
                   = array['100000002:clickup', '900000000001:app'],
  'P2 himpunan berubah (bentuk members[{user}]) → updated; anggota ClickUp dibuang, anggota buatan app tetap');
select uji.simpan('p2d', public.impor_batch(900000000002, 'space_anggota', '[{"space_id":"1100340000800901","member_ids":[]}]', 'sinkron'));
select uji.cek((uji.ambil('p2d') ->> 'dibuang')::int = 1
               and (select array_agg(member_id || ':' || sumber) from public.space_anggota where space_id = '1100340000800901')
                   = array['900000000001:app'],
  'P2 member_ids [] → anggota clickup dikosongkan, anggota app tetap');
select uji.token(null);
select uji.galat($$select public.x_resolve(100000002, '1100340000800911')$$, 'PT404', 'P2 anggota yang dibuang impor tidak melihat list privat lagi');
select uji.sama((public.impor_batch(900000000002, 'space_anggota', '[{"space_id":"1100340000800901","member_ids":[100000002]}]') ->> 'inserted')::int,
  1, 'P2 anggota clickup kosong lalu terisi lagi → inserted (tanpa header token: scope tidak dicek DB)');

-- ================================================================ P3 allowlist MIME lampiran
reset role;
select uji.cek((select allowed_mime_types @> array['application/vnd.ms-excel', 'text/tab-separated-values', 'application/msword',
                   'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/heic', 'image/heif',
                   'text/csv', 'application/pdf', 'image/png']
                   and not allowed_mime_types && array['image/svg+xml', 'text/html', 'application/zip']
                   and file_size_limit = 26214400 and not public
                  from storage.buckets where id = 'lampiran'),
  'P3 bucket lampiran: +xls/CSV Windows, tsv, doc, pptx, heic, heif; SVG/HTML/zip tetap ditolak');
insert into storage.objects (bucket_id, name, metadata) values
  ('lampiran', 't/rtujib0001/uji-p3-win.csv', '{"mimetype":"application/vnd.ms-excel","size":59}'),
  ('lampiran', 't/rtujib0001/uji-p3-foto.heic', '{"mimetype":"image/heic","size":2048}'),
  ('lampiran', 't/rtujib0001/uji-p3-arsip.zip', '{"mimetype":"application/zip","size":10}');
select uji.jadi(uji.budi());
select uji.cek((select j ->> 'mimetype' = 'application/vnd.ms-excel' and j ->> 'extension' = 'csv' and j ->> 'status_salin' = 'ok'
                  from (select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-p3-win.csv', 'ekspor.csv', null, null) j) x),
  'P3 web_lampiran_catat: CSV dari Windows (application/vnd.ms-excel) diterima');
select uji.sama(public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-p3-foto.heic', 'foto.heic', null, null) ->> 'mimetype',
  'image/heic', 'P3 web_lampiran_catat: foto iPhone (HEIC) diterima');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-p3-arsip.zip', 'x.zip', null, null)$$, 'PT400',
  'P3 zip tetap ditolak', 'tidak diizinkan');
reset role;
select uji.jadi_service();
select uji.token('eeeeeeee-0000-4000-8000-000000000001');
select uji.simpan('p3i', public.impor_batch(900000000002, 'attachments', '[
  {"id":"p3-lamp-zip","task_id":"z8r3pl0001","title":"arsip.zip","extension":"zip","mimetype":"application/zip","size":10,
   "url":"https://contoh.test/lampiran/arsip.zip","date":"1790000000000","user":{"id":100000001},"storage_path":null,"status_salin":"tautan_saja"}]'));
select uji.cek((uji.ambil('p3i') ->> 'inserted')::int = 1
               and (select status_salin = 'tautan_saja' and storage_path is null and clickup_url = 'https://contoh.test/lampiran/arsip.zip'
                      from public.attachments where id = 'p3-lamp-zip'),
  'P3 lampiran impor di luar allowlist: tautan_saja + clickup_url tersimpan');

-- ================================================================ P4 nama status: impor verbatim, Admin dinormalkan
select uji.sama((public.impor_batch(900000000002, 'lists',
  '[{"id":"1100340000800921","name":"List Status P4","space_id":"1100340000900001","folder_id":null}]') ->> 'inserted')::int, 1, 'P4 list impor');
select uji.sama((public.impor_batch(900000000002, 'list_statuses', '[{"list_id":"1100340000800921","statuses":[
    {"id":"scp4_0","status":"BACKLOG","type":"open","orderindex":0,"color":"#aaaaaa"},
    {"id":"scp4_1","status":"In Review","type":"custom","orderindex":1,"color":"#bbbbbb"},
    {"id":"scp4_2","status":"Closed","type":"closed","orderindex":2,"color":"#cccccc"}]}]') ->> 'inserted')::int, 3, 'P4 status impor');
select uji.sama((public.impor_batch(900000000002, 'tasks', '[{"id":"z8r3pl0004","name":"P4 kartu review","list":{"id":"1100340000800921"},
    "status":{"status":"In Review"},"creator":{"id":100000001},"date_created":"1790000000000","date_updated":"1790000000000"}]') ->> 'inserted')::int,
  1, 'P4 kartu impor berstatus "In Review"');
select uji.sama((select array_agg(status order by orderindex) from public.list_statuses where list_id = '1100340000800921'),
  array['BACKLOG', 'In Review', 'Closed'], 'P4 nama status impor verbatim (paritas ClickUp)');
select uji.sama(public.api_task(900000000002, 'z8r3pl0004') #>> '{status,status}', 'In Review', 'P4 api_task: status impor verbatim');
select uji.token(null);
reset role;
select uji.mode('utama');
select uji.jadi(uji.budi());
select uji.simpan('p4', public.web_admin_status_simpan('1100340000800921', '[
  {"status":"BACKLOG","type":"open","color":"#123456"},
  {"status":"  Sedang Ditinjau ","nama_lama":"In Review","type":"custom","color":"#bbbbbb"},
  {"status":" QA Akhir","type":"custom"},
  {"status":"Closed","type":"closed","color":"#cccccc"}]'));
select uji.sama((select array_agg(s ->> 'status' order by (s ->> 'orderindex')::int) from jsonb_array_elements(uji.ambil('p4') -> 'statuses') s),
  array['BACKLOG', 'sedang ditinjau', 'qa akhir', 'Closed'],
  'P4 Admin: status lama tak diubah tetap verbatim; ganti nama & status baru → trim + huruf kecil');
reset role;
select uji.cek((select status = 'sedang ditinjau' from public.tasks where id = 'z8r3pl0004')
               and (select color = '#123456' from public.list_statuses where list_id = '1100340000800921' and status = 'BACKLOG'),
  'P4 kartu ikut nama baru; ubah warna status impor tidak mengubah namanya');
select uji.jadi(uji.budi());
select uji.galat($$select public.web_admin_status_simpan('1100340000800921', '[{"status":"BACKLOG","type":"open"},{"status":"backlog","type":"custom"},
  {"status":"sedang ditinjau","type":"custom"},{"status":"Closed","type":"closed"}]')$$,
  'PT400', 'P4 tolak status baru yang hanya beda kapital dari status lama', 'ganda');
select uji.galat($$select public.web_admin_status_simpan('rlujib0001', '[{"status":"to do","type":"open"},{"status":"Review","type":"custom"},
  {"status":"REVIEW ","type":"custom"},{"status":"complete","type":"closed"}]')$$,
  'PT400', 'P4 tolak dua status baru beda kapital', 'ganda');
select uji.simpan('p4b', public.web_admin_status_simpan('rlujib0001', '[{"status":"To Do","type":"open"},
  {"status":"in progress","type":"custom"},{"status":"Complete","type":"closed"},{"status":"Menunggu QA","type":"custom"}]'));
select uji.sama((select array_agg(s ->> 'status' order by (s ->> 'orderindex')::int) from jsonb_array_elements(uji.ambil('p4b') -> 'statuses') s),
  array['to do', 'in progress', 'complete', 'menunggu qa'],
  'P4 list app: "To Do"/"Complete" dinormalkan ke status yang ada (tanpa ganda), status baru huruf kecil');
reset role;
select uji.mode('cermin');

-- ================================================================ P5 wadah diarsip tidak masuk Tugas Saya / TENGGAT / beban
select uji.jadi(uji.citra());
select uji.simpan('ts0', public.web_tugas_saya());
select uji.cek(uji.ids_saya(uji.ambil('ts0')) @> array['z8r3uj0003', 'z8r3uj0018'],
  'P5 awal: Tugas Saya Citra memuat kartu Fase Uji 1 (folder Eksekusi) & Follow-up (folder hidden)');
reset role;
select uji.sama(public.beban(100000003, public.hari_ini_wib()), 2, 'P5 awal: beban Dodi hari ini = 2 (Z2 + Z13, folder Eksekusi)');
select uji.cek((select (j #>> '{ringkas,telat}')::int > 0 from (select public.tenggat_hitung(null, '1100340000900011') j) x),
  'P5 awal: TENGGAT folder Eksekusi berisi kartu telat');
select uji.konteks('sinkron', null);
update public.folders set archived = true where id = '1100340000900011';
select uji.jadi(uji.citra());
select uji.cek((select not x && array['z8r3uj0003', 'z8r3uj0001', 'z8r3uj0011'] and x @> array['z8r3uj0018']
                  from (select uji.ids_saya(public.web_tugas_saya()) x) y),
  'P5 folder diarsip: kartunya hilang dari Tugas Saya, kartu folder lain tetap');
reset role;
select uji.sama(public.beban(100000003, public.hari_ini_wib()), 0, 'P5 folder diarsip: beban B5 tidak menghitung kartunya');
select uji.cek((select (j #>> '{ringkas,telat}')::int = 0 and (j #>> '{ringkas,hari_ini}')::int = 0 and jsonb_array_length(j -> 'per_anggota') = 0
                  from (select public.tenggat_hitung(null, '1100340000900011') j) x),
  'P5 folder diarsip: TENGGAT kosong');
select uji.konteks('sinkron', null);
update public.folders set archived = false where id = '1100340000900011';
update public.spaces set archived = true where id = '1100340000900001';
select uji.jadi(uji.citra());
select uji.cek((select not x && array['z8r3uj0003', 'z8r3uj0018', 'z8r3uj0011'] from (select uji.ids_saya(public.web_tugas_saya()) x) y),
  'P5 space diarsip: semua kartu space itu hilang dari Tugas Saya');
select uji.cek((select not x && array['z8r3uj0003', 'z8r3uj0018'] from (select uji.ids_saya(public.web_tugas_saya(100000002)) x) y),
  'P5 web_tugas_saya(p_member) ikut menyaring');
reset role;
select uji.jadi_service();
select uji.cek((select jsonb_array_length(j -> 'per_anggota') = 0 and (j #>> '{ringkas,telat}')::int = 0
                  from (select public.x_tenggat(900000000002, null, '1100340000900011') j) x),
  'P5 space diarsip: x_tenggat kosong');
reset role;
select uji.konteks('sinkron', null);
update public.spaces set archived = false where id = '1100340000900001';
update public.lists set archived = true where id = '1100340000900104';
select uji.jadi(uji.citra());
select uji.cek((select not x && array['z8r3uj0018', 'z8r3uj0020'] and x @> array['z8r3uj0003'] from (select uji.ids_saya(public.web_tugas_saya()) x) y),
  'P5 list diarsip (perilaku lama tetap): kartunya hilang, list lain tetap');
reset role;
select uji.konteks('sinkron', null);
update public.lists set archived = false where id = '1100340000900104';
select uji.jadi(uji.citra());
select uji.cek(uji.ids_saya(public.web_tugas_saya()) @> array['z8r3uj0003', 'z8r3uj0018', 'z8r3uj0020'], 'P5 buka arsip: kartu kembali');
reset role;
select uji.konteks(null, null);

-- ================================================================ P6 URL tampilan ClickUp (x_resolve + pencarian)
select uji.jadi_service();
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/l/6-1100340000900101-1'),
  '{"type":"list","id":"1100340000900101","url":"https://tugas.palletmeshindonesia.com/l/1100340000900101"}'::jsonb,
  'P6 resolve tampilan List /v/l/6-<list>-1');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/b/6-1100340000900102-2?pr=1100340000900001') ->> 'id',
  '1100340000900102', 'P6 resolve tampilan Board /v/b/6-<list>-2 (query dibuang)');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/li/1100340000900104/') ->> 'id',
  '1100340000900104', 'P6 resolve /v/li/<list>/');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/l/li/1100340000900104') ->> 'type',
  'list', 'P6 resolve /v/l/li/<list> (bersarang)');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/f/1100340000900011'),
  '{"type":"folder","id":"1100340000900011","url":null}'::jsonb, 'P6 resolve /v/f/<folder>');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/b/5-1100340000900011-2') ->> 'type',
  'folder', 'P6 resolve tampilan folder /v/b/5-<folder>-2');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/s/1100340000900001'),
  '{"type":"space","id":"1100340000900001","url":null}'::jsonb, 'P6 resolve /v/s/<space>');
select uji.sama(public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/o/s/1100340000900001') ->> 'type',
  'space', 'P6 resolve /v/o/s/<space> (bersarang)');
select uji.galat($$select public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/l/6-1100340000999999-1')$$, 'PT404',
  'P6 resolve tampilan list yang ID-nya tidak ada → 404');
select uji.galat($$select public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/l/7-1100340000004525-1')$$, 'PT404',
  'P6 resolve tampilan tingkat workspace (induk 7) → 404');
select uji.galat($$select public.x_resolve(900000000002, 'https://app.clickup.com/1100340000004525/v/f/1100340000900101')$$, 'PT404',
  'P6 resolve /v/f/ dengan ID list (jenis salah) → 404');
select uji.galat($$select public.x_resolve(100000003, 'https://app.clickup.com/1100340000004525/v/l/6-1100340000800911-1')$$, 'PT404',
  'P6 resolve list di space privat tanpa keanggotaan → 404');
select uji.sama(public.x_resolve(100000002, 'https://app.clickup.com/1100340000004525/v/l/6-1100340000800911-1') ->> 'id',
  '1100340000800911', 'P6 resolve list privat oleh anggota space');
select uji.sama(uji.ids(public.x_search(900000000002, 'https://app.clickup.com/1100340000004525/v/l/6-1100340000900104-1')),
  array['z8r3uj0018', 'z8r3uj0020'], 'P6 x_search URL list: kartu terbuka di list itu');
select uji.sama(uji.ids(public.x_search(900000000002, 'https://app.clickup.com/1100340000004525/v/b/6-1100340000900104-2', null, true)),
  array['z8r3uj0018', 'z8r3uj0019', 'z8r3uj0020'], 'P6 x_search URL board + include_closed: kartu selesai ikut');
select uji.cek((select x @> array['z8r3uj0001', 'z8r3uj0011', 'z8r3uj0016'] and not x && array['z8r3uj0008', 'z8r3uj0005', 'z8r3uj0018']
                  from (select uji.ids(public.x_search(900000000002, 'https://app.clickup.com/1100340000004525/v/f/1100340000900011')) x) y),
  'P6 x_search URL folder: kartu list di folder itu (tanpa arsip/selesai/folder lain)');
select uji.cek(jsonb_array_length(public.x_search(100000003, 'https://app.clickup.com/1100340000004525/v/li/1100340000800911')) = 0,
  'P6 x_search URL list privat tanpa keanggotaan → kosong');
reset role;
select uji.jadi(uji.budi());
select uji.simpan('wc', public.web_cari('https://app.clickup.com/1100340000004525/v/l/6-1100340000900104-1'));
select uji.cek(uji.ambil('wc') -> 'rujukan' = '{"type":"list","id":"1100340000900104","url":"https://tugas.palletmeshindonesia.com/l/1100340000900104"}'::jsonb
               and uji.ids(uji.ambil('wc') -> 'hasil') = array['z8r3uj0018', 'z8r3uj0019', 'z8r3uj0020'],
  'P6 web_cari URL list: rujukan {type,id,url} + kartu list itu');
select uji.sama(public.web_cari('https://app.clickup.com/1100340000004525/v/s/1100340000900001') #>> '{rujukan,type}', 'space',
  'P6 web_cari URL space: rujukan space');
select uji.cek((select j -> 'rujukan' = 'null'::jsonb and uji.ids(j -> 'hasil') @> array['z8r3uj0001'] from (select public.web_cari('Y7') j) x),
  'P6 web_cari teks biasa: rujukan null');
select uji.sama(public.web_cari('https://app.clickup.com/t/z8r3uj0002') -> 'rujukan', 'null'::jsonb, 'P6 web_cari URL tugas: rujukan null (kartu di hasil)');
reset role;
select uji.jadi(uji.dodi());
select uji.cek((select j -> 'rujukan' = 'null'::jsonb and j -> 'hasil' = '[]'::jsonb
                  from (select public.web_cari('https://app.clickup.com/1100340000004525/v/li/1100340000800911') j) x),
  'P6 web_cari URL list privat tanpa keanggotaan: rujukan null, hasil kosong');
reset role;

rollback;
