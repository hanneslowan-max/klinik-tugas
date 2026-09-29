-- A1 · Fondasi 2/7: tabel, constraint, indeks. Kontrak ARSITEKTUR.md §1–§2, indeks riset rancang-kompatibilitas §2.6.
-- Nama teknis Inggris (peta 1:1 field ClickUp). Kolom teknis tambahan ditandai "(teknis)".

create sequence public.members_id_seq as bigint start with 900000000000 minvalue 1;

-- ---------------------------------------------------------------- workspace
create table public.workspace (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- members
-- id = ID user ClickUp untuk impor; anggota baru dari sequence mulai 900000000000.
create table public.members (
  id                   bigint primary key default nextval('public.members_id_seq'),
  auth_user_id         uuid unique references auth.users (id) on delete set null,
  username             text not null unique,
  email                extensions.citext unique,
  clickup_email        text,
  nama                 text,
  initials             text,
  color                text,
  role                 text not null default 'member' check (role in ('owner', 'member', 'bot')),
  aktif                boolean not null default true,
  harus_ganti_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),          -- (teknis)
  constraint members_username_isi check (length(btrim(username)) > 0)
);
alter sequence public.members_id_seq owned by public.members.id;

-- ---------------------------------------------------------------- spaces / folders / lists
create table public.spaces (
  id         text primary key default public.id_baru('rs', 8),
  name       text not null,
  private    boolean not null default false,
  archived   boolean not null default false,
  orderindex integer,
  color      text,                                                   -- (teknis)
  sumber     text not null default 'app' check (sumber in ('app', 'clickup')),
  created_at timestamptz not null default now(),
  synced_at  timestamptz,                                            -- (teknis)
  constraint spaces_id_app check (sumber <> 'app' or id ~ '^rs[0-9a-z]+$')
);

create table public.folders (
  id         text primary key default public.id_baru('rf', 8),
  space_id   text not null references public.spaces (id),
  name       text not null,
  hidden     boolean not null default false,
  archived   boolean not null default false,
  orderindex integer,
  sumber     text not null default 'app' check (sumber in ('app', 'clickup')),
  created_at timestamptz not null default now(),
  synced_at  timestamptz,
  constraint folders_id_space_uniq unique (id, space_id),
  constraint folders_id_app check (sumber <> 'app' or id ~ '^rf[0-9a-z]+$')
);
create index folders_space_idx on public.folders (space_id);

-- folder_id null = list tanpa folder ("folder-less"). Folder (bila ada) wajib di space yang sama.
create table public.lists (
  id            text primary key default public.id_baru('rl', 8),
  space_id      text not null references public.spaces (id),
  folder_id     text,
  name          text not null,
  content       text,                                                -- (teknis) deskripsi list ClickUp
  archived      boolean not null default false,
  orderindex    integer,
  tidak_ditagih boolean not null default false,
  sumber        text not null default 'app' check (sumber in ('app', 'clickup')),
  created_at    timestamptz not null default now(),
  synced_at     timestamptz,
  constraint lists_folder_fk foreign key (folder_id, space_id)
    references public.folders (id, space_id) on update cascade,
  constraint lists_id_app check (sumber <> 'app' or id ~ '^rl[0-9a-z]+$')
);
create index lists_space_idx  on public.lists (space_id);
create index lists_folder_idx on public.lists (folder_id) where folder_id is not null;

create table public.list_statuses (
  list_id           text not null references public.lists (id) on delete cascade,
  status            text not null,
  type              text not null check (type in ('open', 'custom', 'done', 'closed')),
  orderindex        integer not null default 0,
  color             text,
  clickup_status_id text,
  primary key (list_id, status),
  constraint list_statuses_isi check (length(btrim(status)) > 0)
);

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id               text primary key default public.id_baru('rt', 8),
  clickup_id       text unique,
  list_id          text not null references public.lists (id),
  parent_id        text references public.tasks (id) deferrable initially deferred,
  name             text not null,
  markdown         text,
  description_plain text,
  desc_unreadable  boolean not null default false,
  status           text not null,                 -- diisi trigger (status open pertama) bila null
  status_type      text not null check (status_type in ('open', 'custom', 'done', 'closed')), -- trigger
  priority         smallint check (priority between 1 and 4),
  due_at           timestamptz,
  due_has_time     boolean not null default false,
  due_wib          date,                          -- trigger: wib_date(due_at)
  start_at         timestamptz,
  start_has_time   boolean not null default false,
  creator_id       bigint references public.members (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  closed_at        timestamptz,
  done_at          timestamptz,
  first_closed_at  timestamptz,
  reopen_count     integer not null default 0 check (reopen_count >= 0),
  archived         boolean not null default false,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  deleted_by       bigint references public.members (id),
  orderindex       numeric,
  last_comment_at  timestamptz,
  comment_count    integer not null default 0 check (comment_count >= 0),
  extra            jsonb not null default '{}'::jsonb,
  clickup_url      text,
  sumber           text not null default 'app' check (sumber in ('app', 'clickup')),
  synced_at        timestamptz,
  clickup_hash     text,
  versi            integer not null default 1,
  cari             tsvector,
  constraint tasks_status_fk foreign key (list_id, status)
    references public.list_statuses (list_id, status) on update cascade,
  constraint tasks_parent_bukan_diri check (parent_id is null or parent_id <> id),
  constraint tasks_nama_isi check (length(btrim(name)) > 0),
  constraint tasks_id_app check (sumber <> 'app' or id ~ '^rt[0-9a-z]+$'),
  constraint tasks_clickup_id check (sumber <> 'clickup' or clickup_id is not null)
);
create index tasks_list_aktif_idx on public.tasks (list_id, status_type)
  where deleted_at is null and not archived;
