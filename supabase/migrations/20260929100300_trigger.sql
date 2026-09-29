-- A1 · Fondasi 4/7: trigger — turunan (due_wib, status_type, tanggal tutup), updated_at/versi, pencarian,
-- penghitung komentar, activity per field + snapshot, notifikasi, append-only, penjaga mode cermin,
-- status default list baru. Kontrak ARSITEKTUR.md §0, §2, §3.
--
-- Aturan sumber (app.sumber):
--   ui/api/sistem  → nilai turunan dihitung server (now()), activity lengkap=true, aktor = aktor().
--   impor/sinkron  → nilai ClickUp dipertahankan (created_at/updated_at/closed_at/done_at verbatim),
--                    activity lengkap=false, aktor null (kecuali 'dibuat' = creator), at_awal = app.at_awal.
--   Notifikasi hanya untuk ui/api, tidak ke aktor sendiri, tidak ke bot/anggota nonaktif.
--   Penjaga cermin: saat mode='cermin', baris sumber='clickup' (dan anak-anak kartu ClickUp:
--   assignee, komentar, mention, lampiran; serta struktur space/folder/list/status ClickUp) hanya boleh
--   ditulis bila app.sumber in ('impor','sinkron'). Lainnya → PT409 CERMIN_001.

-- ---------------------------------------------------------------- pembantu format
create or replace function public.iso_utc(t timestamptz)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.jejak_tanggal(t timestamptz, ada_jam boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when t is null then null
    else jsonb_build_object('at', public.iso_utc(t), 'wib', public.wib_date(t), 'has_time', coalesce(ada_jam, false))
  end
$$;

create or replace function public.ringkas_tugas(t public.tasks)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'list_id', t.list_id, 'parent_id', t.parent_id,
    'status', t.status, 'type', t.status_type, 'due_wib', t.due_wib, 'priority', t.priority,
    'sumber', t.sumber)
$$;

-- Snapshot saat kartu ditutup (bahan verifikator "complete palsu").
create or replace function public.snapshot_tutup(p_task text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'komentar', (select count(*) from public.comments c
                  where c.task_id = p_task and c.parent_id is null and c.deleted_at is null),
    'balasan',  (select count(*) from public.comments c
                  where c.task_id = p_task and c.parent_id is not null and c.deleted_at is null),
    'lampiran', (select count(*) from public.attachments a
                  where a.task_id = p_task and a.deleted_at is null),
    'ada_url',  exists (select 1 from public.comments c
                  where c.task_id = p_task and c.deleted_at is null and c.text ~* 'https?://'),
    'komentar_terakhir', (
      select jsonb_build_object(
               'id', c.id, 'user', m.username, 'user_id', c.author_id,
               'date', public.iso_utc(c.created_at), 'teks200', left(c.text, 200))
        from public.comments c
        left join public.members m on m.id = c.author_id
       where c.task_id = p_task and c.deleted_at is null
       order by c.created_at desc, c.id desc
       limit 1))
$$;

