-- 13 · Fungsi web (authenticated): baca agregat, tulis (versi 409, izin hapus owner, cermin), komentar & mention,
-- lampiran (Storage), admin owner (anggota, status, struktur, libur, mode, token).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- uuid akun seed
create function uji.budi() returns uuid language sql immutable as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function uji.citra() returns uuid language sql immutable as $$ select '22222222-2222-4222-8222-222222222222'::uuid $$;
create function uji.dodi() returns uuid language sql immutable as $$ select '33333333-3333-4333-8333-333333333333'::uuid $$;
create function uji.eka() returns uuid language sql immutable as $$ select '44444444-4444-4444-8444-444444444444'::uuid $$;
grant execute on all functions in schema uji to public;

-- ================================================================ hak & sesi
select uji.jadi_anon();
select uji.galat($$select public.web_saya()$$, '42501', 'anon: web_saya ditolak');
reset role;
select uji.jadi('99999999-9999-4999-8999-999999999999');
select uji.sama(public.web_saya() -> 'member', 'null'::jsonb, 'non-anggota: web_saya member null');
select uji.cek(not (public.web_saya() ->> 'anggota_aktif')::boolean, 'non-anggota: anggota_aktif false');
select uji.galat($$select public.web_struktur()$$, 'PT403', 'non-anggota: web_struktur → 403', 'belum terdaftar', 'ACCESS_001');
select uji.galat($$select public.web_detail('rtujib0001')$$, 'PT403', 'non-anggota: web_detail → 403');
reset role;
select uji.jadi_service();
select uji.galat($$select public.web_saya()$$, '42501', 'service_role: web_* tidak di-grant');
reset role;

select uji.jadi(uji.citra());
select uji.simpan('saya', public.web_saya());
select uji.cek((select j #>> '{member,username}' = 'citra lestari' and j #>> '{member,role}' = 'member'
                   and (j ->> 'anggota_aktif')::boolean and not (j ->> 'owner')::boolean and j ->> 'mode' = 'cermin'
                   and j ->> 'app_base_url' = 'https://tugas.palletmeshindonesia.com' and (j ->> 'notif_belum')::int >= 0
                from (select uji.ambil('saya') j) x), 'web_saya: profil, mode, base url');

-- ================================================================ baca
select uji.simpan('str', public.web_struktur());
select uji.cek((uji.ambil('str') -> 'spaces') @> '[{"id":"1100340000900001"},{"id":"rsujib0001"}]', 'web_struktur: 2 space seed');
select uji.cek((select jsonb_array_length(s -> 'folders') = 2 and bool_or((f ->> 'hidden')::boolean)
                from jsonb_array_elements(uji.ambil('str') -> 'spaces') s, jsonb_array_elements(s -> 'folders') f
               where s ->> 'id' = '1100340000900001' group by s), 'web_struktur: folder hidden ikut');
select uji.cek((select l -> 'hitungan' ?& array['terbuka','selesai','telat','arsip'] and jsonb_array_length(l -> 'statuses') = 3
                   and not (l ->> 'tidak_ditagih')::boolean
                from jsonb_array_elements(uji.ambil('str') -> 'spaces') s, jsonb_array_elements(s -> 'lists') l
               where l ->> 'id' = 'rlujib0001'), 'web_struktur: list tanpa folder + status + hitungan');
select uji.cek((select (l ->> 'tidak_ditagih')::boolean
                from jsonb_array_elements(uji.ambil('str') -> 'spaces') s, jsonb_array_elements(s -> 'folders') f,
                     jsonb_array_elements(f -> 'lists') l where l ->> 'id' = '1100340000900103'), 'web_struktur: tidak_ditagih');
