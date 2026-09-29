-- A2 · 5/6: fungsi web (authenticated). Kontrak ARSITEKTUR.md §7. Semua cek is_member() (admin: is_owner())
-- lewat mulai_web(); sumber 'ui'. Baca biasa tetap boleh langsung select tabel (RLS); fungsi ini = agregat.
-- (review R2) baca/tulis mengikuti privasi space (space_terlihat/list_terlihat/tugas_terlihat) → 404 bila tertutup.
-- (review R5) kategori due memakai kategori_due(): BERSYARAT/CADANGAN/DITUNDA dan list tidak ditagih bukan telat.

-- ================================================================ baca
-- Profil sesi. Tidak melempar untuk non-anggota (member = null) supaya UI bisa menampilkan pesan.
create or replace function public.web_saya()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members;
begin
  if (select auth.uid()) is null then
    perform public.lempar('PT401', 'Sesi tidak sah, silakan masuk lagi', 'OAUTH_019');
  end if;
  select * into m from public.members where auth_user_id = (select auth.uid());
  return jsonb_build_object(
    'member', case when m.id is null then null else jsonb_build_object(
                'id', m.id, 'username', m.username, 'nama', m.nama, 'email', m.email, 'initials', m.initials,
                'color', m.color, 'role', m.role, 'aktif', m.aktif, 'harus_ganti_password', m.harus_ganti_password) end,
    'anggota_aktif', public.is_member(),
    'owner', public.is_owner(),
    'mode', public.mode_app(),
    'app_base_url', public.app_url(),
    'hari_ini', public.hari_ini_wib(),
    'notif_belum', case when public.is_member() then
                     (select count(*)::int from public.notifications n where n.member_id = m.id and n.read_at is null)
                   else 0 end);
end;
$$;

-- Space → folder → list (+ status + hitungan). Termasuk yang diarsip (UI menyaring).
create or replace function public.web_struktur()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hari  date := public.hari_ini_wib();
  v_tutup text[];
begin
  perform public.mulai_web();
  v_tutup := public.list_tertutup();
  return jsonb_build_object('hari_ini', v_hari, 'spaces', (
    with lj as (
      select l.id, l.space_id, l.folder_id, l.orderindex, l.name,
             jsonb_build_object(
               'id', l.id, 'name', l.name, 'archived', l.archived, 'tidak_ditagih', l.tidak_ditagih, 'sumber', l.sumber,
               'orderindex', l.orderindex, 'folder_id', l.folder_id,
               'statuses', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'type', s.type,
                                   'color', s.color, 'orderindex', s.orderindex) order by s.orderindex, s.status), '[]'::jsonb)
                              from public.list_statuses s where s.list_id = l.id),
               -- telat = kategori_due 'telat' (tanpa BERSYARAT/CADANGAN/DITUNDA; list tidak ditagih = 0)
               'hitungan', (select jsonb_build_object(
                                'terbuka', count(*) filter (where t.status_type not in ('closed', 'done') and not t.archived),
                                'selesai', count(*) filter (where t.status_type in ('closed', 'done') and not t.archived),
                                'telat', count(*) filter (where t.status_type not in ('closed', 'done') and not t.archived
                                                            and t.due_wib < v_hari and not l.tidak_ditagih
                                                            and not public.menunggu_keputusan(t.name)),
                                'menunggu', count(*) filter (where t.status_type not in ('closed', 'done') and not t.archived
                                                               and not l.tidak_ditagih and public.menunggu_keputusan(t.name)),
                                'arsip', count(*) filter (where t.archived))
                              from public.tasks t where t.list_id = l.id and t.deleted_at is null)) as j
        from public.lists l
       where not (l.id = any (v_tutup)))
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'name', s.name, 'private', s.private, 'archived', s.archived, 'sumber', s.sumber,
             'orderindex', s.orderindex,
             'anggota', (select coalesce(jsonb_agg(sa.member_id order by sa.member_id), '[]'::jsonb)
                           from public.space_anggota sa where sa.space_id = s.id),
             'folders', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'id', f.id, 'name', f.name, 'hidden', f.hidden, 'archived', f.archived,
                                  'sumber', f.sumber, 'orderindex', f.orderindex,
                                  'lists', (select coalesce(jsonb_agg(lj.j order by lj.orderindex nulls last, lj.name, lj.id), '[]'::jsonb)
                                              from lj where lj.folder_id = f.id))
                                  order by f.orderindex nulls last, f.name, f.id), '[]'::jsonb)
                           from public.folders f where f.space_id = s.id),
             'lists', (select coalesce(jsonb_agg(lj.j order by lj.orderindex nulls last, lj.name, lj.id), '[]'::jsonb)
                         from lj where lj.space_id = s.id and lj.folder_id is null))
             order by s.orderindex nulls last, s.name, s.id), '[]'::jsonb)
      from public.spaces s
     where public.space_terlihat(s.id)));
end;
$$;