-- ---------------------------------------------------------------- pencatat activity (satu pintu)
create or replace function public.catat_activity(
  p_task        text,
  p_jenis       text,
  p_dari        jsonb default null,
  p_ke          jsonb default null,
  p_snapshot    jsonb default null,
  p_at          timestamptz default null,
  p_catatan     text default null,
  p_actor       bigint default null,
  p_at_awal     timestamptz default null,
  p_aktor_impor boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber text := public.sumber_aktif();
  v_impor  boolean := v_sumber in ('impor', 'sinkron');
  v_actor  bigint;
begin
  if v_impor then
    v_actor := case when p_aktor_impor then p_actor end;
  else
    v_actor := coalesce(p_actor, public.aktor());
  end if;

  insert into public.activity
    (task_id, at, at_awal, actor_id, sumber, token_id, jenis, dari, ke, aktor_assignee, snapshot, lengkap, catatan)
  values (
    p_task,
    coalesce(p_at, now()),
    case when v_impor
         then coalesce(nullif(current_setting('app.at_awal', true), '')::timestamptz, p_at_awal) end,
    v_actor,
    v_sumber,
    nullif(current_setting('app.token_id', true), '')::uuid,
    p_jenis,
    p_dari,
    p_ke,
    case when v_impor or v_actor is null then null
         else exists (select 1 from public.task_assignees ta where ta.task_id = p_task and ta.member_id = v_actor) end,
    p_snapshot,
    not v_impor,
    p_catatan);
end;
$$;

-- ---------------------------------------------------------------- tasks
create or replace function public.tasks_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber     text := public.sumber_aktif();
  v_impor      boolean := v_sumber in ('impor', 'sinkron');
  v_status     text;
  v_type       text;
  v_tutup_lama boolean;
  v_tutup_baru boolean;
  v_berubah    boolean;
  v_abaikan    constant text[] := array['comment_count', 'last_comment_at', 'cari'];
begin
  -- purge
  if tg_op = 'DELETE' then
    if old.sumber = 'clickup' and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    return old;
  end if;

  -- penjaga mode cermin (penghitung komentar & kolom cari tidak dihitung sebagai perubahan)
  if tg_op = 'INSERT' then
    if new.sumber = 'clickup' and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
  elsif (old.sumber = 'clickup' or new.sumber = 'clickup')
        and (to_jsonb(new) - v_abaikan) is distinct from (to_jsonb(old) - v_abaikan)
        and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;

  if new.sumber = 'clickup' and new.clickup_id is null then
    new.clickup_id := new.id;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      perform public.lempar('PT400', 'ID tugas tidak bisa diubah', 'INPUT_001');
    end if;
    if not v_impor and (new.sumber is distinct from old.sumber or new.clickup_id is distinct from old.clickup_id) then
      perform public.lempar('PT400', 'sumber/clickup_id tugas hanya boleh diubah impor', 'INPUT_001');
    end if;
  end if;

  -- status + status_type (denormalisasi dari list_statuses). Null → status open pertama list.
  if new.status is null then
    select s.status into new.status
      from public.list_statuses s
     where s.list_id = new.list_id
     order by (s.type = 'open') desc, s.orderindex, s.status
     limit 1;
  end if;
  select s.status, s.type into v_status, v_type
    from public.list_statuses s
   where s.list_id = new.list_id and s.status = new.status;
  if v_type is null then
    select s.status, s.type into v_status, v_type
      from public.list_statuses s
     where s.list_id = new.list_id and lower(s.status) = lower(new.status)
     order by s.orderindex, s.status
     limit 1;
  end if;
  if v_type is null then
    perform public.lempar('PT400',
      format('Status "%s" tidak ada di list %s', coalesce(new.status, '(kosong)'), new.list_id), 'INPUT_001');
  end if;
  new.status := v_status;
  new.status_type := v_type;

  -- turunan tanggal & pencarian
  new.due_wib := public.wib_date(new.due_at);
  if new.due_at is null then new.due_has_time := false; end if;
  if new.start_at is null then new.start_has_time := false; end if;
  new.cari := setweight(to_tsvector('simple'::regconfig, coalesce(new.name, '')), 'A')
           || setweight(to_tsvector('simple'::regconfig, coalesce(new.markdown, new.description_plain, '')), 'B')
           || to_tsvector('simple'::regconfig, new.id);

  v_tutup_baru := new.status_type in ('closed', 'done');

  if tg_op = 'INSERT' then
    if v_impor then
      new.created_at := coalesce(new.created_at, now());
      new.updated_at := coalesce(new.updated_at, new.created_at);
      new.first_closed_at := case when v_tutup_baru
                                  then coalesce(new.first_closed_at, new.closed_at, new.done_at) end;
      new.reopen_count := coalesce(new.reopen_count, 0);
    else
      new.created_at := now();
      new.updated_at := now();
      new.creator_id := coalesce(new.creator_id, public.aktor());
      if v_tutup_baru then
        new.closed_at := now();
        new.done_at := now();
        new.first_closed_at := now();
      else
        new.closed_at := null;
        new.done_at := null;
        new.first_closed_at := null;
      end if;
      new.reopen_count := 0;
      new.archived_at := case when new.archived then now() end;
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
    new.versi := 1;
    new.comment_count := 0;          -- diturunkan dari comments (trigger comments_sesudah)
    new.last_comment_at := null;
    return new;
  end if;

  -- UPDATE
  v_tutup_lama := old.status_type in ('closed', 'done');
  if not v_impor then
    new.created_at := old.created_at;
    new.creator_id := old.creator_id;
  end if;

  if v_tutup_baru and not v_tutup_lama then                 -- ditutup
    if not v_impor then
      new.closed_at := now();
      new.done_at := now();
    end if;                                                  -- impor: date_closed/date_done ClickUp verbatim
    new.first_closed_at := coalesce(old.first_closed_at, new.closed_at, new.done_at);
    new.reopen_count := old.reopen_count;
  elsif v_tutup_lama and not v_tutup_baru then              -- dibuka ulang
    if not v_impor then
      new.closed_at := null;
      new.done_at := null;
    end if;
    new.first_closed_at := old.first_closed_at;
    new.reopen_count := old.reopen_count + 1;
  else                                                       -- tetap terbuka / tetap selesai
    if not v_impor then
      new.closed_at := old.closed_at;
      new.done_at := old.done_at;
    end if;
    new.first_closed_at := coalesce(old.first_closed_at,
                                    case when v_tutup_baru then coalesce(new.closed_at, new.done_at) end);
    new.reopen_count := old.reopen_count;
  end if;

  -- arsip
  if new.archived and not old.archived then
    new.archived_at := case when v_impor then coalesce(new.archived_at, now()) else now() end;
  elsif not new.archived then
    new.archived_at := null;
  elsif not v_impor then
    new.archived_at := old.archived_at;
  end if;

  -- hapus lunak
  if new.deleted_at is null then
    new.deleted_by := null;
  elsif not v_impor then
    if old.deleted_at is null then
      new.deleted_at := now();
      new.deleted_by := coalesce(new.deleted_by, public.aktor());
    else
      new.deleted_at := old.deleted_at;
      new.deleted_by := old.deleted_by;
    end if;
  end if;

  -- versi & updated_at. Komentar/penghitung TIDAK menaikkan keduanya.
  -- app.sentuh_tugas = id tugas → dianggap berubah (dipakai trigger assignee).
  v_berubah :=
       (new.list_id, new.parent_id, new.name, new.markdown, new.description_plain, new.desc_unreadable,
        new.status, new.priority, new.due_at, new.due_has_time, new.start_at, new.start_has_time,
        new.archived, new.deleted_at, new.extra)
       is distinct from
       (old.list_id, old.parent_id, old.name, old.markdown, old.description_plain, old.desc_unreadable,
        old.status, old.priority, old.due_at, old.due_has_time, old.start_at, old.start_has_time,
        old.archived, old.deleted_at, old.extra)
    or coalesce(current_setting('app.sentuh_tugas', true), '') = new.id;

  if v_berubah then
    new.versi := old.versi + 1;
    if not v_impor then new.updated_at := now(); end if;
  else
    new.versi := old.versi;
    if not v_impor then new.updated_at := old.updated_at; end if;
  end if;
  if v_impor then
    new.updated_at := coalesce(new.updated_at, old.updated_at);   -- date_updated ClickUp verbatim
  end if;
  return new;
end;
$$;

create or replace function public.tasks_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber     text := public.sumber_aktif();
  v_impor      boolean := v_sumber in ('impor', 'sinkron');
  v_at_awal    timestamptz;
  v_tutup_lama boolean;
  v_tutup_baru boolean;
  v_rename     boolean;
begin
  if tg_op = 'INSERT' then
    if v_impor then
      perform public.catat_activity(new.id, 'dibuat', null, public.ringkas_tugas(new),
        p_at => new.created_at, p_actor => new.creator_id, p_aktor_impor => true,
        p_catatan => 'impor: riwayat sebelum impor tidak tersedia (sebagian)');
      if new.status_type in ('closed', 'done') then
        perform public.catat_activity(new.id, 'ditutup_impor', null,
          jsonb_build_object('status', new.status, 'type', new.status_type),
          p_at => coalesce(new.closed_at, new.done_at, new.updated_at),
          p_catatan => 'sudah selesai saat diimpor; aktor tak diketahui');
      end if;
    else
      perform public.catat_activity(new.id, 'dibuat', null, public.ringkas_tugas(new));
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.catat_activity(old.id, 'hapus', public.ringkas_tugas(old), null, p_catatan => 'purge permanen');
    return null;
  end if;

  -- UPDATE: satu baris activity per field yang berubah
  v_at_awal := case when v_impor then old.synced_at end;
  v_tutup_lama := old.status_type in ('closed', 'done');
  v_tutup_baru := new.status_type in ('closed', 'done');

  if new.status is distinct from old.status or new.status_type is distinct from old.status_type then
    -- ganti NAMA status list (FK on update cascade) bukan perpindahan status → tidak dicatat
    v_rename := new.list_id = old.list_id and new.status_type = old.status_type
      and not exists (select 1 from public.list_statuses s where s.list_id = old.list_id and s.status = old.status);
    if not v_rename then
      if v_tutup_lama and not v_tutup_baru then
        perform public.catat_activity(new.id, 'buka_ulang',
          jsonb_build_object('status', old.status, 'type', old.status_type),
          jsonb_build_object('status', new.status, 'type', new.status_type),
          p_at_awal => v_at_awal);
      else
        perform public.catat_activity(new.id, 'status',
          jsonb_build_object('status', old.status, 'type', old.status_type),
          jsonb_build_object('status', new.status, 'type', new.status_type),
          p_snapshot => case when v_tutup_baru and not v_tutup_lama then public.snapshot_tutup(new.id) end,
          p_at => case when v_impor and v_tutup_baru and not v_tutup_lama
                       then coalesce(new.closed_at, new.done_at) end,
          p_at_awal => v_at_awal);
      end if;
    end if;
  end if;

  if new.due_at is distinct from old.due_at or new.due_has_time is distinct from old.due_has_time then
    perform public.catat_activity(new.id, 'due',
      public.jejak_tanggal(old.due_at, old.due_has_time), public.jejak_tanggal(new.due_at, new.due_has_time),
      p_at_awal => v_at_awal);
  end if;

  if new.start_at is distinct from old.start_at or new.start_has_time is distinct from old.start_has_time then
    perform public.catat_activity(new.id, 'mulai',
      public.jejak_tanggal(old.start_at, old.start_has_time), public.jejak_tanggal(new.start_at, new.start_has_time),
      p_at_awal => v_at_awal);
  end if;

  if new.name is distinct from old.name then
    perform public.catat_activity(new.id, 'nama', to_jsonb(old.name), to_jsonb(new.name), p_at_awal => v_at_awal);
  end if;

  if coalesce(new.markdown, new.description_plain) is distinct from coalesce(old.markdown, old.description_plain) then
    perform public.catat_activity(new.id, 'deskripsi',
      to_jsonb(coalesce(old.markdown, old.description_plain)),
      to_jsonb(coalesce(new.markdown, new.description_plain)),
      p_at_awal => v_at_awal);
  end if;

  if new.list_id is distinct from old.list_id then
    perform public.catat_activity(new.id, 'pindah_list',
      (select jsonb_build_object('id', l.id, 'name', l.name) from public.lists l where l.id = old.list_id),
      (select jsonb_build_object('id', l.id, 'name', l.name) from public.lists l where l.id = new.list_id),
      p_at_awal => v_at_awal);
  end if;

  if new.parent_id is distinct from old.parent_id then
    perform public.catat_activity(new.id, 'induk', to_jsonb(old.parent_id), to_jsonb(new.parent_id),
      p_at_awal => v_at_awal);
  end if;

  if new.priority is distinct from old.priority then
    perform public.catat_activity(new.id, 'prioritas', to_jsonb(old.priority), to_jsonb(new.priority),
      p_at_awal => v_at_awal);
  end if;

  if new.archived is distinct from old.archived then
    perform public.catat_activity(new.id, case when new.archived then 'arsip' else 'pulih_arsip' end,
      to_jsonb(old.archived), to_jsonb(new.archived), p_at_awal => v_at_awal);
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    perform public.catat_activity(new.id, case when v_impor then 'hilang_di_clickup' else 'hapus' end,
      null, jsonb_build_object('deleted_at', public.iso_utc(new.deleted_at), 'deleted_by', new.deleted_by),
      p_at_awal => v_at_awal);
  elsif new.deleted_at is null and old.deleted_at is not null then
    perform public.catat_activity(new.id, 'pulih',
      jsonb_build_object('deleted_at', public.iso_utc(old.deleted_at), 'deleted_by', old.deleted_by), null,
      p_at_awal => v_at_awal);
  end if;

  return null;
end;
$$;

create trigger tasks_sebelum before insert or update or delete on public.tasks
  for each row execute function public.tasks_sebelum();
create trigger tasks_sesudah after insert or update or delete on public.tasks
  for each row execute function public.tasks_sesudah();

-- ---------------------------------------------------------------- task_assignees
create or replace function public.assignees_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impor       boolean := public.sumber_aktif() in ('impor', 'sinkron');
  v_task_sumber text;
begin
  select t.sumber into v_task_sumber
    from public.tasks t
   where t.id = case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  if v_task_sumber = 'clickup' and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' and not v_impor then
    new.added_at := now();
    new.added_by := coalesce(new.added_by, public.aktor());
  end if;
  return new;
end;
$$;

create or replace function public.assignees_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber  text := public.sumber_aktif();
  v_task    text := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  v_member  bigint := case when tg_op = 'DELETE' then old.member_id else new.member_id end;
  v_info    jsonb;
  v_actor   bigint;
  v_dibuat  timestamptz;
  v_synced  timestamptz;
begin
  select t.created_at, t.synced_at into v_dibuat, v_synced from public.tasks t where t.id = v_task;
  if not found then
    return null;                        -- tugas sedang di-purge (cascade)
  end if;
  select jsonb_build_object('id', m.id, 'username', m.username) into v_info
    from public.members m where m.id = v_member;

  -- impor awal: assignee bagian dari data awal, bukan kejadian → tidak dicatat
  if v_sumber <> 'impor' then
    perform public.catat_activity(v_task,
      case when tg_op = 'INSERT' then 'assignee_tambah' else 'assignee_hapus' end,
      case when tg_op = 'DELETE' then v_info end,
      case when tg_op = 'INSERT' then v_info end,
      p_at_awal => case when v_sumber = 'sinkron' then v_synced end);
  end if;

  -- ui/api/sistem: sentuh tugas (updated_at, versi) kecuali tugas dibuat di transaksi ini
  if v_sumber in ('ui', 'api', 'sistem') and v_dibuat is distinct from now() then
    perform set_config('app.sentuh_tugas', v_task, true);
    update public.tasks set updated_at = now() where id = v_task;
    perform set_config('app.sentuh_tugas', '', true);
  end if;

  if tg_op = 'INSERT' and v_sumber in ('ui', 'api') then
    v_actor := public.aktor();
    if v_member is distinct from v_actor then
      insert into public.notifications (member_id, task_id, jenis, actor_id)
      select m.id, v_task, 'assign', v_actor
        from public.members m
       where m.id = v_member and m.aktif and m.role <> 'bot';
    end if;
  end if;
  return null;
end;
$$;

create trigger task_assignees_sebelum before insert or update or delete on public.task_assignees
  for each row execute function public.assignees_sebelum();
create trigger task_assignees_sesudah after insert or delete on public.task_assignees
  for each row execute function public.assignees_sesudah();

-- ---------------------------------------------------------------- comments
create or replace function public.comments_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impor       boolean := public.sumber_aktif() in ('impor', 'sinkron');
  v_task_sumber text;
  v_induk       record;
begin
  if tg_op = 'DELETE' then
    select t.sumber into v_task_sumber from public.tasks t where t.id = old.task_id;
    if (old.sumber = 'clickup' or v_task_sumber = 'clickup') and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    return old;
  end if;

  select t.sumber into v_task_sumber from public.tasks t where t.id = new.task_id;
  if (new.sumber = 'clickup' or v_task_sumber = 'clickup' or (tg_op = 'UPDATE' and old.sumber = 'clickup'))
     and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old))
     and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;

  if new.sumber = 'clickup' and new.clickup_id is null then
    new.clickup_id := new.id;
  end if;

  if tg_op = 'INSERT' then
    if not v_impor then
      new.created_at := now();
      new.edited_at := null;
      new.deleted_at := null;
      new.deleted_by := null;
      new.author_id := coalesce(new.author_id, public.aktor());
    end if;
  else
    if new.id is distinct from old.id or new.task_id is distinct from old.task_id then
      perform public.lempar('PT400', 'ID/tugas komentar tidak bisa diubah', 'INPUT_001');
    end if;
    if not v_impor then
      if new.parent_id is distinct from old.parent_id or new.author_id is distinct from old.author_id
         or new.sumber is distinct from old.sumber or new.clickup_id is distinct from old.clickup_id then
        perform public.lempar('PT400', 'Induk/penulis/sumber komentar tidak bisa diubah', 'INPUT_001');
      end if;
      new.created_at := old.created_at;
      if new.text is distinct from old.text or new.body_json is distinct from old.body_json then
        new.edited_at := now();
      else
        new.edited_at := old.edited_at;
      end if;
      if new.deleted_at is not null and old.deleted_at is null then
        new.deleted_at := now();
        new.deleted_by := coalesce(new.deleted_by, public.aktor());
      elsif new.deleted_at is not null then
        new.deleted_at := old.deleted_at;
        new.deleted_by := old.deleted_by;
      end if;
    end if;
    if new.deleted_at is null then
      new.deleted_by := null;
    end if;
  end if;

  -- balasan hanya ke komentar top-level di tugas yang sama (thread satu tingkat seperti ClickUp)
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    select c.parent_id, c.task_id into v_induk from public.comments c where c.id = new.parent_id;
    if not found then
      perform public.lempar('PT404', 'Komentar induk tidak ditemukan', 'ITEM_013');
    end if;
    if v_induk.parent_id is not null then
      perform public.lempar('PT400', 'Balasan hanya boleh ke komentar top-level', 'INPUT_001');
    end if;
    if v_induk.task_id is distinct from new.task_id then
      perform public.lempar('PT400', 'Komentar induk ada di tugas lain', 'INPUT_001');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.comments_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber text := public.sumber_aktif();
  v_impor  boolean := v_sumber in ('impor', 'sinkron');
  v_task   text := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  v_actor  bigint;
