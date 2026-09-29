-- A2 · 6/6: hak EXECUTE fungsi A2. Kontrak ARSITEKTUR.md §4:
--   api_* / x_* / impor_* (publik)  → service_role saja
--   web_* (publik)                  → authenticated saja
--   pembantu internal A2            → tidak untuk role API (dipanggil fungsi SECURITY DEFINER milik postgres)
-- Hak default Supabase memberi service_role EXECUTE ke fungsi baru; dicabut di sini untuk pembantu internal.

do $$
declare
  f record;
  v_publik_service constant text[] := array[
    'api_token_cek', 'api_user', 'api_team', 'api_spaces', 'api_space_folders', 'api_space_lists', 'api_folder_lists',
    'api_list', 'api_list_tasks', 'api_task', 'api_task_comments', 'api_comment_replies', 'api_create_task',
    'api_update_task', 'api_delete_task', 'api_create_comment', 'api_create_reply', 'api_move_task',
    'x_activity', 'x_search', 'x_resolve', 'x_tenggat', 'x_sensus', 'x_export', 'x_admin_akun',
    'impor_batch', 'impor_tandai_hilang', 'impor_run_mulai', 'impor_run_selesai'];
  v_internal constant text[] := array[
    'ms', 'ms_ke_ts', 'ts_dari', 'bool_dari', 'prioritas_dari', 'ids_dari', 'mulai_api', 'mulai_web',
    'anggota_wajib', 'wajib_owner_aktor', 'idem_ambil', 'idem_simpan', 'status_cari', 'status_petakan', 'status_id',
    'app_url', 'team_id', 'j_member', 'j_prioritas', 'j_folder_list', 'j_list', 'j_list_statuses', 'j_lampiran',
    'j_task', 'j_comment', 'komentar_parts', 'inti_buat_tugas', 'inti_assignee', 'inti_ubah_tugas', 'inti_pindah',
    'inti_hapus', 'inti_komentar', 'cari_tugas', 'riwayat_tugas', 'j_baris', 'tenggat_hitung', 'norm_impor_tugas',
    'norm_impor_komentar', 'sha256_hex', 'muat_members', 'muat_struktur', 'muat_list_statuses', 'muat_tasks',
    'muat_task_assignees', 'set_mentions_impor', 'muat_comment_mentions', 'muat_comments', 'muat_attachments',
    'muat_sync_raw', 'muat_workspace', 'j_lampiran_web', 'j_komentar_web', 'body_web', 'mulai_web',
    'struktur_penjaga', 'anggota_impor_wajib', 'set_space_anggota_impor'];     -- 2 terakhir: review R1/R2
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname = any (v_publik_service) or p.proname = any (v_internal) or p.proname like 'web\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    if f.proname = any (v_publik_service) then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif f.proname like 'web\_%' and not (f.proname = any (v_internal)) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end;
$$;
