-- Notifikasi: pisahkan "Dari tim" dan "Dari agent" (revisi Hannes #2, 13 Okt 2026). Layar /notif punya 2 tab; tiap
-- tab memuat datanya sendiri (limit sendiri, supaya tab tim tidak kosong walau 100 notifikasi terbaru semuanya dari
-- agent) dan "Tandai semua dibaca" hanya untuk tab aktif. Lonceng (web_saya.notif_belum) tetap TOTAL, tidak diubah.
--
-- Aturan "agent" (satu pintu: notif_dari_agent): notifikasi berasal dari agent bila aktornya anggota role 'bot'
-- (akun "claude (agent)"), ATAU tindakan pemicunya datang lewat token API (app.sumber = 'api' — Edge /api yang dipakai
-- CLI tugas.mjs, routine, importer, agent) walau tokennya milik anggota manusia. Bot tidak bisa login web
-- (is_member() hanya owner/member), jadi tindakan bot selalu 'api'. Selain itu (anggota di web, sumber 'ui') = tim.
--
-- ADITIF & kompatibel ke belakang (web produksi, web-lama & worktree lain masih memanggil bentuk lama):
-- * kolom baru notifications.sumber ('ui' | 'api'; null = baris lama yang tak terlacak → jatuh ke aturan role) diisi
--   trigger BEFORE INSERT (trigger assign/komentar/mention A1 tidak diubah) + diisi mundur dari activity (jejak
--   transaksi yang sama: activity.at = now() = notifications.created_at, task & aktor sama).
-- * web_notif(p_limit) & web_notif_baca(p_ids) tetap bisa dipanggil seperti dulu: parameter baru p_dari opsional
--   (null = perilaku lama persis). JSON hanya bertambah: belum_tim, belum_agent, dari; per item dari, lewat_api,
--   actor.role. `belum` tetap TOTAL semua belum dibaca (= belum_tim + belum_agent).
-- * Signature berubah → fungsi lama di-DROP lalu dibuat ulang di transaksi yang sama (dua overload membuat PostgREST
--   gagal memilih fungsi, PGRST203). Hak dipasang ulang fail-closed: web_* → authenticated saja; pembantu → internal
--   (hak bawaan Supabase memberi EXECUTE ke service_role untuk fungsi baru, lihat 20261013121000).
-- Urutan deploy: terapkan migrasi ini ke produksi SEBELUM web yang memanggil p_dari di-merge (web lama di atas DB baru
-- tetap jalan; web baru di atas DB lama gagal PGRST202 di /notif).

-- ============================================================ kolom + pengisi
alter table public.notifications
  add column sumber text check (sumber in ('ui', 'api'));
comment on column public.notifications.sumber is
  'Jalur tindakan pemicu: ui (web) | api (token API: agent/CLI/routine). Null = baris lama yang tak terlacak.';

create or replace function public.notif_sebelum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := public.sumber_aktif();
begin
  new.sumber := coalesce(new.sumber, case when v in ('ui', 'api') then v end);
  return new;
end;
$$;

create trigger notifications_sebelum before insert on public.notifications
  for each row execute function public.notif_sebelum();

-- Isi mundur: activity mencatat sumber tiap tindakan; notifikasi lahir di transaksi yang sama (task, aktor, waktu
-- now() sama persis). Baris tanpa pasangan tetap null (aturan role tetap berlaku). Indeks activity_task_idx (task_id, at).
with cocok as (
  select n.id,
         (select a.sumber
            from public.activity a
           where a.task_id = n.task_id
             and a.at = n.created_at
             and a.actor_id is not distinct from n.actor_id
             and a.sumber in ('ui', 'api')
           order by a.id
           limit 1) as sumber
    from public.notifications n
   where n.sumber is null and n.task_id is not null
)
update public.notifications n
   set sumber = c.sumber
  from cocok c
 where c.id = n.id and c.sumber is not null;

-- ============================================================ aturan klasifikasi (satu pintu)
create or replace function public.notif_dari_agent(p_sumber text, p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_sumber = 'api', false) or coalesce(p_role = 'bot', false)
$$;

comment on function public.notif_dari_agent(text, text) is
  'Notifikasi dari agent: pemicunya lewat token API (sumber api) atau aktornya anggota role bot. Selain itu dari tim.';

-- ============================================================ web_notif (+ p_dari)
drop function if exists public.web_notif(integer);
create function public.web_notif(p_limit integer default 50, p_dari text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     bigint;
  v_tutup text[];
  v_dari  text := nullif(lower(btrim(coalesce(p_dari, ''))), '');
  v_semua integer;
  v_tim   integer;
  v_agent integer;
begin
  v_m := public.mulai_web();
  if v_dari is not null and v_dari not in ('tim', 'agent') then
    perform public.lempar('PT400', 'Saringan notifikasi harus "tim" atau "agent"', 'INPUT_001');
  end if;
  v_tutup := public.tugas_tertutup();          -- (review R2) nama & cuplikan kartu tertutup disamarkan
  select count(*)::int,
         count(*) filter (where not public.notif_dari_agent(n.sumber, a.role))::int,
         count(*) filter (where public.notif_dari_agent(n.sumber, a.role))::int
    into v_semua, v_tim, v_agent
    from public.notifications n
    left join public.members a on a.id = n.actor_id
   where n.member_id = v_m and n.read_at is null;
  return jsonb_build_object(
    'belum', v_semua,                          -- TOTAL (angka lonceng), sama seperti dulu
    'belum_tim', v_tim,
    'belum_agent', v_agent,
    'dari', v_dari,
    'items', (select coalesce(jsonb_agg(x.j order by x.created_at desc, x.id desc), '[]'::jsonb)
                from (select n.id, n.created_at, jsonb_build_object(
                        'id', n.id, 'jenis', n.jenis, 'created_at', public.iso_utc(n.created_at),
                        'read_at', public.iso_utc(n.read_at), 'comment_id', n.comment_id,
                        'task', case when t.id is null then null
                                     when t.id = any (v_tutup)
                                       then jsonb_build_object('id', t.id, 'name', '(kartu di space privat)',
                                                               'deleted', t.deleted_at is not null, 'tertutup', true)
                                     else jsonb_build_object('id', t.id, 'name', t.name, 'deleted', t.deleted_at is not null) end,
                        'actor', case when a.id is null then null
                                      else jsonb_build_object('id', a.id, 'username', a.username, 'initials', a.initials,
                                                              'color', a.color, 'role', a.role) end,
                        'cuplikan', case when c.deleted_at is null and not coalesce(t.id = any (v_tutup), false)
                                         then left(c.text, 120) end,
                        'dari', case when public.notif_dari_agent(n.sumber, a.role) then 'agent' else 'tim' end,
                        'lewat_api', coalesce(n.sumber = 'api', false)) as j
                        from public.notifications n
                        left join public.tasks t on t.id = n.task_id
                        left join public.members a on a.id = n.actor_id
                        left join public.comments c on c.id = n.comment_id
                       where n.member_id = v_m
                         and (v_dari is null or public.notif_dari_agent(n.sumber, a.role) = (v_dari = 'agent'))
                       order by n.created_at desc, n.id desc
                       limit greatest(least(coalesce(p_limit, 50), 500), 1)) x));
end;
$$;

-- ============================================================ web_notif_baca (+ p_dari)
-- Tandai dibaca. p_ids null = semua milik sendiri; p_dari 'tim'/'agent' = hanya kelompok itu (tab aktif); keduanya =
-- irisan. Hasil {dibaca: n}.
drop function if exists public.web_notif_baca(bigint[]);
create function public.web_notif_baca(p_ids bigint[] default null, p_dari text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m    bigint;
  v_dari text := nullif(lower(btrim(coalesce(p_dari, ''))), '');
  n      integer;
begin
  v_m := public.mulai_web();
  if v_dari is not null and v_dari not in ('tim', 'agent') then
    perform public.lempar('PT400', 'Saringan notifikasi harus "tim" atau "agent"', 'INPUT_001');
  end if;
  update public.notifications x
     set read_at = now()
   where x.member_id = v_m
     and x.read_at is null
     and (p_ids is null or x.id = any (p_ids))
     and (v_dari is null
          or public.notif_dari_agent(x.sumber, (select a.role from public.members a where a.id = x.actor_id))
             = (v_dari = 'agent'));
  get diagnostics n = row_count;
  return jsonb_build_object('dibaca', n);
end;
$$;

-- ============================================================ hak: pembantu internal; web_* → authenticated saja
revoke all on function
  public.notif_sebelum(), public.notif_dari_agent(text, text),
  public.web_notif(integer, text), public.web_notif_baca(bigint[], text)
from public, anon, authenticated, service_role;
grant execute on function public.web_notif(integer, text), public.web_notif_baca(bigint[], text) to authenticated;