begin
  -- penghitung di tasks: semua komentar + balasan yang tidak dihapus (tidak menaikkan updated_at/versi)
  update public.tasks t
     set comment_count = x.n,
         last_comment_at = x.terakhir
    from (select count(*)::integer as n, max(c.created_at) as terakhir
            from public.comments c
           where c.task_id = v_task and c.deleted_at is null) x
   where t.id = v_task
     and (t.comment_count, t.last_comment_at) is distinct from (x.n, x.terakhir);

  if tg_op = 'INSERT' then
    -- komentar impor/sinkron sudah tercatat sebagai baris komentar sendiri (waktu & penulis asli)
    if not v_impor then
      perform public.catat_activity(new.task_id, 'komentar', null,
        jsonb_build_object('id', new.id, 'parent_id', new.parent_id, 'teks200', left(new.text, 200)));
    end if;
    if v_sumber in ('ui', 'api') then
      v_actor := public.aktor();
      -- penerima: assignee + pembuat kartu + pengomentar sebelumnya di kartu ini
      insert into public.notifications (member_id, task_id, comment_id, jenis, actor_id)
      select m.id, new.task_id, new.id, 'komentar', v_actor
        from public.members m
       where m.aktif
         and m.role <> 'bot'
         and m.id is distinct from v_actor
         and (   m.id in (select ta.member_id from public.task_assignees ta where ta.task_id = new.task_id)
              or m.id = (select t.creator_id from public.tasks t where t.id = new.task_id)
              or m.id in (select c.author_id from public.comments c
                           where c.task_id = new.task_id and c.id <> new.id
                             and c.deleted_at is null and c.author_id is not null))
      on conflict (member_id, comment_id) where comment_id is not null do nothing;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      perform public.catat_activity(new.task_id, 'komentar_hapus',
        jsonb_build_object('id', old.id, 'parent_id', old.parent_id, 'teks', old.text), null,
        p_catatan => case when v_impor then 'hilang di ClickUp' end,
        p_at_awal => case when v_impor then old.synced_at end);
    elsif new.deleted_at is null and new.text is distinct from old.text then
      perform public.catat_activity(new.task_id, 'komentar_edit',
        jsonb_build_object('id', old.id, 'teks', old.text),
        jsonb_build_object('id', new.id, 'teks', new.text),
        p_at_awal => case when v_impor then old.synced_at end);
    end if;
  end if;
  return null;
