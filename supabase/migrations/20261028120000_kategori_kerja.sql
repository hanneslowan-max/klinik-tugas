-- Kategori pekerjaan per tugas (revisi Hannes 28 Okt 2026): Jelajah dikelompokkan menurut JENIS PEKERJAAN
-- (Ads, Konten, SEO, Pipeline, …), bukan Space → Folder → List. List "Fase 1–4" berisi campuran pekerjaan, jadi
-- kategori melekat pada TUGAS (tasks.kategori_id), bukan pada list. Tugas tanpa kategori = "Tanpa kategori".
--
-- * Daftar kategori BERSAMA (satu untuk semua anggota), diatur owner di Admin → Kategori (tambah / ganti nama /
--   hapus / geser). Awal: Ads, Konten, SEO, Pipeline. Hapus kategori → tugasnya kembali "Tanpa kategori".
-- * Kategori = metadata milik app: TIDAK pernah ditimpa sinkron/impor ClickUp (muat_tasks memakai daftar kolom
--   eksplisit) dan tetap boleh diubah di mode cermin (tasks_sebelum: kategori_id masuk v_abaikan). Mengubah
--   kategori tidak menaikkan versi (tidak bentrok dengan suntingan lain yang sedang terbuka).
-- * Siapa pun yang melihat tugas boleh mengatur kategorinya (sama dengan field lain); tercatat di Riwayat
--   (activity jenis 'kategori', dari/ke = {id, nama} saat itu).
-- * API v2 & web_buat_tugas: kunci body `kategori` = id atau nama kategori (tanpa beda huruf besar/kecil);
--   null/'' = tanpa kategori. j_baris (web) memuat `kategori_kerja`.
--
-- Konvensi ikut 20261013120000_pipeline_kategori: RLS ON + policy SELECT saja, tulis lewat fungsi SECURITY
-- DEFINER, grant fail-closed (web_ → authenticated saja).

-- ============================================================ tabel
create table public.kategori_kerja (
  id          text primary key default public.id_baru('kk', 8),
  nama        text not null,
  urutan      integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  constraint kategori_kerja_nama_isi check (length(btrim(nama)) between 1 and 40),
  constraint kategori_kerja_id_pola check (id ~ '^kk[0-9a-z]+$')
);
create unique index kategori_kerja_nama_uniq on public.kategori_kerja (lower(nama));

alter table public.tasks add column kategori_id text references public.kategori_kerja (id) on delete set null;
create index tasks_kategori_idx on public.tasks (kategori_id) where deleted_at is null;

insert into public.kategori_kerja (nama, urutan)
values ('Ads', 0), ('Konten', 1), ('SEO', 2), ('Pipeline', 3);

alter table public.kategori_kerja enable row level security;
create policy baca_anggota on public.kategori_kerja for select to authenticated using ((select public.is_member()));

revoke all on public.kategori_kerja from anon, authenticated, service_role;
grant select on public.kategori_kerja to authenticated, service_role;

-- activity: jenis baru 'kategori'
alter table public.activity drop constraint activity_jenis_check;
alter table public.activity add constraint activity_jenis_check check (jenis in (
  'dibuat', 'status', 'buka_ulang', 'due', 'mulai', 'assignee_tambah', 'assignee_hapus',
  'nama', 'deskripsi', 'pindah_list', 'induk', 'prioritas', 'arsip', 'pulih_arsip',
  'hapus', 'pulih', 'komentar', 'komentar_edit', 'komentar_hapus',
  'lampiran_tambah', 'lampiran_hapus', 'hilang_di_clickup', 'ditutup_impor', 'kategori'));

-- ============================================================ trigger
-- tasks_sebelum: sama dengan 20260929100300_trigger.sql, kecuali v_abaikan + 'kategori_id' (boleh di mode cermin).
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
  v_abaikan    constant text[] := array['comment_count', 'last_comment_at', 'cari', 'kategori_id'];
  v_induk      record;
