-- A2 · 3/6: fungsi API (service_role, dipanggil Edge Function `api`). Kontrak ARSITEKTUR.md §6.
-- (review R2) Semua baca/tulis mengikuti privasi space untuk p_aktor: space privat tanpa keanggotaan = 404.
-- Parameter pertama p_aktor = anggota pemilik token (hasil api_token_cek). Header PostgREST opsional
-- `x-token-id` = token_id → dicatat di activity + cek scope (baca < tulis < impor). Galat: PT4xx + HINT ECODE.

-- ---------------------------------------------------------------- token
-- Hash sha256 hex token mentah → {member_id, scope, token_id, role} atau null. Update last_used_at.
create or replace function public.api_token_cek(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_hash is null or lower(p_hash) !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  update public.api_tokens k
     set last_used_at = now()
    from public.members m
   where k.token_hash = lower(p_hash)
     and k.revoked_at is null
     and m.id = k.member_id
     and m.aktif
  returning jsonb_build_object('member_id', k.member_id, 'scope', k.scope, 'token_id', k.id, 'role', m.role)
    into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------- user / team / hierarki
create or replace function public.api_user(p_aktor bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  return jsonb_build_object('user', public.j_member(p_aktor));
end;
$$;

-- Bot tidak masuk daftar anggota tim. role ClickUp: 1 owner, 3 member.
create or replace function public.api_team(p_aktor bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  return jsonb_build_object('teams', (
    select jsonb_agg(jsonb_build_object(
             'id', w.id, 'name', w.name, 'color', '#7b68ee', 'avatar', null,
             'members', (select coalesce(jsonb_agg(jsonb_build_object('user',
                                  public.j_member(m.id) || jsonb_build_object('role', case m.role when 'owner' then 1 else 3 end))
                                  order by m.id), '[]'::jsonb)
                           from public.members m
                          where m.aktif and m.role in ('owner', 'member')))
             order by w.created_at, w.id)
      from public.workspace w));
end;
$$;

create or replace function public.api_spaces(p_aktor bigint, p_archived boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  return jsonb_build_object('spaces', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'private', s.private, 'statuses', '[]'::jsonb,
             'multiple_assignees', true, 'features', '{}'::jsonb, 'archived', s.archived)
             order by s.orderindex nulls last, s.name, s.id), '[]'::jsonb)
      from public.spaces s
     where s.archived = coalesce(p_archived, false) and public.space_terlihat(s.id)));
end;
$$;

-- Folder (termasuk hidden) + list di dalamnya (list diarsip hanya bila p_archived).
create or replace function public.api_space_folders(p_aktor bigint, p_space text, p_archived boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spaces;
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  select * into s from public.spaces where id = p_space;
  if not found or not public.space_terlihat(p_space) then
    perform public.lempar('PT404', 'Space tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('folders', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id, 'name', f.name, 'orderindex', coalesce(f.orderindex, 0), 'override_statuses', false,
             'hidden', f.hidden, 'space', jsonb_build_object('id', s.id, 'name', s.name),
             'task_count', (select count(*)::text from public.tasks t join public.lists l on l.id = t.list_id
                             where l.folder_id = f.id and t.deleted_at is null and not t.archived),
             'archived', f.archived, 'statuses', '[]'::jsonb,
             'lists', (select coalesce(jsonb_agg(public.j_list(l.id) order by l.orderindex nulls last, l.name, l.id), '[]'::jsonb)
                         from public.lists l
                        where l.folder_id = f.id and (coalesce(p_archived, false) or not l.archived)))
             order by f.orderindex nulls last, f.name, f.id), '[]'::jsonb)
      from public.folders f
     where f.space_id = p_space and f.archived = coalesce(p_archived, false)));
end;
$$;