create index tasks_due_terbuka_idx on public.tasks (due_wib)
  where status_type not in ('closed', 'done') and deleted_at is null;
create index tasks_updated_idx on public.tasks (updated_at);
create index tasks_parent_idx  on public.tasks (parent_id) where parent_id is not null;
create index tasks_creator_idx on public.tasks (creator_id);
create index tasks_deleted_by_idx on public.tasks (deleted_by) where deleted_by is not null;
create index tasks_cari_idx    on public.tasks using gin (cari);
create index tasks_nama_trgm_idx on public.tasks using gin (name extensions.gin_trgm_ops);

create table public.task_assignees (
  task_id   text not null references public.tasks (id) on delete cascade,
  member_id bigint not null references public.members (id),
  added_at  timestamptz not null default now(),
  added_by  bigint references public.members (id),
  primary key (task_id, member_id)
);
create index task_assignees_member_idx on public.task_assignees (member_id);
create index task_assignees_added_by_idx on public.task_assignees (added_by) where added_by is not null;

-- ---------------------------------------------------------------- comments
-- parent_id hanya ke komentar top-level di tugas yang sama (FK komposit + trigger).
create table public.comments (
  id           text primary key default public.id_baru('rc', 10),
  task_id      text not null references public.tasks (id) on delete cascade,
  parent_id    text,
  author_id    bigint references public.members (id),
  text         text not null default '',
  body_json    jsonb,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  deleted_at   timestamptz,
  deleted_by   bigint references public.members (id),                -- (teknis)
  clickup_id   text unique,
  sumber       text not null default 'app' check (sumber in ('app', 'clickup')),
  synced_at    timestamptz,                                          -- (teknis)
  clickup_hash text,                                                 -- (teknis)
  extra        jsonb not null default '{}'::jsonb,                   -- (teknis)
  constraint comments_id_task_uniq unique (id, task_id),
  constraint comments_parent_fk foreign key (parent_id, task_id)
    references public.comments (id, task_id) on delete cascade,
  constraint comments_parent_bukan_diri check (parent_id is null or parent_id <> id),
  constraint comments_id_app check (sumber <> 'app' or id ~ '^rc[0-9a-z]+$'),
  constraint comments_clickup_id check (sumber <> 'clickup' or clickup_id is not null)
);
create index comments_task_idx   on public.comments (task_id, parent_id, created_at desc);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index comments_author_idx on public.comments (author_id);
create index comments_deleted_by_idx on public.comments (deleted_by) where deleted_by is not null;

create table public.comment_mentions (
  comment_id text not null references public.comments (id) on delete cascade,
  member_id  bigint not null references public.members (id),
  primary key (comment_id, member_id)
);
create index comment_mentions_member_idx on public.comment_mentions (member_id);

