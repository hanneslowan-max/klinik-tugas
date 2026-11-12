-- Modul Pipeline — Dasbor Pipeline TAHAP 1 (brief Hannes 29 Okt 2026, ACC; mockup "Dashboard Pipeline Anvil"): bagian
-- 1 Skor bulan ini · 2 Kesehatan follow-up per sales · 3 Corong per bulan lead masuk · 4 Fokus Pallet Mesh, dan tampilan
-- sales "milik saya". Bagian 5–10 (sumber/CPA, bayar, batal, kualitas data, produk, tren) = Tahap 2.
--
-- AKSES (ditegakkan DI SINI, bukan hanya di UI):
--   * boleh_ringkas (admin + baca, sama dengan layar Ringkasan) → dasbor penuh semua sales.
--   * rep → "milik saya": SEMUA angka hanya lead/order miliknya (pemilik = penilai()). Satu-satunya angka tim yang
--     dikirim = omzet tim bulan itu (progres target tim). Tidak ada baris/angka sales lain, corong, win rate tim.
--   * tanpa akses Pipeline → 403.
--
-- DEFINISI (tanggal = WIB; hari kerja = Senin–Sabtu, tanpa hari libur; sama dengan mockup):
--   * Omzet = nilai_transaksi lead tahap ORDER menurut tanggal_sp. Lead terbuka = BARU/PENAWARAN.
--     Lead PM = punya item produk 'Pallet Mesh' (qty PM = jumlah qty item Pallet Mesh lead itu).
--   * Basis kesehatan = lead terbuka dengan tanggal_masuk dalam 90 hari terakhir (hari ini termasuk: > hari ini − 90).
--   * Disentuh ≤1 hari kerja: lead masuk di bulan itu dengan umur ≥1 hari kerja (ada ≥1 hari kerja sesudah tanggal
--     masuk s/d hari ini) yang punya aktivitas selain 'Catatan impor' ATAU perubahan tahap (riwayat dengan dari ≠ null)
--     paling lambat hari kerja pertama sesudah tanggal masuk.
--   * BARU tanpa catatan: tahap BARU, tanpa aktivitas selain 'Catatan impor', umur > 1 hari kerja.
--   * Diam = hari sejak diam_sejak (sama dengan diam_hari di daftar lead).
--   * Win rate PM = order ÷ lead PM yang masuk ≥ 90 hari lalu (metode layar Ringkasan).
--   * Waktu siklus = median hari dari riwayat tahap (transisi, dari ≠ null), lead basis 90 hari; sampel < 10 →
--     web menampilkan "belum bisa dihitung" (tanpa proksi).
--
-- Angka di bagian 2 bisa diklik → web_pipeline_dasbor_ids (metrik + pemilik) memberi id lead yang dihitung, dengan
-- predikat yang SAMA (pipeline_dasbor_lead) — daftar lead dan angka tidak bisa berbeda.
--
-- ADITIF: fungsi baru saja; tidak mengubah tabel/fungsi lama. Konvensi: SECURITY DEFINER + search_path kosong,
-- grant fail-closed (pembantu internal; web_ → authenticated).

-- ============================================================ hari kerja (Senin–Sabtu)
-- Jumlah hari kerja d dengan p_dari < d ≤ p_sampai (0 bila p_sampai ≤ p_dari). Rumus tertutup (tanpa generate_series).
create or replace function public.pipeline_hk_antara(p_dari date, p_sampai date)
returns integer language sql immutable parallel safe set search_path = '' as $$
  select case when p_sampai is null or p_dari is null or p_sampai <= p_dari then 0
    else (p_sampai - p_dari)
         - case when (p_sampai - p_dari) >= 7 - (extract(isodow from p_dari)::int % 7)
                then ((p_sampai - p_dari) - (7 - (extract(isodow from p_dari)::int % 7))) / 7 + 1
                else 0 end
  end
$$;

-- Hari kerja pertama sesudah p (Sabtu → Senin).
create or replace function public.pipeline_hk_berikut(p date)
returns date language sql immutable parallel safe set search_path = '' as $$
  select p + case when extract(isodow from p + 1) = 7 then 2 else 1 end
$$;

-- ============================================================ bendera per lead (satu sumber untuk angka & daftar)
-- p_hari = hari ini (WIB); [p_awal, p_akhir] = bulan dipilih (untuk "disentuh ≤1 hari kerja").
create or replace function public.pipeline_dasbor_lead(p_hari date, p_awal date, p_akhir date)
returns table (
  id text, pemilik bigint, tahap text, tanggal_masuk date, fu_berikutnya date, diam integer, terbuka boolean,
  basis90 boolean, sentuh_basis boolean, sentuh_cepat boolean, baru_tanpa_catatan boolean, pm boolean, pm_qty numeric,
  nilai_penawaran bigint)
