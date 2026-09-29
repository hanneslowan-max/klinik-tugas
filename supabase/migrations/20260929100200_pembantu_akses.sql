-- A1 · Fondasi 3/7: pembantu akses & hitung. Kontrak ARSITEKTUR.md §3, §4.
-- Semua SECURITY DEFINER memakai search_path = '' dan nama full-qualified.

-- Member (id) milik JWT saat ini (auth.uid()), tanpa melihat app.actor_id. Dipakai RLS notifikasi.
create or replace function public.member_saya()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.auth_user_id = (select auth.uid())
  limit 1
$$;

-- Aktor transaksi: app.actor_id (hanya diset fungsi SECURITY DEFINER) atau member dari auth.uid().
create or replace function public.aktor()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := nullif(current_setting('app.actor_id', true), '');
begin
  if v is not null then
    return v::bigint;
  end if;
  return public.member_saya();
end;
$$;

-- Anggota aktif ber-role owner/member yang terhubung ke auth.uid(). Bot tidak pernah login.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.aktif
      and m.role in ('owner', 'member')
  )
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.auth_user_id = (select auth.uid())
      and m.aktif
      and m.role = 'owner'
  )
$$;

-- Mode aplikasi: 'cermin' (default bila belum diset) | 'utama'.
create or replace function public.mode_app()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value #>> '{}' from public.app_settings s where s.key = 'mode'), 'cermin')
$$;

-- Boleh mengubah baris sumber='clickup'? Ya bila mode utama, atau sumber transaksi impor/sinkron.
create or replace function public.boleh_ubah_clickup()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mode_app() <> 'cermin' or public.sumber_aktif() in ('impor', 'sinkron')
$$;

create or replace function public.tolak_cermin()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.lempar('PT409', 'Mode cermin: data ClickUp hanya-baca sampai cutover', 'CERMIN_001');
end;
$$;

-- Hari kerja: jumlah d Senin–Jumat dengan a < d <= b yang tidak ada di hari_libur.
-- b < a → negatif (hitung mundur). a = b → 0. Null bila salah satu null.
create or replace function public.hari_kerja(a date, b date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a is null or b is null then null
    when b >= a then (
      select count(*)::integer
      from generate_series(1, b - a) as g(i)
      where extract(isodow from (a + g.i)) < 6
        and not exists (select 1 from public.hari_libur h where h.tanggal = a + g.i))
    else - (
      select count(*)::integer
      from generate_series(1, a - b) as g(i)
      where extract(isodow from (b + g.i)) < 6
        and not exists (select 1 from public.hari_libur h where h.tanggal = b + g.i))
  end
$$;

-- Beban B5: jumlah kartu terbuka milik p_member dengan due_wib = p_tanggal.
-- Cakupan: belum selesai, tidak diarsip, tidak dihapus, list tidak diarsip & bukan tidak_ditagih.
-- Kartu multi-assignee dihitung +1 untuk tiap assignee. Batas (7) diterapkan pemanggil.
-- Pemanggil authenticated yang bukan member → null.
create or replace function public.beban(p_member bigint, p_tanggal date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is not null and not public.is_member() then null
    else (
      select count(*)::integer
      from public.tasks t
      join public.task_assignees ta on ta.task_id = t.id and ta.member_id = p_member
      join public.lists l on l.id = t.list_id
      where t.due_wib = p_tanggal
        and t.status_type not in ('closed', 'done')
        and t.deleted_at is null
        and not t.archived
        and not l.archived
        and not l.tidak_ditagih)
  end
$$;

-- List sah bila punya ≥1 status open dan ≥1 status closed (kontrak §2; dipakai fungsi admin A2).
create or replace function public.status_list_valid(p_list text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.list_statuses s where s.list_id = p_list and s.type = 'open')
     and exists (select 1 from public.list_statuses s where s.list_id = p_list and s.type = 'closed')
$$;
