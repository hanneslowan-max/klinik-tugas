-- A2 · 2/6: inti bersama jalur API (api_*) dan web (web_*): tulis tugas/komentar, pindah, cari, tenggat,
-- riwayat, baris ringkas. INTERNAL (tanpa EXECUTE untuk role API). Konteks (app.sumber/app.actor_id) wajib
-- sudah diset pemanggil lewat mulai_api()/mulai_web(). Activity & notifikasi tetap dibuat trigger A1.

-- ---------------------------------------------------------------- tugas: buat
-- Body gaya ClickUp: name, markdown_description|markdown|description, status, priority, due_date(ms|'YYYY-MM-DD'|ISO),
-- due_date_time, start_date, start_date_time, assignees[int], parent|parent_id.
create or replace function public.inti_buat_tugas(p_list text, p_body jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nama    text;
  v_status  text;
  v_due     timestamptz;
  v_due_jam boolean := false;
  v_mulai   timestamptz;
  v_mulai_j boolean := false;
  v_prio    smallint;
  v_ass     bigint[];
  v_parent  text;
  v_p       record;
  v_id      text;
begin
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    perform public.lempar('PT400', 'Body harus objek JSON', 'INPUT_001');
  end if;
  if not public.list_terlihat(p_list) then                       -- (review R2) ada & terlihat aktor
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  if jsonb_typeof(p_body -> 'name') is distinct from 'string' or btrim(p_body ->> 'name') = '' then
    perform public.lempar('PT400', 'Nama tugas wajib diisi', 'INPUT_001');
  end if;
  v_nama := btrim(p_body ->> 'name');

  if nullif(p_body ->> 'status', '') is not null then
    v_status := public.status_cari(p_list, p_body ->> 'status');
  end if;

  v_due := public.ts_dari(p_body -> 'due_date');
  if v_due is not null then
    v_due_jam := coalesce(public.bool_dari(p_body -> 'due_date_time'), false)
                 and coalesce(p_body ->> 'due_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  end if;
  v_mulai := public.ts_dari(p_body -> 'start_date');
  if v_mulai is not null then
    v_mulai_j := coalesce(public.bool_dari(p_body -> 'start_date_time'), false)
                 and coalesce(p_body ->> 'start_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  end if;
  v_prio := public.prioritas_dari(p_body -> 'priority');
  v_ass := public.ids_dari(p_body -> 'assignees');
  perform public.anggota_wajib(v_ass);

  v_parent := nullif(coalesce(p_body ->> 'parent', p_body ->> 'parent_id'), '');
  if v_parent is not null then
    select t.list_id, t.deleted_at into v_p from public.tasks t where t.id = v_parent;
    if not found or v_p.deleted_at is not null or not public.tugas_terlihat(v_parent) then
      perform public.lempar('PT404', 'Tugas induk tidak ditemukan', 'ITEM_013');
    end if;
    if v_p.list_id <> p_list then
      perform public.lempar('PT400', 'Tugas induk harus berada di list yang sama', 'INPUT_001');
    end if;
  end if;

  insert into public.tasks (list_id, parent_id, name, markdown, status, priority, due_at, due_has_time,
                            start_at, start_has_time, orderindex)
  values (p_list, v_parent, v_nama,
          nullif(coalesce(p_body ->> 'markdown_description', p_body ->> 'markdown', p_body ->> 'description'), ''),
          v_status, v_prio, v_due, v_due_jam, v_mulai, v_mulai_j,
          (select coalesce(max(t.orderindex), 0) + 1 from public.tasks t where t.list_id = p_list))
  returning id into v_id;

  insert into public.task_assignees (task_id, member_id)
  select v_id, x from unnest(v_ass) as u(x)
  on conflict do nothing;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- tugas: assignee
create or replace function public.inti_assignee(p_task text, p_add bigint[], p_rem bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.anggota_wajib(p_add);
  delete from public.task_assignees ta
   where ta.task_id = p_task
     and ta.member_id = any (coalesce(p_rem, '{}'))
     and not (ta.member_id = any (coalesce(p_add, '{}')));
  insert into public.task_assignees (task_id, member_id)
  select p_task, x from unnest(coalesce(p_add, '{}')) as u(x)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------- tugas: ubah (hanya kunci yang ada di body)
-- Kunci: name, markdown_description|markdown|description, status, due_date(null=parkir), due_date_time,
-- start_date, start_date_time, priority(null boleh), archived, parent|parent_id(null=lepas),
-- assignees:{add:[],rem:[]} (API) atau assignees:[...] (himpunan penuh, web).
create or replace function public.inti_ubah_tugas(p_task text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t          public.tasks;
  v_md_kunci text;
  v_status   text;
  v_due      timestamptz;
  v_due_jam  boolean;
  v_mulai    timestamptz;
  v_mulai_j  boolean;
  v_parent   text;
  v_p        record;
  v_ass      jsonb;
  v_add      bigint[];
  v_rem      bigint[];
  v_ada_ass  boolean;
begin
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    perform public.lempar('PT400', 'Body harus objek JSON', 'INPUT_001');
  end if;
  select * into t from public.tasks where id = p_task for update;
  if not found or t.deleted_at is not null or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;

  if p_body ? 'name' and (jsonb_typeof(p_body -> 'name') is distinct from 'string' or btrim(p_body ->> 'name') = '') then
    perform public.lempar('PT400', 'Nama tugas tidak boleh kosong', 'INPUT_001');
  end if;
  v_md_kunci := case when p_body ? 'markdown_description' then 'markdown_description'
                     when p_body ? 'markdown' then 'markdown'
                     when p_body ? 'description' then 'description' end;
  if nullif(p_body ->> 'status', '') is not null then
    v_status := public.status_cari(t.list_id, p_body ->> 'status');
  end if;

  v_due := t.due_at;
  v_due_jam := t.due_has_time;
  if p_body ? 'due_date' then
    v_due := public.ts_dari(p_body -> 'due_date');
    v_due_jam := coalesce(public.bool_dari(p_body -> 'due_date_time'), false)
                 and coalesce(p_body ->> 'due_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  elsif p_body ? 'due_date_time' then
    v_due_jam := coalesce(public.bool_dari(p_body -> 'due_date_time'), false);
  end if;
  v_mulai := t.start_at;
  v_mulai_j := t.start_has_time;
  if p_body ? 'start_date' then
    v_mulai := public.ts_dari(p_body -> 'start_date');
    v_mulai_j := coalesce(public.bool_dari(p_body -> 'start_date_time'), false)
                 and coalesce(p_body ->> 'start_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  elsif p_body ? 'start_date_time' then
    v_mulai_j := coalesce(public.bool_dari(p_body -> 'start_date_time'), false);
  end if;

  v_parent := t.parent_id;
  if p_body ? 'parent' or p_body ? 'parent_id' then
    v_parent := nullif(case when p_body ? 'parent' then p_body ->> 'parent' else p_body ->> 'parent_id' end, '');
    if v_parent is not null then
      select x.list_id, x.deleted_at into v_p from public.tasks x where x.id = v_parent;
      if not found or v_p.deleted_at is not null or not public.tugas_terlihat(v_parent) then
        perform public.lempar('PT404', 'Tugas induk tidak ditemukan', 'ITEM_013');
      end if;
      if v_p.list_id <> t.list_id then
        perform public.lempar('PT400', 'Tugas induk harus berada di list yang sama', 'INPUT_001');
      end if;
      if exists (with recursive naik as (
                   select x.id, x.parent_id, 0 as d from public.tasks x where x.id = v_parent
                   union all
                   select x.id, x.parent_id, n.d + 1 from public.tasks x join naik n on x.id = n.parent_id where n.d < 50)
                 select 1 from naik where naik.id = p_task) then
        perform public.lempar('PT400', 'Induk tugas membentuk lingkaran', 'INPUT_001');
      end if;
    end if;
  end if;

  update public.tasks x set
    name            = case when p_body ? 'name' then btrim(p_body ->> 'name') else x.name end,
    markdown        = case when v_md_kunci is not null then nullif(p_body ->> v_md_kunci, '') else x.markdown end,
    description_plain = case when v_md_kunci is not null then null else x.description_plain end,
    desc_unreadable = case when v_md_kunci is not null then false else x.desc_unreadable end,
    status          = coalesce(v_status, x.status),
    due_at          = v_due,
    due_has_time    = v_due_jam,
    start_at        = v_mulai,
    start_has_time  = v_mulai_j,
    priority        = case when p_body ? 'priority' then public.prioritas_dari(p_body -> 'priority') else x.priority end,
    archived        = case when p_body ? 'archived' then coalesce(public.bool_dari(p_body -> 'archived'), false) else x.archived end,
    parent_id       = v_parent
  where x.id = p_task;

  -- assignee
  v_ada_ass := p_body ? 'assignees';
  v_ass := p_body -> 'assignees';
  if v_ada_ass and jsonb_typeof(v_ass) = 'object' then
    v_add := public.ids_dari(v_ass -> 'add');
    v_rem := public.ids_dari(v_ass -> 'rem');
    perform public.inti_assignee(p_task, v_add, v_rem);
  elsif v_ada_ass and jsonb_typeof(v_ass) in ('array', 'null') then
    v_add := public.ids_dari(v_ass);
    select coalesce(array_agg(ta.member_id), '{}') into v_rem
      from public.task_assignees ta where ta.task_id = p_task and not (ta.member_id = any (v_add));
    perform public.inti_assignee(p_task, v_add, v_rem);
  elsif v_ada_ass then
    perform public.lempar('PT400', 'assignees harus {add,rem} atau array', 'INPUT_001');
  end if;
end;
$$;

-- ---------------------------------------------------------------- tugas: pindah list (ikut sub-tugas)
create or replace function public.inti_pindah(p_task text, p_list text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  d record;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found or t.deleted_at is not null or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if not public.list_terlihat(p_list) then
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  if t.list_id = p_list then
    return;
  end if;
  for d in
    with recursive turun as (
      select x.id, x.status, x.status_type, 0 as dalam from public.tasks x where x.id = p_task
      union all
      select x.id, x.status, x.status_type, tu.dalam + 1
        from public.tasks x join turun tu on x.parent_id = tu.id
       where tu.dalam < 50)
    select * from turun order by dalam, id
  loop
    update public.tasks x
       set list_id = p_list,
           status = public.status_petakan(d.status, d.status_type, p_list)
     where x.id = d.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- tugas: hapus lunak (owner)
create or replace function public.inti_hapus(p_task text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  perform public.wajib_owner_aktor();
  update public.tasks set deleted_at = now() where id = p_task;     -- sub-tugas ikut (trigger tasks_sesudah, R3)
end;
$$;

-- ---------------------------------------------------------------- komentar
-- Balasan ke balasan diarahkan ke komentar top-level-nya (thread satu tingkat seperti ClickUp).
create or replace function public.inti_komentar(p_task text, p_parent text, p_teks text,
                                                p_mentions bigint[] default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task  text := p_task;
  v_induk text;
  c       record;
  v_parts jsonb;
  v_ids   bigint[];
  v_id    text;
begin
  if p_parent is not null then
    select x.id, x.task_id, x.parent_id, x.deleted_at into c from public.comments x where x.id = p_parent;
    if not found or c.deleted_at is not null or not public.tugas_terlihat(c.task_id) then
      perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
    end if;
    if v_task is not null and c.task_id <> v_task then
      perform public.lempar('PT400', 'Komentar induk ada di tugas lain', 'INPUT_001');
    end if;
    v_task := c.task_id;
    v_induk := coalesce(c.parent_id, c.id);
  end if;
  if not exists (select 1 from public.tasks where id = v_task and deleted_at is null)
     or not public.tugas_terlihat(v_task) then                   -- (review R2) privasi space
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if btrim(coalesce(p_teks, '')) = '' then
    perform public.lempar('PT400', 'Teks komentar wajib diisi', 'INPUT_001');
  end if;

  select k.parts, k.mentions into v_parts, v_ids from public.komentar_parts(p_teks, p_mentions) k;
  insert into public.comments (task_id, parent_id, text, body_json)
  values (v_task, v_induk, p_teks, v_parts)
  returning id into v_id;
  insert into public.comment_mentions (comment_id, member_id)
  select v_id, x from unnest(v_ids) as u(x)
  on conflict do nothing;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- pencarian
-- Cocok: ID/URL (app.clickup.com/t/<id>, <app>/t/<id>) → kode di awal nama (Y7, FX-PM-…) → nama → isi.
create or replace function public.cari_tugas(p_q text, p_space text, p_include_closed boolean, p_limit integer)
returns table (task_id text, peringkat integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q     text := btrim(coalesce(p_q, ''));
  v_id    text;
  v_like  text;
  v_kode  text;
  v_tutup text[] := public.tugas_tertutup();            -- (review R2) privasi space
begin
  if v_q = '' then
    perform public.lempar('PT400', 'Kata kunci pencarian kosong', 'INPUT_001');
  end if;
  v_id := coalesce(substring(v_q from '/t/(?:[0-9]+/)?([0-9A-Za-z_-]+)'), v_q);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_kode := '^' || regexp_replace(v_q, '([.^$*+?(){}|\[\]\\-])', '\\\1', 'g') || '([^[:alnum:]]|$)';
  return query
    select x.id, x.p
      from (select t.id, t.updated_at,
                   case when t.id = v_id or t.clickup_id = v_id or t.id = v_q then 1
                        when t.name ~* v_kode then 2
                        when t.name ilike v_like then 3
                        else 4 end as p
              from public.tasks t
              join public.lists l on l.id = t.list_id
             where t.deleted_at is null
               and not (t.id = any (v_tutup))
               and (p_space is null or l.space_id = p_space)
               and (coalesce(p_include_closed, false) or t.status_type not in ('closed', 'done')
                    or t.id = v_id or t.clickup_id = v_id)                   -- ID/URL persis selalu tampil
               and (t.id = v_id or t.clickup_id = v_id or t.id = v_q
                    or t.name ilike v_like
                    or coalesce(t.markdown, '') ilike v_like
                    or coalesce(t.description_plain, '') ilike v_like
                    or t.cari @@ plainto_tsquery('simple'::regconfig, v_q))) x
     order by x.p, x.updated_at desc, x.id
     limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

-- ---------------------------------------------------------------- riwayat (activity) satu tugas
create or replace function public.riwayat_tugas(p_task text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'at', public.iso_utc(a.at), 'at_awal', public.iso_utc(a.at_awal), 'jenis', a.jenis,
           'dari', a.dari, 'ke', a.ke,
           'aktor', case when a.actor_id is null then null
                         else jsonb_build_object('id', a.actor_id, 'username', m.username) end,
           'aktor_assignee', a.aktor_assignee, 'sumber', a.sumber, 'lengkap', a.lengkap,
           'catatan', a.catatan, 'snapshot', a.snapshot)
           order by a.at, a.id), '[]'::jsonb)
    from public.activity a
    left join public.members m on m.id = a.actor_id
   where a.task_id = p_task
$$;

-- ---------------------------------------------------------------- baris ringkas (web & x_search)
create or replace function public.j_baris(p_task text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', t.id, 'name', t.name, 'status', t.status, 'status_type', t.status_type, 'status_color', s.color,
           'selesai', t.status_type in ('closed', 'done'),
           'list', jsonb_build_object('id', l.id, 'name', l.name, 'tidak_ditagih', l.tidak_ditagih),
           'space_id', l.space_id, 'folder_id', l.folder_id, 'parent_id', t.parent_id,
           'assignees', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'username', m.username,
                                  'nama', m.nama, 'initials', m.initials, 'color', m.color)
                                  order by ta.added_at, ta.member_id), '[]'::jsonb)
                           from public.task_assignees ta join public.members m on m.id = ta.member_id
                          where ta.task_id = t.id),
           'due_wib', t.due_wib, 'due_at', public.iso_utc(t.due_at), 'due_has_time', t.due_has_time,
           'start_at', public.iso_utc(t.start_at), 'priority', t.priority,
           'comment_count', t.comment_count, 'last_comment_at', public.iso_utc(t.last_comment_at),
           'created_at', public.iso_utc(t.created_at), 'updated_at', public.iso_utc(t.updated_at),
           'closed_at', public.iso_utc(t.closed_at), 'archived', t.archived,
           'deleted_at', public.iso_utc(t.deleted_at), 'sumber', t.sumber, 'versi', t.versi,
           'orderindex', t.orderindex,
           'menunggu_keputusan', public.menunggu_keputusan(t.name),
           -- (review R5) kategori due pagar B10 (sama dengan web_tugas_saya): null (selesai) | tidak_ditagih |
           -- menunggu_keputusan | tanpa_due | telat | hari_ini | tiga_hk | nanti
           'kategori_due', public.kategori_due(t.status_type in ('closed', 'done'), t.due_wib, t.name, l.tidak_ditagih),
           'url', public.app_url() || '/t/' || t.id)
    from public.tasks t
    join public.lists l on l.id = t.list_id
    left join public.list_statuses s on s.list_id = t.list_id and s.status = t.status
   where t.id = p_task
$$;

-- ---------------------------------------------------------------- TENGGAT B10 + beban B5
-- Cakupan: list di folder cakupan (app_settings.tenggat_folder_ids, [] = semua; p_folder menimpa), list tidak
-- diarsip & bukan tidak_ditagih; tugas belum selesai, tidak diarsip/dihapus, punya due. Nama berisi
-- BERSYARAT/CADANGAN/DITUNDA → menunggu_keputusan (bukan telat). Telat = hari kalender. tiga_hk = due > hari ini
-- dan hari_kerja(hari ini, due) ≤ 3. h1 = hari ini < due ≤ h1_sampai (Jumat → Senin).
create or replace function public.tenggat_hitung(p_tanggal date, p_folder text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hari   date := coalesce(p_tanggal, public.hari_ini_wib());
  v_h1     date;
  v_folder text[];
  v_hasil  jsonb;
  v_tutup  text[] := public.tugas_tertutup();           -- (review R2) privasi space
begin
  v_h1 := case when extract(isodow from v_hari) = 5 then v_hari + 3 else v_hari + 1 end;
  if p_folder is not null then
    v_folder := array[p_folder];
  else
    select coalesce(array_agg(x), '{}') into v_folder
      from jsonb_array_elements_text(coalesce((select s.value from public.app_settings s
                                                 where s.key = 'tenggat_folder_ids'), '[]'::jsonb)) as e(x);
  end if;

  with cakup as (
    select t.id, t.name, t.status, t.due_wib, t.last_comment_at, l.id as list_id, l.name as list_name,
           public.menunggu_keputusan(t.name) as menunggu
      from public.tasks t
      join public.lists l on l.id = t.list_id
     where (cardinality(v_folder) = 0 or l.folder_id = any (v_folder))
       and not l.archived and not l.tidak_ditagih
       and t.deleted_at is null and not t.archived
       and not (t.id = any (v_tutup))
       and t.status_type not in ('closed', 'done')
       and t.due_wib is not null
  ), baris as (
    select c.*, ta.member_id,
           jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'due_wib', c.due_wib,
                              'list', jsonb_build_object('id', c.list_id, 'name', c.list_name),
                              'komentar_terakhir', public.iso_utc(c.last_comment_at),
                              'url', public.app_url() || '/t/' || c.id) as j,
           v_hari - c.due_wib as lewat,
           case when c.due_wib > v_hari then public.hari_kerja(v_hari, c.due_wib) end as sisa
      from cakup c
      left join public.task_assignees ta on ta.task_id = c.id
  ), per as (
    select b.member_id,
           coalesce(jsonb_agg(b.j || jsonb_build_object('lewat_hari', b.lewat) order by b.lewat desc, b.name, b.id)
                    filter (where not b.menunggu and b.due_wib < v_hari), '[]') as telat,
           coalesce(jsonb_agg(b.j order by b.name, b.id)
                    filter (where not b.menunggu and b.due_wib = v_hari), '[]') as hari_ini,
           coalesce(jsonb_agg(b.j || jsonb_build_object('sisa_hk', b.sisa) order by b.due_wib, b.name, b.id)
                    filter (where not b.menunggu and b.due_wib > v_hari and b.sisa <= 3), '[]') as tiga_hk,
           coalesce(jsonb_agg(b.j order by b.due_wib, b.name, b.id)
                    filter (where not b.menunggu and b.due_wib > v_hari and b.due_wib <= v_h1), '[]') as h1,
           coalesce(jsonb_agg(b.j || jsonb_build_object('lewat_hari', case when b.lewat > 0 then b.lewat end)
                              order by b.due_wib, b.name, b.id)
                    filter (where b.menunggu), '[]') as menunggu_keputusan,
           bool_or(b.menunggu or b.due_wib <= v_hari or b.sisa <= 3 or b.due_wib <= v_h1) as ada
      from baris b
     group by b.member_id
  )
  select jsonb_build_object(
    'tanggal', v_hari,
    'h1_sampai', v_h1,
    'folder_ids', to_jsonb(v_folder),
    'ringkas', (select jsonb_build_object(
                  'telat', count(*) filter (where not c.menunggu and c.due_wib < v_hari),
                  'hari_ini', count(*) filter (where not c.menunggu and c.due_wib = v_hari),
                  'tiga_hk', count(*) filter (where not c.menunggu and c.due_wib > v_hari
                                                and public.hari_kerja(v_hari, c.due_wib) <= 3),
                  'h1', count(*) filter (where not c.menunggu and c.due_wib > v_hari and c.due_wib <= v_h1),
                  'menunggu_keputusan', count(*) filter (where c.menunggu))
                  from cakup c),
    'per_anggota', coalesce((select jsonb_agg(jsonb_build_object(
                      'member', case when p.member_id is null then null
                                     else jsonb_build_object('id', m.id, 'username', m.username, 'nama', m.nama) end,
                      'telat', p.telat, 'hari_ini', p.hari_ini, 'tiga_hk', p.tiga_hk, 'h1', p.h1,
                      'menunggu_keputusan', p.menunggu_keputusan)
                      order by (p.member_id is null), m.username)
                   from per p left join public.members m on m.id = p.member_id
                  where p.ada), '[]'::jsonb),
    'beban', coalesce((select jsonb_agg(jsonb_build_object(
                  'member', jsonb_build_object('id', m.id, 'username', m.username), 'due_wib', x.due_wib,
                  'jumlah', x.n) order by x.due_wib, m.username)
                from (select b.member_id, b.due_wib, count(*)::int as n
                        from baris b
                       where b.member_id is not null and b.due_wib >= v_hari
                       group by b.member_id, b.due_wib
                      having count(*) > 7) x
                join public.members m on m.id = x.member_id), '[]'::jsonb))
  into v_hasil;
  return v_hasil;
end;
$$;
