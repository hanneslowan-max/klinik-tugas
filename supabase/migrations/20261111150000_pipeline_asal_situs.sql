-- Modul Pipeline — kartu "Asal lead per situs" (dasbor Pipeline bagian 5) + endpoint agent. Keputusan Hannes 11 Nov 2026
-- (pop-up B24): permintaan Yosie "source lead pallet mesh dari website Hammerindo atau Palletmesh Indonesia" harus terlihat
-- langsung di Anvil, dan routine rhj-brain membaca angka yang sama (Edge GET /x/pipeline/asal-situs, CLI pipeline asal-situs).
--
-- DEFINISI (WIB):
--   Lead   = lead dengan tanggal_masuk di [sejak, sampai] (semua tahap). Saringan produk = lead yang punya item produk itu
--            (lead tanpa item hanya ikut "Semua").
--   Order  = lead itu yang tahap ORDER sekarang; nilai = Σ nilai_transaksi lead ORDER itu (null = 0).
--   Asal   = kelompok dari lead.sumber_bukti (kode Ref di chat WA 0878, diisi agent sejak 21 Okt 2026 — BUKAN `sumber` isian sales):
--              situs_rh   web-rh, ga-rh, situs-rh     (situs rodahammerindo.com)
--              situs_oy   web-oy, ga-oy, situs-oy     (situs palletmeshindonesia.com / OYAMA)
--              meta       meta                         (iklan Meta click-to-WhatsApp)
--              lain       xs-pm, tidur, lastri, katalog-wa, dan kelas lain yang ditambahkan kelak
--              tanpa_kode tanpa-sinyal                 (chat ketemu, tanpa kode; termasuk aset WhatsApp iklan Google tanpa situs)
--              belum      null                          (belum dicocokkan agent)
--            Jalur di dua kelompok situs: organik = web-* + situs-* (tombol WA / form situs), google_ads = ga-*.
--   Rentang bawaan: sejak = pipeline_bukti_mulai() (21 Okt 2026, bukti mulai dicatat otomatis), sampai = hari ini.
--
-- AKSES (ditegakkan DI SINI, pola dasbor): admin/baca Pipeline → semua lead; rep → hanya lead miliknya; tanpa akses → 403.
-- Klik angka → web_pipeline_dasbor_ids metrik 'asal_situs' (+ kelompok, jalur, produk, sejak, sampai) dengan predikat yang
-- SAMA (pipeline_asal_lead). inti_pipeline_dasbor_ids diganti: salinan persis 20261029140000 + cabang 'asal_situs'.
-- ADITIF: fungsi baru + satu fungsi diganti (superset). Tidak ada perubahan tabel / data.

-- ============================================================ konstanta & pemetaan (internal)
create or replace function public.pipeline_bukti_mulai()
returns date language sql immutable set search_path = '' as $$
  select date '2026-10-21'
$$;