-- (perbaikan P5) kartu di list/folder/space yang diarsip tidak ikut (list_diarsip()).
-- Tugas Saya: kartu terbuka milik anggota (default diri sendiri), dikelompokkan Telat (hari kalender, paling lama
-- di atas) · Hari ini · ≤3 hari kerja (sisa_hk) · Nanti · Tanpa due · (review R5) Menunggu keputusan (nama
-- BERSYARAT/CADANGAN/DITUNDA) · Tidak ditagih (list tidak ditagih). Dua grup terakhir TIDAK pernah masuk Telat
-- (pagar B10, sama dengan tenggat_hitung); lewat_hari diisi bila sudah lewat due (info), selain itu null.
-- (review R2) hanya kartu yang terlihat oleh PEMANGGIL (privasi space).
create or replace function public.web_tugas_saya(p_member bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     bigint;
  v_hari  date := public.hari_ini_wib();
  v_tutup text[];
  v_arsip text[];
begin
  v_m := coalesce(p_member, public.mulai_web());
  if p_member is not null then
    perform public.mulai_web();
    if not exists (select 1 from public.members where id = p_member) then
      perform public.lempar('PT404', 'Anggota tidak ditemukan', 'ITEM_013');
    end if;
  end if;
  v_tutup := public.tugas_tertutup();
  v_arsip := public.list_diarsip();                     -- (perbaikan P5) list/folder/space diarsip
  return (
    with k as (
      select t.id, t.due_wib, t.name,
             public.kategori_due(false, t.due_wib, t.name, l.tidak_ditagih, v_hari) as grup
        from public.tasks t
        join public.task_assignees ta on ta.task_id = t.id and ta.member_id = v_m
        join public.lists l on l.id = t.list_id
       where t.deleted_at is null and not t.archived and not l.archived
         and not (l.id = any (v_arsip))
         and t.status_type not in ('closed', 'done')
         and not (t.id = any (v_tutup)))
    select jsonb_build_object(
      'member', (select jsonb_build_object('id', m.id, 'username', m.username, 'nama', m.nama)
                   from public.members m where m.id = v_m),
      'tanggal', v_hari,
      'telat', coalesce(jsonb_agg(public.j_baris(k.id) || jsonb_build_object('lewat_hari', v_hari - k.due_wib)
                                  order by k.due_wib, k.name, k.id) filter (where k.grup = 'telat'), '[]'),
      'hari_ini', coalesce(jsonb_agg(public.j_baris(k.id) order by k.name, k.id) filter (where k.grup = 'hari_ini'), '[]'),
      'tiga_hk', coalesce(jsonb_agg(public.j_baris(k.id) || jsonb_build_object('sisa_hk', public.hari_kerja(v_hari, k.due_wib))
                                    order by k.due_wib, k.name, k.id) filter (where k.grup = 'tiga_hk'), '[]'),
      'nanti', coalesce(jsonb_agg(public.j_baris(k.id) order by k.due_wib, k.name, k.id) filter (where k.grup = 'nanti'), '[]'),
      'tanpa_due', coalesce(jsonb_agg(public.j_baris(k.id) order by k.name, k.id) filter (where k.grup = 'tanpa_due'), '[]'),
      'menunggu_keputusan', coalesce(jsonb_agg(public.j_baris(k.id)
                                  || jsonb_build_object('lewat_hari', case when k.due_wib < v_hari then v_hari - k.due_wib end)
                                  order by k.due_wib nulls last, k.name, k.id) filter (where k.grup = 'menunggu_keputusan'), '[]'),
      'tidak_ditagih', coalesce(jsonb_agg(public.j_baris(k.id)
                                  || jsonb_build_object('lewat_hari', case when k.due_wib < v_hari then v_hari - k.due_wib end)
                                  order by k.due_wib nulls last, k.name, k.id) filter (where k.grup = 'tidak_ditagih'), '[]'))
      from k);
end;
$$;

-- Isi satu list (tanpa terhapus & arsip). Urut status (orderindex list) → orderindex → terbaru dibuat.
create or replace function public.web_daftar(p_list text, p_include_closed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  if not public.list_terlihat(p_list) then
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object(
    'list', (select jsonb_build_object('id', l.id, 'name', l.name, 'space_id', l.space_id, 'folder_id', l.folder_id,
                      'archived', l.archived, 'tidak_ditagih', l.tidak_ditagih, 'sumber', l.sumber,
                      'boleh_ubah', l.sumber = 'app' or public.mode_app() <> 'cermin',
                      'statuses', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'type', s.type,
                                          'color', s.color, 'orderindex', s.orderindex) order by s.orderindex, s.status), '[]'::jsonb)
                                     from public.list_statuses s where s.list_id = l.id))
               from public.lists l where l.id = p_list),
    'tasks', (select coalesce(jsonb_agg(public.j_baris(t.id)
                        order by s.orderindex, t.orderindex nulls last, t.created_at desc, t.id), '[]'::jsonb)
                from public.tasks t
                left join public.list_statuses s on s.list_id = t.list_id and s.status = t.status
               where t.list_id = p_list and t.deleted_at is null and not t.archived
                 and (coalesce(p_include_closed, false) or t.status_type not in ('closed', 'done'))));
end;
$$;

create or replace function public.j_lampiran_web(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', a.id, 'task_id', a.task_id, 'comment_id', a.comment_id, 'title', a.title,
           'extension', a.extension, 'mimetype', a.mimetype, 'size', a.size, 'storage_path', a.storage_path,
           'clickup_url', a.clickup_url, 'status_salin', a.status_salin, 'sumber', a.sumber,
           'uploaded_by', case when a.uploaded_by is null then null
                               else jsonb_build_object('id', m.id, 'username', m.username) end,
           'created_at', public.iso_utc(a.created_at), 'deleted_at', public.iso_utc(a.deleted_at))
    from public.attachments a
    left join public.members m on m.id = a.uploaded_by
   where a.id = p_id
$$;

-- Komentar web (tanpa balasan). Komentar terhapus: teks & parts disembunyikan (dihapus=true).
create or replace function public.j_komentar_web(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id, 'task_id', c.task_id, 'parent_id', c.parent_id, 'sumber', c.sumber,
           'author', case when c.author_id is null then null else jsonb_build_object('id', m.id, 'username', m.username,
                            'nama', m.nama, 'initials', m.initials, 'color', m.color) end,
           'text', case when c.deleted_at is null then c.text end,
           'body_json', case when c.deleted_at is null then c.body_json end,
           'created_at', public.iso_utc(c.created_at), 'edited_at', public.iso_utc(c.edited_at),
           'dihapus', c.deleted_at is not null, 'deleted_at', public.iso_utc(c.deleted_at),
           'mentions', (select coalesce(jsonb_agg(cm.member_id order by cm.member_id), '[]'::jsonb)
                          from public.comment_mentions cm where cm.comment_id = c.id),
           'lampiran', (select coalesce(jsonb_agg(public.j_lampiran_web(a.id) order by a.created_at, a.id), '[]'::jsonb)
                          from public.attachments a where a.comment_id = c.id and a.deleted_at is null))
    from public.comments c
    left join public.members m on m.id = c.author_id
   where c.id = p_id
$$;

