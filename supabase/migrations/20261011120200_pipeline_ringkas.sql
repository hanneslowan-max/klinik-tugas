-- Modul Pipeline — ringkasan §4 (pengganti tab "Ringkasan Bulanan"). Per bulan + per rep + win-rate per produk/qty +
-- siklus. Dasar tanggal omzet/order: K2 = tanggal SP (default); 'lead' = tanggal lead (untuk cocok-silang sheet, §7).
-- Metrik lead-sentris (leads masuk, pelanggan baru, penawaran, batal, dialihkan) selalu pakai tanggal lead/penawaran.

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
          from (select o.pemilik, count(*) n, coalesce(sum(o.nilai_transaksi), 0) omzet
                from o where o.bln_order = b.b group by o.pemilik) rk
          left join public.members m on m.id = rk.pemilik)
      ) order by b.b desc), '[]'::jsonb)
      from bln b),
    'win_rate', (
      with matang as (  -- lead selesai (order/batal); PM & qty PM per lead
        select l.id, l.tahap,
          exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh') as pm,
          (select coalesce(sum(i.qty), 0) from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh') as pm_qty
        from public.lead l where l.tahap in ('ORDER', 'BATAL')
      )
      select jsonb_build_object(
        'semua', public.pipeline_wr(count(*) filter (where tahap = 'ORDER'), count(*) filter (where tahap = 'BATAL')),
        'pm', public.pipeline_wr(count(*) filter (where pm and tahap = 'ORDER'), count(*) filter (where pm and tahap = 'BATAL')),
        'pm_kecil_lt20', public.pipeline_wr(
            count(*) filter (where pm and pm_qty < 20 and tahap = 'ORDER'),
            count(*) filter (where pm and pm_qty < 20 and tahap = 'BATAL')),
        'pm_besar_ge20', public.pipeline_wr(
            count(*) filter (where pm and pm_qty >= 20 and tahap = 'ORDER'),
            count(*) filter (where pm and pm_qty >= 20 and tahap = 'BATAL')))
      from matang),
    'siklus_hari_rata2', (
      select round(avg(l.tanggal_sp - l.tanggal_masuk)::numeric, 1)
      from public.lead l where l.tahap = 'ORDER' and l.tanggal_sp is not null and l.tanggal_sp >= l.tanggal_masuk)
  );
end; $$;

-- win-rate kecil: order / (order+batal)
create or replace function public.pipeline_wr(p_order bigint, p_batal bigint)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('order', p_order, 'batal', p_batal, 'matang', p_order + p_batal,
    'rate', case when p_order + p_batal > 0 then round(p_order::numeric / (p_order + p_batal), 3) else null end)
$$;

create or replace function public.web_pipeline_ringkas(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_ringkas(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_pipeline_ringkas(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_pipeline_ringkas(coalesce(p, '{}'::jsonb)); end; $$;

revoke all on function public.inti_pipeline_ringkas(jsonb), public.pipeline_wr(bigint, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.pipeline_wr(bigint, bigint) to authenticated, service_role;
grant execute on function public.web_pipeline_ringkas(jsonb) to authenticated;
grant execute on function public.x_pipeline_ringkas(bigint, jsonb) to service_role;