create or replace function public.pipeline_asal_kelompok(p_kelas text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kelas is null then 'belum'
    when p_kelas in ('web-rh', 'ga-rh', 'situs-rh') then 'situs_rh'
    when p_kelas in ('web-oy', 'ga-oy', 'situs-oy') then 'situs_oy'
    when p_kelas = 'meta' then 'meta'
    when p_kelas = 'tanpa-sinyal' then 'tanpa_kode'
    else 'lain'
  end
$$;

create or replace function public.pipeline_asal_jalur(p_kelas text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kelas in ('ga-rh', 'ga-oy') then 'google_ads'
    when p_kelas in ('web-rh', 'situs-rh', 'web-oy', 'situs-oy') then 'organik'
  end
$$;

-- Saringan {produk?, sejak?, sampai?} → (sejak, sampai, produk). produk kosong / "Semua" = semua produk.
create or replace function public.pipeline_asal_saring(p jsonb, out sejak date, out sampai date, out produk text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t text;
begin
  produk := nullif(btrim(coalesce(p ->> 'produk', '')), '');
  if produk = 'Semua' then produk := null; end if;
  if produk is not null and produk <> all (array['Roda', 'Pallet Mesh', 'Airport Trolley', 'Shopping Cart', 'Lemari Arsip',
                                                 'Material Handling', 'Locker', 'Lainnya']) then
    perform public.lempar('PT400', 'produk tidak dikenal', 'INPUT_001');
  end if;
  foreach v_t in array array['sejak', 'sampai'] loop
    if nullif(btrim(coalesce(p ->> v_t, '')), '') is not null and (p ->> v_t) !~ '^\d{4}-\d{2}-\d{2}$' then
      perform public.lempar('PT400', v_t || ' harus berformat YYYY-MM-DD', 'INPUT_001');
    end if;
  end loop;
  begin
    sejak := coalesce(nullif(btrim(coalesce(p ->> 'sejak', '')), '')::date, public.pipeline_bukti_mulai());
    sampai := coalesce(nullif(btrim(coalesce(p ->> 'sampai', '')), '')::date, public.hari_ini_wib());
  exception when datetime_field_overflow or invalid_datetime_format then
    perform public.lempar('PT400', 'tanggal sejak/sampai tidak sah', 'INPUT_001');
  end;
  if sejak > sampai then perform public.lempar('PT400', 'sejak tidak boleh sesudah sampai', 'INPUT_001'); end if;
  if sampai - sejak > 400 then perform public.lempar('PT400', 'rentang maksimal 400 hari', 'INPUT_001'); end if;
end; $$;

-- Lead di balik kartu (satu predikat untuk angka & daftar id).
create or replace function public.pipeline_asal_lead(p_sejak date, p_sampai date, p_produk text)
returns table (id text, pemilik bigint, kelas text, kelompok text, jalur text, tahap text, nilai bigint, tanggal_masuk date)
language sql stable security definer set search_path = '' as $$
  select l.id, l.pemilik, l.sumber_bukti, public.pipeline_asal_kelompok(l.sumber_bukti), public.pipeline_asal_jalur(l.sumber_bukti),
         l.tahap, l.nilai_transaksi, l.tanggal_masuk
    from public.lead l
   where l.tanggal_masuk between p_sejak and p_sampai
     and (p_produk is null or exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = p_produk))
$$;

-- ============================================================ angka kartu
create or replace function public.inti_pipeline_asal_situs(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_pem   bigint;
  s       record;
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  v_pem := case when v_peran in ('admin', 'baca') then null else public.penilai() end;
  s := public.pipeline_asal_saring(coalesce(p, '{}'::jsonb));
  return (
    with a as materialized (
      select * from public.pipeline_asal_lead(s.sejak, s.sampai, s.produk) x where v_pem is null or x.pemilik = v_pem),
    kel as (select * from unnest(array['situs_rh', 'situs_oy', 'meta', 'lain', 'tanpa_kode', 'belum']) with ordinality k(kelompok, urut))
    select jsonb_build_object(
      'cakupan', case when v_pem is null then 'semua' else 'saya' end,
      'produk', s.produk, 'sejak', s.sejak, 'sampai', s.sampai,
      'bukti_sejak', public.pipeline_bukti_mulai(), 'hari_ini', public.hari_ini_wib(),
      'total', (select jsonb_build_object('lead', count(*), 'order', count(*) filter (where a.tahap = 'ORDER'),
                         'nilai', coalesce(sum(a.nilai) filter (where a.tahap = 'ORDER'), 0)) from a),
      'kelompok', (
        select jsonb_agg(jsonb_build_object('kelompok', kel.kelompok, 'lead', x.n, 'order', x.o, 'nilai', x.v,
                 'kelas', (select coalesce(jsonb_agg(jsonb_build_object('kelas', y.kelas, 'lead', y.n, 'order', y.o, 'nilai', y.v)
                                                     order by y.n desc, y.kelas nulls last), '[]'::jsonb)
                             from (select a.kelas, count(*) n, count(*) filter (where a.tahap = 'ORDER') o,
                                          coalesce(sum(a.nilai) filter (where a.tahap = 'ORDER'), 0) v
                                     from a where a.kelompok = kel.kelompok group by a.kelas) y))
                 || case when kel.kelompok in ('situs_rh', 'situs_oy') then jsonb_build_object('jalur', (
                      select jsonb_agg(jsonb_build_object('jalur', j.jalur, 'lead', z.n, 'order', z.o, 'nilai', z.v) order by j.urut)
                        from unnest(array['organik', 'google_ads']) with ordinality j(jalur, urut)
                        cross join lateral (select count(*) n, count(*) filter (where a.tahap = 'ORDER') o,
                                                   coalesce(sum(a.nilai) filter (where a.tahap = 'ORDER'), 0) v
                                              from a where a.kelompok = kel.kelompok and a.jalur = j.jalur) z))
                    else '{}'::jsonb end
                 order by kel.urut)
          from kel
          cross join lateral (select count(*) n, count(*) filter (where a.tahap = 'ORDER') o,
                                     coalesce(sum(a.nilai) filter (where a.tahap = 'ORDER'), 0) v
                                from a where a.kelompok = kel.kelompok) x)
    ) from (select 1) satu);
end; $$;

-- ============================================================ id lead di balik angka (superset 20261029140000)
-- Metrik lama TIDAK berubah (salinan persis). Baru: asal_situs → p {kelompok?: situs_rh|situs_oy|meta|lain|tanpa_kode|belum|semua,
-- jalur?: organik|google_ads (hanya kelompok situs), produk?, sejak?, sampai?} — predikat = inti_pipeline_asal_situs.
create or replace function public.inti_pipeline_dasbor_ids(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran  text := public.pipeline_peran_aktor();
  v_penuh  boolean;
  v_metrik text := coalesce(p ->> 'metrik', '');
  v_tanpa  boolean := false;
  v_pem    bigint;
  v_hari   date := public.hari_ini_wib();
  v_awal   date;
  v_akhir  date;
  v_ids    text[];
  v_kel    text;
  v_jalur  text;
  s        record;
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  if v_metrik not in ('terbuka90', 'lama', 'sentuh_basis', 'sentuh_cepat', 'fu_hari_ini', 'fu_telat', 'tanpa_jadwal',
                      'baru_tanpa_catatan', 'diam_0_7', 'diam_8_14', 'diam_15_30', 'diam_31', 'pm_terbuka',
                      'bayar_belum_lunas', 'order_tanpa_bayar', 'nama_kosong', 'sumber_lainnya', 'batal_masuk',
                      'tanpa_bukti', 'dibatalkan', 'lead_dobel', 'pm_tanpa_nilai', 'asal_situs') then
    perform public.lempar('PT400', 'Metrik dasbor tidak dikenal', 'INPUT_001');
  end if;
  v_penuh := v_peran in ('admin', 'baca');
  if not v_penuh then
    v_pem := public.penilai();
  elsif p ->> 'pemilik' = 'tanpa' then
    v_tanpa := true;
  elsif coalesce(p ->> 'pemilik', '') ~ '^[0-9]+$' then
    v_pem := (p ->> 'pemilik')::bigint;
  elsif nullif(p ->> 'pemilik', '') is not null then
    perform public.lempar('PT400', 'pemilik harus id anggota atau "tanpa"', 'INPUT_001');
  end if;
  v_awal := public.pipeline_dasbor_bulan(p);
  v_akhir := (v_awal + interval '1 month')::date - 1;

  if v_metrik = 'asal_situs' then
    v_kel := coalesce(nullif(p ->> 'kelompok', ''), 'semua');
    if v_kel not in ('situs_rh', 'situs_oy', 'meta', 'lain', 'tanpa_kode', 'belum', 'semua') then
      perform public.lempar('PT400', 'kelompok asal tidak dikenal', 'INPUT_001');
    end if;
    v_jalur := nullif(p ->> 'jalur', '');
    if v_jalur is not null and (v_jalur not in ('organik', 'google_ads') or v_kel not in ('situs_rh', 'situs_oy')) then
      perform public.lempar('PT400', 'jalur hanya organik/google_ads untuk kelompok situs', 'INPUT_001');
    end if;
    s := public.pipeline_asal_saring(p);
    select coalesce(array_agg(a.id order by a.tanggal_masuk desc, a.id), '{}') into v_ids
      from public.pipeline_asal_lead(s.sejak, s.sampai, s.produk) a
     where (case when v_tanpa then a.pemilik is null when v_pem is not null then a.pemilik = v_pem else true end)
       and (v_kel = 'semua' or a.kelompok = v_kel)
       and (v_jalur is null or a.jalur = v_jalur);
  elsif v_metrik in ('terbuka90', 'lama', 'sentuh_basis', 'sentuh_cepat', 'fu_hari_ini', 'fu_telat', 'tanpa_jadwal',
                  'baru_tanpa_catatan', 'diam_0_7', 'diam_8_14', 'diam_15_30', 'diam_31', 'pm_terbuka') then
    select coalesce(array_agg(d.id order by d.diam desc, d.id), '{}') into v_ids
      from public.pipeline_dasbor_lead(v_hari, v_awal, v_akhir) d
     where (case when v_tanpa then d.pemilik is null when v_pem is not null then d.pemilik = v_pem else true end)
       and case v_metrik
         when 'terbuka90' then d.basis90
         when 'lama' then d.terbuka and not d.basis90
         when 'sentuh_basis' then d.sentuh_basis
         when 'sentuh_cepat' then d.sentuh_cepat
         when 'fu_hari_ini' then d.basis90 and d.fu_berikutnya = v_hari
         when 'fu_telat' then d.basis90 and d.fu_berikutnya < v_hari
         when 'tanpa_jadwal' then d.basis90 and d.fu_berikutnya is null
         when 'baru_tanpa_catatan' then d.basis90 and d.baru_tanpa_catatan
         when 'diam_0_7' then d.basis90 and d.diam <= 7
         when 'diam_8_14' then d.basis90 and d.diam between 8 and 14
         when 'diam_15_30' then d.basis90 and d.diam between 15 and 30
         when 'diam_31' then d.basis90 and d.diam > 30
         when 'pm_terbuka' then d.terbuka and d.pm
       end;
  elsif v_metrik = 'dibatalkan' then
    select coalesce(array_agg(b.id order by b.tanggal desc, b.id), '{}') into v_ids
      from public.pipeline_dasbor_batal(v_awal, v_akhir) b
     where not b.impor
       and (case when v_tanpa then b.pemilik is null when v_pem is not null then b.pemilik = v_pem else true end);
  else
    select coalesce(array_agg(l.id order by l.tanggal_masuk desc, l.id), '{}') into v_ids
      from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id
     where (case when v_tanpa then l.pemilik is null when v_pem is not null then l.pemilik = v_pem else true end)
       and case v_metrik
         when 'bayar_belum_lunas' then l.tahap = 'ORDER' and l.tanggal_sp > v_hari - 90 and l.bayar_status is distinct from 'LUNAS'
         when 'order_tanpa_bayar' then l.tahap = 'ORDER' and l.tanggal_sp between v_awal and v_akhir and l.bayar_status is null
         when 'nama_kosong' then l.tanggal_masuk between v_awal and v_akhir and btrim(pg.nama) = '-'
         when 'sumber_lainnya' then l.tanggal_masuk between v_awal and v_akhir and l.sumber = 'Lainnya'
         when 'batal_masuk' then l.tanggal_masuk between v_awal and v_akhir and l.tahap = 'BATAL'
         when 'tanpa_bukti' then l.tanggal_masuk between v_awal and v_akhir and coalesce(l.sumber_bukti, 'tanpa-sinyal') = 'tanpa-sinyal'
         when 'lead_dobel' then l.tahap in ('BARU', 'PENAWARAN')
           and (select count(*) from public.lead x where x.pelanggan_id = l.pelanggan_id and x.tahap in ('BARU', 'PENAWARAN')) > 1
         when 'pm_tanpa_nilai' then l.tahap in ('BARU', 'PENAWARAN') and l.nilai_penawaran is null
           and exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh')
       end;
  end if;
  return jsonb_build_object('metrik', v_metrik, 'total', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end; $$;

-- ============================================================ bungkus
create or replace function public.web_pipeline_asal_situs(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_asal_situs(coalesce(p, '{}'::jsonb)); end; $$;
-- agent (Edge GET /x/pipeline/asal-situs?produk=&sejak=&sampai=, scope baca)
create or replace function public.x_pipeline_asal_situs(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_pipeline_asal_situs(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ hak
revoke all on function
  public.pipeline_bukti_mulai(), public.pipeline_asal_kelompok(text), public.pipeline_asal_jalur(text),
  public.pipeline_asal_saring(jsonb), public.pipeline_asal_lead(date, date, text),
  public.inti_pipeline_asal_situs(jsonb), public.inti_pipeline_dasbor_ids(jsonb),
  public.web_pipeline_asal_situs(jsonb), public.x_pipeline_asal_situs(bigint, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_asal_situs(jsonb) to authenticated;
grant execute on function public.x_pipeline_asal_situs(bigint, jsonb) to service_role;
