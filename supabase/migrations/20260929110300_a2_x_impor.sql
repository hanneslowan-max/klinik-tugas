-- A2 · 4/6: endpoint tambahan /api/x/* (x_*) dan pemuat impor/sinkron (impor_*). service_role saja.
-- Kontrak ARSITEKTUR.md §6, riset rancang-kompatibilitas.md §6, baca-pagar.md §1.

-- ================================================================ x_*
create or replace function public.x_activity(p_aktor bigint, p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  -- (review R2) tugas yang ada wajib terlihat aktor; riwayat tugas yang sudah di-purge hanya untuk owner/bot.
  if exists (select 1 from public.tasks where id = p_task) then
    if not public.tugas_terlihat(p_task) then
      perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
    end if;
  elsif not exists (select 1 from public.activity where task_id = p_task) or not public.lihat_semua() then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  return public.riwayat_tugas(p_task);
end;
$$;

-- Hasil: array ringkas {id, name, status, status_type, list:{id,name}, space_id, assignees:[username], due_wib,
-- updated (ISO UTC), url}. Maks 50, urut relevansi lalu terbaru diubah.
create or replace function public.x_search(p_aktor bigint, p_q text, p_space text default null,
                                           p_include_closed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'name', t.name, 'status', t.status, 'status_type', t.status_type,
             'list', jsonb_build_object('id', l.id, 'name', l.name), 'space_id', l.space_id,
             'assignees', (select coalesce(jsonb_agg(m.username order by ta.added_at, ta.member_id), '[]'::jsonb)
                             from public.task_assignees ta join public.members m on m.id = ta.member_id
                            where ta.task_id = t.id),
             'due_wib', t.due_wib, 'updated', public.iso_utc(t.updated_at),
             'url', public.app_url() || '/t/' || t.id)
             order by c.peringkat, t.updated_at desc, t.id), '[]'::jsonb)
      from public.cari_tugas(p_q, p_space, p_include_closed, 50) c
      join public.tasks t on t.id = c.task_id
      join public.lists l on l.id = t.list_id);
end;
$$;

-- Terima ID (tugas/list/folder/space/komentar/anggota/lampiran), URL app (/t/<id>, /l/<id>),
-- URL app.clickup.com/t/<id>, /t/<team>/<id>, /<team>/v/li|l/<list>, /v/f/<folder>, /v/s/<space>, dan (P6) URL
-- tampilan list/board /v/l/6-<list>-1, /v/b/6-<list>-2 (induk 5 = folder, 4 = space).
create or replace function public.x_resolve(p_aktor bigint, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref  text := btrim(coalesce(p_ref, ''));
  v_id   text;
  v_tipe text;
  v_base text := public.app_url();
  v_x    text;
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if v_ref = '' then
    perform public.lempar('PT400', 'ref kosong', 'INPUT_001');
  end if;
  -- (perbaikan P6) pengurai bersama pencarian: termasuk URL tampilan ClickUp /v/l/6-<list>-1, /v/b/6-<list>-2,
  -- /v/<x>/5-<folder>-<n>, /v/<x>/4-<space>-<n> (lihat rujukan_urai).
  select u.tipe, u.id into v_tipe, v_id from public.rujukan_urai(v_ref) u;
  if v_id is null or v_tipe = 'workspace' then
    perform public.lempar('PT404', 'Rujukan tidak dikenali', 'ITEM_013');
  end if;

  -- (review R2) hanya rujukan yang terlihat aktor (privasi space); selain itu 404 seperti tidak ada.
  if (v_tipe is null or v_tipe = 'task')
     and exists (select 1 from public.tasks t where (t.id = v_id or t.clickup_id = v_id) and public.tugas_terlihat(t.id)) then
    select t.id into v_x from public.tasks t where (t.id = v_id or t.clickup_id = v_id) and public.tugas_terlihat(t.id)
     order by (t.id = v_id) desc limit 1;
    return jsonb_build_object('type', 'task', 'id', v_x, 'url', v_base || '/t/' || v_x);
  end if;
  if (v_tipe is null or v_tipe = 'list') and public.list_terlihat(v_id) then
    return jsonb_build_object('type', 'list', 'id', v_id, 'url', v_base || '/l/' || v_id);
  end if;
  if (v_tipe is null or v_tipe = 'folder')
     and exists (select 1 from public.folders f where f.id = v_id and public.space_terlihat(f.space_id)) then
    return jsonb_build_object('type', 'folder', 'id', v_id, 'url', null);
  end if;
  if (v_tipe is null or v_tipe = 'space') and exists (select 1 from public.spaces where id = v_id)
     and public.space_terlihat(v_id) then
    return jsonb_build_object('type', 'space', 'id', v_id, 'url', null);
  end if;
  if v_tipe is null then
    select c.task_id into v_x from public.comments c
     where (c.id = v_id or c.clickup_id = v_id) and public.tugas_terlihat(c.task_id) limit 1;
    if v_x is not null then
      return jsonb_build_object('type', 'comment', 'id', v_id, 'url', v_base || '/t/' || v_x || '#c-' || v_id);
    end if;
    select a.task_id into v_x from public.attachments a
     where (a.id = v_id or a.clickup_id = v_id) and public.tugas_terlihat(a.task_id) limit 1;
    if v_x is not null then
      return jsonb_build_object('type', 'attachment', 'id', v_id, 'url', v_base || '/t/' || v_x);
    end if;
    if v_id ~ '^[0-9]{1,18}$' and exists (select 1 from public.members where id = v_id::bigint) then
      return jsonb_build_object('type', 'member', 'id', v_id, 'url', null);
    end if;
  end if;
  perform public.lempar('PT404', 'Rujukan tidak ditemukan', 'ITEM_013');
  return null;
end;
$$;

-- TENGGAT B10 + beban B5. p_tanggal default hari ini WIB; p_folder menimpa app_settings.tenggat_folder_ids.
create or replace function public.x_tenggat(p_aktor bigint, p_tanggal date default null, p_folder text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  return public.tenggat_hitung(p_tanggal, p_folder);
end;
$$;

-- Sensus per list untuk bukti hitungan impor. p_sumber 'clickup' = hanya baris asal ClickUp.
create or replace function public.x_sensus(p_aktor bigint, p_sumber text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lists jsonb;
  v_tutup text[];
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  if p_sumber is not null and p_sumber not in ('app', 'clickup') then
    perform public.lempar('PT400', 'p_sumber harus app/clickup/null', 'INPUT_001');
  end if;
  v_tutup := public.list_tertutup();          -- (review R2) list di space privat yang tidak terlihat aktor

  with t as (
    select x.* from public.tasks x
     where (p_sumber is null or x.sumber = p_sumber) and not (x.list_id = any (v_tutup))
  ), c as (
    select x.id, x.parent_id, t.list_id
      from public.comments x join t on t.id = x.task_id
     where x.deleted_at is null and t.deleted_at is null and (p_sumber is null or x.sumber = p_sumber)
  ), a as (
    select x.comment_id, t.list_id
      from public.attachments x join t on t.id = x.task_id
     where x.deleted_at is null and t.deleted_at is null and (p_sumber is null or x.sumber = p_sumber)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'list_id', l.id, 'name', l.name, 'space_id', l.space_id, 'folder_id', l.folder_id, 'archived_list', l.archived,
           'tasks_total', (select count(*) from t where t.list_id = l.id and t.deleted_at is null),
           'open', (select count(*) from t where t.list_id = l.id and t.deleted_at is null
                                          and t.status_type not in ('closed', 'done')),
           'closed', (select count(*) from t where t.list_id = l.id and t.deleted_at is null
                                            and t.status_type in ('closed', 'done')),
           'archived', (select count(*) from t where t.list_id = l.id and t.deleted_at is null and t.archived),
           'deleted', (select count(*) from t where t.list_id = l.id and t.deleted_at is not null),
           'subtasks', (select count(*) from t where t.list_id = l.id and t.deleted_at is null and t.parent_id is not null),
           'comments_top', (select count(*) from c where c.list_id = l.id and c.parent_id is null),
           'replies', (select count(*) from c where c.list_id = l.id and c.parent_id is not null),
           'reply_count_sum', (select count(*) from c r join c p on p.id = r.parent_id
                                where r.list_id = l.id and r.parent_id is not null),
           'attachments_task', (select count(*) from a where a.list_id = l.id and a.comment_id is null),
           'attachments_comment', (select count(*) from a where a.list_id = l.id and a.comment_id is not null),
           'assignee_links', (select count(*) from public.task_assignees ta join t on t.id = ta.task_id
                               where t.list_id = l.id and t.deleted_at is null),
           'sha_ids_tasks', encode(extensions.digest(coalesce((select string_agg(t.id, ',' order by t.id) from t
                                     where t.list_id = l.id and t.deleted_at is null), ''), 'sha256'), 'hex'),
           'sha_ids_comments', encode(extensions.digest(coalesce((select string_agg(c.id, ',' order by c.id) from c
                                     where c.list_id = l.id), ''), 'sha256'), 'hex'))
           order by l.space_id, l.folder_id nulls first, l.orderindex nulls last, l.id), '[]'::jsonb)
    into v_lists
    from public.lists l
   where not (l.id = any (v_tutup));

  return jsonb_build_object(
    'dibuat', public.iso_utc(now()),
    'sumber', coalesce(p_sumber, 'semua'),
    'lists', v_lists,
    'total', (select jsonb_build_object(
                'lists', count(*),
                'tasks_total', coalesce(sum((e ->> 'tasks_total')::int), 0),
                'open', coalesce(sum((e ->> 'open')::int), 0),
                'closed', coalesce(sum((e ->> 'closed')::int), 0),
                'archived', coalesce(sum((e ->> 'archived')::int), 0),
                'deleted', coalesce(sum((e ->> 'deleted')::int), 0),
                'subtasks', coalesce(sum((e ->> 'subtasks')::int), 0),
                'comments_top', coalesce(sum((e ->> 'comments_top')::int), 0),
                'replies', coalesce(sum((e ->> 'replies')::int), 0),
                'reply_count_sum', coalesce(sum((e ->> 'reply_count_sum')::int), 0),
                'attachments_task', coalesce(sum((e ->> 'attachments_task')::int), 0),
                'attachments_comment', coalesce(sum((e ->> 'attachments_comment')::int), 0),
                'assignee_links', coalesce(sum((e ->> 'assignee_links')::int), 0),
                'sha_ids_tasks', encode(extensions.digest(coalesce((select string_agg(x.id, ',' order by x.id)
                                   from public.tasks x where x.deleted_at is null
                                    and (p_sumber is null or x.sumber = p_sumber)
                                    and not (x.list_id = any (v_tutup))), ''), 'sha256'), 'hex'),
                'sha_ids_comments', encode(extensions.digest(coalesce((select string_agg(x.id, ',' order by x.id)
                                   from public.comments x join public.tasks y on y.id = x.task_id
                                  where x.deleted_at is null and y.deleted_at is null
                                    and (p_sumber is null or x.sumber = p_sumber)
                                    and not (y.list_id = any (v_tutup))), ''), 'sha256'), 'hex'))
              from jsonb_array_elements(v_lists) e));
end;
$$;

-- Seluruh data untuk backup (tanpa api_tokens.token_hash, tanpa idem, tanpa kolom turunan tasks.cari).
-- Butuh scope 'impor' bila dipanggil dengan x-token-id. (review R2) Hanya aktor yang melihat semua data
-- (owner/bot, atau privasi_space "abaikan"); selain itu PT403 supaya space privat tidak bocor lewat ekspor.
create or replace function public.x_export(p_aktor bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'impor');
  if not public.lihat_semua() then
    perform public.lempar('PT403', 'Ekspor penuh hanya untuk owner atau bot', 'ACCESS_001');
  end if;
  return jsonb_build_object(
    'meta', jsonb_build_object('dibuat', public.iso_utc(now()), 'format', 'rhj-tugas-export-1',
                               'team_id', public.team_id()),
    'workspace',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.workspace x),
    'members',          (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.members x),
    'spaces',           (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.spaces x),
    'space_anggota',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.space_id, x.member_id), '[]')
                           from public.space_anggota x),
    'folders',          (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.folders x),
    'lists',            (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.lists x),
    'list_statuses',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.list_id, x.orderindex, x.status), '[]')
                           from public.list_statuses x),
    'tasks',            (select coalesce(jsonb_agg(to_jsonb(x) - 'cari' order by x.id), '[]') from public.tasks x),
    'task_assignees',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.task_id, x.member_id), '[]')
                           from public.task_assignees x),
    'comments',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.comments x),
    'comment_mentions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.comment_id, x.member_id), '[]')
                           from public.comment_mentions x),
    'attachments',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.attachments x),
    'activity',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.activity x),
    'notifications',    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.notifications x),
    'api_tokens',       (select coalesce(jsonb_agg(to_jsonb(x) - 'token_hash' order by x.created_at, x.id), '[]')
                           from public.api_tokens x),
    'hari_libur',       (select coalesce(jsonb_agg(to_jsonb(x) order by x.tanggal), '[]') from public.hari_libur x),
    'app_settings',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.key), '[]') from public.app_settings x),
    'sync_runs',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.sync_runs x),
    'sync_raw',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.entity, x.id), '[]') from public.sync_raw x));
end;
$$;

-- Admin akun (dipanggil Edge /api/x/admin/akun setelah verifikasi JWT owner): tautkan user Auth ke anggota.
create or replace function public.x_admin_akun(p_aktor bigint, p_member bigint, p_auth_user uuid, p_email text,
                                               p_harus_ganti boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  m := public.mulai_api(p_aktor, 'api', 'tulis');
  if m.role <> 'owner' then
    perform public.lempar('PT403', 'Hanya owner yang boleh mengatur akun', 'ACCESS_001');
  end if;
  if not exists (select 1 from public.members where id = p_member) then
    perform public.lempar('PT404', 'Anggota tidak ditemukan', 'ITEM_013');
  end if;
  if exists (select 1 from public.members where id = p_member and role = 'bot') then
    perform public.lempar('PT400', 'Bot tidak punya akun login', 'INPUT_001');
  end if;
  begin
    update public.members
       set auth_user_id = p_auth_user,
           email = coalesce(nullif(btrim(p_email), ''), email),
           harus_ganti_password = coalesce(p_harus_ganti, true)
     where id = p_member;
  exception when unique_violation then
    perform public.lempar('PT409', 'Email atau akun login sudah dipakai anggota lain', 'KONFLIK_001');
  end;
  return (select jsonb_build_object('id', x.id, 'username', x.username, 'email', x.email, 'auth_user_id', x.auth_user_id,
                                    'harus_ganti_password', x.harus_ganti_password)
            from public.members x where x.id = p_member);
end;
$$;

-- ================================================================ impor_*: normalisasi baris
-- Baris tugas: kolom tabel ATAU payload ClickUp mentah (list.id, parent, markdown_description, text_content,
-- status{status}, priority{id}, due_date, date_created/updated/closed/done, creator{id}, url, assignees[{id}],
-- tags/checklists/custom_fields → extra). Hasil: objek ternormalisasi (tanggal = string ms) untuk hash & tulis.
create or replace function public.norm_impor_tugas(r jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_md     text := coalesce(r ->> 'markdown', r ->> 'markdown_description');
  v_plain  text := coalesce(r ->> 'description_plain', r ->> 'text_content', r ->> 'description');
  v_unread boolean;
  v_extra  jsonb;
begin
  v_unread := case when r ? 'desc_unreadable' then public.bool_dari(r -> 'desc_unreadable', false)
                   else nullif(btrim(coalesce(v_md, '')), '') is null and nullif(btrim(coalesce(v_plain, '')), '') is not null end;
  if v_unread and nullif(btrim(coalesce(v_md, '')), '') is null then
    v_md := v_plain;
  end if;
  if r ? 'extra' and jsonb_typeof(r -> 'extra') = 'object' then
    v_extra := r -> 'extra';
  else
    -- (perbaikan P1) isi VERBATIM: kunci bernilai null di dalam checklist/tag/custom field (assignee, parent, …)
    -- dipertahankan supaya task json app sama persis dengan ClickUp (dulu jsonb_strip_nulls membuangnya).
    v_extra := case when jsonb_typeof(r -> 'tags') = 'array' and jsonb_array_length(r -> 'tags') > 0
                    then jsonb_build_object('tags', r -> 'tags') else '{}'::jsonb end
            || case when jsonb_typeof(r -> 'checklists') = 'array' and jsonb_array_length(r -> 'checklists') > 0
                    then jsonb_build_object('checklists', r -> 'checklists') else '{}'::jsonb end
            || case when jsonb_typeof(r -> 'custom_fields') = 'array'
                          and exists (select 1 from jsonb_array_elements(r -> 'custom_fields') f
                                       where f.value ? 'value' and f.value -> 'value' not in ('null'::jsonb, '""'::jsonb))
                    then jsonb_build_object('custom_fields', r -> 'custom_fields') else '{}'::jsonb end;
  end if;
  return jsonb_build_object(
    'id', r ->> 'id',
    'list_id', coalesce(r ->> 'list_id', r -> 'list' ->> 'id'),
    'parent_id', nullif(coalesce(r ->> 'parent_id', r ->> 'parent'), ''),
    'name', r ->> 'name',
    'markdown', nullif(v_md, ''),
    'description_plain', nullif(v_plain, ''),
    'desc_unreadable', coalesce(v_unread, false),
    'status', case when jsonb_typeof(r -> 'status') = 'object' then r -> 'status' ->> 'status' else r ->> 'status' end,
    'priority', public.prioritas_dari(r -> 'priority'),
    'due_at', public.ms(public.ts_dari(coalesce(r -> 'due_at', r -> 'due_date'))),
    'due_has_time', public.bool_dari(coalesce(r -> 'due_has_time', r -> 'due_date_time'), false),
    'start_at', public.ms(public.ts_dari(coalesce(r -> 'start_at', r -> 'start_date'))),
    'start_has_time', public.bool_dari(coalesce(r -> 'start_has_time', r -> 'start_date_time'), false),
    'creator_id', coalesce(r ->> 'creator_id', r -> 'creator' ->> 'id')::bigint,
    'created_at', public.ms(public.ts_dari(coalesce(r -> 'created_at', r -> 'date_created'))),
    'updated_at', public.ms(public.ts_dari(coalesce(r -> 'updated_at', r -> 'date_updated'))),
    'closed_at', public.ms(public.ts_dari(coalesce(r -> 'closed_at', r -> 'date_closed'))),
    'done_at', public.ms(public.ts_dari(coalesce(r -> 'done_at', r -> 'date_done'))),
    'archived', public.bool_dari(r -> 'archived', false),
    'orderindex', nullif(r ->> 'orderindex', '')::numeric,
    'extra', coalesce(v_extra, '{}'::jsonb),
    'clickup_url', coalesce(r ->> 'clickup_url', r ->> 'url'),
    'assignees', case when r ? 'assignees'
                      then (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from unnest(public.ids_dari(r -> 'assignees')) x)
                 end);
end;
$$;

-- Baris komentar: kolom tabel ATAU payload ClickUp (comment_text, comment[parts], user{id}, date) + task_id,
-- parent_id (untuk balasan) dari importer.
create or replace function public.norm_impor_komentar(r jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r ->> 'id',
    'task_id', r ->> 'task_id',
    'parent_id', nullif(r ->> 'parent_id', ''),
    'author_id', coalesce(r ->> 'author_id', r -> 'user' ->> 'id')::bigint,
    'text', coalesce(r ->> 'text', r ->> 'comment_text', ''),
    'body_json', case when jsonb_typeof(coalesce(r -> 'body_json', r -> 'comment')) = 'array'
                      then coalesce(r -> 'body_json', r -> 'comment') end,
    'created_at', public.ms(public.ts_dari(coalesce(r -> 'created_at', r -> 'date'))))
$$;

create or replace function public.sha256_hex(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

-- ================================================================ impor_*: per jenis (internal)
-- (review R1) Aturan umum pemuat: impor hanya menulis baris sumber='clickup' dan tidak pernah menempel ke
-- data buatan app (list/space/folder/tugas/komentar app, anggota id ≥ 900000000000, owner/bot).

-- Anggota yang sah dari ClickUp untuk assignee kartu ClickUp: sudah diimpor, bukan bot, bukan anggota buatan app.
-- Anggota nonaktif (eks-tim) tetap sah: riwayat assignee ClickUp.
create or replace function public.anggota_impor_wajib(p_ids bigint[])
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
                      where m.id = u.x and m.role <> 'bot' and m.id < 900000000000)
   limit 1;
  if v_salah is not null then
    perform public.lempar('PT400',
      format('Assignee %s belum diimpor sebagai anggota ClickUp (atau bot/anggota buatan app)', v_salah), 'INPUT_001');
  end if;
end;
$$;

-- (review R2) Anggota space dari payload ClickUp `members` ([{user:{id}}] / [{id}] / [id]) → space_anggota
-- sumber 'clickup', himpunan penuh (baris sumber 'app' dari owner tidak disentuh). ID yang belum diimpor
-- (atau rentang anggota buatan app) dilewati. Hasil: {"ditambah","dibuang","dilewati":[id]} (null = payload
-- bukan array → anggota tidak disentuh). (perbaikan P2) dipakai juga jenis impor 'space_anggota'.
create or replace function public.set_space_anggota_impor(p_space text, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids   bigint[];
  v_lewat bigint[];
  n1      integer;
  n2      integer;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    return null;
  end if;
  with y as (
    select distinct case when z.s ~ '^[0-9]{1,18}$' then z.s::bigint end as id
      from (select case when jsonb_typeof(e) = 'object' then coalesce(e -> 'user' ->> 'id', e ->> 'id')
                        else e #>> '{}' end as s
              from jsonb_array_elements(p_members) a(e)) z)
  select coalesce(array_agg(y.id order by y.id) filter (where ok), '{}'),
         coalesce(array_agg(y.id order by y.id) filter (where not ok), '{}')
    into v_ids, v_lewat
    from (select y.id, exists (select 1 from public.members m where m.id = y.id and m.id < 900000000000) as ok
            from y where y.id is not null) y;
  delete from public.space_anggota sa
   where sa.space_id = p_space and sa.sumber = 'clickup' and not (sa.member_id = any (v_ids));
  get diagnostics n1 = row_count;
  insert into public.space_anggota (space_id, member_id, sumber)
  select p_space, x, 'clickup' from unnest(v_ids) u(x)
  on conflict (space_id, member_id) do nothing;
  get diagnostics n2 = row_count;
  return jsonb_build_object('ditambah', n2, 'dibuang', n1, 'dilewati', to_jsonb(v_lewat));
end;
$$;

-- (perbaikan P2) Jenis impor 'space_anggota': ClickUp v2 tidak punya endpoint anggota space, jadi importer
-- menurunkan anggota space PRIVAT dari gabungan GET /list/{id}/member semua list di space itu + owner/admin
-- workspace (role 1/2 di /team). Baris {space_id, member_ids:[…]} (atau members:[{user:{id}}|{id}|id]) = himpunan
-- penuh sumber 'clickup' per space; anggota sumber 'app' (ditambah owner di Admin) tidak pernah dihapus.
-- Space wajib sudah diimpor dan bersumber clickup (R1). Idempoten: himpunan sama → unchanged.
-- Hasil per space: inserted (space belum punya anggota clickup lalu mendapat ≥1), updated (himpunan berubah),
-- unchanged; + total "ditambah"/"dibuang" dan "dilewati":[{space_id, ids}] (anggota belum diimpor).
create or replace function public.muat_space_anggota(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_space text; v_sumber text; v_ada boolean; x jsonb;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; n_tambah int := 0; n_buang int := 0;
  v_lewat jsonb := '[]'::jsonb; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      v_space := nullif(coalesce(r ->> 'space_id', r -> 'space' ->> 'id'), '');
      if v_space is null then
        perform public.lempar('PT400', 'space_id wajib', 'INPUT_001');
      end if;
      select s.sumber into v_sumber from public.spaces s where s.id = v_space;
      if not found then
        perform public.lempar('PT404', format('Space %s belum diimpor', v_space), 'ITEM_013');
      end if;
      if v_sumber <> 'clickup' then
        perform public.lempar('PT409', format('Space %s buatan app; anggotanya diatur Admin, bukan impor', v_space),
                              'KONFLIK_001');
      end if;
      if jsonb_typeof(coalesce(r -> 'member_ids', r -> 'members')) is distinct from 'array' then
        perform public.lempar('PT400', 'member_ids wajib array (himpunan penuh; [] = kosongkan anggota clickup)', 'INPUT_001');
      end if;
      v_ada := exists (select 1 from public.space_anggota sa where sa.space_id = v_space and sa.sumber = 'clickup');
      x := public.set_space_anggota_impor(v_space, coalesce(r -> 'member_ids', r -> 'members'));
      n_tambah := n_tambah + (x ->> 'ditambah')::int;
      n_buang := n_buang + (x ->> 'dibuang')::int;
      if jsonb_array_length(x -> 'dilewati') > 0 then
        v_lewat := v_lewat || jsonb_build_array(jsonb_build_object('space_id', v_space, 'ids', x -> 'dilewati'));
      end if;
      if (x ->> 'ditambah')::int + (x ->> 'dibuang')::int = 0 then
        n_sama := n_sama + 1;
      elsif not v_ada then
        n_ins := n_ins + 1;
      else
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', coalesce(v_space, r ->> 'space_id'), 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'ditambah', n_tambah,
                            'dibuang', n_buang, 'dilewati', v_lewat, 'gagal', v_gagal);
end;
$$;

create or replace function public.muat_members(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; u jsonb; m public.members;
  v_id bigint; v_user text; v_mail text; v_ini text; v_col text; v_nama text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text;
  v_lindung jsonb := '[]'::jsonb;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      u := case when jsonb_typeof(r -> 'user') = 'object' then r -> 'user' else r end;
      if coalesce(u ->> 'id', '') !~ '^[0-9]{1,18}$' then
        perform public.lempar('PT400', 'id anggota wajib angka', 'INPUT_001');
      end if;
      v_id := (u ->> 'id')::bigint;
      -- (review R1) rentang id anggota buatan app (sequence ≥ 900000000000) tidak pernah dari ClickUp
      if v_id >= 900000000000 then
        perform public.lempar('PT409', format('ID anggota %s ada di rentang anggota buatan app; tidak boleh dari impor', v_id),
                              'KONFLIK_001');
      end if;
      select * into m from public.members where id = v_id;
      -- (review R1) owner/bot dikelola app: impor tidak menyentuh barisnya sama sekali (dihitung unchanged,
      -- dilaporkan di 'dilindungi'; bukan gagal supaya sinkron rutin tidak berkode 2).
      if m.id is not null and m.role in ('owner', 'bot') then
        v_lindung := v_lindung || to_jsonb(v_id);
        n_sama := n_sama + 1;
        continue;
      end if;
      v_user := coalesce(nullif(btrim(u ->> 'username'), ''), nullif(btrim(u ->> 'email'), ''), 'user ' || v_id);
      v_mail := case when u ? 'email' then nullif(u ->> 'email', '') else m.clickup_email end;
      v_ini  := case when u ? 'initials' then u ->> 'initials' else m.initials end;
      v_col  := case when u ? 'color' then u ->> 'color' else m.color end;
      v_nama := nullif(btrim(coalesce(r ->> 'nama', u ->> 'nama')), '');
      if m.id is null then
        -- (review R1) role impor selalu 'member' (r.role diabaikan); owner hanya lewat admin app
        insert into public.members (id, username, clickup_email, nama, initials, color, role, aktif)
        values (v_id, v_user, v_mail, coalesce(v_nama, v_user), v_ini, v_col, 'member',
                coalesce(public.bool_dari(r -> 'aktif'), true));
        n_ins := n_ins + 1;
      elsif (m.username, m.clickup_email, m.initials, m.color) is not distinct from (v_user, v_mail, v_ini, v_col)
            and (v_nama is null or m.nama is not null) then
        n_sama := n_sama + 1;
      else
        update public.members
           set username = v_user, clickup_email = v_mail, initials = v_ini, color = v_col,
               nama = coalesce(nama, v_nama)
         where id = v_id;
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', coalesce(u ->> 'id', r ->> 'id'), 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'dilindungi', v_lindung,
                            'gagal', v_gagal);
end;
$$;

-- spaces / folders / lists (satu fungsi, p_jenis menentukan kolom)
create or replace function public.muat_struktur(p_jenis text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_id text; v_lama jsonb; v_baru jsonb; v_space text; v_folder text; v_induk text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text;
  v_anggota boolean; v_x jsonb;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      v_id := nullif(r ->> 'id', '');
      if v_id is null or nullif(btrim(r ->> 'name'), '') is null then
        perform public.lempar('PT400', 'id dan name wajib', 'INPUT_001');
      end if;
      if p_jenis = 'spaces' then
        v_baru := jsonb_build_object('name', r ->> 'name', 'private', public.bool_dari(r -> 'private', false),
                    'archived', public.bool_dari(r -> 'archived', false),
                    'orderindex', nullif(r ->> 'orderindex', '')::numeric::integer, 'color', r ->> 'color');
        select jsonb_build_object('name', s.name, 'private', s.private, 'archived', s.archived,
                                  'orderindex', s.orderindex, 'color', s.color, 'sumber', s.sumber)
          into v_lama from public.spaces s where s.id = v_id;
      elsif p_jenis = 'folders' then
        v_space := coalesce(r ->> 'space_id', r -> 'space' ->> 'id');
        v_baru := jsonb_build_object('space_id', v_space, 'name', r ->> 'name',
                    'hidden', public.bool_dari(r -> 'hidden', false), 'archived', public.bool_dari(r -> 'archived', false),
                    'orderindex', nullif(r ->> 'orderindex', '')::numeric::integer);
        select jsonb_build_object('space_id', f.space_id, 'name', f.name, 'hidden', f.hidden, 'archived', f.archived,
                                  'orderindex', f.orderindex, 'sumber', f.sumber)
          into v_lama from public.folders f where f.id = v_id;
      else
        v_space := coalesce(r ->> 'space_id', r -> 'space' ->> 'id');
        if r ? 'folder_id' then
          v_folder := nullif(r ->> 'folder_id', '');
        else
          select f.id into v_folder from public.folders f where f.id = r -> 'folder' ->> 'id';
        end if;
        v_baru := jsonb_build_object('space_id', v_space, 'folder_id', v_folder, 'name', r ->> 'name',
                    'content', nullif(r ->> 'content', ''), 'archived', public.bool_dari(r -> 'archived', false),
                    'orderindex', nullif(r ->> 'orderindex', '')::numeric::integer);
        select jsonb_build_object('space_id', l.space_id, 'folder_id', l.folder_id, 'name', l.name, 'content', l.content,
                                  'archived', l.archived, 'orderindex', l.orderindex, 'sumber', l.sumber)
          into v_lama from public.lists l where l.id = v_id;
      end if;

      if v_lama is not null and v_lama ->> 'sumber' <> 'clickup' then
        perform public.lempar('PT409', format('ID %s bentrok dengan data buatan app', v_id), 'KONFLIK_001');
      end if;
      -- (review R1) folder/list ClickUp hanya boleh di bawah space/folder ClickUp
      if p_jenis in ('folders', 'lists') then
        select s.sumber into v_induk from public.spaces s where s.id = v_space;
        if v_induk is null then
          perform public.lempar('PT404', format('Space %s belum diimpor', v_space), 'ITEM_013');
        elsif v_induk <> 'clickup' then
          perform public.lempar('PT409', format('Space %s buatan app; struktur ClickUp tidak boleh masuk', v_space),
                                'KONFLIK_001');
        end if;
      end if;
      if p_jenis = 'lists' and v_folder is not null then
        select f.sumber into v_induk from public.folders f where f.id = v_folder;
        if v_induk is distinct from 'clickup' and v_induk is not null then
          perform public.lempar('PT409', format('Folder %s buatan app; list ClickUp tidak boleh masuk', v_folder),
                                'KONFLIK_001');
        end if;
      end if;

      if v_lama is null then
        if p_jenis = 'spaces' then
          insert into public.spaces (id, name, private, archived, orderindex, color, sumber, synced_at)
          values (v_id, v_baru ->> 'name', (v_baru ->> 'private')::boolean, (v_baru ->> 'archived')::boolean,
                  (v_baru ->> 'orderindex')::integer, v_baru ->> 'color', 'clickup', now());
        elsif p_jenis = 'folders' then
          insert into public.folders (id, space_id, name, hidden, archived, orderindex, sumber, synced_at)
          values (v_id, v_space, v_baru ->> 'name', (v_baru ->> 'hidden')::boolean, (v_baru ->> 'archived')::boolean,
                  (v_baru ->> 'orderindex')::integer, 'clickup', now());
        else
          insert into public.lists (id, space_id, folder_id, name, content, archived, orderindex, tidak_ditagih, sumber, synced_at)
          values (v_id, v_space, v_folder, v_baru ->> 'name', v_baru ->> 'content', (v_baru ->> 'archived')::boolean,
                  (v_baru ->> 'orderindex')::integer, coalesce(public.bool_dari(r -> 'tidak_ditagih'), false), 'clickup', now());
        end if;
        n_ins := n_ins + 1;
        if p_jenis = 'spaces' then
          perform public.set_space_anggota_impor(v_id, coalesce(r -> 'members', r -> 'anggota'));
        end if;
      elsif (v_lama - 'sumber') = v_baru then
        -- (review R2) anggota space privat ikut disinkron; berubah → dihitung updated
        v_anggota := false;
        if p_jenis = 'spaces' then
          v_x := public.set_space_anggota_impor(v_id, coalesce(r -> 'members', r -> 'anggota'));
          v_anggota := coalesce((v_x ->> 'ditambah')::int + (v_x ->> 'dibuang')::int > 0, false);
        end if;
        if p_jenis = 'spaces' then update public.spaces set synced_at = now() where id = v_id;
        elsif p_jenis = 'folders' then update public.folders set synced_at = now() where id = v_id;
        else update public.lists set synced_at = now() where id = v_id;
        end if;
        if v_anggota then n_upd := n_upd + 1; else n_sama := n_sama + 1; end if;
      else
        if p_jenis = 'spaces' then
          update public.spaces set name = v_baru ->> 'name', private = (v_baru ->> 'private')::boolean,
                 archived = (v_baru ->> 'archived')::boolean, orderindex = (v_baru ->> 'orderindex')::integer,
                 color = v_baru ->> 'color', synced_at = now()
           where id = v_id;
          perform public.set_space_anggota_impor(v_id, coalesce(r -> 'members', r -> 'anggota'));
        elsif p_jenis = 'folders' then
          update public.folders set space_id = v_space, name = v_baru ->> 'name', hidden = (v_baru ->> 'hidden')::boolean,
                 archived = (v_baru ->> 'archived')::boolean, orderindex = (v_baru ->> 'orderindex')::integer, synced_at = now()
           where id = v_id;
        else
          update public.lists set space_id = v_space, folder_id = v_folder, name = v_baru ->> 'name',
                 content = v_baru ->> 'content', archived = (v_baru ->> 'archived')::boolean,
                 orderindex = (v_baru ->> 'orderindex')::integer,
                 tidak_ditagih = coalesce(public.bool_dari(r -> 'tidak_ditagih'), tidak_ditagih), synced_at = now()
           where id = v_id;
        end if;
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', r ->> 'id', 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'gagal', v_gagal);
end;
$$;

-- Status per list. Baris {list_id, status, type, orderindex, color, clickup_status_id|id} atau {list_id, statuses:[...]}.
-- Himpunan per list: status yang tidak dikirim dihapus bila tidak dipakai tugas (dipakai → "dipertahankan").
-- Ganti nama dideteksi lewat clickup_status_id (FK ON UPDATE CASCADE ikut mengganti tasks.status, tanpa activity).
create or replace function public.muat_list_statuses(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_list text; v_status text; v_type text; v_ord int; v_col text; v_cid text; v_lama record;
  v_rows jsonb := '[]'::jsonb; v_lists text[] := '{}'::text[];
  n_ins int := 0; n_upd int := 0; n_sama int := 0; n_hapus int := 0;
  v_tahan jsonb := '[]'::jsonb; v_gagal jsonb := '[]'::jsonb; v_msg text; d record;
begin
  -- ratakan {list_id, statuses:[...]}
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    if jsonb_typeof(r -> 'statuses') = 'array' then
      v_rows := v_rows || (select coalesce(jsonb_agg(s || jsonb_build_object('list_id', r ->> 'list_id')), '[]')
                             from jsonb_array_elements(r -> 'statuses') x(s));
    else
      v_rows := v_rows || jsonb_build_array(r);
    end if;
  end loop;

  for r in select e from jsonb_array_elements(v_rows) as a(e) loop
    begin
      v_list := r ->> 'list_id';
      v_status := r ->> 'status';
      v_type := r ->> 'type';
      v_ord := coalesce(nullif(r ->> 'orderindex', '')::numeric::integer, 0);
      v_col := r ->> 'color';
      v_cid := coalesce(r ->> 'clickup_status_id', r ->> 'id');
      if v_list is null or nullif(btrim(v_status), '') is null then
        perform public.lempar('PT400', 'list_id dan status wajib', 'INPUT_001');
      end if;
      -- (review R1) hanya list ClickUp; status list app diatur admin (web_admin_status_simpan)
      if not exists (select 1 from public.lists l where l.id = v_list) then
        perform public.lempar('PT404', format('List %s belum diimpor', v_list), 'ITEM_013');
      end if;
      if exists (select 1 from public.lists l where l.id = v_list and l.sumber <> 'clickup') then
        perform public.lempar('PT409', format('List %s buatan app; status tidak boleh diubah impor', v_list), 'KONFLIK_001');
      end if;
      if not (v_list = any (v_lists)) then
        v_lists := v_lists || v_list;
      end if;
      -- ganti nama (id status ClickUp sama, nama beda)
      if v_cid is not null then
        update public.list_statuses s set status = v_status
         where s.list_id = v_list and s.clickup_status_id = v_cid and s.status <> v_status
           and not exists (select 1 from public.list_statuses z where z.list_id = v_list and z.status = v_status);
      end if;
      select s.type, s.orderindex, s.color, s.clickup_status_id into v_lama
        from public.list_statuses s where s.list_id = v_list and s.status = v_status;
      if not found then
        insert into public.list_statuses (list_id, status, type, orderindex, color, clickup_status_id)
        values (v_list, v_status, v_type, v_ord, v_col, v_cid);
        n_ins := n_ins + 1;
      elsif (v_lama.type, v_lama.orderindex, v_lama.color, v_lama.clickup_status_id)
            is not distinct from (v_type, v_ord, v_col, v_cid) then
        n_sama := n_sama + 1;
      else
        update public.list_statuses s set type = v_type, orderindex = v_ord, color = v_col, clickup_status_id = v_cid
         where s.list_id = v_list and s.status = v_status;
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', coalesce(r ->> 'list_id', '') || '/' || coalesce(r ->> 'status', ''), 'err', v_msg));
    end;
  end loop;

  -- status yang tidak ada lagi di ClickUp
  for d in
    select s.list_id, s.status,
           exists (select 1 from public.tasks t where t.list_id = s.list_id and t.status = s.status) as dipakai
      from public.list_statuses s
     where s.list_id = any (v_lists)
       and not exists (select 1 from jsonb_array_elements(v_rows) e
                        where e.value ->> 'list_id' = s.list_id and e.value ->> 'status' = s.status)
  loop
    if d.dipakai then
      v_tahan := v_tahan || jsonb_build_array(jsonb_build_object('list_id', d.list_id, 'status', d.status));
    else
      delete from public.list_statuses where list_id = d.list_id and status = d.status;
      n_hapus := n_hapus + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'dihapus', n_hapus,
                            'dipertahankan', v_tahan, 'gagal', v_gagal);
end;
$$;

-- Tugas. Induk diproses dulu (urutan kedalaman di batch). Induk yang belum ada di DB → baris DITUNDA
-- (tidak ditulis, dikembalikan di "tertunda"; kirim ulang setelah induknya masuk) supaya tidak ada activity
-- 'induk' karangan. Hash = sha256 baris ternormalisasi (termasuk assignees); sama → unchanged (synced_at saja).
create or replace function public.muat_tasks(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v jsonb; o public.tasks; v_hash text; v_pulih boolean; v_ass bigint[]; v_sumber text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0;
  v_tunda jsonb := '[]'::jsonb; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in
    with recursive b as (
      select e.value as r, e.value ->> 'id' as id,
             nullif(coalesce(e.value ->> 'parent_id', e.value ->> 'parent'), '') as par, e.ord
        from jsonb_array_elements(p_rows) with ordinality as e(value, ord)
    ), d as (
      select b.id, 0 as dalam from b
       where b.par is null or not exists (select 1 from b b2 where b2.id = b.par)
      union all
      select b.id, d.dalam + 1 from b join d on b.par = d.id where d.dalam < 50
    )
    select b.r from b
      left join (select d.id, max(d.dalam) as dalam from d group by d.id) dd on dd.id = b.id
     order by coalesce(dd.dalam, 999), b.ord
  loop
    begin
      v := public.norm_impor_tugas(r);
      if nullif(v ->> 'id', '') is null then
        perform public.lempar('PT400', 'id tugas wajib', 'INPUT_001');
      end if;
      if v ->> 'parent_id' is not null
         and not exists (select 1 from public.tasks where id = v ->> 'parent_id') then
        v_tunda := v_tunda || jsonb_build_array(jsonb_build_object('id', v ->> 'id', 'parent_id', v ->> 'parent_id'));
        continue;
      end if;
      select l.sumber into v_sumber from public.lists l where l.id = v ->> 'list_id';
      if not found then
        perform public.lempar('PT404', format('List %s belum diimpor', v ->> 'list_id'), 'ITEM_013');
      end if;
      -- (review R1) kartu ClickUp tidak boleh masuk list buatan app / di bawah induk buatan app
      if v_sumber <> 'clickup' then
        perform public.lempar('PT409', format('List %s buatan app; kartu ClickUp tidak boleh masuk', v ->> 'list_id'),
                              'KONFLIK_001');
      end if;
      if v ->> 'parent_id' is not null
         and exists (select 1 from public.tasks p where p.id = v ->> 'parent_id' and p.sumber <> 'clickup') then
        perform public.lempar('PT409', format('Induk %s buatan app; kartu ClickUp tidak boleh jadi sub-tugasnya',
                                              v ->> 'parent_id'), 'KONFLIK_001');
      end if;
      v_hash := public.sha256_hex(v::text);
      v_ass := case when v -> 'assignees' is not null then public.ids_dari(v -> 'assignees') end;
      perform public.anggota_impor_wajib(v_ass);

      select * into o from public.tasks where id = v ->> 'id';
      if not found then
        insert into public.tasks (id, clickup_id, list_id, parent_id, name, markdown, description_plain, desc_unreadable,
                                  status, priority, due_at, due_has_time, start_at, start_has_time, creator_id,
                                  created_at, updated_at, closed_at, done_at, archived, orderindex, extra, clickup_url,
                                  sumber, synced_at, clickup_hash)
        values (v ->> 'id', v ->> 'id', v ->> 'list_id', v ->> 'parent_id', v ->> 'name', v ->> 'markdown',
                v ->> 'description_plain', (v ->> 'desc_unreadable')::boolean, v ->> 'status',
                (v ->> 'priority')::smallint, public.ms_ke_ts((v ->> 'due_at')::bigint), (v ->> 'due_has_time')::boolean,
                public.ms_ke_ts((v ->> 'start_at')::bigint), (v ->> 'start_has_time')::boolean,
                (v ->> 'creator_id')::bigint, public.ms_ke_ts((v ->> 'created_at')::bigint),
                public.ms_ke_ts((v ->> 'updated_at')::bigint), public.ms_ke_ts((v ->> 'closed_at')::bigint),
                public.ms_ke_ts((v ->> 'done_at')::bigint), (v ->> 'archived')::boolean,
                (v ->> 'orderindex')::numeric, v -> 'extra', v ->> 'clickup_url', 'clickup', now(), v_hash);
        if v_ass is not null then
          insert into public.task_assignees (task_id, member_id)
          select v ->> 'id', x from unnest(v_ass) u(x) on conflict do nothing;
        end if;
        n_ins := n_ins + 1;
      else
        if o.sumber <> 'clickup' then
          perform public.lempar('PT409', format('ID %s bentrok dengan tugas buatan app', o.id), 'KONFLIK_001');
        end if;
        v_pulih := o.deleted_at is not null and o.deleted_by is null;     -- hilang di ClickUp lalu muncul lagi
        if o.clickup_hash is not distinct from v_hash and not v_pulih then
          update public.tasks set synced_at = now() where id = o.id;
          n_sama := n_sama + 1;
        else
          update public.tasks set
            list_id = v ->> 'list_id', parent_id = v ->> 'parent_id', name = v ->> 'name', markdown = v ->> 'markdown',
            description_plain = v ->> 'description_plain', desc_unreadable = (v ->> 'desc_unreadable')::boolean,
            status = coalesce(v ->> 'status', status), priority = (v ->> 'priority')::smallint,
            due_at = public.ms_ke_ts((v ->> 'due_at')::bigint), due_has_time = (v ->> 'due_has_time')::boolean,
            start_at = public.ms_ke_ts((v ->> 'start_at')::bigint), start_has_time = (v ->> 'start_has_time')::boolean,
            creator_id = coalesce((v ->> 'creator_id')::bigint, creator_id),
            created_at = coalesce(public.ms_ke_ts((v ->> 'created_at')::bigint), created_at),
            updated_at = coalesce(public.ms_ke_ts((v ->> 'updated_at')::bigint), updated_at),
            closed_at = public.ms_ke_ts((v ->> 'closed_at')::bigint), done_at = public.ms_ke_ts((v ->> 'done_at')::bigint),
            archived = (v ->> 'archived')::boolean, orderindex = (v ->> 'orderindex')::numeric,
            extra = v -> 'extra', clickup_url = v ->> 'clickup_url',
            deleted_at = case when v_pulih then null else deleted_at end,
            synced_at = now(), clickup_hash = v_hash
          where id = o.id;
          if v_ass is not null then
            delete from public.task_assignees ta where ta.task_id = o.id and not (ta.member_id = any (v_ass));
            insert into public.task_assignees (task_id, member_id)
            select o.id, x from unnest(v_ass) u(x) on conflict do nothing;
          end if;
          n_upd := n_upd + 1;
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', r ->> 'id', 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'tertunda', v_tunda, 'gagal', v_gagal);
end;
$$;

-- Assignee per tugas (himpunan penuh): {task_id, member_ids:[..]} atau {task_id, member_id} (dikelompokkan).
create or replace function public.muat_task_assignees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record; v_ids bigint[]; v_sumber text;
  n_ins int := 0; n_sama int := 0; n_hapus int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text; n int;
begin
  for g in
    select e.value ->> 'task_id' as task_id,
           jsonb_agg(coalesce(e.value -> 'member_ids', e.value -> 'assignees', jsonb_build_array(e.value -> 'member_id'))) as isi
      from jsonb_array_elements(p_rows) e
     group by e.value ->> 'task_id'
  loop
    begin
      select coalesce(array_agg(distinct x), '{}') into v_ids
        from jsonb_array_elements(g.isi) a(v), unnest(public.ids_dari(a.v)) x;
      select t.sumber into v_sumber from public.tasks t where t.id = g.task_id;
      if not found then
        perform public.lempar('PT404', format('Tugas %s belum diimpor', g.task_id), 'ITEM_013');
      end if;
      -- (review R1) assignee tugas buatan app hanya lewat app (anggota_wajib); impor hanya kartu ClickUp
      if v_sumber <> 'clickup' then
        perform public.lempar('PT409', format('Tugas %s buatan app; assignee tidak boleh diubah impor', g.task_id),
                              'KONFLIK_001');
      end if;
      perform public.anggota_impor_wajib(v_ids);
      delete from public.task_assignees ta where ta.task_id = g.task_id and not (ta.member_id = any (v_ids));
      get diagnostics n = row_count;
      n_hapus := n_hapus + n;
      select count(*) into n from public.task_assignees ta where ta.task_id = g.task_id;
      n_sama := n_sama + n;
      insert into public.task_assignees (task_id, member_id)
      select g.task_id, x from unnest(v_ids) u(x) on conflict do nothing;
      get diagnostics n = row_count;
      n_ins := n_ins + n;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', g.task_id, 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', 0, 'unchanged', n_sama, 'dihapus', n_hapus, 'gagal', v_gagal);
end;
$$;

-- Mention per komentar (himpunan penuh).
create or replace function public.set_mentions_impor(p_comment text, p_ids bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- (review R1) mention komentar buatan app hanya lewat app
  if not exists (select 1 from public.comments c where c.id = p_comment and c.sumber = 'clickup') then
    perform public.lempar('PT409', format('Komentar %s buatan app; mention tidak boleh diubah impor', p_comment),
                          'KONFLIK_001');
  end if;
  delete from public.comment_mentions cm where cm.comment_id = p_comment and not (cm.member_id = any (p_ids));
  insert into public.comment_mentions (comment_id, member_id)
  select p_comment, x from unnest(p_ids) u(x)
   where exists (select 1 from public.members m where m.id = u.x)
  on conflict do nothing;
end;
$$;

create or replace function public.muat_comment_mentions(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record; v_ids bigint[]; v_gagal jsonb := '[]'::jsonb; v_msg text; n_set int := 0;
begin
  for g in
    select e.value ->> 'comment_id' as comment_id,
           jsonb_agg(coalesce(e.value -> 'member_ids', jsonb_build_array(e.value -> 'member_id'))) as isi
      from jsonb_array_elements(p_rows) e
     group by e.value ->> 'comment_id'
  loop
    begin
      select coalesce(array_agg(distinct x), '{}') into v_ids
        from jsonb_array_elements(g.isi) a(v), unnest(public.ids_dari(a.v)) x;
      if not exists (select 1 from public.comments where id = g.comment_id) then
        perform public.lempar('PT404', format('Komentar %s belum diimpor', g.comment_id), 'ITEM_013');
      end if;
      perform public.set_mentions_impor(g.comment_id, v_ids);
      n_set := n_set + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', g.comment_id, 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', 0, 'updated', n_set, 'unchanged', 0, 'gagal', v_gagal);
end;
$$;

-- Komentar & balasan. Top-level dulu; balasan yang induknya belum ada → tertunda. Mention diturunkan dari
-- parts {type:"tag", user:{id}} di body_json/comment (anggota yang ada saja).
create or replace function public.muat_comments(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v jsonb; o public.comments; v_hash text; v_pulih boolean; v_tag bigint[]; v_sumber text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0;
  v_tunda jsonb := '[]'::jsonb; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in
    select e.value from jsonb_array_elements(p_rows) with ordinality as e(value, ord)
     order by (nullif(e.value ->> 'parent_id', '') is not null), e.ord
  loop
    begin
      v := public.norm_impor_komentar(r);
      if nullif(v ->> 'id', '') is null or nullif(v ->> 'task_id', '') is null then
        perform public.lempar('PT400', 'id dan task_id komentar wajib', 'INPUT_001');
      end if;
      if v ->> 'parent_id' is not null and not exists (select 1 from public.comments where id = v ->> 'parent_id') then
        v_tunda := v_tunda || jsonb_build_array(jsonb_build_object('id', v ->> 'id', 'parent_id', v ->> 'parent_id'));
        continue;
      end if;
      select t.sumber into v_sumber from public.tasks t where t.id = v ->> 'task_id';
      if not found then
        perform public.lempar('PT404', format('Tugas %s belum diimpor', v ->> 'task_id'), 'ITEM_013');
      end if;
      -- (review R1) komentar ClickUp hanya di kartu ClickUp, dan balasan hanya ke komentar ClickUp
      if v_sumber <> 'clickup' then
        perform public.lempar('PT409', format('Tugas %s buatan app; komentar ClickUp tidak boleh masuk', v ->> 'task_id'),
                              'KONFLIK_001');
      end if;
      if v ->> 'parent_id' is not null
         and exists (select 1 from public.comments p where p.id = v ->> 'parent_id' and p.sumber <> 'clickup') then
        perform public.lempar('PT409', format('Komentar induk %s buatan app', v ->> 'parent_id'), 'KONFLIK_001');
      end if;
      v_hash := public.sha256_hex(v::text);
      select * into o from public.comments where id = v ->> 'id';
      if not found then
        insert into public.comments (id, clickup_id, task_id, parent_id, author_id, text, body_json, created_at,
                                     sumber, synced_at, clickup_hash)
        values (v ->> 'id', v ->> 'id', v ->> 'task_id', v ->> 'parent_id', (v ->> 'author_id')::bigint, v ->> 'text',
                v -> 'body_json', coalesce(public.ms_ke_ts((v ->> 'created_at')::bigint), now()),
                'clickup', now(), v_hash);
        n_ins := n_ins + 1;
      else
        if o.sumber <> 'clickup' then
          perform public.lempar('PT409', format('ID %s bentrok dengan komentar buatan app', o.id), 'KONFLIK_001');
        end if;
        v_pulih := o.deleted_at is not null and o.deleted_by is null;
        if o.clickup_hash is not distinct from v_hash and not v_pulih then
          update public.comments set synced_at = now() where id = o.id;
          n_sama := n_sama + 1;
          continue;
        end if;
        update public.comments set
          author_id = (v ->> 'author_id')::bigint, text = v ->> 'text',
          body_json = v -> 'body_json', created_at = coalesce(public.ms_ke_ts((v ->> 'created_at')::bigint), created_at),
          edited_at = case when text is distinct from v ->> 'text' then now() else edited_at end,
          deleted_at = case when v_pulih then null else deleted_at end,
          synced_at = now(), clickup_hash = v_hash
        where id = o.id;
        n_upd := n_upd + 1;
      end if;
      if jsonb_typeof(v -> 'body_json') = 'array' then
        select coalesce(array_agg(distinct (p -> 'user' ->> 'id')::bigint), '{}') into v_tag
          from jsonb_array_elements(v -> 'body_json') p
         where p ->> 'type' = 'tag' and coalesce(p -> 'user' ->> 'id', '') ~ '^[0-9]{1,18}$';
        perform public.set_mentions_impor(v ->> 'id', v_tag);
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', r ->> 'id', 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'tertunda', v_tunda, 'gagal', v_gagal);
end;
$$;

-- Lampiran: kolom tabel ATAU objek lampiran ClickUp (parent_id = task, url, date, user{id}) + task_id/comment_id.
-- storage_path/status_salin tidak dikirim → nilai lama dipertahankan.
create or replace function public.muat_attachments(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; o public.attachments; v_task text; v_path text; v_status text; v_baru jsonb; v_lama jsonb; v_sumber text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      if nullif(r ->> 'id', '') is null then
        perform public.lempar('PT400', 'id lampiran wajib', 'INPUT_001');
      end if;
      select * into o from public.attachments where id = r ->> 'id';
      if found and o.sumber <> 'clickup' then
        perform public.lempar('PT409', format('ID %s bentrok dengan lampiran buatan app', o.id), 'KONFLIK_001');
      end if;
      v_task := coalesce(r ->> 'task_id', r ->> 'parent_id');
      -- (review R1) lampiran ClickUp hanya di kartu/komentar ClickUp
      select t.sumber into v_sumber from public.tasks t where t.id = v_task;
      if not found then
        perform public.lempar('PT404', format('Tugas %s belum diimpor', coalesce(v_task, '(kosong)')), 'ITEM_013');
      end if;
      if v_sumber <> 'clickup' then
        perform public.lempar('PT409', format('Tugas %s buatan app; lampiran ClickUp tidak boleh masuk', v_task),
                              'KONFLIK_001');
      end if;
      if nullif(r ->> 'comment_id', '') is not null
         and exists (select 1 from public.comments c where c.id = r ->> 'comment_id' and c.sumber <> 'clickup') then
        perform public.lempar('PT409', format('Komentar %s buatan app; lampiran ClickUp tidak boleh masuk', r ->> 'comment_id'),
                              'KONFLIK_001');
      end if;
      v_path := case when r ? 'storage_path' then nullif(r ->> 'storage_path', '') else o.storage_path end;
      v_status := coalesce(case when r ? 'status_salin' then r ->> 'status_salin' end, o.status_salin,
                           case when v_path is not null then 'ok' else 'tautan_saja' end);
      v_baru := jsonb_build_object(
        'task_id', v_task, 'comment_id', nullif(r ->> 'comment_id', ''), 'title', coalesce(r ->> 'title', ''),
        'extension', r ->> 'extension', 'mimetype', r ->> 'mimetype', 'size', nullif(r ->> 'size', '')::numeric::bigint,
        'storage_path', v_path, 'clickup_url', coalesce(r ->> 'clickup_url', r ->> 'url'), 'status_salin', v_status,
        'uploaded_by', coalesce(r ->> 'uploaded_by', r -> 'user' ->> 'id')::bigint,
        'created_at', public.ms(public.ts_dari(coalesce(r -> 'created_at', r -> 'date'))));
      if o.id is null then
        insert into public.attachments (id, clickup_id, task_id, comment_id, title, extension, mimetype, size, storage_path,
                                        clickup_url, status_salin, uploaded_by, created_at, sumber, synced_at)
        values (r ->> 'id', r ->> 'id', v_task, v_baru ->> 'comment_id', v_baru ->> 'title', v_baru ->> 'extension',
                v_baru ->> 'mimetype', (v_baru ->> 'size')::bigint, v_path, v_baru ->> 'clickup_url', v_status,
                (v_baru ->> 'uploaded_by')::bigint, coalesce(public.ms_ke_ts((v_baru ->> 'created_at')::bigint), now()),
                'clickup', now());
        n_ins := n_ins + 1;
      else
        v_lama := jsonb_build_object(
          'task_id', o.task_id, 'comment_id', o.comment_id, 'title', o.title, 'extension', o.extension,
          'mimetype', o.mimetype, 'size', o.size, 'storage_path', o.storage_path, 'clickup_url', o.clickup_url,
          'status_salin', o.status_salin, 'uploaded_by', o.uploaded_by,
          'created_at', coalesce(v_baru ->> 'created_at', public.ms(o.created_at)));
        if v_lama = v_baru and not (o.deleted_at is not null and o.deleted_by is null) then
          update public.attachments set synced_at = now() where id = o.id;
          n_sama := n_sama + 1;
        else
          update public.attachments set
            comment_id = v_baru ->> 'comment_id', title = v_baru ->> 'title', extension = v_baru ->> 'extension',
            mimetype = v_baru ->> 'mimetype', size = (v_baru ->> 'size')::bigint, storage_path = v_path,
            clickup_url = v_baru ->> 'clickup_url', status_salin = v_status, uploaded_by = (v_baru ->> 'uploaded_by')::bigint,
            created_at = coalesce(public.ms_ke_ts((v_baru ->> 'created_at')::bigint), created_at),
            deleted_at = case when deleted_by is null then null else deleted_at end,
            synced_at = now()
          where id = o.id;
          n_upd := n_upd + 1;
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', r ->> 'id', 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'gagal', v_gagal);
end;
$$;

create or replace function public.muat_sync_raw(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_hash text; v_lama text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      if nullif(r ->> 'entity', '') is null or nullif(r ->> 'id', '') is null then
        perform public.lempar('PT400', 'entity dan id wajib', 'INPUT_001');
      end if;
      v_hash := coalesce(r ->> 'hash', public.sha256_hex((r -> 'payload')::text));
      select s.hash into v_lama from public.sync_raw s where s.entity = r ->> 'entity' and s.id = r ->> 'id';
      if not found then
        insert into public.sync_raw (entity, id, fetched_at, hash, payload)
        values (r ->> 'entity', r ->> 'id', coalesce(public.ts_dari(r -> 'fetched_at'), now()), v_hash, r -> 'payload');
        n_ins := n_ins + 1;
      elsif v_lama is not distinct from v_hash then
        update public.sync_raw set fetched_at = coalesce(public.ts_dari(r -> 'fetched_at'), now())
         where entity = r ->> 'entity' and id = r ->> 'id';
        n_sama := n_sama + 1;
      else
        update public.sync_raw set fetched_at = coalesce(public.ts_dari(r -> 'fetched_at'), now()), hash = v_hash,
               payload = r -> 'payload'
         where entity = r ->> 'entity' and id = r ->> 'id';
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', coalesce(r ->> 'entity', '') || '/' || coalesce(r ->> 'id', ''), 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'gagal', v_gagal);
end;
$$;

create or replace function public.muat_workspace(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb; v_lama text;
  n_ins int := 0; n_upd int := 0; n_sama int := 0; v_gagal jsonb := '[]'::jsonb; v_msg text;
begin
  for r in select e from jsonb_array_elements(p_rows) as a(e) loop
    begin
      if nullif(r ->> 'id', '') is null or nullif(btrim(r ->> 'name'), '') is null then
        perform public.lempar('PT400', 'id dan name workspace wajib', 'INPUT_001');
      end if;
      select w.name into v_lama from public.workspace w where w.id = r ->> 'id';
      if not found then
        insert into public.workspace (id, name) values (r ->> 'id', r ->> 'name');
        n_ins := n_ins + 1;
      elsif v_lama = r ->> 'name' then
        n_sama := n_sama + 1;
      else
        update public.workspace set name = r ->> 'name' where id = r ->> 'id';
        n_upd := n_upd + 1;
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('id', r ->> 'id', 'err', v_msg));
    end;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'unchanged', n_sama, 'gagal', v_gagal);
end;
$$;

-- ================================================================ impor_* publik (service_role)
-- p_mode 'impor' (muat awal: assignee bukan kejadian) | 'sinkron' (perubahan dicatat lengkap=false, aktor null).
-- p_at_awal = started_at sinkron sebelumnya (app.at_awal); null → synced_at lama baris itu.
-- Urutan batch: workspace → members → spaces → folders → lists → space_anggota (P2) → list_statuses → tasks →
-- task_assignees → comments → comment_mentions → attachments → sync_raw. Hasil {jenis, mode, inserted, updated,
-- unchanged, gagal[], (+ tertunda[] untuk tasks/comments, dihapus/dipertahankan untuk list_statuses/task_assignees,
-- ditambah/dibuang/dilewati untuk space_anggota)}.
create or replace function public.impor_batch(p_aktor bigint, p_jenis text, p_rows jsonb, p_mode text default 'impor',
                                              p_at_awal timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(p_mode, '') not in ('impor', 'sinkron') then
    perform public.lempar('PT400', 'p_mode harus impor atau sinkron', 'INPUT_001');
  end if;
  perform public.mulai_api(p_aktor, p_mode, 'impor');
  perform set_config('app.at_awal', coalesce(p_at_awal::text, ''), true);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    perform public.lempar('PT400', 'p_rows harus array JSON', 'INPUT_001');
  end if;
  v := case p_jenis
         when 'workspace'        then public.muat_workspace(p_rows)
         when 'members'          then public.muat_members(p_rows)
         when 'spaces'           then public.muat_struktur('spaces', p_rows)
         when 'space_anggota'    then public.muat_space_anggota(p_rows)          -- (perbaikan P2)
         when 'folders'          then public.muat_struktur('folders', p_rows)
         when 'lists'            then public.muat_struktur('lists', p_rows)
         when 'list_statuses'    then public.muat_list_statuses(p_rows)
         when 'tasks'            then public.muat_tasks(p_rows)
         when 'task_assignees'   then public.muat_task_assignees(p_rows)
         when 'comments'         then public.muat_comments(p_rows)
         when 'comment_mentions' then public.muat_comment_mentions(p_rows)
         when 'attachments'      then public.muat_attachments(p_rows)
         when 'sync_raw'         then public.muat_sync_raw(p_rows)
       end;
  if v is null then
    perform public.lempar('PT400', format('Jenis impor tidak dikenal: %s', p_jenis), 'INPUT_001');
  end if;
  return jsonb_build_object('jenis', p_jenis, 'mode', p_mode) || v;
end;
$$;

-- Tandai hilang: baris sumber='clickup' (tasks|comments|attachments) yang tidak ada di p_ids_ada → deleted_at
-- (activity hilang_di_clickup / komentar_hapus / lampiran_hapus oleh trigger). p_lingkup opsional:
-- {"list_ids":[...]} / {"task_ids":[...]} / {"space_ids":[...]} membatasi cakupan (wajib saat sinkron sebagian).
create or replace function public.impor_tandai_hilang(p_aktor bigint, p_jenis text, p_ids_ada text[],
                                                      p_mode text default 'sinkron', p_lingkup jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list  text[];
  v_task  text[];
  v_space text[];
  v_ids   text[];
begin
  if coalesce(p_mode, '') not in ('impor', 'sinkron') then
    perform public.lempar('PT400', 'p_mode harus impor atau sinkron', 'INPUT_001');
  end if;
  perform public.mulai_api(p_aktor, p_mode, 'impor');
  if coalesce(p_jenis, '') not in ('tasks', 'comments', 'attachments') then
    perform public.lempar('PT400', format('Jenis tandai_hilang tidak dikenal: %s (tasks|comments|attachments)', p_jenis),
                          'INPUT_001');
  end if;
  if p_ids_ada is null then
    perform public.lempar('PT400', 'p_ids_ada wajib (array, boleh kosong bila p_lingkup diisi)', 'INPUT_001');
  end if;
  if p_lingkup is not null and jsonb_typeof(p_lingkup) <> 'object' then
    perform public.lempar('PT400', 'p_lingkup harus objek {list_ids|task_ids|space_ids}', 'INPUT_001');
  end if;
  select array_agg(x) into v_list from jsonb_array_elements_text(
    case when jsonb_typeof(p_lingkup -> 'list_ids') = 'array' then p_lingkup -> 'list_ids' else '[]'::jsonb end) x;
  select array_agg(x) into v_task from jsonb_array_elements_text(
    case when jsonb_typeof(p_lingkup -> 'task_ids') = 'array' then p_lingkup -> 'task_ids' else '[]'::jsonb end) x;
  select array_agg(x) into v_space from jsonb_array_elements_text(
    case when jsonb_typeof(p_lingkup -> 'space_ids') = 'array' then p_lingkup -> 'space_ids' else '[]'::jsonb end) x;
  if p_lingkup is not null and v_list is null and v_task is null and v_space is null then
    perform public.lempar('PT400', 'p_lingkup tanpa list_ids/task_ids/space_ids yang berisi', 'INPUT_001');
  end if;
  if cardinality(p_ids_ada) = 0 and v_list is null and v_task is null and v_space is null then
    perform public.lempar('PT400', 'p_ids_ada kosong tanpa p_lingkup ditolak (akan menandai semua data)', 'INPUT_001');
  end if;

  if p_jenis = 'tasks' then
    with u as (
      update public.tasks t set deleted_at = now()
        from public.lists l
       where l.id = t.list_id and t.sumber = 'clickup' and t.deleted_at is null
         and not (t.id = any (p_ids_ada))
         and (v_list is null or t.list_id = any (v_list))
         and (v_task is null or t.id = any (v_task))
         and (v_space is null or l.space_id = any (v_space))
      returning t.id)
    select coalesce(array_agg(u.id order by u.id), '{}') into v_ids from u;
  elsif p_jenis = 'comments' then
    with u as (
      update public.comments c set deleted_at = now()
        from public.tasks t join public.lists l on l.id = t.list_id
       where t.id = c.task_id and c.sumber = 'clickup' and c.deleted_at is null
         and not (c.id = any (p_ids_ada))
         and (v_list is null or t.list_id = any (v_list))
         and (v_task is null or c.task_id = any (v_task))
         and (v_space is null or l.space_id = any (v_space))
      returning c.id)
    select coalesce(array_agg(u.id order by u.id), '{}') into v_ids from u;
  else
    with u as (
      update public.attachments a set deleted_at = now()
        from public.tasks t join public.lists l on l.id = t.list_id
       where t.id = a.task_id and a.sumber = 'clickup' and a.deleted_at is null
         and not (a.id = any (p_ids_ada))
         and (v_list is null or t.list_id = any (v_list))
         and (v_task is null or a.task_id = any (v_task))
         and (v_space is null or l.space_id = any (v_space))
      returning a.id)
    select coalesce(array_agg(u.id order by u.id), '{}') into v_ids from u;
  end if;
  return jsonb_build_object('jenis', p_jenis, 'ditandai', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end;
$$;

-- Catatan run sinkron. at_awal = started_at run selesai sebelumnya (dipakai sebagai p_at_awal impor_batch).
create or replace function public.impor_run_mulai(p_aktor bigint, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sync_runs;
begin
  perform public.mulai_api(p_aktor, 'sinkron', 'impor');
  if coalesce(p_mode, '') not in ('penuh', 'akhir', 'uji') then
    perform public.lempar('PT400', 'mode run harus penuh, akhir, atau uji', 'INPUT_001');
  end if;
  insert into public.sync_runs (mode) values (p_mode) returning * into v;
  return jsonb_build_object('id', v.id, 'mode', v.mode, 'started_at', public.iso_utc(v.started_at),
    'at_awal', (select public.iso_utc(s.started_at) from public.sync_runs s
                 where s.id <> v.id and s.finished_at is not null order by s.started_at desc, s.id desc limit 1));
end;
$$;

create or replace function public.impor_run_selesai(p_aktor bigint, p_id bigint, p_counts jsonb default null,
                                                    p_census jsonb default null, p_diffs jsonb default null,
                                                    p_errors jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sync_runs;
begin
  perform public.mulai_api(p_aktor, 'sinkron', 'impor');
  update public.sync_runs
     set finished_at = now(),
         counts = coalesce(p_counts, counts), census = coalesce(p_census, census),
         diffs = coalesce(p_diffs, diffs), errors = coalesce(p_errors, errors)
   where id = p_id
  returning * into v;
  if v.id is null then
    perform public.lempar('PT404', 'Run sinkron tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('id', v.id, 'mode', v.mode, 'started_at', public.iso_utc(v.started_at),
                            'finished_at', public.iso_utc(v.finished_at), 'counts', v.counts, 'census', v.census,
                            'diffs', v.diffs, 'errors', v.errors);
end;
$$;
