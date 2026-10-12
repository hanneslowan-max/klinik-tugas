-- Modul Pipeline — set rencana follow-up (lead.fu_berikutnya) secara massal. ADITIF.
-- Dipakai routine "Arahan Pipeline" (Claude, lewat token API scope 'tulis') untuk MENANDAI lead yang harus
-- di-follow-up rep hari ini → muncul di tab "Follow up hari ini". Juga bisa dipakai rep/admin dari web nanti.
-- Nilai bertahan sampai rep mencatat follow-up (trigger pipeline_aktivitas_sesudah menimpa dgn rencana terbarunya).
-- Pola inti_/x_ sama seperti fungsi Pipeline lain (penilai()/aktor()), hak fail-closed.

create or replace function public.inti_pipeline_fu_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_lead public.lead; v_tgl date; v_n int := 0;
begin
  if public.pipeline_peran_aktor() not in ('admin', 'rep') then
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if jsonb_typeof(p->'items') is distinct from 'array' then
    perform public.lempar('PT400', 'items wajib berupa array {lead_id, tanggal?}', 'INPUT_001');
  end if;
  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_lead := public.pipeline_lead_wajib(v_item->>'lead_id');   -- 404 bila lead tak ada
    perform public.pipeline_boleh_ubah(v_lead.pemilik);          -- admin/bot: semua; rep: lead sendiri
    v_tgl := coalesce(nullif(v_item->>'tanggal', '')::date, public.hari_ini_wib());
    update public.lead set fu_berikutnya = v_tgl where id = v_lead.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('diset', v_n);
end; $$;

-- Bungkus API (routine/agent via token service_role, scope 'tulis'). Tanpa web_ (rep mengatur FU lewat Catat FU).
create or replace function public.x_pipeline_fu_set(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); return public.inti_pipeline_fu_set(coalesce(p, '{}'::jsonb)); end; $$;

revoke all on function public.inti_pipeline_fu_set(jsonb), public.x_pipeline_fu_set(bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.x_pipeline_fu_set(bigint, jsonb) to service_role;
