-- A2 · 1/6: pembantu internal lapisan fungsi API & web + pembentuk JSON gaya ClickUp v2.
-- Kontrak: docs/ARSITEKTUR.md §3–§7, rincian docs/KONTRAK-DB.md. Semua fungsi di sini INTERNAL
-- (tanpa EXECUTE untuk anon/authenticated/service_role; dicabut di migrasi hak A2).
-- Semua SECURITY DEFINER memakai search_path = '' dan nama full-qualified.

-- ---------------------------------------------------------------- perbaikan A1: penjaga struktur
-- Kolom milik aplikasi (tidak_ditagih) dan jejak teknis (synced_at) boleh diubah owner walau list/space/folder
-- berasal dari ClickUp dan mode masih cermin. Tanpa ini owner tidak bisa menandai list "Di luar periode"
-- sebagai tidak ditagih selama masa paralel.
create or replace function public.struktur_penjaga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abaikan constant text[] := array['tidak_ditagih', 'synced_at'];
begin
  if tg_op = 'DELETE' then
    if old.sumber = 'clickup' and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    return old;
  end if;
  if (new.sumber = 'clickup' or (tg_op = 'UPDATE' and old.sumber = 'clickup'))
     and (tg_op = 'INSERT' or (to_jsonb(new) - v_abaikan) is distinct from (to_jsonb(old) - v_abaikan))
     and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- pengaturan tambahan