-- Detail satu layar: tugas + induk + sub-tugas + assignee (beban B5 pada due) + komentar & balasan + mention +
-- lampiran + riwayat + peringatan + izin. Tugas terhapus tetap bisa dibuka (layar Sampah).
create or replace function public.web_detail(p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t       public.tasks;
  v_ubah  boolean;
  v_tutup text[];
begin
  perform public.mulai_web();
  select * into t from public.tasks where id = p_task;
  if not found or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  v_tutup := public.tugas_tertutup();
  v_ubah := t.sumber = 'app' or public.mode_app() <> 'cermin';
  return jsonb_build_object(
    'task', public.j_baris(t.id) || jsonb_build_object(
              'markdown', t.markdown, 'description_plain', t.description_plain, 'desc_unreadable', t.desc_unreadable,
              'start_has_time', t.start_has_time, 'first_closed_at', public.iso_utc(t.first_closed_at),
              'done_at', public.iso_utc(t.done_at), 'reopen_count', t.reopen_count,
              'archived_at', public.iso_utc(t.archived_at), 'clickup_url', t.clickup_url, 'clickup_id', t.clickup_id,
              'synced_at', public.iso_utc(t.synced_at), 'extra', t.extra,
              'creator', (select jsonb_build_object('id', m.id, 'username', m.username, 'nama', m.nama)
                            from public.members m where m.id = t.creator_id),
              'deleted_by', (select jsonb_build_object('id', m.id, 'username', m.username)
                               from public.members m where m.id = t.deleted_by),
              'space', (select jsonb_build_object('id', s.id, 'name', s.name) from public.lists l
                          join public.spaces s on s.id = l.space_id where l.id = t.list_id),
              'folder', (select jsonb_build_object('id', f.id, 'name', f.name, 'hidden', f.hidden) from public.lists l
                           join public.folders f on f.id = l.folder_id where l.id = t.list_id),
              'statuses', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'type', s.type,
                                  'color', s.color, 'orderindex', s.orderindex) order by s.orderindex, s.status), '[]'::jsonb)
                             from public.list_statuses s where s.list_id = t.list_id)),
    'parent', (select jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'deleted', p.deleted_at is not null,
                                         'archived', p.archived)
                 from public.tasks p where p.id = t.parent_id and not (p.id = any (v_tutup))),
    'subtasks', (select coalesce(jsonb_agg(public.j_baris(x.id) order by x.orderindex nulls last, x.created_at, x.id), '[]'::jsonb)
                   from public.tasks x where x.parent_id = t.id and x.deleted_at is null and not (x.id = any (v_tutup))),
    'assignees', (select coalesce(jsonb_agg(jsonb_build_object(
                           'id', m.id, 'username', m.username, 'nama', m.nama, 'initials', m.initials, 'color', m.color,
                           'aktif', m.aktif, 'added_at', public.iso_utc(ta.added_at),
                           'beban', case when t.due_wib is not null then public.beban(m.id, t.due_wib) end,
                           'beban_lebih', t.due_wib is not null and public.beban(m.id, t.due_wib) > 7)
                           order by ta.added_at, m.id), '[]'::jsonb)
                    from public.task_assignees ta join public.members m on m.id = ta.member_id
                   where ta.task_id = t.id),
    'komentar', (select coalesce(jsonb_agg(public.j_komentar_web(c.id) || jsonb_build_object('balasan',
                           (select coalesce(jsonb_agg(public.j_komentar_web(r.id) order by r.created_at, r.id), '[]'::jsonb)
                              from public.comments r where r.parent_id = c.id))
                           order by c.created_at, c.id), '[]'::jsonb)
                   from public.comments c
                  where c.task_id = t.id and c.parent_id is null
                    and (c.deleted_at is null
                         or exists (select 1 from public.comments r where r.parent_id = c.id and r.deleted_at is null))),
    'lampiran', (select coalesce(jsonb_agg(public.j_lampiran_web(a.id) order by a.created_at, a.id), '[]'::jsonb)
                   from public.attachments a where a.task_id = t.id and a.deleted_at is null),
    'activity', public.riwayat_tugas(t.id),
    'peringatan', jsonb_build_object(
                    'due_akhir_pekan', t.due_wib is not null and extract(isodow from t.due_wib) >= 6,
                    'due_libur', (select h.nama from public.hari_libur h where h.tanggal = t.due_wib),
                    'beban_lebih', (select coalesce(jsonb_agg(m.username order by m.username), '[]'::jsonb)
                                      from public.task_assignees ta join public.members m on m.id = ta.member_id
                                     where ta.task_id = t.id and t.due_wib is not null
                                       and public.beban(m.id, t.due_wib) > 7)),
    'boleh', jsonb_build_object('ubah', v_ubah and t.deleted_at is null, 'hapus', public.is_owner(),
                                'cermin', t.sumber = 'clickup' and public.mode_app() = 'cermin'));
end;
$$;

create or replace function public.web_cari(p_q text, p_space text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  return jsonb_build_object('hasil', (
    select coalesce(jsonb_agg(public.j_baris(c.task_id) order by c.peringkat, t.updated_at desc, t.id), '[]'::jsonb)
      from public.cari_tugas(p_q, p_space, true, 50) c
      join public.tasks t on t.id = c.task_id));
end;
$$;

create or replace function public.web_notif(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m     bigint;
  v_tutup text[];
begin
  v_m := public.mulai_web();
  v_tutup := public.tugas_tertutup();          -- (review R2) nama & cuplikan kartu tertutup disamarkan
  return jsonb_build_object(
    'belum', (select count(*)::int from public.notifications n where n.member_id = v_m and n.read_at is null),
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
                                                              'color', a.color) end,
                        'cuplikan', case when c.deleted_at is null and not coalesce(t.id = any (v_tutup), false)
                                         then left(c.text, 120) end) as j
                        from public.notifications n
                        left join public.tasks t on t.id = n.task_id
                        left join public.members a on a.id = n.actor_id
                        left join public.comments c on c.id = n.comment_id
                       where n.member_id = v_m
                       order by n.created_at desc, n.id desc
                       limit greatest(least(coalesce(p_limit, 50), 500), 1)) x));
end;
$$;

-- Tandai dibaca (null = semua milik sendiri). Hasil {dibaca: n}.
create or replace function public.web_notif_baca(p_ids bigint[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m bigint;
  n   integer;
begin
  v_m := public.mulai_web();
  update public.notifications
     set read_at = now()
   where member_id = v_m and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return jsonb_build_object('dibaca', n);
end;
$$;

create or replace function public.web_anggota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', m.id, 'username', m.username, 'nama', m.nama, 'email', m.email, 'clickup_email', m.clickup_email,
            'initials', m.initials, 'color', m.color, 'role', m.role, 'aktif', m.aktif,
            'punya_akun', m.auth_user_id is not null, 'harus_ganti_password', m.harus_ganti_password,
            'impor_clickup', m.id < 900000000000)
            order by (not m.aktif), (m.role = 'bot'), m.username), '[]'::jsonb)
            from public.members m);
end;
$$;