language sql stable security definer set search_path = '' as $$
  select l.id, l.pemilik, l.tahap, l.tanggal_masuk, l.fu_berikutnya,
    greatest(0, p_hari - l.diam_sejak::date)::int,                                  -- = j_pipeline_lead.diam_hari
    l.tahap in ('BARU', 'PENAWARAN'),
    l.tahap in ('BARU', 'PENAWARAN') and l.tanggal_masuk > p_hari - 90,
    l.tanggal_masuk between p_awal and p_akhir and public.pipeline_hk_antara(l.tanggal_masuk, p_hari) >= 1,
    l.tanggal_masuk between p_awal and p_akhir and public.pipeline_hk_antara(l.tanggal_masuk, p_hari) >= 1
      and least(ak.pertama, rt.pertama) <= public.pipeline_hk_berikut(l.tanggal_masuk),
    l.tahap = 'BARU' and ak.pertama is null and public.pipeline_hk_antara(l.tanggal_masuk, p_hari) > 1,
    pm.ada, pm.qty, l.nilai_penawaran
  from public.lead l
  left join lateral (select min(public.wib_date(a.waktu)) pertama from public.lead_aktivitas a
                      where a.lead_id = l.id and a.jenis <> 'Catatan impor') ak on true
  left join lateral (select min(public.wib_date(r.waktu)) pertama from public.lead_riwayat_tahap r
                      where r.lead_id = l.id and r.dari is not null) rt on true
  left join lateral (select count(*) > 0 ada, coalesce(sum(i.qty), 0) qty from public.lead_item i
                      where i.lead_id = l.id and i.produk = 'Pallet Mesh') pm on true
$$;

-- Bulan dari parameter ('YYYY-MM', default bulan berjalan WIB); bulan setelah bulan berjalan ditolak.
create or replace function public.pipeline_dasbor_bulan(p jsonb)
returns date language plpgsql stable security definer set search_path = '' as $$
declare
  v_hari date := public.hari_ini_wib();
  v_teks text := nullif(btrim(coalesce(p ->> 'bulan', '')), '');
  v_awal date;
begin
  if v_teks is null then return date_trunc('month', v_hari)::date; end if;
  if v_teks !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    perform public.lempar('PT400', 'bulan harus berformat YYYY-MM', 'INPUT_001');
  end if;
  v_awal := (v_teks || '-01')::date;
  if v_awal > date_trunc('month', v_hari)::date then
    perform public.lempar('PT400', 'Bulan belum berjalan', 'INPUT_001');
  end if;
  return v_awal;
end; $$;