end;
$$;

create trigger comments_sebelum before insert or update or delete on public.comments
  for each row execute function public.comments_sebelum();
create trigger comments_sesudah after insert or update or delete on public.comments
  for each row execute function public.comments_sesudah();

-- ---------------------------------------------------------------- comment_mentions
create or replace function public.mentions_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  select c.sumber as c_sumber, t.sumber as t_sumber into v_c
    from public.comments c
    join public.tasks t on t.id = c.task_id
   where c.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  if found and (v_c.c_sumber = 'clickup' or v_c.t_sumber = 'clickup') and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.mentions_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor bigint;
begin
  if public.sumber_aktif() in ('ui', 'api') then
    v_actor := public.aktor();
    if new.member_id is distinct from v_actor then
      -- mention menimpa notifikasi 'komentar' untuk komentar yang sama (tanpa dobel)
      insert into public.notifications (member_id, task_id, comment_id, jenis, actor_id)
      select m.id, c.task_id, c.id, 'mention', v_actor
        from public.comments c
        join public.members m on m.id = new.member_id
       where c.id = new.comment_id and m.aktif and m.role <> 'bot'
      on conflict (member_id, comment_id) where comment_id is not null
      do update set jenis = 'mention';
    end if;
  end if;
  return null;
end;
$$;

