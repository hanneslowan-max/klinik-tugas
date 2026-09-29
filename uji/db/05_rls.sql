-- 05 · RLS & hak baca: anon, authenticated non-member, member, owner, anggota nonaktif, bot; Storage lampiran.
begin;
\ir _bantu.sql

create function uji.hitung(tabel text) returns int language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from public.%I', tabel) into n;
  return n;
end $$;
grant execute on function uji.hitung(text) to public;

-- ---------------------------------------------------------------- data tambahan (sebagai postgres)
insert into public.api_tokens (member_id, nama, prefix, token_hash, scope) values
  (100000001, 'token uji owner', 'rtk_uji1', encode(extensions.digest('rtk_rahasia_uji_1', 'sha256'), 'hex'), 'tulis'),
  (900000000002, 'token uji bot', 'rtk_uji2', encode(extensions.digest('rtk_rahasia_uji_2', 'sha256'), 'hex'), 'baca');
insert into public.sync_raw (entity, id, hash, payload) values ('task', 'z8r3uj0001', 'abc', '{"id":"z8r3uj0001"}');
insert into public.idem (key, hasil) values ('uji-kunci', '{}');
insert into public.hari_libur (tanggal, nama) values ('2027-01-01', 'Libur uji (sintetis)');

create temp table total as
  select t as tabel, uji.hitung(t) as n
    from unnest(array['workspace','members','spaces','folders','lists','list_statuses','tasks','task_assignees',
                      'comments','comment_mentions','attachments','activity','notifications','api_tokens',
                      'hari_libur','app_settings','sync_runs','sync_raw']) t;
grant select on total to public;
select uji.cek((select bool_and(n > 0) from total), 'semua tabel data berisi baris untuk diuji');

-- ================================================================ anon: tidak melihat apa-apa
select uji.jadi_anon();
select uji.galat(format('select count(*) from public.%I', t), '42501', 'anon: SELECT ' || t || ' ditolak')
  from unnest(array['workspace','members','spaces','folders','lists','list_statuses','tasks','task_assignees',
                    'comments','comment_mentions','attachments','activity','notifications','api_tokens',
                    'hari_libur','app_settings','sync_runs','sync_raw','idem']) t;
select uji.galat($$select public.is_member()$$, '42501', 'anon: tidak bisa memanggil fungsi public');
select uji.sama((select count(*)::int from storage.objects where bucket_id = 'lampiran'), 0, 'anon: objek lampiran tidak terlihat');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujib0001/anon.png')$$,
  '42501', 'anon: unggah lampiran ditolak');
reset role;

-- ================================================================ authenticated tapi bukan anggota
select uji.jadi('99999999-9999-4999-8999-999999999999');
select uji.sama(uji.hitung(t), 0, 'non-member: ' || t || ' kosong')
  from unnest(array['workspace','members','spaces','folders','lists','list_statuses','tasks','task_assignees',
                    'comments','comment_mentions','attachments','activity','notifications','api_tokens',
                    'hari_libur','app_settings','sync_runs','sync_raw']) t;
select uji.galat($$select count(*) from public.idem$$, '42501', 'non-member: idem ditolak');
select uji.cek(not public.is_member() and public.member_saya() is null, 'non-member: is_member() = false');
reset role;

-- ================================================================ member (Citra)
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.cek(public.is_member() and not public.is_owner() and public.member_saya() = 100000002, 'Citra: member, bukan owner');
select uji.sama(uji.hitung(t.tabel), t.n, 'member: melihat semua baris ' || t.tabel)
  from total t
 where t.tabel not in ('notifications', 'api_tokens', 'sync_raw');
select uji.sama(uji.hitung('notifications'),
  (select count(*)::int from public.notifications where member_id = 100000002), 'member: notifications hanya milik sendiri');
select uji.cek(uji.hitung('notifications') > 0, 'member: punya notifikasi sendiri untuk diuji');
select uji.sama((select count(*)::int from public.notifications where member_id <> 100000002), 0,
  'member: notifikasi orang lain tidak terlihat');
select uji.sama(uji.hitung('api_tokens'), 0, 'member: api_tokens tidak terbaca');
select uji.galat($$select token_hash from public.api_tokens$$, '42501', 'member: kolom token_hash ditolak');
select uji.sama(uji.hitung('sync_raw'), 0, 'member: sync_raw tidak terbaca (owner saja)');
select uji.galat($$select count(*) from public.idem$$, '42501', 'member: idem ditolak');