-- Cakupan TENGGAT B10 (x_tenggat/web_tenggat): folder RHJ Eksekusi. Array kosong = semua folder.
insert into public.app_settings (key, value)
values ('tenggat_folder_ids', '["1100340000026652"]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- waktu
-- timestamptz → string ms epoch (gaya ClickUp), dibulatkan ke bawah ke ms.
create or replace function public.ms(t timestamptz)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when t is null then null else floor(extract(epoch from t) * 1000)::bigint::text end
$$;

create or replace function public.ms_ke_ts(p bigint)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p is null then null else timestamptz '1970-01-01 00:00:00+00' + p * interval '1 millisecond' end
$$;

-- Nilai JSON → timestamptz. Terima: null, angka ms, string ms, 'YYYY-MM-DD' (= 12:00 WIB), ISO 8601.
create or replace function public.ts_dari(v jsonb)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) = 'number' then
    return public.ms_ke_ts(round((v #>> '{}')::numeric)::bigint);
  end if;
  if jsonb_typeof(v) <> 'string' then
    perform public.lempar('PT400', format('Tanggal tidak valid: %s', v::text), 'INPUT_001');
  end if;
  s := btrim(v #>> '{}');
  if s = '' then
    return null;
  elsif s ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return public.ms_ke_ts(round(s::numeric)::bigint);
  elsif s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return (s || ' 12:00:00+07')::timestamptz;           -- tanggal WIB = 12:00 WIB (gaya clickup.mjs)
  end if;
  begin
    return s::timestamptz;
  exception when others then
    perform public.lempar('PT400', format('Tanggal tidak valid: %s', s), 'INPUT_001');
  end;
  return null;
end;
$$;

-- Nilai JSON → boolean (true/false/"true"/"false"/1/0). Null → p_default.
create or replace function public.bool_dari(v jsonb, p_default boolean default null)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return p_default;
  end if;
  if jsonb_typeof(v) = 'boolean' then
    return (v #>> '{}')::boolean;
  end if;
  if lower(v #>> '{}') in ('true', '1', 'ya') then return true; end if;
  if lower(v #>> '{}') in ('false', '0', 'tidak') then return false; end if;
  perform public.lempar('PT400', format('Nilai boolean tidak valid: %s', v::text), 'INPUT_001');
  return null;
end;
$$;

-- Prioritas: null | 1..4 | "1".."4" | {"id":"1",...} → smallint. Selain itu PT400.
create or replace function public.prioritas_dari(v jsonb)
returns smallint
language plpgsql
set search_path = ''
as $$
declare
  s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  s := case when jsonb_typeof(v) = 'object' then v ->> 'id' else v #>> '{}' end;
  if s is null then
    return null;
  end if;
  if s !~ '^[1-4]$' then
    perform public.lempar('PT400', format('Prioritas harus 1–4 atau null (diterima: %s)', v::text), 'INPUT_001');
  end if;
  return s::smallint;
end;
$$;

-- Daftar ID anggota dari JSON: [1,2] | ["1","2"] | [{"id":1}] | 5 → bigint[] (unik, urutan dipertahankan).
create or replace function public.ids_dari(v jsonb)
returns bigint[]
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  s text;
  hasil bigint[] := '{}'::bigint[];
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return hasil;
  end if;
  if jsonb_typeof(v) <> 'array' then
    v := jsonb_build_array(v);
  end if;
  for e in select x from jsonb_array_elements(v) as a(x) loop
    s := case when jsonb_typeof(e) = 'object' then e ->> 'id' else e #>> '{}' end;
    if s is null or s !~ '^[0-9]{1,18}$' then
      perform public.lempar('PT400', format('ID anggota tidak valid: %s', e::text), 'INPUT_001');
    end if;
    if not (s::bigint = any (hasil)) then
      hasil := hasil || s::bigint;
    end if;
  end loop;
  return hasil;
end;
$$;

-- ---------------------------------------------------------------- konteks & izin
-- Konteks fungsi api_/x_/impor_ (dipanggil Edge dengan service role).
-- * p_aktor wajib anggota aktif → selain itu PT401 OAUTH_019.
-- * Header PostgREST `x-token-id` (uuid dari api_token_cek) opsional: bila ada, token wajib milik p_aktor,
--   belum dicabut, dan scope-nya cukup (baca < tulis < impor) → app.token_id diset untuk activity.
-- * Set app.sumber & app.actor_id (lokal transaksi).
create or replace function public.mulai_api(p_aktor bigint, p_sumber text, p_perlu text default 'baca')
returns public.members
language plpgsql
security definer
set search_path = ''
as $$
declare
  m        public.members;
  v_hdr    text;
  v_tok    record;
  v_urut   constant text[] := array['baca', 'tulis', 'impor'];
begin
  select * into m from public.members where id = p_aktor;
  if not found or not m.aktif then
    perform public.lempar('PT401', 'Token tidak sah: anggota tidak dikenal atau nonaktif', 'OAUTH_019');
  end if;

  begin
    v_hdr := nullif(btrim(nullif(current_setting('request.headers', true), '')::json ->> 'x-token-id'), '');
  exception when others then
    v_hdr := null;
  end;
  if v_hdr is not null then
    if v_hdr !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.lempar('PT401', 'Token tidak sah', 'OAUTH_019');
    end if;
    select k.scope, k.member_id, k.revoked_at into v_tok from public.api_tokens k where k.id = v_hdr::uuid;
    if not found or v_tok.revoked_at is not null or v_tok.member_id <> p_aktor then
      perform public.lempar('PT401', 'Token tidak sah', 'OAUTH_019');
    end if;
    if array_position(v_urut, v_tok.scope) < array_position(v_urut, coalesce(p_perlu, 'baca')) then
      perform public.lempar('PT403', format('Scope token "%s" tidak cukup (perlu "%s")', v_tok.scope, p_perlu),
                            'ACCESS_001');
    end if;
    perform set_config('app.token_id', v_hdr, true);
  else
    perform set_config('app.token_id', '', true);
  end if;

  perform set_config('app.sumber', p_sumber, true);
  perform set_config('app.actor_id', p_aktor::text, true);
  perform public.sumber_aktif();                       -- validasi nilai sumber
  return m;
end;
$$;

-- Konteks fungsi web_* (authenticated): wajib anggota aktif (owner bila p_owner). Mengembalikan id anggota.
create or replace function public.mulai_web(p_owner boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if (select auth.uid()) is null then
    perform public.lempar('PT401', 'Sesi tidak sah, silakan masuk lagi', 'OAUTH_019');
  end if;
  if not public.is_member() then
    perform public.lempar('PT403', 'Akun ini belum terdaftar sebagai anggota aktif', 'ACCESS_001');
  end if;
  if p_owner and not public.is_owner() then
    perform public.lempar('PT403', 'Hanya owner yang boleh melakukan ini', 'ACCESS_001');
  end if;
  v_id := public.member_saya();
  perform set_config('app.sumber', 'ui', true);
  perform set_config('app.actor_id', v_id::text, true);
  perform set_config('app.token_id', '', true);
  return v_id;
end;
$$;

-- Anggota yang boleh jadi assignee: ada, aktif, role owner/member (bot bukan anggota tim, seperti ClickUp).
create or replace function public.anggota_wajib(p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salah bigint;
begin
  select x into v_salah
    from unnest(coalesce(p_ids, '{}')) as u(x)
   where not exists (select 1 from public.members m
                      where m.id = u.x and m.aktif and m.role in ('owner', 'member'))
   limit 1;
  if v_salah is not null then
    perform public.lempar('PT400', format('Assignee tidak dikenal: %s', v_salah), 'INPUT_001');
  end if;
end;
$$;

create or replace function public.wajib_owner_aktor()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.members m where m.id = public.aktor() and m.role = 'owner' and m.aktif) then
    perform public.lempar('PT403', 'Hanya owner yang boleh menghapus atau memulihkan tugas', 'HAPUS_OWNER');
  end if;
end;
$$;

-- ---------------------------------------------------------------- idempotensi POST (tabel idem)
create or replace function public.idem_ambil(p_kunci text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kunci is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kunci, 4525));
  return (select i.hasil from public.idem i where i.key = p_kunci and i.created_at > now() - interval '1 day');
end;
$$;

create or replace function public.idem_simpan(p_kunci text, p_hasil jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kunci is null then
    return;
  end if;
  delete from public.idem where created_at < now() - interval '2 days';
  insert into public.idem (key, hasil) values (p_kunci, p_hasil)
  on conflict (key) do update set hasil = excluded.hasil, created_at = now();
end;
$$;

-- ---------------------------------------------------------------- status
-- Cari status list: persis → tanpa beda huruf besar. Tidak ada → PT400.
create or replace function public.status_cari(p_list text, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select s.status into v from public.list_statuses s where s.list_id = p_list and s.status = p_status;
  if v is null then
    select s.status into v from public.list_statuses s
     where s.list_id = p_list and lower(s.status) = lower(btrim(p_status))
     order by s.orderindex, s.status limit 1;
  end if;
  if v is null then
    perform public.lempar('PT400', format('Status "%s" tidak ada di list %s', p_status, p_list), 'INPUT_001');
  end if;
  return v;
end;
$$;

-- Petakan status saat pindah list: nama sama → type sama → (selesai: type closed/done lain) → open pertama.
create or replace function public.status_petakan(p_status text, p_type text, p_list text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select s.status into v from public.list_statuses s
   where s.list_id = p_list and lower(s.status) = lower(p_status)
   order by (s.status = p_status) desc, s.orderindex limit 1;
  if v is null then
    select s.status into v from public.list_statuses s
     where s.list_id = p_list and s.type = p_type order by s.orderindex, s.status limit 1;
  end if;
  if v is null and p_type in ('closed', 'done') then
    select s.status into v from public.list_statuses s
     where s.list_id = p_list and s.type in ('closed', 'done') order by s.orderindex, s.status limit 1;
  end if;
  if v is null then
    select s.status into v from public.list_statuses s
     where s.list_id = p_list and s.type = 'open' order by s.orderindex, s.status limit 1;
  end if;
  if v is null then
    perform public.lempar('PT400', format('List %s tidak punya status', p_list), 'INPUT_001');
  end if;
  return v;
end;
$$;

-- ID status gaya ClickUp: clickup_status_id bila ada, selain itu turunan stabil.
create or replace function public.status_id(p_list text, p_status text, p_clickup_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_clickup_id, 'sc' || p_list || '_' || left(md5(p_status), 8))
$$;

-- ---------------------------------------------------------------- pembentuk JSON gaya ClickUp v2
create or replace function public.app_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rtrim(coalesce((select s.value #>> '{}' from public.app_settings s where s.key = 'app_base_url'),
                        'https://tugas.palletmeshindonesia.com'), '/')
$$;

create or replace function public.team_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select w.id from public.workspace w order by w.created_at, w.id limit 1), '1100340000004525')
$$;

-- member json {id:int, username, email, color, initials, profilePicture:null}
create or replace function public.j_member(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', m.id, 'username', m.username, 'email', coalesce(m.clickup_email, m.email::text),
           'color', m.color, 'initials', m.initials, 'profilePicture', null)
    from public.members m
   where m.id = p_id
$$;

create or replace function public.j_prioritas(p smallint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p
    when 1 then '{"id":"1","priority":"urgent","color":"#f50000","orderindex":"1"}'::jsonb
    when 2 then '{"id":"2","priority":"high","color":"#ffcc00","orderindex":"2"}'::jsonb
    when 3 then '{"id":"3","priority":"normal","color":"#6fddff","orderindex":"3"}'::jsonb
    when 4 then '{"id":"4","priority":"low","color":"#d8d8d8","orderindex":"4"}'::jsonb
  end
$$;

-- objek folder untuk list/task: folder asli, atau folder semu "hidden" untuk list tanpa folder.
create or replace function public.j_folder_list(p_list text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when l.folder_id is null
           then jsonb_build_object('id', l.id || '-hidden', 'name', 'hidden', 'hidden', true, 'access', true)
           else jsonb_build_object('id', f.id, 'name', f.name, 'hidden', f.hidden, 'access', true)
         end
    from public.lists l
    left join public.folders f on f.id = l.folder_id
   where l.id = p_list
$$;

-- list json (kontrak §6). task_count = tugas tidak dihapus & tidak diarsip (semua status).
create or replace function public.j_list(p_list text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', l.id, 'name', l.name, 'orderindex', coalesce(l.orderindex, 0), 'content', coalesce(l.content, ''),
           'status', null, 'priority', null, 'assignee', null,
           'task_count', (select count(*)::int from public.tasks t
                           where t.list_id = l.id and t.deleted_at is null and not t.archived),
           'due_date', null, 'start_date', null,
           'folder', public.j_folder_list(l.id),
           'space', jsonb_build_object('id', s.id, 'name', s.name, 'access', true),
           'archived', l.archived, 'override_statuses', true, 'permission_level', 'create')
    from public.lists l
    join public.spaces s on s.id = l.space_id
   where l.id = p_list
$$;

create or replace function public.j_list_statuses(p_list text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', public.status_id(s.list_id, s.status, s.clickup_status_id), 'status', s.status,
           'orderindex', s.orderindex, 'color', s.color, 'type', s.type)
           order by s.orderindex, s.status), '[]'::jsonb)
    from public.list_statuses s
   where s.list_id = p_list
$$;

-- lampiran json (dalam api_task). url null: Edge mengganti dengan signed URL lalu membuang storage_path/clickup_url.
create or replace function public.j_lampiran(a public.attachments)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'date', public.ms(a.created_at), 'title', a.title, 'type', 1, 'source', 1, 'version', 0,
    'extension', a.extension, 'thumbnail_small', null, 'thumbnail_large', null, 'is_folder', null,
    'mimetype', a.mimetype, 'hidden', false, 'parent_id', a.task_id, 'size', coalesce(a.size, 0),
    'total_comments', 0, 'resolved_comments', 0, 'user', public.j_member(a.uploaded_by), 'deleted', false,
    'orientation', null, 'url', null, 'storage_path', a.storage_path, 'clickup_url', a.clickup_url)
$$;

-- task json (kontrak §6). p_md → markdown_description; p_lampiran → attachments (khusus api_task).
create or replace function public.j_task(p_task text, p_md boolean default false, p_lampiran boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recursive naik as (
    select t0.id, t0.parent_id, 0 as d from public.tasks t0 where t0.id = p_task
    union all
    select p.id, p.parent_id, n.d + 1 from public.tasks p join naik n on p.id = n.parent_id where n.d < 50
  )
  select jsonb_build_object(
           'id', t.id, 'custom_id', null, 'custom_item_id', 0, 'name', t.name,
           'text_content', coalesce(t.description_plain, t.markdown, ''),
           'description', coalesce(t.description_plain, t.markdown, ''),
           'status', jsonb_build_object(
              'id', public.status_id(s.list_id, s.status, s.clickup_status_id), 'status', t.status,
              'color', s.color, 'orderindex', s.orderindex, 'type', t.status_type),
           'orderindex', coalesce(t.orderindex, 0)::text,
           'date_created', public.ms(t.created_at), 'date_updated', public.ms(t.updated_at),
           'date_closed', public.ms(t.closed_at), 'date_done', public.ms(t.done_at),
           'archived', t.archived,
           'creator', (select jsonb_build_object('id', m.id, 'username', m.username, 'color', m.color,
                                                 'email', coalesce(m.clickup_email, m.email::text), 'profilePicture', null)
                         from public.members m where m.id = t.creator_id),
           'assignees', (select coalesce(jsonb_agg(public.j_member(ta.member_id) order by ta.added_at, ta.member_id), '[]'::jsonb)
                           from public.task_assignees ta where ta.task_id = t.id),
           'group_assignees', '[]'::jsonb, 'watchers', '[]'::jsonb,
           -- (perbaikan P1 / PR-1) kartu impor: tags/checklists/custom_fields verbatim dari tasks.extra (bentuk
           -- payload ClickUp, disimpan norm_impor_tugas). Kartu app & kartu tanpa isi → [].
           'checklists', case when t.sumber = 'clickup' and jsonb_typeof(t.extra -> 'checklists') = 'array'
                              then t.extra -> 'checklists' else '[]'::jsonb end,
           'tags', case when t.sumber = 'clickup' and jsonb_typeof(t.extra -> 'tags') = 'array'
                        then t.extra -> 'tags' else '[]'::jsonb end,
           'parent', t.parent_id,
           'top_level_parent', case when t.parent_id is null then null
                                    else (select n.id from naik n order by n.d desc limit 1) end,
           'priority', public.j_prioritas(t.priority),
           'due_date', public.ms(t.due_at), 'due_date_time', t.due_has_time,
           'start_date', public.ms(t.start_at), 'start_date_time', t.start_has_time,
           'points', null, 'time_estimate', null,
           'custom_fields', case when t.sumber = 'clickup' and jsonb_typeof(t.extra -> 'custom_fields') = 'array'
                                 then t.extra -> 'custom_fields' else '[]'::jsonb end,
           'dependencies', '[]'::jsonb,
           'linked_tasks', '[]'::jsonb, 'locations', '[]'::jsonb,
           'team_id', public.team_id(),
           'url', public.app_url() || '/t/' || t.id,
           'sharing', jsonb_build_object('public', false),
           'permission_level', 'create',
           'list', jsonb_build_object('id', l.id, 'name', l.name, 'access', true),
           'project', public.j_folder_list(l.id),
           'folder', public.j_folder_list(l.id),
           'space', jsonb_build_object('id', l.space_id))
         || case when p_md then jsonb_build_object('markdown_description',
                   case when t.desc_unreadable then '' else coalesce(t.markdown, '') end)
                 else '{}'::jsonb end
         || case when p_lampiran then jsonb_build_object('attachments',
                   (select coalesce(jsonb_agg(public.j_lampiran(a) order by a.created_at, a.id), '[]'::jsonb)
                      from public.attachments a where a.task_id = t.id and a.deleted_at is null))
                 else '{}'::jsonb end
    from public.tasks t
    join public.lists l on l.id = t.list_id
    left join public.list_statuses s on s.list_id = t.list_id and s.status = t.status
   where t.id = p_task
$$;

-- comment json (kontrak §6): balasan tanpa reply_count. parts dari body_json, fallback [{text}].
create or replace function public.j_comment(p_comment text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id,
           'comment', case when jsonb_typeof(c.body_json) = 'array' and jsonb_array_length(c.body_json) > 0
                           then c.body_json else jsonb_build_array(jsonb_build_object('text', c.text)) end,
           'comment_text', c.text, 'user', public.j_member(c.author_id),
           'assignee', null, 'group_assignee', null, 'reactions', '[]'::jsonb,
           'date', public.ms(c.created_at), 'resolved', false)
         || case when c.parent_id is null then jsonb_build_object('reply_count',
                   (select count(*)::int from public.comments r where r.parent_id = c.id and r.deleted_at is null))
                 else '{}'::jsonb end
    from public.comments c
   where c.id = p_comment
$$;

-- ---------------------------------------------------------------- komentar: parts + mention
-- Pecah teks menjadi parts ClickUp: {text} dan {type:"tag", user:{id,username,email,color,initials}}.
-- Mention = '@' + username PERSIS (anggota aktif; bila p_mentions diisi, hanya anggota itu), tidak diikuti
-- huruf/angka. Mengembalikan parts & daftar id yang disebut (∪ p_mentions yang valid).
create or replace function public.komentar_parts(p_teks text, p_mentions bigint[] default null,
                                                 out parts jsonb, out mentions bigint[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pola  text;
  v_pos   integer := 1;
  v_mulai integer;
  v_cocok text;
  m       public.members;
begin
  parts := '[]'::jsonb;
  mentions := '{}'::bigint[];
  p_teks := coalesce(p_teks, '');
  if p_mentions is not null and exists (
       select 1 from unnest(p_mentions) u(x) where not exists (select 1 from public.members mm where mm.id = u.x and mm.aktif)) then
    perform public.lempar('PT400', 'Anggota yang di-mention tidak dikenal', 'INPUT_001');
  end if;

  select string_agg(regexp_replace(mm.username, '([.^$*+?(){}|\[\]\\-])', '\\\1', 'g'), '|'
                    order by length(mm.username) desc, mm.username)
    into v_pola
    from public.members mm
   where mm.aktif and (p_mentions is null or mm.id = any (p_mentions));

  if v_pola is not null then
    v_pola := '@(' || v_pola || ')(?![[:alnum:]_])';
    loop
      v_mulai := regexp_instr(p_teks, v_pola, v_pos);
      exit when v_mulai = 0;
      v_cocok := regexp_substr(p_teks, v_pola, v_pos);
      if v_mulai > v_pos then
        parts := parts || jsonb_build_array(jsonb_build_object('text', substr(p_teks, v_pos, v_mulai - v_pos)));
      end if;
      select * into m from public.members mm where mm.username = substr(v_cocok, 2) and mm.aktif;
      parts := parts || jsonb_build_array(jsonb_build_object('type', 'tag', 'user', jsonb_build_object(
                 'id', m.id, 'username', m.username, 'email', coalesce(m.clickup_email, m.email::text),
                 'color', m.color, 'initials', m.initials)));
      if not (m.id = any (mentions)) then
        mentions := mentions || m.id;
      end if;
      v_pos := v_mulai + length(v_cocok);
    end loop;
  end if;
  if v_pos <= length(p_teks) then
    parts := parts || jsonb_build_array(jsonb_build_object('text', substr(p_teks, v_pos)));
  end if;
  if jsonb_array_length(parts) = 0 then
    parts := jsonb_build_array(jsonb_build_object('text', p_teks));
  end if;
  if p_mentions is not null then
    select coalesce(array_agg(distinct x), '{}') into mentions
      from unnest(mentions || p_mentions) u(x);
  end if;
end;
$$;