create trigger comment_mentions_sebelum before insert or update or delete on public.comment_mentions
  for each row execute function public.mentions_sebelum();
create trigger comment_mentions_sesudah after insert on public.comment_mentions
  for each row execute function public.mentions_sesudah();

-- ---------------------------------------------------------------- attachments
create or replace function public.lampiran_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impor       boolean := public.sumber_aktif() in ('impor', 'sinkron');
  v_task_sumber text;
begin
  if tg_op = 'DELETE' then
    select t.sumber into v_task_sumber from public.tasks t where t.id = old.task_id;
    if (old.sumber = 'clickup' or v_task_sumber = 'clickup') and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    return old;
  end if;

  select t.sumber into v_task_sumber from public.tasks t where t.id = new.task_id;
  if (new.sumber = 'clickup' or v_task_sumber = 'clickup' or (tg_op = 'UPDATE' and old.sumber = 'clickup'))
     and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old))
     and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;

  if new.sumber = 'clickup' and new.clickup_id is null then
    new.clickup_id := new.id;
  end if;

  if tg_op = 'INSERT' then
    if not v_impor then
      new.created_at := now();
      new.uploaded_by := coalesce(new.uploaded_by, public.aktor());
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
  else
    if new.id is distinct from old.id or new.task_id is distinct from old.task_id then
      perform public.lempar('PT400', 'ID/tugas lampiran tidak bisa diubah', 'INPUT_001');
    end if;
    if not v_impor then
      if new.sumber is distinct from old.sumber or new.clickup_id is distinct from old.clickup_id then
        perform public.lempar('PT400', 'sumber lampiran hanya boleh diubah impor', 'INPUT_001');
      end if;
      new.created_at := old.created_at;
      if new.deleted_at is not null and old.deleted_at is null then
        new.deleted_at := now();
        new.deleted_by := coalesce(new.deleted_by, public.aktor());
      elsif new.deleted_at is not null then
        new.deleted_at := old.deleted_at;
        new.deleted_by := old.deleted_by;
      end if;
    end if;
    if new.deleted_at is null then
      new.deleted_by := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.lampiran_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sumber text := public.sumber_aktif();
  v_impor  boolean := v_sumber in ('impor', 'sinkron');
