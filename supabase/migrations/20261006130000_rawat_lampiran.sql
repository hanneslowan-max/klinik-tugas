-- Perawatan lampiran: hapus otomatis BERKAS lampiran pada kartu yang sudah SELESAI lebih dari N hari (default 7),
-- demi menghemat ruang Storage. Hanya lampiran buatan app (sumber='app') pada kartu buatan app; salinan dari ClickUp
-- dibiarkan (ClickUp tetap sumber kebenaran, lagipula akan terunduh ulang saat sinkron). Baris di-SOFT delete supaya
-- jejaknya tetap ada di riwayat (trigger lampiran_sesudah mencatat activity 'lampiran_hapus'); BERKAS fisik dihapus
-- oleh Edge (service role) lewat daftar storage_path yang dikembalikan fungsi ini — SQL tak bisa menghapus
-- storage.objects (trigger storage.protect_objects_delete), jadi pembagian kerja sama dengan web_purge.
-- Setelan di app_settings key 'rawat_lampiran' = {"aktif": bool, "hari": int}.

-- Default setelan (idempoten; tidak menimpa bila sudah ada).
insert into public.app_settings (key, value)
values ('rawat_lampiran', '{"aktif": true, "hari": 7}'::jsonb)
on conflict (key) do nothing;

-- Inti: tandai lampiran kedaluwarsa sebagai terhapus, kembalikan daftar storage_path untuk dihapus Edge.
-- p_hari null → ambil dari setelan (default 7, minimal 0). p_dry true → hanya daftar kandidat, tanpa menghapus baris.
create or replace function public.inti_rawat_lampiran(p_hari int, p_dry boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hari  int;
  v_batas timestamptz;
  v_paths text[];
begin
  v_hari := coalesce(p_hari,
    nullif(((select s.value from public.app_settings s where s.key = 'rawat_lampiran') ->> 'hari'), '')::int, 7);
  if v_hari < 0 then v_hari := 0; end if;
  v_batas := now() - make_interval(days => v_hari);

  if coalesce(p_dry, false) then
    select coalesce(array_agg(a.storage_path), '{}') into v_paths
      from public.attachments a
      join public.tasks t on t.id = a.task_id
     where a.deleted_at is null and a.sumber = 'app' and a.storage_path is not null
       and t.sumber = 'app' and t.status_type in ('done', 'closed')
       and greatest(t.done_at, t.closed_at) < v_batas;    -- null (tak ada tanda selesai) → tak lolos
  else
    with hapus as (
      update public.attachments a
         set deleted_at = now(),            -- trigger lampiran_sesudah → activity 'lampiran_hapus'
             deleted_by = public.aktor()
        from public.tasks t
       where t.id = a.task_id
         and a.deleted_at is null and a.sumber = 'app' and a.storage_path is not null
         and t.sumber = 'app' and t.status_type in ('done', 'closed')
         and greatest(t.done_at, t.closed_at) < v_batas
      returning a.storage_path
    )
    select coalesce(array_agg(storage_path), '{}') into v_paths from hapus;
  end if;

  return jsonb_build_object('hari', v_hari, 'dihapus', coalesce(array_length(v_paths, 1), 0),
                            'dry', coalesce(p_dry, false), 'storage_paths', to_jsonb(v_paths));
end;
$$;

-- API (token scope impor, owner/bot). Dipanggil Edge POST /x/rawat/lampiran dari job terjadwal. Setelan 'aktif'
-- dicek di sini supaya mematikan fitur cukup lewat app_settings tanpa mengubah jadwal.
create or replace function public.x_rawat_lampiran(p_aktor bigint, p_hari int default null, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set jsonb;
begin
  perform public.mulai_api(p_aktor, 'api', 'impor');
  if not exists (select 1 from public.members m where m.id = public.aktor() and m.role in ('owner', 'bot')) then
    perform public.lempar('PT403', 'Perawatan lampiran hanya untuk owner atau bot', 'ACCESS_001');
  end if;
  v_set := (select s.value from public.app_settings s where s.key = 'rawat_lampiran');
  if coalesce(v_set ->> 'aktif', 'true') <> 'true' then
    return jsonb_build_object('dilewati', true, 'alasan', 'rawat_lampiran nonaktif',
                              'dihapus', 0, 'storage_paths', '[]'::jsonb);
  end if;
  return public.inti_rawat_lampiran(p_hari, p_dry);
end;
$$;

-- Hak (ARSITEKTUR §4): inti = pembantu internal (tidak untuk role API); x_* = service_role saja.
revoke all on function public.inti_rawat_lampiran(int, boolean) from public, anon, authenticated, service_role;
revoke all on function public.x_rawat_lampiran(bigint, int, boolean) from public, anon, authenticated, service_role;
grant execute on function public.x_rawat_lampiran(bigint, int, boolean) to service_role;
