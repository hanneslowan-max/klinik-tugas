-- Pipeline: nilai penawaran WAJIB > 0 saat "Kirim penawaran" (keputusan Hannes 14 Okt 2026, kartu rtz1tqi1vh).
-- Sumber, qty > 0 per produk, dan alasan Batal sudah wajib sejak 20261011120100; yang belum hanya nilai penawaran
-- (lead L-01986 tersimpan dengan nilai 0). Hanya inti_pipeline_tahap yang berubah (cabang 'penawaran'); hak eksekusi
-- tetap (create or replace mempertahankan grant/revoke).

create or replace function public.inti_pipeline_tahap(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_lead public.lead; v_aksi text := p->>'aksi';
  v_pemilik bigint; v_kode text; v_sp text; v_tgl_sp date; v_nilai bigint;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  perform public.pipeline_boleh_ubah(v_lead.pemilik);

  if v_aksi = 'penawaran' then
    -- Nilai penawaran WAJIB > 0 (Hannes 14 Okt, IMP-PIP-261014-1): jadwal FU memakai patokan > Rp20 jt.
    -- Penawaran ulang boleh tanpa angka baru bila lead sudah punya nilai > 0.
    v_nilai := coalesce(nullif(p->>'nilai_penawaran', '')::bigint, v_lead.nilai_penawaran);
    if v_nilai is null or v_nilai <= 0 then
      perform public.lempar('PT400', 'Nilai penawaran wajib diisi (> 0): total rupiah di penawaran', 'INPUT_001');
    end if;
    update public.lead set tahap = 'PENAWARAN', nilai_penawaran = v_nilai where id = v_lead.id;

  elsif v_aksi = 'order' then
    v_tgl_sp := coalesce(nullif(p->>'tanggal_sp', '')::date, public.hari_ini_wib());
    if v_tgl_sp > public.hari_ini_wib() then perform public.lempar('PT400', 'Tanggal SP tidak boleh di masa depan', 'INPUT_001'); end if;
    v_nilai := nullif(p->>'nilai_transaksi', '')::bigint;
    if v_nilai is null or v_nilai <= 0 then perform public.lempar('PT400', 'Nilai transaksi wajib > 0 untuk order', 'INPUT_001'); end if;
    v_pemilik := coalesce(v_lead.pemilik, public.aktor());        -- klaim bila belum ada pemilik
    select kode_sp into v_kode from public.pipeline_akses where member_id = v_pemilik;
    if nullif(p->>'no_sp', '') is not null then
      v_sp := btrim(p->>'no_sp');
    else
      if nullif(p->>'nomor', '') is null then perform public.lempar('PT400', 'Nomor SP wajib', 'INPUT_001'); end if;
      if v_kode is null then perform public.lempar('PT400', 'Pemilik lead belum punya kode SP (RSG/MCE)', 'INPUT_001'); end if;
      v_sp := regexp_replace(p->>'nomor', '[^0-9]', '', 'g') || '/' || v_kode || '/'
            || public.pipeline_romawi(extract(month from v_tgl_sp)::int) || '/' || extract(year from v_tgl_sp)::text;
    end if;
    if v_sp !~ '^\d+/(RSG|MCE)/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/20\d\d$' then
      perform public.lempar('PT400', format('No SP tidak sesuai pola: %s', v_sp), 'INPUT_001');
    end if;
    if exists (select 1 from public.lead where no_sp = v_sp and id <> v_lead.id) then
      perform public.lempar('PT409', format('No SP sudah dipakai lead lain: %s', v_sp), 'KONFLIK_001');
    end if;
    update public.lead set tahap = 'ORDER', pemilik = v_pemilik, no_sp = v_sp,
      tanggal_sp = v_tgl_sp, nilai_transaksi = v_nilai where id = v_lead.id;

  elsif v_aksi = 'batal' then
    if nullif(p->>'alasan_batal', '') is null then perform public.lempar('PT400', 'Alasan batal wajib', 'INPUT_001'); end if;
    if p->>'alasan_batal' = 'Lainnya' and nullif(p->>'alasan_batal_lain', '') is null then
      perform public.lempar('PT400', 'Alasan batal "Lainnya" wajib diisi teks', 'INPUT_001');
    end if;
    update public.lead set tahap = 'BATAL', alasan_batal = p->>'alasan_batal',
      alasan_batal_lain = nullif(p->>'alasan_batal_lain', '') where id = v_lead.id;

  elsif v_aksi = 'alihkan' then
    if nullif(p->>'dialihkan_ke', '') is null then perform public.lempar('PT400', 'Tujuan pengalihan wajib diisi', 'INPUT_001'); end if;
    update public.lead set tahap = 'DIALIHKAN', dialihkan_ke = btrim(p->>'dialihkan_ke') where id = v_lead.id;

  else
    perform public.lempar('PT400', format('Aksi tahap tidak dikenal: %s', coalesce(v_aksi, '(kosong)')), 'INPUT_001');
  end if;

  return public.j_pipeline_lead(v_lead.id, false);
end; $$;
