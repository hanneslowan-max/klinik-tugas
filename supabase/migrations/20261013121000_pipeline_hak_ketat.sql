-- Modul Pipeline — rapikan hak (temuan tes DB 01/09/16, merah sejak PR #8). Migrasi Pipeline 20261011120000..20261012120000
-- hanya MENAMBAH grant tanpa mencabut hak bawaan Supabase, padahal hak default A1 (20260929100000) hanya dicabut untuk
-- anon/authenticated — service_role tetap otomatis dapat SEMUA hak ke tabel/sequence/fungsi baru. Akibatnya:
--   * service_role bisa INSERT/UPDATE/DELETE/TRUNCATE langsung 7 tabel Pipeline dan memakai 4 sequence-nya
--     (kontrak ARSITEKTUR §4: tulis HANYA lewat fungsi SECURITY DEFINER);
--   * 11 fungsi web_pipeline_* bisa dipanggil service_role (kontrak: web_* hanya authenticated);
--   * pembantu pipeline_wr & pipeline_akses_saya bisa dipanggil authenticated/service_role, padahal hanya dipakai di
--     dalam fungsi SECURITY DEFINER milik postgres (inti_pipeline_ringkas, boleh_pipeline*).
-- Di sini dibuat fail-closed. Tidak ada pemanggil yang bergantung pada hak yang dicabut: Edge Function memanggil x_pipeline_*
-- (tetap service_role), web memanggil web_pipeline_* (tetap authenticated), impor alat/impor-pipeline.mjs berjalan sebagai
-- postgres lewat Management API. Idempoten (aman diulang). Tabel & fungsi kategori (20261013120000) sudah fail-closed.

-- ============================================================ tabel & sequence: SELECT saja, tulis lewat fungsi
revoke all on
  public.pipeline_akses, public.pelanggan, public.kontak, public.lead,
  public.lead_item, public.lead_aktivitas, public.lead_riwayat_tahap
from public, anon, authenticated, service_role;

grant select on
  public.pipeline_akses, public.pelanggan, public.kontak, public.lead,
  public.lead_item, public.lead_aktivitas, public.lead_riwayat_tahap
to authenticated, service_role;

-- sequence kode lead & identity: hanya dipakai INSERT di fungsi milik postgres (pola A1: semua sequence tertutup)
revoke all on sequence
  public.lead_kode_seq, public.lead_item_id_seq, public.lead_aktivitas_id_seq, public.lead_riwayat_tahap_id_seq
from public, anon, authenticated, service_role;

-- ============================================================ fungsi publik: web_pipeline_* → authenticated, x_pipeline_* → service_role
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'web\_pipeline\_%' or p.proname like 'x\_pipeline\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    if f.proname like 'web\_%' then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end;
$$;

-- ============================================================ pembantu
-- internal: dipanggil hanya dari fungsi SECURITY DEFINER milik postgres
revoke all on function public.pipeline_wr(bigint, bigint), public.pipeline_akses_saya()
from public, anon, authenticated, service_role;

-- dipakai policy RLS (baca_pipeline, baca_sendiri) → authenticated harus bisa EXECUTE. service_role tidak perlu
-- (BYPASSRLS, tidak mengevaluasi policy).
revoke all on function public.boleh_pipeline(), public.boleh_pipeline_penuh()
from public, anon, authenticated, service_role;
grant execute on function public.boleh_pipeline(), public.boleh_pipeline_penuh() to authenticated;