begin
  -- purge
  if tg_op = 'DELETE' then
    if old.sumber = 'clickup' and not public.boleh_ubah_clickup() then
      perform public.tolak_cermin();
    end if;
    perform public.wajib_owner_hapus();
    return old;
  end if;

  -- penjaga mode cermin (penghitung komentar, kolom cari & kategori kerja — metadata milik app — tidak dihitung
  -- sebagai perubahan)
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

  -- (review R3) sub-tugas tidak boleh aktif di bawah induk yang di Sampah / diarsip (ui/api/sistem).
  -- Berlaku saat dibuat, ganti induk, dipulihkan, atau dibuka arsipnya. Impor/sinkron = data ClickUp verbatim.
  if not v_impor and new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id
          or (old.deleted_at is not null and new.deleted_at is null)
          or (old.archived and not new.archived)) then
    select p.deleted_at is not null as dihapus, p.archived as diarsip into v_induk
      from public.tasks p where p.id = new.parent_id;
    if v_induk.dihapus and (tg_op = 'INSERT' or new.deleted_at is null) then
      perform public.lempar('PT409', 'Induk tugas ini ada di Sampah; pulihkan induknya dulu', 'KONFLIK_001');
    end if;
    if v_induk.diarsip and not new.archived then
      perform public.lempar('PT409', 'Induk tugas ini diarsip; buka arsip induknya dulu', 'KONFLIK_001');
    end if;
  end if;

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
  -- penghitung komentar hanya boleh diubah trigger comments_sesudah (app.hitung_komentar = id tugas);
  -- melindungi dari upsert "set ... = excluded.*" yang membawa nilai 0 dari BEFORE INSERT.
  if coalesce(current_setting('app.hitung_komentar', true), '') is distinct from new.id then
    new.comment_count := old.comment_count;
    new.last_comment_at := old.last_comment_at;
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

  -- hapus lunak / pulihkan: hanya owner (ui/api)
  if (new.deleted_at is null) <> (old.deleted_at is null) then
    perform public.wajib_owner_hapus();
  end if;
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

  -- versi & updated_at. Penghitung komentar TIDAK menaikkan versi.
  -- app.sentuh_tugas = id tugas → dianggap berubah (versi + updated_at; dipakai trigger assignee).
  -- app.sentuh_waktu = id tugas → updated_at saja (komentar/balasan baru ui/api, review R4; versi tetap).
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
    if not v_impor then
      new.updated_at := case when coalesce(current_setting('app.sentuh_waktu', true), '') = new.id
                             then now() else old.updated_at end;
    end if;
  end if;
  if v_impor then
    new.updated_at := coalesce(new.updated_at, old.updated_at);   -- date_updated ClickUp verbatim
  end if;
  return new;
end;
$$;


-- Riwayat perubahan kategori (trigger terpisah; tasks_sesudah tidak diubah). Nama disimpan saat itu (dari/ke).
create or replace function public.tasks_kategori_sesudah()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kategori_id is distinct from old.kategori_id then
    perform public.catat_activity(new.id, 'kategori',
      (select jsonb_build_object('id', k.id, 'nama', k.nama) from public.kategori_kerja k where k.id = old.kategori_id),
      (select jsonb_build_object('id', k.id, 'nama', k.nama) from public.kategori_kerja k where k.id = new.kategori_id));
  end if;
  return null;
end;
$$;
create trigger tasks_kategori_sesudah after update of kategori_id on public.tasks
  for each row execute function public.tasks_kategori_sesudah();

-- ============================================================ baris web (+ kategori_kerja)
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
           -- kategori pekerjaan (28 Okt 2026): {id, nama} | null
           'kategori_kerja', case when k.id is not null then jsonb_build_object('id', k.id, 'nama', k.nama) end,
           'url', public.app_url() || '/t/' || t.id)
    from public.tasks t
    join public.lists l on l.id = t.list_id
    left join public.kategori_kerja k on k.id = t.kategori_id
    left join public.list_statuses s on s.list_id = t.list_id and s.status = t.status
   where t.id = p_task
$$;


-- ============================================================ ekspor cadangan (+ kategori_kerja)
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
    'kategori_kerja',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.urutan, x.id), '[]') from public.kategori_kerja x),
    'app_settings',     (select coalesce(jsonb_agg(to_jsonb(x) order by x.key), '[]') from public.app_settings x),
    'sync_runs',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.sync_runs x),
    'sync_raw',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.entity, x.id), '[]') from public.sync_raw x));
