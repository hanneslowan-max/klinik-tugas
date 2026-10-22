-- Pipeline: pilihan Sumber lead baru "Instagram/TikTok organik" (permintaan Hannes 21 Okt 2026).
-- Untuk chat yang datang dari akun ORGANIK Instagram/TikTok Bu Lastri (link bio WA, sapaan "Halo Bu Lastri"). BUKAN iklan
-- berbayar: iklan Instagram/Facebook tetap "Meta Ads". Sebelumnya chat seperti ini terpaksa masuk "Lainnya"/"WA langsung".
--
-- Isi: hanya CHECK kolom lead.sumber diganti SUPERSET (8 nilai lama + 'Instagram/TikTok organik'). Semua baris lama tetap
-- sah. Tanpa UPDATE/DELETE data, tanpa perubahan fungsi: jalur tulis (web_pipeline_lead_buat/_lead_ubah, alat impor)
-- menyerahkan validasi sumber ke CHECK ini; ringkasan per_sumber (ringkas_v2) mengelompokkan per nilai apa adanya.
-- Daftar yang sama (urutan tampil) ada di web/src/features/pipeline/konstanta.ts (SUMBER), web/src/types/domain.ts
-- (SumberLead) dan alat/impor-pipeline.mjs (SUMBER_SAH) — ubah keempatnya bersama.
--
-- Nama constraint: CHECK ditulis inline di 20261011120000_pipeline_tabel (tanpa nama) → Postgres menamainya
-- lead_sumber_check. Supaya aman bila namanya berbeda di salah satu DB, yang dibuang = SEMUA CHECK yang hanya menyangkut
-- kolom `sumber` (conkey = {sumber}); CHECK kolom lain (mis. sumber_bukti*) tidak tersentuh. Idempoten: dijalankan ulang
-- → constraint yang sama dibuat lagi.

do $$
declare
  v_nama text;
begin
  for v_nama in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'sumber' and not a.attisdropped
     where c.conrelid = 'public.lead'::regclass and c.contype = 'c' and c.conkey = array[a.attnum]
  loop
    execute format('alter table public.lead drop constraint %I', v_nama);
  end loop;
end $$;

alter table public.lead
  add constraint lead_sumber_check check (sumber in (
    'Google Ads', 'Meta Ads', 'Website organik', 'Instagram/TikTok organik', 'WA langsung', 'Telepon',
    'Referral', 'Repeat order', 'Lainnya'));