-- ============================================================ dasbor
-- Satu pernyataan (CTE d = bendera lead dalam cakupan peran). Bagian khusus penuh dibungkus CASE → tidak dihitung
-- sama sekali untuk sales, lalu kuncinya dibuang dari hasil.
create or replace function public.inti_pipeline_dasbor(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran   text := public.pipeline_peran_aktor();
  v_penuh   boolean;
  v_saya    bigint;
  v_hari    date := public.hari_ini_wib();
  v_awal    date;
  v_akhir   date;
  v_batas   date;      -- hari terakhir bulan yang sudah berjalan (pembanding "hari yang sama")
  v_awal_l  date;      -- bulan lalu
  v_batas_l date;
  v_awal_c  date;      -- awal corong (4 bulan)
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  v_penuh := v_peran in ('admin', 'baca');
  v_saya := case when v_penuh then null else public.penilai() end;
  v_awal := public.pipeline_dasbor_bulan(p);
  v_akhir := (v_awal + interval '1 month')::date - 1;
  v_batas := least(v_hari, v_akhir);
  v_awal_l := (v_awal - interval '1 month')::date;
  -- bulan berjalan: tgl 1 s/d tanggal yang sama bulan lalu; bulan yang sudah selesai: bulan lalu penuh
  v_batas_l := case when v_batas = v_akhir then v_awal - 1 else least(v_awal_l + (v_batas - v_awal), v_awal - 1) end;
  v_awal_c := (v_awal - interval '3 month')::date;

  return (
    with d as materialized (
      select x.* from public.pipeline_dasbor_lead(v_hari, v_awal, v_akhir) x where v_penuh or x.pemilik = v_saya),
    o as materialized (      -- order dalam cakupan peran
      select l.id, l.pemilik, l.nilai_transaksi, l.tanggal_sp,
             exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh') pm
        from public.lead l where l.tahap = 'ORDER' and (v_penuh or l.pemilik = v_saya)),
    hasil as (select jsonb_build_object(
    'peran', case when v_penuh then 'penuh' else 'sales' end,
    'saya', v_saya,
    'hari_ini', v_hari,
    'bulan', to_char(v_awal, 'YYYY-MM'),
    'batas', v_batas,
    'batas_lalu', v_batas_l,
    -- ---------------------------------------------------------------- 1 · skor bulan ini (cakupan peran)
    'skor', (
      select jsonb_build_object(
        'omzet', coalesce(sum(o.nilai_transaksi) filter (where o.tanggal_sp between v_awal and v_akhir), 0),
        'order', count(*) filter (where o.tanggal_sp between v_awal and v_akhir),
        'omzet_pm', coalesce(sum(o.nilai_transaksi) filter (where o.tanggal_sp between v_awal and v_akhir and o.pm), 0),
        'order_pm', count(*) filter (where o.tanggal_sp between v_awal and v_akhir and o.pm),
        'omzet_lalu', coalesce(sum(o.nilai_transaksi) filter (where o.tanggal_sp between v_awal_l and v_batas_l), 0),
        'order_lalu', count(*) filter (where o.tanggal_sp between v_awal_l and v_batas_l),
        'lead_masuk', (select count(*) from public.lead x where x.tanggal_masuk between v_awal and v_akhir
                         and (v_penuh or x.pemilik = v_saya)),
        'lead_masuk_lalu', (select count(*) from public.lead x where x.tanggal_masuk between v_awal_l and v_batas_l
                              and (v_penuh or x.pemilik = v_saya)),
        'sentuh_cepat', (select count(*) from d where d.sentuh_cepat),
        'sentuh_basis', (select count(*) from d where d.sentuh_basis))
      from o),
    -- satu-satunya angka tim untuk sales: omzet tim bulan itu (progres target tim)
    'omzet_tim', (select coalesce(sum(l.nilai_transaksi), 0) from public.lead l
                   where l.tahap = 'ORDER' and l.tanggal_sp between v_awal and v_akhir),
    -- ---------------------------------------------------------------- 2 · kesehatan follow-up (per pemilik)
    'kesehatan', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'pemilik', k.pemilik, 'nama', m.username,
          'terbuka90', k.terbuka90, 'sentuh_cepat', k.sentuh_cepat, 'sentuh_basis', k.sentuh_basis,
          'fu_hari_ini', k.fu_hari_ini, 'fu_telat', k.fu_telat, 'tanpa_jadwal', k.tanpa_jadwal,
          'baru_tanpa_catatan', k.baru_tanpa_catatan,
          'diam_0_7', k.d0, 'diam_8_14', k.d8, 'diam_15_30', k.d15, 'diam_31', k.d31, 'lama', k.lama,
          'fu_tercatat', case when k.pemilik is null then null else
            (select count(*) from public.lead_aktivitas a
              where a.oleh = k.pemilik and a.jenis <> 'Catatan impor' and public.wib_date(a.waktu) between v_awal and v_akhir) end)
        order by k.pemilik is null, m.username), '[]'::jsonb)
      from (
        select g.pemilik,
          count(*) filter (where g.basis90) terbuka90,
          count(*) filter (where g.sentuh_cepat) sentuh_cepat,
          count(*) filter (where g.sentuh_basis) sentuh_basis,
          count(*) filter (where g.basis90 and g.fu_berikutnya = v_hari) fu_hari_ini,
          count(*) filter (where g.basis90 and g.fu_berikutnya < v_hari) fu_telat,
          count(*) filter (where g.basis90 and g.fu_berikutnya is null) tanpa_jadwal,
          count(*) filter (where g.basis90 and g.baru_tanpa_catatan) baru_tanpa_catatan,
          count(*) filter (where g.basis90 and g.diam <= 7) d0,
          count(*) filter (where g.basis90 and g.diam between 8 and 14) d8,
          count(*) filter (where g.basis90 and g.diam between 15 and 30) d15,
          count(*) filter (where g.basis90 and g.diam > 30) d31,
          count(*) filter (where g.terbuka and not g.basis90) lama
        from (select d.pemilik, d.basis90, d.sentuh_cepat, d.sentuh_basis, d.fu_berikutnya, d.baru_tanpa_catatan,
                     d.diam, d.terbuka from d
              -- sales: barisnya sendiri tetap ada walau belum punya lead (angka 0)
              union all
              select v_saya, false, false, false, null::date, false, 0, false where not v_penuh) g
        group by g.pemilik
        having not v_penuh or count(*) filter (where g.terbuka or g.sentuh_basis) > 0) k
      left join public.members m on m.id = k.pemilik),
    -- ---------------------------------------------------------------- 4 · Pallet Mesh (cakupan peran)
    'pm', (
      select jsonb_build_object(
        'terbuka', count(*), 'qty', coalesce(sum(d.pm_qty), 0),
        'diam30', count(*) filter (where d.diam > 30),
        'terbuka_bernilai', count(*) filter (where d.nilai_penawaran is not null),
        'nilai', coalesce(sum(d.nilai_penawaran), 0),
        'terbesar', (select jsonb_build_object('id', x.id, 'kode', l.kode, 'qty', x.pm_qty)
                       from d x join public.lead l on l.id = x.id
                      where x.terbuka and x.pm order by x.pm_qty desc, x.diam desc, x.id limit 1))
      from d where d.terbuka and d.pm),
    -- ---------------------------------------------------------------- khusus penuh
    'per_sales', case when v_penuh then (
        select coalesce(jsonb_agg(jsonb_build_object('pemilik', s.pemilik, 'nama', m.username, 'omzet', s.omzet, 'order', s.n)
                                  order by s.omzet desc, m.username), '[]'::jsonb)
        from (select o.pemilik, coalesce(sum(o.nilai_transaksi), 0) omzet, count(*) n
                from o where o.tanggal_sp between v_awal and v_akhir group by o.pemilik
              union all   -- rep aktif tanpa order bulan itu tetap tampil (0)
              select pa.member_id, 0, 0 from public.pipeline_akses pa join public.members m2 on m2.id = pa.member_id
               where pa.peran = 'rep' and m2.aktif
                 and not exists (select 1 from o where o.pemilik = pa.member_id and o.tanggal_sp between v_awal and v_akhir)) s
        left join public.members m on m.id = s.pemilik) end,
    'win_pm', case when v_penuh then (
        select jsonb_build_object('order', count(*) filter (where d.tahap = 'ORDER'), 'lead', count(*))
        from d where d.pm and d.tanggal_masuk <= v_hari - 90) end,
    -- 3 · corong 4 bulan menurut bulan lead masuk, tahap SEKARANG
    'corong', case when v_penuh then (
        select coalesce(jsonb_agg(jsonb_build_object('bulan', to_char(b.awal, 'YYYY-MM'), 'total', c.total,
                 'ORDER', c.ord, 'PENAWARAN', c.tawar, 'BARU', c.baru, 'DIALIHKAN', c.alih, 'BATAL', c.batal)
                 order by b.awal), '[]'::jsonb)
        from generate_series(v_awal_c, v_awal, interval '1 month') b(awal)
        cross join lateral (
          select count(*) total, count(*) filter (where l.tahap = 'ORDER') ord, count(*) filter (where l.tahap = 'PENAWARAN') tawar,
                 count(*) filter (where l.tahap = 'BARU') baru, count(*) filter (where l.tahap = 'DIALIHKAN') alih,
                 count(*) filter (where l.tahap = 'BATAL') batal
            from public.lead l
           where l.tanggal_masuk >= b.awal::date and l.tanggal_masuk < (b.awal + interval '1 month')::date) c) end,
    'siklus', case when v_penuh then (
        with tr as (
          select r.lead_id, r.ke, public.wib_date(r.waktu) tgl, l.tanggal_masuk
            from public.lead_riwayat_tahap r join public.lead l on l.id = r.lead_id
           where r.dari is not null and l.tanggal_masuk > v_hari - 90),
        tawar as (select tr.lead_id, min(tr.tgl) tgl, min(tr.tanggal_masuk) masuk from tr where tr.ke = 'PENAWARAN' group by tr.lead_id),
        tawar_order as (
          select t.lead_id, min(x.tgl) - t.tgl hari
            from tawar t join tr x on x.lead_id = t.lead_id and x.ke = 'ORDER' and x.tgl >= t.tgl
           group by t.lead_id, t.tgl)
        select jsonb_build_object(
          'sejak', v_hari - 89,
          'lead_penawaran', (select jsonb_build_object('n', count(*),
              'median', percentile_cont(0.5) within group (order by (tawar.tgl - tawar.masuk))) from tawar),
          'penawaran_order', (select jsonb_build_object('n', count(*),
              'median', percentile_cont(0.5) within group (order by tawar_order.hari)) from tawar_order))) end,
    -- 4 · PM per sales, 10 teratas, win per qty, kualitas data
    'pm_sales', case when v_penuh then (
        select coalesce(jsonb_agg(jsonb_build_object('pemilik', x.pemilik, 'nama', m.username, 'terbuka', x.n, 'qty', x.qty,
                 'diam30', x.d30, 'bernilai', x.bernilai, 'nilai', x.nilai) order by x.pemilik is null, m.username), '[]'::jsonb)
        from (select d.pemilik, count(*) n, coalesce(sum(d.pm_qty), 0) qty, count(*) filter (where d.diam > 30) d30,
                     count(*) filter (where d.nilai_penawaran is not null) bernilai, coalesce(sum(d.nilai_penawaran), 0) nilai
                from d where d.terbuka and d.pm group by d.pemilik) x
        left join public.members m on m.id = x.pemilik) end,
    'pm_teratas', case when v_penuh then (
        select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kode', l.kode, 'pelanggan', pg.nama, 'qty', t.pm_qty,
                 'tahap', t.tahap, 'sales', m.username, 'diam', t.diam, 'fu_berikutnya', t.fu_berikutnya)
                 order by t.pm_qty desc, t.diam desc, t.id), '[]'::jsonb)
        from (select d.* from d where d.terbuka and d.pm and d.diam <= 120
               order by d.pm_qty desc, d.diam desc, d.id limit 10) t
        join public.lead l on l.id = t.id
        join public.pelanggan pg on pg.id = l.pelanggan_id
        left join public.members m on m.id = t.pemilik) end,
    'pm_win_qty', case when v_penuh then (
        select jsonb_build_object(
          'kecil', jsonb_build_object('order', count(*) filter (where d.pm_qty < 20 and d.tahap = 'ORDER'),
                                      'lead', count(*) filter (where d.pm_qty < 20)),
          'besar', jsonb_build_object('order', count(*) filter (where d.pm_qty >= 20 and d.tahap = 'ORDER'),
                                      'lead', count(*) filter (where d.pm_qty >= 20)))
        from d where d.pm and d.tanggal_masuk <= v_hari - 90) end,
    -- kualitas data PM: lead PM (semua umur) yang qty-nya > 1 (bukan bawaan impor = 1)
    'pm_qty_terisi', case when v_penuh then (
        select jsonb_build_object('lebih_1', count(*) filter (where d.pm_qty > 1), 'lead', count(*)) from d where d.pm) end,
    -- ---------------------------------------------------------------- khusus sales
    -- tabel "Follow up hari ini" (basis 90 hari): PM dulu, lalu paling lama diam
    'fu_hari_ini', case when not v_penuh then (
        select coalesce(jsonb_agg(b.j order by b.n), '[]'::jsonb)
        from public.j_pipeline_lead_ringkas_banyak(coalesce((
          select array_agg(d.id order by d.pm desc, d.diam desc, d.id) from d
           where d.basis90 and d.fu_berikutnya = v_hari), '{}'::text[])) b) end
    ) j)
    select case when v_penuh then hasil.j - 'fu_hari_ini'
                else hasil.j - array['per_sales', 'win_pm', 'corong', 'siklus', 'pm_sales', 'pm_teratas', 'pm_win_qty', 'pm_qty_terisi']
           end
      from hasil);