begin
  if tg_op = 'INSERT' then
    if v_sumber <> 'impor' then
      perform public.catat_activity(new.task_id, 'lampiran_tambah', null,
        jsonb_build_object('id', new.id, 'title', new.title, 'mimetype', new.mimetype,
                           'size', new.size, 'comment_id', new.comment_id));
    end if;
  elsif new.deleted_at is not null and old.deleted_at is null then
    perform public.catat_activity(new.task_id, 'lampiran_hapus',
      jsonb_build_object('id', old.id, 'title', old.title, 'comment_id', old.comment_id), null,
      p_catatan => case when v_impor then 'hilang di ClickUp' end,
      p_at_awal => case when v_impor then old.synced_at end);
  end if;
  return null;
end;
$$;

create trigger attachments_sebelum before insert or update or delete on public.attachments
  for each row execute function public.lampiran_sebelum();
create trigger attachments_sesudah after insert or update on public.attachments
  for each row execute function public.lampiran_sesudah();

-- ---------------------------------------------------------------- struktur: spaces / folders / lists / list_statuses
create or replace function public.struktur_penjaga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.sumber = 'clickup' and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    return old;
  end if;
  if (new.sumber = 'clickup' or (tg_op = 'UPDATE' and old.sumber = 'clickup'))
     and (tg_op = 'INSERT' or to_jsonb(new) is distinct from to_jsonb(old))
     and not public.boleh_ubah_clickup() then
    perform public.tolak_cermin();
  end if;
  return new;