-- member tidak bisa menulis langsung
select uji.galat($$insert into public.tasks (list_id, name) values ('rlujib0001', 'tulis langsung')$$, '42501', 'member: INSERT tasks langsung ditolak');
select uji.galat($$update public.tasks set name = 'x' where id = 'rtujib0001'$$, '42501', 'member: UPDATE tasks langsung ditolak');
select uji.galat($$delete from public.tasks where id = 'rtujib0001'$$, '42501', 'member: DELETE tasks langsung ditolak');
select uji.galat($$update public.notifications set read_at = now()$$, '42501', 'member: UPDATE notifications langsung ditolak');
select uji.galat($$update public.app_settings set value = '"utama"' where key = 'mode'$$, '42501', 'member: ubah mode ditolak');
select uji.galat($$select public.catat_activity('rtujib0001', 'nama')$$, '42501', 'member: catat_activity tidak bisa dipanggil');

-- Storage
select uji.jalan($$insert into storage.objects (bucket_id, name, owner, owner_id)
                   values ('lampiran', 't/rtujib0001/uji-rls.png', auth.uid(), auth.uid()::text)$$,
  'member: unggah ke t/<tugas app>/ diizinkan');
select uji.cek((select count(*) from storage.objects where bucket_id = 'lampiran' and name = 't/rtujib0001/uji-rls.png') = 1,
  'member: objek lampiran terbaca');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 'lain/uji.png')$$,
  '42501', 'member: path di luar t/<task_id>/ ditolak');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/tidakada01/uji.png')$$,
  '42501', 'member: tugas tidak ada ditolak');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujib0004/uji.png')$$,
  '42501', 'member: tugas terhapus ditolak');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/z8r3uj0001/uji.png')$$,
  '42501', 'member: kartu ClickUp saat mode cermin ditolak');
reset role;

select uji.mode('utama');
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.jalan($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/z8r3uj0001/uji-utama.png')$$,
  'member: mode utama → unggah ke kartu ClickUp diizinkan');
reset role;
select uji.mode('cermin');

-- ================================================================ owner (Budi)
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.cek(public.is_owner(), 'Budi: owner');
select uji.sama(uji.hitung('api_tokens'), (select n from total where tabel = 'api_tokens'), 'owner: melihat semua api_tokens');
select uji.cek((select bool_and(prefix like 'rtk_uji%') from public.api_tokens), 'owner: metadata token (prefix) terbaca');
select uji.galat($$select token_hash from public.api_tokens$$, '42501', 'owner: token_hash tetap tidak bisa dibaca');
select uji.galat($$select * from public.api_tokens$$, '42501', 'owner: select * api_tokens ditolak (kolom hash tertutup)');
select uji.sama(uji.hitung('sync_raw'), (select n from total where tabel = 'sync_raw'), 'owner: sync_raw terbaca');
select uji.sama(uji.hitung('notifications'),
  (select count(*)::int from public.notifications where member_id = 100000001), 'owner: notifications tetap hanya milik sendiri');
reset role;

-- ================================================================ anggota nonaktif (Dodi) & bot
update public.members set aktif = false where id = 100000003;
select uji.jadi('33333333-3333-4333-8333-333333333333');
select uji.cek(not public.is_member(), 'nonaktif: is_member() = false');
select uji.sama(uji.hitung('tasks'), 0, 'nonaktif: tasks tidak terlihat');
select uji.sama(uji.hitung('notifications'), 0, 'nonaktif: notifications tidak terlihat');
select uji.galat($$insert into storage.objects (bucket_id, name) values ('lampiran', 't/rtujib0001/nonaktif.png')$$,
  '42501', 'nonaktif: unggah ditolak');
reset role;
update public.members set aktif = true where id = 100000003;

insert into auth.users (id, aud, role, email) values
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'bot.uji@contoh.test');
update public.members set auth_user_id = '55555555-5555-4555-8555-555555555555' where id = 900000000002;
select uji.jadi('55555555-5555-4555-8555-555555555555');
select uji.cek(not public.is_member(), 'bot (walau punya akun Auth): bukan member');
select uji.sama(uji.hitung('tasks'), 0, 'bot lewat JWT: tasks tidak terlihat');
reset role;

-- ================================================================ service_role: baca semua (BYPASSRLS), tanpa tulis
select uji.jadi_service();
select uji.sama(uji.hitung('tasks'), (select n from total where tabel = 'tasks'), 'service_role: tasks terbaca semua');
select uji.cek((select count(*) from public.api_tokens) = 2, 'service_role: api_tokens terbaca');
select uji.galat($$update public.tasks set name = 'x' where id = 'rtujib0001'$$, '42501', 'service_role: UPDATE tasks langsung ditolak');
reset role;

rollback;