end; $$;

-- ============================================================ id lead di balik angka (klik dari dasbor)
-- p = {metrik, pemilik?: id | 'tanpa', bulan?}. Rep: cakupan selalu lead miliknya (pemilik dari p diabaikan).
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
  v_ids    text[];
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  if v_metrik not in ('terbuka90', 'lama', 'sentuh_basis', 'sentuh_cepat', 'fu_hari_ini', 'fu_telat', 'tanpa_jadwal',
                      'baru_tanpa_catatan', 'diam_0_7', 'diam_8_14', 'diam_15_30', 'diam_31', 'pm_terbuka') then
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

  select coalesce(array_agg(d.id order by d.diam desc, d.id), '{}') into v_ids
    from public.pipeline_dasbor_lead(v_hari, v_awal, (v_awal + interval '1 month')::date - 1) d
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
  return jsonb_build_object('metrik', v_metrik, 'total', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end; $$;

-- ============================================================ bungkus web_ (JWT)
create or replace function public.web_pipeline_dasbor(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_dasbor(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.web_pipeline_dasbor_ids(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_dasbor_ids(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ hak: pembantu & inti internal; web_ → authenticated
revoke all on function
  public.pipeline_hk_antara(date, date), public.pipeline_hk_berikut(date),
  public.pipeline_dasbor_lead(date, date, date), public.pipeline_dasbor_bulan(jsonb),
  public.inti_pipeline_dasbor(jsonb), public.inti_pipeline_dasbor_ids(jsonb),
  public.web_pipeline_dasbor(jsonb), public.web_pipeline_dasbor_ids(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_dasbor(jsonb), public.web_pipeline_dasbor_ids(jsonb) to authenticated;