-- (review R5) hitungan telat mengikuti pagar B10: list tidak ditagih = 0 telat (seed: A9 due -10 hari, terbuka),
-- kartu BERSYARAT/CADANGAN/DITUNDA dihitung di 'menunggu', bukan 'telat' (seed: H2 BERSYARAT di Fase Uji 1).
select uji.cek((select (l #>> '{hitungan,telat}')::int = 0 and (l #>> '{hitungan,terbuka}')::int >= 1
                from jsonb_array_elements(uji.ambil('str') -> 'spaces') s, jsonb_array_elements(s -> 'folders') f,
                     jsonb_array_elements(f -> 'lists') l where l ->> 'id' = '1100340000900103'),
  'R5 web_struktur: list tidak ditagih → telat 0');
select uji.cek((select (l #>> '{hitungan,menunggu}')::int >= 1
                   and (l #>> '{hitungan,telat}')::int
                       = (select count(*)::int from public.tasks t where t.list_id = '1100340000900101' and t.deleted_at is null
                           and not t.archived and t.status_type not in ('closed', 'done') and t.due_wib < public.hari_ini_wib()
                           and t.name !~* '(BERSYARAT|CADANGAN|DITUNDA)')
                from jsonb_array_elements(uji.ambil('str') -> 'spaces') s, jsonb_array_elements(s -> 'folders') f,
                     jsonb_array_elements(f -> 'lists') l where l ->> 'id' = '1100340000900101'),
  'R5 web_struktur: BERSYARAT masuk menunggu, tidak dihitung telat');

-- web_tugas_saya: tanggal dipatok lewat app.hari_ini, kartu uji bertanggal tetap
reset role;
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name, due_at) values
  ('rtujisaya1', 'rlujib0001', 'Saya telat', '2026-09-25 12:00+07'),
  ('rtujisaya2', 'rlujib0001', 'Saya hari ini', '2026-10-02 12:00+07'),
  ('rtujisaya3', 'rlujib0001', 'Saya Senin', '2026-10-05 12:00+07'),
  ('rtujisaya4', 'rlujib0001', 'Saya nanti', '2026-10-20 12:00+07'),
  ('rtujisaya5', 'rlujib0001', 'Saya parkir', null),
  ('rtujisaya6', 'rlujib0001', 'Saya selesai', '2026-09-25 12:00+07'),
  ('rtujisaya7', 'rlujib0001', 'Saya BERSYARAT telat', '2026-09-25 12:00+07'),
  ('rtujisaya8', 'rlujib0001', 'Saya CADANGAN besok', '2026-10-05 12:00+07'),
  ('rtujisaya9', 'rlujib0001', 'Saya ditunda tanpa due', null);
insert into public.lists (id, space_id, name, tidak_ditagih) values ('rlujisayatd', 'rsujib0001', 'Di luar periode (uji)', true);
insert into public.tasks (id, list_id, name, due_at) values
  ('rtujisayat1', 'rlujisayatd', 'Saya di luar periode telat', '2026-09-20 12:00+07'),
  ('rtujisayat2', 'rlujisayatd', 'Saya di luar periode BERSYARAT', '2026-10-02 12:00+07');
update public.tasks set status = 'complete' where id = 'rtujisaya6';
insert into public.task_assignees (task_id, member_id) select id, 100000003 from public.tasks where id like 'rtujisaya%';
select set_config('app.hari_ini', '2026-10-02', true);
select uji.jadi(uji.dodi());
select uji.simpan('saya2', public.web_tugas_saya());
select uji.sama(uji.kunci(uji.ambil('saya2')),
  array['hari_ini','member','menunggu_keputusan','nanti','tanggal','tanpa_due','telat','tidak_ditagih','tiga_hk'],
  'web_tugas_saya: kelompok (+ menunggu_keputusan & tidak_ditagih, review R5)');
select uji.cek((select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(uji.ambil('saya2') -> 'telat') x
                 where x ->> 'id' like 'rtujisaya%') = array['rtujisaya1'],
  'R5 Tugas Saya: Telat hanya kartu biasa (tanpa BERSYARAT/CADANGAN/DITUNDA & list tidak ditagih)');
select uji.cek((select array_agg((x ->> 'id') || '/' || coalesce(x ->> 'lewat_hari', '-') || '/' || (x ->> 'kategori_due')
                                 order by x ->> 'id')
                from jsonb_array_elements(uji.ambil('saya2') -> 'menunggu_keputusan') x where x ->> 'id' like 'rtujisaya%')
               = array['rtujisaya7/7/menunggu_keputusan', 'rtujisaya8/-/menunggu_keputusan', 'rtujisaya9/-/menunggu_keputusan'],
  'R5 Tugas Saya: grup menunggu_keputusan (lewat_hari hanya bila lewat due, kategori_due sama)');
select uji.cek((select array_agg((x ->> 'id') || '/' || coalesce(x ->> 'lewat_hari', '-') || '/' || (x ->> 'kategori_due')
                                 order by x ->> 'id')
                from jsonb_array_elements(uji.ambil('saya2') -> 'tidak_ditagih') x where x ->> 'id' like 'rtujisaya%')
               = array['rtujisayat1/12/tidak_ditagih', 'rtujisayat2/-/tidak_ditagih'],
  'R5 Tugas Saya: grup tidak_ditagih (list tidak ditagih didahulukan dari BERSYARAT, seperti tenggat_hitung)');
select uji.cek(not (uji.ambil('saya2') -> 'tiga_hk') @> '[{"id":"rtujisaya8"}]'
               and not (uji.ambil('saya2') -> 'tanpa_due') @> '[{"id":"rtujisaya9"}]',
  'R5 Tugas Saya: kartu menunggu keputusan tidak ikut grup due lain');
select uji.cek((select bool_and(x ->> 'kategori_due' = g.k)
                from (values ('telat'), ('hari_ini'), ('tiga_hk'), ('nanti'), ('tanpa_due')) g(k),
                     jsonb_array_elements(uji.ambil('saya2') -> g.k) x),
  'R5 baris web: kategori_due = grup Tugas Saya');
select uji.cek((select x ->> 'lewat_hari' = '7' from jsonb_array_elements(uji.ambil('saya2') -> 'telat') x where x ->> 'id' = 'rtujisaya1'),
  'Tugas Saya: telat + lewat_hari');
select uji.cek(uji.ambil('saya2') -> 'hari_ini' @> '[{"id":"rtujisaya2"}]', 'Tugas Saya: hari ini');
select uji.cek((select x ->> 'sisa_hk' = '1' from jsonb_array_elements(uji.ambil('saya2') -> 'tiga_hk') x where x ->> 'id' = 'rtujisaya3'),
  'Tugas Saya: ≤3 hari kerja + sisa_hk');
select uji.cek(uji.ambil('saya2') -> 'nanti' @> '[{"id":"rtujisaya4"}]' and uji.ambil('saya2') -> 'tanpa_due' @> '[{"id":"rtujisaya5"}]',
  'Tugas Saya: nanti & tanpa due');
select uji.cek(not uji.ambil('saya2')::text like '%rtujisaya6%', 'Tugas Saya: kartu selesai tidak tampil');
select uji.sama(uji.kunci(uji.ambil('saya2') #> '{hari_ini,0}'),
  array['archived','assignees','closed_at','comment_count','created_at','deleted_at','due_at','due_has_time','due_wib','folder_id','id',
        'kategori_due','kategori_kerja','last_comment_at','list','menunggu_keputusan','name','orderindex','parent_id','priority','selesai',
        'space_id','start_at','status','status_color','status_type','sumber','updated_at','url','versi'],
  'baris web: kunci (+ kategori_due R5, + kategori_kerja 28 Okt)');
select uji.sama(public.web_tugas_saya(100000003) -> 'telat', uji.ambil('saya2') -> 'telat', 'web_tugas_saya(p_member) = milik anggota itu');
select uji.galat($$select public.web_tugas_saya(424242)$$, 'PT404', 'web_tugas_saya anggota tak ada → 404');
select set_config('app.hari_ini', '', true);

select uji.simpan('dft', public.web_daftar('rlujib0001'));
select uji.cek(not (uji.ambil('dft') -> 'tasks') @> '[{"id":"rtujib0004"}]' and not (uji.ambil('dft') -> 'tasks') @> '[{"id":"rtujib0003"}]'
               and (uji.ambil('dft') -> 'tasks') @> '[{"id":"rtujib0001"}]',
  'web_daftar: tanpa terhapus & tanpa selesai (default)');
select uji.cek((public.web_daftar('rlujib0001', true) -> 'tasks') @> '[{"id":"rtujib0003"}]', 'web_daftar include_closed');
select uji.cek((uji.ambil('dft') #>> '{list,boleh_ubah}')::boolean and not (public.web_daftar('1100340000900101') #>> '{list,boleh_ubah}')::boolean,
  'web_daftar: boleh_ubah (app ya, ClickUp saat cermin tidak)');
select uji.galat($$select public.web_daftar('tidakada')$$, 'PT404', 'web_daftar list tak ada → 404');

-- web_detail
select uji.simpan('det', public.web_detail('rtujib0001'));
select uji.sama(uji.kunci(uji.ambil('det')), array['activity','assignees','boleh','komentar','lampiran','parent','peringatan','subtasks','task'],
  'web_detail: satu panggilan berisi semua bagian layar');
select uji.cek((select j #>> '{task,markdown}' like 'Contoh deskripsi **markdown**%' and j #> '{task,creator}' ? 'username'
                   and jsonb_array_length(j #> '{task,statuses}') = 3 and j #>> '{task,space,id}' = 'rsujib0001'
                   and j #> '{task,folder}' = 'null' and (j #>> '{task,versi}')::int >= 1
                from (select uji.ambil('det') j) x), 'web_detail task: markdown, creator, statuses, space, versi');
select uji.sama((select array_agg(s ->> 'id') from jsonb_array_elements(uji.ambil('det') -> 'subtasks') s), array['rtujib0005'], 'web_detail: sub-tugas');
select uji.cek((select bool_and(a ? 'beban' and a ? 'beban_lebih') and count(*) = 2 from jsonb_array_elements(uji.ambil('det') -> 'assignees') a),
  'web_detail: assignee + beban B5 pada due');
select uji.cek((select c ->> 'id' = 'rcujib000001' and c -> 'mentions' = '[900000000001]'
                   and jsonb_array_length(c -> 'balasan') = 1 and c #>> '{balasan,0,id}' = 'rcujib000002'
                   and c #>> '{author,username}' = 'budi santoso'
                from (select uji.ambil('det') #> '{komentar,0}' c) x), 'web_detail: komentar + balasan + mention');
select uji.cek(jsonb_array_length(uji.ambil('det') -> 'activity') > 0 and uji.ambil('det') #>> '{activity,0,jenis}' = 'dibuat',
  'web_detail: riwayat');
select uji.cek((uji.ambil('det') #>> '{boleh,ubah}')::boolean and not (uji.ambil('det') #>> '{boleh,hapus}')::boolean
               and not (uji.ambil('det') #>> '{boleh,cermin}')::boolean, 'web_detail: izin member (ubah ya, hapus tidak)');
select uji.cek((select jsonb_array_length(j -> 'lampiran') = 1 and jsonb_array_length(j #> '{komentar,0,lampiran}') = 1
                   and j #>> '{lampiran,0,title}' = 'bukti-uji.png'
                from (select public.web_detail('rtujib0003') j) x), 'web_detail: lampiran (juga di komentarnya)');
select uji.cek((select (j #>> '{boleh,cermin}')::boolean and not (j #>> '{boleh,ubah}')::boolean and j #>> '{task,folder,id}' = '1100340000900011'
                from (select public.web_detail('z8r3uj0001') j) x), 'web_detail kartu ClickUp: cermin, tidak boleh ubah');
select uji.cek((public.web_detail('rtujib0004') #>> '{task,deleted_at}') is not null, 'web_detail tugas terhapus (Sampah) tetap bisa');
select uji.galat($$select public.web_detail('tidakada')$$, 'PT404', 'web_detail tak ada → 404');

select uji.sama(public.web_cari('Y7') #>> '{hasil,0,id}', 'z8r3uj0001', 'web_cari: kode kartu');
select uji.cek((public.web_cari('Uji rekap') -> 'hasil') @> '[{"id":"z8r3uj0005"}]', 'web_cari: termasuk kartu selesai');
select uji.sama((select count(*)::int from jsonb_array_elements(public.web_anggota()) a
                  where (a ->> 'id')::bigint in (100000001, 100000002, 100000003, 900000000001, 900000000002)), 5,
  'web_anggota: 5 anggota seed');
select uji.cek((select bool_and(a ?& array['id','username','role','aktif','punya_akun']) from jsonb_array_elements(public.web_anggota()) a),
  'web_anggota: kunci');
select uji.cek(public.web_tenggat() ?& array['tanggal','per_anggota','beban','ringkas'], 'web_tenggat: bentuk sama x_tenggat');
reset role;

-- notifikasi
select uji.jadi(uji.eka());
select uji.simpan('notif', public.web_notif(10));
select uji.cek((uji.ambil('notif') ->> 'belum')::int > 0 and jsonb_array_length(uji.ambil('notif') -> 'items') > 0
               and uji.ambil('notif') #> '{items,0}' ?& array['id','jenis','task','actor','created_at','read_at','cuplikan'],
  'web_notif: belum dibaca + item');
select uji.cek((select bool_and((select member_id from public.notifications n where n.id = (i ->> 'id')::bigint) = 900000000001)
                from jsonb_array_elements(uji.ambil('notif') -> 'items') i), 'web_notif: hanya milik sendiri');
select uji.sama((public.web_notif_baca(array[(uji.ambil('notif') #>> '{items,0,id}')::bigint]) ->> 'dibaca')::int, 1, 'web_notif_baca: satu id');
select uji.sama((public.web_notif_baca(null) ->> 'dibaca')::int, (uji.ambil('notif') ->> 'belum')::int - 1, 'web_notif_baca(null): sisanya');
select uji.sama((public.web_notif(10) ->> 'belum')::int, 0, 'web_notif: belum = 0 setelah dibaca');
reset role;
select uji.cek((select count(*) > 0 from public.notifications where member_id <> 900000000001 and read_at is null),
  'web_notif_baca tidak menyentuh notifikasi orang lain');

-- ================================================================ tulis
select uji.jadi(uji.citra());
select uji.simpan('buat', public.web_buat_tugas('rlujib0001',
  '{"name":"Uji web buat","markdown":"isi **web**","due":"2026-10-05","assignees":[100000003],"priority":3}'));
select uji.cek((select j ->> 'id' ~ '^rt' and j ->> 'due_wib' = '2026-10-05' and (j ->> 'versi')::int = 1
                   and j #>> '{assignees,0,username}' = 'dodi pratama' and j ->> 'status' = 'to do'
                from (select uji.ambil('buat') j) x), 'web_buat_tugas: baris web, due alias, assignee');
reset role;
select uji.cek((select sumber = 'ui' and actor_id = 100000002 and lengkap from uji.akt(uji.ambil('buat') ->> 'id', 'dibuat')),
  'web_buat_tugas: activity sumber ui, aktor Citra');
select uji.sama((select count(*)::int from public.notifications where task_id = uji.ambil('buat') ->> 'id' and member_id = 100000003 and jenis = 'assign'), 1,
  'web_buat_tugas: notifikasi assign ke Dodi');
select uji.jadi(uji.citra());

-- versi optimistis
select uji.simpan('ubah', public.web_ubah_tugas(uji.ambil('buat') ->> 'id', '{"name":"Uji web ubah","status":"in progress"}', 1));
select uji.cek((select j ->> 'name' = 'Uji web ubah' and j ->> 'status' = 'in progress' and (j ->> 'versi')::int = 2
                from (select uji.ambil('ubah') j) x), 'web_ubah_tugas: versi cocok → berubah, versi naik');
select uji.galat(format($$select public.web_ubah_tugas(%L, '{"name":"basi"}', 1)$$, uji.ambil('buat') ->> 'id'), 'PT409',
  'web_ubah_tugas: versi basi → 409 KONFLIK_001', 'sudah diubah orang lain', 'KONFLIK_001');
select uji.galat(format($$select public.web_ubah_tugas(%L, '{"name":"x"}', null)$$, uji.ambil('buat') ->> 'id'), 'PT400', 'web_ubah_tugas: tanpa versi → 400');
select uji.simpan('ubah2', public.web_ubah_tugas(uji.ambil('buat') ->> 'id', '{"assignees":[100000002, 900000000001],"due":null}',
  (uji.ambil('ubah') ->> 'versi')::int));
select uji.cek((select jsonb_array_length(j -> 'assignees') = 2 and j -> 'due_wib' = 'null'
                   and not (j -> 'assignees') @> '[{"id":100000003}]' from (select uji.ambil('ubah2') j) x),
  'web_ubah_tugas: assignees himpunan penuh, due null = parkir');
select uji.galat($$select public.web_ubah_tugas('z8r3uj0002', '{"name":"x"}', (select versi from public.tasks where id = 'z8r3uj0002'))$$,
  'PT409', 'web_ubah_tugas kartu ClickUp saat cermin → 409 CERMIN_001', 'Mode cermin', 'CERMIN_001');
select uji.galat($$select public.web_ubah_tugas('rtujib0004', '{"name":"x"}', 1)$$, 'PT404', 'web_ubah_tugas terhapus → 404');

select uji.cek((select j ->> 'status' = 'complete' and j ->> 'orderindex' = '7.5' and (j ->> 'selesai')::boolean
                from (select public.web_urut(uji.ambil('buat') ->> 'id', 'complete', 7.5) j) x), 'web_urut: status + orderindex (board)');
select uji.sama(public.web_urut(uji.ambil('buat') ->> 'id', null, 2) ->> 'status', 'complete', 'web_urut: status null = tetap');
select uji.galat(format($$select public.web_urut(%L, 'entah', 1)$$, uji.ambil('buat') ->> 'id'), 'PT400', 'web_urut status tak dikenal → 400');
reset role;
select uji.konteks('ui', 100000001);
insert into public.lists (id, space_id, name) values ('rlujiwebpnd', 'rsujib0001', 'Tujuan web');
select uji.jadi(uji.citra());
select uji.cek((select j #>> '{list,id}' = 'rlujiwebpnd' and j ->> 'status' = 'complete'
                from (select public.web_pindah(uji.ambil('buat') ->> 'id', 'rlujiwebpnd') j) x), 'web_pindah: list + status dipetakan');
select uji.cek((public.web_arsip(uji.ambil('buat') ->> 'id', true) ->> 'archived')::boolean, 'web_arsip true');
select uji.cek(not (public.web_arsip(uji.ambil('buat') ->> 'id', false) ->> 'archived')::boolean, 'web_arsip false');

-- hapus / pulihkan / purge: owner saja
select uji.galat(format($$select public.web_hapus(%L)$$, uji.ambil('buat') ->> 'id'), 'PT403', 'member: web_hapus → 403 HAPUS_OWNER', null, 'HAPUS_OWNER');
select uji.galat($$select public.web_pulihkan('rtujib0004')$$, 'PT403', 'member: web_pulihkan → 403', null, 'HAPUS_OWNER');
select uji.galat($$select public.web_purge('rtujib0004')$$, 'PT403', 'member: web_purge → 403', null, 'HAPUS_OWNER');
reset role;
select uji.jadi(uji.budi());
select uji.galat(format($$select public.web_purge(%L)$$, uji.ambil('buat') ->> 'id'), 'PT400', 'owner: purge tugas yang belum di Sampah → 400');
select uji.cek((public.web_hapus(uji.ambil('buat') ->> 'id') ->> 'deleted_at') is not null, 'owner: web_hapus → Sampah');
select uji.cek((public.web_pulihkan(uji.ambil('buat') ->> 'id') -> 'deleted_at') = 'null', 'owner: web_pulihkan');
select uji.galat($$select public.web_hapus('z8r3uj0006')$$, 'PT409', 'owner: hapus kartu ClickUp saat cermin → 409');
select uji.simpan('pg', public.web_purge('rtujib0004'));
select uji.cek(uji.ambil('pg') -> 'purged' = '["rtujib0004"]' and uji.ambil('pg') -> 'storage_paths' = '[]', 'owner: web_purge → {purged, storage_paths}');
reset role;
select uji.cek(not exists (select 1 from public.tasks where id = 'rtujib0004') and uji.n_act('rtujib0004', 'hapus') >= 2,
  'purge: baris hilang, riwayat tetap (hapus lunak + purge permanen)');
-- purge ikut sub-tugas & kembalikan path lampiran
select uji.konteks('ui', 100000001);
update public.tasks set deleted_at = now() where id = 'rtujib0003';
select uji.jadi(uji.budi());
select uji.simpan('pg2', public.web_purge('rtujib0003'));
select uji.sama(uji.ambil('pg2') -> 'storage_paths', '["t/rtujib0003/6f1c2e8a-0000-4000-8000-000000000001-bukti-uji.png"]'::jsonb,
  'purge: path Storage lampiran dikembalikan untuk dibersihkan');
reset role;

-- komentar
select uji.jadi(uji.citra());
select uji.simpan('kom', public.web_komentar('rtujib0001', 'Tolong cek @eka wulandari ya', null, null));
select uji.cek((select j ->> 'id' ~ '^rc' and j -> 'mentions' = '[900000000001]' and j #>> '{author,username}' = 'citra lestari'
                   and not (j ->> 'dihapus')::boolean from (select uji.ambil('kom') j) x), 'web_komentar: mention @username');
select uji.sama(public.web_komentar('rtujib0001', 'Dodi lihat ini', null, array[100000003]::bigint[]) -> 'mentions', '[100000003]'::jsonb,
  'web_komentar: p_mentions dari autocomplete');
select uji.cek((select j ->> 'parent_id' = 'rcujib000001' from (select public.web_komentar('rtujib0001', 'balasan web', 'rcujib000002', null) j) x),
  'web_komentar: balasan ke balasan → top-level');
select uji.galat($$select public.web_komentar('rtujib0001', '  ', null, null)$$, 'PT400', 'web_komentar kosong → 400');
select uji.galat($$select public.web_komentar('z8r3uj0001', 'x', null, null)$$, 'PT409', 'web_komentar kartu ClickUp saat cermin → 409');
reset role;
select uji.jadi(uji.dodi());
select uji.galat(format($$select public.web_komentar_edit(%L, 'diubah Dodi')$$, uji.ambil('kom') ->> 'id'), 'PT403',
  'bukan penulis: edit → 403', null, 'ACCESS_001');
select uji.galat(format($$select public.web_komentar_hapus(%L)$$, uji.ambil('kom') ->> 'id'), 'PT403', 'bukan penulis/owner: hapus → 403');
reset role;
select uji.jadi(uji.citra());
select uji.cek((select j ->> 'text' = 'Tolong cek @eka wulandari dan @dodi pratama' and j ->> 'edited_at' is not null
                   and j -> 'mentions' = '[100000003, 900000000001]'
                from (select public.web_komentar_edit(uji.ambil('kom') ->> 'id', 'Tolong cek @eka wulandari dan @dodi pratama') j) x),
  'penulis: edit + mention baru tercatat');
reset role;
select uji.jadi(uji.budi());
select uji.cek((select (j ->> 'dihapus')::boolean and j -> 'text' = 'null' from (select public.web_komentar_hapus(uji.ambil('kom') ->> 'id') j) x),
  'owner: hapus komentar orang lain; teks disembunyikan');
select uji.galat(format($$select public.web_komentar_hapus(%L)$$, uji.ambil('kom') ->> 'id'), 'PT404', 'hapus komentar lagi → 404');
reset role;

-- lampiran (objek Storage dibuat langsung sebagai postgres)
insert into storage.objects (bucket_id, name, metadata) values
  ('lampiran', 't/rtujib0001/uji-web-a.png', '{"mimetype":"image/png","size":1234}'),
  ('lampiran', 't/rtujib0001/uji-web-b.svg', '{"mimetype":"image/svg+xml","size":10}'),
  ('lampiran', 't/rtujib0001/uji-web-c.pdf', '{"mimetype":"application/pdf","size":30000000}');
select uji.jadi(uji.citra());
select uji.simpan('lamp', public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-web-a.png', 'Bukti A.png', 'text/plain', 1));
select uji.cek((select j ->> 'id' ~ '^[0-9a-f-]{36}$' and j ->> 'mimetype' = 'image/png' and (j ->> 'size')::int = 1234
                   and j ->> 'extension' = 'png' and j #>> '{uploaded_by,username}' = 'citra lestari' and j ->> 'status_salin' = 'ok'
                from (select uji.ambil('lamp') j) x), 'web_lampiran_catat: MIME & ukuran dari metadata Storage');
select uji.sama(public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-web-a.png', 'lagi', null, null) ->> 'id',
  uji.ambil('lamp') ->> 'id', 'web_lampiran_catat idempoten per path');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0002/x.png', 'x', 'image/png', 1)$$, 'PT400',
  'path bukan t/<task>/ → 400');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/belum-ada.png', 'x', 'image/png', 1)$$, 'PT400',
  'berkas belum terunggah → 400', 'belum terunggah');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-web-b.svg', 'x', null, null)$$, 'PT400',
  'SVG ditolak', 'tidak diizinkan');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', null, 't/rtujib0001/uji-web-c.pdf', 'x', null, null)$$, 'PT400',
  '> 25 MB ditolak');
reset role;
select uji.jadi(uji.dodi());
select uji.galat(format($$select public.web_lampiran_hapus(%L)$$, uji.ambil('lamp') ->> 'id'), 'PT403', 'bukan pengunggah: hapus lampiran → 403');
reset role;
select uji.jadi(uji.citra());
select uji.cek((public.web_lampiran_hapus(uji.ambil('lamp') ->> 'id') ->> 'deleted_at') is not null, 'pengunggah: hapus lampiran');
select uji.galat($$select public.web_lampiran_catat('rtujib0001', '90180000000001', 't/rtujib0001/uji-web-a.png', 'x', null, null)$$, 'PT404',
  'lampiran ke komentar tugas lain → 404');
reset role;

-- ganti password
update public.members set harus_ganti_password = true where id = 100000002;
select uji.jadi(uji.citra());
select uji.sama(public.web_sudah_ganti_password(), '{"harus_ganti_password":false}'::jsonb, 'web_sudah_ganti_password');
select uji.cek(not (public.web_saya() #>> '{member,harus_ganti_password}')::boolean, 'flag ganti password turun');

-- ================================================================ admin (owner saja)
select uji.galat($$select public.web_admin_tokens()$$, 'PT403', 'member: admin → 403', 'Hanya owner', 'ACCESS_001');
select uji.galat($$select public.web_admin_mode('utama')$$, 'PT403', 'member: web_admin_mode → 403');
select uji.galat($$select public.web_admin_anggota_simpan('{"username":"x"}')$$, 'PT403', 'member: anggota → 403');
reset role;
select uji.jadi(uji.budi());

-- anggota
select uji.simpan('agt', public.web_admin_anggota_simpan('{"username":"anggota web uji","nama":"Anggota Web","email":"web.uji@contoh.test"}'));
select uji.cek((select (j ->> 'id')::bigint >= 900000000000 and j ->> 'role' = 'member' and (j ->> 'aktif')::boolean
                   and j ->> 'initials' = 'AN' from (select uji.ambil('agt') j) x), 'admin anggota: buat baru (id sequence)');
select uji.sama(public.web_admin_anggota_simpan(jsonb_build_object('id', uji.ambil('agt') -> 'id', 'username', 'anggota web ganti')) ->> 'username',
  'anggota web ganti', 'admin anggota: username anggota app boleh diganti');
select uji.galat($$select public.web_admin_anggota_simpan('{"id":100000002,"username":"citra baru"}')$$, 'PT400',
  'admin anggota: username impor ClickUp dikunci', 'dikunci');
select uji.sama(public.web_admin_anggota_simpan('{"id":100000002,"nama":"Citra L (uji)"}') ->> 'nama', 'Citra L (uji)', 'admin anggota: ubah nama');
select uji.galat($$select public.web_admin_anggota_simpan('{"id":100000001,"role":"member"}')$$, 'PT400', 'owner tidak bisa menurunkan diri');
select uji.galat($$select public.web_admin_anggota_simpan('{"username":"citra lestari"}')$$, 'PT409', 'username dobel → 409', null, 'KONFLIK_001');
select uji.galat($$select public.web_admin_anggota_simpan('{"id":100000002,"role":"raja"}')$$, 'PT400', 'role tak dikenal → 400');
select uji.cek(not (public.web_admin_anggota_simpan(jsonb_build_object('id', uji.ambil('agt') -> 'id', 'aktif', false)) ->> 'aktif')::boolean,
  'admin anggota: nonaktifkan');

-- status list
reset role;
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name, status) values ('rtujistat1', 'rlujib0001', 'Kartu in progress', 'in progress');
select uji.jadi(uji.budi());
select uji.simpan('sts', public.web_admin_status_simpan('rlujib0001', '[
  {"status":"to do","type":"open","color":"#d3d3d3"},
  {"status":"dikerjakan","nama_lama":"in progress","type":"custom","color":"#4194f6"},
  {"status":"review","type":"custom","color":"#f9d900"},
  {"status":"complete","type":"closed","color":"#6bc950"}]'));
select uji.sama((select array_agg(s ->> 'status' order by (s ->> 'orderindex')::int) from jsonb_array_elements(uji.ambil('sts') -> 'statuses') s),
  array['to do','dikerjakan','review','complete'], 'admin status: ganti nama + tambah, urutan');
reset role;
select uji.cek(not exists (select 1 from public.tasks where list_id = 'rlujib0001' and status = 'in progress')
               and (select status = 'dikerjakan' from public.tasks where id = 'rtujistat1')
               and uji.n_act('rtujistat1', 'status') = 0, 'admin status: tugas ikut nama baru (tanpa activity status palsu)');
select uji.konteks('ui', 100000001);
update public.tasks set status = 'review' where id = 'rtujib0006';
select uji.jadi(uji.budi());
select uji.galat($$select public.web_admin_status_simpan('rlujib0001', '[{"status":"to do","type":"open"},{"status":"complete","type":"closed"},{"status":"dikerjakan","type":"custom"}]')$$,
  'PT409', 'admin status: buang status yang dipakai → 409', 'masih dipakai', 'KONFLIK_001');
select uji.galat($$select public.web_admin_status_simpan('rlujib0001', '[{"status":"to do","type":"open"},{"status":"review","type":"custom"},{"status":"dikerjakan","type":"custom"}]')$$,
  'PT400', 'admin status: tanpa closed → 400');
select uji.galat($$select public.web_admin_status_simpan('rlujib0001', '[{"status":"a","type":"open"},{"status":"A","type":"closed"}]')$$,
  'PT400', 'admin status: nama ganda → 400');
select uji.galat($$select public.web_admin_status_simpan('1100340000900101', '[{"status":"to do","type":"open"},{"status":"in progress","type":"custom"},{"status":"complete","type":"closed","color":"#000000"}]')$$,
  'PT409', 'admin status list ClickUp saat cermin → 409');

-- struktur
select uji.simpan('sp', public.web_admin_struktur_simpan('{"jenis":"space","name":"Uji Coba"}'));
select uji.cek(uji.ambil('sp') ->> 'id' ~ '^rs' and uji.ambil('sp') ->> 'sumber' = 'app', 'admin struktur: space baru');
select uji.simpan('fd', public.web_admin_struktur_simpan(jsonb_build_object('jenis', 'folder', 'name', 'Latihan', 'space_id', uji.ambil('sp') ->> 'id')));
select uji.simpan('ls', public.web_admin_struktur_simpan(jsonb_build_object('jenis', 'list', 'name', 'Latihan A', 'folder_id', uji.ambil('fd') ->> 'id')));
select uji.cek(uji.ambil('ls') ->> 'space_id' = uji.ambil('sp') ->> 'id' and jsonb_array_length(uji.ambil('ls') -> 'statuses') = 3,
  'admin struktur: list di folder, space dari folder, status default');
select uji.cek((public.web_admin_struktur_simpan('{"jenis":"list","id":"1100340000900103","tidak_ditagih":false}') ->> 'tidak_ditagih') = 'false',
  'admin struktur: tidak_ditagih list ClickUp boleh diubah saat cermin (perbaikan A1)');
select uji.galat($$select public.web_admin_struktur_simpan('{"jenis":"list","id":"1100340000900103","name":"ganti"}')$$, 'PT409',
  'admin struktur: ganti nama list ClickUp saat cermin → 409');
select uji.galat($$select public.web_admin_struktur_simpan('{"jenis":"meja","name":"x"}')$$, 'PT400', 'admin struktur: jenis salah → 400');
select uji.galat($$select public.web_admin_struktur_simpan('{"jenis":"list","name":"x","space_id":"rsujib0001","folder_id":"1100340000900011"}')$$,
  'PT400', 'admin struktur: folder beda space → 400');

-- hari libur
select uji.sama(public.web_admin_libur_simpan('[{"tanggal":"2026-10-05","nama":"Libur uji A"},{"tanggal":"2026-12-25","nama":"Libur uji B"}]'),
  '[{"tanggal":"2026-10-05","nama":"Libur uji A"},{"tanggal":"2026-12-25","nama":"Libur uji B"}]'::jsonb, 'admin libur: tambah');
select uji.sama(public.hari_kerja('2026-10-02', '2026-10-06'), 1, 'hari libur ikut dikurangi hari_kerja');
select uji.sama(jsonb_array_length(public.web_admin_libur_simpan('{"tanggal":"2026-12-25","hapus":true}')), 1, 'admin libur: hapus');
select uji.galat($$select public.web_admin_libur_simpan('{"tanggal":"bukan"}')$$, 'PT400', 'admin libur: tanggal salah → 400');

-- mode
select uji.sama(public.web_admin_mode('utama'), '{"mode":"utama"}'::jsonb, 'admin mode: utama');
select uji.cek((public.web_detail('z8r3uj0001') #>> '{boleh,ubah}')::boolean, 'mode utama: kartu ClickUp boleh diubah');
select uji.galat($$select public.web_admin_mode('campur')$$, 'PT400', 'admin mode: nilai salah → 400');
select uji.sama(public.web_admin_mode('cermin') ->> 'mode', 'cermin', 'admin mode: kembali cermin');

-- token
select uji.simpan('tok', public.web_admin_token_buat(900000000002, 'Routine baca', 'baca'));
select uji.cek(uji.ambil('tok') ->> 'token' ~ '^rtk_[0-9A-Za-z]{40}$' and uji.ambil('tok') ->> 'prefix' = left(uji.ambil('tok') ->> 'token', 8),
  'token: rtk_ + 40 base62, prefix 8 karakter');
reset role;
select uji.cek((select token_hash = uji.sha(uji.ambil('tok') ->> 'token') and created_by = 100000001 and scope = 'baca'
                from public.api_tokens where id = (uji.ambil('tok') ->> 'id')::uuid), 'token: disimpan sha256 hex (mentah tidak disimpan)');
select uji.cek(not exists (select 1 from public.api_tokens where token_hash = uji.ambil('tok') ->> 'token'), 'token mentah tidak ada di DB');
select uji.jadi_service();
select uji.sama(public.api_token_cek(uji.sha(uji.ambil('tok') ->> 'token')) ->> 'member_id', '900000000002', 'token baru dikenali api_token_cek');
reset role;
select uji.jadi(uji.budi());
select uji.cek(public.web_admin_token_buat(900000000002, 'dua', 'tulis') ->> 'token' <> uji.ambil('tok') ->> 'token', 'token acak (tidak berulang)');
select uji.galat($$select public.web_admin_token_buat(900000000002, 'x', 'hapus')$$, 'PT400', 'token scope salah → 400');
select uji.galat($$select public.web_admin_token_buat(424242, 'x', 'baca')$$, 'PT400', 'token anggota tak dikenal → 400');
select uji.simpan('toks', public.web_admin_tokens());
select uji.cek(jsonb_array_length(uji.ambil('toks')) = 2 and not uji.ambil('toks')::text like '%token_hash%'
               and not uji.ambil('toks')::text like '%' || (uji.ambil('tok') ->> 'token') || '%', 'web_admin_tokens: tanpa hash & tanpa token mentah');
select uji.cek((public.web_admin_token_cabut((uji.ambil('tok') ->> 'id')::uuid) ->> 'revoked_at') is not null, 'token dicabut');
reset role;
select uji.jadi_service();
select uji.cek(public.api_token_cek(uji.sha(uji.ambil('tok') ->> 'token')) is null, 'token dicabut tidak dikenali lagi');
reset role;
select uji.jadi(uji.budi());
select uji.galat($$select public.web_admin_token_cabut('00000000-0000-4000-8000-000000000000')$$, 'PT404', 'cabut token tak ada → 404');

select uji.cek((select jsonb_array_length(j -> 'runs') >= 1 and j ->> 'mode' = 'cermin' from (select public.web_admin_sinkron() j) x),
  'web_admin_sinkron: laporan run');
reset role;

rollback;