-- ---------------------------------------------------------------- attachments
-- storage_path wajib di bawah t/<task_id>/ (sama dengan policy Storage).
create table public.attachments (
  id           text primary key default gen_random_uuid()::text,
  task_id      text not null references public.tasks (id) on delete cascade,
  comment_id   text,
  title        text not null default '',
  extension    text,
  mimetype     text,
  size         bigint check (size is null or size >= 0),
  storage_path text,
  clickup_url  text,
  status_salin text not null default 'ok' check (status_salin in ('ok', 'gagal', 'tautan_saja')),
  uploaded_by  bigint references public.members (id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   bigint references public.members (id),                -- (teknis)
  clickup_id   text unique,                                          -- (teknis)
  sumber       text not null default 'app' check (sumber in ('app', 'clickup')),
  synced_at    timestamptz,                                          -- (teknis)
  constraint attachments_comment_fk foreign key (comment_id, task_id)
    references public.comments (id, task_id) on delete cascade,
  constraint attachments_path_task check (storage_path is null or storage_path like 't/' || task_id || '/%'),
  constraint attachments_id_app check (sumber <> 'app' or id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint attachments_clickup_id check (sumber <> 'clickup' or clickup_id is not null)
);
create index attachments_task_idx    on public.attachments (task_id);
create index attachments_comment_idx on public.attachments (comment_id) where comment_id is not null;
create index attachments_uploaded_by_idx on public.attachments (uploaded_by) where uploaded_by is not null;

-- ---------------------------------------------------------------- activity (append-only)
-- Tanpa FK ke tasks/members: riwayat tetap ada walau tugas di-purge.
create table public.activity (
  id             bigint generated always as identity primary key,
  task_id        text,
  at             timestamptz not null default now(),
  at_awal        timestamptz,
  actor_id       bigint,
  sumber         text not null check (sumber in ('ui', 'api', 'impor', 'sinkron', 'sistem')),
  token_id       uuid,
  jenis          text not null check (jenis in (
                   'dibuat', 'status', 'buka_ulang', 'due', 'mulai', 'assignee_tambah', 'assignee_hapus',
                   'nama', 'deskripsi', 'pindah_list', 'induk', 'prioritas', 'arsip', 'pulih_arsip',
                   'hapus', 'pulih', 'komentar', 'komentar_edit', 'komentar_hapus',
                   'lampiran_tambah', 'lampiran_hapus', 'hilang_di_clickup', 'ditutup_impor')),
  dari           jsonb,
  ke             jsonb,
  aktor_assignee boolean,
  snapshot       jsonb,
  lengkap        boolean not null default true,
  catatan        text,
  dicatat_pada   timestamptz not null default now()                  -- (teknis) jam server saat dicatat
);
create index activity_task_idx on public.activity (task_id, at);
create index activity_at_idx   on public.activity (at);

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references public.members (id),
  task_id    text references public.tasks (id) on delete cascade,
  comment_id text references public.comments (id) on delete cascade,
  jenis      text not null check (jenis in ('assign', 'mention', 'komentar')),
  actor_id   bigint references public.members (id),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_belum_idx  on public.notifications (member_id) where read_at is null;
create index notifications_task_idx   on public.notifications (task_id);
create index notifications_actor_idx  on public.notifications (actor_id) where actor_id is not null;
-- Satu notifikasi per (anggota, komentar): mention menimpa 'komentar' (tanpa dobel).
create unique index notifications_komentar_uniq on public.notifications (member_id, comment_id)
  where comment_id is not null;

-- ---------------------------------------------------------------- api_tokens
create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  member_id    bigint not null references public.members (id),
  nama         text not null,
  prefix       text not null,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scope        text not null check (scope in ('baca', 'tulis', 'impor')),
  created_at   timestamptz not null default now(),
  created_by   bigint references public.members (id),                -- (teknis)
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_member_idx on public.api_tokens (member_id);
create index api_tokens_created_by_idx on public.api_tokens (created_by) where created_by is not null;

-- ---------------------------------------------------------------- pendukung
create table public.hari_libur (
  tanggal date primary key,
  nama    text not null
);

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),                     -- (teknis)
  constraint app_settings_mode_valid check (key <> 'mode' or value in ('"cermin"'::jsonb, '"utama"'::jsonb))
);

create table public.sync_runs (
  id          bigint generated always as identity primary key,
  mode        text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  counts      jsonb,
  census      jsonb,
  diffs       jsonb,
  errors      jsonb
);

create table public.sync_raw (
  entity     text not null,
  id         text not null,
  fetched_at timestamptz not null default now(),
  hash       text,
  payload    jsonb,
  primary key (entity, id)
);

create table public.idem (
  key        text primary key,
  hasil      jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS ON semua tabel
alter table public.workspace        enable row level security;
alter table public.members          enable row level security;
alter table public.spaces           enable row level security;
alter table public.folders          enable row level security;
alter table public.lists            enable row level security;
alter table public.list_statuses    enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_assignees   enable row level security;
alter table public.comments         enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.attachments      enable row level security;
alter table public.activity         enable row level security;
alter table public.notifications    enable row level security;
alter table public.api_tokens       enable row level security;
alter table public.hari_libur       enable row level security;
alter table public.app_settings     enable row level security;
alter table public.sync_runs        enable row level security;
alter table public.sync_raw         enable row level security;
alter table public.idem             enable row level security;
