-- A1 · Fondasi 7/7: policy RLS (SELECT saja) + grant minimal. Kontrak ARSITEKTUR.md §0, §4.
-- Tidak ada policy INSERT/UPDATE/DELETE: semua tulis lewat fungsi SECURITY DEFINER (A2).
--   anon          : tidak ada grant apa pun di schema public.
--   authenticated : SELECT tabel data bila is_member() (data per space mengikuti privasi space, review R2);
--                   notifications milik sendiri; api_tokens owner (kolom tanpa token_hash); sync_raw owner;
--                   idem tidak ada.
--   service_role  : SELECT semua tabel (BYPASSRLS). Tulis hanya lewat fungsi. activity tidak bisa ditulis.

-- ---------------------------------------------------------------- policy SELECT
create policy baca_member on public.workspace        for select to authenticated using ((select public.is_member()));
create policy baca_member on public.members          for select to authenticated using ((select public.is_member()));
create policy baca_member on public.hari_libur       for select to authenticated using ((select public.is_member()));
create policy baca_member on public.app_settings     for select to authenticated using ((select public.is_member()));
create policy baca_member on public.sync_runs        for select to authenticated using ((select public.is_member()));

-- (review R2) data per space mengikuti privasi space (pembantu di 20260929100200_pembantu_akses.sql), dinilai untuk
-- anggota SESI JWT (penilai(); app.actor_id diabaikan bila ada JWT): space/folder/list/status → space terlihat;
-- tugas & anaknya → tidak termasuk tugas_tertutup(). Pembantu tanpa kolom dibungkus (select …) → initplan.
create policy baca_member on public.spaces for select to authenticated
  using ((select public.is_member())
         and ((select public.lihat_semua()) or public.space_terlihat(id)));
create policy baca_member on public.space_anggota for select to authenticated
  using ((select public.is_member())
         and ((select public.lihat_semua()) or public.space_terlihat(space_id)));
create policy baca_member on public.folders for select to authenticated
  using ((select public.is_member())
         and ((select public.lihat_semua()) or public.space_terlihat(space_id)));
create policy baca_member on public.lists for select to authenticated
  using ((select public.is_member())
         and ((select public.lihat_semua()) or public.space_terlihat(space_id)));
create policy baca_member on public.list_statuses for select to authenticated
  using ((select public.is_member())
         and not coalesce(list_id = any ((select public.list_tertutup())::text[]), false));
create policy baca_member on public.tasks for select to authenticated
  using ((select public.is_member())
         and not coalesce(id = any ((select public.tugas_tertutup())::text[]), false));
create policy baca_member on public.task_assignees for select to authenticated
  using ((select public.is_member())
         and not coalesce(task_id = any ((select public.tugas_tertutup())::text[]), false));
create policy baca_member on public.comments for select to authenticated
  using ((select public.is_member())
         and not coalesce(task_id = any ((select public.tugas_tertutup())::text[]), false));
create policy baca_member on public.attachments for select to authenticated
  using ((select public.is_member())
         and not coalesce(task_id = any ((select public.tugas_tertutup())::text[]), false));
create policy baca_member on public.activity for select to authenticated
  using ((select public.is_member())
         and not coalesce(task_id = any ((select public.tugas_tertutup())::text[]), false));
-- mention mengikuti komentarnya (RLS comments berlaku di subquery; tidak rekursif).
create policy baca_member on public.comment_mentions for select to authenticated
  using ((select public.is_member()) and exists (select 1 from public.comments c where c.id = comment_id));

create policy baca_sendiri on public.notifications for select to authenticated
  using ((select public.is_member()) and member_id = (select public.member_saya()));

create policy baca_owner on public.api_tokens for select to authenticated using ((select public.is_owner()));
create policy baca_owner on public.sync_raw   for select to authenticated using ((select public.is_owner()));
-- public.idem: RLS ON tanpa policy & tanpa grant → hanya fungsi SECURITY DEFINER.

-- ---------------------------------------------------------------- grant tabel & sequence
revoke all on all tables    in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;

grant select on
  public.workspace, public.members, public.spaces, public.space_anggota, public.folders, public.lists, public.list_statuses,
  public.tasks, public.task_assignees, public.comments, public.comment_mentions, public.attachments,
  public.activity, public.notifications, public.hari_libur, public.app_settings, public.sync_runs,
  public.sync_raw
to authenticated;

-- api_tokens: token_hash TIDAK pernah terbaca authenticated (grant per kolom).
grant select (id, member_id, nama, prefix, scope, created_at, created_by, last_used_at, revoked_at)
  on public.api_tokens to authenticated;

grant select on all tables in schema public to service_role;

-- ---------------------------------------------------------------- grant fungsi
-- Cabut semua dulu (termasuk PUBLIC), lalu buka hanya pembantu yang aman & dibutuhkan RLS/Storage.
revoke all on all functions in schema public from public, anon, authenticated, service_role;

grant execute on function
  public.id_baru(text, integer),
  public.wib_date(timestamptz),
  public.hari_ini_wib(),
  public.iso_utc(timestamptz),
  public.sumber_aktif(),
  public.member_saya(),
  public.aktor(),
  public.is_member(),
  public.is_owner(),
  public.mode_app(),
  public.hari_kerja(date, date),
  public.beban(bigint, date),
  public.status_list_valid(text),
  public.lampiran_task_dari_path(text),
  public.boleh_unggah_lampiran(text),
  public.lihat_semua(),                 -- (review R2) dipakai policy RLS & Storage; tanpa parameter anggota
  public.space_terlihat(text),
  public.list_tertutup(),
  public.tugas_tertutup()
to authenticated, service_role;

-- Fungsi internal (lempar, catat_activity, snapshot_tutup, trigger, boleh_ubah_clickup, tolak_cermin, …)
-- tetap tanpa EXECUTE untuk role API; dipanggil fungsi milik postgres (SECURITY DEFINER) & trigger.
