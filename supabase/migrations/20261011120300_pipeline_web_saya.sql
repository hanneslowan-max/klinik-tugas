-- Modul Pipeline — fungsi akses "pipeline saya" untuk web. ADITIF: web_saya tidak memuat info akses Pipeline,
-- jadi UI memanggil fungsi ringkas ini untuk gerbang menu & layar (§6). Baca sederhana → langsung mulai_web()
-- + pembantu yang sudah ada (pipeline_peran_aktor; migrasi 20261011120100). Konvensi grant ikut 20261011120100.
--
-- peran: admin (owner/bot + pipeline_akses 'admin') | rep | baca (Yosie) | null (tak punya akses → menu disembunyikan).
-- boleh_ringkas: halaman Ringkasan (§4). Admin (Hannes) + baca (Yosie, mencocokkan iklan dgn lead, §6) boleh;
-- rep fokus ke daftar leadnya sendiri.
create or replace function public.web_pipeline_saya()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_peran text;
begin
  perform public.mulai_web();
  v_peran := public.pipeline_peran_aktor();
  return jsonb_build_object(
    'peran', v_peran,
    'boleh_ringkas', coalesce(v_peran in ('admin', 'baca'), false));
end; $$;

revoke all on function public.web_pipeline_saya() from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_saya() to authenticated;