-- List tanpa folder di space.
create or replace function public.api_space_lists(p_aktor bigint, p_space text, p_archived boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not exists (select 1 from public.spaces where id = p_space) or not public.space_terlihat(p_space) then
    perform public.lempar('PT404', 'Space tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('lists', (
    select coalesce(jsonb_agg(public.j_list(l.id) order by l.orderindex nulls last, l.name, l.id), '[]'::jsonb)
      from public.lists l
     where l.space_id = p_space and l.folder_id is null and l.archived = coalesce(p_archived, false)));
end;
$$;

create or replace function public.api_folder_lists(p_aktor bigint, p_folder text, p_archived boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not exists (select 1 from public.folders f where f.id = p_folder and public.space_terlihat(f.space_id)) then
    perform public.lempar('PT404', 'Folder tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('lists', (
    select coalesce(jsonb_agg(public.j_list(l.id) order by l.orderindex nulls last, l.name, l.id), '[]'::jsonb)
      from public.lists l
     where l.folder_id = p_folder and l.archived = coalesce(p_archived, false)));
end;
$$;

create or replace function public.api_list(p_aktor bigint, p_list text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not public.list_terlihat(p_list) then
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  return public.j_list(p_list) || jsonb_build_object('statuses', public.j_list_statuses(p_list));
end;
$$;

-- ---------------------------------------------------------------- tugas: baca
-- 100 per halaman (p_page mulai 0). Urut created_at desc, id asc (stabil). Tugas terhapus selalu dibuang.
-- include_closed=false buang status closed/done; subtasks=false buang yang ber-parent; archived = filter persis;
-- date_updated_gt = ms (updated_at > nilai).
create or replace function public.api_list_tasks(
  p_aktor bigint, p_list text, p_page integer default 0, p_include_closed boolean default false,
  p_subtasks boolean default false, p_archived boolean default false, p_md boolean default false,
  p_date_updated_gt bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not public.list_terlihat(p_list) then
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  if coalesce(p_page, 0) < 0 then
    perform public.lempar('PT400', 'page tidak boleh negatif', 'INPUT_001');
  end if;
  select coalesce(array_agg(x.id order by x.created_at desc, x.id), '{}') into v_ids
    from (select t.id, t.created_at
            from public.tasks t
           where t.list_id = p_list
             and t.deleted_at is null
             and (coalesce(p_include_closed, false) or t.status_type not in ('closed', 'done'))
             and (coalesce(p_subtasks, false) or t.parent_id is null)
             and t.archived = coalesce(p_archived, false)
             and (p_date_updated_gt is null or floor(extract(epoch from t.updated_at) * 1000) > p_date_updated_gt)
           order by t.created_at desc, t.id
           offset coalesce(p_page, 0) * 100
           limit 101) x;
  return jsonb_build_object(
    'tasks', (select coalesce(jsonb_agg(public.j_task(u.id, coalesce(p_md, false), false) order by u.n), '[]'::jsonb)
                from unnest(v_ids[1:100]) with ordinality as u(id, n)),
    'last_page', cardinality(v_ids) <= 100);
end;
$$;

create or replace function public.api_task(p_aktor bigint, p_task text, p_md boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  return public.j_task(p_task, coalesce(p_md, false), true);
end;
$$;

-- SEMUA komentar top-level (tanpa batas 25), terbaru dulu.
create or replace function public.api_task_comments(p_aktor bigint, p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('comments', (
    select coalesce(jsonb_agg(public.j_comment(c.id) order by c.created_at desc, c.id desc), '[]'::jsonb)
      from public.comments c
     where c.task_id = p_task and c.parent_id is null and c.deleted_at is null));
end;
$$;

-- Balasan satu komentar, terlama dulu (sementara; dicek dengan probe ClickUp).
create or replace function public.api_comment_replies(p_aktor bigint, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if not exists (select 1 from public.comments c join public.tasks t on t.id = c.task_id
                  where c.id = p_comment and c.deleted_at is null and t.deleted_at is null
                    and public.tugas_terlihat(t.id)) then
    perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('comments', (
    select coalesce(jsonb_agg(public.j_comment(c.id) order by c.created_at, c.id), '[]'::jsonb)
      from public.comments c
     where c.parent_id = p_comment and c.deleted_at is null));
end;
$$;

-- ---------------------------------------------------------------- tugas: tulis
-- Body persis clickup.mjs create: {name, markdown_description, assignees[], due_date(ms), due_date_time:false,
-- priority, status} (+ description, start_date, start_date_time, parent). p_idem = kunci idempotensi (opsional).
create or replace function public.api_create_task(p_aktor bigint, p_list text, p_body jsonb, p_idem text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kunci text := case when p_idem is not null then 'api_create_task:' || p_aktor || ':' || p_idem end;
  v_hasil jsonb;
  v_id    text;
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  v_hasil := public.idem_ambil(v_kunci);
  if v_hasil is not null then
    return v_hasil;
  end if;
  v_id := public.inti_buat_tugas(p_list, p_body);
  v_hasil := public.j_task(v_id, false, false);
  perform public.idem_simpan(v_kunci, v_hasil);
  return v_hasil;
end;
$$;

-- Body persis clickup.mjs update: {name, markdown_description, status, due_date|null, due_date_time, priority,
-- assignees:{add,rem}} (+ archived, parent, start_date, start_date_time, description).
create or replace function public.api_update_task(p_aktor bigint, p_task text, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.inti_ubah_tugas(p_task, p_body);
  return public.j_task(p_task, false, false);
end;
$$;

-- Hapus lunak (masuk Sampah). Hanya owner; bot & member → PT403 HAPUS_OWNER.
create or replace function public.api_delete_task(p_aktor bigint, p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.inti_hapus(p_task);
  return '{}'::jsonb;
end;
$$;

-- Body {comment_text, notify_all (diabaikan)}. Mention '@username' persis → comment_mentions.
-- Hasil {id, hist_id, date:int ms}.
create or replace function public.api_create_comment(p_aktor bigint, p_task text, p_body jsonb, p_idem text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kunci text := case when p_idem is not null then 'api_create_comment:' || p_aktor || ':' || p_idem end;
  v_hasil jsonb;
  v_id    text;
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  v_hasil := public.idem_ambil(v_kunci);
  if v_hasil is not null then
    return v_hasil;
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' or jsonb_typeof(p_body -> 'comment_text') is distinct from 'string' then
    perform public.lempar('PT400', 'comment_text wajib diisi', 'INPUT_001');
  end if;
  v_id := public.inti_komentar(p_task, null, p_body ->> 'comment_text');
  select jsonb_build_object('id', c.id, 'hist_id', c.id, 'date', public.ms(c.created_at)::bigint)
    into v_hasil from public.comments c where c.id = v_id;
  perform public.idem_simpan(v_kunci, v_hasil);
  return v_hasil;
end;
$$;

-- Balasan thread. Bila p_comment sendiri balasan, dipasang ke komentar top-level-nya.
create or replace function public.api_create_reply(p_aktor bigint, p_comment text, p_body jsonb, p_idem text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kunci text := case when p_idem is not null then 'api_create_reply:' || p_aktor || ':' || p_idem end;
  v_hasil jsonb;
  v_id    text;
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  v_hasil := public.idem_ambil(v_kunci);
  if v_hasil is not null then
    return v_hasil;
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' or jsonb_typeof(p_body -> 'comment_text') is distinct from 'string' then
    perform public.lempar('PT400', 'comment_text wajib diisi', 'INPUT_001');
  end if;
  v_id := public.inti_komentar(null, p_comment, p_body ->> 'comment_text');
  select jsonb_build_object('id', c.id, 'hist_id', c.id, 'date', public.ms(c.created_at)::bigint)
    into v_hasil from public.comments c where c.id = v_id;
  perform public.idem_simpan(v_kunci, v_hasil);
  return v_hasil;
end;
$$;

-- Pindah home list (padanan PUT v3 .../home_list/{list}). Status: nama sama → type sama → open pertama.
create or replace function public.api_move_task(p_aktor bigint, p_task text, p_list text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.inti_pindah(p_task, p_list);
  return public.j_task(p_task, false, false);
end;
$$;
