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

-- (perbaikan P5) List yang diarsip EFEKTIF: list diarsip, ATAU folder-nya diarsip, ATAU space-nya diarsip
-- (ClickUp menyembunyikan isi folder/space arsip). Kartu di dalamnya tidak ikut Tugas Saya, TENGGAT, maupun beban B5.
-- Internal (tanpa EXECUTE untuk role API); dipanggil fungsi SECURITY DEFINER.
create or replace function public.list_diarsip()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(l.id), '{}')
    from public.lists l
    join public.spaces s on s.id = l.space_id
    left join public.folders f on f.id = l.folder_id
   where l.archived or s.archived or coalesce(f.archived, false)
$$;

-- Beban B5: jumlah kartu terbuka milik p_member dengan due_wib = p_tanggal.
-- Cakupan: belum selesai, tidak diarsip, tidak dihapus, list tidak diarsip (termasuk folder/space arsip, P5) &
-- bukan tidak_ditagih.
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
        and not (l.id = any ((select public.list_diarsip())::text[]))
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

-- ================================================================ (review R2) privasi space
-- Aturan (riset K8 "ikuti setelan privat ClickUp"): anggota melihat SEMUA bila owner/bot aktif, atau setelan
-- app_settings.privasi_space = "abaikan". Selain itu space privat hanya terlihat oleh anggotanya (space_anggota),
-- dan kartu di space privat juga terlihat oleh assignee kartu itu.
-- Yang dinilai = penilai(): anggota sesi JWT bila ada (RLS, Storage, web_*), selain itu aktor() (api_*/x_* lewat
-- service role: app.actor_id = p_aktor). Tanpa parameter anggota supaya klien tidak bisa menanyakan hak orang lain.
create or replace function public.penilai()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is not null then public.member_saya() else public.aktor() end
$$;

-- Internal (tanpa EXECUTE untuk klien): p_m melihat semua? owner/bot aktif, atau privasi_space "abaikan".
create or replace function public.akses_semua(p_m bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value #>> '{}' from public.app_settings s where s.key = 'privasi_space'), 'tegakkan') = 'abaikan'
      or exists (select 1 from public.members m where m.id = p_m and m.aktif and m.role in ('owner', 'bot'))
$$;

create or replace function public.lihat_semua()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.akses_semua(public.penilai())
$$;

-- Jalur cepat dulu (space tidak privat), baru hak penilai.
create or replace function public.space_terlihat(p_space text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m bigint;
begin
  if exists (select 1 from public.spaces s where s.id = p_space and not s.private) then
    return true;
  end if;
  v_m := public.penilai();
  return public.akses_semua(v_m)
      or exists (select 1 from public.space_anggota sa where sa.space_id = p_space and sa.member_id = v_m);
end;
$$;

-- List ada DAN space-nya terlihat.
create or replace function public.list_terlihat(p_list text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lists l where l.id = p_list and public.space_terlihat(l.space_id))
$$;

-- List yang TIDAK terlihat (di space privat tanpa keanggotaan). Kosong bila tidak ada space privat / lihat semua.
create or replace function public.list_tertutup()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_m bigint;
begin
  if not exists (select 1 from public.spaces s where s.private) then
    return '{}'::text[];
  end if;
  v_m := public.penilai();
  if public.akses_semua(v_m) then
    return '{}'::text[];
  end if;
  return coalesce((
    select array_agg(l.id order by l.id)
      from public.lists l
      join public.spaces s on s.id = l.space_id
     where s.private
       and not exists (select 1 from public.space_anggota sa where sa.space_id = s.id and sa.member_id = v_m)), '{}'::text[]);
end;
$$;

-- Tugas yang TIDAK terlihat: di list tertutup dan bukan assignee-nya. Dipakai RLS & filter daftar.
create or replace function public.tugas_tertutup()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_l text[] := public.list_tertutup();
  v_m bigint;
begin
  if cardinality(v_l) = 0 then
    return '{}'::text[];
  end if;
  v_m := public.penilai();
  return coalesce((
    select array_agg(t.id order by t.id)
      from public.tasks t
     where t.list_id = any (v_l)
       and not exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.member_id = v_m)), '{}'::text[]);
end;
$$;

-- Satu tugas terlihat? Tugas tak ada → akses_semua (pemanggil memeriksa ada/terhapus sendiri).
create or replace function public.tugas_terlihat(p_task text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v   record;
  v_m bigint;
begin
  select s.id as space_id, s.private into v
    from public.tasks t
    join public.lists l on l.id = t.list_id
    join public.spaces s on s.id = l.space_id
   where t.id = p_task;
  if found and not v.private then
    return true;
  end if;
  v_m := public.penilai();
  if public.akses_semua(v_m) then
    return true;
  end if;
  return found
     and (exists (select 1 from public.space_anggota sa where sa.space_id = v.space_id and sa.member_id = v_m)
          or exists (select 1 from public.task_assignees ta where ta.task_id = p_task and ta.member_id = v_m));
end;
$$;

-- ================================================================ (review R5) kategori due pagar B10
-- Nama berisi BERSYARAT/CADANGAN/DITUNDA → "menunggu keputusan", bukan telat (baca-pagar.md B10).
create or replace function public.menunggu_keputusan(p_nama text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_nama ~* '(BERSYARAT|CADANGAN|DITUNDA)', false)
$$;

-- Kategori due satu kartu (sumber tunggal untuk web_tugas_saya, baris web, hitungan web_struktur):
--   null (selesai) · tidak_ditagih (list tidak ditagih; dikecualikan TENGGAT) · menunggu_keputusan ·
--   tanpa_due · telat (due < hari ini) · hari_ini · tiga_hk (hari_kerja ≤ 3) · nanti.
-- Urutan pengecualian sama dengan tenggat_hitung: list tidak ditagih dulu, lalu nama menunggu keputusan.
create or replace function public.kategori_due(p_selesai boolean, p_due date, p_nama text, p_tidak_ditagih boolean,
                                               p_hari date default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hari date := coalesce(p_hari, public.hari_ini_wib());
begin
  if coalesce(p_selesai, false) then
    return null;
  elsif coalesce(p_tidak_ditagih, false) then
    return 'tidak_ditagih';
  elsif public.menunggu_keputusan(p_nama) then
    return 'menunggu_keputusan';
  elsif p_due is null then
    return 'tanpa_due';
  elsif p_due < v_hari then
    return 'telat';
  elsif p_due = v_hari then
    return 'hari_ini';
  elsif p_due - v_hari <= 40 and public.hari_kerja(v_hari, p_due) <= 3 then   -- > 40 hari pasti > 3 hari kerja
    return 'tiga_hk';
  end if;
  return 'nanti';
end;
$$;
