-- A1 · Fondasi 5/7: Storage bucket 'lampiran' (private, 25 MB, allowlist MIME) + policy member.
-- Kontrak ARSITEKTUR.md §4. Path objek: t/<task_id>/<nama>. SVG/HTML ditolak (tidak di allowlist).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lampiran', 'lampiran', false, 26214400,           -- 25 MB = 25 * 1024 * 1024
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- xlsx
    'text/csv', 'text/plain'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- task_id dari path 't/<task_id>/<nama>' (null bila pola tidak cocok / ada segmen '.' atau '..').
create or replace function public.lampiran_task_dari_path(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^t/[^/]+/[^/].*$' and p_name !~ '(^|/)\.\.?(/|$)' then split_part(p_name, '/', 2)
  end
$$;

-- Boleh unggah: member aktif, tugas ada & tidak dihapus, terlihat aktor (privasi space, review R2),
-- dan bukan kartu ClickUp saat mode cermin.
create or replace function public.boleh_unggah_lampiran(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member()
     and exists (
       select 1 from public.tasks t
        where t.id = public.lampiran_task_dari_path(p_name)
          and t.deleted_at is null
          and (t.sumber = 'app' or public.mode_app() <> 'cermin')
          and public.tugas_terlihat(t.id))
$$;

-- Baca: member aktif, path t/<task_id>/…, dan tugasnya tidak tertutup privasi space (review R2).
create policy "lampiran: member baca" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lampiran'
    and public.lampiran_task_dari_path(name) is not null
    and (select public.is_member())
    and not coalesce(public.lampiran_task_dari_path(name) = any ((select public.tugas_tertutup())::text[]), false)
  );

create policy "lampiran: member unggah" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lampiran'
    and public.boleh_unggah_lampiran(name)
  );