create or replace function public.web_tenggat(p_tanggal date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  return public.tenggat_hitung(p_tanggal, null);
end;
$$;

-- ================================================================ tulis
-- Body web: kunci ClickUp (name, markdown_description, status, priority, due_date, assignees[], parent) atau
-- alias web (markdown, due 'YYYY-MM-DD'|null, parent_id).
create or replace function public.body_web(p_body jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_body ? 'due' and not p_body ? 'due_date'
              then (p_body - 'due') || jsonb_build_object('due_date', p_body -> 'due')
              else coalesce(p_body, '{}'::jsonb) end
$$;

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
  return public.j_baris(v_id);
end;
$$;

-- Ubah dengan cek versi optimistis: p_versi ≠ tasks.versi → PT409 KONFLIK_001.
create or replace function public.web_ubah_tugas(p_task text, p_body jsonb, p_versi integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versi integer;
begin
  perform public.mulai_web();
  select t.versi into v_versi from public.tasks t where t.id = p_task and t.deleted_at is null for update;
  if not found or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if p_versi is null then
    perform public.lempar('PT400', 'versi wajib dikirim', 'INPUT_001');
  end if;
  if v_versi <> p_versi then
    perform public.lempar('PT409', format('Tugas sudah diubah orang lain (versi %s, dikirim %s). Muat ulang.', v_versi, p_versi),
                          'KONFLIK_001');
  end if;
  perform public.inti_ubah_tugas(p_task, public.body_web(p_body));
  return public.j_baris(p_task);
end;
$$;

-- Board: ganti status (null = tetap) dan/atau urutan kartu.
create or replace function public.web_urut(p_task text, p_status text default null, p_orderindex numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
begin
  perform public.mulai_web();
  select * into t from public.tasks where id = p_task and deleted_at is null for update;
  if not found or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  update public.tasks x
     set status = case when nullif(p_status, '') is not null then public.status_cari(t.list_id, p_status) else x.status end,
         orderindex = coalesce(p_orderindex, x.orderindex)
   where x.id = p_task;
  return public.j_baris(p_task);
end;
$$;

create or replace function public.web_pindah(p_task text, p_list text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  perform public.inti_pindah(p_task, p_list);
  return public.j_baris(p_task);
end;
$$;

create or replace function public.web_arsip(p_task text, p_arsip boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  update public.tasks set archived = coalesce(p_arsip, true) where id = p_task;   -- sub-tugas ikut (trigger, R3)
  return public.j_baris(p_task);
end;
$$;

create or replace function public.web_hapus(p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  perform public.inti_hapus(p_task);
  return public.j_baris(p_task);
end;
$$;

create or replace function public.web_pulihkan(p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is not null) then
    perform public.lempar('PT404', 'Tugas tidak ada di Sampah', 'ITEM_013');
  end if;
  perform public.wajib_owner_aktor();
  update public.tasks set deleted_at = null where id = p_task;   -- sub-tugas yang ikut terhapus ikut pulih (R3)
  return public.j_baris(p_task);
end;
$$;

-- Hapus permanen tugas (harus sudah di Sampah) beserta sub-tugasnya. Objek Storage TIDAK ikut terhapus dari SQL
-- (trigger storage.protect_objects_delete); path dikembalikan untuk dibersihkan lewat Storage API.
-- (review R3) Ditolak (409) bila masih ada turunan yang aktif (tidak di Sampah): purge tidak boleh menghapus
-- permanen kartu yang masih terlihat aktif. Normalnya turunan sudah ikut ke Sampah bersama induknya.
create or replace function public.web_purge(p_task text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids   text[];
  v_paths text[];
begin
  perform public.mulai_web();
  if not exists (select 1 from public.tasks where id = p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  perform public.wajib_owner_aktor();
  if exists (select 1 from public.tasks where id = p_task and deleted_at is null) then
    perform public.lempar('PT400', 'Pindahkan tugas ke Sampah dulu sebelum hapus permanen', 'INPUT_001');
  end if;
  with recursive turun as (
    select x.id, 0 as d from public.tasks x where x.id = p_task
    union all
    select x.id, tu.d + 1 from public.tasks x join turun tu on x.parent_id = tu.id where tu.d < 50)
  select array_agg(id) into v_ids from turun;
  if exists (select 1 from public.tasks x where x.id = any (v_ids) and x.deleted_at is null) then
    perform public.lempar('PT409',
      format('Masih ada sub-tugas aktif di bawah tugas ini (%s); hapus atau pindahkan dulu',
             (select string_agg(x.id, ', ' order by x.id) from public.tasks x where x.id = any (v_ids) and x.deleted_at is null)),
      'KONFLIK_001');
  end if;
  select coalesce(array_agg(a.storage_path order by a.storage_path), '{}') into v_paths
    from public.attachments a where a.task_id = any (v_ids) and a.storage_path is not null;
  delete from public.tasks where id = any (v_ids);
  return jsonb_build_object('purged', to_jsonb(v_ids), 'storage_paths', to_jsonb(v_paths));
end;
$$;

-- Komentar/balasan. p_mentions dari autocomplete (null → deteksi '@username' persis di teks).
create or replace function public.web_komentar(p_task text, p_teks text, p_parent text default null,
                                               p_mentions bigint[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  perform public.mulai_web();
  v_id := public.inti_komentar(p_task, nullif(p_parent, ''), p_teks, p_mentions);
  return public.j_komentar_web(v_id);
end;
$$;

-- Edit komentar (hanya penulis — ditegakkan trigger). Mention baru ikut dicatat (+ notifikasi).
create or replace function public.web_komentar_edit(p_comment text, p_teks text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts jsonb;
  v_ids   bigint[];
begin
  perform public.mulai_web();
  if not exists (select 1 from public.comments c where c.id = p_comment and c.deleted_at is null
                  and public.tugas_terlihat(c.task_id)) then
    perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
  end if;
  if btrim(coalesce(p_teks, '')) = '' then
    perform public.lempar('PT400', 'Teks komentar wajib diisi', 'INPUT_001');
  end if;
  select k.parts, k.mentions into v_parts, v_ids from public.komentar_parts(p_teks, null) k;
  update public.comments set text = p_teks, body_json = v_parts where id = p_comment;
  insert into public.comment_mentions (comment_id, member_id)
  select p_comment, x from unnest(v_ids) u(x)
  on conflict do nothing;
  return public.j_komentar_web(p_comment);
end;
$$;

-- Hapus lunak komentar (penulis atau owner — ditegakkan trigger).
create or replace function public.web_komentar_hapus(p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  if not exists (select 1 from public.comments c where c.id = p_comment and c.deleted_at is null
                  and public.tugas_terlihat(c.task_id)) then
    perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
  end if;
  update public.comments set deleted_at = now() where id = p_comment;
  return public.j_komentar_web(p_comment);
end;
$$;

-- Catat lampiran setelah berkas diunggah ke Storage (bucket lampiran, path t/<task_id>/<nama>).
-- MIME & ukuran diambil dari metadata objek Storage bila ada (p_mime/p_size hanya cadangan).
create or replace function public.web_lampiran_catat(p_task text, p_comment text, p_path text, p_title text,
                                                     p_mime text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta  jsonb;
  v_mime  text;
  v_size  bigint;
  v_title text;
  v_id    text;
  v_izin  text[];
begin
  perform public.mulai_web();
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if public.lampiran_task_dari_path(p_path) is distinct from p_task then
    perform public.lempar('PT400', format('Path lampiran wajib t/%s/<nama>', p_task), 'INPUT_001');
  end if;
  select a.id into v_id from public.attachments a where a.storage_path = p_path and a.deleted_at is null limit 1;
  if v_id is not null then
    return public.j_lampiran_web(v_id);                 -- sudah tercatat (idempoten)
  end if;
  select o.metadata into v_meta from storage.objects o where o.bucket_id = 'lampiran' and o.name = p_path;
  if not found then
    perform public.lempar('PT400', 'Berkas belum terunggah ke Storage', 'INPUT_001');
  end if;
  v_mime := coalesce(v_meta ->> 'mimetype', p_mime);
  v_size := coalesce(nullif(v_meta ->> 'size', '')::bigint, p_size);
  select b.allowed_mime_types into v_izin from storage.buckets b where b.id = 'lampiran';
  if v_mime is null or (v_izin is not null and not (v_mime = any (v_izin))) then
    perform public.lempar('PT400', format('Tipe berkas tidak diizinkan: %s', coalesce(v_mime, '(kosong)')), 'INPUT_001');
  end if;
  if v_size is not null and v_size > 26214400 then
    perform public.lempar('PT400', 'Berkas melebihi 25 MB', 'INPUT_001');
  end if;
  if nullif(p_comment, '') is not null
     and not exists (select 1 from public.comments c where c.id = p_comment and c.task_id = p_task and c.deleted_at is null) then
    perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), regexp_replace(p_path, '^.*/', ''));
  insert into public.attachments (task_id, comment_id, title, extension, mimetype, size, storage_path, status_salin)
  values (p_task, nullif(p_comment, ''), v_title, lower(substring(v_title from '\.([A-Za-z0-9]+)$')), v_mime, v_size,
          p_path, 'ok')
  returning id into v_id;
  return public.j_lampiran_web(v_id);
end;
$$;

-- Hapus lunak lampiran: pengunggah atau owner.
create or replace function public.web_lampiran_hapus(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attachments;
begin
  perform public.mulai_web();
  select * into a from public.attachments where id = p_id and deleted_at is null;
  if not found or not public.tugas_terlihat(a.task_id) then
    perform public.lempar('PT404', 'Lampiran tidak ditemukan', 'ITEM_013');
  end if;
  if a.uploaded_by is distinct from public.aktor() and not public.is_owner() then
    perform public.lempar('PT403', 'Hanya pengunggah atau owner yang boleh menghapus lampiran', 'ACCESS_001');
  end if;
  update public.attachments set deleted_at = now() where id = p_id;
  return public.j_lampiran_web(p_id);
end;
$$;

create or replace function public.web_sudah_ganti_password()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m bigint;
begin
  v_m := public.mulai_web();
  update public.members set harus_ganti_password = false where id = v_m;
  return jsonb_build_object('harus_ganti_password', false);
end;
$$;

-- ================================================================ admin (owner)
-- Buat/ubah anggota. Kunci: id (kosong = baru), username, nama, email, clickup_email, initials, color, role, aktif.
-- Username anggota impor ClickUp (id < 900000000000) dikunci. Owner tidak bisa menurunkan/menonaktifkan diri
-- sendiri; minimal 1 owner aktif tersisa.
create or replace function public.web_admin_anggota_simpan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saya bigint;
  m      public.members;
  v_id   bigint;
  v_role text;
  v_aktif boolean;
  v_user text;
begin
  v_saya := public.mulai_web(true);
  if p is null or jsonb_typeof(p) <> 'object' then
    perform public.lempar('PT400', 'Data anggota harus objek JSON', 'INPUT_001');
  end if;
  if p ? 'role' and coalesce(p ->> 'role', '') not in ('owner', 'member', 'bot') then
    perform public.lempar('PT400', 'role harus owner, member, atau bot', 'INPUT_001');
  end if;
  begin
    if nullif(p ->> 'id', '') is null then
      v_user := btrim(coalesce(p ->> 'username', ''));
      if v_user = '' then
        perform public.lempar('PT400', 'username wajib diisi', 'INPUT_001');
      end if;
      insert into public.members (username, nama, email, clickup_email, initials, color, role, aktif)
      values (v_user, coalesce(nullif(btrim(p ->> 'nama'), ''), v_user), nullif(btrim(p ->> 'email'), ''),
              nullif(btrim(p ->> 'clickup_email'), ''),
              coalesce(nullif(p ->> 'initials', ''), upper(left(regexp_replace(v_user, '[^[:alnum:] ]', '', 'g'), 2))),
              coalesce(nullif(p ->> 'color', ''), '#7b68ee'), coalesce(p ->> 'role', 'member'),
              coalesce(public.bool_dari(p -> 'aktif'), true))
      returning id into v_id;
    else
      v_id := (p ->> 'id')::bigint;
      select * into m from public.members where id = v_id for update;
      if not found then
        perform public.lempar('PT404', 'Anggota tidak ditemukan', 'ITEM_013');
      end if;
      v_user := case when p ? 'username' then btrim(p ->> 'username') else m.username end;
      if v_user is distinct from m.username and m.id < 900000000000 then
        perform public.lempar('PT400', 'Username anggota impor ClickUp dikunci (dipakai routine)', 'INPUT_001');
      end if;
      if coalesce(v_user, '') = '' then
        perform public.lempar('PT400', 'username wajib diisi', 'INPUT_001');
      end if;
      v_role := coalesce(p ->> 'role', m.role);
      v_aktif := coalesce(public.bool_dari(p -> 'aktif'), m.aktif);
      if v_id = v_saya and (v_role <> 'owner' or not v_aktif) then
        perform public.lempar('PT400', 'Owner tidak bisa menurunkan atau menonaktifkan dirinya sendiri', 'INPUT_001');
      end if;
      if m.role = 'owner' and m.aktif and (v_role <> 'owner' or not v_aktif)
         and not exists (select 1 from public.members x where x.id <> v_id and x.role = 'owner' and x.aktif) then
        perform public.lempar('PT400', 'Minimal harus ada satu owner aktif', 'INPUT_001');
      end if;
      if v_role = 'bot' and m.auth_user_id is not null then
        perform public.lempar('PT400', 'Anggota dengan akun login tidak bisa dijadikan bot', 'INPUT_001');
      end if;
      update public.members set
        username = v_user,
        nama = case when p ? 'nama' then nullif(btrim(p ->> 'nama'), '') else nama end,
        email = case when p ? 'email' then nullif(btrim(p ->> 'email'), '') else email end,
        clickup_email = case when p ? 'clickup_email' then nullif(btrim(p ->> 'clickup_email'), '') else clickup_email end,
        initials = case when p ? 'initials' then nullif(p ->> 'initials', '') else initials end,
        color = case when p ? 'color' then nullif(p ->> 'color', '') else color end,
        role = v_role, aktif = v_aktif
      where id = v_id;
    end if;
  exception when unique_violation then
    perform public.lempar('PT409', 'Username atau email sudah dipakai anggota lain', 'KONFLIK_001');
  end;
  return (select jsonb_build_object('id', x.id, 'username', x.username, 'nama', x.nama, 'email', x.email,
                   'clickup_email', x.clickup_email, 'initials', x.initials, 'color', x.color, 'role', x.role,
                   'aktif', x.aktif, 'punya_akun', x.auth_user_id is not null,
                   'harus_ganti_password', x.harus_ganti_password)
            from public.members x where x.id = v_id);
end;
$$;

-- Ganti seluruh status list: [{status, type, color, orderindex, nama_lama?}]. nama_lama = ganti nama (tugas ikut).
-- Wajib ≥1 open & ≥1 closed. Status yang dibuang tapi masih dipakai tugas → PT409.
-- (perbaikan P4) Nama status yang DIBUAT atau DIUBAH lewat Admin dinormalkan: trim + huruf kecil. Status lama yang
-- dikirim dengan nama persis sama (tanpa nama_lama, atau nama_lama = nama) dipertahankan verbatim, supaya status
-- impor ClickUp (mis. "BACKLOG", "Closed") tidak berubah (paritas ClickUp). Nama ganda tanpa beda huruf besar
-- (sesudah normalisasi) → PT400.
create or replace function public.web_admin_status_simpan(p_list text, p_statuses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e       jsonb;
  i       integer := 0;
  v_rows  jsonb := '[]'::jsonb;         -- elemen + kunci "_nama" (nama akhir)
  v_nama  text[] := '{}'::text[];
  v_in    text;
  v_lama  text;
  v_akhir text;
  v_pakai integer;
  d       record;
begin
  perform public.mulai_web(true);
  if not exists (select 1 from public.lists where id = p_list) then
    perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013');
  end if;
  if p_statuses is null or jsonb_typeof(p_statuses) <> 'array' or jsonb_array_length(p_statuses) = 0 then
    perform public.lempar('PT400', 'Daftar status wajib array tidak kosong', 'INPUT_001');
  end if;
  for e in select x from jsonb_array_elements(p_statuses) a(x) loop
    if jsonb_typeof(e) <> 'object' or nullif(btrim(e ->> 'status'), '') is null
       or coalesce(e ->> 'type', '') not in ('open', 'custom', 'done', 'closed') then
      perform public.lempar('PT400', 'Tiap status wajib punya nama dan type open/custom/done/closed', 'INPUT_001');
    end if;
    v_in := btrim(e ->> 'status');
    v_lama := nullif(e ->> 'nama_lama', '');
    if (v_lama is null or v_lama = v_in)
       and exists (select 1 from public.list_statuses s where s.list_id = p_list and s.status = v_in) then
      v_akhir := v_in;                    -- status lama, tidak diubah → verbatim
    else
      v_akhir := lower(v_in);             -- status baru / ganti nama → normal
    end if;
    if lower(v_akhir) = any (select lower(x) from unnest(v_nama) x) then
      perform public.lempar('PT400', format('Nama status ganda (tanpa beda huruf besar): %s', v_akhir), 'INPUT_001');
    end if;
    v_nama := v_nama || v_akhir;
    v_rows := v_rows || jsonb_build_array(e || jsonb_build_object('_nama', v_akhir));
  end loop;
  if not exists (select 1 from jsonb_array_elements(p_statuses) a(x) where x ->> 'type' = 'open')
     or not exists (select 1 from jsonb_array_elements(p_statuses) a(x) where x ->> 'type' = 'closed') then
    perform public.lempar('PT400', 'List wajib punya minimal 1 status open dan 1 status closed', 'INPUT_001');
  end if;

  -- ganti nama dulu (FK ON UPDATE CASCADE memindahkan tugas ke nama baru)
  for e in select x from jsonb_array_elements(v_rows) a(x)
            where nullif(x ->> 'nama_lama', '') is not null and x ->> 'nama_lama' <> x ->> '_nama' loop
    if not exists (select 1 from public.list_statuses s where s.list_id = p_list and s.status = e ->> 'nama_lama') then
      continue;                           -- nama lama tidak ada → diperlakukan sebagai status baru di bawah
    end if;
    if exists (select 1 from public.list_statuses s where s.list_id = p_list and s.status = e ->> '_nama') then
      perform public.lempar('PT400', format('Status "%s" sudah ada', e ->> '_nama'), 'INPUT_001');
    end if;
    update public.list_statuses set status = e ->> '_nama'
     where list_id = p_list and status = e ->> 'nama_lama';
  end loop;

  for e in select x from jsonb_array_elements(v_rows) a(x) loop
    insert into public.list_statuses (list_id, status, type, orderindex, color)
    values (p_list, e ->> '_nama', e ->> 'type', coalesce(nullif(e ->> 'orderindex', '')::numeric::integer, i),
            coalesce(nullif(e ->> 'color', ''), '#d3d3d3'))
    on conflict (list_id, status) do update
      set type = excluded.type, orderindex = excluded.orderindex, color = excluded.color
      where (public.list_statuses.type, public.list_statuses.orderindex, public.list_statuses.color)
            is distinct from (excluded.type, excluded.orderindex, excluded.color);
    i := i + 1;
  end loop;

  for d in select s.status from public.list_statuses s
            where s.list_id = p_list and not (s.status = any (v_nama)) loop
    select count(*) into v_pakai from public.tasks t where t.list_id = p_list and t.status = d.status;
    if v_pakai > 0 then
      perform public.lempar('PT409', format('Status "%s" masih dipakai %s tugas; pindahkan dulu', d.status, v_pakai),
                            'KONFLIK_001');
    end if;
    delete from public.list_statuses where list_id = p_list and status = d.status;
  end loop;
  if not public.status_list_valid(p_list) then
    perform public.lempar('PT400', 'List wajib punya minimal 1 status open dan 1 status closed', 'INPUT_001');
  end if;
  return jsonb_build_object('list_id', p_list, 'statuses', public.j_list_statuses(p_list));
end;
$$;

-- Buat/ubah struktur: {jenis:'space'|'folder'|'list', id?, name, space_id, folder_id, private, hidden, archived,
-- orderindex, tidak_ditagih, content, anggota}. Tanpa hapus (arsipkan saja).
-- (review R2) space: `anggota` = [member_id] himpunan penuh anggota space (dipakai bila private). Baris baru
-- bersumber 'app' (tidak ditimpa impor); anggota ClickUp yang dibuang akan dikembalikan impor berikutnya selama
-- masih anggota space di ClickUp. Boleh diubah saat cermin (ACL aplikasi, bukan data ClickUp).
create or replace function public.web_admin_struktur_simpan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jenis text := p ->> 'jenis';
  v_id    text := nullif(p ->> 'id', '');
  v_nama  text := nullif(btrim(p ->> 'name'), '');
  v_space text;
  v_hasil jsonb;
  v_ids   bigint[];
  v_salah bigint;
begin
  perform public.mulai_web(true);
  if v_jenis not in ('space', 'folder', 'list') then
    perform public.lempar('PT400', 'jenis harus space, folder, atau list', 'INPUT_001');
  end if;
  if v_id is null and v_nama is null then
    perform public.lempar('PT400', 'name wajib untuk struktur baru', 'INPUT_001');
  end if;
  if p ? 'name' and v_nama is null then
    perform public.lempar('PT400', 'name tidak boleh kosong', 'INPUT_001');
  end if;

  if v_jenis = 'space' then
    if v_id is null then
      insert into public.spaces (name, private, orderindex)
      values (v_nama, coalesce(public.bool_dari(p -> 'private'), false),
              coalesce(nullif(p ->> 'orderindex', '')::integer, (select coalesce(max(orderindex), 0) + 1 from public.spaces)))
      returning id into v_id;
    else
      update public.spaces set
        name = coalesce(v_nama, name),
        private = coalesce(public.bool_dari(p -> 'private'), private),
        archived = coalesce(public.bool_dari(p -> 'archived'), archived),
        orderindex = case when p ? 'orderindex' then nullif(p ->> 'orderindex', '')::integer else orderindex end
      where id = v_id;
      if not found then perform public.lempar('PT404', 'Space tidak ditemukan', 'ITEM_013'); end if;
    end if;
    if p ? 'anggota' then
      v_ids := public.ids_dari(p -> 'anggota');
      select x into v_salah from unnest(v_ids) u(x) where not exists (select 1 from public.members m where m.id = u.x) limit 1;
      if v_salah is not null then
        perform public.lempar('PT400', format('Anggota tidak dikenal: %s', v_salah), 'INPUT_001');
      end if;
      delete from public.space_anggota sa where sa.space_id = v_id and not (sa.member_id = any (v_ids));
      insert into public.space_anggota (space_id, member_id, sumber)
      select v_id, x, 'app' from unnest(v_ids) u(x)
      on conflict (space_id, member_id) do nothing;
    end if;
    select to_jsonb(s) || jsonb_build_object('anggota',
             (select coalesce(jsonb_agg(jsonb_build_object('id', sa.member_id, 'sumber', sa.sumber) order by sa.member_id), '[]'::jsonb)
                from public.space_anggota sa where sa.space_id = s.id))
      into v_hasil from public.spaces s where s.id = v_id;
  elsif v_jenis = 'folder' then
    if v_id is null then
      v_space := p ->> 'space_id';
      if not exists (select 1 from public.spaces where id = v_space) then
        perform public.lempar('PT404', 'Space tidak ditemukan', 'ITEM_013');
      end if;
      insert into public.folders (space_id, name, hidden, orderindex)
      values (v_space, v_nama, coalesce(public.bool_dari(p -> 'hidden'), false),
              coalesce(nullif(p ->> 'orderindex', '')::integer,
                       (select coalesce(max(orderindex), 0) + 1 from public.folders where space_id = v_space)))
      returning id into v_id;
    else
      update public.folders set
        name = coalesce(v_nama, name),
        hidden = coalesce(public.bool_dari(p -> 'hidden'), hidden),
        archived = coalesce(public.bool_dari(p -> 'archived'), archived),
        orderindex = case when p ? 'orderindex' then nullif(p ->> 'orderindex', '')::integer else orderindex end
      where id = v_id;
      if not found then perform public.lempar('PT404', 'Folder tidak ditemukan', 'ITEM_013'); end if;
    end if;
    select to_jsonb(f) into v_hasil from public.folders f where f.id = v_id;
  else
    if v_id is null then
      v_space := coalesce(p ->> 'space_id', (select f.space_id from public.folders f where f.id = p ->> 'folder_id'));
      if not exists (select 1 from public.spaces where id = v_space) then
        perform public.lempar('PT404', 'Space tidak ditemukan', 'ITEM_013');
      end if;
      if nullif(p ->> 'folder_id', '') is not null
         and not exists (select 1 from public.folders where id = p ->> 'folder_id' and space_id = v_space) then
        perform public.lempar('PT400', 'Folder tidak ada di space itu', 'INPUT_001');
      end if;
      insert into public.lists (space_id, folder_id, name, content, orderindex, tidak_ditagih)
      values (v_space, nullif(p ->> 'folder_id', ''), v_nama, nullif(p ->> 'content', ''),
              coalesce(nullif(p ->> 'orderindex', '')::integer,
                       (select coalesce(max(orderindex), 0) + 1 from public.lists where space_id = v_space)),
              coalesce(public.bool_dari(p -> 'tidak_ditagih'), false))
      returning id into v_id;
    else
      if p ? 'folder_id' and nullif(p ->> 'folder_id', '') is not null
         and not exists (select 1 from public.folders f join public.lists l on l.space_id = f.space_id
                          where f.id = p ->> 'folder_id' and l.id = v_id) then
        perform public.lempar('PT400', 'Folder tidak ada di space list itu', 'INPUT_001');
      end if;
      update public.lists set
        name = coalesce(v_nama, name),
        folder_id = case when p ? 'folder_id' then nullif(p ->> 'folder_id', '') else folder_id end,
        content = case when p ? 'content' then nullif(p ->> 'content', '') else content end,
        archived = coalesce(public.bool_dari(p -> 'archived'), archived),
        tidak_ditagih = coalesce(public.bool_dari(p -> 'tidak_ditagih'), tidak_ditagih),
        orderindex = case when p ? 'orderindex' then nullif(p ->> 'orderindex', '')::integer else orderindex end
      where id = v_id;
      if not found then perform public.lempar('PT404', 'List tidak ditemukan', 'ITEM_013'); end if;
    end if;
    select to_jsonb(l) || jsonb_build_object('statuses', public.j_list_statuses(l.id))
      into v_hasil from public.lists l where l.id = v_id;
  end if;
  return jsonb_build_object('jenis', v_jenis) || v_hasil;
end;
$$;

-- Hari libur: {tanggal, nama} / {tanggal, hapus:true} atau array-nya. Hasil: semua hari libur terurut.
create or replace function public.web_admin_libur_simpan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_tgl date;
begin
  perform public.mulai_web(true);
  if p is null or jsonb_typeof(p) not in ('object', 'array') then
    perform public.lempar('PT400', 'Data hari libur harus objek atau array', 'INPUT_001');
  end if;
  for e in select x from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else jsonb_build_array(p) end) a(x) loop
    begin
      v_tgl := (e ->> 'tanggal')::date;
    exception when others then
      perform public.lempar('PT400', format('Tanggal tidak valid: %s', e ->> 'tanggal'), 'INPUT_001');
    end;
    if v_tgl is null then
      perform public.lempar('PT400', 'tanggal wajib', 'INPUT_001');
    end if;
    if coalesce(public.bool_dari(e -> 'hapus'), false) then
      delete from public.hari_libur where tanggal = v_tgl;
    else
      if nullif(btrim(e ->> 'nama'), '') is null then
        perform public.lempar('PT400', 'nama hari libur wajib', 'INPUT_001');
      end if;
      insert into public.hari_libur (tanggal, nama) values (v_tgl, btrim(e ->> 'nama'))
      on conflict (tanggal) do update set nama = excluded.nama;
    end if;
  end loop;
  return (select coalesce(jsonb_agg(jsonb_build_object('tanggal', h.tanggal, 'nama', h.nama) order by h.tanggal), '[]'::jsonb)
            from public.hari_libur h);
end;
$$;

create or replace function public.web_admin_mode(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web(true);
  if coalesce(p_mode, '') not in ('cermin', 'utama') then
    perform public.lempar('PT400', 'mode harus cermin atau utama', 'INPUT_001');
  end if;
  insert into public.app_settings (key, value) values ('mode', to_jsonb(p_mode))
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('mode', public.mode_app());
end;
$$;

-- Token API: 'rtk_' + 40 karakter base62 dari gen_random_bytes (tanpa bias modulo). Disimpan sha256 hex.
-- Token mentah dikembalikan SEKALI ini saja.
create or replace function public.web_admin_token_buat(p_member bigint, p_nama text, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saya  bigint;
  abjad   constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  v_acak  bytea;
  v_b     integer;
  v_isi   text := '';
  v_token text;
  k       public.api_tokens;
begin
  v_saya := public.mulai_web(true);
  if not exists (select 1 from public.members where id = p_member and aktif) then
    perform public.lempar('PT400', 'Anggota token tidak dikenal atau nonaktif', 'INPUT_001');
  end if;
  if coalesce(p_scope, '') not in ('baca', 'tulis', 'impor') then
    perform public.lempar('PT400', 'scope harus baca, tulis, atau impor', 'INPUT_001');
  end if;
  if nullif(btrim(p_nama), '') is null then
    perform public.lempar('PT400', 'Nama token wajib diisi', 'INPUT_001');
  end if;
  while length(v_isi) < 40 loop
    v_acak := extensions.gen_random_bytes(48);
    for i in 0 .. length(v_acak) - 1 loop
      v_b := get_byte(v_acak, i);
      continue when v_b >= 248;                        -- 248 = 4*62: buang sisa supaya sebaran rata
      v_isi := v_isi || substr(abjad, (v_b % 62) + 1, 1);
      exit when length(v_isi) >= 40;
    end loop;
  end loop;
  v_token := 'rtk_' || v_isi;
  insert into public.api_tokens (member_id, nama, prefix, token_hash, scope, created_by)
  values (p_member, btrim(p_nama), left(v_token, 8), encode(extensions.digest(v_token, 'sha256'), 'hex'), p_scope, v_saya)
  returning * into k;
  return jsonb_build_object('id', k.id, 'token', v_token, 'prefix', k.prefix, 'member_id', k.member_id, 'nama', k.nama,
                            'scope', k.scope, 'created_at', public.iso_utc(k.created_at));
end;
$$;

create or replace function public.web_admin_token_cabut(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.api_tokens;
begin
  perform public.mulai_web(true);
  update public.api_tokens set revoked_at = coalesce(revoked_at, now()) where id = p_id returning * into k;
  if k.id is null then
    perform public.lempar('PT404', 'Token tidak ditemukan', 'ITEM_013');
  end if;
  return jsonb_build_object('id', k.id, 'prefix', k.prefix, 'nama', k.nama, 'scope', k.scope,
                            'revoked_at', public.iso_utc(k.revoked_at));
end;
$$;

create or replace function public.web_admin_tokens()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web(true);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', k.id, 'nama', k.nama, 'prefix', k.prefix, 'scope', k.scope,
            'member', jsonb_build_object('id', m.id, 'username', m.username, 'role', m.role),
            'created_at', public.iso_utc(k.created_at), 'created_by', k.created_by,
            'last_used_at', public.iso_utc(k.last_used_at), 'revoked_at', public.iso_utc(k.revoked_at))
            order by k.created_at desc, k.id), '[]'::jsonb)
            from public.api_tokens k join public.members m on m.id = k.member_id);
end;
$$;

-- Laporan sinkron (layar Admin): mode + 20 run terakhir. Pemicu sinkron manual ada di luar DB (Actions).
create or replace function public.web_admin_sinkron()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web(true);
  return jsonb_build_object(
    'mode', public.mode_app(),
    'runs', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'mode', s.mode, 'started_at', public.iso_utc(s.started_at),
                'finished_at', public.iso_utc(s.finished_at), 'counts', s.counts, 'census', s.census,
                'diffs', s.diffs, 'errors', s.errors) order by s.started_at desc, s.id desc), '[]'::jsonb)
               from (select * from public.sync_runs order by started_at desc, id desc limit 20) s));
end;
$$;