end;
$$;

create trigger spaces_penjaga before insert or update or delete on public.spaces
  for each row execute function public.struktur_penjaga();
create trigger folders_penjaga before insert or update or delete on public.folders
  for each row execute function public.struktur_penjaga();
create trigger lists_penjaga before insert or update or delete on public.lists
  for each row execute function public.struktur_penjaga();

-- List baru buatan app → status default to do (open) / in progress (custom) / complete (closed).
create or replace function public.lists_status_awal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sumber = 'app' and not exists (select 1 from public.list_statuses s where s.list_id = new.id) then
    insert into public.list_statuses (list_id, status, type, orderindex, color) values
      (new.id, 'to do',       'open',   0, '#d3d3d3'),
      (new.id, 'in progress', 'custom', 1, '#4194f6'),
      (new.id, 'complete',    'closed', 2, '#6bc950');
  end if;
  return null;
end;
$$;

create trigger lists_status_awal after insert on public.lists
  for each row execute function public.lists_status_awal();

create or replace function public.list_statuses_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_sumber text;
begin
  select l.sumber into v_list_sumber
    from public.lists l
   where l.id = case when tg_op = 'DELETE' then old.list_id else new.list_id end;
  if v_list_sumber = 'clickup' and not public.boleh_ubah_clickup()
     and (tg_op <> 'UPDATE' or to_jsonb(new) is distinct from to_jsonb(old)) then
    perform public.tolak_cermin();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Tipe status berubah → status_type tugas ikut (trigger tasks menurunkan ulang + isi/kosongkan tanggal tutup).
create or replace function public.list_statuses_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type is distinct from old.type then
    update public.tasks t
       set status_type = new.type
     where t.list_id = new.list_id
       and t.status = new.status
       and t.status_type is distinct from new.type;
  end if;
  return null;
end;
$$;

create trigger list_statuses_sebelum before insert or update or delete on public.list_statuses
  for each row execute function public.list_statuses_sebelum();
create trigger list_statuses_sesudah after update on public.list_statuses
  for each row execute function public.list_statuses_sesudah();

-- ---------------------------------------------------------------- updated_at teknis
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- activity append-only
create or replace function public.activity_tolak_ubah()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.lempar('PT403', 'activity bersifat append-only: tidak boleh diubah atau dihapus', 'ACCESS_001');
  return null;
end;
$$;

create trigger activity_append_only before update or delete on public.activity
  for each row execute function public.activity_tolak_ubah();
create trigger activity_tolak_truncate before truncate on public.activity
  for each statement execute function public.activity_tolak_ubah();