end;
$$;


-- ============================================================ fungsi
-- Daftar kategori (urut) — dipakai pemilih kategori, Jelajah, Admin.
create or replace function public.inti_kategori_kerja_daftar()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'nama', k.nama, 'urutan', k.urutan)
                  order by k.urutan, k.dibuat_pada, k.id), '[]'::jsonb)
    from public.kategori_kerja k
$$;

-- Nilai kunci body `kategori` → id kategori (id persis, atau nama tanpa beda huruf besar/kecil). null/'' → null.
create or replace function public.kategori_kerja_dari(p jsonb)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
  v_id text;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'string' then
    perform public.lempar('PT400', 'kategori harus id atau nama kategori (teks)', 'INPUT_001');
  end if;
  v := btrim(regexp_replace(p #>> '{}', '\s+', ' ', 'g'));
  if v = '' then return null; end if;
  select k.id into v_id from public.kategori_kerja k where k.id = v or lower(k.nama) = lower(v)
   order by (k.id = v) desc limit 1;
  if v_id is null then
    perform public.lempar('PT400', format('Kategori "%s" tidak dikenal. Pilihan: %s', v,
      (select string_agg(k.nama, ', ' order by k.urutan, k.dibuat_pada) from public.kategori_kerja k)), 'INPUT_001');
  end if;
  return v_id;
end; $$;

-- Terapkan kunci body `kategori` (bila ada) ke tugas yang sudah dicek terlihat oleh pemanggil.
create or replace function public.inti_kategori_body(p_task text, p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_body is not null and jsonb_typeof(p_body) = 'object' and p_body ? 'kategori' then
    update public.tasks set kategori_id = public.kategori_kerja_dari(p_body -> 'kategori') where id = p_task;
  end if;
end; $$;

-- Cakupan Jelajah: tugas tidak terhapus/diarsip, list (beserta folder/space) tidak diarsip, terlihat pemanggil
-- (privasi space) — sama dengan Tugas Saya, tanpa syarat assignee.
-- Hitungan per kategori + "tanpa" (kategori_id null): terbuka, telat (kategori_due 'telat'), selesai.
create or replace function public.web_kategori_kerja()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hari  date := public.hari_ini_wib();
  v_tutup text[];
  v_arsip text[];
  v_hit   jsonb;
begin
  perform public.mulai_web();
  v_tutup := public.tugas_tertutup();
  v_arsip := public.list_diarsip();
  with c as (
    select t.kategori_id,
           t.status_type in ('closed', 'done') as selesai,
           public.kategori_due(t.status_type in ('closed', 'done'), t.due_wib, t.name, l.tidak_ditagih, v_hari) as grup
      from public.tasks t
      join public.lists l on l.id = t.list_id
     where t.deleted_at is null and not t.archived
       and not (l.id = any (v_arsip))
       and not (t.id = any (v_tutup)))
  select coalesce(jsonb_object_agg(coalesce(x.kategori_id, ''), jsonb_build_object(
           'terbuka', x.terbuka, 'telat', x.telat, 'selesai', x.selesai)), '{}'::jsonb)
    into v_hit
    from (select c.kategori_id,
                 count(*) filter (where not c.selesai)::int as terbuka,
                 count(*) filter (where c.grup = 'telat')::int as telat,
                 count(*) filter (where c.selesai)::int as selesai
            from c group by c.kategori_id) x;
  return jsonb_build_object(
    'hari_ini', v_hari,
    'kategori', (select coalesce(jsonb_agg(e || jsonb_build_object('hitungan',
                          coalesce(v_hit -> (e ->> 'id'), '{"terbuka":0,"telat":0,"selesai":0}'::jsonb))
                          order by o), '[]'::jsonb)
                   from jsonb_array_elements(public.inti_kategori_kerja_daftar()) with ordinality as a(e, o)),
    'tanpa', coalesce(v_hit -> '', '{"terbuka":0,"telat":0,"selesai":0}'::jsonb));
end;
$$;

-- Isi satu kategori (p_kategori null/'' = Tanpa kategori), lintas list. Terbuka: urut due (kosong di akhir) →
-- nama; klien mengelompokkan per kategori_due seperti Tugas Saya. p_selesai = true → + 100 yang terakhir selesai.
create or replace function public.web_tugas_kategori(p_kategori text default null, p_selesai boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kat   text := nullif(btrim(coalesce(p_kategori, '')), '');
  v_tutup text[];
  v_arsip text[];
begin
  perform public.mulai_web();
  if v_kat is not null and not exists (select 1 from public.kategori_kerja k where k.id = v_kat) then
    perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013');
  end if;
  v_tutup := public.tugas_tertutup();
  v_arsip := public.list_diarsip();
  return (
    with c as (
      select t.id, t.name, t.due_wib, t.status_type in ('closed', 'done') as selesai,
             coalesce(t.closed_at, t.done_at, t.updated_at) as tutup_pada
        from public.tasks t
        join public.lists l on l.id = t.list_id
       where t.deleted_at is null and not t.archived
         and not (l.id = any (v_arsip))
         and not (t.id = any (v_tutup))
         and t.kategori_id is not distinct from v_kat)
    select jsonb_build_object(
      'kategori', (select jsonb_build_object('id', k.id, 'nama', k.nama) from public.kategori_kerja k where k.id = v_kat),
      'tanggal', public.hari_ini_wib(),
      'tasks', (select coalesce(jsonb_agg(public.j_baris(c.id) order by c.due_wib nulls last, c.name, c.id), '[]'::jsonb)
                  from c where not c.selesai),
      'jumlah_selesai', (select count(*)::int from c where c.selesai),
      'selesai', case when coalesce(p_selesai, false) then
                   (select coalesce(jsonb_agg(public.j_baris(s.id) order by s.tutup_pada desc, s.id), '[]'::jsonb)
                      from (select c.id, c.tutup_pada from c where c.selesai
                             order by c.tutup_pada desc, c.id limit 100) s) end));
end;
$$;

-- Atur kategori satu tugas (p_kategori = id kategori, null/'' = tanpa). Tanpa cek versi; boleh di mode cermin.
create or replace function public.web_atur_kategori(p_task text, p_kategori text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  if not exists (select 1 from public.tasks t where t.id = p_task and t.deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if nullif(btrim(coalesce(p_kategori, '')), '') is not null
     and not exists (select 1 from public.kategori_kerja k where k.id = p_kategori) then
    perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013');
  end if;
  update public.tasks set kategori_id = nullif(btrim(coalesce(p_kategori, '')), '') where id = p_task;
  return public.j_baris(p_task);
end;
$$;

-- Admin (owner). p.aksi:
--   buat        {nama}       → kategori baru di urutan terakhir
--   ganti_nama  {id, nama}
--   hapus       {id}         → tugasnya kembali "Tanpa kategori" (tercatat di Riwayat tiap tugas)
--   urut        {ids: [..]}  → urutan baru; harus memuat SEMUA kategori, tepat sekali
-- Hasil: daftar kategori + jumlah tugas (tidak terhapus) per kategori.
create or replace function public.web_admin_kategori_simpan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aksi text := coalesce(p ->> 'aksi', '');
  v_id   text := nullif(p ->> 'id', '');
  v_nama text;
  v_ids  text[];
begin
  perform public.mulai_web(true);
  if p is null or jsonb_typeof(p) <> 'object' then
    perform public.lempar('PT400', 'Body harus objek JSON', 'INPUT_001');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kategori_kerja', 0));

  if v_aksi in ('buat', 'ganti_nama') then
    v_nama := btrim(regexp_replace(coalesce(p ->> 'nama', ''), '\s+', ' ', 'g'));
    if v_nama = '' then perform public.lempar('PT400', 'Nama kategori wajib diisi', 'INPUT_001'); end if;
    if length(v_nama) > 40 then perform public.lempar('PT400', 'Nama kategori maksimal 40 karakter', 'INPUT_001'); end if;
  end if;

  if v_aksi = 'buat' then
    if (select count(*) from public.kategori_kerja) >= 30 then
      perform public.lempar('PT400', 'Maksimal 30 kategori', 'INPUT_001');
    end if;
    begin
      insert into public.kategori_kerja (nama, urutan)
      values (v_nama, coalesce((select max(urutan) + 1 from public.kategori_kerja), 0));
    exception when unique_violation then
      perform public.lempar('PT409', format('Kategori "%s" sudah ada', v_nama), 'KONFLIK_001');
    end;

  elsif v_aksi = 'ganti_nama' then
    begin
      update public.kategori_kerja set nama = v_nama where id = v_id;
    exception when unique_violation then
      perform public.lempar('PT409', format('Kategori "%s" sudah ada', v_nama), 'KONFLIK_001');
    end;
    if not found then perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013'); end if;

  elsif v_aksi = 'hapus' then
    if not exists (select 1 from public.kategori_kerja where id = v_id) then
      perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013');
    end if;
    -- kosongkan dulu (bukan lewat FK on delete) supaya Riwayat tiap tugas masih bisa menyebut nama kategorinya
    update public.tasks set kategori_id = null where kategori_id = v_id;
    delete from public.kategori_kerja where id = v_id;

  elsif v_aksi = 'urut' then
    if jsonb_typeof(p -> 'ids') is distinct from 'array' then
      perform public.lempar('PT400', 'ids wajib berupa array id kategori', 'INPUT_001');
    end if;
    select coalesce(array_agg(x), '{}') into v_ids from jsonb_array_elements_text(p -> 'ids') as x;
    if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) as x)
       or (select array_agg(id order by id) from public.kategori_kerja)
          is distinct from (select array_agg(x order by x) from unnest(v_ids) as x) then
      perform public.lempar('PT409', 'Daftar kategori berubah; muat ulang halaman', 'KONFLIK_001');
    end if;
    update public.kategori_kerja k set urutan = u.n - 1
      from unnest(v_ids) with ordinality as u(id, n)
     where k.id = u.id;

  else
    perform public.lempar('PT400', 'Aksi kategori tidak dikenal', 'INPUT_001');
  end if;

  return public.web_admin_kategori();
end;
$$;

-- Admin: daftar kategori + jumlah tugas per kategori (semua tugas tidak terhapus; owner melihat semua).
create or replace function public.web_admin_kategori()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web(true);
  return (select coalesce(jsonb_agg(e || jsonb_build_object('jumlah',
                   (select count(*)::int from public.tasks t where t.kategori_id = e ->> 'id' and t.deleted_at is null))
                   order by o), '[]'::jsonb)
            from jsonb_array_elements(public.inti_kategori_kerja_daftar()) with ordinality as a(e, o));
end;
$$;

-- ============================================================ tulis tugas: kunci body `kategori` (web buat, API)
create or replace function public.web_buat_tugas(p_list text, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  perform public.mulai_web();
  v_id := public.inti_buat_tugas(p_list, public.body_web(p_body));
  perform public.inti_kategori_body(v_id, p_body);
  return public.j_baris(v_id);
end;
$$;

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
  perform public.inti_kategori_body(v_id, p_body);
  v_hasil := public.j_task(v_id, false, false);
  perform public.idem_simpan(v_kunci, v_hasil);
  return v_hasil;
end;
$$;

create or replace function public.api_update_task(p_aktor bigint, p_task text, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.inti_ubah_tugas(p_task, p_body);
  perform public.inti_kategori_body(p_task, p_body);
  return public.j_task(p_task, false, false);
end;
$$;

-- ============================================================ hak: pembantu internal; web_ → authenticated
revoke all on function
  public.tasks_kategori_sesudah(), public.inti_kategori_kerja_daftar(), public.kategori_kerja_dari(jsonb),
  public.inti_kategori_body(text, jsonb),
  public.web_kategori_kerja(), public.web_tugas_kategori(text, boolean), public.web_atur_kategori(text, text),
  public.web_admin_kategori(), public.web_admin_kategori_simpan(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.web_kategori_kerja(), public.web_tugas_kategori(text, boolean), public.web_atur_kategori(text, text),
  public.web_admin_kategori(), public.web_admin_kategori_simpan(jsonb)
to authenticated;
