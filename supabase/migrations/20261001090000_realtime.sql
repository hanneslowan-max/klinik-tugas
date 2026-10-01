-- Realtime (postgres_changes) untuk layar web: perubahan tugas, komentar, lampiran, assignee, notifikasi, dan
-- struktur langsung tampil di layar anggota lain tanpa muat ulang (mis. status in progress → complete di Papan).
--
-- Keamanan: Realtime memeriksa policy SELECT (RLS) untuk SETIAP pelanggan sebelum mengirim perubahan INSERT/UPDATE,
-- jadi anggota hanya menerima baris yang memang boleh ia baca (space privat, notifikasi milik sendiri). Event DELETE
-- tidak diperiksa RLS → web hanya berlangganan INSERT & UPDATE (hapus di aplikasi = soft delete / UPDATE).
-- Tabel teknis/sensitif (api_tokens, members, sync_raw, activity, idem, app_settings) TIDAK dimasukkan.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'tasks', 'task_assignees', 'comments', 'attachments', 'notifications',
    'spaces', 'folders', 'lists', 'list_statuses'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
