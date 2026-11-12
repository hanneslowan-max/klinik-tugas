-- Modul Pipeline — perbaikan ringkasan §4 sesudah cek hasil Langkah 2 (rhj-brain deliverables/pipeline-anvil/
-- CEK-HASIL-LANGKAH2-12Okt.md): (1) win rate memakai kohort umur >= 90 hari seperti routine Analisa Pipeline,
-- (2) omzet per rep memakai kode SP bila pemilik kosong (data lama), (3) siklus tidak memakai tanggal SP tebakan impor.
-- Hanya mengganti inti_pipeline_ringkas; pembungkus web_/x_ dan hak tetap dari migrasi 20261011120200.

create or replace function public.inti_pipeline_ringkas(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_dasar text := case when coalesce(nullif(p->>'dasar', ''), 'sp') = 'lead' then 'lead' else 'sp' end;
  v_bulan text := nullif(p->>'bulan', '');     -- filter 'YYYY-MM' opsional
begin
  if public.pipeline_peran_aktor() is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;

  return jsonb_build_object(
    'dasar', v_dasar,
    'bulan', (
      with o as (  -- bulan "order" menurut dasar
        select l.*,
          -- pemilik efektif: pemilik lead; bila kosong, rep yang kode SP-nya ada di No SP (mis. 012/RSG/VIII/2026)
          coalesce(l.pemilik, (select pa.member_id from public.pipeline_akses pa
                               where pa.kode_sp is not null and l.no_sp is not null
                                 and upper(l.no_sp) like '%/' || upper(pa.kode_sp) || '/%'
                               order by pa.member_id limit 1)) as rep_efektif,
          to_char(l.tanggal_masuk, 'YYYY-MM') as bln_lead,
          to_char(l.tanggal_penawaran, 'YYYY-MM') as bln_tawar,
          case when l.tahap = 'ORDER' then
            to_char(case when v_dasar = 'sp' then coalesce(l.tanggal_sp, l.tanggal_masuk) else l.tanggal_masuk end, 'YYYY-MM')
          end as bln_order
        from public.lead l
      ),
      bln as (
        select b from (
          select bln_lead b from o where bln_lead is not null
          union select bln_order from o where bln_order is not null
          union select bln_tawar from o where bln_tawar is not null
        ) q where b is not null and (v_bulan is null or b = v_bulan)
        group by b
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'bulan', b.b,
        'leads', (select count(*) from o where o.bln_lead = b.b),
        'pelanggan_baru', (select count(*) from (
            select o2.pelanggan_id from o o2 group by o2.pelanggan_id
            having to_char(min(o2.tanggal_masuk), 'YYYY-MM') = b.b) z),
        'penawaran', (select count(*) from o where o.bln_tawar = b.b),
        'order', (select count(*) from o where o.bln_order = b.b),
        'batal', (select count(*) from o where o.tahap = 'BATAL' and o.bln_lead = b.b),
        'dialihkan', (select count(*) from o where o.tahap = 'DIALIHKAN' and o.bln_lead = b.b),
        'omzet_total', (select coalesce(sum(o.nilai_transaksi), 0) from o where o.bln_order = b.b),
        'per_rep', (select coalesce(jsonb_agg(jsonb_build_object(
            'pemilik', rk.pemilik, 'username', m.username, 'order', rk.n, 'omzet', rk.omzet) order by rk.omzet desc), '[]'::jsonb)
          from (select o.rep_efektif as pemilik, count(*) n, coalesce(sum(o.nilai_transaksi), 0) omzet
                from o where o.bln_order = b.b group by o.rep_efektif) rk
          left join public.members m on m.id = rk.pemilik)
      ) order by b.b desc), '[]'::jsonb)
      from bln b),
    -- Win rate metode routine Analisa Pipeline (dikunci 22 Sep): kohort = SEMUA lead umur >= 90 hari (tanggal masuk),
    -- menang = tahap ORDER, sisanya dihitung kalah/tak jadi ('batal' di bentuk WinRate = matang - order).
    -- Alasan: sales hampir tak pernah menandai Batal, jadi order/(order+batal) membengkak (52% vs 19%).
    -- Pembagian qty PM hanya memakai lead yang qty-nya benar (bukan default impor = 1).
    'win_rate', (
      with matang as (
        select l.id, l.tahap,
          exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh') as pm,
          (select coalesce(sum(i.qty), 0) from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh') as pm_qty,
          coalesce(l.periksa_sebab, '') ilike '%qty Pallet Mesh = default%' as qty_default
        from public.lead l where l.tanggal_masuk <= current_date - 90
      )
      select jsonb_build_object(
        'semua', public.pipeline_wr(count(*) filter (where tahap = 'ORDER'), count(*) filter (where tahap <> 'ORDER')),
        'pm', public.pipeline_wr(count(*) filter (where pm and tahap = 'ORDER'), count(*) filter (where pm and tahap <> 'ORDER')),
        'pm_kecil_lt20', public.pipeline_wr(
            count(*) filter (where pm and not qty_default and pm_qty < 20 and tahap = 'ORDER'),
            count(*) filter (where pm and not qty_default and pm_qty < 20 and tahap <> 'ORDER')),
        'pm_besar_ge20', public.pipeline_wr(
            count(*) filter (where pm and not qty_default and pm_qty >= 20 and tahap = 'ORDER'),
            count(*) filter (where pm and not qty_default and pm_qty >= 20 and tahap <> 'ORDER')),
        'pm_qty_belum_diisi', count(*) filter (where pm and qty_default),
        'umur_matang_hari', 90,
        'definisi', 'kohort lead umur >= 90 hari; menang = ORDER; sisanya kalah/tak jadi')
      from matang),
    'siklus_hari_rata2', (
      select round(avg(l.tanggal_sp - l.tanggal_masuk)::numeric, 1)
      from public.lead l where l.tahap = 'ORDER' and l.tanggal_sp is not null and l.tanggal_sp >= l.tanggal_masuk
        -- tanggal SP hasil impor = tanggal lead (tebakan) → bukan siklus sebenarnya, jangan ikut dirata-rata
        and coalesce(l.periksa_sebab, '') not ilike '%tanggal SP diisi dari tanggal lead%'),
    -- Breakdown KESELURUHAN (semua bulan; §4/mockup). Omzet/order memakai lead tahap ORDER apa adanya.
    'per_sumber', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sumber', s.sumber, 'leads', s.leads, 'order', s.ord, 'omzet', s.omzet) order by s.leads desc), '[]'::jsonb)
      from (
        select l.sumber, count(*) leads,
          count(*) filter (where l.tahap = 'ORDER') ord,
          coalesce(sum(l.nilai_transaksi) filter (where l.tahap = 'ORDER'), 0) omzet
        from public.lead l group by l.sumber) s),
    -- per produk: lead multi-produk terhitung di TIAP produknya (count distinct lead), jadi jumlah bisa > total lead.
    'per_produk', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'produk', pr.produk, 'leads', pr.leads, 'order', pr.ord, 'omzet', pr.omzet) order by pr.leads desc), '[]'::jsonb)
      from (
        -- dedup (produk, lead) dulu: satu lead bisa punya >1 lead_item produk sama → cegah omzet dihitung ganda.
        select d.produk, count(*) leads,
          count(*) filter (where d.tahap = 'ORDER') ord,
          coalesce(sum(d.nilai_transaksi) filter (where d.tahap = 'ORDER'), 0) omzet
        from (select distinct i.produk, l.id, l.tahap, l.nilai_transaksi
              from public.lead_item i join public.lead l on l.id = i.lead_id) d
        group by d.produk) pr),
    'per_alasan_batal', (
      select coalesce(jsonb_agg(jsonb_build_object('alasan', a.alasan, 'jumlah', a.n) order by a.n desc), '[]'::jsonb)
      from (
        select coalesce(nullif(l.alasan_batal, ''), '(tak diisi)') alasan, count(*) n
        from public.lead l where l.tahap = 'BATAL' group by coalesce(nullif(l.alasan_batal, ''), '(tak diisi)')) a)
  );
end; $$;

revoke all on function public.inti_pipeline_ringkas(jsonb) from public, anon, authenticated, service_role;
